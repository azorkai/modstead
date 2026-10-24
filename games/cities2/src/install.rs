//! Kurulum: her arşiv bir görevdir. Ortak kabul hattı (`intake`) indirir, doğrular, güvenle açar ve
//! tarar; burada açılan içerik incelenip plan çıkarılır, görev inceleme penceresine düşer. Kullanıcı
//! onaylayınca (`cities2_confirm_job`) seçilen öğeler yerine kopyalanır:
//!
//! - kod modu (`.dll` içeren klasör) → `<kullanıcı>\Mods\<ad>` (güncellemede eskisi çöpe, açık/kapalı durumu korunur)
//! - kayıt (`.cok` + `.cok.cid`, içinde `SaveGameMetadata`) → `<kullanıcı>\Saves\<platform kimliği>`
//! - harita (`.cok`, içinde `MapMetadata`) → `<kullanıcı>\Maps`
//!
//! Var olan kayıt ve haritaların üzerine yazılmaz (yeni ad verilir). BepInEx eklentileri tanınır ve
//! uyarıyla işaretlenir (yerleşik mod sistemi onları yüklemez); oyun klasörüne dosya kopyalanmaz.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use modstead_core::intake::{self, Intake, IntakeRequest, Origin};
use modstead_core::nexus::{NexusGame, NxmLink};
use modstead_core::prelude::*;
use modstead_core::{fsx, platform, version};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::mods::{self, ModEntry};
use crate::{Cities2, ID, INFO, bail, detect, ops, saves};

/// Kod modu sayılmayan, mod yükleyicilerine ait DLL'ler.
const LOADER_DLLS: &[&str] = &["winhttp.dll", "doorstop.dll", "bepinex.dll", "bepinex.core.dll", "bepinex.preloader.dll", "bepinex.preloader.core.dll"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlanItem {
    pub key: String,
    /// "code" | "save" | "map"
    pub kind: &'static str,
    pub name: String,
    /// Hedefteki klasör ya da dosya adı.
    pub target_name: String,
    /// "install" | "update" | "reinstall" | "downgrade"
    pub action: &'static str,
    pub version: Option<String>,
    pub existing_version: Option<String>,
    pub existing_enabled: Option<bool>,
    pub dlls: Vec<String>,
    pub has_ui: bool,
    pub size: u64,
    pub file_count: u32,
    /// BepInEx eklentisi: varsayılan olarak seçilmez.
    pub bepinex: bool,
    /// Aynı DLL'i taşıyan Paradox Mods aboneliği (ikisi birlikte yüklenir).
    pub duplicate_of: Option<String>,
    /// Kayıt/harita için kısa bilgi: "Babaeski · 18944 · Barrier Island".
    pub detail: Option<String>,
    pub warnings: Vec<String>,
}

/// İnceleme penceresine giden plan (`GameModule.ReviewPlan` çizer).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub kind: &'static str,
    pub source_name: String,
    pub items: Vec<PlanItem>,
    pub warnings: Vec<String>,
    pub total_size: u64,
    pub file_count: u32,
    pub game_version: Option<String>,
    /// Kayıtların gideceği klasör (`Saves\<kimlik>`), biliniyorsa.
    pub saves_folder: Option<String>,
    /// Kod modu kurulmadan önce en son kayıt yedeklenecek mi.
    pub backup_first: bool,
}

pub struct Staged {
    pub intake: Intake,
    pub plan: InstallPlan,
    /// Öğe anahtarı → kopyalanacak kaynak (kod: klasör; kayıt/harita: .cok ve varsa .cid).
    pub sources: HashMap<String, Vec<PathBuf>>,
}

impl Staged {
    fn cleanup(&self) {
        let _ = fsx::remove_dir(&self.intake.work_dir);
    }
}

