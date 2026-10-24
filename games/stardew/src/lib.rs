//! Modstead · Stardew Valley oyun paketi (Vadi'den taşındı: D:\Stardew Valley Manager).
//!
//! SMAPI kuralıyla tarama, sağlık analizi ve tek tık düzeltmeler, ortak güvenlik hattından geçen
//! kurulum/güncelleme (config.json korunur), doğrulanmış SMAPI kurulumu, smapi.io güncellemeleri,
//! profiller, kayıt yedekleri, SMAPI günlüğü, geri alınabilir işlem günlüğü ve çöp kutusu.
//!
//! Kurallar: komutlar `stardew_` önekiyle, olaylar `stardew://` önekiyle adlandırılır; kalıcı veri
//! `Services::paths.game_data("stardew")`, ağır veri (çöp, yedekler, karantina) `game_local` ya da
//! kullanıcının seçtiği veri klasöründe durur.

pub mod analyze;
pub mod commands;
pub mod detect;
pub mod discover;
pub mod install;
pub mod launch;
pub mod logs;
pub mod manifest;
pub mod migrate;
pub mod ops;
pub mod profiles;
pub mod saves;
pub mod scan;
pub mod smapi;
pub mod updates;
pub mod util;

#[cfg(test)]
mod smoke;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use modstead_core::http::GameHosts;
use modstead_core::nexus::{self, NexusGame};
use modstead_core::prelude::*;
use modstead_core::security::content::ContentPolicy;
use modstead_core::{fsx, platform, stores};
use serde::{Deserialize, Serialize};
use tauri::Manager;

pub const ID: &str = "stardew";

/// Disk alanı bu sınırın altına inerse sağlık analizinde uyarı verilir.
pub const LOW_DISK_BYTES: u64 = 1536 * 1024 * 1024;

pub static INFO: GameInfo = GameInfo {
    id: ID,
    name: "Stardew Valley",
    short: "Stardew",
    nexus: &[NexusGame { domain: "stardewvalley", id: 1303 }],
    steam_app_ids: &[413150],
    hosts: GameHosts { download: &["smapi.io"], download_suffix: &[], media: &[] },
    content: ContentPolicy { expected_code: &["dll"], info_ext: &[] },
    trusted_sources: &[("smapi.io", "SMAPI")],
    known_sources: &[("moddrop.com", "ModDrop"), ("curseforge.com", "CurseForge")],
};

/// `ops::bail!`'in karşılığı: iki dilli kısa hata.
#[macro_export]
macro_rules! bail {
    ($tr:expr, $en:expr $(,)?) => {
        return Err(modstead_core::AppError::msg(modstead_core::tr!($tr, $en)))
    };
}

/// Oyuna özel ayarlar. Tema, dil, hareket ve ilk kurulum genel ayarlardadır.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct StardewSettings {
    /// Elle seçilen oyun klasörü; boşsa bulunan ilk kurulum kullanılır.
    pub game_path: Option<String>,
    /// Çöp kutusu, kayıt yedekleri ve karantina için klasör (boşsa uygulamanın yerel klasörü).
    pub data_dir: Option<String>,
    /// Vurgu: auto | spring | summer | fall | winter
    pub season: String,
    pub auto_check_updates: bool,
    pub backup_saves_on_launch: bool,
    pub trash_retention_days: u32,
    pub save_backups_keep: u32,
    pub active_profile: Option<String>,
}

impl Default for StardewSettings {
    fn default() -> Self {
        StardewSettings {
            game_path: None,
            data_dir: None,
            season: "spring".into(),
            auto_check_updates: true,
            backup_saves_on_launch: true,
            trash_retention_days: 30,
            save_backups_keep: 10,
            active_profile: None,
        }
    }
}

pub struct Stardew {
    pub services: Arc<Services>,
    settings: RwLock<StardewSettings>,
    /// Mods klasörünü değiştiren işlemler sırayla yürür.
    pub ops_lock: Mutex<()>,
    /// Modstead'in başlattığı oyun oturumunun başlangıcı (ms). Oyun kapanınca bekleyen iş parçacığı temizler.
    pub session: Arc<Mutex<Option<u64>>>,
    /// Son sağlık özeti (hata + uyarı); ana sayfa kartı ucuz kalsın diye bellekte.
    last_issues: Mutex<Option<u32>>,
}

