//! Bannerlord komutları. Hepsi `bannerlord_` önekiyle adlandırılır; kabuk öneke bakıp bu tabloya
//! yönlendirir. Otağ'daki komutların karşılıkları (`overview` → `bannerlord_overview` …).
//! Genel işler (ayarlar, Nexus anahtarı, nxm kaydı, görev listesi) kabuktadır.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use futures_util::stream::{self, StreamExt};
use modstead_core::intake::Origin;
use modstead_core::prelude::*;
use modstead_core::security::{defender, motw};
use modstead_core::{fsx, github, nexus};
use serde::Serialize;
use tauri::State;

use crate::detect::{self, GameDirs};
use crate::install::{self, ConfirmOptions, InstallRecord, InstallSource, backups};
use crate::launcher::launch::{self, LaunchOptions};
use crate::modules::sort::{self, ModEntry};
use crate::modules::submodule::{DepKind, Location, ModuleInfo};
use crate::modules::validate::Issue;
use crate::modules::version::is_newer;
use crate::profiles::{self, Profile};
use crate::settings::{BannerlordSettings, SettingsPatch};
use crate::state::{Bannerlord, Snapshot};
use crate::{ID, NEXUS, modules, steam};

type Game<'a> = State<'a, Arc<Bannerlord>>;

// ───────────────────────────── Genel bakış ─────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub game: Option<GameDirs>,
    pub game_error: Option<String>,
    pub game_running: bool,
    pub modules: Vec<ModuleInfo>,
    pub shadowed: Vec<ModuleInfo>,
    pub order: Vec<ModEntry>,
    pub issues: Vec<Issue>,
    pub installs: HashMap<String, InstallRecord>,
    pub defender_available: bool,
}

fn build_overview(game: &Bannerlord, refresh: bool) -> Overview {
    let snap = if refresh { game.refresh() } else { game.current() };
    let defender_available = defender::available();
    match snap {
        Err(e) => Overview {
            game: None,
            game_error: Some(e.to_string()),
            game_running: detect::is_running(),
            modules: Vec::new(),
            shadowed: Vec::new(),
            order: Vec::new(),
            issues: Vec::new(),
            installs: HashMap::new(),
            defender_available,
        },
        Ok(snap) => {
            let order = Bannerlord::saved_order(&snap);
            let issues = Bannerlord::issues_for(&order, &snap);
            Overview {
                game_running: detect::is_running(),
                modules: snap.catalog.effective.clone(),
                shadowed: snap.catalog.shadowed.clone(),
                order,
                issues,
                installs: game.installs(),
                game: Some(snap.game.clone()),
                game_error: None,
                defender_available,
            }
        }
    }
}

/// Değişiklikten sonra: taramayı yenile, ana sayfa kartını tazele.
fn changed(game: &Bannerlord) -> Overview {
    let o = build_overview(game, true);
    game.services.game_changed(ID);
    o
}

