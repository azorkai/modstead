//! Modstead'in kendi güncellemesi (`tauri-plugin-updater`, imzalı kurucu).
//!
//! Akış: arka planda denetle (açılıştan kısa süre sonra, sonra ~6 saatte bir) → yeni sürümü indir ve imzasını
//! doğrula → arayüze "hazır" de (`modstead://update`) → kullanıcı "Yeniden başlat"a basınca, hiçbir oyun meşgul
//! değilse (`Game::busy`) ve süren indirme yoksa kurucuyu başlat. Kurucu (NSIS, sessiz ilerleme penceresi)
//! Modstead'i kapatır, kurar ve yeniden açar. Kullanıcı basmazsa bir sonraki açılışta yeniden sunulur.
//!
//! Güvenlik:
//! - Uç nokta ve açık anahtar `tauri.conf.json` → `plugins.updater`'da; bildirim (`latest.json`) bu deponun "son
//!   sürüm" bağlantısından gelir (taslaklar ve ön sürümler oraya düşmez; burada da ön sürüm reddedilir).
//! - Eklenti kurucunun minisign imzasını gömülü açık anahtarla, imzaya yazılmış sürümü de bildirilen sürümle
//!   (`requireSignedVersion`) karşılaştırır. İndirme adresi ayrıca bu deponun sürüm dosyalarıyla sınırlanır.
//! - Arayüze eklentinin hiçbir izni verilmez: denetim, indirme ve kurulum bu modülün komutlarından geçer, meşgul
//!   kuralı da burada uygulanır. Ağ isteği eklentinin kendi istemcisiyle yapılır (çekirdeğin `Http`'si değil);
//!   tek sunucu GitHub'dır ve HTTPS zorunludur.
//! - Hata ayıklama derlemesi kendiliğinden denetlemez ve kurmaz (geliştirme yuvaları kurulu uygulamanın üstüne
//!   yazmasın); elle denetim yine çalışır.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::future::join_all;
use modstead_core::{AppError, AppResult, GameRegistry, Services, Stage, fsx, tr};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Durum değişince arayüze giden olay (yük: `UpdateView`, `busy` boş).
pub const EVENT: &str = "modstead://update";

/// Bu deponun sürüm sayfası (Cargo.toml → `repository`); bildirim ve indirme adresleri buna bağlıdır.
const RELEASES: &str = concat!(env!("CARGO_PKG_REPOSITORY"), "/releases");

/// Açılıştan sonra ilk denetim (açılışı yavaşlatmasın).
const FIRST_CHECK: Duration = Duration::from_secs(45);
/// Arka plan döngüsünün uyanma aralığı; asıl aralık duvar saatiyle (`due`) ölçülür, uyku/hazırda bekleme sorun olmaz.
const TICK: Duration = Duration::from_secs(30 * 60);
const INTERVAL_S: i64 = 6 * 3600;
/// Başarısız denetimden sonra daha erken yeniden dene (ör. açılışta çevrimdışıydı).
const RETRY_S: i64 = 3600;
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(20 * 60);
/// Sürüm notlarının arayüze giden kısmı.
const NOTES_MAX: usize = 4000;

#[derive(Serialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    /// Denetlenmedi ya da güncel.
    #[default]
    Idle,
    Checking,
    Downloading,
    /// İndirildi, imzası doğrulandı; kullanıcının yeniden başlatmasını bekliyor.
    Ready,
    Installing,
    Error,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Available {
    pub version: String,
    pub notes: Option<String>,
    /// Yayın zamanı (Unix saniyesi).
    pub date: Option<i64>,
    /// Sürümün GitHub sayfası (notlar).
    pub url: String,
}

/// Kurulumu bekleten şeyler.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Busy {
    /// Meşgul oyunların kimlikleri (`Game::busy`).
    pub games: Vec<String>,
    /// Süren indirme/kurulum görevleri (incelemede bekleyenler sayılmaz).
    pub jobs: u32,
}

