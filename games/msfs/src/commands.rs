//! MSFS komutları. Hepsi `msfs_` önekiyle adlandırılır; arayüzdeki karşılıkları `games/msfs/ui/api.ts`.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use modstead_core::prelude::*;
use modstead_core::security::SecurityReport;
use serde::Serialize;
use tauri::State;

use crate::catalog::CatalogItem;
use crate::conflicts::Conflict;
use crate::exexml::ExeEntry;
use crate::install::{self, ConfirmOptions, JobMeta};
use crate::readiness::{FixOutcome, ModVerification, ReadinessFix};
use crate::scanner::ScanResult;
use crate::settings::{MsfsSettings, MsfsSettingsPatch};
use crate::sims::SimInstall;
use crate::store::{Profile, now_iso};
use crate::util::is_within;
use crate::{Msfs, linker};

type G<'a> = State<'a, Msfs>;

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpReport {
    pub ok: Vec<String>,
    pub failed: Vec<(String, String)>,
}

/// Engelleyici işi arka plan iş parçacığında çalıştırır.
async fn blocking<T: Send + 'static>(game: &Msfs, f: impl FnOnce(&Msfs) -> AppResult<T> + Send + 'static) -> AppResult<T> {
    let me = game.clone();
    tokio::task::spawn_blocking(move || f(&me)).await?
}

// ---------- Ayarlar ve simler ----------

#[tauri::command]
pub fn msfs_settings_get(game: G<'_>) -> MsfsSettings {
    game.settings()
}

#[tauri::command]
pub async fn msfs_settings_save(game: G<'_>, patch: MsfsSettingsPatch) -> AppResult<MsfsSettings> {
    blocking(&game, move |g| {
        if let Some(lib) = &patch.library_path {
            // "D:klasor" gibi sürücüye göreli yollar beklenmedik bir yere yazar.
            if !lib.is_absolute() {
                return Err(AppError::msg(tr!(r"Kütüphane yolu tam bir yol olmalı (ör. D:\MSFS Mods).", r"The library path must be a full path (e.g. D:\MSFS Mods).")));
            }
            // Kütüphane bir Community klasörünün içinde olamaz: sim her şeyi iki kez yükler.
            for s in g.sims() {
                for (_, c) in s.containers() {
                    if is_within(lib, &c) || is_within(&c, lib) {
                        return Err(AppError::msg(tr!(
                            "Kütüphane klasörü bir Community klasörüyle iç içe olamaz.",
                            "The library folder cannot be inside (or contain) a Community folder."
                        )));
                    }
                }
            }
            std::fs::create_dir_all(lib).map_err(|e| {
                AppError::msg(tr!(format!("Kütüphane klasörü oluşturulamadı: {e}"), format!("Could not create the library folder: {e}")))
            })?;
        }
        if let Some(ovs) = &patch.sim_overrides {
            for (sim, ov) in ovs {
                if !crate::sims::SIMS.contains(&sim.as_str()) {
                    return Err(AppError::msg(tr!(format!("Bilinmeyen simülatör: {sim}"), format!("Unknown simulator: {sim}"))));
                }
                if ov.packages_path.as_ref().is_some_and(|p| !p.is_absolute()) {
                    return Err(AppError::msg(tr!(format!("{sim} paket klasörü tam bir yol olmalı."), format!("The {sim} package folder must be a full path."))));
                }
            }
        }
        let s = g.update_settings(|s| {
            if let Some(v) = patch.library_path {
                s.library_path = Some(v);
            }
            if let Some(v) = patch.sim_overrides {
                s.sim_overrides = v;
            }
            if let Some(v) = patch.strip_executables {
                s.strip_executables = v;
            }
            if let Some(v) = patch.onboarded {
                s.onboarded = v;
            }
        })?;
        g.changed();
        Ok(s)
    })
    .await
}

