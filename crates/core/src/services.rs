//! Her oyuna verilen ortak servisler: yollar, olay hattı, HTTP istemcileri, görevler, genel ayarlar.

use std::sync::{Arc, RwLock};

use serde::Serialize;
use serde_json::json;

use crate::error::AppResult;
use crate::events::{EventSink, names};
use crate::fsx;
use crate::game::Tone;
use crate::http::Http;
use crate::jobs::JobManager;
use crate::paths::Paths;
use crate::security::SecurityPolicy;
use crate::settings::Settings;

pub struct Services {
    pub version: String,
    pub paths: Paths,
    pub events: Arc<dyn EventSink>,
    pub http: Http,
    pub jobs: JobManager,
    settings: RwLock<Settings>,
}

impl Services {
    pub fn new(version: &str, paths: Paths, events: Arc<dyn EventSink>, http: Http) -> Self {
        let _ = std::fs::create_dir_all(&paths.data);
        let _ = std::fs::create_dir_all(&paths.local);
        let settings: Settings = fsx::read_json(&paths.settings_file());
        crate::i18n::set_language(&settings.language);
        Services { version: version.to_string(), jobs: JobManager::new(events.clone()), paths, events, http, settings: RwLock::new(settings) }
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().unwrap().clone()
    }

    /// Ayarı değiştirir, diske yazar ve dili uygular.
    pub fn update_settings(&self, f: impl FnOnce(&mut Settings)) -> AppResult<Settings> {
        let mut s = self.settings();
        f(&mut s);
        fsx::write_json(&self.paths.settings_file(), &s)?;
        crate::i18n::set_language(&s.language);
        *self.settings.write().unwrap() = s.clone();
        Ok(s)
    }

    pub fn security_policy(&self) -> SecurityPolicy {
        self.settings().security_policy()
    }

    pub fn emit(&self, event: &str, payload: impl Serialize) {
        if let Ok(v) = serde_json::to_value(payload) {
            self.events.emit(event, v);
        }
    }

    /// Bir oyunun durumu değişti (kart ve kenar çubuğu yenilensin).
    pub fn game_changed(&self, game: &str) {
        self.emit(names::GAME_CHANGED, json!({ "game": game }));
    }

    /// Kullanıcıya kısa bildirim.
    pub fn notify(&self, tone: Tone, title: impl Into<String>, detail: Option<String>) {
        self.emit(names::NOTIFY, json!({ "tone": tone, "title": title.into(), "detail": detail }));
    }

    /// Testler için: diske ve arayüze dokunmayan servisler.
    pub fn for_tests() -> Arc<Services> {
        let root = std::env::temp_dir().join(format!("modstead-test-{}", fsx::short_id()));
        let paths = Paths { data: root.join("data"), local: root.join("local"), documents: root.join("docs") };
        Arc::new(Services::new("0.0.0", paths, Arc::new(crate::events::NoopSink), Http::new(crate::http::HttpPolicy::core(), "Modstead-test")))
    }
}