impl Busy {
    pub fn is_clear(&self) -> bool {
        self.games.is_empty() && self.jobs == 0
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateView {
    pub current: String,
    pub phase: Phase,
    pub available: Option<Available>,
    /// İndirme ilerlemesi (0–1; boyut bilinmiyorsa `None`).
    pub progress: Option<f64>,
    /// Son denetim (Unix saniyesi).
    pub checked_at: Option<i64>,
    pub error: Option<String>,
    /// Bu derleme kendini güncelleyebilir mi (hata ayıklama derlemesinde hayır).
    pub can_install: bool,
    /// Çalışan sürümün GitHub sayfası.
    pub current_url: String,
    /// Yalnızca `update_status` doldurur (olaylarda `None`).
    pub busy: Option<Busy>,
}

struct Downloaded {
    update: Update,
    bytes: Arc<Vec<u8>>,
}

#[derive(Default)]
struct Inner {
    phase: Phase,
    available: Option<Available>,
    progress: Option<f64>,
    checked_at: Option<i64>,
    error: Option<String>,
    ready: Option<Downloaded>,
}

/// Diskte kalan tek şey: son denetim zamanı (`%LOCALAPPDATA%\app.modstead\updater.json`).
#[derive(Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Saved {
    checked_at: Option<i64>,
}

pub struct Updater {
    /// Çalışan sürüm (`tauri.conf.json` → `version`; eklenti de bununla karşılaştırır).
    current: String,
    inner: Mutex<Inner>,
    /// Bir denetim/indirme sürüyor mu (aynı anda tek iş).
    running: AtomicBool,
    file: PathBuf,
}

impl Updater {
    pub fn new(app: &AppHandle, services: &Services) -> Self {
        let file = services.paths.local.join("updater.json");
        let saved: Saved = fsx::read_json(&file);
        Updater {
            current: app.package_info().version.to_string(),
            inner: Mutex::new(Inner { checked_at: saved.checked_at, ..Default::default() }),
            running: AtomicBool::new(false),
            file,
        }
    }

    fn view(&self) -> UpdateView {
        let s = self.inner.lock().unwrap();
        UpdateView {
            current: self.current.clone(),
            phase: s.phase,
            available: s.available.clone(),
            progress: s.progress,
            checked_at: s.checked_at,
            error: s.error.clone(),
            can_install: !cfg!(debug_assertions),
            current_url: release_page(&self.current),
            busy: None,
        }
    }

    /// Durumu değiştirir ve arayüze bildirir.
    fn set(&self, app: &AppHandle, f: impl FnOnce(&mut Inner)) {
        f(&mut self.inner.lock().unwrap());
        let _ = app.emit(EVENT, self.view());
    }

    fn save(&self) {
        let checked_at = self.inner.lock().unwrap().checked_at;
        if let Err(e) = fsx::write_json(&self.file, &Saved { checked_at }) {
            log::warn!("güncelleme durumu yazılamadı: {e}");
        }
    }

    /// Yeni bir denetim başlatılabiliyorsa "denetleniyor"a geçer. Bir iş sürüyorsa ya da güncelleme zaten
    /// hazırsa (ya da kuruluyorsa) hayır.
    fn begin(&self, app: &AppHandle) -> bool {
        if self.running.swap(true, Ordering::SeqCst) {
            return false;
        }
        if matches!(self.inner.lock().unwrap().phase, Phase::Ready | Phase::Installing) {
            self.running.store(false, Ordering::SeqCst);
            return false;
        }
        self.set(app, |s| {
            s.phase = Phase::Checking;
            s.error = None;
            s.progress = None;
        });
        true
    }
}

/// `running` bayrağını iş bitince (hata ya da panik dahil) indirir.
struct RunGuard<'a>(&'a AtomicBool);

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn release_page(version: &str) -> String {
    format!("{RELEASES}/tag/v{version}")
}

/// İndirme adresi bu deponun sürüm dosyalarından biri mi (`https://github.com/<depo>/releases/download/…`)?
fn download_allowed(url: &url::Url) -> bool {
    let Ok(base) = url::Url::parse(RELEASES) else { return false };
    url.scheme() == "https"
        && url.host_str() == base.host_str()
        && url.port().is_none()
        && url.username().is_empty()
        && url.query().is_none()
        && url.path().starts_with(&format!("{}/download/", base.path().trim_end_matches('/')))
        && url.path().to_ascii_lowercase().ends_with(".exe")
}