impl Stardew {
    pub fn new(services: Arc<Services>) -> Self {
        let data = services.paths.game_data(ID);
        let _ = std::fs::create_dir_all(&data);
        let settings = migrate::import_vadi(&services).unwrap_or_else(|| fsx::read_json(&data.join("settings.json")));
        let game = Stardew { services, settings: RwLock::new(settings), ops_lock: Mutex::new(()), session: Arc::new(Mutex::new(None)), last_issues: Mutex::new(None) };
        game.housekeeping();
        game
    }

    pub fn settings(&self) -> StardewSettings {
        self.settings.read().unwrap().clone()
    }

    pub fn update_settings(&self, f: impl FnOnce(&mut StardewSettings)) -> AppResult<StardewSettings> {
        let mut s = self.settings();
        f(&mut s);
        fsx::write_json(&self.data_file("settings.json"), &s)?;
        *self.settings.write().unwrap() = s.clone();
        Ok(s)
    }

    // ───────────── Yollar ─────────────

    /// Kalıcı veri dosyası (`%APPDATA%\app.modstead\games\stardew\<ad>`).
    pub fn data_file(&self, name: &str) -> PathBuf {
        self.services.paths.game_data(ID).join(name)
    }

    pub fn default_data_root(&self) -> PathBuf {
        self.services.paths.game_local(ID)
    }

    /// Çöp kutusu, yedekler ve karantinanın kökü.
    pub fn data_root(&self) -> PathBuf {
        self.settings().data_dir.map(PathBuf::from).filter(|p| p.is_absolute()).unwrap_or_else(|| self.default_data_root())
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.data_root().join("trash")
    }

    pub fn staging_root(&self) -> PathBuf {
        self.data_root().join("staging")
    }

    pub fn save_backups_dir(&self) -> PathBuf {
        self.data_root().join("save-backups")
    }

    pub fn config_backups_dir(&self) -> PathBuf {
        self.data_root().join("config-backups")
    }

    /// Seçili ya da bulunan oyun klasörü.
    pub fn game_dir(&self) -> Option<PathBuf> {
        if let Some(p) = self.settings().game_path.map(PathBuf::from) {
            if detect::is_game_dir(&p) {
                return Some(p);
            }
        }
        detect::candidates().into_iter().next().map(|(p, _)| p)
    }

    pub fn require_game_dir(&self) -> AppResult<PathBuf> {
        self.game_dir().ok_or_else(|| AppError::GameNotFound(INFO.name.into()))
    }

    pub fn mods_dir(&self) -> AppResult<PathBuf> {
        Ok(detect::mods_dir(&self.require_game_dir()?))
    }

    pub fn ensure_mods_dir(&self) -> AppResult<PathBuf> {
        let d = self.mods_dir()?;
        std::fs::create_dir_all(&d)?;
        Ok(d)
    }

    pub fn is_running(&self) -> bool {
        self.session.lock().unwrap().is_some() || detect::is_running()
    }

    /// Oyun açıkken mod klasörüne yazılmaz.
    pub fn ensure_game_closed(&self) -> AppResult<()> {
        if self.is_running() {
            return Err(AppError::GameRunning(INFO.name.into()));
        }
        Ok(())
    }

    pub fn set_last_issues(&self, n: u32) {
        *self.last_issues.lock().unwrap() = Some(n);
    }

    pub fn update_cache(&self) -> Option<updates::UpdateCache> {
        fsx::read_json(&self.data_file("update-cache.json"))
    }

    /// Açılışta yarım kalmış karantinayı ve süresi dolan çöpleri temizler.
    fn housekeeping(&self) {
        let _ = fsx::remove_dir(&self.staging_root());
        let days = self.settings().trash_retention_days;
        if days > 0 {
            ops::purge_trash(self, days as u64 * 24 * 3600 * 1000);
        }
    }

    /// Diskte az yer kalan konumlar (oyun klasörü ve veri klasörü).
    pub fn disks(&self) -> Vec<commands::DiskInfo> {
        let mut out = Vec::new();
        let mut push = |label: String, p: &std::path::Path| {
            let free = platform::disk_free(p);
            out.push(commands::DiskInfo { label, path: p.to_string_lossy().into_owned(), free, low: free.is_some_and(|f| f < LOW_DISK_BYTES) });
        };
        if let Some(g) = self.game_dir() {
            push(tr!("Oyun klasörü", "Game folder").into(), &g);
        }
        push(tr!("Yedek ve çöp klasörü", "Backup and trash folder").into(), &self.data_root());
        out
    }
}

fn store_label(dir: &std::path::Path) -> String {
    match stores::store_of(dir) {
        "steam" => "Steam".into(),
        "gog" => "GOG".into(),
        "xbox" => "Xbox".into(),
        _ => tr!("Elle seçildi", "Chosen manually").into(),
    }
}

