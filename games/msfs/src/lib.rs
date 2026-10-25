//! Modstead · Microsoft Flight Simulator 2020 & 2024 oyun paketi (Hangar'dan taşındı).
//!
//! Model: modların gerçek dosyaları tek bir kütüphane klasöründe durur; bir modu bir simde etkinleştirmek,
//! o simin Community klasörüne kütüphanedeki pakete işaret eden bir junction koymaktır (`linker`).
//! Tarama (`scanner`) kütüphaneyi ve Community klasörlerini okur, her paketin her simdeki durumunu, çakışmaları
//! (`conflicts`) ve "gerçekten yüklenip çalışacak mı" denetimlerini (`readiness`: Content.xml, exe.xml'deki
//! yardımcı programlar, yol uzunluğu) çıkarır. Kurulum ortak kabul hattından geçer (`install`).
//!
//! Kurallar: komutlar `msfs_` önekiyle, olaylar `msfs://` önekiyle adlandırılır.

pub mod browser;
pub mod career;
pub mod catalog;
pub mod commands;
pub mod conflicts;
pub mod exexml;
pub mod install;
pub mod linker;
pub mod migrate;
pub mod package;
pub mod readiness;
pub mod scanner;
pub mod settings;
pub mod sims;
pub mod store;
pub mod util;

#[cfg(test)]
mod flow_tests;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Instant;

use modstead_core::http::GameHosts;
use modstead_core::nexus::NexusGame;
use modstead_core::prelude::*;
use modstead_core::security::content::ContentPolicy;
use modstead_core::{fsx, platform};
use tauri::Manager;

use crate::catalog::CatalogItem;
use crate::scanner::{ModEntry, ScanCache, ScanResult};
use crate::settings::MsfsSettings;
use crate::sims::SimInstall;
use crate::store::{Db, Profile};

pub const ID: &str = "msfs";

pub static INFO: GameInfo = GameInfo {
    id: ID,
    name: "Microsoft Flight Simulator",
    short: "MSFS",
    // DOĞRULANMALI: alan adı doğru, sayısal kimlik henüz Nexus'tan teyit edilmedi (GraphQL sorgularında kullanılır).
    nexus: &[NexusGame { domain: "microsoftflightsimulator", id: 3407 }],
    steam_app_ids: &[sims::STEAM_APP_2024, sims::STEAM_APP_2020],
    hosts: GameHosts { download: &[], download_suffix: &[], media: &[] },
    // MSFS paketlerinde DLL/EXE olmaz; WASM modülleri simin korumalı alanında çalışır.
    content: ContentPolicy { expected_code: &[], info_ext: &["wasm"] },
    trusted_sources: &[
        ("flightsim.to", "Flightsim.to"),
        ("flybywiresim.com", "FlyByWire"),
        ("fsdreamteam.com", "FSDreamTeam"),
        ("orbxdirect.com", "Orbx"),
        ("simmarket.com", "simMarket"),
        ("navigraph.com", "Navigraph"),
        ("inibuilds.com", "iniBuilds"),
        ("pmdg.com", "PMDG"),
    ],
    known_sources: &[
        ("flyawaysimulation.com", "Fly Away Simulation"),
        ("simviation.com", "Simviation"),
        ("avsim.com", "AVSIM"),
        ("msfsaddons.com", "MSFS Addons"),
        ("drive.google.com", "Google Drive"),
        ("dropbox.com", "Dropbox"),
        ("mediafire.com", "MediaFire"),
        ("mega.nz", "MEGA"),
    ],
};

/// Oyunun çalışma durumu (ayarlar, mod kayıtları, son tarama).
pub struct Inner {
    pub data_dir: PathBuf,
    pub settings: RwLock<MsfsSettings>,
    pub db: Mutex<Db>,
    pub profiles: Mutex<Vec<Profile>>,
    pub cache: Mutex<ScanCache>,
    pub last_scan: RwLock<Option<Arc<ScanResult>>>,
    pub catalog: Mutex<Option<(Instant, Vec<CatalogItem>)>>,
    /// Dosya sistemi işlemleri (bağla/çöz/taşı) sıra ile yapılsın.
    pub fs_lock: Mutex<()>,
    /// Mod tarayıcısındaki indirmeler: adres → görev kimliği.
    pub browser_downloads: Mutex<HashMap<String, String>>,
    /// Kariyer kipi (ilk kullanımda açılır).
    pub career: OnceLock<Arc<career::Career>>,
}