/// Arka plan denetimi zamanı geldi mi? (Saat geri alındıysa da evet.)
fn due(last: Option<i64>, failed: bool, now: i64) -> bool {
    let wait = if failed { RETRY_S } else { INTERVAL_S };
    last.is_none_or(|t| now < t || now - t >= wait)
}

fn short_notes(body: Option<&str>) -> Option<String> {
    let body = body?.trim();
    if body.is_empty() {
        return None;
    }
    Some(match body.char_indices().nth(NOTES_MAX) {
        Some((i, _)) => format!("{}…", &body[..i]),
        None => body.to_string(),
    })
}

/// Bildirimi okur; yeni (ön sürüm olmayan, daha büyük) bir sürüm varsa döndürür.
async fn find(app: &AppHandle) -> Result<Option<Update>, String> {
    let updater = app
        .updater_builder()
        .version_comparator(|current, release| release.version.pre.is_empty() && release.version > current)
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(mut update)) => {
            if !download_allowed(&update.download_url) {
                return Err(format!("{}: {}", tr!("beklenmeyen indirme adresi", "unexpected download address"), update.download_url));
            }
            update.timeout = Some(DOWNLOAD_TIMEOUT);
            Ok(Some(update))
        }
        Ok(None) => Ok(None),
        // Son sürümde bildirim dosyası yok (ör. güncelleyiciden önceki bir sürüm): güncel say.
        Err(tauri_plugin_updater::Error::ReleaseNotFound) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Denetle ve gerekirse indir. `begin` doğru döndükten sonra çağrılır.
async fn work(app: &AppHandle) {
    let state = app.state::<Updater>();
    let _guard = RunGuard(&state.running);
    let now = fsx::now_ts();
    match find(app).await {
        Ok(None) => {
            log::info!("güncelleme: güncel ({})", state.current);
            state.set(app, |s| {
                s.phase = Phase::Idle;
                s.available = None;
                s.checked_at = Some(now);
            });
        }
        Ok(Some(update)) => {
            log::info!("güncelleme: {} bulundu, indiriliyor", update.version);
            let available = Available {
                version: update.version.clone(),
                notes: short_notes(update.body.as_deref()),
                date: update.date.map(|d| d.unix_timestamp()),
                url: release_page(&update.version),
            };
            state.set(app, |s| {
                s.phase = Phase::Downloading;
                s.available = Some(available);
                s.progress = Some(0.0);
                s.checked_at = Some(now);
            });
            let mut got: u64 = 0;
            let mut last = Instant::now();
            let result = update
                .download(
                    |chunk, total| {
                        got += chunk as u64;
                        if last.elapsed() >= Duration::from_millis(250) {
                            last = Instant::now();
                            let p = total.filter(|t| *t > 0).map(|t| (got as f64 / t as f64).min(1.0));
                            state.set(app, |s| s.progress = p);
                        }
                    },
                    || {},
                )
                .await;
            match result {
                Ok(bytes) => {
                    log::info!("güncelleme: {} indirildi ve imzası doğrulandı ({} bayt)", update.version, bytes.len());
                    state.set(app, |s| {
                        s.phase = Phase::Ready;
                        s.progress = None;
                        s.ready = Some(Downloaded { update, bytes: Arc::new(bytes) });
                    });
                }
                Err(e) => {
                    log::warn!("güncelleme indirilemedi: {e}");
                    state.set(app, |s| {
                        s.phase = Phase::Error;
                        s.progress = None;
                        s.error = Some(format!("{}: {e}", tr!("Güncelleme indirilemedi", "Could not download the update")));
                    });
                }
            }
        }
        Err(e) => {
            log::warn!("güncelleme denetlenemedi: {e}");
            state.set(app, |s| {
                s.phase = Phase::Error;
                s.checked_at = Some(now);
                s.error = Some(format!("{}: {e}", tr!("Güncellemeler denetlenemedi", "Could not check for updates")));
            });
        }
    }
    state.save();
}

