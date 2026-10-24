//! Modstead · Cities: Skylines II oyun paketi.
//!
//! CS2'nin modları iki yerden gelir:
//! - **Paradox Mods abonelikleri**: oyun kendisi indirir (`.cache/Mods/pdx_mods/<modId>_<sürüm>`) ve
//!   oynatma listesiyle (playset) yönetir. Modstead bunları salt okunur gösterir, Paradox Mods'un açık
//!   kataloğundan adını, görselini, uyumluluğunu ve bağımlılıklarını çeker; abonelik oyunda ya da sitede yapılır.
//! - **Yerel modlar**: `Mods/<klasör>`; oyun kendiliğinden yükler, başına nokta konan klasörü yüklemez.
//!   Modstead bunları ortak güvenlik hattından geçirerek kurar (Nexus, yerel arşiv), açar/kapatır ve
//!   çöp kutusuna taşır. Arşivdeki kayıtlar (`Saves/<kullanıcı>`) ve haritalar (`Maps`) da kurulur.
//!
//! Ayrıca: kayıtlar (önizleme görseli, şehir bilgisi, yedek/geri yükleme), sağlık denetimi (Paradox hesabı,
//! uyumsuz/eksik bağımlı modlar, BepInEx kalıntıları, bilinen kötü amaçlı sürüm, eski sürüm birikintisi,
//! disk, günlük hataları, çökmeler), günlükler ve başlatma (Steam'de geliştirici kipi seçenekleri).
//!
//! Kurallar: komutlar `cities2_` önekiyle adlandırılır; kalıcı veri `Services::paths.game_data("cities2")`,
//! ağır veri (yedekler, çöp, karantina) `game_local` ya da kullanıcının seçtiği veri klasöründe durur.
//! Oyunun kendi klasörlerine yalnızca oyun kapalıyken ve kullanıcı eylemiyle yazılır.

pub mod commands;
pub mod detect;
pub mod discover;
pub mod health;
pub mod install;
pub mod logs;
pub mod mods;
pub mod ops;
pub mod paradox;
pub mod saves;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use modstead_core::http::GameHosts;
use modstead_core::nexus::{self, NexusGame};
use modstead_core::prelude::*;
use modstead_core::security::content::ContentPolicy;
use modstead_core::{fsx, platform};
use serde::{Deserialize, Serialize};
use tauri::Manager;

pub const ID: &str = "cities2";

/// Kullanıcı verisinin (kayıtlar, mod önbelleği) bulunduğu sürücüde bu sınırın altında uyarı verilir.
/// Bir kayıt 40–70 MB, bir kod modu güncellemesi birkaç yüz MB tutabilir.
pub const LOW_DISK_BYTES: u64 = 3 * 1024 * 1024 * 1024;

pub static INFO: GameInfo = GameInfo {
    id: ID,
    name: "Cities: Skylines II",
    short: "Cities II",
    nexus: &[NexusGame { domain: "citiesskylines2", id: 5833 }],
    steam_app_ids: &[detect::STEAM_APP],
    // Paradox Mods'un açık katalog API'si (arama, mod sayfası) ve görsel sunucusu. Paradox Mods'tan
    // arşiv indirilmez: abonelikleri oyun indirir.
    hosts: GameHosts { download: &["api.paradox-interactive.com"], download_suffix: &[], media: &["modscontent.paradox-interactive.com"] },
    content: ContentPolicy { expected_code: &["dll"], info_ext: &[] },
    trusted_sources: &[("mods.paradoxplaza.com", "Paradox Mods")],
    known_sources: &[("paradoxplaza.com", "Paradox Interactive"), ("thunderstore.io", "Thunderstore")],
};

/// İki dilli kısa hata.
#[macro_export]
macro_rules! bail {
    ($tr:expr, $en:expr $(,)?) => {
        return Err(modstead_core::AppError::msg(modstead_core::tr!($tr, $en)))
    };
}

/// Oyuna özel ayarlar. Tema, dil ve güvenlik genel ayarlardadır.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Cities2Settings {
    /// Elle seçilen oyun klasörü; boşsa bulunan ilk kurulum kullanılır.
    pub game_path: Option<String>,
    /// Oyunun kullanıcı verisi (`LocalLow\Colossal Order\Cities Skylines II`); boşsa varsayılan.
    pub user_dir: Option<String>,
    /// Kayıt yedekleri, çöp kutusu ve karantina için klasör (boşsa uygulamanın yerel klasörü).
    pub data_dir: Option<String>,
    /// Mod kurmadan ya da kaldırmadan önce en son kaydı yedekle.
    pub backup_before_changes: bool,
    /// Kayıt başına tutulacak yedek sayısı (eskiler silinir; 0 = sınırsız).
    pub save_backups_keep: u32,
    pub trash_retention_days: u32,
    /// Steam'de `--developerMode` (Tab geliştirici menüsü, Home nesne paneli).
    pub developer_mode: bool,
    /// Steam'de `--uiDeveloperMode` (arayüz hata ayıklayıcısı, http://localhost:9444).
    pub ui_developer_mode: bool,
}