pub enum Source {
    Local { path: PathBuf },
    Nexus { game: NexusGame, mod_id: u64, file_id: u64, nxm: Option<NxmLink>, name: Option<String> },
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Options {
    /// Kurulacak öğelerin anahtarları; verilmezse BepInEx olmayanların hepsi.
    pub keys: Option<Vec<String>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub installed: Vec<String>,
    pub replaced: Vec<String>,
    pub backed_up: Option<String>,
}

fn is_loader_dll(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    LOADER_DLLS.contains(&l.as_str()) || l.starts_with("0harmony")
}

fn file_name(p: &Path) -> String {
    p.file_name().unwrap_or_default().to_string_lossy().into_owned()
}

/// Arşiv adından okunur ad: Nexus'un "Ad-146-0-5-3-1712345678" kalıbındaki sayısal ekleri atar.
fn clean_stem(stem: &str) -> String {
    let parts: Vec<&str> = stem.split('-').collect();
    let keep = parts.iter().take_while(|p| !p.chars().all(|c| c.is_ascii_digit()) || p.is_empty()).count().max(1);
    parts[..keep].join("-").replace('_', " ").trim().to_string()
}

fn cok_detail(path: &Path) -> Option<String> {
    let dir = path.parent()?;
    let info = saves::read_save(dir, path, 0);
    let mut bits: Vec<String> = Vec::new();
    if let Some(c) = info.city_name {
        bits.push(c);
    }
    if let Some(p) = info.population {
        bits.push(format!("{p} {}", tr!("nüfus", "pop.")));
    }
    if let Some(m) = info.map_name {
        bits.push(m);
    }
    (!bits.is_empty()).then(|| bits.join(" · "))
}

/// `.MapMetadata`'dan harita adı (yoksa dosya adı).
fn map_name(path: &Path) -> Option<String> {
    let f = fs::File::open(path).ok()?;
    let mut zip = zip::ZipArchive::new(f).ok()?;
    let idx = (0..zip.len()).find(|&i| zip.name_for_index(i).and_then(|r| r.ok()).is_some_and(|n| n.to_ascii_lowercase().ends_with(".mapmetadata")))?;
    let mut buf = String::new();
    use std::io::Read;
    zip.by_index(idx).ok()?.take(2 * 1024 * 1024).read_to_string(&mut buf).ok()?;
    let v: serde_json::Value = serde_json::from_str(buf.trim_start_matches('\u{feff}')).ok()?;
    ["displayName", "mapName", "name"].iter().find_map(|k| v.get(*k).and_then(|x| x.as_str()).map(str::to_string)).filter(|s| !s.is_empty())
}

/// Açılmış arşivden kurulum planı (saf: kullanıcı klasörünü yalnızca okur).
pub fn build_plan(extract_dir: &Path, user_dir: &Path, source_name: &str, installed: &[ModEntry], saves_folder: Option<String>, backup_first: bool) -> AppResult<(InstallPlan, HashMap<String, Vec<PathBuf>>)> {
    let stem = clean_stem(Path::new(source_name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Mod".into()).as_str());
    let mut files: Vec<PathBuf> = Vec::new();
    for e in walkdir::WalkDir::new(extract_dir).follow_links(false).max_depth(8).into_iter().flatten().take(50_000) {
        if e.file_type().is_file() {
            files.push(e.into_path());
        }
    }
    let mut items = Vec::new();
    let mut sources: HashMap<String, Vec<PathBuf>> = HashMap::new();
    let mut warnings = Vec::new();
    let mut claimed: HashSet<PathBuf> = HashSet::new();

    // Kayıtlar ve haritalar
    for cok in files.iter().filter(|p| file_name(p).to_ascii_lowercase().ends_with(".cok")) {
        let Some(kind) = mods::cok_kind(cok) else { continue };
        let key = format!("{kind}:{}", items.len());
        let cid = PathBuf::from(format!("{}.cid", cok.display()));
        let mut src = vec![cok.clone()];
        claimed.insert(cok.clone());
        if cid.is_file() {
            claimed.insert(cid.clone());
            src.push(cid);
        }
        let size = src.iter().map(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0)).sum();
        let target_name = file_name(cok);
        let stem_name = target_name.trim_end_matches(".cok").to_string();
        let (name, detail) = if kind == "save" {
            let d = cok_detail(cok);
            (d.as_ref().and_then(|d| d.split(" · ").next().map(str::to_string)).unwrap_or(stem_name), d)
        } else {
            (map_name(cok).unwrap_or(stem_name), None)
        };
        let exists = if kind == "save" { saves_folder.as_ref().is_some_and(|f| user_dir.join("Saves").join(f).join(&target_name).exists()) } else { user_dir.join("Maps").join(&target_name).exists() };
        let mut w = Vec::new();
        if exists {
            w.push(tr!("Aynı adlı dosya var; üzerine yazılmaz, yeni adla kopyalanır.", "A file with the same name exists; it won't be overwritten, a new name is used.").into());
        }
        items.push(PlanItem {
            key: key.clone(),
            kind,
            name,
            target_name,
            action: "install",
            version: None,
            existing_version: None,
            existing_enabled: None,
            dlls: vec![],
            has_ui: false,
            size,
            file_count: src.len() as u32,
            bepinex: false,
            duplicate_of: None,
            detail,
            warnings: w,
        });
        sources.insert(key, src);
    }

    // Kod modları: DLL içeren en sığ klasörler. `Mods\<Ad>` düzeni ve BepInEx `plugins\<Ad>` düzeni tanınır.
    let mut dll_dirs: Vec<PathBuf> = files
        .iter()
        .filter(|p| file_name(p).to_ascii_lowercase().ends_with(".dll") && !is_loader_dll(&file_name(p)))
        .filter_map(|p| p.parent().map(Path::to_path_buf))
        .collect();
    dll_dirs.sort();
    dll_dirs.dedup();
    let mut roots: Vec<PathBuf> = Vec::new();
    for d in &dll_dirs {
        // Arşivdeki `Mods` ya da `plugins` klasörünün doğrudan çocuğu kök sayılır; yoksa DLL'in klasörü.
        let rel = d.strip_prefix(extract_dir).unwrap_or(d);
        let comps: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
        let anchor = comps.iter().position(|c| c.eq_ignore_ascii_case("Mods") || c.eq_ignore_ascii_case("plugins"));
        let root = match anchor {
            Some(i) if i + 1 < comps.len() => extract_dir.join(comps[..=i + 1].iter().collect::<PathBuf>()),
            _ => d.clone(),
        };
        if !roots.iter().any(|r| root.starts_with(r)) {
            roots.retain(|r| !r.starts_with(&root));
            roots.push(root);
        }
    }
    let local_dir = user_dir.join("Mods");
    for root in roots {
        let rel = root.strip_prefix(extract_dir).unwrap_or(&root).to_string_lossy().replace('\\', "/");
        let mut dlls: Vec<String> = Vec::new();
        let (mut size, mut count, mut has_ui) = (0u64, 0u32, false);
        for f in files.iter().filter(|f| f.starts_with(&root) && !claimed.contains(*f)) {
            count += 1;
            size += fs::metadata(f).map(|m| m.len()).unwrap_or(0);
            let n = file_name(f).to_ascii_lowercase();
            if n.ends_with(".dll") {
                dlls.push(f.strip_prefix(&root).unwrap_or(f).to_string_lossy().replace('\\', "/"));
            } else if n.ends_with(".mjs") || n.ends_with(".js") {
                has_ui = true;
            }
        }
        dlls.sort_by_key(|d| (d.contains('/'), d.to_ascii_lowercase()));
        let main = dlls.iter().find(|d| !d.contains('/') && !is_loader_dll(d) && !d.to_ascii_lowercase().ends_with("_win_x86_64.dll")).cloned();
        let dir_name = file_name(&root);
        let generic = root == extract_dir || ["mods", "plugins", "bepinex", "bin", "release", "x"].contains(&dir_name.to_ascii_lowercase().as_str());
        let base = if generic { main.as_deref().map(|m| m.trim_end_matches(".dll").to_string()).unwrap_or_else(|| stem.clone()) } else { dir_name.trim_start_matches('.').to_string() };
        let target_name = fsx::sanitize_name(&base);
        let bepinex = rel.to_ascii_lowercase().contains("bepinex") || dlls.iter().any(|d| references(&root.join(d)));
        let version = main.as_ref().and_then(|m| platform::file_version(&root.join(m))).map(|v| platform::format_version(v, false)).filter(|v| v != "0.0.0");
        let existing = [target_name.clone(), format!(".{target_name}")].into_iter().map(|n| local_dir.join(n)).find(|p| p.is_dir());
        let existing_entry = existing.as_ref().and_then(|p| installed.iter().find(|m| m.source == "local" && fsx::norm_key(Path::new(&m.path)) == fsx::norm_key(p)));
        let action = match (&existing, version.as_deref(), existing_entry.and_then(|e| e.version.as_deref())) {
            (None, _, _) => "install",
            (Some(_), Some(new), Some(old)) => match version::compare(new, old) {
                Some(std::cmp::Ordering::Greater) => "update",
                Some(std::cmp::Ordering::Less) => "downgrade",
                _ => "reinstall",
            },
            (Some(_), _, _) => "update",
        };
        let main_file = main.as_deref().map(|m| m.rsplit('/').next().unwrap_or(m).to_ascii_lowercase());
        let duplicate_of = main_file.as_ref().and_then(|mf| {
            installed.iter().filter(|m| m.source == "paradox").find(|p| p.dlls.iter().any(|d| d.rsplit('/').next().unwrap_or(d).eq_ignore_ascii_case(mf))).map(|p| p.meta.as_ref().map(|x| x.name.clone()).filter(|n| !n.is_empty()).unwrap_or_else(|| p.name.clone()))
        });
        let mut w = Vec::new();
        if bepinex {
            w.push(tr!(
                "BepInEx için yazılmış: oyunun 1.1'den beri kullandığı yerleşik mod sistemi bunu yüklemez. Paradox Mods'taki güncel sürümü tercih edin.",
                "Written for BepInEx: the built-in mod system the game has used since 1.1 won't load it. Prefer the current version on Paradox Mods."
            )
            .into());
        }
        if let Some(d) = &duplicate_of {
            w.push(tr!(format!("Paradox Mods aboneliklerinizde de var ({d}); ikisi birlikte yüklenirse çakışır."), format!("Also in your Paradox Mods subscriptions ({d}); loading both causes a conflict.")));
        }
        if dlls.is_empty() {
            continue;
        }
        let key = format!("code:{}", items.len());
        items.push(PlanItem {
            key: key.clone(),
            kind: "code",
            name: base,
            target_name,
            action,
            version,
            existing_version: existing_entry.and_then(|e| e.version.clone()),
            existing_enabled: existing.as_ref().map(|p| !file_name(p).starts_with('.')),
            dlls,
            has_ui,
            size,
            file_count: count,
            bepinex,
            duplicate_of,
            detail: Some(rel).filter(|r| !r.is_empty()),
            warnings: w,
        });
        sources.insert(key, vec![root]);
    }

    if items.is_empty() {
        bail!(
            "Bu arşivde Cities: Skylines II kod modu (.dll), kaydı ya da haritası (.cok) bulunamadı. Paradox Mods'taki varlık paketleri oyunun içinden kurulur.",
            "No Cities: Skylines II code mod (.dll), save or map (.cok) was found in this archive. Asset packs from Paradox Mods are installed from within the game."
        );
    }
    let loaders: Vec<String> = files.iter().map(|p| file_name(p)).filter(|n| is_loader_dll(n) || n.eq_ignore_ascii_case("doorstop_config.ini")).collect();
    if !loaders.is_empty() {
        let mut l = loaders;
        l.sort();
        l.dedup();
        let list = l.join(", ");
        warnings.push(tr!(
            format!("Arşivde mod yükleyicisi dosyaları var ({list}). Bunlar oyun klasörüne kopyalanmak içindir; Modstead kurmaz."),
            format!("The archive contains mod loader files ({list}). They're meant for the game folder; Modstead won't install them.")
        ));
    }
    let total_size = items.iter().map(|i| i.size).sum();
    let file_count = items.iter().map(|i| i.file_count).sum();
    Ok((
        InstallPlan { kind: "cities2", source_name: source_name.to_string(), items, warnings, total_size, file_count, game_version: detect::game_version(user_dir), saves_folder, backup_first },
        sources,
    ))
}

fn references(dll: &Path) -> bool {
    mods::references_bepinex(dll)
}

/// Görevi oluşturur ve hattı arka planda başlatır.
pub fn start(game: &Cities2, source: Source) -> JobHandle {
    let (title, kind) = match &source {
        Source::Local { path } => (file_name(path), "local"),
        Source::Nexus { mod_id, name, .. } => (name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| format!("Nexus Mods · #{mod_id}")), "nexus"),
    };
    let job = game.services.jobs.create(ID, "install", &title, kind);
    let ctx = PrepareCtx {
        services: game.services.clone(),
        staging: game.staging_root(),
        user_dir: game.user_dir(),
        saves_folder: saves_folder(game),
        backup_first: game.settings().backup_before_changes,
    };
    let j = job.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = prepare(&ctx, &j, source).await {
            j.fail(&e);
        }
    });
    job
}

