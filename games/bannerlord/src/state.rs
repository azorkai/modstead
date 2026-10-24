//! Bannerlord paketinin durumu: ayarlar, önbellekli modül taraması, kurulum kayıtları ve
//! LauncherData.xml'e yazan ortak adımlar. Komutlar (`commands.rs`) ve `Game` uygulaması bunu kullanır.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock, RwLock, Weak};

use modstead_core::{AppError, AppResult, Services, fsx};

use crate::detect::{self, GameDirs};
use crate::images::ImageCache;
use crate::install::InstallRecord;
use crate::launcher::launcher_data::{self, UserModData};
use crate::modules::sort::{self, ModEntry};
use crate::modules::submodule::ModuleInfo;
use crate::modules::validate::{self, Issue, Severity};
use crate::modules::version::AppVersion;
use crate::modules::{self, Catalog};
use crate::settings::BannerlordSettings;
use crate::{ID, INFO};

#[derive(Clone)]
pub struct Snapshot {
    pub game: GameDirs,
    pub catalog: Catalog,
}

pub struct Bannerlord {
    pub services: Arc<Services>,
    settings: RwLock<BannerlordSettings>,
    snapshot: RwLock<Option<Snapshot>>,
    /// Modules klasörüne ve LauncherData.xml'e yazan işlemleri sıraya sokar.
    pub write_lock: tokio::sync::Mutex<()>,
    /// Son güncelleme denetiminde bulunan güncelleme sayısı (ana sayfa kartı).
    pub updates: RwLock<Option<u32>>,
    pub images: ImageCache,
    app: OnceLock<tauri::AppHandle>,
    me: OnceLock<Weak<Bannerlord>>,
}

impl Bannerlord {
    pub fn new(services: Arc<Services>) -> Self {
        crate::migrate::from_otag(&services);
        let settings = fsx::read_json(&services.paths.game_data(ID).join("settings.json"));
        let images = ImageCache::new(&services.paths.game_local(ID));
        Bannerlord {
            services,
            settings: RwLock::new(settings),
            snapshot: RwLock::new(None),
            write_lock: tokio::sync::Mutex::new(()),
            updates: RwLock::new(None),
            images,
            app: OnceLock::new(),
            me: OnceLock::new(),
        }
    }

    /// Kabuk kaydı: pencere (oyun açılınca küçültmek için) ve görevlerin kullanacağı kendi `Arc`'ı.
    pub fn attach(self: &Arc<Self>, app: tauri::AppHandle) {
        let _ = self.app.set(app);
        let _ = self.me.set(Arc::downgrade(self));
    }

    pub fn app(&self) -> Option<&tauri::AppHandle> {
        self.app.get()
    }

    pub fn arc(&self) -> AppResult<Arc<Bannerlord>> {
        self.me.get().and_then(Weak::upgrade).ok_or_else(|| AppError::msg("bannerlord: not attached"))
    }

    // ───────────── Veri dosyaları ─────────────

    pub fn data_dir(&self) -> PathBuf {
        self.services.paths.game_data(ID)
    }

    pub fn profiles_path(&self) -> PathBuf {
        self.data_dir().join("profiles.json")
    }

    fn installs_path(&self) -> PathBuf {
        self.data_dir().join("installs.json")
    }

    fn launcher_backups(&self) -> PathBuf {
        self.data_dir().join("launcherdata-backups")
    }

    pub fn settings(&self) -> BannerlordSettings {
        self.settings.read().unwrap().clone()
    }

    pub fn save_settings(&self, s: BannerlordSettings) -> AppResult<()> {
        fsx::write_json(&self.data_dir().join("settings.json"), &s)?;
        *self.settings.write().unwrap() = s;
        Ok(())
    }

    pub fn installs(&self) -> HashMap<String, InstallRecord> {
        fsx::read_json(&self.installs_path())
    }

    pub fn save_installs(&self, map: &HashMap<String, InstallRecord>) -> AppResult<()> {
        fsx::write_json(&self.installs_path(), map)
    }

    // ───────────── Oyun ve modüller ─────────────

    pub fn game_dirs(&self) -> Option<GameDirs> {
        detect::detect(self.settings().game_path.as_deref(), &self.services.paths.documents)
    }

    /// Oyunu bulur ve modülleri yeniden tarar.
    pub fn refresh(&self) -> AppResult<Snapshot> {
        let game = self.game_dirs().ok_or_else(|| AppError::GameNotFound(INFO.name.into()))?;
        let catalog = modules::scan(&game);
        let snap = Snapshot { game, catalog };
        *self.snapshot.write().unwrap() = Some(snap.clone());
        Ok(snap)
    }

    /// Önbellekteki tarama; yoksa tarar.
    pub fn current(&self) -> AppResult<Snapshot> {
        if let Some(s) = self.snapshot.read().unwrap().clone() {
            return Ok(s);
        }
        self.refresh()
    }

    pub fn invalidate(&self) {
        *self.snapshot.write().unwrap() = None;
    }