impl Default for Cities2Settings {
    fn default() -> Self {
        Cities2Settings {
            game_path: None,
            user_dir: None,
            data_dir: None,
            backup_before_changes: true,
            save_backups_keep: 5,
            trash_retention_days: 30,
            developer_mode: false,
            ui_developer_mode: false,
        }
    }
}

pub struct Cities2 {
    pub services: Arc<Services>,
    settings: RwLock<Cities2Settings>,
    /// Mod ve kayıt klasörlerini değiştiren işlemler sırayla yürür.
    pub ops_lock: Mutex<()>,
    /// Son sağlık özeti (hata + uyarı); ana sayfa kartı ucuz kalsın diye bellekte.
    last_issues: Mutex<Option<u32>>,
}

impl Cities2 {
    pub fn new(services: Arc<Services>) -> Self {
        let data = services.paths.game_data(ID);
        let _ = std::fs::create_dir_all(&data);
        let settings = fsx::read_json(&data.join("settings.json"));
        let game = Cities2 { services, settings: RwLock::new(settings), ops_lock: Mutex::new(()), last_issues: Mutex::new(None) };
        game.housekeeping();
        game
    }

    pub fn settings(&self) -> Cities2Settings {
        self.settings.read().unwrap().clone()
    }

    pub fn update_settings(&self, f: impl FnOnce(&mut Cities2Settings)) -> AppResult<Cities2Settings> {
        let mut s = self.settings();
        f(&mut s);
        fsx::write_json(&self.data_file("settings.json"), &s)?;
        *self.settings.write().unwrap() = s.clone();
        Ok(s)
    }

    // ───────────── Yollar ─────────────

    /// Kalıcı veri dosyası (`%APPDATA%\app.modstead\games\cities2\<ad>`).
    pub fn data_file(&self, name: &str) -> PathBuf {
        self.services.paths.game_data(ID).join(name)
    }

    /// Önbellek dosyası (`%LOCALAPPDATA%\app.modstead\games\cities2\<ad>`): Paradox meta verisi, önizlemeler.
    pub fn cache_path(&self, name: &str) -> PathBuf {
        self.services.paths.game_local(ID).join(name)
    }

    pub fn default_data_root(&self) -> PathBuf {
        self.services.paths.game_local(ID)
    }

    /// Kayıt yedekleri, çöp kutusu ve karantinanın kökü.
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

    /// Oyunun kullanıcı verisi klasörü (var olmayabilir: oyun hiç açılmadıysa).
    pub fn user_dir(&self) -> PathBuf {
        self.settings().user_dir.map(PathBuf::from).filter(|p| p.is_absolute()).unwrap_or_else(detect::default_user_dir)
    }

    /// Yerel modlar: `<kullanıcı>\Mods`.
    pub fn local_mods_dir(&self) -> PathBuf {
        self.user_dir().join("Mods")
    }

    pub fn saves_dir(&self) -> PathBuf {
        self.user_dir().join("Saves")
    }

    pub fn maps_dir(&self) -> PathBuf {
        self.user_dir().join("Maps")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.user_dir().join("Logs")
    }

    /// Oyunun mod önbelleği: `<kullanıcı>\.cache\Mods` (Paradox Mods abonelikleri).
    pub fn mods_cache_dir(&self) -> PathBuf {
        self.user_dir().join(".cache").join("Mods")
    }

    /// Seçili ya da bulunan oyun klasörü.
    pub fn game_dir(&self) -> Option<PathBuf> {
        if let Some(p) = self.settings().game_path.map(PathBuf::from) {
            if detect::is_game_dir(&p) {
                return Some(p);
            }
        }
        detect::candidates(&self.user_dir()).into_iter().next().map(|(p, _)| p)
    }

    pub fn is_running(&self) -> bool {
        detect::is_running()
    }

    /// Oyun açıkken mod, kayıt ve harita klasörlerine yazılmaz (oyun DLL'leri ve kayıtları kilitler).
    pub fn ensure_game_closed(&self) -> AppResult<()> {
        if self.is_running() {
            return Err(AppError::GameRunning(INFO.name.into()));
        }
        Ok(())
    }

    pub fn set_last_issues(&self, n: u32) {
        *self.last_issues.lock().unwrap() = Some(n);
    }