fn compute_status(dir: Option<PathBuf>, running: bool, issues: Option<u32>, cache: Option<updates::UpdateCache>) -> GameStatus {
    let Some(dir) = dir else {
        return GameStatus {
            notes: vec![StatusNote { tone: Tone::Info, text: tr!("Kurulum bulunamadı. Oyun klasörünü seçin.", "No installation found. Choose the game folder.").into() }],
            running,
            checked_at: fsx::now_ts(),
            ..Default::default()
        };
    };
    let smapi = detect::smapi_info(&dir);
    let mods = detect::mods_dir(&dir);
    let count = detect::count_mods(&mods);
    let mut notes = Vec::new();
    if smapi.installed {
        notes.push(StatusNote { tone: Tone::Ok, text: format!("SMAPI {}", smapi.version.clone().unwrap_or_default()) });
    } else {
        notes.push(StatusNote { tone: Tone::Warn, text: tr!("SMAPI kurulu değil; modlar yüklenmez.", "SMAPI is not installed; mods will not load.").into() });
    }
    // Güncelleme sayısı son smapi.io denetiminden (kaldırılmış modlar sayılmasın diye taramayla eşlenir).
    let updates = cache.map(|c| c.update_count(&scan::scan_mods(&mods).mods));
    GameStatus {
        installed: true,
        installs: vec![InstallSummary { label: store_label(&dir), path: dir.to_string_lossy().into_owned(), version: detect::game_version(&dir), store: stores::store_of(&dir).into(), running }],
        running,
        mods: Some(count.total),
        enabled: Some(count.enabled),
        issues,
        updates,
        notes,
        checked_at: fsx::now_ts(),
    }
}

impl Game for Stardew {
    fn info(&self) -> &GameInfo {
        &INFO
    }

    fn status(&self) -> BoxFuture<'_, GameStatus> {
        Box::pin(async move {
            let (dir, running, issues, cache) = (self.game_dir(), self.is_running(), *self.last_issues.lock().unwrap(), self.update_cache());
            tokio::task::spawn_blocking(move || compute_status(dir, running, issues, cache)).await.unwrap_or_default()
        })
    }

    fn detect(&self) -> BoxFuture<'_, Vec<InstallCandidate>> {
        Box::pin(async move {
            tokio::task::spawn_blocking(|| {
                detect::candidates()
                    .into_iter()
                    .map(|(p, store)| InstallCandidate {
                        version: detect::game_version(&p),
                        label: detect::smapi_info(&p).version.map(|v| format!("SMAPI {v}")).unwrap_or_else(|| tr!("SMAPI yok", "No SMAPI").into()),
                        path: p.to_string_lossy().into_owned(),
                        store: store.into(),
                    })
                    .collect()
            })
            .await
            .unwrap_or_default()
        })
    }

    fn set_install_path(&self, path: String) -> BoxFuture<'_, AppResult<GameStatus>> {
        Box::pin(async move {
            let p = detect::resolve_game_dir(&PathBuf::from(path.trim()))
                .ok_or_else(|| AppError::msg(tr!("Bu klasörde Stardew Valley bulunamadı. 'Stardew Valley.exe' dosyasının olduğu klasörü seçin.", "Stardew Valley was not found in this folder. Choose the folder that contains 'Stardew Valley.exe'.")))?;
            self.update_settings(|s| s.game_path = Some(fsx::dunce(&p).to_string_lossy().into_owned()))?;
            self.services.game_changed(ID);
            Ok(self.status().await)
        })
    }

    fn launch(&self) -> BoxFuture<'_, AppResult<()>> {
        Box::pin(async move {
            // "Oyna": SMAPI varsa onunla (modlar yüklensin), yoksa oyunun kendisiyle.
            let vanilla = self.game_dir().is_none_or(|d| !detect::smapi_info(&d).installed);
            launch::launch(self, vanilla).map(|_| ())
        })
    }

    fn handle_nxm(&self, url: String) -> BoxFuture<'_, AppResult<JobSnapshot>> {
        Box::pin(async move {
            let link = nexus::parse_nxm(&url)?;
            let game = INFO.nexus_game(&link.domain).ok_or_else(|| AppError::msg(tr!("Bu bağlantı Stardew Valley'e ait değil.", "This link is not for Stardew Valley.")))?;
            // SMAPI'nin Nexus arşivi bir kurucudur, mod değil: doğrulanmış GitHub kurulumuna yönlendir.
            if link.mod_id == discover::SMAPI_NEXUS_ID {
                return Ok(smapi::start(self)?.snapshot());
            }
            let (mod_id, file_id) = (link.mod_id, link.file_id);
            Ok(install::start(self, install::Source::Nexus { game, mod_id, file_id, nxm: Some(link), name: None }).snapshot())
        })
    }

    fn install_files(&self, paths: Vec<String>) -> BoxFuture<'_, AppResult<Vec<JobSnapshot>>> {
        Box::pin(async move {
            let mut jobs = Vec::new();
            for p in paths {
                let path = PathBuf::from(&p);
                if !path.is_absolute() || !path.is_file() {
                    return Err(AppError::msg(format!("{}: {p}", tr!("Dosya bulunamadı", "File not found"))));
                }
                jobs.push(install::start(self, install::Source::Local { path, in_mods: None }).snapshot());
            }
            Ok(jobs)
        })
    }

    fn discard_job(&self, job: &JobHandle) {
        install::discard(job);
    }
}