/// MSFS oyunu. Klonlamak ucuzdur (arka plan görevleri kendi kopyasını taşır).
#[derive(Clone)]
pub struct Msfs {
    pub services: Arc<Services>,
    pub inner: Arc<Inner>,
}

impl Msfs {
    /// Hangar'ın verisi varsa ilk açılışta aktarır.
    pub fn new(services: Arc<Services>) -> Self {
        let data_dir = services.paths.game_data(ID);
        if let Some(from) = migrate::hangar_dir() {
            if let Some(m) = migrate::run(&from, &data_dir, &migrate::store_secret_if_empty) {
                log::info!("Hangar verisi aktarıldı: {m:?}");
            }
        }
        Self::open(services, data_dir)
    }

    /// Aktarım yapmadan açar (testler).
    pub fn open(services: Arc<Services>, data_dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&data_dir);
        let inner = Inner {
            settings: RwLock::new(fsx::read_json(&data_dir.join("settings.json"))),
            db: Mutex::new(fsx::read_json(&data_dir.join("mods.json"))),
            profiles: Mutex::new(fsx::read_json(&data_dir.join("profiles.json"))),
            cache: Mutex::new(ScanCache::default()),
            last_scan: RwLock::new(None),
            catalog: Mutex::new(None),
            fs_lock: Mutex::new(()),
            browser_downloads: Mutex::new(HashMap::new()),
            career: OnceLock::new(),
            data_dir,
        };
        Msfs { services, inner: Arc::new(inner) }
    }

    pub fn settings(&self) -> MsfsSettings {
        self.inner.settings.read().unwrap().clone()
    }

    pub fn update_settings(&self, f: impl FnOnce(&mut MsfsSettings)) -> AppResult<MsfsSettings> {
        let mut s = self.settings();
        f(&mut s);
        fsx::write_json(&self.inner.data_dir.join("settings.json"), &s)?;
        *self.inner.settings.write().unwrap() = s.clone();
        *self.inner.last_scan.write().unwrap() = None;
        Ok(s)
    }

    pub fn save_db(&self) {
        let db = self.inner.db.lock().unwrap().clone();
        if let Err(e) = fsx::write_json(&self.inner.data_dir.join("mods.json"), &db) {
            log::warn!("mod kayıtları yazılamadı: {e}");
        }
    }

    pub fn save_profiles(&self) {
        let p = self.inner.profiles.lock().unwrap().clone();
        if let Err(e) = fsx::write_json(&self.inner.data_dir.join("profiles.json"), &p) {
            log::warn!("profiller yazılamadı: {e}");
        }
    }

    pub fn sims(&self) -> Vec<SimInstall> {
        sims::detect_sims(&self.settings())
    }

    /// Kariyer kipi. Sim bağlantısı yalnızca uygulamada (`init`) başlar.
    pub fn career(&self) -> Arc<career::Career> {
        self.inner
            .career
            .get_or_init(|| {
                let me = self.clone();
                career::Career::open(self.services.clone(), Arc::new(move || me.sims()))
            })
            .clone()
    }

    pub fn library(&self) -> AppResult<PathBuf> {
        match self.settings().library_path {
            Some(p) => {
                std::fs::create_dir_all(&p)?;
                Ok(p)
            }
            None => Err(AppError::msg(tr!("Önce MSFS ayarlarından bir kütüphane klasörü seçin.", "Choose a library folder in the MSFS settings first."))),
        }
    }

    /// Diski yeniden tarar (engelleyici; arka plan iş parçacığında çağrılmalı).
    pub fn rescan(&self) -> Arc<ScanResult> {
        let sims = self.sims();
        let library = self.settings().library_path;
        let db = self.inner.db.lock().unwrap().clone();
        let result = {
            let mut cache = self.inner.cache.lock().unwrap();
            scanner::scan(sims, library, &db, &mut cache)
        };
        let arc = Arc::new(result);
        *self.inner.last_scan.write().unwrap() = Some(arc.clone());
        arc
    }

    /// Son tarama; yoksa tarar.
    pub fn snapshot(&self) -> Arc<ScanResult> {
        let existing = self.inner.last_scan.read().unwrap().clone();
        existing.unwrap_or_else(|| self.rescan())
    }

    pub fn find_mod(&self, id: &str) -> AppResult<ModEntry> {
        self.snapshot()
            .mods
            .iter()
            .find(|m| m.id == id)
            .cloned()
            .ok_or_else(|| AppError::NotFound(tr!(format!("mod {id}"), format!("mod {id}"))))
    }

    /// Ana sayfa ve kenar çubuğu yenilensin.
    pub fn changed(&self) {
        self.services.game_changed(ID);
    }

    fn compute_status(&self) -> GameStatus {
        let sims = self.sims();
        let detected: Vec<&SimInstall> = sims.iter().filter(|s| s.detected).collect();
        let running = sims.iter().any(|s| s.running);
        if detected.is_empty() {
            return GameStatus {
                notes: vec![StatusNote { tone: Tone::Info, text: tr!("MSFS 2020 ya da 2024 bulunamadı.", "MSFS 2020 or 2024 was not found.").into() }],
                running,
                checked_at: fsx::now_ts(),
                ..Default::default()
            };
        }
        let installs = detected
            .iter()
            .map(|s| InstallSummary {
                label: format!("MSFS {} · {}", s.short, edition_label(&s.edition)),
                path: s.packages_path.as_deref().map(|p| p.display().to_string()).unwrap_or_default(),
                version: None,
                store: if s.edition == "steam" { "steam".into() } else if s.edition == "store" { "store".into() } else { "manual".into() },
                running: s.running,
            })
            .collect();
        let mut notes = Vec::new();
        if self.settings().library_path.is_none() {
            notes.push(StatusNote { tone: Tone::Info, text: tr!("Kütüphane klasörü henüz seçilmedi.", "No library folder chosen yet.").into() });
        }
        // Tarama ucuz değil: son tarama varsa sayılar ondan gelir.
        let scan = self.inner.last_scan.read().unwrap().clone();
        let (mods, enabled, issues) = match &scan {
            Some(s) => (
                Some(s.stats.total as u32),
                Some(s.mods.iter().filter(|m| m.sims.values().any(|st| matches!(st.state.as_str(), "enabled" | "physical" | "foreign"))).count() as u32),
                Some(s.problem_count()),
            ),
            None => (None, None, None),
        };
        GameStatus { installed: true, installs, running, mods, enabled, issues, updates: None, notes, checked_at: fsx::now_ts() }
    }
}