/// Kayıtların gideceği `Saves\<kimlik>`: oyunun son kullanıcı kimliği, yoksa en son değişen alt klasör.
pub fn saves_folder(game: &Cities2) -> Option<String> {
    let user = game.user_dir();
    if let Some(id) = detect::paradox_account(&user).user_folder {
        return Some(id);
    }
    let mut dirs: Vec<(i64, String)> = fs::read_dir(user.join("Saves"))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| (e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0), e.file_name().to_string_lossy().into_owned()))
        .collect();
    dirs.sort();
    dirs.pop().map(|d| d.1)
}

pub(crate) struct PrepareCtx {
    pub services: Arc<Services>,
    pub staging: PathBuf,
    pub user_dir: PathBuf,
    pub saves_folder: Option<String>,
    pub backup_first: bool,
}

pub(crate) async fn prepare(ctx: &PrepareCtx, job: &JobHandle, source: Source) -> AppResult<()> {
    let origin = match source {
        Source::Local { path } => Origin::Local { path },
        Source::Nexus { game, mod_id, file_id, nxm, .. } => Origin::Nexus { game, mod_id, file_id, nxm },
    };
    let request = IntakeRequest {
        origin,
        work_dir: intake::work_dir_for(&ctx.staging, job),
        content: INFO.content,
        trusted: INFO.trusted_sources,
        known: INFO.known_sources,
        nexus_lookup: INFO.nexus.first().copied(),
    };
    let intake = intake::run(&ctx.services, job, request).await?;
    job.stage(Stage::Analyzing, tr!("İçerik inceleniyor", "Inspecting contents"));
    let (x, user, folder, backup_first) = (intake.extract_dir.clone(), ctx.user_dir.clone(), ctx.saves_folder.clone(), ctx.backup_first);
    let name = file_name(&intake.archive_path);
    let planned = tokio::task::spawn_blocking(move || {
        let installed = mods::scan(&user).mods;
        build_plan(&x, &user, &name, &installed, folder, backup_first)
    })
    .await
    .map_err(AppError::from)
    .and_then(|r| r);
    let (plan, sources) = match planned {
        Ok(p) => p,
        Err(e) => {
            let _ = fsx::remove_dir(&intake.work_dir);
            return Err(e);
        }
    };
    let n = plan.items.len();
    let message = if n == 1 {
        let i = &plan.items[0];
        match i.action {
            "install" => tr!(format!("{} kurulmaya hazır", i.name), format!("{} is ready to install", i.name)),
            _ => tr!(format!("{} güncellemeye hazır", i.name), format!("{} is ready to update", i.name)),
        }
    } else {
        tr!(format!("{n} öğe incelemeye hazır"), format!("{n} items ready for review"))
    };
    if n == 1 {
        let i = &plan.items[0];
        job.set_title(match &i.version {
            Some(v) => format!("{} · {v}", i.name),
            None => i.name.clone(),
        });
    }
    let report = intake.report.clone();
    let plan_json = serde_json::to_value(&plan)?;
    job.set_staged(Staged { intake, plan, sources });
    job.review(message, Some(report), plan_json);
    Ok(())
}