    /// Oyun klasöründeki çalışma alanı. Otağ `.otag` kullanıyordu; yeni dosyalar `.modstead`'e yazılır.
    pub fn work_root(game: &GameDirs) -> PathBuf {
        PathBuf::from(&game.root).join(".modstead")
    }

    pub fn staging_dir(game: &GameDirs) -> PathBuf {
        Self::work_root(game).join("staging")
    }

    /// Yedek klasörleri: ilki yeni yedeklerin yazıldığı yer, ikincisi Otağ'dan kalanlar.
    pub fn backups_dirs(game: &GameDirs) -> Vec<PathBuf> {
        vec![Self::work_root(game).join("backups"), PathBuf::from(&game.root).join(".otag").join("backups")]
    }

    /// LauncherData.xml'deki sıradan başlayan tam liste.
    pub fn saved_order(snap: &Snapshot) -> Vec<ModEntry> {
        let ld = launcher_data::read(Path::new(&snap.game.launcher_data)).unwrap_or_default();
        modules::initial_order(&snap.catalog, &ld.singleplayer)
    }

    pub fn issues_for(order: &[ModEntry], snap: &Snapshot) -> Vec<Issue> {
        let mut issues = validate::validate(order, &snap.catalog, Some(&snap.game.version));
        let sorted = sort::sort(order, &snap.catalog.map());
        if let Some(i) = validate::cycle_issue(&sorted.cycle) {
            issues.insert(0, i);
        }
        issues
    }

    /// Ana sayfa kartı için hata + uyarı sayısı.
    pub fn issue_count(snap: &Snapshot) -> u32 {
        let order = Self::saved_order(snap);
        Self::issues_for(&order, snap).iter().filter(|i| i.severity != Severity::Info).count() as u32
    }

    /// Sırayı LauncherData.xml'e yazar (önce yedek alınır, yazılan geri okunup doğrulanır).
    pub fn write_order(&self, snap: &Snapshot, order: &[ModEntry]) -> AppResult<()> {
        if detect::is_running() {
            return Err(AppError::GameRunning(INFO.name.into()));
        }
        let path = PathBuf::from(&snap.game.launcher_data);
        let mut ld = launcher_data::read(&path)?;
        let map = snap.catalog.map();
        let mut sp: Vec<UserModData> = Vec::new();
        for e in order {
            let Some(m) = map.get(&e.id.to_lowercase()) else { continue };
            let prev = ld.singleplayer.iter().find(|x| x.id.eq_ignore_ascii_case(&m.id));
            sp.push(UserModData { id: m.id.clone(), last_known_version: launcher_version(m, prev), is_selected: e.enabled });
        }
        // Kurulu olmayan eski kayıtları koru (başlatıcı da böyle yapıyor).
        for old in &ld.singleplayer {
            if !sp.iter().any(|x| x.id.eq_ignore_ascii_case(&old.id)) {
                sp.push(old.clone());
            }
        }
        ld.singleplayer = sp;
        if ld.game_type.is_empty() {
            ld.game_type = "Singleplayer".into();
        }
        launcher_data::write(&path, &ld, &self.launcher_backups())
    }

    /// Yeni kurulan modülleri listeye ekler; ayara göre etkinleştirir ve sıralar.
    pub fn place_new_modules(&self, ids: &[String]) -> AppResult<()> {
        let settings = self.settings();
        let snap = self.refresh()?;
        let mut order = Self::saved_order(&snap);
        if settings.enable_after_install {
            for id in ids {
                if let Some(e) = order.iter_mut().find(|e| e.id.eq_ignore_ascii_case(id)) {
                    e.enabled = true;
                }
            }
        }
        if settings.auto_sort {
            order = sort::sort(&order, &snap.catalog.map()).order;
        }
        self.write_order(&snap, &order)
    }

    /// Önceki oturumdan kalan karantina ve yarım kurulumları temizler.
    pub fn cleanup(&self) {
        let Ok(snap) = self.current() else { return };
        if self.services.jobs.active_count(Some(ID)) == 0 {
            for root in [Self::staging_dir(&snap.game), PathBuf::from(&snap.game.root).join(".otag").join("staging")] {
                if root.is_dir() {
                    let _ = fsx::remove_dir(&root);
                }
            }
        }
        let backups = Self::backups_dirs(&snap.game);
        crate::install::apply::recover_leftovers(Path::new(&snap.game.modules_dir), &backups[0]);
    }
}

/// LauncherData.xml için sürüm metni: başlatıcı 4 parçalı biçim kullanır (`v2.10.3.0`).
fn launcher_version(m: &ModuleInfo, previous: Option<&UserModData>) -> String {
    if let (Some(prev), Some(cur)) = (previous, AppVersion::parse(&m.version)) {
        if let Some(p) = AppVersion::parse(&prev.last_known_version) {
            if p.parts.iter().take(cur.parts.len()).eq(cur.parts.iter()) {
                return prev.last_known_version.clone();
            }
        }
    }
    match AppVersion::parse(&m.version) {
        Some(v) => {
            let p = |i: usize| v.parts.get(i).copied().unwrap_or(0);
            format!("{}{}.{}.{}.{}", v.kind, p(0), p(1), p(2), p(3))
        }
        None => m.version.clone(),
    }
}
