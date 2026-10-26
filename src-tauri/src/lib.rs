//! Modstead kabuğu: Tauri kurulumu, oyunların kaydı, olay köprüsü ve komut yönlendirme.
//!
//! Yeni bir oyun eklemek: `games/<id>` paketini oluştur, aşağıdaki `GAMES` listesine ve
//! `Cargo.toml`'a ekle, arayüzde `src/games/registry.ts`'e kaydet. Oyunun komutları `<id>_`
//! önekiyle adlandırılır; kabuk öneke bakıp oyunun kendi komut tablosuna iletir.

mod art;
mod commands;
mod updater;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use modstead_core::events::{EventSink, names};
use modstead_core::http::{Http, HttpPolicy, user_agent};
use modstead_core::nexus::{self, NexusUser};
use modstead_core::paths::Paths;
use modstead_core::{Game, GameInfo, GameRegistry, ResultExt, Services};
use serde_json::{Value, json};
use tauri::{Emitter, Manager};

type Init = fn(&tauri::AppHandle, Arc<Services>) -> Arc<dyn Game>;
type Handler = Box<dyn Fn(tauri::ipc::Invoke) -> bool + Send + Sync>;

/// Kayıtlı oyunlar: (tanım, kurulum, komut öneki). Sıra = varsayılan kenar çubuğu sırası.
const GAMES: &[(&GameInfo, Init)] = &[
    (&game_msfs::INFO, game_msfs::init),
    (&game_bannerlord::INFO, game_bannerlord::init),
    (&game_stardew::INFO, game_stardew::init),
    (&game_cities2::INFO, game_cities2::init),
];

fn game_handlers() -> Vec<(String, Handler)> {
    vec![
        (format!("{}_", game_msfs::ID), Box::new(game_msfs::handler())),
        (format!("{}_", game_bannerlord::ID), Box::new(game_bannerlord::handler())),
        (format!("{}_", game_stardew::ID), Box::new(game_stardew::handler())),
        (format!("{}_", game_cities2::ID), Box::new(game_cities2::handler())),
    ]
}

/// Çekirdeğin olaylarını arayüze iletir.
struct TauriSink(tauri::AppHandle);

impl EventSink for TauriSink {
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.0.emit(event, payload);
    }
}

/// Kabuğun kendi durumu.
pub struct ShellState {
    /// Uygulama açılırken ya da ikinci örnekten gelen, arayüzün henüz almadığı bağlantı ve dosyalar.
    pub pending_nxm: Mutex<Vec<String>>,
    pub pending_files: Mutex<Vec<String>>,
    pub nexus_user: RwLock<Option<NexusUser>>,
    /// Oyun görselleri (`art://`; bkz. art.rs), yokluk dahil oturum boyunca.
    pub art: Mutex<HashMap<String, art::Art>>,
}

fn is_archive_path(arg: &str) -> bool {
    let lower = arg.to_ascii_lowercase();
    (lower.ends_with(".zip") || lower.ends_with(".7z") || lower.ends_with(".rar")) && std::path::Path::new(arg).is_file()
}

/// Komut satırındaki nxm bağlantıları ve arşiv dosyaları.
fn launch_args(argv: &[String]) -> (Vec<String>, Vec<String>) {
    let rest = argv.iter().skip(1).filter(|a| a.len() < 2048);
    let nxm: Vec<String> = rest.clone().filter(|a| a.to_ascii_lowercase().starts_with("nxm://")).cloned().collect();
    let files: Vec<String> = rest.filter(|a| is_archive_path(a)).cloned().collect();
    (nxm, files)
}