#[tauri::command]
pub async fn msfs_sims(game: G<'_>) -> AppResult<Vec<SimInstall>> {
    blocking(&game, |g| Ok(g.sims())).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySuggestion {
    pub path: PathBuf,
    pub free: Option<u64>,
    pub reason: String,
    pub same_drive_as_community: bool,
}

/// Akıllı kütüphane önerisi: Community ile aynı diskte yeterli yer varsa orası (içe aktarma anlık olur),
/// yoksa en çok boş alanı olan disk.
#[tauri::command]
pub async fn msfs_suggest_library(game: G<'_>) -> AppResult<LibrarySuggestion> {
    blocking(&game, |g| {
        const ENOUGH: u64 = 30 * 1024 * 1024 * 1024;
        let gb = |b: u64| format!("{:.0} GB", b as f64 / 1024f64.powi(3));
        let drive_of = |p: &std::path::Path| p.to_string_lossy().get(..2).map(|d| d.to_uppercase());
        let community = g.sims().iter().find_map(|s| s.community_path.clone());
        let home = std::env::var("USERPROFILE").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(r"C:\"));
        let community_drive = community.as_deref().and_then(drive_of);
        let community_free = community.as_deref().and_then(modstead_core::platform::disk_free);

        if let (Some(drive), Some(free)) = (&community_drive, community_free) {
            if free >= ENOUGH {
                let path = if Some(drive.clone()) == drive_of(&home) { home.join("MSFS Mods") } else { PathBuf::from(format!(r"{drive}\MSFS Mods")) };
                return Ok(LibrarySuggestion {
                    path,
                    free: Some(free),
                    reason: tr!(
                        format!("Community klasörüyle aynı disk ({drive}, {} boş): içe aktarma anında gerçekleşir.", gb(free)),
                        format!("Same disk as the Community folder ({drive}, {} free): importing is instant.", gb(free))
                    ),
                    same_drive_as_community: true,
                });
            }
        }
        let best = crate::util::drives().into_iter().max_by_key(|(_, f)| *f);
        Ok(match best {
            Some((root, free)) => {
                let drive = drive_of(&root).unwrap_or_else(|| "C:".into());
                let same = community_drive.as_deref() == Some(drive.as_str());
                let reason = match (&community_drive, community_free) {
                    (Some(cd), Some(cf)) if !same => tr!(
                        format!("{cd} diskinde yalnızca {} boş; en çok yer {drive} diskinde ({}). Bağlantılar diskler arası çalışır.", gb(cf), gb(free)),
                        format!("Only {} free on {cd}; the most space is on {drive} ({}). Links work across disks.", gb(cf), gb(free))
                    ),
                    _ => tr!(format!("En çok boş alan {drive} diskinde ({}).", gb(free)), format!("The most free space is on {drive} ({}).", gb(free))),
                };
                LibrarySuggestion { path: PathBuf::from(format!(r"{drive}\MSFS Mods")), free: Some(free), reason, same_drive_as_community: same }
            }
            None => LibrarySuggestion { path: home.join("MSFS Mods"), free: None, reason: String::new(), same_drive_as_community: false },
        })
    })
    .await
}

// ---------- Tarama ----------

/// Son tarama (yoksa tarar). Sayfalar bununla açılır; "Yenile" `msfs_scan` çağırır.
#[tauri::command]
pub async fn msfs_snapshot(game: G<'_>) -> AppResult<ScanResult> {
    blocking(&game, |g| Ok((*g.snapshot()).clone())).await
}

#[tauri::command]
pub async fn msfs_scan(game: G<'_>) -> AppResult<ScanResult> {
    let r = blocking(&game, |g| Ok((*g.rescan()).clone())).await?;
    game.changed();
    Ok(r)
}

#[tauri::command]
pub async fn msfs_conflicts(game: G<'_>) -> AppResult<Vec<Conflict>> {
    blocking(&game, |g| Ok(crate::conflicts::compute(&g.snapshot()))).await
}

#[tauri::command]
pub async fn msfs_startup_programs(game: G<'_>) -> AppResult<Vec<ExeEntry>> {
    blocking(&game, |g| Ok(crate::exexml::read(&g.sims()))).await
}

// ---------- Etkinleştirme / yönetim ----------

fn finish(g: &Msfs, rep: OpReport) -> AppResult<OpReport> {
    g.rescan();
    g.changed();
    Ok(rep)
}

#[tauri::command]
pub async fn msfs_set_enabled(game: G<'_>, ids: Vec<String>, sim: String, enabled: bool) -> AppResult<OpReport> {
    blocking(&game, move |g| {
        let _guard = g.inner.fs_lock.lock().unwrap();
        let library = g.library()?;
        let sims = g.sims();
        let mut rep = OpReport::default();
        for id in ids {
            let r = (|| -> AppResult<()> {
                let m = g.find_mod(&id)?;
                let Some(path) = m.library_path.clone() else {
                    return Err(AppError::msg(tr!("Bu mod kütüphanede değil. Önce kütüphaneye aktarın.", "This mod is not in the library. Import it first.")));
                };
                if enabled { linker::enable(&sims, &library, &path, &m.info.built_for, &sim) } else { linker::disable(&sims, &library, &path, &sim) }
            })();
            match r {
                Ok(()) => rep.ok.push(id),
                Err(e) => rep.failed.push((id, e.to_string())),
            }
        }
        drop(_guard);
        finish(g, rep)
    })
    .await
}

#[tauri::command]
pub async fn msfs_import(game: G<'_>, ids: Vec<String>) -> AppResult<OpReport> {
    blocking(&game, move |g| {
        let _guard = g.inner.fs_lock.lock().unwrap();
        let library = g.library()?;
        let sims = g.sims();
        let mut rep = OpReport::default();
        for id in ids {
            let r = (|| -> AppResult<()> {
                let m = g.find_mod(&id)?;
                if m.source != "community" {
                    return Err(AppError::msg(tr!("Yalnızca Community klasöründeki modlar içe aktarılabilir.", "Only mods in the Community folder can be imported.")));
                }
                let dest = linker::import(&sims, &library, &m.info.path)?;
                let new_id = crate::scanner::library_id(&library, &dest);
                let mut db = g.inner.db.lock().unwrap();
                let entry = db.mods.entry(new_id).or_default();
                entry.installed_at.get_or_insert_with(now_iso);
                entry.source_label.get_or_insert_with(|| tr!("Community'den içe aktarıldı", "Imported from Community").into());
                Ok(())
            })();
            match r {
                Ok(()) => rep.ok.push(id),
                Err(e) => rep.failed.push((id, e.to_string())),
            }
        }
        g.save_db();
        drop(_guard);
        finish(g, rep)
    })
    .await
}

#[tauri::command]
pub async fn msfs_uninstall(game: G<'_>, ids: Vec<String>) -> AppResult<OpReport> {
    blocking(&game, move |g| {
        let _guard = g.inner.fs_lock.lock().unwrap();
        let library = g.library()?;
        let sims = g.sims();
        let mut rep = OpReport::default();
        for id in ids {
            let r = (|| -> AppResult<()> {
                let m = g.find_mod(&id)?;
                let Some(path) = m.library_path else {
                    return Err(AppError::msg(tr!("Yalnızca kütüphanedeki modlar kaldırılabilir.", "Only mods in the library can be removed.")));
                };
                linker::uninstall(&sims, &library, &path)?;
                g.inner.db.lock().unwrap().mods.remove(&id);
                g.inner.cache.lock().unwrap().invalidate(&path);
                Ok(())
            })();
            match r {
                Ok(()) => rep.ok.push(id),
                Err(e) => rep.failed.push((id, e.to_string())),
            }
        }
        g.save_db();
        drop(_guard);
        finish(g, rep)
    })
    .await
}

#[tauri::command]
pub async fn msfs_remove_broken_link(game: G<'_>, path: PathBuf) -> AppResult<()> {
    blocking(&game, move |g| {
        {
            let _guard = g.inner.fs_lock.lock().unwrap();
            linker::remove_broken_link(&g.sims(), &path)?;
        }
        finish(g, OpReport::default()).map(|_| ())
    })
    .await
}

#[tauri::command]
pub async fn msfs_fix_nested(game: G<'_>, path: PathBuf) -> AppResult<Vec<PathBuf>> {
    blocking(&game, move |g| {
        let moved = {
            let _guard = g.inner.fs_lock.lock().unwrap();
            linker::fix_nested(&g.sims(), &path)?
        };
        finish(g, OpReport::default())?;
        Ok(moved)
    })
    .await
}

#[tauri::command]
pub async fn msfs_update_meta(game: G<'_>, id: String, favorite: Option<bool>, tags: Option<Vec<String>>, notes: Option<String>) -> AppResult<()> {
    blocking(&game, move |g| {
        let meta = {
            let mut db = g.inner.db.lock().unwrap();
            let m = db.mods.entry(id.clone()).or_default();
            if let Some(f) = favorite {
                m.favorite = f;
            }
            if let Some(t) = tags {
                m.tags = t.into_iter().map(|t| t.trim().chars().take(40).collect::<String>()).filter(|t| !t.is_empty()).take(24).collect();
            }
            if let Some(n) = notes {
                m.notes = n.chars().take(4000).collect();
            }
            m.clone()
        };
        g.save_db();
        // Son taramadaki kopyayı da güncelle; tam tarama gerekmez.
        let mut guard = g.inner.last_scan.write().unwrap();
        if let Some(scan) = guard.as_mut() {
            let mut s = (**scan).clone();
            if let Some(m) = s.mods.iter_mut().find(|m| m.id == id) {
                m.meta = meta;
            }
            *scan = std::sync::Arc::new(s);
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn msfs_rescan_security(game: G<'_>, id: String) -> AppResult<SecurityReport> {
    let r = install::rescan_security(&game, &id).await?;
    game.changed();
    Ok(r)
}

// ---------- Hazırlık denetimi ----------

/// İsteğe bağlı derin denetim: önce taze bir tarama yapılır (Content.xml / exe.xml yeniden okunur), sonra
/// modun layout.json'daki her dosyası diskte aranır, boyutları ve TÜM yolların uzunluğu denetlenir.
#[tauri::command]
pub async fn msfs_verify(game: G<'_>, id: String) -> AppResult<ModVerification> {
    blocking(&game, move |g| {
        let scan = g.rescan();
        let m = scan.mods.iter().find(|m| m.id == id).ok_or_else(|| AppError::NotFound(format!("mod {id}")))?;
        Ok(crate::readiness::verify(m, &scan))
    })
    .await
}

/// Hazırlık denetiminin önerdiği düzeltmeyi uygular (exe.xml girdisini aç / Content.xml'de paketi etkinleştir).
/// Yalnızca kullanıcı açıkça isterse çağrılır; sim çalışıyorsa reddedilir, dosya önce yanına yedeklenir.
#[tauri::command]
pub async fn msfs_apply_fix(game: G<'_>, fix: ReadinessFix) -> AppResult<FixOutcome> {
    blocking(&game, move |g| {
        let out = {
            let _guard = g.inner.fs_lock.lock().unwrap();
            crate::readiness::apply_fix(&g.sims(), &fix)?
        };
        log::info!("MSFS düzeltmesi: {} (yedek: {})", out.message, out.backup.display());
        g.rescan();
        g.changed();
        Ok(out)
    })
    .await
}

/// Simi Steam ya da Microsoft Store üzerinden başlatır.
#[tauri::command]
pub async fn msfs_launch(game: G<'_>, sim: String) -> AppResult<()> {
    blocking(&game, move |g| {
        let sims = g.sims();
        let s = sims.iter().find(|s| s.id == sim).ok_or_else(|| AppError::msg(tr!(format!("Bilinmeyen simülatör: {sim}"), format!("Unknown simulator: {sim}"))))?;
        if s.running {
            return Err(AppError::msg(tr!(format!("MSFS {} zaten çalışıyor.", s.short), format!("MSFS {} is already running.", s.short))));
        }
        modstead_core::platform::open_launch_uri(&crate::sims::launch_uri(s)?)?;
        Ok(())
    })
    .await
}

/// Bir klasörü Gezgin'de açar. Yalnızca bilinen yerler: kütüphane, Community klasörleri ve bir modun klasörü.
/// `target`: "library" | "community:<sim>" | "packages:<sim>" | "config:<sim>" | "mod:<kimlik>"
#[tauri::command]
pub async fn msfs_reveal(game: G<'_>, target: String) -> AppResult<()> {
    blocking(&game, move |g| {
        let path = if target == "library" {
            g.library()?
        } else if let Some(sim) = target.strip_prefix("community:") {
            g.sims().into_iter().find(|s| s.id == sim).and_then(|s| s.community_path).ok_or_else(|| AppError::NotFound("Community".into()))?
        } else if let Some(sim) = target.strip_prefix("packages:") {
            g.sims().into_iter().find(|s| s.id == sim).and_then(|s| s.packages_path).ok_or_else(|| AppError::NotFound("Packages".into()))?
        } else if let Some(sim) = target.strip_prefix("config:") {
            // UserCfg.opt'un bulunduğu yapılandırma klasörü (InstalledPackagesPath satırı burada düzenlenir).
            g.sims().into_iter().find(|s| s.id == sim).and_then(|s| s.config_dir).ok_or_else(|| AppError::NotFound("UserCfg.opt".into()))?
        } else if let Some(id) = target.strip_prefix("mod:") {
            g.find_mod(id)?.info.path
        } else {
            return Err(AppError::security(tr!("Bilinmeyen hedef", "Unknown target")));
        };
        if !path.is_dir() {
            return Err(AppError::NotFound(path.display().to_string()));
        }
        modstead_core::platform::hidden_command("explorer.exe").arg(&path).spawn()?;
        Ok(())
    })
    .await
}

/// Modun küçük resmi (ham bayt; arayüz `blob:` adresine çevirir). Yalnızca taramanın bulduğu, paket klasörünün
/// içindeki görsel okunur.
#[tauri::command]
pub async fn msfs_thumbnail(game: G<'_>, id: String) -> AppResult<tauri::ipc::Response> {
    let bytes = blocking(&game, move |g| {
        let m = g.find_mod(&id)?;
        let thumb = m.info.thumbnail.ok_or_else(|| AppError::NotFound(tr!("küçük resim", "thumbnail").into()))?;
        if !is_within(&thumb, &m.info.path) {
            return Err(AppError::security(tr!("Görsel paket klasörünün dışında.", "The image is outside the package folder.")));
        }
        let ext = thumb.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !matches!(ext.as_str(), "jpg" | "jpeg" | "png") {
            return Err(AppError::security(tr!("Desteklenmeyen görsel türü", "Unsupported image type")));
        }
        let meta = std::fs::metadata(&thumb)?;
        if meta.len() > 8 * 1024 * 1024 {
            return Err(AppError::msg(tr!("Görsel çok büyük", "Image too large")));
        }
        Ok(std::fs::read(&thumb)?)
    })
    .await?;
    Ok(tauri::ipc::Response::new(bytes))
}

// ---------- Profiller ----------

#[tauri::command]
pub fn msfs_profiles(game: G<'_>) -> Vec<Profile> {
    game.inner.profiles.lock().unwrap().clone()
}

/// Şu anki etkin kütüphane modlarını profil olarak kaydeder (`id` verilirse günceller).
#[tauri::command]
pub async fn msfs_profile_save(game: G<'_>, name: String, description: String, id: Option<String>) -> AppResult<Profile> {
    let name = name.trim().chars().take(80).collect::<String>();
    if name.is_empty() {
        return Err(AppError::msg(tr!("Profil adı boş olamaz.", "The profile name cannot be empty.")));
    }
    blocking(&game, move |g| {
        let scan = g.rescan();
        let mut sims = std::collections::HashMap::new();
        for s in scan.sims.iter().filter(|s| s.usable()) {
            let enabled: Vec<String> = scan
                .mods
                .iter()
                .filter(|m| m.source == "library" && m.sims.get(&s.id).is_some_and(|x| x.state == "enabled"))
                .map(|m| m.id.clone())
                .collect();
            sims.insert(s.id.clone(), enabled);
        }
        let now = now_iso();
        let profile = {
            let mut profiles = g.inner.profiles.lock().unwrap();
            match id.and_then(|id| profiles.iter_mut().find(|p| p.id == id)) {
                Some(p) => {
                    p.name = name;
                    p.description = description;
                    p.sims = sims;
                    p.updated_at = now;
                    p.clone()
                }
                None => {
                    let p = Profile { id: modstead_core::fsx::short_id(), name, description, sims, created_at: now.clone(), updated_at: now };
                    profiles.push(p.clone());
                    p
                }
            }
        };
        g.save_profiles();
        Ok(profile)
    })
    .await
}

#[tauri::command]
pub fn msfs_profile_delete(game: G<'_>, id: String) {
    game.inner.profiles.lock().unwrap().retain(|p| p.id != id);
    game.save_profiles();
}

/// Profili uygular: profildeki kütüphane modları etkinleşir, diğer kütüphane modları devre dışı kalır.
/// Community'deki fiziksel ve başka araçlara ait modlara dokunulmaz.
#[tauri::command]
pub async fn msfs_profile_apply(game: G<'_>, id: String, sim: Option<String>) -> AppResult<OpReport> {
    blocking(&game, move |g| {
        let profile = g
            .inner
            .profiles
            .lock()
            .unwrap()
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(tr!("profil", "profile").into()))?;
        let scan = g.rescan();
        let _guard = g.inner.fs_lock.lock().unwrap();
        let library = g.library()?;
        let sims = g.sims();
        let mut rep = OpReport::default();
        for s in sims.iter().filter(|s| s.usable() && sim.as_ref().is_none_or(|x| x == &s.id)) {
            let Some(wanted) = profile.sims.get(&s.id) else { continue };
            for m in scan.mods.iter().filter(|m| m.source == "library") {
                let Some(path) = &m.library_path else { continue };
                let on = m.sims.get(&s.id).is_some_and(|x| x.state == "enabled");
                let want = wanted.contains(&m.id);
                let r = if want && !on {
                    linker::enable(&sims, &library, path, &m.info.built_for, &s.id)
                } else if !want && on {
                    linker::disable(&sims, &library, path, &s.id)
                } else {
                    continue;
                };
                match r {
                    Ok(()) => rep.ok.push(format!("{}:{}", s.id, m.id)),
                    Err(e) => rep.failed.push((format!("{}:{}", s.id, m.id), e.to_string())),
                }
            }
            for missing in wanted.iter().filter(|w| !scan.mods.iter().any(|m| &m.id == *w)) {
                rep.failed.push((format!("{}:{}", s.id, missing), tr!("Kütüphanede yok", "Not in the library").into()));
            }
        }
        drop(_guard);
        finish(g, rep)
    })
    .await
}

// ---------- Katalog ve kurulum ----------

#[tauri::command]
pub async fn msfs_catalog(game: G<'_>, force: bool) -> AppResult<Vec<CatalogItem>> {
    if !force {
        if let Some((t, items)) = game.inner.catalog.lock().unwrap().as_ref() {
            if t.elapsed() < Duration::from_secs(15 * 60) {
                return Ok(items.clone());
            }
        }
    }
    let items = crate::catalog::fetch(&game.services.http).await;
    if items.iter().all(|i| i.error.is_none()) {
        *game.inner.catalog.lock().unwrap() = Some((Instant::now(), items.clone()));
    }
    Ok(items)
}

#[tauri::command]
pub async fn msfs_install_catalog(game: G<'_>, id: String, sim: String) -> AppResult<JobSnapshot> {
    let items = msfs_catalog(game.clone(), false).await?;
    let item = items.into_iter().find(|i| i.def.id == id).ok_or_else(|| AppError::NotFound(tr!("katalog girdisi", "catalog entry").into()))?;
    if let Some(e) = &item.error {
        return Err(AppError::Network(e.clone()));
    }
    let variant = item
        .variants_status
        .iter()
        .find(|v| v.sim == sim)
        .or_else(|| item.variants_status.first())
        .ok_or_else(|| AppError::NotFound(tr!("sürüm", "release").into()))?;
    let asset = variant
        .latest
        .clone()
        .ok_or_else(|| AppError::NotFound(tr!("bu sürüm için indirilebilir dosya", "a downloadable file for this release").into()))?;
    let name = if modstead_core::i18n::is_en() { item.def.name_en.clone().unwrap_or(item.def.name.clone()) } else { item.def.name.clone() };
    install::start_github(
        &game,
        &format!("{name} {}", asset.tag),
        &item.def.repo,
        asset.release_id,
        asset.asset_id,
        JobMeta { catalog_id: Some(item.def.id.clone()), release_tag: Some(asset.tag.clone()), preferred_sim: Some(variant.sim.clone()), size: Some(asset.size) },
    )
}

#[tauri::command]
pub fn msfs_install_url(game: G<'_>, url: String) -> AppResult<JobSnapshot> {
    install::start_url(&game, &url)
}

/// İnceleme penceresindeki "Kur" düğmesi (`GameModule.confirmJob`).
#[tauri::command]
pub async fn msfs_confirm_job(game: G<'_>, id: String, accept_risk: bool, options: Option<ConfirmOptions>) -> AppResult<JobSnapshot> {
    install::confirm(&game, &id, accept_risk, options.unwrap_or_default()).await
}

// ---------- Mod tarayıcısı ----------

#[tauri::command]
pub fn msfs_open_browser(app: tauri::AppHandle, game: G<'_>, url: String) -> AppResult<()> {
    game.library()?;
    crate::browser::open(&app, &url)
}
