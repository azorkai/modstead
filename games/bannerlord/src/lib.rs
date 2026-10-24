//! Modstead · Mount & Blade II: Bannerlord oyun paketi (Otağ'dan taşındı).
//!
//! - `detect`: kurulum tespiti ve oyunun klasörleri
//! - `modules`: SubModule.xml okuyucu, sürüm kuralları, yükleme sırası, doğrulama ve tek tık çözümler
//! - `launcher`: LauncherData.xml (yedekli, atomik) ve `_MODULES_` ile doğrudan başlatma
//! - `install`: çekirdeğin kabul hattından sonra modül planı, onaylı kurulum, yedekler
//! - `profiles`, `steam` (Workshop), `images` (logolar), `migrate` (Otağ verisi)
//!
//! Kurallar oyunun gerçek davranışına göre doğrulandı.
//! Kurallar: komutlar `bannerlord_` önekiyle, olaylar `bannerlord://` önekiyle adlandırılır.

pub mod commands;
pub mod detect;
pub mod images;
pub mod install;
pub mod launcher;
pub mod migrate;
pub mod modules;
pub mod profiles;
pub mod settings;
pub mod state;
pub mod steam;

use std::path::PathBuf;
use std::sync::Arc;

use modstead_core::http::GameHosts;
use modstead_core::intake::Origin;
use modstead_core::nexus::{self, NexusGame};
use modstead_core::prelude::*;
use modstead_core::security::content::ContentPolicy;
use modstead_core::{fsx, stores};
use tauri::Manager;

pub use state::Bannerlord;

pub const ID: &str = "bannerlord";

pub const NEXUS: NexusGame = NexusGame { domain: "mountandblade2bannerlord", id: 3174 };

pub static INFO: GameInfo = GameInfo {
    id: ID,
    name: "Mount & Blade II: Bannerlord",
    short: "Bannerlord",
    nexus: &[NEXUS],
    steam_app_ids: &[detect::STEAM_APP_ID],
    hosts: GameHosts { download: &[], download_suffix: &[], media: &["api.steampowered.com", "images.steamusercontent.com", "steamuserimages-a.akamaihd.net"] },
    content: ContentPolicy { expected_code: &["dll"], info_ext: &[] },
    trusted_sources: &[],
    known_sources: &[("moddb.com", "ModDB"), ("steamcommunity.com", "Steam Workshop")],
};

fn compute_status(game: &Bannerlord) -> GameStatus {
    let running = detect::is_running();
    let snap = match game.refresh() {
        Ok(s) => s,
        Err(_) => {
            return GameStatus {
                notes: vec![StatusNote { tone: Tone::Info, text: tr!("Kurulum bulunamadı. Oyun klasörünü seçin.", "No installation found. Choose the game folder.").into() }],
                running,
                checked_at: fsx::now_ts(),
                ..Default::default()
            };
        }
    };
    let order = Bannerlord::saved_order(&snap);
    let community = |id: &str| snap.catalog.get(id).is_some_and(|m| !m.is_official);
    let mut notes = Vec::new();
    if snap.game.workshop_dir.is_some() {
        notes.push(StatusNote { tone: Tone::Info, text: tr!("Steam Workshop modülleri de okunuyor.", "Steam Workshop modules are read too.").into() });
    }
    let blocked = snap.catalog.effective.iter().filter(|m| m.blocked_dll_count() > 0).count();
    if blocked > 0 {
        notes.push(StatusNote {
            tone: Tone::Warn,
            text: tr!(format!("{blocked} modülün DLL'leri Windows tarafından engelli."), format!("{blocked} module(s) have DLLs blocked by Windows.")),
        });
    }
    let root = PathBuf::from(&snap.game.root);
    GameStatus {
        installed: true,
        installs: vec![InstallSummary {
            label: match snap.game.detected_by.as_str() {
                "steam" => "Steam".into(),
                "gog" => "GOG".into(),
                "epic" => "Epic Games".into(),
                _ => tr!("Elle seçildi", "Chosen manually").into(),
            },
            path: snap.game.root.clone(),
            version: Some(snap.game.version.clone()).filter(|v| !v.is_empty()),
            store: stores::store_of(&root).into(),
            running,
        }],
        running,
        mods: Some(snap.catalog.effective.iter().filter(|m| !m.is_official).count() as u32),
        enabled: Some(order.iter().filter(|e| e.enabled && community(&e.id)).count() as u32),
        issues: Some(Bannerlord::issue_count(&snap)),
        updates: *game.updates.read().unwrap(),
        notes,
        checked_at: fsx::now_ts(),
    }
}

