//! Cities: Skylines II komutları. Hepsi `cities2_` önekiyle adlandırılır (kabuk öneke göre yönlendirir).
//! Her komut girdisini doğrular; arayüzden gelen yollar `fsx::resolve_under` ile kilitlenir ve dosya
//! işleri arka plan iş parçacığında yürür.

use std::path::PathBuf;
use std::sync::Arc;

use modstead_core::prelude::*;
use modstead_core::security::{EngineResult, EngineStatus, defender};
use modstead_core::{download, fsx, platform};
use serde::Serialize;
use tauri::State;

use crate::detect::{self, LaunchTarget, PdxAccount};
use crate::health::{self, HealthReport};
use crate::logs::{self, LogReport};
use crate::mods::{self, ModScan};
use crate::ops::{self, TrashMeta};
use crate::paradox::MetaCache;
use crate::saves::{self, SaveBackup, SaveInfo};
use crate::{Cities2, Cities2Settings, ID, INFO, bail, install};

type Game<'a> = State<'a, Arc<Cities2>>;

async fn blocking<T: Send + 'static>(game: &Game<'_>, f: impl FnOnce(&Cities2) -> AppResult<T> + Send + 'static) -> AppResult<T> {
    let g = game.inner().clone();
    tokio::task::spawn_blocking(move || f(&g)).await?
}

// ───────────── Ortam ve ayarlar ─────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub label: String,
    pub path: String,
    pub free: Option<u64>,
    pub low: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchInfo {
    /// "steam" | "xbox" | "exe" | "none"
    pub kind: &'static str,
    /// Geliştirici kipi argümanları geçirilebiliyor mu (Steam ve doğrudan .exe).
    pub supports_options: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub game_path: Option<String>,
    pub store: Option<String>,
    pub version: Option<String>,
    pub user_dir: String,
    pub user_dir_exists: bool,
    pub default_user_dir: String,
    pub local_mods_dir: String,
    pub saves_dir: String,
    pub maps_dir: String,
    pub logs_dir: String,
    pub data_dir: String,
    pub default_data_dir: String,
    pub running: bool,
    pub account: PdxAccount,
    pub launch: LaunchInfo,
    pub disks: Vec<DiskInfo>,
    /// Oyun klasöründeki BepInEx kalıntıları.
    pub bepinex: Vec<String>,
    /// Oyun klasörü korumalı (Microsoft Store paketi).
    pub protected: bool,
}

fn environment(game: &Cities2) -> Environment {
    let dir = game.game_dir();
    let user = game.user_dir();
    let launch = match dir.as_deref().map(detect::launch_target) {
        Some(LaunchTarget::Steam) => LaunchInfo { kind: "steam", supports_options: true },
        Some(LaunchTarget::Package { .. }) => LaunchInfo { kind: "xbox", supports_options: false },
        Some(LaunchTarget::Exe(_)) => LaunchInfo { kind: "exe", supports_options: true },
        None => LaunchInfo { kind: "none", supports_options: false },
    };
    Environment {
        store: dir.as_deref().map(|d| detect::store_of(d).to_string()),
        version: detect::game_version(&user),
        bepinex: dir.as_deref().map(detect::bepinex_leftovers).unwrap_or_default(),
        protected: dir.as_deref().is_some_and(detect::is_protected_dir),
        game_path: dir.map(|d| d.to_string_lossy().into_owned()),
        user_dir_exists: user.is_dir(),
        default_user_dir: detect::default_user_dir().to_string_lossy().into_owned(),
        local_mods_dir: game.local_mods_dir().to_string_lossy().into_owned(),
        saves_dir: game.saves_dir().to_string_lossy().into_owned(),
        maps_dir: game.maps_dir().to_string_lossy().into_owned(),
        logs_dir: game.logs_dir().to_string_lossy().into_owned(),
        data_dir: game.data_root().to_string_lossy().into_owned(),
        default_data_dir: game.default_data_root().to_string_lossy().into_owned(),
        running: game.is_running(),
        account: detect::paradox_account(&user),
        disks: game.disks(),
        user_dir: user.to_string_lossy().into_owned(),
        launch,
    }
}