/// Görev listeden kaldırıldı: karantinayı temizle.
pub fn discard(job: &JobHandle) {
    if let Some(s) = job.take_staged::<Staged>() {
        s.cleanup();
    }
}

/// Klasörü kopyalar; `skip` içindeki dosyaları (başka öğelere ait kayıt/haritalar) atlar.
fn copy_filtered(src: &Path, dst: &Path, skip: &HashSet<PathBuf>) -> AppResult<()> {
    fs::create_dir_all(dst)?;
    for e in walkdir::WalkDir::new(src).follow_links(false) {
        let e = e.map_err(AppError::other)?;
        let rel = e.path().strip_prefix(src).map_err(AppError::other)?;
        if rel.as_os_str().is_empty() || skip.contains(e.path()) {
            continue;
        }
        if e.file_type().is_symlink() || fsx::is_link(e.path()) {
            return Err(AppError::security(format!("{}: {}", tr!("bağlantı kopyalanmaz", "links are not copied"), rel.display())));
        }
        let target = dst.join(rel);
        if e.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(p) = target.parent() {
                fs::create_dir_all(p)?;
            }
            fs::copy(e.path(), &target)?;
        }
    }
    Ok(())
}

/// Kayıt ya da haritayı üzerine yazmadan kopyalar: `Ad.cok` doluysa `Ad (2).cok`.
fn copy_cok(src: &[PathBuf], dir: &Path) -> AppResult<String> {
    fs::create_dir_all(dir)?;
    let cok = &src[0];
    let name = file_name(cok);
    let stem = name.trim_end_matches(".cok");
    let target = (1..1000).map(|i| if i == 1 { dir.join(&name) } else { dir.join(format!("{stem} ({i}).cok")) }).find(|p| !p.exists()).ok_or_else(|| AppError::msg(tr!("uygun ad bulunamadı", "no free name")))?;
    fs::copy(cok, &target)?;
    if let Some(cid) = src.get(1) {
        fs::copy(cid, PathBuf::from(format!("{}.cid", target.display())))?;
    }
    Ok(file_name(&target))
}

