//! Stardew Valley komutları. Hepsi `stardew_` önekiyle adlandırılır (kabuk öneke göre yönlendirir).
//! Her komut girdisini doğrular; arayüzden gelen yollar `fsx::resolve_under` ile kilitlenir ve
//! dosya işleri arka plan iş parçacığında yürür.

use std::path::PathBuf;
use std::sync::Arc;

use modstead_core::prelude::*;
use modstead_core::fsx;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::analyze::{self, DiskWarning, HealthReport};
use crate::install::{self, Source};
use crate::launch::{self, LaunchResult};
use crate::logs::{self, LogReport};
use crate::ops::{self, FileHash, JournalEntry, TrashMeta};
use crate::profiles::{self, Profile, ProfileDiff};
use crate::saves::{self, SaveBackup, SaveInfo};
use crate::scan::{self, ScanResult};
use crate::updates::{self, LookupResult, UpdateCache};
use crate::{ID, Stardew, StardewSettings, bail, detect, smapi};

type Game<'a> = State<'a, Arc<Stardew>>;

async fn blocking<T: Send + 'static>(game: &Game<'_>, f: impl FnOnce(&Stardew) -> AppResult<T> + Send + 'static) -> AppResult<T> {
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
pub struct Environment {
    pub game_path: Option<String>,
    pub store: Option<String>,
    pub version: Option<String>,
    pub smapi: detect::Smapi,
    pub mods_path: Option<String>,
    pub mods_exists: bool,
    pub mods: u32,
    pub enabled: u32,
    pub appdata: Option<String>,
    pub saves_dir: Option<String>,
    pub logs_dir: Option<String>,
    pub data_dir: String,
    pub default_data_dir: String,
    pub disks: Vec<DiskInfo>,
    pub running: bool,
}

fn environment(game: &Stardew) -> Environment {
    let dir = game.game_dir();
    let mods = dir.as_deref().map(detect::mods_dir);
    let count = mods.as_deref().map(detect::count_mods).unwrap_or_default();
    Environment {
        version: dir.as_deref().and_then(detect::game_version),
        store: dir.as_deref().map(|d| modstead_core::stores::store_of(d).to_string()),
        smapi: dir.as_deref().map(detect::smapi_info).unwrap_or(detect::Smapi { installed: false, version: None }),
        mods_exists: mods.as_deref().is_some_and(|m| m.is_dir()),
        mods_path: mods.map(|m| m.to_string_lossy().into_owned()),
        game_path: dir.as_ref().map(|d| d.to_string_lossy().into_owned()),
        mods: count.total,
        enabled: count.enabled,
        appdata: detect::appdata_dir().map(|p| p.to_string_lossy().into_owned()),
        saves_dir: saves::saves_dir().ok().map(|p| p.to_string_lossy().into_owned()),
        logs_dir: logs::log_dir().map(|p| p.to_string_lossy().into_owned()),
        data_dir: game.data_root().to_string_lossy().into_owned(),
        default_data_dir: game.default_data_root().to_string_lossy().into_owned(),
        disks: game.disks(),
        running: game.is_running(),
    }
}

/// Oyun klasörü, sürüm, SMAPI, mod sayıları, klasörler ve disk alanı.
#[tauri::command]
pub async fn stardew_environment(game: Game<'_>) -> AppResult<Environment> {
    blocking(&game, |g| Ok(environment(g))).await
}

#[tauri::command]
pub fn stardew_settings_get(game: Game<'_>) -> StardewSettings {
    game.settings()
}

