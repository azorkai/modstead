//! SMAPI kurulumu. Resmî GitHub sürümü ortak kabul hattından geçer (izinli indirme, GitHub'ın
//! yayımladığı SHA-256 ile doğrulama, güvenli açma, içerik taraması, Defender). Ardından
//! `install.dat` (asıl dosyalar) ayrıca açılıp taranır ve görev inceleme penceresine düşer.
//! Onaydan sonra resmî kurucunun Windows'ta yaptığı adımlar birebir uygulanır:
//!   1. eski SMAPI dosyalarını kenara al, 2. install.dat içeriğini oyun klasörüne kopyala ("Mods" hariç),
//!   3. "Stardew Valley.deps.json" → "StardewModdingAPI.deps.json",
//!   4. yerleşik modları (ConsoleCommands, SaveBackup) kimliğe göre yerine koy, kapalıysa kapalı bırak.
//! Resmî kurucu (.exe) asla çalıştırılmaz. Kurulum bütünseldir: bir adım başarısız olursa eski dosyalar geri konur.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use modstead_core::intake::{self, Intake, IntakeRequest, Origin};
use modstead_core::prelude::*;
use modstead_core::security::content::{self, ContentPolicy};
use modstead_core::security::{self, EngineStatus, Finding, Severity, VerificationStatus, defender};
use modstead_core::{archive, fsx, github};
use serde::Serialize;
use serde_json::json;

use crate::install::Staged;
use crate::util::{move_path, remove_path};
use crate::{ID, INFO, Stardew, bail, detect, manifest, ops, scan};

pub const REPO: &str = "Pathoschild/SMAPI";

/// Resmî kurucunun kurulumdan önce kaldırdığı yollar (Windows'ta geçerli olanlar).
const OLD_PATHS: &[&str] = &[
    "StardewModdingAPI.deps.json",
    "StardewModdingAPI.dll",
    "StardewModdingAPI.exe",
    "StardewModdingAPI.exe.config",
    "StardewModdingAPI.pdb",
    "StardewModdingAPI.runtimeconfig.json",
    "StardewModdingAPI.xml",
    "smapi-internal",
    "steam_appid.txt",
    "Mods\\.cache",
    "Mods\\ErrorHandler",
    "Mods\\TrainerMod",
    "Mono.Cecil.Rocks.dll",
    "StardewModdingAPI-settings.json",
    "StardewModdingAPI.AssemblyRewriters.dll",
    "0Harmony.dll",
    "0Harmony.pdb",
    "Mono.Cecil.dll",
    "Newtonsoft.Json.dll",
    "StardewModdingAPI.config.json",
    "StardewModdingAPI.crash.marker",
    "StardewModdingAPI.metadata.json",
    "StardewModdingAPI.update.marker",
    "StardewModdingAPI.Toolkit.dll",
    "StardewModdingAPI.Toolkit.pdb",
    "StardewModdingAPI.Toolkit.xml",
    "StardewModdingAPI.Toolkit.CoreInterfaces.dll",
    "StardewModdingAPI.Toolkit.CoreInterfaces.pdb",
    "StardewModdingAPI.Toolkit.CoreInterfaces.xml",
    "StardewModdingAPI-x64.exe",
];
const BUNDLED_MODS: &[&str] = &["SMAPI.SaveBackup", "SMAPI.ConsoleCommands"];
const USER_CONFIG: &str = "smapi-internal\\config.user.json";
/// install.dat içinde olağan kod dosyaları: SMAPI'nin kendisi bir exe ile başlar.
const BUNDLE_POLICY: ContentPolicy = ContentPolicy { expected_code: &["dll", "exe"], info_ext: &[] };

