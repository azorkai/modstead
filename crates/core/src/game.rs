//! Oyun sözleşmesi. Her oyun paketi (`games/<id>`) bu arayüzü uygular ve kabuğa kaydolur.
//!
//! Sözleşme bilerek küçüktür: kabuğun oyunlar arası ihtiyaç duyduğu şeyler (ana sayfa kartı,
//! ilk kurulum sihirbazı, "Oyna", nxm yönlendirme, bırakılan dosyalar). Oyunun asıl ekranları
//! kendi Tauri komutlarıyla (`<id>_...`) çalışır; bkz. docs/MIMARI.md.

use std::sync::Arc;

use futures_util::future::BoxFuture;
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::http::GameHosts;
use crate::jobs::{JobHandle, JobSnapshot};
use crate::nexus::NexusGame;
use crate::security::content::ContentPolicy;

/// Oyunun durağan tanımı.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameInfo {
    /// Kalıcı kimlik: komut öneki (`<id>_`), olay öneki (`<id>://`), veri klasörü adı.
    pub id: &'static str,
    pub name: &'static str,
    pub short: &'static str,
    /// Nexus'taki oyun(lar). MSFS'in 2020 ve 2024 için iki ayrı alanı vardır.
    pub nexus: &'static [NexusGame],
    pub steam_app_ids: &'static [u32],
    /// İndirme izin listesine eklenecek sunucular.
    #[serde(skip)]
    pub hosts: GameHosts,
    /// Arşiv içerik denetiminde bu oyun için olağan dosya türleri.
    #[serde(skip)]
    pub content: ContentPolicy,
    /// Kaynak güveni için "güvenilir" ve "bilinen" mod siteleri (alan adı, görünen ad).
    #[serde(skip)]
    pub trusted_sources: &'static [(&'static str, &'static str)],
    #[serde(skip)]
    pub known_sources: &'static [(&'static str, &'static str)],
}

impl GameInfo {
    pub fn nexus_game(&self, domain: &str) -> Option<NexusGame> {
        self.nexus.iter().copied().find(|g| g.domain.eq_ignore_ascii_case(domain))
    }
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Tone {
    Info,
    Ok,
    Warn,
    Danger,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatusNote {
    pub tone: Tone,
    pub text: String,
}

/// Bir kurulum (MSFS'te 2020 ve 2024 ayrı kurulumlardır).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallSummary {
    /// Kısa etiket: "Steam", "MSFS 2024 · Microsoft Store"…
    pub label: String,
    pub path: String,
    pub version: Option<String>,
    /// "steam" | "gog" | "epic" | "xbox" | "store" | "manual"
    pub store: String,
    pub running: bool,
}

/// Ana sayfa kartı ve kenar çubuğu için özet. Ucuz olmalı (önbellek ya da hızlı sayım).
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameStatus {
    pub installed: bool,
    pub installs: Vec<InstallSummary>,
    pub running: bool,
    pub mods: Option<u32>,
    pub enabled: Option<u32>,
    /// Hata + uyarı sayısı (biliniyorsa).
    pub issues: Option<u32>,
    pub updates: Option<u32>,
    pub notes: Vec<StatusNote>,
    pub checked_at: i64,
}

/// İlk kurulum sihirbazında gösterilen aday kurulum.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallCandidate {
    pub path: String,
    pub store: String,
    pub version: Option<String>,
    pub label: String,
}

pub trait Game: Send + Sync + 'static {
    fn info(&self) -> &GameInfo;

    /// Ana sayfa kartı için durum.
    fn status(&self) -> BoxFuture<'_, GameStatus>;

    /// Bu bilgisayardaki kurulumlar (ilk kurulum sihirbazı).
    fn detect(&self) -> BoxFuture<'_, Vec<InstallCandidate>>;

    /// Oyun klasörünü elle seçer.
    fn set_install_path(&self, path: String) -> BoxFuture<'_, AppResult<GameStatus>>;

    /// Oyunu başlatır (ana sayfadaki "Oyna").
    fn launch(&self) -> BoxFuture<'_, AppResult<()>>;

    /// Bu oyuna ait bir nxm bağlantısını karşılar (kurulum görevi başlatır).
    fn handle_nxm(&self, _url: String) -> BoxFuture<'_, AppResult<JobSnapshot>> {
        let name = self.info().name;
        Box::pin(async move {
            Err(AppError::msg(tr!(
                format!("{name} için Nexus bağlantıları henüz desteklenmiyor."),
                format!("Nexus links are not supported for {name} yet.")
            )))
        })
    }

    /// Pencereye bırakılan arşivleri kurar (her dosya için bir görev).
    fn install_files(&self, _paths: Vec<String>) -> BoxFuture<'_, AppResult<Vec<JobSnapshot>>> {
        let name = self.info().name;
        Box::pin(async move {
            Err(AppError::msg(tr!(
                format!("{name} için dosyadan kurulum henüz bağlanmadı."),
                format!("Installing from files is not wired up for {name} yet.")
            )))
        })
    }

    /// Görev listeden kaldırıldı ya da iptal edildi: karantina klasörünü temizle.
    fn discard_job(&self, _job: &JobHandle) {}

    /// Modstead şu an yeniden başlatılırsa bu oyunda yarım kalacak bir iş var mı (Modstead'e bağlı açık oyun,
    /// izlenen oturum…)? Kabuk, uygulamayı kapatan işleri (ör. Modstead güncellemesini kurmak) bu doğruyken
    /// yapmaz. Ucuz olmalı. Varsayılan: hayır (oyun yalnızca kapalıyken modlanıyorsa açık olması engel değildir).
    fn busy(&self) -> BoxFuture<'_, bool> {
        Box::pin(async { false })
    }
}

/// Kayıtlı oyunlar (sıra = kenar çubuğundaki varsayılan sıra).
#[derive(Clone)]
pub struct GameRegistry {
    games: Vec<Arc<dyn Game>>,
}

impl GameRegistry {
    pub fn new(games: Vec<Arc<dyn Game>>) -> Self {
        GameRegistry { games }
    }

    pub fn all(&self) -> &[Arc<dyn Game>] {
        &self.games
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn Game>> {
        self.games.iter().find(|g| g.info().id == id).cloned()
    }

    pub fn require(&self, id: &str) -> AppResult<Arc<dyn Game>> {
        self.get(id).ok_or_else(|| AppError::NotFound(format!("{}: {id}", tr!("oyun", "game"))))
    }

    /// nxm bağlantısının alan adına göre oyun.
    pub fn by_nexus_domain(&self, domain: &str) -> Option<Arc<dyn Game>> {
        self.games.iter().find(|g| g.info().nexus_game(domain).is_some()).cloned()
    }

    pub fn infos(&self) -> Vec<GameInfo> {
        self.games.iter().map(|g| g.info().clone()).collect()
    }
}