#[tauri::command]
pub async fn stardew_settings_update(game: Game<'_>, settings: StardewSettings) -> AppResult<StardewSettings> {
    blocking(&game, move |g| {
        let game_path = match settings.game_path.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
            Some(p) => Some(
                detect::resolve_game_dir(&PathBuf::from(p))
                    .map(|d| fsx::dunce(&d).to_string_lossy().into_owned())
                    .ok_or_else(|| AppError::msg(tr!("Seçilen klasörde Stardew Valley bulunamadı.", "Stardew Valley was not found in the selected folder.")))?,
            ),
            None => None,
        };
        let data_dir = match settings.data_dir.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
            Some(d) => {
                let p = PathBuf::from(d);
                if !p.is_absolute() {
                    bail!("Veri klasörü tam bir yol olmalı.", "The data folder must be a full path.");
                }
                std::fs::create_dir_all(&p)?;
                Some(fsx::dunce(&p).to_string_lossy().into_owned())
            }
            None => None,
        };
        let season = if ["auto", "spring", "summer", "fall", "winter"].contains(&settings.season.as_str()) { settings.season.clone() } else { "auto".into() };
        let changed_game = g.settings().game_path != game_path;
        let s = g.update_settings(|s| {
            *s = StardewSettings {
                game_path,
                data_dir,
                season,
                trash_retention_days: settings.trash_retention_days.min(3650),
                save_backups_keep: settings.save_backups_keep.clamp(1, 200),
                ..settings
            };
        })?;
        if changed_game {
            g.services.game_changed(ID);
        }
        Ok(s)
    })
    .await
}

// ───────────── Modlar ─────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModsSnapshot {
    pub scan: ScanResult,
    pub health: HealthReport,
    pub updates: Option<UpdateCache>,
}

fn snapshot(game: &Stardew) -> ModsSnapshot {
    let game_dir = game.game_dir();
    let scan = game_dir.as_deref().map(|g| scan::scan_mods(&detect::mods_dir(g))).unwrap_or_default();
    let game_version = game_dir.as_deref().and_then(detect::game_version);
    let smapi = game_dir.as_deref().map(detect::smapi_info).unwrap_or(detect::Smapi { installed: false, version: None });
    let updates = game.update_cache();
    let low_disk = game.disks().into_iter().filter(|d| d.low).map(|d| DiskWarning { label: d.label, free: d.free.unwrap_or(0) }).collect();
    let health = analyze::analyze(&analyze::Input {
        scan: &scan,
        game_found: game_dir.is_some(),
        game_version: game_version.as_deref(),
        smapi_installed: smapi.installed,
        smapi_version: smapi.version.as_deref(),
        updates: updates.as_ref(),
        low_disk,
    });
    game.set_last_issues(health.errors + health.warnings);
    ModsSnapshot { scan, health, updates }
}

/// Tarama + sağlık raporu + son güncelleme denetimi (ana ekranların hepsi bunu kullanır).
#[tauri::command]
pub async fn stardew_get_snapshot(game: Game<'_>) -> AppResult<ModsSnapshot> {
    blocking(&game, |g| Ok(snapshot(g))).await
}

fn changed<T>(game: &Stardew, r: AppResult<T>) -> AppResult<T> {
    if r.is_ok() {
        game.services.game_changed(ID);
    }
    r
}

#[tauri::command]
pub async fn stardew_set_mods_enabled(game: Game<'_>, folders: Vec<String>, enabled: bool) -> AppResult<JournalEntry> {
    blocking(&game, move |g| changed(g, ops::set_enabled(g, &folders, enabled))).await
}

#[tauri::command]
pub async fn stardew_uninstall_mods(game: Game<'_>, folders: Vec<String>) -> AppResult<JournalEntry> {
    blocking(&game, move |g| changed(g, ops::uninstall(g, &folders))).await
}

#[tauri::command]
pub async fn stardew_hash_mod_files(game: Game<'_>, folder: String) -> AppResult<Vec<FileHash>> {
    blocking(&game, move |g| ops::hash_mod_files(g, &folder)).await
}

#[tauri::command]
pub async fn stardew_read_mod_config(game: Game<'_>, folder: String) -> AppResult<Option<String>> {
    blocking(&game, move |g| ops::read_config(g, &folder)).await
}

#[tauri::command]
pub async fn stardew_write_mod_config(game: Game<'_>, folder: String, text: String) -> AppResult<()> {
    blocking(&game, move |g| ops::write_config(g, &folder, &text)).await
}

// ───────────── Kurulum ─────────────