pub struct SmapiStaged {
    pub intake: Intake,
    pub bundle: PathBuf,
    pub version: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SmapiPlan {
    pub kind: &'static str,
    pub version: String,
    pub installed_version: Option<String>,
    pub game_dir: Option<String>,
    pub files: u64,
    pub bundled_mods: Vec<String>,
    pub keeps_user_config: bool,
    pub release_url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SmapiInstallResult {
    pub version: Option<String>,
    pub output: Vec<String>,
}

/// `SMAPI-4.5.2-installer.zip` (geliştirici sürümü ve diğer platform dosyaları değil).
pub fn is_installer_asset(name: &str) -> bool {
    name.strip_prefix("SMAPI-")
        .and_then(|r| r.strip_suffix("-installer.zip"))
        .is_some_and(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_digit() || c == '.'))
}

fn find_install_dat(dir: &Path) -> Option<PathBuf> {
    walkdir::WalkDir::new(dir).max_depth(5).follow_links(false).into_iter().flatten().map(|e| e.into_path()).find(|p| {
        p.is_file()
            && p.file_name().is_some_and(|n| n.eq_ignore_ascii_case("install.dat"))
            && p.parent().and_then(|x| x.file_name()).is_some_and(|n| n.eq_ignore_ascii_case("windows"))
    })
}

/// Resmî kurucu paketinde beklenen kod dosyası mı? (kurucunun kendisi ve başlatma betikleri)
fn is_official_installer_file(path: &str) -> bool {
    let p = path.replace('\\', "/").to_ascii_lowercase();
    // Paket tek bir "SMAPI <sürüm> installer" klasörüyle gelir; onun dışındaki hiçbir şey olağan sayılmaz.
    let Some((top, inner)) = p.split_once('/') else { return false };
    top.starts_with("smapi ")
        && (inner.starts_with("internal/") || (!inner.contains('/') && (inner.ends_with(".bat") || inner.ends_with(".command") || inner.ends_with(".sh"))))
}

/// Görevi oluşturur ve hazırlığı arka planda başlatır.
pub fn start(game: &Stardew) -> AppResult<JobHandle> {
    game.ensure_game_closed()?;
    let game_dir = game.require_game_dir()?;
    let job = game.services.jobs.create(ID, "smapi", "SMAPI", "github");
    let (services, staging, j) = (game.services.clone(), game.staging_root(), job.clone());
    tauri::async_runtime::spawn(async move {
        if let Err(e) = prepare(&services, &staging, &game_dir, &j).await {
            j.fail(&e);
        }
    });
    Ok(job)
}

async fn prepare(services: &Arc<Services>, staging: &Path, game_dir: &Path, job: &JobHandle) -> AppResult<()> {
    job.stage(Stage::Resolving, tr!("En son SMAPI sürümü aranıyor", "Looking up the latest SMAPI release"));
    let release = github::latest(&services.http, REPO).await?.ok_or_else(|| AppError::NotFound(tr!("SMAPI sürümü", "SMAPI release").into()))?;
    let asset = release
        .assets
        .iter()
        .find(|a| is_installer_asset(&a.name))
        .ok_or_else(|| AppError::msg(tr!(format!("Sürüm {} için Windows kurucusu bulunamadı.", release.tag), format!("No Windows installer found for release {}.", release.tag))))?;
    let version = release.tag.trim_start_matches(['v', 'V']).to_string();
    job.set_title(format!("SMAPI {version}"));
    let request = IntakeRequest {
        origin: Origin::Github { repo: REPO.into(), release_id: Some(release.id), asset_id: asset.id },
        work_dir: intake::work_dir_for(staging, job),
        content: INFO.content,
        trusted: INFO.trusted_sources,
        known: INFO.known_sources,
        nexus_lookup: None,
    };
    let intake = intake::run(services, job, request).await?;
    match finish_prepare(services, game_dir, job, intake, version).await {
        Ok(()) => Ok(()),
        Err((work, e)) => {
            let _ = fsx::remove_dir(&work);
            Err(e)
        }
    }
}

async fn finish_prepare(services: &Arc<Services>, game_dir: &Path, job: &JobHandle, mut intake: Intake, version: String) -> Result<(), (PathBuf, AppError)> {
    let work = intake.work_dir.clone();
    let fail = |e: AppError| (work.clone(), e);
    job.stage(Stage::Analyzing, tr!("SMAPI paketi açılıyor", "Extracting the SMAPI package"));
    let dat = find_install_dat(&intake.extract_dir).ok_or_else(|| fail(AppError::msg(tr!("install.dat arşivde bulunamadı. Antivirüs silmiş olabilir.", "install.dat was not found in the archive. An antivirus may have removed it."))))?;
    let bundle = work.join("bundle");
    {
        let (d, b, j) = (dat.clone(), bundle.clone(), job.clone());
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let kind = archive::detect(&d)?;
            archive::extract(&d, kind, &b, &j).map(|_| ())
        })
        .await
        .map_err(|e| fail(e.into()))?
        .map_err(fail)?;
    }
    if !bundle.join(detect::SMAPI_EXE).is_file() || !bundle.join("smapi-internal").is_dir() {
        return Err(fail(AppError::msg(tr!(
            "SMAPI paketi eksik görünüyor (StardewModdingAPI.exe ya da smapi-internal yok). Antivirüs dosyaları silmiş olabilir.",
            "The SMAPI package looks incomplete (StardewModdingAPI.exe or smapi-internal is missing). An antivirus may have removed files."
        ))));
    }

    // install.dat'ın içi de taranır: oyun klasörüne kopyalanacak olan budur.
    job.stage(Stage::Scanning, tr!("SMAPI dosyaları denetleniyor", "Inspecting SMAPI files"));
    let inner = {
        let b = bundle.clone();
        tokio::task::spawn_blocking(move || content::scan(&b, &BUNDLE_POLICY)).await.map_err(|e| fail(e.into()))?
    };
    let settings = services.settings();
    if settings.require_scan {
        let result = defender::scan(&bundle).await;
        if result.status == EngineStatus::Threat {
            return Err(fail(AppError::security(format!(
                "{} {}",
                tr!("Microsoft Defender SMAPI dosyalarında tehdit buldu, kurulum durduruldu.", "Microsoft Defender found a threat in the SMAPI files; installation stopped."),
                result.detail.replace('\n', " · ")
            ))));
        }
    }

    let report = &mut intake.report;
    let official = report.verification.status == VerificationStatus::Verified;
    if official {
        // Özeti GitHub'la eşleşen resmî pakette kurucunun kendi dosyaları olağandır; hiçbiri çalıştırılmaz.
        for f in report.findings.iter_mut() {
            if matches!(f.code.as_str(), "executable" | "script") && f.path.as_deref().is_some_and(is_official_installer_file) {
                f.severity = Severity::Info;
                f.code = "smapi-installer".into();
            }
        }
        for c in report.code_files.iter_mut() {
            if is_official_installer_file(&c.path) {
                c.expected = true;
            }
        }
        report.findings.push(Finding {
            severity: Severity::Info,
            code: "smapi-official".into(),
            title: tr!("Resmî SMAPI kurucusu", "Official SMAPI installer").into(),
            detail: tr!(
                "Kurucu çalıştırılmaz: Modstead install.dat içeriğini ayrıca tarar ve kurulum adımlarını kendisi uygular.",
                "The installer is never run: Modstead scans the contents of install.dat separately and performs the install steps itself."
            )
            .into(),
            path: None,
        });
    }
    for mut f in inner.findings {
        f.path = f.path.map(|p| format!("install.dat/{p}"));
        report.findings.push(f);
    }
    for mut c in inner.code_files {
        c.path = format!("install.dat/{}", c.path);
        report.code_files.push(c);
    }
    report.scanned_files += inner.files;
    report.total_size += inner.size;
    security::finalize(report, &settings.security_policy());

    let bundled_mods = fs::read_dir(bundle.join("Mods"))
        .map(|rd| rd.flatten().filter_map(|e| manifest::read_manifest(&e.path().join("manifest.json")).ok()).filter_map(|m| m.name).collect())
        .unwrap_or_default();
    let plan = SmapiPlan {
        kind: "smapi",
        installed_version: detect::smapi_info(game_dir).version,
        game_dir: Some(game_dir.to_string_lossy().into_owned()),
        files: inner.files,
        bundled_mods,
        keeps_user_config: game_dir.join(USER_CONFIG).is_file(),
        release_url: intake.source_url.clone(),
        version: version.clone(),
    };
    let message = match &plan.installed_version {
        Some(cur) => tr!(format!("SMAPI {cur} → {version} güncellemeye hazır"), format!("SMAPI {cur} → {version} is ready to update")),
        None => tr!(format!("SMAPI {version} kurulmaya hazır"), format!("SMAPI {version} is ready to install")),
    };
    let snapshot_report = intake.report.clone();
    let plan_json = serde_json::to_value(&plan).map_err(|e| fail(e.into()))?;
    job.set_staged(Staged::Smapi(SmapiStaged { intake, bundle, version }));
    job.review(message, Some(snapshot_report), plan_json);
    Ok(())
}

