//! Uçuş ekranı: uçuş sırasında açık tutulan canlı sayfa. Sayfa ön yüzün ikinci girişidir (`deck.html`) ve bütün
//! verisini panel sunucusundan (`hud_server`) HTTP ile alır; böylece aynı sayfa Modstead'in ayrı penceresinde,
//! bilgisayardaki herhangi bir tarayıcıda ve aynı ağdaki bir tablette çalışır.
//!
//! Yerel ağ kipi isteğe bağlıdır ve varsayılan olarak kapalıdır. Açıkken sunucu aynı portla bilgisayarın yerel ağ
//! adresinde de dinler; ağdan gelen her `/api/…` isteği 128 bitlik bir anahtar ister (kurallar `hud_server`'da).
//! Anahtar yalnızca Windows Kimlik Bilgisi Yöneticisi'nde durur; diske yalnızca "açık mı" bilgisi yazılır
//! (`career/deck.json`).

use std::net::{Ipv4Addr, SocketAddr, TcpListener, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::thread::JoinHandle;

use modstead_core::prelude::*;
use modstead_core::{credentials, fsx};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use super::{Career, hud_server, qr};

/// Ayrı pencerenin etiketi.
pub const WINDOW: &str = "msfs-deck";
/// Anahtarın Kimlik Bilgisi Yöneticisi'ndeki adı.
const KEY_TARGET: &str = "Modstead/MSFS/DeckKey";
const SETTINGS: &str = "deck.json";

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeckInfo {
    /// Bilgisayardaki (127.0.0.1) sunucunun portu; sunucu çalışmıyorsa `None`.
    pub port: Option<u16>,
    pub local_url: Option<String>,
    pub lan: LanInfo,
    /// `lan.url`'nin QR kodu (SVG); yalnızca ağda dinlenirken.
    pub qr_svg: Option<String>,
    pub window_open: bool,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LanInfo {
    pub enabled: bool,
    pub ip: Option<String>,
    /// Tabletin açacağı adres (anahtarla); yalnızca açıkken ve dinlenirken.
    pub url: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct Settings {
    lan: bool,
}

struct Listening {
    ip: Ipv4Addr,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

#[derive(Default)]
struct Lan {
    /// Kullanıcının seçimi (`deck.json`); `None`: henüz okunmadı.
    enabled: Option<bool>,
    listening: Option<Listening>,
    error: Option<String>,
    /// Son açılış ağ adresi bulunamadığı için olmadı: adres gelince kendiliğinden yeniden denenir.
    retry: bool,
}

#[derive(Default)]
struct Deck {
    app: OnceLock<tauri::AppHandle>,
    port: OnceLock<u16>,
    lan: Mutex<Lan>,
    /// Ağ dinleyicisiyle paylaşılır: anahtar yenilenince eskisi hemen geçersiz olur. Boş: henüz okunmadı.
    key: Arc<RwLock<String>>,
    /// Son QR kodu (adres → SVG); her bilgi isteğinde yeniden çizilmesin.
    qr: Mutex<Option<(String, String)>>,
}

fn deck() -> &'static Deck {
    static D: OnceLock<Deck> = OnceLock::new();
    D.get_or_init(Deck::default)
}

/// Uygulama açılırken: pencere açmak için tutamacı saklar; sürüm derlemesinde gömülü ön yüz dosyalarını
/// (`deck.html`, `assets/…`) sunucuya bağlar. Geliştirmede sayfa Vite'tan gelir (bkz. `hud_server`).
pub fn attach(app: &tauri::AppHandle) {
    let _ = deck().app.set(app.clone());
    #[cfg(not(debug_assertions))]
    hud_server::set_assets(embedded(app));
}

/// Tauri'nin gömülü ön yüz dosyaları. Tauri bilinmeyen bir yolda `index.html`'e düşer; yalnızca gerçekten
/// gömülü olan dosyalar verilsin diye anahtar listesi bir kez çıkarılır.
#[cfg(not(debug_assertions))]
fn embedded(app: &tauri::AppHandle) -> hud_server::AssetFn {
    let resolver = app.asset_resolver();
    let keys: std::collections::HashSet<String> = resolver.iter().map(|(k, _)| k.into_owned()).collect();
    Arc::new(move |path: &str| {
        if !keys.contains(path) {
            return None;
        }
        resolver.get(path.to_string()).map(|a| (a.bytes, a.mime_type))
    })
}

/// Panel sunucusu açıldı: portu kaydeder; kullanıcı yerel ağ kipini açık bıraktıysa onu da açar.
pub(crate) fn started(career: &Arc<Career>, port: u16) {
    let d = deck();
    let _ = d.port.set(port);
    let mut lan = d.lan.lock().unwrap();
    load(&mut lan, career);
    if lan.enabled == Some(true) {
        start_lan(&mut lan, career, port);
    }
}

fn load(lan: &mut Lan, career: &Career) {
    if lan.enabled.is_none() {
        let s: Settings = fsx::read_json(&career.dir.join(SETTINGS));
        lan.enabled = Some(s.lan);
    }
}

/// Arayüzdeki "Uçuş ekranı" kutusunun bilgisi. Bilgisayarın ağ adresi değiştiyse (başka ağ, DHCP) dinleyiciyi
/// yeni adrese taşır.
pub fn info(career: &Arc<Career>) -> DeckInfo {
    let d = deck();
    let mut lan = d.lan.lock().unwrap();
    load(&mut lan, career);
    if lan.enabled == Some(true) {
        let moved = match (&lan.listening, lan_ip()) {
            (Some(l), Some(ip)) => l.ip != ip,
            // Açık ama dinlenmiyor çünkü açılışta ağ yoktu: adres geldi, yeniden dene.
            (None, Some(_)) => lan.retry,
            _ => false,
        };
        if let (true, Some(port)) = (moved, d.port.get().copied()) {
            stop_lan(&mut lan);
            start_lan(&mut lan, career, port);
        }
    }
    snapshot(&lan)
}

/// Uzaktan (`/api/call/msfs_career_deck_info`) okunan bilgi: durumu değiştirmez.
pub(crate) fn remote_info() -> DeckInfo {
    snapshot(&deck().lan.lock().unwrap())
}

fn snapshot(lan: &Lan) -> DeckInfo {
    let d = deck();
    let port = d.port.get().copied();
    let enabled = lan.enabled == Some(true);
    let url = match (&lan.listening, port) {
        (Some(l), Some(p)) if enabled => {
            let key = d.key.read().unwrap().clone();
            (!key.is_empty()).then(|| format!("http://{}:{p}/deck?k={key}&lang={}", l.ip, lang()))
        }
        _ => None,
    };
    let ip = match &lan.listening {
        Some(l) => Some(l.ip),
        None => lan_ip(),
    };
    DeckInfo {
        port,
        local_url: port.map(local_url),
        qr_svg: url.as_deref().map(qr_for),
        lan: LanInfo { enabled, ip: ip.map(|i| i.to_string()), url, error: if enabled { lan.error.clone() } else { None } },
        window_open: d.app.get().is_some_and(|a| a.get_webview_window(WINDOW).is_some()),
    }
}

fn qr_for(url: &str) -> String {
    let mut cache = deck().qr.lock().unwrap();
    if let Some((u, svg)) = cache.as_ref() {
        if u == url {
            return svg.clone();
        }
    }
    let svg = qr::svg(url);
    *cache = Some((url.to_string(), svg.clone()));
    svg
}

/// Yerel ağ adresinin QR kodu; yerel ağ kipi kapalıysa `None` (`GET /api/deck/qr.svg`).
pub(crate) fn qr_svg() -> Option<String> {
    remote_info().qr_svg
}

/// Arayüzün dili ("tr" | "en"): sayfa aynı dille açılsın.
fn lang() -> &'static str {
    modstead_core::i18n::resolved()
}

fn local_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/deck?lang={}", lang())
}

/// Yerel ağ kipini açar ya da kapatır; seçim `deck.json`'a yazılır.
pub fn set_lan(career: &Arc<Career>, on: bool) -> AppResult<DeckInfo> {
    let d = deck();
    {
        let mut lan = d.lan.lock().unwrap();
        fsx::write_json(&career.dir.join(SETTINGS), &Settings { lan: on })?;
        lan.enabled = Some(on);
        if on {
            let same = lan.listening.as_ref().is_some_and(|l| Some(l.ip) == lan_ip());
            if !same {
                stop_lan(&mut lan);
                match d.port.get().copied() {
                    Some(port) => start_lan(&mut lan, career, port),
                    None => lan.error = Some(no_server().into()),
                }
            }
        } else {
            stop_lan(&mut lan);
            lan.error = None;
        }
        career.note("uçuş ekranı", if on { "yerel ağ kipi açıldı" } else { "yerel ağ kipi kapatıldı" });
    }
    Ok(info(career))
}

/// Yeni anahtar üretir: eski adres ve QR kodu hemen geçersiz olur. Yerel ağ kipinin durumu değişmez.
pub fn rotate(career: &Arc<Career>) -> AppResult<DeckInfo> {
    let key = new_key();
    credentials::set(KEY_TARGET, &key)?;
    *deck().key.write().unwrap() = key;
    career.note("uçuş ekranı", "yerel ağ anahtarı yenilendi");
    Ok(info(career))
}

fn no_server() -> &'static str {
    tr!(
        "Panel sunucusu çalışmıyor (47213-47215 portlarının hepsi dolu).",
        "The panel server is not running (ports 47213-47215 are all in use)."
    )
}