/// Mods klasöründe unutulmuş bir arşivi ortak hattan geçirip kurulum görevine çevirir.
#[tauri::command]
pub async fn stardew_install_archive(game: Game<'_>, rel: String) -> AppResult<JobSnapshot> {
    let mods = game.mods_dir()?;
    let path = fsx::resolve_under(&mods, &rel)?;
    if !path.is_file() {
        return Err(AppError::msg(format!("{}: {rel}", tr!("Arşiv bulunamadı", "Archive not found"))));
    }
    Ok(install::start(&game, Source::Local { path, in_mods: Some(rel) }).snapshot())
}

/// İnceleme penceresindeki "Kur": güvenlik kararını uygular ve kurulumu (ya da SMAPI'yi) yapar.
#[tauri::command]
pub async fn stardew_confirm_job(game: Game<'_>, id: String, accept_risk: bool, options: Option<serde_json::Value>) -> AppResult<serde_json::Value> {
    let job = game.services.jobs.get(&id).ok_or_else(|| AppError::NotFound(tr!("görev", "task").into()))?;
    if job.game() != ID {
        bail!("Bu görev Stardew Valley'e ait değil.", "This task doesn't belong to Stardew Valley.");
    }
    let options = options.unwrap_or(serde_json::Value::Null);
    blocking(&game, move |g| install::confirm(g, &job, accept_risk, options)).await
}

#[tauri::command]
pub async fn stardew_install_smapi(game: Game<'_>) -> AppResult<JobSnapshot> {
    Ok(smapi::start(&game)?.snapshot())
}

// ───────────── Güncellemeler ─────────────

#[tauri::command]
pub async fn stardew_check_updates(game: Game<'_>) -> AppResult<UpdateCache> {
    let (mods, smapi_version, game_version) = blocking(&game, |g| {
        let dir = g.require_game_dir()?;
        Ok((scan::scan_mods(&detect::mods_dir(&dir)).mods, detect::smapi_info(&dir).version, detect::game_version(&dir)))
    })
    .await?;
    let cache = updates::check(&game.services.http, &mods, smapi_version, game_version).await?;
    fsx::write_json(&game.data_file("update-cache.json"), &cache)?;
    game.services.game_changed(ID);
    Ok(cache)
}

#[tauri::command]
pub async fn stardew_lookup_mods(game: Game<'_>, ids: Vec<String>) -> AppResult<Vec<LookupResult>> {
    let ids: Vec<String> = ids.into_iter().map(|i| i.trim().to_string()).filter(|i| !i.is_empty() && i.len() < 200).take(200).collect();
    let smapi_version = game.game_dir().and_then(|g| detect::smapi_info(&g).version);
    updates::lookup(&game.services.http, ids, smapi_version).await
}

// ───────────── Günlük ve çöp kutusu ─────────────

#[tauri::command]
pub async fn stardew_list_journal(game: Game<'_>) -> AppResult<Vec<JournalEntry>> {
    blocking(&game, |g| Ok(ops::list_journal(g))).await
}

#[tauri::command]
pub async fn stardew_undo_journal(game: Game<'_>, id: String) -> AppResult<JournalEntry> {
    blocking(&game, move |g| changed(g, ops::undo(g, &id))).await
}

#[tauri::command]
pub async fn stardew_list_trash(game: Game<'_>) -> AppResult<Vec<TrashMeta>> {
    blocking(&game, |g| Ok(ops::list_trash(g))).await
}

#[tauri::command]
pub async fn stardew_restore_trash(game: Game<'_>, id: String) -> AppResult<JournalEntry> {
    blocking(&game, move |g| changed(g, ops::restore_trash(g, &id))).await
}

#[tauri::command]
pub async fn stardew_delete_trash(game: Game<'_>, id: Option<String>) -> AppResult<u32> {
    blocking(&game, move |g| ops::delete_trash(g, id.as_deref())).await
}

// ───────────── Profiller ─────────────

#[tauri::command]
pub async fn stardew_list_profiles(game: Game<'_>) -> AppResult<Vec<Profile>> {
    blocking(&game, |g| Ok(profiles::list(g))).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub capture: bool,
}

#[tauri::command]
pub async fn stardew_save_profile(game: Game<'_>, input: ProfileInput) -> AppResult<Profile> {
    blocking(&game, move |g| profiles::save(g, input.id, input.name, input.description, input.capture, None)).await
}