#[tauri::command]
pub async fn cities2_environment(game: Game<'_>) -> AppResult<Environment> {
    blocking(&game, |g| Ok(environment(g))).await
}

#[tauri::command]
pub fn cities2_settings_get(game: Game<'_>) -> Cities2Settings {
    game.settings()
}

#[tauri::command]
pub async fn cities2_settings_update(game: Game<'_>, settings: Cities2Settings) -> AppResult<Cities2Settings> {
    let clean = |p: Option<String>| p.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let (game_path, user_dir, data_dir) = (clean(settings.game_path.clone()), clean(settings.user_dir.clone()), clean(settings.data_dir.clone()));
    if let Some(p) = &game_path {
        if !detect::is_game_dir(&PathBuf::from(p)) {
            bail!("Seçilen klasörde Cities: Skylines II bulunamadı.", "Cities: Skylines II was not found in the chosen folder.");
        }
    }
    for p in [&user_dir, &data_dir].into_iter().flatten() {
        if !PathBuf::from(p).is_absolute() {
            bail!("Klasör yolu tam olmalı.", "The folder path must be absolute.");
        }
    }
    let s = game.update_settings(|s| {
        *s = Cities2Settings { game_path, user_dir, data_dir, save_backups_keep: settings.save_backups_keep.min(100), trash_retention_days: settings.trash_retention_days.min(365), ..settings };
    })?;
    game.services.game_changed(ID);
    Ok(s)
}

// ───────────── Modlar ─────────────

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub paradox: u32,
    pub local: u32,
    pub local_enabled: u32,
    pub code: u32,
    /// Oyunun bir sonraki açılışta indireceği güncellemeler (katalogdaki sürüm > diskteki sürüm).
    pub pending_updates: u32,
    pub stale_bytes: u64,
    pub size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(flatten)]
    pub scan: ModScan,
    pub game_version: Option<String>,
    pub counts: Counts,
    /// Paradox meta verisinin en eski çekilme zamanı (yoksa hiç çekilmemiş).
    pub meta_fetched_at: Option<i64>,
}

pub fn meta_cache(game: &Cities2) -> MetaCache {
    fsx::read_json(&game.cache_path("pdx-meta.json"))
}

/// Tarama + önbellekteki Paradox meta verisi (ağsız).
pub fn snapshot(game: &Cities2) -> Snapshot {
    let user = game.user_dir();
    let mut scan = mods::scan(&user);
    let cache = meta_cache(game);
    let mut oldest: Option<i64> = None;
    for m in scan.mods.iter_mut().filter(|m| m.source == "paradox") {
        if let Some(meta) = m.mod_id.as_ref().and_then(|id| cache.items.get(id)) {
            if !meta.name.is_empty() {
                m.name = meta.name.clone();
            }
            oldest = Some(oldest.map_or(meta.fetched_at, |o| o.min(meta.fetched_at)));
            m.meta = Some(meta.clone());
        }
    }
    let mut c = Counts::default();
    for m in &scan.mods {
        c.size += m.size;
        if m.kind == "code" {
            c.code += 1;
        }
        if m.source == "paradox" {
            c.paradox += 1;
            c.stale_bytes += m.stale.iter().map(|s| s.size).sum::<u64>();
            let local: Option<u32> = m.version.as_deref().and_then(|v| v.parse().ok());
            if let (Some(l), Some(latest)) = (local, m.meta.as_ref().and_then(|x| x.latest_version)) {
                if latest > l {
                    c.pending_updates += 1;
                }
            }
        } else {
            c.local += 1;
            if m.enabled {
                c.local_enabled += 1;
            }
        }
    }
    Snapshot { game_version: detect::game_version(&user), scan, counts: c, meta_fetched_at: oldest }
}