    /// Açılışta yarım kalmış karantinayı ve süresi dolan çöpleri temizler.
    fn housekeeping(&self) {
        let _ = fsx::remove_dir(&self.staging_root());
        let days = self.settings().trash_retention_days;
        if days > 0 {
            ops::purge_trash(self, days as i64 * 24 * 3600);
        }
    }

    /// Kullanıcı verisinin ve veri klasörünün bulunduğu sürücülerdeki boş alan.
    pub fn disks(&self) -> Vec<commands::DiskInfo> {
        let mut out: Vec<commands::DiskInfo> = Vec::new();
        let mut push = |label: String, p: PathBuf| {
            let probe = p.ancestors().find(|a| a.exists()).map(|a| a.to_path_buf()).unwrap_or(p.clone());
            let free = platform::disk_free(&probe);
            let drive = drive_of(&probe);
            if out.iter().any(|d| drive_of(std::path::Path::new(&d.path)) == drive) {
                return;
            }
            out.push(commands::DiskInfo { label, path: p.to_string_lossy().into_owned(), free, low: free.is_some_and(|f| f < LOW_DISK_BYTES) });
        };
        push(tr!("Oyun verisi (kayıtlar ve modlar)", "Game data (saves and mods)").into(), self.user_dir());
        push(tr!("Yedek ve çöp klasörü", "Backup and trash folder").into(), self.data_root());
        out
    }
}

fn drive_of(p: &std::path::Path) -> String {
    p.components().next().map(|c| c.as_os_str().to_string_lossy().to_ascii_uppercase()).unwrap_or_default()
}

fn store_label(dir: &std::path::Path) -> String {
    match detect::store_of(dir) {
        "steam" => "Steam".into(),
        "xbox" => "Xbox".into(),
        "epic" => "Epic".into(),
        _ => tr!("Elle seçildi", "Chosen manually").into(),
    }
}

fn compute_status(game_dir: Option<PathBuf>, user_dir: PathBuf, running: bool, issues: Option<u32>) -> GameStatus {
    let version = detect::game_version(&user_dir);
    let counts = mods::quick_counts(&user_dir);
    let mut notes = Vec::new();
    let account = detect::paradox_account(&user_dir);
    if counts.paradox > 0 {
        notes.push(StatusNote { tone: Tone::Ok, text: format!("Paradox Mods · {}", counts.paradox) });
    }
    if account.logged_in == Some(false) && counts.paradox > 0 {
        notes.push(StatusNote { tone: Tone::Warn, text: tr!("Paradox hesabına giriş yapılmamış", "Not signed in to a Paradox account").into() });
    }
    let Some(dir) = game_dir else {
        if !user_dir.is_dir() {
            return GameStatus {
                notes: vec![StatusNote { tone: Tone::Info, text: tr!("Kurulum bulunamadı. Oyun klasörünü seçin.", "No installation found. Choose the game folder.").into() }],
                running,
                checked_at: fsx::now_ts(),
                ..Default::default()
            };
        }
        // Oyun klasörü okunamıyor ama kullanıcı verisi var (ör. kaldırılmış ya da taşınmış kurulum).
        notes.push(StatusNote { tone: Tone::Info, text: tr!("Oyun klasörü bulunamadı; mod ve kayıtlar yine de yönetilebilir.", "Game folder not found; mods and saves can still be managed.").into() });
        return GameStatus { installed: false, running, mods: Some(counts.total()), enabled: Some(counts.enabled()), issues, notes, checked_at: fsx::now_ts(), ..Default::default() };
    };
    GameStatus {
        installed: true,
        installs: vec![InstallSummary { label: store_label(&dir), path: dir.to_string_lossy().into_owned(), version, store: detect::store_of(&dir).into(), running }],
        running,
        mods: Some(counts.total()),
        enabled: Some(counts.enabled()),
        issues,
        updates: None,
        notes,
        checked_at: fsx::now_ts(),
    }
}

impl Game for Cities2 {
    fn info(&self) -> &GameInfo {
        &INFO
    }