pub fn edition_label(edition: &str) -> &'static str {
    match edition {
        "steam" => "Steam",
        "store" => "Microsoft Store",
        "manual" => tr!("elle seçildi", "manual"),
        "disabled" => tr!("kapalı", "disabled"),
        _ => tr!("bulunamadı", "not found"),
    }
}

impl Game for Msfs {
    fn info(&self) -> &GameInfo {
        &INFO
    }

    fn status(&self) -> BoxFuture<'_, GameStatus> {
        let me = self.clone();
        Box::pin(async move {
            // Kart ilk kez istenirken tarama yoksa arka planda bir kez tara (sonraki istekler ucuz).
            let first = me.inner.last_scan.read().unwrap().is_none();
            tokio::task::spawn_blocking(move || {
                if first && me.settings().library_path.is_some() {
                    me.rescan();
                }
                me.compute_status()
            })
            .await
            .unwrap_or_default()
        })
    }

    fn detect(&self) -> BoxFuture<'_, Vec<InstallCandidate>> {
        let me = self.clone();
        Box::pin(async move {
            tokio::task::spawn_blocking(move || {
                me.sims()
                    .into_iter()
                    .filter(|s| s.detected)
                    .map(|s| InstallCandidate {
                        path: s.packages_path.as_deref().map(|p| p.display().to_string()).unwrap_or_default(),
                        store: if s.edition == "steam" { "steam".into() } else { "store".into() },
                        version: None,
                        label: format!("MSFS {} · {}", s.short, edition_label(&s.edition)),
                    })
                    .collect()
            })
            .await
            .unwrap_or_default()
        })
    }

    fn set_install_path(&self, path: String) -> BoxFuture<'_, AppResult<GameStatus>> {
        let me = self.clone();
        Box::pin(async move {
            // MSFS'te tek bir oyun klasörü yoktur: verilen klasör bir paket klasörüyse (içinde Community var)
            // bulunamayan sime atanır. Ayrıntılı seçim MSFS → Ayarlar'da.
            let p = PathBuf::from(&path);
            if !p.is_absolute() || !p.join("Community").is_dir() {
                return Err(AppError::msg(tr!(
                    "İçinde Community klasörü olan paket klasörünü seçin (ör. D:\\MSFS\\Packages). Sim yollarını MSFS → Ayarlar'dan da ayarlayabilirsiniz.",
                    "Choose the packages folder that contains the Community folder (e.g. D:\\MSFS\\Packages). You can also set sim paths in MSFS → Settings."
                )));
            }
            let sims = me.sims();
            let target = sims.iter().find(|s| !s.detected).map(|s| s.id.clone()).unwrap_or_else(|| sims::SIM_2024.to_string());
            me.update_settings(|s| {
                s.sim_overrides.entry(target).or_default().packages_path = Some(p);
            })?;
            me.changed();
            Ok(tokio::task::spawn_blocking(move || me.compute_status()).await?)
        })
    }

    fn launch(&self) -> BoxFuture<'_, AppResult<()>> {
        let me = self.clone();
        Box::pin(async move {
            let sims = tokio::task::spawn_blocking(move || me.sims()).await?;
            if sims.iter().any(|s| s.running) {
                return Err(AppError::msg(tr!("Simülatör zaten açık.", "The simulator is already running.")));
            }
            // En son kullanılan sim (UserCfg.opt'u en yeni olan).
            let sim = sims.iter().filter(|s| s.detected && s.last_used.is_some()).max_by_key(|s| s.last_used).ok_or_else(|| AppError::GameNotFound(INFO.name.into()))?;
            platform::open_launch_uri(&sims::launch_uri(sim)?)?;
            Ok(())
        })
    }

    fn handle_nxm(&self, url: String) -> BoxFuture<'_, AppResult<JobSnapshot>> {
        let me = self.clone();
        Box::pin(async move { install::start_nxm(&me, &url) })
    }

    fn install_files(&self, paths: Vec<String>) -> BoxFuture<'_, AppResult<Vec<JobSnapshot>>> {
        let me = self.clone();
        Box::pin(async move { paths.iter().map(|p| install::start_path(&me, PathBuf::from(p))).collect() })
    }

    fn discard_job(&self, job: &JobHandle) {
        install::discard(job);
    }
}