/// Arka plan döngüsü (uygulama açılırken bir kez başlatılır).
pub fn start(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        let mut first = true;
        loop {
            let auto = app.state::<Arc<Services>>().settings().auto_update;
            let state = app.state::<Updater>();
            let (last, failed) = {
                let s = state.inner.lock().unwrap();
                (s.checked_at, s.phase == Phase::Error)
            };
            // Açılıştaki denetim, son denetimden bu yana geçen süreye bakmaz: görmezden gelinen güncelleme
            // her açılışta yeniden sunulur.
            if auto && (first || due(last, failed, fsx::now_ts())) && state.begin(&app) {
                work(&app).await;
            }
            first = false;
            tokio::time::sleep(TICK).await;
        }
    });
}

/// Kurulumu bekleten oyunlar ve görevler.
async fn busy(registry: &GameRegistry, services: &Services) -> Busy {
    let games = registry.all().to_vec();
    let flags = join_all(games.iter().map(|g| g.busy())).await;
    let games = games.iter().zip(flags).filter(|(_, b)| *b).map(|(g, _)| g.info().id.to_string()).collect();
    let jobs = services.jobs.list().iter().filter(|j| !j.stage.is_final() && j.stage != Stage::Review).count() as u32;
    Busy { games, jobs }
}

fn busy_message(registry: &GameRegistry, busy: &Busy) -> String {
    let names: Vec<&str> = busy.games.iter().filter_map(|id| registry.get(id)).map(|g| g.info().name).collect();
    if !names.is_empty() {
        let list = names.join(", ");
        tr!(
            format!("{list} kullanımdayken Modstead yeniden başlatılmaz. Kapattığında güncellemeyi kurabilirsin."),
            format!("Modstead does not restart while {list} is in use. You can install the update once it is closed.")
        )
    } else {
        tr!(
            "İndirmeler sürerken Modstead yeniden başlatılmaz. Bitince güncellemeyi kurabilirsin.".to_string(),
            "Modstead does not restart while downloads are running. You can install the update once they finish.".to_string()
        )
    }
}

// ───────────── Komutlar ─────────────

#[tauri::command]
pub async fn update_status(state: State<'_, Updater>, registry: State<'_, GameRegistry>, services: State<'_, Arc<Services>>) -> AppResult<UpdateView> {
    let mut view = state.view();
    view.busy = Some(busy(&registry, &services).await);
    Ok(view)
}

/// Elle denetim ("Şimdi denetle"). Arka planda sürer; ilerleme `modstead://update` ile gelir.
#[tauri::command]
pub fn update_check(app: AppHandle, state: State<'_, Updater>) -> UpdateView {
    if state.begin(&app) {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move { work(&handle).await });
    }
    state.view()
}