pub fn commit(game: &Cities2, plan: &InstallPlan, sources: &HashMap<String, Vec<PathBuf>>, opts: &Options) -> AppResult<InstallResult> {
    let selected: Vec<&PlanItem> = plan
        .items
        .iter()
        .filter(|i| match &opts.keys {
            Some(keys) => keys.contains(&i.key),
            None => !i.bepinex,
        })
        .collect();
    if selected.is_empty() {
        bail!("Kurulacak öğe seçilmedi.", "Nothing was selected to install.");
    }
    let backed_up = if plan.backup_first && selected.iter().any(|i| i.kind == "code") { saves::backup_latest(game, "mod-change") } else { None };
    let _lock = game.ops_lock.lock().unwrap();
    let claimed: HashSet<PathBuf> = sources.iter().filter(|(k, _)| !k.starts_with("code:")).flat_map(|(_, v)| v.iter().cloned()).collect();
    let (mut installed, mut replaced) = (Vec::new(), Vec::new());
    for item in selected {
        let src = sources.get(&item.key).ok_or_else(|| AppError::msg(tr!("plan ile karantina uyuşmuyor", "plan and staging don't match")))?;
        match item.kind {
            "code" => {
                let mods_dir = game.local_mods_dir();
                fs::create_dir_all(&mods_dir)?;
                let enabled_path = mods_dir.join(&item.target_name);
                let disabled_path = mods_dir.join(format!(".{}", item.target_name));
                let keep_disabled = !enabled_path.exists() && disabled_path.is_dir();
                for old in [&enabled_path, &disabled_path] {
                    if old.is_dir() && !fsx::is_link(old) {
                        ops::move_to_trash(game, old, &item.name, "local-mod")?;
                        replaced.push(item.name.clone());
                    }
                }
                let dst = if keep_disabled { disabled_path } else { enabled_path };
                // Önce geçici ada kopyala, sonra yeniden adlandır: yarım kopya oyuna mod gibi görünmesin.
                let tmp = mods_dir.join(format!(".modstead-{}", fsx::short_id()));
                if let Err(e) = copy_filtered(&src[0], &tmp, &claimed).and_then(|_| fs::rename(&tmp, &dst).map_err(AppError::from)) {
                    let _ = fsx::remove_dir(&tmp);
                    return Err(e);
                }
                installed.push(item.name.clone());
            }
            "save" => {
                let folder = plan.saves_folder.clone().ok_or_else(|| {
                    AppError::msg(tr!("Kayıt klasörü bilinmiyor: oyunu bir kez açıp kaydedin, sonra yeniden deneyin.", "The save folder is unknown: start the game and save once, then try again."))
                })?;
                let dir = fsx::resolve_under(&game.saves_dir(), &folder)?;
                let name = copy_cok(src, &dir)?;
                installed.push(format!("{} ({name})", item.name));
            }
            "map" => {
                let name = copy_cok(src, &game.maps_dir())?;
                installed.push(format!("{} ({name})", item.name));
            }
            _ => {}
        }
    }
    Ok(InstallResult { installed, replaced, backed_up })
}