#[tauri::command]
pub async fn stardew_delete_profile(game: Game<'_>, id: String) -> AppResult<()> {
    blocking(&game, move |g| profiles::delete(g, &id)).await
}

#[tauri::command]
pub async fn stardew_preview_profile(game: Game<'_>, id: String) -> AppResult<ProfileDiff> {
    blocking(&game, move |g| profiles::diff(g, &id)).await
}

#[tauri::command]
pub async fn stardew_apply_profile(game: Game<'_>, id: String) -> AppResult<JournalEntry> {
    blocking(&game, move |g| changed(g, profiles::apply(g, &id))).await
}

#[tauri::command]
pub async fn stardew_import_profile(game: Game<'_>, json: String) -> AppResult<Profile> {
    if json.len() > 2_000_000 {
        bail!("Profil metni çok büyük.", "The profile text is too large.");
    }
    blocking(&game, move |g| profiles::import(g, &json)).await
}

// ───────────── Kayıtlar ─────────────

#[tauri::command]
pub async fn stardew_list_saves(game: Game<'_>) -> AppResult<Vec<SaveInfo>> {
    blocking(&game, saves::list).await
}

#[tauri::command]
pub async fn stardew_backup_save(game: Game<'_>, folder: String) -> AppResult<SaveBackup> {
    blocking(&game, move |g| saves::backup(g, &folder, "elle")).await
}

#[tauri::command]
pub async fn stardew_restore_save(game: Game<'_>, folder: String, file: String) -> AppResult<()> {
    blocking(&game, move |g| saves::restore(g, &folder, &file)).await
}

#[tauri::command]
pub async fn stardew_delete_save_backup(game: Game<'_>, folder: String, file: String) -> AppResult<()> {
    blocking(&game, move |g| saves::delete_backup(g, &folder, &file)).await
}

// ───────────── SMAPI günlüğü ve başlatma ─────────────

#[tauri::command]
pub async fn stardew_read_smapi_log() -> AppResult<LogReport> {
    tokio::task::spawn_blocking(logs::read_latest).await.map_err(AppError::from)
}

#[tauri::command]
pub async fn stardew_launch(game: Game<'_>, vanilla: bool) -> AppResult<LaunchResult> {
    blocking(&game, move |g| launch::launch(g, vanilla)).await
}

#[tauri::command]
pub fn stardew_is_running(game: Game<'_>) -> bool {
    game.is_running()
}

/// Oyunun klasörlerinden birini Gezgin'de açar. `rel` verilirse o klasörün içine kilitlenir.
#[tauri::command]
pub async fn stardew_open_path(game: Game<'_>, kind: String, rel: Option<String>) -> AppResult<()> {
    blocking(&game, move |g| {
        let base = match kind.as_str() {
            "mods" => g.ensure_mods_dir()?,
            "game" => g.require_game_dir()?,
            "saves" => saves::saves_dir()?,
            "logs" => logs::log_dir().ok_or_else(|| AppError::NotFound(tr!("günlük klasörü", "log folder").into()))?,
            "data" => g.data_root(),
            "save-backups" => g.save_backups_dir(),
            "trash" => g.trash_dir(),
            _ => bail!("Bilinmeyen klasör türü.", "Unknown folder kind."),
        };
        let target = match rel.filter(|r| !r.is_empty()) {
            Some(r) => fsx::resolve_under(&base, &r)?,
            None => base,
        };
        if !target.exists() {
            std::fs::create_dir_all(&target)?;
        }
        if fsx::is_link(&target) || !target.is_dir() {
            bail!("Yalnızca klasörler açılabilir.", "Only folders can be opened.");
        }
        // Gezgin bir GUI sürecidir; konsol penceresi açılmaz. Yalnızca doğrulanmış klasör yolu verilir.
        std::process::Command::new("explorer.exe").arg(&target).spawn().map(|_| ()).map_err(|e| AppError::msg(format!("{}: {e}", tr!("Klasör açılamadı", "Could not open the folder"))))
    })
    .await
}