impl Game for Bannerlord {
    fn info(&self) -> &GameInfo {
        &INFO
    }

    fn status(&self) -> BoxFuture<'_, GameStatus> {
        // Tarama birkaç düzine küçük XML okur; ucuzdur.
        Box::pin(async move { compute_status(self) })
    }

    fn detect(&self) -> BoxFuture<'_, Vec<InstallCandidate>> {
        Box::pin(async move {
            tokio::task::spawn_blocking(|| {
                detect::candidates()
                    .into_iter()
                    .map(|(p, store)| InstallCandidate { version: detect::read_version(&p), label: store.to_uppercase(), path: p.to_string_lossy().into_owned(), store: store.into() })
                    .collect()
            })
            .await
            .unwrap_or_default()
        })
    }

    fn set_install_path(&self, path: String) -> BoxFuture<'_, AppResult<GameStatus>> {
        Box::pin(async move {
            let mut p = PathBuf::from(path.trim());
            if !detect::is_valid_root(&p) {
                if let Some(root) = p.ancestors().skip(1).take(3).find(|a| detect::is_valid_root(a)) {
                    p = root.to_path_buf();
                }
            }
            if !detect::is_valid_root(&p) {
                return Err(AppError::msg(tr!(
                    "Bu klasörde Bannerlord bulunamadı (bin\\Win64_Shipping_Client\\Bannerlord.exe ve Modules\\Native gerekli).",
                    "Bannerlord was not found in this folder (bin\\Win64_Shipping_Client\\Bannerlord.exe and Modules\\Native are required)."
                )));
            }
            let mut s = self.settings();
            s.game_path = Some(fsx::dunce(&p).to_string_lossy().into_owned());
            self.save_settings(s)?;
            self.invalidate();
            self.services.game_changed(ID);
            Ok(self.status().await)
        })
    }

    /// Ana sayfadaki "Oyna": LauncherData'daki sırayla, doğrudan (resmî başlatıcı açılmadan).
    fn launch(&self) -> BoxFuture<'_, AppResult<()>> {
        Box::pin(async move {
            let options = launcher::launch::LaunchOptions { continue_game: false, use_blse: self.settings().prefer_blse };
            commands::launch_with(self, None, options).await
        })
    }

    fn handle_nxm(&self, url: String) -> BoxFuture<'_, AppResult<JobSnapshot>> {
        Box::pin(async move {
            let link = nexus::parse_nxm(&url)?;
            if !link.domain.eq_ignore_ascii_case(NEXUS.domain) {
                return Err(AppError::msg(tr!("Bu bağlantı Bannerlord'a ait değil.", "This link is not for Bannerlord.")));
            }
            let title = format!("Nexus #{}", link.mod_id);
            Ok(install::spawn(&self.arc()?, &title, "nexus", Origin::Nexus { game: NEXUS, mod_id: link.mod_id, file_id: link.file_id, nxm: Some(link) }))
        })
    }

    fn install_files(&self, paths: Vec<String>) -> BoxFuture<'_, AppResult<Vec<JobSnapshot>>> {
        Box::pin(async move { commands::install_local_paths(&self.arc()?, paths) })
    }

    fn discard_job(&self, job: &JobHandle) {
        install::discard(job);
    }
}

pub fn init(app: &tauri::AppHandle, services: Arc<Services>) -> Arc<dyn Game> {
    let game = Arc::new(Bannerlord::new(services));
    game.attach(app.clone());
    app.manage(game.clone());
    // Önceki oturumdan kalan karantina ve yarım kurulumlar (açılışı bekletmeden).
    let g = game.clone();
    std::thread::spawn(move || g.cleanup());
    game
}