/// Anahtar: bellekte yoksa Kimlik Bilgisi Yöneticisi'nden okunur, orada da yoksa ilk kez üretilir.
fn ensure_key() -> AppResult<()> {
    let d = deck();
    if !d.key.read().unwrap().is_empty() {
        return Ok(());
    }
    let key = match credentials::get(KEY_TARGET)? {
        Some(v) if valid_key(&v) => v,
        _ => {
            let v = new_key();
            credentials::set(KEY_TARGET, &v)?;
            v
        }
    };
    *d.key.write().unwrap() = key;
    Ok(())
}

fn valid_key(v: &str) -> bool {
    v.len() == 26 && v.bytes().all(|b| b.is_ascii_lowercase() || (b'2'..=b'7').contains(&b))
}

/// 128 rastgele bit, küçük harfli base32 (26 karakter; adreste kaçış gerektirmez). Rastgelelik `uuid` v4'ten
/// gelir (işletim sisteminin güvenli kaynağı): v4'ün sabit sürüm/çeşit bitlerini taşıyan 6. ve 8. baytlar atlanır,
/// iki uuid'nin kalan tam rastgele baytlarından ilk 16'sı alınır.
fn new_key() -> String {
    let mut bytes = Vec::with_capacity(28);
    for _ in 0..2 {
        let u = uuid::Uuid::new_v4();
        bytes.extend(u.as_bytes().iter().enumerate().filter(|(i, _)| *i != 6 && *i != 8).map(|(_, b)| *b));
    }
    base32(&bytes[..16])
}