#[tauri::command]
pub async fn cities2_snapshot(game: Game<'_>) -> AppResult<Snapshot> {
    blocking(&game, |g| Ok(snapshot(g))).await
}

fn check_folders(folders: &[String]) -> AppResult<()> {
    if folders.is_empty() || folders.len() > 500 {
        bail!("Geçersiz seçim.", "Invalid selection.");
    }
    Ok(())
}

#[tauri::command]
pub async fn cities2_set_enabled(game: Game<'_>, folders: Vec<String>, enabled: bool) -> AppResult<u32> {
    check_folders(&folders)?;
    let n = blocking(&game, move |g| ops::set_enabled(g, &folders, enabled)).await?;
    game.services.game_changed(ID);
    Ok(n)
}

#[tauri::command]
pub async fn cities2_uninstall(game: Game<'_>, folders: Vec<String>) -> AppResult<Vec<TrashMeta>> {
    check_folders(&folders)?;
    let out = blocking(&game, move |g| {
        saves::backup_latest(g, "mod-change");
        ops::uninstall(g, &folders)
    })
    .await?;
    game.services.game_changed(ID);
    Ok(out)
}

#[tauri::command]
pub async fn cities2_list_trash(game: Game<'_>) -> AppResult<Vec<TrashMeta>> {
    blocking(&game, |g| Ok(ops::list_trash(g))).await
}

#[tauri::command]
pub async fn cities2_restore_trash(game: Game<'_>, id: String) -> AppResult<String> {
    let name = blocking(&game, move |g| ops::restore_trash(g, &id)).await?;
    game.services.game_changed(ID);
    Ok(name)
}

#[tauri::command]
pub async fn cities2_delete_trash(game: Game<'_>, id: Option<String>) -> AppResult<u32> {
    blocking(&game, move |g| ops::delete_trash(g, id.as_deref())).await
}

// ───────────── Sağlık ─────────────

pub fn health_report(game: &Cities2) -> HealthReport {
    let snap = snapshot(game);
    let user = game.user_dir();
    let dir = game.game_dir();
    let logs = logs::report(&user, &snap.scan.mods);
    let account = detect::paradox_account(&user);
    let bepinex = dir.as_deref().map(detect::bepinex_leftovers).unwrap_or_default();
    let low_disks = game.disks().into_iter().filter(|d| d.low).map(|d| (d.path, d.free.unwrap_or(0))).collect();
    let issues = health::analyze(&health::Input {
        scan: &snap.scan,
        game_version: snap.game_version.as_deref(),
        account: &account,
        game_found: dir.is_some(),
        bepinex: &bepinex,
        game_protected: dir.as_deref().is_some_and(detect::is_protected_dir),
        low_disks,
        logs: &logs,
    });
    HealthReport { score: health::score(&issues), issues, checked_at: fsx::now_ts(), game_version: snap.game_version, logs }
}

#[tauri::command]
pub async fn cities2_health(game: Game<'_>) -> AppResult<HealthReport> {
    let report = blocking(&game, |g| Ok(health_report(g))).await?;
    let n = report.problem_count();
    let before = *game.last_issues.lock().unwrap();
    game.set_last_issues(n);
    if before != Some(n) {
        game.services.game_changed(ID);
    }
    Ok(report)
}