/// Kullanıcı onayı: güvenlik kararını uygular ve kurulumu yapar.
pub fn confirm(game: &Cities2, job: &JobHandle, accept_risk: bool, options: serde_json::Value) -> AppResult<serde_json::Value> {
    // Oyun açıksa görevi bozmadan reddet: kullanıcı oyunu kapatıp yeniden deneyebilir.
    game.ensure_game_closed()?;
    let staged = job.take_staged::<Staged>().ok_or_else(|| AppError::msg(tr!("Bu görev artık onay beklemiyor; dosyayı yeniden bırakın.", "This task is no longer awaiting approval; drop the file again.")))?;
    let report = &staged.intake.report;
    if let Some(reason) = report.blocked.clone() {
        staged.cleanup();
        let e = AppError::security(reason);
        job.fail(&e);
        return Err(e);
    }
    if report.needs_override.is_some() && !accept_risk {
        job.set_staged(staged);
        bail!("Bu paket için açık onayınız gerekiyor.", "This package needs your explicit approval.");
    }
    let opts: Options = serde_json::from_value(options).unwrap_or_default();
    if opts.keys.as_ref().is_some_and(|k| k.is_empty()) {
        job.set_staged(staged);
        bail!("Kurulacak öğe seçilmedi.", "Nothing was selected to install.");
    }
    job.stage(Stage::Installing, tr!("Kuruluyor", "Installing"));
    let result = commit(game, &staged.plan, &staged.sources, &opts);
    staged.cleanup();
    match result {
        Ok(r) => {
            let message = match r.installed.as_slice() {
                [one] => tr!(format!("{one} kuruldu"), format!("{one} installed")),
                many => tr!(format!("{} öğe kuruldu", many.len()), format!("{} items installed", many.len())),
            };
            let value = json!(r);
            job.done(message, Some(value.clone()));
            game.services.game_changed(ID);
            Ok(value)
        }
        Err(e) => {
            job.fail(&e);
            game.services.game_changed(ID);
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::fixture;

    fn write(path: &Path, body: &[u8]) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }

    #[test]
    fn cleans_nexus_stems() {
        assert_eq!(clean_stem("RoadBuilder-146-0-5-3-1712345678"), "RoadBuilder");
        assert_eq!(clean_stem("Move_It-109-0-5-6-1755"), "Move It");
        assert_eq!(clean_stem("Anarchy"), "Anarchy");
    }

    #[test]
    fn plans_code_mods_saves_and_bepinex() {
        let fx = fixture();
        let x = fx.root.join("x");
        // 1) Mods\RoadBuilder\RoadBuilder.dll düzeni
        write(&x.join("Mods").join("RoadBuilder").join("RoadBuilder.dll"), b"MZ");
        write(&x.join("Mods").join("RoadBuilder").join("RoadBuilder.mjs"), b"ui");
        // 2) BepInEx eklentisi
        write(&x.join("BepInEx").join("plugins").join("OldTraffic").join("OldTraffic.dll"), b"MZ BepInEx");
        write(&x.join("winhttp.dll"), b"MZ");
        // 3) kayıt
        fs::create_dir_all(&x).unwrap();
        crate::saves::tests_support::write_cok(&x.join("Babaeski.cok"), "Babaeski");
        // var olan sürüm + Paradox kopyası
        fx.add_local("RoadBuilder", "RoadBuilder.dll", b"MZ old");
        fx.add_pdx(146, 9, "RoadBuilder.dll");
        let installed = mods::scan(&fx.user()).mods;

        let (plan, sources) = build_plan(&x, &fx.user(), "RoadBuilder-146-0-5-3-1712345678.zip", &installed, Some("123".into()), false).unwrap();
        let code: Vec<&PlanItem> = plan.items.iter().filter(|i| i.kind == "code").collect();
        assert_eq!(code.len(), 2, "{:?}", plan.items.iter().map(|i| &i.name).collect::<Vec<_>>());
        let rb = code.iter().find(|i| i.name == "RoadBuilder").unwrap();
        assert_ne!(rb.action, "install");
        assert!(rb.has_ui);
        assert!(rb.duplicate_of.is_some());
        let old = code.iter().find(|i| i.name == "OldTraffic").unwrap();
        assert!(old.bepinex);
        let save = plan.items.iter().find(|i| i.kind == "save").unwrap();
        assert_eq!(save.name, "Babaeski");
        assert!(plan.warnings.iter().any(|w| w.contains("winhttp.dll")));
        assert_eq!(sources.len(), 3);
    }

    #[test]
    fn commits_selected_items_without_overwriting() {
        let fx = fixture();
        let x = fx.root.join("x2");
        write(&x.join("MyTool.dll"), b"MZ");
        crate::saves::tests_support::write_cok(&{
            fs::create_dir_all(&x).unwrap();
            x.join("City.cok")
        }, "City");
        fs::create_dir_all(fx.game.saves_dir().join("123")).unwrap();
        fs::write(fx.game.saves_dir().join("123").join("City.cok"), b"user save").unwrap();
        let (plan, sources) = build_plan(&x, &fx.user(), "MyTool-55-1-0.zip", &[], Some("123".into()), false).unwrap();
        let code = plan.items.iter().find(|i| i.kind == "code").unwrap();
        assert_eq!(code.target_name, "MyTool");
        let r = commit(&fx.game, &plan, &sources, &Options::default()).unwrap();
        assert_eq!(r.installed.len(), 2);
        let tool = fx.game.local_mods_dir().join("MyTool");
        assert!(tool.join("MyTool.dll").is_file());
        assert!(!tool.join("City.cok").exists(), "kayıt mod klasörüne kopyalanmamalı");
        assert_eq!(fs::read(fx.game.saves_dir().join("123").join("City.cok")).unwrap(), b"user save", "kullanıcının kaydı ezilmemeli");
        assert!(fx.game.saves_dir().join("123").join("City (2).cok").is_file());
        assert!(fx.game.saves_dir().join("123").join("City (2).cok.cid").is_file());
    }
}