fn base32(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";
    let mut out = String::with_capacity(bytes.len() * 8 / 5 + 1);
    let (mut acc, mut bits) = (0u32, 0u32);
    for &b in bytes {
        acc = (acc << 8) | u32::from(b);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(ALPHABET[((acc >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((acc << (5 - bits)) & 31) as usize] as char);
    }
    out
}

/// Bilgisayarın yerel ağ (IPv4) adresi. Paket gönderilmez: UDP soketinde `connect` yalnızca yönlendirme
/// tablosundan çıkış arayüzünü seçer ve `local_addr` o arayüzün adresini verir (192.0.2.1 belgeler için ayrılmış,
/// gerçek olmayan bir adrestir; varsayılan yolu seçtirir). Yalnızca özel ağ adresleri (10/8, 172.16/12,
/// 192.168/16) kabul edilir: bilgisayar doğrudan internete açık bir adresteyse uçuş ekranı oraya açılmaz.
pub fn lan_ip() -> Option<Ipv4Addr> {
    let probes = [
        SocketAddr::from(([192, 0, 2, 1], 9)),
        // Varsayılan yolu olmayan (internetsiz) yerel ağlar için.
        SocketAddr::from(([192, 168, 1, 1], 9)),
        SocketAddr::from(([10, 0, 0, 1], 9)),
    ];
    for probe in probes {
        let Ok(s) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)) else { return None };
        if s.connect(probe).is_err() {
            continue;
        }
        if let Ok(SocketAddr::V4(a)) = s.local_addr() {
            if a.ip().is_private() {
                return Some(*a.ip());
            }
        }
    }
    None
}