/// Komutların kullandığı durum: `State<'_, Arc<Stardew>>`. Arka plan görevleri `Arc` kopyası taşır.
pub fn init(app: &tauri::AppHandle, services: Arc<Services>) -> Arc<dyn Game> {
    let game = Arc::new(Stardew::new(services));
    app.manage(game.clone());
    game
}

/// Bu oyunun Tauri komutları (adları `stardew_` ile başlar; kabuk öneke göre yönlendirir).
pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::stardew_environment,
        commands::stardew_settings_get,
        commands::stardew_settings_update,
        commands::stardew_get_snapshot,
        commands::stardew_set_mods_enabled,
        commands::stardew_uninstall_mods,
        commands::stardew_hash_mod_files,
        commands::stardew_read_mod_config,
        commands::stardew_write_mod_config,
        commands::stardew_install_archive,
        commands::stardew_confirm_job,
        commands::stardew_check_updates,
        commands::stardew_lookup_mods,
        commands::stardew_install_smapi,
        commands::stardew_list_journal,
        commands::stardew_undo_journal,
        commands::stardew_list_trash,
        commands::stardew_restore_trash,
        commands::stardew_delete_trash,
        commands::stardew_list_profiles,
        commands::stardew_save_profile,
        commands::stardew_delete_profile,
        commands::stardew_preview_profile,
        commands::stardew_apply_profile,
        commands::stardew_import_profile,
        commands::stardew_list_saves,
        commands::stardew_backup_save,
        commands::stardew_restore_save,
        commands::stardew_delete_save_backup,
        commands::stardew_read_smapi_log,
        commands::stardew_launch,
        commands::stardew_is_running,
        commands::stardew_open_path,
        discover::stardew_nexus_search,
        discover::stardew_nexus_categories,
        discover::stardew_nexus_mod,
        discover::stardew_install_nexus,
    ]
}

#[cfg(test)]
pub(crate) mod testkit {
    //! Testler için sahte oyun klasörü + diske/arayüze dokunmayan servisler.
    use super::*;

    pub struct Fixture {
        pub game: Arc<Stardew>,
        pub root: PathBuf,
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fsx::remove_dir(&self.root);
        }
    }

    impl Fixture {
        pub fn mods(&self) -> PathBuf {
            self.game.mods_dir().unwrap()
        }

        pub fn add_mod(&self, folder: &str, id: &str) {
            let dir = self.mods().join(folder);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("manifest.json"), format!(r#"{{"Name":"{folder}","Author":"a","Version":"1.0","UniqueID":"{id}","EntryDll":"x.dll"}}"#)).unwrap();
        }
    }

    pub fn fixture() -> Fixture {
        let services = Services::for_tests();
        services
            .update_settings(|s| {
                s.require_scan = false; // Defender testlerde çalışmaz
                s.virustotal = false;
            })
            .unwrap();
        let root = services.paths.data.parent().unwrap().to_path_buf();
        let game_dir = root.join("game");
        std::fs::create_dir_all(game_dir.join("Mods")).unwrap();
        std::fs::write(game_dir.join("Stardew Valley.dll"), "").unwrap();
        std::fs::write(game_dir.join("Stardew Valley.deps.json"), "{\"deps\":1}").unwrap();
        let game = Arc::new(Stardew {
            services,
            settings: RwLock::new(StardewSettings { game_path: Some(game_dir.to_string_lossy().into_owned()), ..Default::default() }),
            ops_lock: Mutex::new(()),
            session: Arc::new(Mutex::new(None)),
            last_issues: Mutex::new(None),
        });
        Fixture { game, root }
    }
}