/// Onaydan sonra kurulumu yapar.
pub fn commit(game: &Stardew, staged: &SmapiStaged) -> AppResult<SmapiInstallResult> {
    let _lock = game.ops_lock.lock().unwrap();
    game.ensure_game_closed()?;
    let game_dir = game.require_game_dir()?;
    let output = install_bundle(&staged.bundle, &game_dir, &staged.intake.work_dir.join("old"))?;
    let info = detect::smapi_info(&game_dir);
    if !info.installed {
        bail!("Kurulum tamamlandı ama StardewModdingAPI.exe bulunamadı.", "Installation finished but StardewModdingAPI.exe was not found.");
    }
    // Eski güncelleme önbelleği "SMAPI güncel değil" demesin.
    let _ = fs::remove_file(game.data_file("update-cache.json"));
    let version = info.version.clone().unwrap_or_else(|| staged.version.clone());
    let _ = ops::record(game, "smapi", tr!(format!("SMAPI {version} kuruldu"), format!("SMAPI {version} installed")), output.clone(), vec![]);
    Ok(SmapiInstallResult { version: info.version, output })
}

/// Açılmış SMAPI paketini (install.dat içeriği) oyun klasörüne kurar.
pub fn install_bundle(bundle: &Path, game_dir: &Path, work: &Path) -> AppResult<Vec<String>> {
    let mut log = Vec::new();
    if !bundle.join(detect::SMAPI_EXE).is_file() || !bundle.join("smapi-internal").is_dir() {
        bail!(
            "SMAPI paketi eksik görünüyor (StardewModdingAPI.exe ya da smapi-internal yok). Antivirüs dosyaları silmiş olabilir.",
            "The SMAPI package looks incomplete (StardewModdingAPI.exe or smapi-internal is missing). An antivirus may have removed files."
        );
    }
    if !detect::is_game_dir(game_dir) {
        return Err(AppError::GameNotFound(INFO.name.into()));
    }
    let deps = game_dir.join("Stardew Valley.deps.json");
    if !deps.is_file() {
        bail!(
            "'Stardew Valley.deps.json' bulunamadı; oyun dosyaları eksik olabilir (Steam'de dosya bütünlüğünü doğrulayın).",
            "'Stardew Valley.deps.json' was not found; game files may be missing (verify file integrity in Steam)."
        );
    }

    let user_config = fs::read(game_dir.join(USER_CONFIG)).ok();
    let backup = work.join("eski-smapi");
    fs::create_dir_all(&backup)?;
    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();

    let result = (|| -> AppResult<()> {
        // 1. Eski dosyaları kenara al (başarısızlıkta geri konacak).
        for rel in OLD_PATHS {
            let src = game_dir.join(rel);
            if src.exists() {
                let dst = backup.join(rel);
                move_path(&src, &dst)?;
                moved.push((src, dst));
            }
        }
        if !moved.is_empty() {
            let n = moved.len();
            log.push(tr!(format!("Eski SMAPI dosyaları kaldırıldı ({n} öğe)."), format!("Removed old SMAPI files ({n} items).")));
        }

        // 2. Paket içeriğini kopyala ("Mods" ve macOS bağlantısı hariç).
        for entry in fs::read_dir(bundle)?.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.eq_ignore_ascii_case("Mods") || name == "mcs" {
                continue;
            }
            let target = game_dir.join(&name);
            if entry.path().is_dir() {
                if target.exists() {
                    fsx::remove_dir(&target)?;
                }
                fsx::copy_dir(&entry.path(), &target, |_| {})?;
            } else {
                fs::copy(entry.path(), &target)?;
            }
        }
        log.push(tr!("SMAPI dosyaları oyun klasörüne kopyalandı.", "Copied SMAPI files into the game folder.").into());

        // 3. deps.json
        fs::copy(&deps, game_dir.join("StardewModdingAPI.deps.json"))?;

        // 4. Yerleşik modlar: var olan kopyayı (kapalı olsa bile) kimliğe göre bul ve yerine koy.
        let bundle_mods = bundle.join("Mods");
        if bundle_mods.is_dir() {
            let mods_dir = detect::mods_dir(game_dir);
            fs::create_dir_all(&mods_dir)?;
            let installed = scan::scan_mods(&mods_dir).mods;
            for entry in fs::read_dir(&bundle_mods)?.flatten() {
                let from = entry.path();
                let Ok(m) = manifest::read_manifest(&from.join("manifest.json")) else { continue };
                let Some(id) = m.unique_id.filter(|id| BUNDLED_MODS.iter().any(|b| b.eq_ignore_ascii_case(id))) else { continue };
                let target = installed
                    .iter()
                    .find(|x| x.unique_id.as_deref().is_some_and(|u| u.eq_ignore_ascii_case(&id)))
                    .and_then(|x| fsx::resolve_under(&mods_dir, &x.folder).ok())
                    .unwrap_or_else(|| mods_dir.join(entry.file_name()));
                if target.exists() {
                    fsx::remove_dir(&target)?;
                }
                fsx::copy_dir(&from, &target, |_| {})?;
                let name = target.file_name().unwrap_or_default().to_string_lossy().into_owned();
                log.push(tr!(format!("Yerleşik mod güncellendi: {name}"), format!("Updated bundled mod: {name}")));
            }
        }

        // Kullanıcının SMAPI ayarlarını geri koy.
        if let Some(cfg) = &user_config {
            fs::write(game_dir.join(USER_CONFIG), cfg)?;
            log.push(tr!("SMAPI kullanıcı ayarları (config.user.json) korundu.", "Kept SMAPI user settings (config.user.json).").into());
        }
        Ok(())
    })();

    if let Err(e) = result {
        // Geri al: yarım kopyalanan yeni dosyaları kaldır, eskileri geri koy.
        for rel in OLD_PATHS {
            let p = game_dir.join(rel);
            if p.exists() && !moved.iter().any(|(src, _)| src == &p) {
                let _ = remove_path(&p);
            }
        }
        for (src, dst) in moved.iter().rev() {
            if src.exists() {
                let _ = remove_path(src);
            }
            let _ = move_path(dst, src);
        }
        return Err(AppError::msg(tr!(format!("SMAPI kurulamadı, önceki durum geri yüklendi: {e}"), format!("SMAPI could not be installed; the previous state was restored: {e}"))));
    }
    let _ = fsx::remove_dir(&backup);
    Ok(log)
}