/// Yerel ağ dinleyicisini açar (veri kilidi tutulurken). Windows güvenlik duvarı ilk seferde izin sorar.
fn start_lan(lan: &mut Lan, career: &Arc<Career>, port: u16) {
    lan.error = None;
    lan.retry = false;
    if let Err(e) = ensure_key() {
        lan.error = Some(e.to_string());
        return;
    }
    let Some(ip) = lan_ip() else {
        lan.retry = true;
        lan.error = Some(
            tr!(
                "Bu bilgisayarda yerel ağ adresi bulunamadı: Wi-Fi'ye ya da kablolu ağa bağlı olmalı.",
                "No local network address was found on this computer: it must be connected to Wi-Fi or a wired network."
            )
            .into(),
        );
        return;
    };
    let bound = TcpListener::bind((ip, port)).and_then(|l| {
        let stop = Arc::new(AtomicBool::new(false));
        let auth = hud_server::LanAuth { host: format!("{ip}:{port}"), key: deck().key.clone() };
        hud_server::spawn_lan(l, port, Some(career.clone()), auth, stop.clone()).map(|t| (stop, t))
    });
    match bound {
        Ok((stop, thread)) => {
            lan.listening = Some(Listening { ip, stop, thread: Some(thread) });
            career.note("uçuş ekranı", format!("yerel ağda dinleniyor: {ip}:{port}"));
        }
        Err(e) => {
            career.note("uçuş ekranı", format!("yerel ağda dinlenemedi ({ip}:{port}): {e}"));
            lan.error = Some(format!("{} ({ip}:{port}): {e}", tr!("Yerel ağda dinlenemedi", "Could not listen on the local network")));
        }
    }
}

/// Dinleyiciyi durdurur ve iş parçacığının bitmesini bekler (port hemen yeniden kullanılabilsin).
fn stop_lan(lan: &mut Lan) {
    if let Some(mut l) = lan.listening.take() {
        l.stop.store(true, Ordering::Relaxed);
        if let Some(t) = l.thread.take() {
            let _ = t.join();
        }
    }
}

/// Uçuş ekranı penceresini açar; açıksa öne getirir. Herhangi bir iş parçacığından çağrılabilir (Tauri pencereyi
/// ana döngüde kurar); Windows'ta ana iş parçacığından çağrılmamalı (WebView2 kilitlenir), komut bu yüzden async.
pub fn open_window() -> AppResult<()> {
    let d = deck();
    let app = d.app.get().ok_or_else(|| AppError::msg(tr!("Uygulama henüz hazır değil.", "The app is not ready yet.")))?;
    if let Some(w) = app.get_webview_window(WINDOW) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let port = d.port.get().copied().ok_or_else(|| AppError::msg(no_server()))?;
    let url = url::Url::parse(&local_url(port)).app_err()?;
    tauri::WebviewWindowBuilder::new(app, WINDOW, tauri::WebviewUrl::External(url))
        .title(tr!("Modstead — Uçuş ekranı", "Modstead — Flight deck"))
        .inner_size(1180.0, 760.0)
        .min_inner_size(420.0, 320.0)
        .resizable(true)
        // Pencere yalnızca panel sunucusunun sayfalarını gösterir; başka bir adrese gidilmez. Pencere hiçbir yetenek
        // dosyasında listelenmez: sayfa Tauri komutlarını çağıramaz, verisini HTTP'den alır.
        .on_navigation(move |u| u.scheme() == "http" && matches!(u.host_str(), Some("127.0.0.1" | "localhost")) && u.port() == Some(port))
        .build()
        .app_err()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_128_bit_base32() {
        let a = new_key();
        let b = new_key();
        assert!(valid_key(&a) && valid_key(&b) && a != b, "{a} {b}");
        // RFC 4648 örneği (küçük harf, dolgusuz).
        assert_eq!(base32(b"foobar"), "mzxw6ytboi");
        assert_eq!(base32(&[0u8; 16]).len(), 26);
    }

    #[test]
    fn lan_ip_is_private_when_found() {
        if let Some(ip) = lan_ip() {
            assert!(ip.is_private(), "{ip}");
        }
    }
}