fn nxm_payload(registry: &GameRegistry, url: &str) -> Value {
    let game = nexus::nxm_domain(url).and_then(|d| registry.by_nexus_domain(&d)).map(|g| g.info().id);
    json!({ "url": url, "game": game })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shell: Handler = Box::new(tauri::generate_handler![
        commands::app_info,
        commands::games_status,
        commands::game_status,
        commands::game_detect,
        commands::game_set_path,
        commands::game_launch,
        commands::game_install_files,
        commands::settings_get,
        commands::settings_update,
        commands::nexus_status,
        commands::nexus_set_key,
        commands::nexus_clear_key,
        commands::secrets_status,
        commands::secret_set,
        commands::secret_clear,
        commands::nxm_status,
        commands::nxm_register,
        commands::nxm_unregister,
        commands::nxm_open,
        commands::pending_take,
        commands::jobs_list,
        commands::job_cancel,
        commands::job_dismiss,
        commands::jobs_clear,
        commands::open_url,
        commands::open_app_folder,
        updater::update_status,
        updater::update_check,
        updater::update_install,
    ]);
    let games = game_handlers();

    // Geliştirmede birden fazla örnek aynı anda açılabilsin: MODSTEAD_DEV_INSTANCE=<ad> tek örnek
    // kilidini atlar ve veriyi ayrı klasöre yazar (yalnızca hata ayıklama derlemesi; bkz. scripts/dev.mjs).
    let dev_instance = if cfg!(debug_assertions) { std::env::var("MODSTEAD_DEV_INSTANCE").ok().filter(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')) } else { None };
    let mut builder = tauri::Builder::default();
    if dev_instance.is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            let (nxm, files) = launch_args(&argv);
            if let Some(registry) = app.try_state::<GameRegistry>() {
                for link in nxm {
                    let _ = app.emit(names::NXM, nxm_payload(&registry, &link));
                }
            }
            if !files.is_empty() {
                let _ = app.emit(names::FILES, json!({ "paths": files }));
            }
        }));
    }
    builder
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).max_file_size(2_000_000).build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Uygulamanın kendi güncellemesi; arayüze izni yok, `updater` modülünün komutlarıyla çalışır.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol("art", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_string();
            tauri::async_runtime::spawn(async move {
                let response = match art::serve(&app, &path).await {
                    Some((bytes, mime)) => tauri::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Cache-Control", "max-age=86400")
                        .header("X-Content-Type-Options", "nosniff")
                        .body(bytes)
                        .unwrap(),
                    None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
                };
                responder.respond(response);
            });
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let suffix = |p: std::path::PathBuf| match &dev_instance {
                Some(name) => p.with_file_name(format!("{}-dev-{name}", p.file_name().unwrap_or_default().to_string_lossy())),
                None => p,
            };
            let paths = Paths {
                data: suffix(app.path().app_data_dir().app_err()?),
                local: suffix(app.path().app_local_data_dir().app_err()?),
                documents: app.path().document_dir().app_err()?,
            };
            let policy = GAMES.iter().fold(HttpPolicy::core(), |p, (info, _)| p.with(&info.hosts));
            let http = Http::new(policy, &user_agent(env!("CARGO_PKG_VERSION")));
            let services = Arc::new(Services::new(env!("CARGO_PKG_VERSION"), paths, Arc::new(TauriSink(handle.clone())), http));
            app.manage(updater::Updater::new(&handle, &services));
            app.manage(services.clone());
            let registry = GameRegistry::new(GAMES.iter().map(|(_, init)| init(&handle, services.clone())).collect());
            app.manage(registry);
            let (nxm, files) = launch_args(&std::env::args().collect::<Vec<_>>());
            app.manage(ShellState { pending_nxm: Mutex::new(nxm), pending_files: Mutex::new(files), nexus_user: RwLock::new(None), art: Mutex::new(HashMap::new()) });
            updater::start(handle);
            Ok(())
        })
        .invoke_handler(move |invoke| {
            let target = {
                let cmd = invoke.message.command();
                games.iter().position(|(prefix, _)| cmd.starts_with(prefix.as_str()))
            };
            match target {
                Some(i) => (games[i].1)(invoke),
                None => shell(invoke),
            }
        })
        .run(tauri::generate_context!())
        .expect("Modstead başlatılamadı");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn game_ids_and_prefixes_are_unique() {
        let ids: Vec<&str> = GAMES.iter().map(|(i, _)| i.id).collect();
        let mut sorted = ids.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(ids.len(), sorted.len());
        // Kabuk komutlarının hiçbiri bir oyun önekiyle başlamamalı.
        for (prefix, _) in game_handlers() {
            assert!(!["app_", "games_", "game_", "settings_", "nexus_", "secret", "nxm_", "pending_", "job", "open_", "update_"].contains(&prefix.as_str()));
        }
    }

    /// Bu bilgisayardaki gerçek kurulumlarla salt okunur deneme (pencere açmaz):
    /// `cargo test -p modstead real_status -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_status() {
        let tmp = std::env::temp_dir().join("modstead-real-status");
        let documents = std::path::PathBuf::from(std::env::var("USERPROFILE").unwrap()).join("Documents");
        let paths = Paths { data: tmp.join("data"), local: tmp.join("local"), documents };
        let http = Http::new(HttpPolicy::core(), "Modstead-test");
        let services = Arc::new(Services::new("0.0.0", paths, Arc::new(modstead_core::events::NoopSink), http));
        let games: Vec<Arc<dyn Game>> = vec![
            Arc::new(game_msfs::Msfs::new(services.clone())),
            Arc::new(game_bannerlord::Bannerlord::new(services.clone())),
            Arc::new(game_stardew::Stardew::new(services.clone())),
            Arc::new(game_cities2::Cities2::new(services.clone())),
        ];
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            for g in &games {
                let status = g.status().await;
                println!("── {} ──
{}", g.info().name, serde_json::to_string_pretty(&status).unwrap());
                println!("adaylar: {:?}", g.detect().await.iter().map(|c| &c.path).collect::<Vec<_>>());
            }
        });
    }

    #[test]
    fn parses_launch_args() {
        let (nxm, files) = launch_args(&["modstead.exe".into(), "nxm://stardewvalley/mods/1/files/2?key=a&expires=1".into(), "C:\\nope.zip".into()]);
        assert_eq!(nxm.len(), 1);
        assert!(files.is_empty()); // dosya yoksa alınmaz
    }
}