/// Önizleme ve testler için plan örneği.
pub fn sample_plan() -> serde_json::Value {
    json!({ "kind": "smapi", "version": "4.5.2", "installedVersion": null, "gameDir": null, "files": 0, "bundledMods": [], "keepsUserConfig": false, "releaseUrl": null })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::TempDir;

    fn write(p: &Path, s: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, s).unwrap();
    }

    fn fake_bundle(root: &Path, version: &str) -> PathBuf {
        let b = root.join(format!("bundle-{version}"));
        write(&b.join("StardewModdingAPI.exe"), version);
        write(&b.join("StardewModdingAPI.dll"), version);
        write(&b.join("smapi-internal/config.json"), "{}");
        write(&b.join("Mods/SaveBackup/manifest.json"), &format!(r#"{{"Name":"Save Backup","Author":"SMAPI","Version":"{version}","UniqueID":"SMAPI.SaveBackup","EntryDll":"SaveBackup.dll"}}"#));
        write(&b.join("Mods/ConsoleCommands/manifest.json"), &format!(r#"{{"Name":"Console Commands","Author":"SMAPI","Version":"{version}","UniqueID":"SMAPI.ConsoleCommands","EntryDll":"ConsoleCommands.dll"}}"#));
        b
    }

    fn fake_game(root: &Path) -> PathBuf {
        let g = root.join("game");
        write(&g.join("Stardew Valley.dll"), "");
        write(&g.join("Stardew Valley.deps.json"), "{\"deps\":1}");
        g
    }

    #[test]
    fn picks_the_player_installer_asset() {
        assert!(is_installer_asset("SMAPI-4.5.2-installer.zip"));
        assert!(!is_installer_asset("SMAPI-4.5.2-installer-for-developers.zip"));
        assert!(!is_installer_asset("SMAPI-x-installer.zip"));
    }

    #[test]
    fn recognises_official_installer_files() {
        assert!(is_official_installer_file("SMAPI 4.5.2 installer/internal/windows/SMAPI.Installer.exe"));
        assert!(is_official_installer_file("SMAPI 4.5.2 installer/install on Windows.bat"));
        assert!(!is_official_installer_file("SMAPI 4.5.2 installer/extra/evil.exe"));
    }

    #[test]
    fn installs_upgrades_and_preserves_user_config() {
        let d = TempDir::new();
        let game = fake_game(d.path());
        install_bundle(&fake_bundle(d.path(), "4.0.0"), &game, &d.path().join("w1")).unwrap();
        assert_eq!(fs::read_to_string(game.join("StardewModdingAPI.exe")).unwrap(), "4.0.0");
        assert_eq!(fs::read_to_string(game.join("StardewModdingAPI.deps.json")).unwrap(), "{\"deps\":1}");
        assert!(game.join("Mods/SaveBackup/manifest.json").is_file());

        // Kullanıcı ayarı ve kapalı yerleşik mod korunmalı.
        write(&game.join("smapi-internal/config.user.json"), "{\"user\":true}");
        fs::rename(game.join("Mods/ConsoleCommands"), game.join("Mods/.ConsoleCommands")).unwrap();
        write(&game.join("0Harmony.dll"), "eski");

        let log = install_bundle(&fake_bundle(d.path(), "4.5.2"), &game, &d.path().join("w2")).unwrap();
        assert!(!log.is_empty());
        assert_eq!(fs::read_to_string(game.join("StardewModdingAPI.exe")).unwrap(), "4.5.2");
        assert_eq!(fs::read_to_string(game.join("smapi-internal/config.user.json")).unwrap(), "{\"user\":true}");
        assert!(game.join("smapi-internal/config.json").is_file());
        assert!(!game.join("0Harmony.dll").exists(), "eski dosyalar kaldırılmalı");
        assert!(fs::read_to_string(game.join("Mods/.ConsoleCommands/manifest.json")).unwrap().contains("4.5.2"));
        assert!(!game.join("Mods/ConsoleCommands").exists(), "kapalı mod kapalı kalmalı");
    }

    #[test]
    fn rejects_incomplete_bundle_without_touching_game() {
        let d = TempDir::new();
        let game = fake_game(d.path());
        install_bundle(&fake_bundle(d.path(), "4.0.0"), &game, &d.path().join("w1")).unwrap();
        let broken = d.path().join("broken");
        write(&broken.join("StardewModdingAPI.exe"), "x");
        assert!(install_bundle(&broken, &game, &d.path().join("w2")).is_err());
        assert_eq!(fs::read_to_string(game.join("StardewModdingAPI.exe")).unwrap(), "4.0.0");
    }
}