#[tauri::command]
pub async fn bannerlord_overview(game: Game<'_>, refresh: bool) -> AppResult<Overview> {
    Ok(build_overview(&game, refresh))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameView {
    pub root: Option<String>,
    pub version: Option<String>,
    pub modules_dir: Option<String>,
    pub workshop_dir: Option<String>,
    pub launcher_data: String,
    pub modules: u32,
    pub enabled: u32,
    pub running: bool,
}

/// Oyun klasörü, sürüm, Modules ve Workshop klasörleri, modül sayıları.
#[tauri::command]
pub async fn bannerlord_game(game: Game<'_>) -> AppResult<GameView> {
    let snap = game.current().ok();
    let order = snap.as_ref().map(Bannerlord::saved_order).unwrap_or_default();
    let community = |id: &str| snap.as_ref().and_then(|s| s.catalog.get(id)).is_some_and(|m| !m.is_official);
    Ok(GameView {
        root: snap.as_ref().map(|s| s.game.root.clone()),
        version: snap.as_ref().map(|s| s.game.version.clone()).filter(|v| !v.is_empty()),
        modules_dir: snap.as_ref().map(|s| s.game.modules_dir.clone()),
        workshop_dir: snap.as_ref().and_then(|s| s.game.workshop_dir.clone()),
        launcher_data: detect::launcher_data(&game.services.paths.documents).to_string_lossy().into_owned(),
        modules: snap.as_ref().map(|s| s.catalog.effective.iter().filter(|m| !m.is_official).count() as u32).unwrap_or(0),
        enabled: order.iter().filter(|e| e.enabled && community(&e.id)).count() as u32,
        running: detect::is_running(),
    })
}

#[tauri::command]
pub async fn bannerlord_validate_order(game: Game<'_>, order: Vec<ModEntry>) -> AppResult<Vec<Issue>> {
    let snap = game.current()?;
    let order = modules::normalize_order(&snap.catalog, &order);
    Ok(Bannerlord::issues_for(&order, &snap))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SortResult {
    pub order: Vec<ModEntry>,
    pub changed: bool,
    pub issues: Vec<Issue>,
}

#[tauri::command]
pub async fn bannerlord_sort_order(game: Game<'_>, order: Vec<ModEntry>) -> AppResult<SortResult> {
    let snap = game.current()?;
    let order = modules::normalize_order(&snap.catalog, &order);
    let out = sort::sort(&order, &snap.catalog.map());
    let issues = Bannerlord::issues_for(&out.order, &snap);
    Ok(SortResult { order: out.order, changed: out.changed, issues })
}

#[tauri::command]
pub async fn bannerlord_save_order(game: Game<'_>, order: Vec<ModEntry>) -> AppResult<Overview> {
    let _g = game.write_lock.lock().await;
    let snap = game.current()?;
    let order = modules::normalize_order(&snap.catalog, &order);
    game.write_order(&snap, &order)?;
    let o = build_overview(&game, false);
    game.services.game_changed(ID);
    Ok(o)
}

/// Sırayı yazar ve oyunu doğrudan (`_MODULES_` argümanıyla) başlatır.
pub async fn launch_with(game: &Bannerlord, order: Option<Vec<ModEntry>>, options: LaunchOptions) -> AppResult<()> {
    let _g = game.write_lock.lock().await;
    let snap = game.refresh()?;
    let order = match order {
        Some(o) => {
            let o = modules::normalize_order(&snap.catalog, &o);
            game.write_order(&snap, &o)?;
            o
        }
        None => Bannerlord::saved_order(&snap),
    };
    let ids: Vec<String> = order.iter().filter(|e| e.enabled).map(|e| e.id.clone()).collect();
    let mut opts = options;
    opts.use_blse = opts.use_blse && snap.game.blse.is_some();
    launch::launch(&snap.game, &ids, &opts)?;
    if game.settings().minimize_on_launch {
        use tauri::Manager;
        if let Some(w) = game.app().and_then(|a| a.get_webview_window("main")) {
            let _ = w.minimize();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn bannerlord_launch(game: Game<'_>, order: Vec<ModEntry>, options: LaunchOptions) -> AppResult<()> {
    launch_with(&game, Some(order), options).await
}

/// Elle seçilen oyun klasörünü unutur (otomatik bulmaya döner).
#[tauri::command]
pub async fn bannerlord_reset_game_folder(game: Game<'_>) -> AppResult<Overview> {
    let mut s = game.settings();
    s.game_path = None;
    game.save_settings(s)?;
    Ok(changed(&game))
}

// ───────────────────────────── Modül işlemleri ─────────────────────────────

fn find_module(snap: &Snapshot, id: &str) -> AppResult<ModuleInfo> {
    snap.catalog.get(id).cloned().ok_or_else(|| AppError::NotFound(format!("{} {id}", tr!("modül", "module"))))
}

/// Modül yolu oyunun Modules ya da Workshop klasörü içinde mi?
fn module_path_ok(game: &GameDirs, path: &Path) -> bool {
    fsx::is_within(Path::new(&game.modules_dir), path) || game.workshop_dir.as_deref().is_some_and(|w| fsx::is_within(Path::new(w), path))
}

#[tauri::command]
pub async fn bannerlord_unblock_module(game: Game<'_>, id: String) -> AppResult<Overview> {
    let _g = game.write_lock.lock().await;
    let snap = game.current()?;
    let m = find_module(&snap, &id)?;
    let path = PathBuf::from(&m.path);
    if !module_path_ok(&snap.game, &path) {
        return Err(AppError::security(tr!("modül klasörü beklenen yerde değil", "the module folder is not where expected")));
    }
    let n = tokio::task::spawn_blocking(move || motw::unblock_tree(&path)).await?;
    log::info!("{id}: {n} dosyanın engeli kaldırıldı");
    Ok(changed(&game))
}

#[tauri::command]
pub async fn bannerlord_unblock_all(game: Game<'_>) -> AppResult<Overview> {
    let _g = game.write_lock.lock().await;
    let snap = game.current()?;
    let targets: Vec<PathBuf> =
        snap.catalog.effective.iter().filter(|m| m.blocked_dll_count() > 0).map(|m| PathBuf::from(&m.path)).filter(|p| module_path_ok(&snap.game, p)).collect();
    tokio::task::spawn_blocking(move || targets.iter().map(|p| motw::unblock_tree(p)).sum::<usize>()).await?;
    Ok(changed(&game))
}

#[tauri::command]
pub async fn bannerlord_uninstall_module(game: Game<'_>, id: String) -> AppResult<Overview> {
    let _g = game.write_lock.lock().await;
    let snap = game.current()?;
    let m = find_module(&snap, &id)?;
    if m.location == Location::Workshop {
        return Err(AppError::msg(tr!(
            "Bu modül Steam Workshop'tan geliyor. Kaldırmak için Workshop sayfasında aboneliği iptal edin.",
            "This module comes from Steam Workshop. To remove it, unsubscribe on its Workshop page."
        )));
    }
    let g = snap.game.clone();
    let path = m.path.clone();
    tokio::task::spawn_blocking(move || install::apply::retire_module(&g, &Bannerlord::backups_dirs(&g)[0], &path, "uninstall")).await??;
    let mut installs = game.installs();
    installs.remove(&m.key());
    game.save_installs(&installs)?;
    Ok(changed(&game))
}

/// Yinelenen kopyalardan Modules klasöründekini yedeğe alır (Workshop'taki yeni sürüm devreye girer).
#[tauri::command]
pub async fn bannerlord_retire_copy(game: Game<'_>, path: String) -> AppResult<Overview> {
    let _g = game.write_lock.lock().await;
    let snap = game.current()?;
    let known = snap.catalog.effective.iter().chain(snap.catalog.shadowed.iter()).any(|m| m.path == path && m.location == Location::Modules);
    if !known {
        return Err(AppError::security(tr!("bilinmeyen modül yolu", "unknown module path")));
    }
    let g = snap.game.clone();
    tokio::task::spawn_blocking(move || install::apply::retire_module(&g, &Bannerlord::backups_dirs(&g)[0], &path, "duplicate")).await??;
    Ok(changed(&game))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleDetails {
    pub size: u64,
    pub files: u64,
    pub record: Option<InstallRecord>,
    pub backups: Vec<backups::BackupMeta>,
    pub dependents: Vec<String>,
}

#[tauri::command]
pub async fn bannerlord_module_details(game: Game<'_>, id: String) -> AppResult<ModuleDetails> {
    let snap = game.current()?;
    let m = find_module(&snap, &id)?;
    let path = PathBuf::from(&m.path);
    let (size, files) = tokio::task::spawn_blocking(move || fsx::dir_stats(&path)).await?;
    let dependents = snap
        .catalog
        .effective
        .iter()
        .filter(|o| o.deps.iter().any(|d| d.id.eq_ignore_ascii_case(&m.id) && d.kind != DepKind::Incompatible))
        .map(|o| o.name.clone())
        .collect();
    Ok(ModuleDetails {
        size,
        files,
        record: game.installs().remove(&m.key()),
        backups: backups::list(&Bannerlord::backups_dirs(&snap.game)).into_iter().filter(|b| b.module_id.eq_ignore_ascii_case(&m.id)).collect(),
        dependents,
    })
}

/// Gezgin'de açar. Explorer bir GUI süreci; konsol penceresi açılmaz.
fn open_in_explorer(target: &std::ffi::OsStr) -> AppResult<()> {
    std::process::Command::new("explorer.exe").arg(target).spawn().map(|_| ()).map_err(|e| AppError::msg(format!("{}: {e}", tr!("açılamadı", "could not open"))))
}

#[tauri::command]
pub async fn bannerlord_open_path(game: Game<'_>, kind: String, id: Option<String>) -> AppResult<()> {
    let snap = game.current()?;
    let path: PathBuf = match kind.as_str() {
        "module" => {
            let m = find_module(&snap, id.as_deref().unwrap_or(""))?;
            let p = PathBuf::from(&m.path);
            if !module_path_ok(&snap.game, &p) {
                return Err(AppError::security(tr!("modül klasörü beklenen yerde değil", "the module folder is not where expected")));
            }
            p
        }
        "game" => PathBuf::from(&snap.game.root),
        "modules" => PathBuf::from(&snap.game.modules_dir),
        "configs" => PathBuf::from(&snap.game.configs_dir),
        "backups" => {
            let p = Bannerlord::backups_dirs(&snap.game).remove(0);
            std::fs::create_dir_all(&p)?;
            p
        }
        "data" => game.data_dir(),
        _ => return Err(AppError::msg(tr!("bilinmeyen klasör", "unknown folder"))),
    };
    if !path.is_dir() {
        return Err(AppError::NotFound(path.to_string_lossy().into_owned()));
    }
    open_in_explorer(path.as_os_str())
}

// ───────────────────────────── Yedekler ─────────────────────────────

#[tauri::command]
pub async fn bannerlord_list_backups(game: Game<'_>) -> AppResult<Vec<backups::BackupMeta>> {
    let snap = game.current()?;
    let dirs = Bannerlord::backups_dirs(&snap.game);
    Ok(tokio::task::spawn_blocking(move || backups::list(&dirs)).await?)
}

#[tauri::command]
pub async fn bannerlord_restore_backup(game: Game<'_>, id: String) -> AppResult<Overview> {
    let _g = game.write_lock.lock().await;
    let snap = game.current()?;
    if detect::is_running() {
        return Err(AppError::GameRunning(crate::INFO.name.into()));
    }
    let dirs = Bannerlord::backups_dirs(&snap.game);
    let modules_dir = PathBuf::from(&snap.game.modules_dir);
    tokio::task::spawn_blocking(move || backups::restore(&dirs, &id, &modules_dir)).await??;
    Ok(changed(&game))
}

#[tauri::command]
pub async fn bannerlord_delete_backup(game: Game<'_>, id: String) -> AppResult<()> {
    let snap = game.current()?;
    let dirs = Bannerlord::backups_dirs(&snap.game);
    tokio::task::spawn_blocking(move || backups::delete(&dirs, &id)).await?
}

// ───────────────────────────── Profiller ─────────────────────────────

#[tauri::command]
pub async fn bannerlord_list_profiles(game: Game<'_>) -> AppResult<Vec<Profile>> {
    Ok(profiles::load(&game.profiles_path()).profiles)
}

#[tauri::command]
pub async fn bannerlord_save_profile(game: Game<'_>, id: Option<String>, name: String, order: Vec<ModEntry>) -> AppResult<Profile> {
    let snap = game.current()?;
    let order = modules::normalize_order(&snap.catalog, &order);
    let entries = profiles::to_entries(&order, |id| snap.catalog.get(id).map(|m| m.version.clone()).unwrap_or_default());
    profiles::upsert(&game.profiles_path(), id.as_deref(), &name, entries)
}

#[tauri::command]
pub async fn bannerlord_rename_profile(game: Game<'_>, id: String, name: String) -> AppResult<()> {
    profiles::rename(&game.profiles_path(), &id, &name)
}

#[tauri::command]
pub async fn bannerlord_delete_profile(game: Game<'_>, id: String) -> AppResult<()> {
    profiles::delete(&game.profiles_path(), &id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedProfile {
    pub order: Vec<ModEntry>,
    pub missing: Vec<String>,
    pub issues: Vec<Issue>,
}

#[tauri::command]
pub async fn bannerlord_apply_profile(game: Game<'_>, id: String) -> AppResult<AppliedProfile> {
    let snap = game.current()?;
    let p = profiles::get(&game.profiles_path(), &id)?;
    let missing: Vec<String> = p.modules.iter().filter(|e| e.enabled && snap.catalog.get(&e.id).is_none()).map(|e| e.id.clone()).collect();
    let wanted: Vec<ModEntry> = p.modules.iter().map(|e| ModEntry { id: e.id.clone(), enabled: e.enabled }).collect();
    let order = modules::normalize_order(&snap.catalog, &wanted);
    let issues = Bannerlord::issues_for(&order, &snap);
    Ok(AppliedProfile { order, missing, issues })
}

#[tauri::command]
pub async fn bannerlord_export_profile(game: Game<'_>, id: String) -> AppResult<String> {
    profiles::export(&profiles::get(&game.profiles_path(), &id)?)
}

#[tauri::command]
pub async fn bannerlord_import_profile(game: Game<'_>, text: String) -> AppResult<Profile> {
    profiles::import(&game.profiles_path(), &text)
}

// ───────────────────────────── Oyuna özel ayarlar ─────────────────────────────

#[tauri::command]
pub async fn bannerlord_get_settings(game: Game<'_>) -> AppResult<BannerlordSettings> {
    Ok(game.settings())
}

#[tauri::command]
pub async fn bannerlord_update_settings(game: Game<'_>, patch: SettingsPatch) -> AppResult<BannerlordSettings> {
    let mut s = game.settings();
    s.apply(patch);
    game.save_settings(s.clone())?;
    Ok(s)
}

// ───────────────────────────── Nexus & GitHub ─────────────────────────────

#[tauri::command]
pub async fn bannerlord_nexus_search(game: Game<'_>, query: String, sort: String, offset: u32) -> AppResult<nexus::SearchPage> {
    let q: String = query.chars().take(100).collect();
    nexus::search(&game.services.http, NEXUS, &q, &sort, offset, 24, game.services.settings().show_adult).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusModPage {
    #[serde(flatten)]
    pub detail: nexus::NexusModDetail,
    pub files: Vec<nexus::NexusFile>,
}

#[tauri::command]
pub async fn bannerlord_nexus_mod(game: Game<'_>, mod_id: u64) -> AppResult<NexusModPage> {
    let http = &game.services.http;
    let (detail, files) = tokio::join!(nexus::get_mod(http, NEXUS, mod_id), nexus::files(http, NEXUS, mod_id));
    Ok(NexusModPage { detail: detail?, files: files? })
}

#[tauri::command]
pub async fn bannerlord_github_repo(game: Game<'_>, repo: String) -> AppResult<github::GhRepo> {
    github::repo(&game.services.http, &repo).await
}

// ───────────────────────────── Kurulum ─────────────────────────────

#[tauri::command]
pub async fn bannerlord_install_nexus(game: Game<'_>, mod_id: u64, file_id: u64) -> AppResult<JobSnapshot> {
    Ok(install::spawn(&game, &format!("Nexus #{mod_id}"), "nexus", Origin::Nexus { game: NEXUS, mod_id, file_id, nxm: None }))
}

#[tauri::command]
pub async fn bannerlord_install_github(game: Game<'_>, repo: String, release_id: Option<u64>, asset_id: u64) -> AppResult<JobSnapshot> {
    let repo = github::normalize_repo(&repo).ok_or_else(|| AppError::msg(tr!("geçersiz GitHub deposu", "invalid GitHub repository")))?;
    Ok(install::spawn(&game, &repo.clone(), "github", Origin::Github { repo, release_id, asset_id }))
}

fn is_archive_name(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| matches!(e.to_ascii_lowercase().as_str(), "zip" | "7z" | "rar"))
}

/// Yerel arşivleri kurar (dosya seçici ya da pencereye bırakma); her dosya bir görev.
pub fn install_local_paths(game: &Arc<Bannerlord>, paths: Vec<String>) -> AppResult<Vec<JobSnapshot>> {
    let mut jobs = Vec::new();
    for raw in paths.into_iter().filter(|p| p.len() < 1024 && !p.contains('\0')).take(32) {
        let path = PathBuf::from(&raw);
        if !is_archive_name(&path) || !path.is_file() {
            return Err(AppError::msg(tr!("yalnızca .zip, .7z ve .rar arşivleri kurulabilir", "only .zip, .7z and .rar archives can be installed")));
        }
        let title = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
        jobs.push(install::spawn(game, &title, "local", Origin::Local { path }));
    }
    Ok(jobs)
}

#[tauri::command]
pub async fn bannerlord_install_local(game: Game<'_>, paths: Vec<String>) -> AppResult<Vec<JobSnapshot>> {
    install_local_paths(&game, paths)
}

/// İnceleme penceresindeki "Kur" düğmesi.
#[tauri::command]
pub async fn bannerlord_confirm_job(game: Game<'_>, id: String, accept_risk: bool, options: Option<ConfirmOptions>) -> AppResult<JobSnapshot> {
    install::confirm(&game, &id, accept_risk, options.unwrap_or_default()).await
}

// ───────────────────────────── Güncellemeler ─────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateItem {
    pub module_id: String,
    pub name: String,
    pub current: String,
    pub latest: Option<String>,
    /// "nexus" | "github" | "steam" | "none"
    pub provider: String,
    /// "available" | "current" | "unknown" | "error" | "steam" | "steamPending"
    pub status: String,
    pub source_url: Option<String>,
    pub nexus_mod_id: Option<u64>,
    pub nexus_file_id: Option<u64>,
    pub github_repo: Option<String>,
    pub github_release_id: Option<u64>,
    pub github_asset_id: Option<u64>,
    pub github_asset_name: Option<String>,
    pub workshop_id: Option<String>,
    pub error: Option<String>,
}

async fn check_one(http: &modstead_core::http::Http, m: ModuleInfo, record: Option<InstallRecord>) -> UpdateItem {
    let mut item = UpdateItem {
        module_id: m.id.clone(),
        name: m.name.clone(),
        current: m.version.clone(),
        latest: None,
        provider: "none".into(),
        status: "unknown".into(),
        source_url: m.url.clone(),
        nexus_mod_id: None,
        nexus_file_id: None,
        github_repo: None,
        github_release_id: None,
        github_asset_id: None,
        github_asset_name: None,
        workshop_id: m.workshop_id.clone(),
        error: None,
    };
    if m.location == Location::Workshop {
        item.provider = "steam".into();
        item.status = "steam".into();
        item.source_url = m.workshop_id.as_ref().map(|w| format!("https://steamcommunity.com/sharedfiles/filedetails/?id={w}"));
        return item;
    }
    // Kaynak önceliği: kurulum kaydı → GitHub (SHA-256 doğrulamalı) → Nexus.
    let mut github_repo = None;
    let mut nexus_id = None;
    match record.map(|r| r.source) {
        Some(InstallSource::Github { repo, .. }) => github_repo = Some(repo),
        Some(InstallSource::Nexus { mod_id, .. }) => nexus_id = Some(mod_id),
        _ => {}
    }
    if github_repo.is_none() && nexus_id.is_none() {
        github_repo = m.update_sources.iter().find(|s| s.provider == "github").map(|s| s.value.clone());
        if github_repo.is_none() {
            nexus_id = m.update_sources.iter().find(|s| s.provider == "nexus").and_then(|s| s.value.parse().ok());
        }
    }
    if let Some(repo) = github_repo {
        item.provider = "github".into();
        item.source_url = Some(format!("https://github.com/{repo}"));
        item.github_repo = Some(repo.clone());
        match github::latest(http, &repo).await {
            Ok(Some(rel)) => {
                let latest = rel.tag.clone();
                item.status = if is_newer(&latest, &m.version) { "available" } else { "current" }.into();
                if let Some(a) = github::pick_asset(&rel, &m.id, &repo) {
                    item.github_asset_id = Some(a.id);
                    item.github_asset_name = Some(a.name.clone());
                }
                item.github_release_id = Some(rel.id);
                item.latest = Some(latest);
            }
            Ok(None) => item.status = "unknown".into(),
            Err(e) => {
                item.status = "error".into();
                item.error = Some(e.to_string());
            }
        }
        return item;
    }
    if let Some(id) = nexus_id {
        item.provider = "nexus".into();
        item.nexus_mod_id = Some(id);
        item.source_url = Some(nexus::mod_url(NEXUS, id));
        let (info, files) = tokio::join!(nexus::get_mod(http, NEXUS, id), nexus::files(http, NEXUS, id));
        match info {
            Ok(info) => {
                let latest = info.info.version.clone();
                item.status = if is_newer(&latest, &m.version) { "available" } else { "current" }.into();
                item.latest = Some(latest);
                if let Ok(files) = files {
                    item.nexus_file_id = files.iter().filter(|f| f.category == "MAIN").max_by_key(|f| (f.primary, f.date)).map(|f| f.file_id);
                }
            }
            Err(e) => {
                item.status = "error".into();
                item.error = Some(e.to_string());
            }
        }
    }
    item
}

#[tauri::command]
pub async fn bannerlord_check_updates(game: Game<'_>) -> AppResult<Vec<UpdateItem>> {
    let snap = game.current()?;
    let installs = game.installs();
    let http = game.services.http.clone();
    let mods: Vec<(ModuleInfo, Option<InstallRecord>)> =
        snap.catalog.effective.iter().filter(|m| !m.is_official).map(|m| (m.clone(), installs.get(&m.key()).cloned())).collect();
    let mut items: Vec<UpdateItem> = stream::iter(mods)
        .map(|(m, r)| {
            let h = http.clone();
            async move { check_one(&h, m, r).await }
        })
        .buffer_unordered(4)
        .collect()
        .await;

    // Workshop öğeleri: Steam'deki sürüm, indirilmiş olandan yeniyse Steam'in indirmesi bekleniyor.
    let ws_ids: Vec<String> = items.iter().filter_map(|i| i.workshop_id.clone()).collect();
    if !ws_ids.is_empty() {
        let local = steam::local_state(snap.game.workshop_dir.as_deref());
        if let Ok(details) = steam::details(&http, &ws_ids).await {
            let remote: HashMap<String, i64> =
                details.iter().filter_map(|d| Some((d["publishedfileid"].as_str()?.to_string(), d["time_updated"].as_i64()?))).collect();
            for item in items.iter_mut().filter(|i| i.provider == "steam") {
                let Some(id) = &item.workshop_id else { continue };
                if let (Some(r), Some(l)) = (remote.get(id), local.get(id)) {
                    if r > l {
                        item.status = "steamPending".into();
                    }
                }
            }
        }
    }

    let rank = |s: &str| match s {
        "available" | "steamPending" => 0,
        "error" => 1,
        "current" => 2,
        "unknown" => 3,
        _ => 4,
    };
    items.sort_by(|a, b| rank(&a.status).cmp(&rank(&b.status)).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    *game.updates.write().unwrap() = Some(items.iter().filter(|i| i.status == "available").count() as u32);
    game.services.game_changed(ID);
    Ok(items)
}

// ───────────────────────────── Logolar & Steam Workshop ─────────────────────────────

/// Modül anahtarı (küçük harfli Id) → logo adresi.
#[tauri::command]
pub async fn bannerlord_module_images(game: Game<'_>, refresh: bool) -> AppResult<HashMap<String, String>> {
    let snap = game.current()?;
    let installs = game.installs();
    Ok(game.images.resolve(&game.services.http, &snap.catalog, &installs, refresh).await)
}

/// Workshop öğesi kimliği → bu öğeden gelen modül Id'si (kurulu mu?).
fn workshop_modules(snap: &Snapshot) -> HashMap<String, String> {
    snap.catalog.effective.iter().chain(snap.catalog.shadowed.iter()).filter_map(|m| m.workshop_id.clone().map(|w| (w, m.id.clone()))).collect()
}

#[tauri::command]
pub async fn bannerlord_steam_lookup(game: Game<'_>, input: String) -> AppResult<steam::SteamLookup> {
    let snap = game.current()?;
    let installed = workshop_modules(&snap);
    let input: String = input.chars().take(300).collect();
    steam::lookup(&game.services.http, &input, snap.game.workshop_dir.as_deref(), &installed).await
}

/// Steam istemcisinde öğe sayfasını, Bannerlord Workshop'unu ya da indirmeleri açar.
#[tauri::command]
pub async fn bannerlord_steam_open(target: String, id: Option<String>) -> AppResult<()> {
    let url = steam::client_url(&target, id.as_deref())?;
    open_in_explorer(std::ffi::OsStr::new(&url))
        .map_err(|_| AppError::msg(tr!("Steam açılamadı. Steam istemcisinin kurulu olduğundan emin olun.", "Could not open Steam. Make sure the Steam client is installed.")))
}