    fn status(&self) -> BoxFuture<'_, GameStatus> {
        Box::pin(async move {
            let (game_dir, user_dir, running, issues) = (self.game_dir(), self.user_dir(), self.is_running(), *self.last_issues.lock().unwrap());
            tokio::task::spawn_blocking(move || compute_status(game_dir, user_dir, running, issues)).await.unwrap_or_default()
        })
    }

    fn detect(&self) -> BoxFuture<'_, Vec<InstallCandidate>> {
        Box::pin(async move {
            let user_dir = self.user_dir();
            tokio::task::spawn_blocking(move || {
                let version = detect::game_version(&user_dir);
                detect::candidates(&user_dir)
                    .into_iter()
                    .map(|(p, store)| InstallCandidate { version: version.clone(), label: store_label(&p), path: p.to_string_lossy().into_owned(), store: store.into() })
                    .collect()
            })
            .await
            .unwrap_or_default()
        })
    }

    fn set_install_path(&self, path: String) -> BoxFuture<'_, AppResult<GameStatus>> {
        Box::pin(async move {
            let p = detect::resolve_game_dir(&PathBuf::from(path.trim())).ok_or_else(|| {
                AppError::msg(tr!(
                    "Bu klasörde Cities: Skylines II bulunamadı. 'Cities2.exe' dosyasının olduğu klasörü seçin.",
                    "Cities: Skylines II was not found in this folder. Choose the folder that contains 'Cities2.exe'."
                ))
            })?;
            self.update_settings(|s| s.game_path = Some(fsx::dunce(&p).to_string_lossy().into_owned()))?;
            self.services.game_changed(ID);
            Ok(self.status().await)
        })
    }

    fn launch(&self) -> BoxFuture<'_, AppResult<()>> {
        Box::pin(async move { commands::launch(self) })
    }

    fn handle_nxm(&self, url: String) -> BoxFuture<'_, AppResult<JobSnapshot>> {
        Box::pin(async move {
            let link = nexus::parse_nxm(&url)?;
            let game = INFO.nexus_game(&link.domain).ok_or_else(|| AppError::msg(tr!("Bu bağlantı Cities: Skylines II'ye ait değil.", "This link is not for Cities: Skylines II.")))?;
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
                jobs.push(install::start(self, install::Source::Local { path }).snapshot());
            }
            Ok(jobs)
        })
    }

    fn discard_job(&self, job: &JobHandle) {
        install::discard(job);
    }
}

/// Komutların kullandığı durum: `State<'_, Arc<Cities2>>`. Arka plan görevleri `Arc` kopyası taşır.
pub fn init(app: &tauri::AppHandle, services: Arc<Services>) -> Arc<dyn Game> {
    let game = Arc::new(Cities2::new(services));
    app.manage(game.clone());
    game
}

/// Bu oyunun Tauri komutları (adları `cities2_` ile başlar; kabuk öneke göre yönlendirir).
pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::cities2_environment,
        commands::cities2_settings_get,
        commands::cities2_settings_update,
        commands::cities2_snapshot,
        commands::cities2_set_enabled,
        commands::cities2_uninstall,
        commands::cities2_list_trash,
        commands::cities2_restore_trash,
        commands::cities2_delete_trash,
        commands::cities2_health,
        commands::cities2_fix,
        commands::cities2_security_scan,
        commands::cities2_list_saves,
        commands::cities2_save_preview,
        commands::cities2_list_save_backups,
        commands::cities2_backup_save,
        commands::cities2_restore_save,
        commands::cities2_delete_save_backup,
        commands::cities2_logs,
        commands::cities2_read_log,
        commands::cities2_launch,
        commands::cities2_open_path,
        commands::cities2_confirm_job,
        discover::cities2_pdx_search,
        discover::cities2_pdx_mod,
        discover::cities2_pdx_refresh,
        discover::cities2_nexus_search,
        discover::cities2_nexus_categories,
        discover::cities2_nexus_mod,
        discover::cities2_install_nexus,
    ]
}

#[cfg(test)]
pub(crate) mod testkit {
    //! Testler için sahte kullanıcı verisi + diske/arayüze dokunmayan servisler.
    use super::*;

    pub struct Fixture {
        pub game: Arc<Cities2>,
        pub root: PathBuf,
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fsx::remove_dir(&self.root);
        }
    }

    impl Fixture {
        pub fn user(&self) -> PathBuf {
            self.game.user_dir()
        }

        /// `Mods/<folder>/<dll>` (sahte DLL; içerik isteğe bağlı).
        pub fn add_local(&self, folder: &str, dll: &str, body: &[u8]) -> PathBuf {
            let dir = self.game.local_mods_dir().join(folder);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join(dll), body).unwrap();
            dir
        }

        /// `.cache/Mods/pdx_mods/<id>_<ver>/<dll>`
        pub fn add_pdx(&self, id: u64, ver: u32, dll: &str) -> PathBuf {
            let dir = self.game.mods_cache_dir().join("pdx_mods").join(format!("{id}_{ver}"));
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join(dll), b"MZ fake").unwrap();
            dir
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
        let user = root.join("user");
        std::fs::create_dir_all(user.join("Mods")).unwrap();
        std::fs::write(user.join("version"), "1.6.2f1 (768.21d1) [6300.27778]").unwrap();
        let game = Arc::new(Cities2 {
            services,
            settings: RwLock::new(Cities2Settings { user_dir: Some(user.to_string_lossy().into_owned()), backup_before_changes: false, ..Default::default() }),
            ops_lock: Mutex::new(()),
            last_issues: Mutex::new(None),
        });
        Fixture { game, root }
    }
}