/// Bu oyunun Tauri komutları (adları `bannerlord_` ile başlar).
pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::bannerlord_game,
        commands::bannerlord_overview,
        commands::bannerlord_validate_order,
        commands::bannerlord_sort_order,
        commands::bannerlord_save_order,
        commands::bannerlord_launch,
        commands::bannerlord_reset_game_folder,
        commands::bannerlord_unblock_module,
        commands::bannerlord_unblock_all,
        commands::bannerlord_uninstall_module,
        commands::bannerlord_retire_copy,
        commands::bannerlord_module_details,
        commands::bannerlord_open_path,
        commands::bannerlord_list_backups,
        commands::bannerlord_restore_backup,
        commands::bannerlord_delete_backup,
        commands::bannerlord_list_profiles,
        commands::bannerlord_save_profile,
        commands::bannerlord_rename_profile,
        commands::bannerlord_delete_profile,
        commands::bannerlord_apply_profile,
        commands::bannerlord_export_profile,
        commands::bannerlord_import_profile,
        commands::bannerlord_get_settings,
        commands::bannerlord_update_settings,
        commands::bannerlord_nexus_search,
        commands::bannerlord_nexus_mod,
        commands::bannerlord_github_repo,
        commands::bannerlord_install_nexus,
        commands::bannerlord_install_github,
        commands::bannerlord_install_local,
        commands::bannerlord_confirm_job,
        commands::bannerlord_check_updates,
        commands::bannerlord_module_images,
        commands::bannerlord_steam_lookup,
        commands::bannerlord_steam_open,
    ]
}

#[cfg(test)]
mod smoke {
    //! Bu bilgisayardaki gerçek kurulumla salt okunur denemeler (pencere açmaz, oyuna yazmaz):
    //! `cargo test -p game-bannerlord real_ -- --ignored --nocapture`
    use super::*;

    fn services() -> Arc<Services> {
        let tmp = std::env::temp_dir().join(format!("modstead-bl-real-{}", fsx::short_id()));
        let documents = PathBuf::from(std::env::var("USERPROFILE").unwrap()).join("Documents");
        let paths = modstead_core::paths::Paths { data: tmp.join("data"), local: tmp.join("local"), documents };
        let http = modstead_core::http::Http::new(modstead_core::http::HttpPolicy::core().with(&INFO.hosts), "Modstead-test");
        Arc::new(Services::new("0.0.0", paths, Arc::new(modstead_core::events::NoopSink), http))
    }

    #[test]
    #[ignore]
    fn real_install() {
        let game = Bannerlord::new(services());
        let snap = game.refresh().expect("oyun bulunamadı");
        let order = Bannerlord::saved_order(&snap);
        let issues = Bannerlord::issues_for(&order, &snap);
        println!("oyun: {} ({}, {})", snap.game.root, snap.game.version, snap.game.detected_by);
        println!("modüller: {} etkin kopya, {} gölgede, {} sırada etkin", snap.catalog.effective.len(), snap.catalog.shadowed.len(), order.iter().filter(|e| e.enabled).count());
        for i in &issues {
            println!("  [{:?}] {}", i.severity, i.title);
        }
        let status = compute_status(&game);
        println!("kart: {}", serde_json::to_string(&status).unwrap());
        assert!(!snap.catalog.effective.is_empty());
    }

    #[test]
    #[ignore]
    fn real_images_and_updates() {
        let game = Bannerlord::new(services());
        let snap = game.refresh().expect("oyun bulunamadı");
        let rt = tokio::runtime::Runtime::new().unwrap();
        let images = rt.block_on(game.images.resolve(&game.services.http, &snap.catalog, &game.installs(), false));
        println!("logolar: {}/{}", images.len(), snap.catalog.effective.iter().filter(|m| !m.is_official).count());
        for (k, v) in images.iter().take(5) {
            println!("  {k} → {v}");
        }
        assert!(!images.is_empty());
    }
}