/// Sağlık bulgusunun tek tık çözümü. Dönüş: kullanıcıya gösterilecek kısa sonuç.
#[tauri::command]
pub async fn cities2_fix(game: Game<'_>, action: String, folders: Option<Vec<String>>) -> AppResult<String> {
    let msg = blocking(&game, move |g| -> AppResult<String> {
        Ok(match action.as_str() {
            "clean-stale" => {
                let (n, bytes) = ops::clean_stale(g)?;
                tr!(format!("{n} eski sürüm silindi ({} MB boşaldı)", bytes / 1_048_576), format!("{n} old versions deleted ({} MB freed)", bytes / 1_048_576)).into()
            }
            "remove-known-bad" => {
                let n = ops::remove_known_bad(g)?;
                tr!(format!("{n} klasör silindi"), format!("{n} folders deleted")).into()
            }
            "remove-bepinex" => {
                let n = ops::remove_bepinex(g)?;
                tr!(format!("{n} BepInEx dosyası çöpe taşındı"), format!("{n} BepInEx files moved to trash")).into()
            }
            "disable-local" => {
                let folders = folders.unwrap_or_default();
                check_folders(&folders)?;
                let n = ops::set_enabled(g, &folders, false)?;
                tr!(format!("{n} yerel mod kapatıldı"), format!("{n} local mods disabled")).into()
            }
            _ => bail!("Bilinmeyen çözüm.", "Unknown fix."),
        })
    })
    .await?;
    game.services.game_changed(ID);
    Ok(msg)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScan {
    pub roots: Vec<String>,
    pub dlls: u32,
    /// Bilinen kötü amaçlı DLL özetleriyle eşleşen dosyalar.
    pub known_bad: Vec<String>,
    pub defender: Vec<EngineResult>,
    pub threat: bool,
    pub scanned_at: i64,
}

/// Kurulu bütün modları tarar: bilinen kötü amaçlı DLL özetleri + Microsoft Defender.
#[tauri::command]
pub async fn cities2_security_scan(game: Game<'_>) -> AppResult<SecurityScan> {
    let user = game.user_dir();
    let mut roots: Vec<PathBuf> = mods::pdx_roots(&user);
    let local = game.local_mods_dir();
    if local.is_dir() {
        roots.push(local);
    }
    let roots2 = roots.clone();
    let (dlls, known_bad) = tokio::task::spawn_blocking(move || {
        let bad: Vec<&str> = mods::KNOWN_BAD.iter().map(|b| b.2).collect();
        let (mut n, mut hits) = (0u32, Vec::new());
        for root in &roots2 {
            for e in walkdir::WalkDir::new(root).follow_links(false).max_depth(8).into_iter().flatten().take(50_000) {
                if e.file_type().is_file() && e.file_name().to_string_lossy().to_ascii_lowercase().ends_with(".dll") {
                    n += 1;
                    if let Ok(h) = download::sha256_file(e.path()) {
                        if bad.contains(&h.as_str()) {
                            hits.push(e.path().to_string_lossy().into_owned());
                        }
                    }
                }
            }
        }
        (n, hits)
    })
    .await?;
    let mut results = Vec::new();
    for root in &roots {
        results.push(defender::scan(root).await);
    }
    let threat = !known_bad.is_empty() || results.iter().any(|r| r.status == EngineStatus::Threat);
    Ok(SecurityScan { roots: roots.iter().map(|r| r.to_string_lossy().into_owned()).collect(), dlls, known_bad, defender: results, threat, scanned_at: fsx::now_ts() })
}

// ───────────── Kayıtlar ─────────────

#[tauri::command]
pub async fn cities2_list_saves(game: Game<'_>) -> AppResult<Vec<SaveInfo>> {
    blocking(&game, |g| Ok(saves::list(g))).await
}

/// Önizleme görseli (`data:image/png;base64,…`); kayıtta yoksa `None`.
#[tauri::command]
pub async fn cities2_save_preview(game: Game<'_>, id: String, large: Option<bool>) -> AppResult<Option<String>> {
    blocking(&game, move |g| Ok(saves::preview_png(g, &id, large.unwrap_or(false))?.map(|png| format!("data:image/png;base64,{}", saves::base64(&png))))).await
}

#[tauri::command]
pub async fn cities2_list_save_backups(game: Game<'_>) -> AppResult<Vec<SaveBackup>> {
    blocking(&game, |g| Ok(saves::list_backups(g))).await
}

#[tauri::command]
pub async fn cities2_backup_save(game: Game<'_>, id: String) -> AppResult<SaveBackup> {
    blocking(&game, move |g| saves::backup(g, &id, "manual")).await
}

#[tauri::command]
pub async fn cities2_restore_save(game: Game<'_>, id: String, backup: String) -> AppResult<()> {
    blocking(&game, move |g| saves::restore(g, &id, &backup)).await
}

#[tauri::command]
pub async fn cities2_delete_save_backup(game: Game<'_>, backup: String) -> AppResult<()> {
    blocking(&game, move |g| saves::delete_backup(g, &backup)).await
}

// ───────────── Günlükler ─────────────

#[tauri::command]
pub async fn cities2_logs(game: Game<'_>) -> AppResult<LogReport> {
    blocking(&game, |g| {
        let user = g.user_dir();
        let scan = mods::scan(&user);
        Ok(logs::report(&user, &scan.mods))
    })
    .await
}

#[tauri::command]
pub async fn cities2_read_log(game: Game<'_>, name: String) -> AppResult<String> {
    blocking(&game, move |g| logs::read(&g.user_dir(), &name)).await
}

// ───────────── Başlatma ve klasörler ─────────────

/// "Oyna": Steam'de geliştirici kipi seçenekleriyle `steam://run`, Microsoft Store'da paketin kısayolu,
/// elle seçilen kurulumda .exe doğrudan.
pub fn launch(game: &Cities2) -> AppResult<()> {
    if game.is_running() {
        bail!("Oyun zaten çalışıyor.", "The game is already running.");
    }
    let dir = game.game_dir().ok_or_else(|| AppError::GameNotFound(INFO.name.into()))?;
    let s = game.settings();
    let mut args: Vec<&str> = Vec::new();
    if s.developer_mode {
        args.push("--developerMode");
    }
    if s.ui_developer_mode {
        args.push("--uiDeveloperMode");
    }
    let fail = |e: std::io::Error| AppError::msg(format!("{}: {e}", tr!("Oyun başlatılamadı", "Could not start the game")));
    match detect::launch_target(&dir) {
        LaunchTarget::Steam => {
            let uri = if args.is_empty() { format!("steam://rungameid/{}", detect::STEAM_APP) } else { format!("steam://run/{}//{}/", detect::STEAM_APP, args.join("%20")) };
            platform::open_launch_uri(&uri).map_err(fail)?;
        }
        LaunchTarget::Package { family, app } => platform::open_launch_uri(&format!("shell:AppsFolder\\{family}!{app}")).map_err(fail)?,
        LaunchTarget::Exe(exe) => {
            if !exe.is_file() {
                return Err(AppError::GameNotFound(INFO.name.into()));
            }
            std::process::Command::new(&exe).args(&args).current_dir(&dir).spawn().map_err(fail)?;
        }
    }
    game.services.game_changed(ID);
    Ok(())
}

#[tauri::command]
pub async fn cities2_launch(game: Game<'_>) -> AppResult<()> {
    blocking(&game, launch).await
}

#[tauri::command]
pub async fn cities2_open_path(game: Game<'_>, kind: String, rel: Option<String>) -> AppResult<()> {
    blocking(&game, move |g| {
        let base = match kind.as_str() {
            "user" => g.user_dir(),
            "mods" => {
                let d = g.local_mods_dir();
                std::fs::create_dir_all(&d)?;
                d
            }
            "cache" => g.mods_cache_dir(),
            "saves" => g.saves_dir(),
            "maps" => g.maps_dir(),
            "logs" => g.logs_dir(),
            "data" => g.data_root(),
            "save-backups" => g.save_backups_dir(),
            "trash" => g.trash_dir(),
            "game" => {
                let d = g.game_dir().ok_or_else(|| AppError::GameNotFound(INFO.name.into()))?;
                if detect::is_protected_dir(&d) {
                    bail!("Microsoft Store kurulumunun klasörü korumalıdır; Gezgin'de açılamaz.", "The Microsoft Store installation folder is protected and can't be opened in Explorer.");
                }
                d
            }
            // Paradox önbelleğindeki bir mod klasörü: `rel` = `<id>_<sürüm>`.
            "pdx" => {
                let name = rel.clone().filter(|r| mods::parse_pdx_folder(r).is_some()).ok_or_else(|| AppError::msg(tr!("Geçersiz klasör.", "Invalid folder.")))?;
                let path = mods::pdx_roots(&g.user_dir()).into_iter().map(|r| r.join(&name)).find(|p| p.is_dir()).ok_or_else(|| AppError::NotFound(name.clone()))?;
                return open_dir(&path);
            }
            _ => bail!("Bilinmeyen klasör türü.", "Unknown folder kind."),
        };
        let target = match rel.filter(|r| !r.is_empty()) {
            Some(r) => fsx::resolve_under(&base, &r)?,
            None => base,
        };
        if !target.exists() {
            std::fs::create_dir_all(&target)?;
        }
        open_dir(&target)
    })
    .await
}

fn open_dir(target: &std::path::Path) -> AppResult<()> {
    if fsx::is_link(target) || !target.is_dir() {
        bail!("Yalnızca klasörler açılabilir.", "Only folders can be opened.");
    }
    // Gezgin bir GUI sürecidir; konsol penceresi açılmaz. Yalnızca doğrulanmış klasör yolu verilir.
    std::process::Command::new("explorer.exe").arg(target).spawn().map(|_| ()).map_err(|e| AppError::msg(format!("{}: {e}", tr!("Klasör açılamadı", "Could not open the folder"))))
}

// ───────────── Kurulum onayı ─────────────

#[tauri::command]
pub async fn cities2_confirm_job(game: Game<'_>, id: String, accept_risk: bool, options: Option<serde_json::Value>) -> AppResult<serde_json::Value> {
    let job = game.services.jobs.get(&id).ok_or_else(|| AppError::NotFound(tr!("görev", "task").into()))?;
    if job.game() != ID {
        bail!("Bu görev bu oyuna ait değil.", "This task doesn't belong to this game.");
    }
    blocking(&game, move |g| install::confirm(g, &job, accept_risk, options.unwrap_or(serde_json::Value::Null))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Bu bilgisayardaki gerçek kurulumla salt okunur deneme (oyun klasörlerine yazmaz; önizleme önbelleği
    /// geçici test klasörüne gider): `cargo test -p game-cities2 real_system -- --ignored --nocapture`
    /// `CS2_PREVIEW_OUT=<klasör>` verilirse en yeni kaydın önizlemesi oraya PNG olarak yazılır.
    #[test]
    #[ignore]
    fn real_system() {
        let game = Cities2::new(Services::for_tests());
        let env = environment(&game);
        println!("oyun: {:?} · {:?} · sürüm {:?} · başlatma {} · hesap {:?}", env.game_path, env.store, env.version, env.launch.kind, env.account);
        let snap = snapshot(&game);
        println!("modlar: {:?}", snap.counts.paradox + snap.counts.local);
        for m in snap.scan.mods.iter().take(10) {
            println!("  {} · {} · {:?}", m.key, m.name, m.version);
        }
        let saves = saves::list(&game);
        for s in saves.iter().take(8) {
            println!("kayıt: {} · {:?} · {:?} · {:?}", s.id, s.city_name, s.population, s.map_name);
        }
        if let (Some(first), Ok(out)) = (saves.first(), std::env::var("CS2_PREVIEW_OUT")) {
            for large in [true, false] {
                let png = saves::preview_png(&game, &first.id, large).unwrap().expect("önizleme");
                std::fs::write(PathBuf::from(&out).join(if large { "preview-large.png" } else { "preview-small.png" }), png).unwrap();
            }
        }
        let health = health_report(&game);
        println!("sağlık: {} puan", health.score);
        for i in &health.issues {
            println!("  [{}] {} — {}", i.severity, i.title, i.detail);
        }
        println!("günlük: {:?} · {:?} · çökme {}", health.logs.game_version, health.logs.gpu, health.logs.crashes);
    }
}