pub fn init(app: &tauri::AppHandle, services: Arc<Services>) -> Arc<dyn Game> {
    let game = Msfs::new(services);
    install::clean_stale_staging(&game);
    game.career().start_link();
    app.manage(game.clone());
    Arc::new(game)
}

/// Bu oyunun Tauri komutları (adları `msfs_` ile başlar).
pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::msfs_settings_get,
        commands::msfs_settings_save,
        commands::msfs_sims,
        commands::msfs_suggest_library,
        commands::msfs_snapshot,
        commands::msfs_scan,
        commands::msfs_conflicts,
        commands::msfs_startup_programs,
        commands::msfs_set_enabled,
        commands::msfs_import,
        commands::msfs_uninstall,
        commands::msfs_remove_broken_link,
        commands::msfs_fix_nested,
        commands::msfs_update_meta,
        commands::msfs_rescan_security,
        commands::msfs_verify,
        commands::msfs_apply_fix,
        commands::msfs_launch,
        commands::msfs_reveal,
        commands::msfs_thumbnail,
        commands::msfs_profiles,
        commands::msfs_profile_save,
        commands::msfs_profile_delete,
        commands::msfs_profile_apply,
        commands::msfs_catalog,
        commands::msfs_install_catalog,
        commands::msfs_install_url,
        commands::msfs_confirm_job,
        commands::msfs_open_browser,
        career::commands::msfs_career_state,
        career::commands::msfs_career_create,
        career::commands::msfs_career_reset,
        career::commands::msfs_career_board,
        career::commands::msfs_career_accept,
        career::commands::msfs_career_cancel,
        career::commands::msfs_career_aircraft,
        career::commands::msfs_career_refresh_aircraft,
        career::commands::msfs_career_pick_aircraft,
        career::commands::msfs_career_set_class,
        career::commands::msfs_career_launch,
        career::commands::msfs_career_reposition,
        career::commands::msfs_career_finish,
        career::commands::msfs_career_abandon,
        career::commands::msfs_career_logbook,
        career::commands::msfs_career_flight,
        career::commands::msfs_career_checkride,
        career::commands::msfs_career_travel,
        career::commands::msfs_career_airports,
        career::commands::msfs_career_map_airports,
        career::commands::msfs_career_hud,
        career::commands::msfs_career_hud_install,
        career::commands::msfs_career_hud_remove,
        career::commands::msfs_career_buy,
        career::commands::msfs_career_sell,
        career::commands::msfs_career_repair,
        career::commands::msfs_career_borrow,
        career::commands::msfs_career_repay,
        career::commands::msfs_career_ledger,
        career::commands::msfs_career_live,
        career::commands::msfs_career_simbrief,
        career::commands::msfs_career_reveal_plan,
    ]
}