/// İndirilmiş güncellemeyi kurar: Modstead kapanır, kurucu çalışır ve uygulamayı yeniden açar. Bir oyun meşgulse
/// ya da indirme sürüyorsa reddedilir.
#[tauri::command]
pub async fn update_install(app: AppHandle, state: State<'_, Updater>, registry: State<'_, GameRegistry>, services: State<'_, Arc<Services>>) -> AppResult<()> {
    if cfg!(debug_assertions) {
        return Err(AppError::msg(tr!(
            "Hata ayıklama derlemesi kendini güncellemez; yeni sürümü kurucusuyla kur.",
            "A debug build does not update itself; install the new version with its installer."
        )));
    }
    let b = busy(&registry, &services).await;
    if !b.is_clear() {
        return Err(AppError::msg(busy_message(&registry, &b)));
    }
    let ready = {
        let mut s = state.inner.lock().unwrap();
        if s.phase == Phase::Ready { s.ready.take() } else { None }
    };
    let Some(ready) = ready else {
        return Err(AppError::msg(tr!("Kurulmaya hazır bir güncelleme yok.", "There is no update ready to install.")));
    };
    log::info!("güncelleme: {} kuruluyor, Modstead kapanacak", ready.update.version);
    state.set(&app, |s| {
        s.phase = Phase::Installing;
        s.error = None;
    });
    // Eklenti süreçten çıkmadan önce yalnızca `cleanup_before_exit`'i çağırır; pencere konumu kaybolmasın.
    {
        use tauri_plugin_window_state::{AppHandleExt, StateFlags};
        let _ = app.save_window_state(StateFlags::all());
    }
    let (update, bytes) = (ready.update.clone(), ready.bytes.clone());
    // Başarıda bu çağrı dönmez: kurucu başlatılır ve süreç kapanır.
    let result = tauri::async_runtime::spawn_blocking(move || update.install(bytes.as_slice())).await;
    let err = match result {
        Ok(Ok(())) => String::new(),
        Ok(Err(e)) => e.to_string(),
        Err(e) => e.to_string(),
    };
    log::warn!("güncelleme kurulamadı: {err}");
    state.set(&app, |s| {
        s.phase = Phase::Ready;
        s.ready = Some(ready);
    });
    Err(AppError::msg(format!("{}: {err}", tr!("Güncelleme kurulamadı", "Could not install the update"))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_address_is_limited_to_this_repository() {
        let ok = |s: &str| download_allowed(&url::Url::parse(s).unwrap());
        assert!(ok(&format!("{RELEASES}/download/v0.2.0/Modstead_0.2.0_x64-setup.exe")));
        assert!(!ok(&format!("{RELEASES}/download/v0.2.0/latest.json")));
        assert!(!ok(&format!("{RELEASES}/download/v0.2.0/Modstead_0.2.0_x64-setup.exe?x=1")));
        assert!(!ok(&format!("{}/download/v0.2.0/Modstead_0.2.0_x64-setup.exe", RELEASES.replace("https://", "http://"))));
        assert!(!ok("https://github.com/someone/else/releases/download/v1.0.0/setup.exe"));
        assert!(!ok("https://objects.githubusercontent.com/azorkai/modstead/releases/download/v1/setup.exe"));
        assert!(!ok(&format!("{}/download/v1/setup.exe", RELEASES.replace("github.com", "github.com.evil.example"))));
    }

    #[test]
    fn schedule() {
        let h = 3600;
        assert!(due(None, false, 100 * h));
        assert!(!due(Some(100 * h), false, 105 * h));
        assert!(due(Some(100 * h), false, 106 * h));
        assert!(!due(Some(100 * h), true, 100 * h + 59 * 60));
        assert!(due(Some(100 * h), true, 101 * h));
        // Saat geri alındı.
        assert!(due(Some(100 * h), false, 90 * h));
    }

    #[test]
    fn notes_are_trimmed_and_capped() {
        assert_eq!(short_notes(Some("  \n ")), None);
        assert_eq!(short_notes(Some(" Yenilikler \n")).as_deref(), Some("Yenilikler"));
        let long = "ğ".repeat(NOTES_MAX + 10);
        assert_eq!(short_notes(Some(&long)).unwrap().chars().count(), NOTES_MAX + 1);
    }

    /// Yapılandırma bu modülle uyumlu olmalı: uç nokta bu deponun son sürüm bildirimi, açık anahtar dolu,
    /// imzadaki sürüm zorunlu, NSIS güncelleme dosyaları üretiliyor.
    #[test]
    fn config_matches_this_repository() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater = &conf["plugins"]["updater"];
        assert_eq!(updater["endpoints"], serde_json::json!([format!("{RELEASES}/latest/download/latest.json")]));
        let pubkey = updater["pubkey"].as_str().unwrap();
        assert!(pubkey.len() > 100 && !pubkey.contains(' '));
        assert_eq!(updater["requireSignedVersion"], true);
        assert_eq!(conf["bundle"]["createUpdaterArtifacts"], true);
        assert!(updater.get("dangerousInsecureTransportProtocol").is_none() && updater.get("allowDowngrades").is_none());
        // Eklenti yapılandırmayı açılışta bu tiple okur; okuyamazsa uygulama açılmaz.
        let parsed: tauri_plugin_updater::Config = serde_json::from_value(updater.clone()).unwrap();
        assert!(parsed.require_signed_version && !parsed.allow_downgrades && !parsed.dangerous_insecure_transport_protocol);
        assert_eq!(parsed.windows.map(|w| w.install_mode.to_string()).as_deref(), Some("passive"));
    }

    #[test]
    fn busy_is_clear_only_when_nothing_waits() {
        assert!(Busy::default().is_clear());
        assert!(!Busy { games: vec!["msfs".into()], jobs: 0 }.is_clear());
        assert!(!Busy { games: vec![], jobs: 1 }.is_clear());
    }
}
