//! Simin içindeki Modstead sayfalarının ve uçuş ekranının yerel sunucusu: araç çubuğu panelinin ve ana menü
//! arayüzünün kodunu, görünümünü ve kariyer verisini verir; simin içinden kariyer işlemlerini (iş kabulü, uçak
//! seçimi, uçuşu başlatma) alır. Sim sayfaları yalnızca açılışta okuduğu için kod buradan gelir: Modstead
//! güncellenince sayfalar simi kapatmadan yenilenir. Uçuş ekranı (`deck`) da sayfasını ve verisini buradan alır.
//! Uçlar: `games/msfs/hud/menu/API.md`.
//!
//! Güvenlik (kullanıcının onayıyla eklendi):
//! - 127.0.0.1'de dinler; yalnızca sabit yollar. Dosya ya da kabuk erişimi yoktur: Modstead'e gömülü dosyaları ve
//!   kariyer verisini sunar. Diskten yalnızca uydu karosu önbelleğini okur (`tiles`; yol yalnızca rakamlardan
//!   kurulur); ağa yalnızca çekirdeğin izin listeli istemcisiyle çıkar (METAR, uydu karoları).
//! - `Host` başlığı `127.0.0.1:<port>` ya da `localhost:<port>` değilse reddeder (DNS yeniden bağlama).
//! - Yanıtı okumaya (CORS) ve `POST`'a yalnızca simin `coui://` sayfaları izinlidir; başka kaynaklı ya da
//!   kaynaksız `POST` reddedilir. `POST` yalnızca kariyer işlemleri ve uçuş ekranı penceresini açmaktır.
//! - Yerel ağ kipi (isteğe bağlı, varsayılan kapalı; bkz. `deck`): aynı port bilgisayarın yerel ağ adresinde de
//!   dinlenir. Oradan gelen istekte `Host` tam olarak `<ağ adresi>:<port>` olmalı; yalnızca `GET` kabul edilir;
//!   `/hud` ve `/menu` yoktur; her `/api/…` anahtar ister (`X-Modstead-Key` başlığı ya da `k` parametresi, sabit
//!   zamanlı karşılaştırma). Anahtarsız yalnızca uçuş ekranının sayfası ve derlenmiş ön yüz dosyaları açılır.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock, RwLock};
use std::thread::JoinHandle;
use std::time::Duration;

use serde::Deserialize;

use super::families;
use super::hud::panel_file;
use super::model::StartAt;
use super::{Career, commands, deck, tiles};

/// Denenen portlar (sırayla; ilk boş olan). Simdeki yükleyiciler de bu listeyi dener.
pub const PORTS: [u16; 3] = [47213, 47214, 47215];
const APP: &str = "modstead-career-hud";
/// İstek gövdesinin üst sınırı (JSON işlemleri küçüktür).
const MAX_BODY: usize = 64 * 1024;
/// Yerel ağdan aynı anda açık tutulabilecek bağlantı sayısı (her bağlantı bir iş parçacığıdır).
const MAX_LAN_CONNS: usize = 32;

/// Uzaktan çağrılabilen salt okunur komutlar (`GET /api/call/<komut>`); adlar ve yanıtlar uygulamadaki Tauri
/// komutlarıyla aynıdır. Listede olmayan her şey 404.
pub const CALLS: [&str; 7] = [
    "msfs_career_state",
    "msfs_career_live",
    "msfs_career_map_airports",
    "msfs_career_weather",
    "msfs_career_track",
    "msfs_career_deck_info",
    "msfs_career_tiles_info",
];

/// Uçuş ekranı sayfasının güvenlik politikası (sürüm derlemesindeki gömülü sayfa): her şey aynı kaynaktan.
#[cfg_attr(debug_assertions, allow(dead_code))]
const DECK_CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; \
    font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const MENU_JS: &[u8] = include_bytes!("../../hud/menu/ModsteadMenu.js");
const MENU_CSS: &[u8] = include_bytes!("../../hud/menu/ModsteadMenu.css");

/// Gömülü ön yüz dosyası: yol (`/deck.html`, `/assets/…`) → (içerik, MIME türü).
pub type AssetFn = Arc<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync>;

static EMBEDDED: OnceLock<AssetFn> = OnceLock::new();

/// Gömülü ön yüz dosyalarını bağlar (sürüm derlemesi; bkz. `deck::attach`). Bağlanmazsa sayfa yolları 404 verir.
pub fn set_assets(f: AssetFn) {
    let _ = EMBEDDED.set(f);
}

/// Gömülü dosyalardan türetilen içerik: panelin kodu, görünümü, işaretlemesi ve hepsinin özeti (sürüm).
struct Assets {
    js: &'static [u8],
    css: &'static [u8],
    body: String,
    version: String,
}

fn assets() -> &'static Assets {
    static A: OnceLock<Assets> = OnceLock::new();
    A.get_or_init(|| {
        let js = panel_file("ModsteadCareer.js");
        let css = panel_file("ModsteadCareer.css");
        let html = String::from_utf8_lossy(panel_file("ModsteadCareer.html")).into_owned();
        let body = panel_body(&html);
        // FNV-1a: değişikliği anlamak için yeterli, bağımlılık gerektirmez. Menü dosyaları da dahil: yükleyiciler
        // aynı sürümü yoklar.
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for b in js.iter().chain(css.iter()).chain(body.as_bytes()).chain(MENU_JS).chain(MENU_CSS) {
            h = (h ^ *b as u64).wrapping_mul(0x0100_0000_01b3);
        }
        Assets { js, css, body, version: format!("{h:016x}") }
    })
}

/// Panel işaretlemesinin değişebilen kısmı: `#ms-root` ve içi (yükleyici bununla değiştirir).
pub fn panel_body(html: &str) -> String {
    let start = html.find("<div id=\"ms-root\"");
    let end = html.find("</ingame-ui>");
    match (start, end) {
        (Some(s), Some(e)) if s < e => html[s..e].trim_end().to_string(),
        _ => String::new(),
    }
}

static PORT: OnceLock<u16> = OnceLock::new();

/// Sunucuyu başlatır; dinlenen portu döner. Port bulunamazsa sayfalar paketteki kopyayla çalışır.
pub fn start(career: Arc<Career>) -> Option<u16> {
    PORTS.iter().find_map(|p| TcpListener::bind(("127.0.0.1", *p)).ok().map(|l| (l, *p))).map(|(l, p)| {
        spawn(l, p, Some(career));
        let _ = PORT.set(p);
        p
    })
}

/// Bilgisayarda (127.0.0.1) dinlenen port; sunucu açılamadıysa `None`.
pub fn port() -> Option<u16> {
    PORT.get().copied()
}

fn spawn(listener: TcpListener, port: u16, career: Option<Arc<Career>>) {
    let via = Arc::new(Via::Loopback);
    std::thread::Builder::new()
        .name("modstead-hud-server".into())
        .spawn(move || {
            for s in listener.incoming().flatten() {
                // Her bağlantı kısa sürer (tek istek, `Connection: close`); yavaş bir istemci diğerlerini bekletmesin.
                let (c, v) = (career.clone(), via.clone());
                let _ = std::thread::Builder::new().name("modstead-hud-conn".into()).spawn(move || handle(s, port, c.as_ref(), &v));
            }
        })
        .ok();
}

/// Bağlantının geldiği dinleyici.
pub enum Via {
    /// 127.0.0.1: sim sayfaları, uygulama ve bu bilgisayardaki tarayıcılar.
    Loopback,
    /// Yerel ağ adresi (tablet).
    Lan(LanAuth),
}

/// Yerel ağ dinleyicisinin kuralları.
pub struct LanAuth {
    /// Beklenen `Host` başlığı: `<yerel ağ adresi>:<port>`.
    pub host: String,
    /// Uçuş ekranı anahtarı; paylaşılır, yenilenince hemen geçerli olur. Boşsa hiçbir `/api` isteği geçmez.
    pub key: Arc<RwLock<String>>,
}

/// Yerel ağ dinleyicisi: `stop` kurulunca en geç ~150 ms içinde dinleyiciyi kapatıp biter (engellemesiz kabul
/// döngüsü; kapatmak için bağlantı beklemek gerekmez).
pub fn spawn_lan(listener: TcpListener, port: u16, career: Option<Arc<Career>>, auth: LanAuth, stop: Arc<AtomicBool>) -> std::io::Result<JoinHandle<()>> {
    listener.set_nonblocking(true)?;
    let via = Arc::new(Via::Lan(auth));
    let open = Arc::new(AtomicUsize::new(0));
    std::thread::Builder::new().name("modstead-deck-lan".into()).spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((s, _)) => {
                    // Windows'ta kabul edilen soket dinleyicinin engellemesiz kipini devralır.
                    let _ = s.set_nonblocking(false);
                    if open.load(Ordering::Relaxed) >= MAX_LAN_CONNS {
                        continue;
                    }
                    open.fetch_add(1, Ordering::Relaxed);
                    let (c, v, o) = (career.clone(), via.clone(), open.clone());
                    let spawned = std::thread::Builder::new().name("modstead-deck-conn".into()).spawn(move || {
                        handle(s, port, c.as_ref(), &v);
                        o.fetch_sub(1, Ordering::Relaxed);
                    });
                    if spawned.is_err() {
                        open.fetch_sub(1, Ordering::Relaxed);
                    }
                }
                Err(_) => std::thread::sleep(Duration::from_millis(150)),
            }
        }
    })
}

#[derive(Default)]
struct Request {
    method: String,
    /// Yol ve sorgu (`/api/call/x?a=…`).
    path: String,
    host: Option<String>,
    origin: Option<String>,
    /// `X-Modstead-Key` başlığı (yerel ağ anahtarı).
    key: Option<String>,
    /// Yalnızca geliştirmede Vite'a aktarılır.
    #[cfg_attr(not(debug_assertions), allow(dead_code))]
    accept: Option<String>,
    body: Vec<u8>,
}

struct Reply {
    status: &'static str,
    kind: String,
    body: Vec<u8>,
    /// `OPTIONS` ön isteğine verilen izin başlıkları.
    preflight: bool,
    /// Ek başlıklar (`Cache-Control` verilmezse `no-store`).
    headers: Vec<(&'static str, String)>,
}

fn reply(status: &'static str, kind: &str, body: impl Into<Vec<u8>>) -> Reply {
    Reply { status, kind: kind.to_string(), body: body.into(), preflight: false, headers: Vec::new() }
}

fn json(value: &impl serde::Serialize) -> Reply {
    reply("200 OK", "application/json; charset=utf-8", serde_json::to_vec(value).unwrap_or_default())
}

fn error(status: &'static str, msg: &str) -> Reply {
    reply(status, "application/json; charset=utf-8", serde_json::to_vec(&serde_json::json!({ "error": msg })).unwrap_or_default())
}

fn not_found() -> Reply {
    error("404 Not Found", "not found")
}

enum Outcome {
    Reply(Reply),
    /// Geliştirme: istek Vite geliştirme sunucusuna aktarılır (yol ve sorgu).
    #[cfg(debug_assertions)]
    Proxy(String),
}

impl From<Reply> for Outcome {
    fn from(r: Reply) -> Self {
        Outcome::Reply(r)
    }
}

/// Simin sayfaları `coui://…` kaynağından gelir.
fn from_sim(origin: Option<&str>) -> bool {
    origin.is_some_and(|o| o.to_ascii_lowercase().starts_with("coui://"))
}

/// Yol bu bölümde mi (`/api`, `/api/…`)?
fn section(path: &str, prefix: &str) -> bool {
    path.strip_prefix(prefix).is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
}

fn query_param(query: &str, name: &str) -> Option<String> {
    url::form_urlencoded::parse(query.as_bytes()).find(|(k, _)| k == name).map(|(_, v)| v.into_owned())
}

/// Sabit zamanlı karşılaştırma: yanıt süresinden anahtarın ne kadarının tuttuğu anlaşılmasın.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Yerel ağdan gelen `/api` isteğinin anahtarı doğru mu?
fn authorized(req: &Request, query: &str, auth: &LanAuth) -> bool {
    let expected = auth.key.read().map(|k| k.clone()).unwrap_or_default();
    let given = req.key.clone().or_else(|| query_param(query, "k"));
    !expected.is_empty() && given.is_some_and(|g| same(g.as_bytes(), expected.as_bytes()))
}

/// Bir isteği yanıtlar (bağlantıdan bağımsız; testler doğrudan çağırır).
fn route(req: &Request, port: u16, career: Option<&Arc<Career>>, via: &Via) -> Outcome {
    let host = req.host.as_deref().unwrap_or("");
    let allowed_host = match via {
        Via::Loopback => host.eq_ignore_ascii_case(&format!("127.0.0.1:{port}")) || host.eq_ignore_ascii_case(&format!("localhost:{port}")),
        Via::Lan(a) => !a.host.is_empty() && host.eq_ignore_ascii_case(&a.host),
    };
    if !allowed_host {
        return error("403 Forbidden", "forbidden").into();
    }
    let (path, query) = req.path.split_once('?').unwrap_or((req.path.as_str(), ""));
    if let Via::Lan(auth) = via {
        // Ağdan yalnızca okunur: işlem, ön istek ve sim sayfaları yok; veri anahtar ister.
        if req.method != "GET" {
            return error("403 Forbidden", "forbidden").into();
        }
        if section(path, "/hud") || section(path, "/menu") {
            return not_found().into();
        }
        if section(path, "/api") && !authorized(req, query, auth) {
            return error("401 Unauthorized", "unauthorized").into();
        }
        return get(path, query, career, true);
    }
    match req.method.as_str() {
        "OPTIONS" if from_sim(req.origin.as_deref()) => Reply { preflight: true, ..reply("204 No Content", "text/plain", Vec::new()) }.into(),
        "GET" => get(path, query, career, false),
        "POST" if from_sim(req.origin.as_deref()) => match (path, career) {
            ("/api/deck/open", _) => deck_open().into(),
            (_, Some(c)) => post(path, &req.body, c).into(),
            (_, None) => error("503 Service Unavailable", "career unavailable").into(),
        },
        "OPTIONS" | "POST" => error("403 Forbidden", "forbidden").into(),
        _ => error("405 Method Not Allowed", "method not allowed").into(),
    }
}

fn get(path: &str, query: &str, career: Option<&Arc<Career>>, lan: bool) -> Outcome {
    if section(path, "/hud") || section(path, "/menu") {
        return sim_file(path).into();
    }
    if section(path, "/api") {
        return api(path, query, career).into();
    }
    page(path, query, lan)
}

/// Sim içi panelin ve ana menünün dosyaları.
fn sim_file(path: &str) -> Reply {
    let a = assets();
    match path {
        "/hud/v" => reply("200 OK", "application/json", format!("{{\"app\":\"{APP}\",\"v\":\"{}\"}}", a.version)),
        "/hud/app.js" => reply("200 OK", "text/javascript; charset=utf-8", a.js),
        "/hud/app.css" => reply("200 OK", "text/css; charset=utf-8", a.css),
        "/hud/body.html" => reply("200 OK", "text/html; charset=utf-8", a.body.clone()),
        "/menu/app.js" => reply("200 OK", "text/javascript; charset=utf-8", MENU_JS),
        "/menu/app.css" => reply("200 OK", "text/css; charset=utf-8", MENU_CSS),
        _ => not_found(),
    }
}

fn api(path: &str, query: &str, career: Option<&Arc<Career>>) -> Reply {
    if let Some(rest) = path.strip_prefix("/api/tiles/") {
        return tile(rest, career);
    }
    if let Some(id) = path.strip_prefix("/api/photo/").and_then(|p| p.strip_suffix(".jpg")) {
        return match families::photo(id) {
            Some(b) => reply("200 OK", "image/jpeg", b),
            None => not_found(),
        };
    }
    if path == "/api/deck/qr.svg" {
        return match deck::qr_svg() {
            Some(svg) => reply("200 OK", "image/svg+xml; charset=utf-8", svg),
            None => not_found(),
        };
    }
    if let Some(cmd) = path.strip_prefix("/api/call/") {
        return call(cmd, query, career);
    }
    if !matches!(path, "/api/state" | "/api/live" | "/api/board" | "/api/aircraft" | "/api/sim-assist") {
        return not_found();
    }
    let Some(c) = career else { return error("503 Service Unavailable", "career unavailable") };
    match path {
        "/api/state" => json(&c.view()),
        "/api/live" => json(&c.live()),
        // Ana arayüzdeki sim içi kod uçuşta da birkaç saniyede bir yoklar: küçük tutulur.
        "/api/sim-assist" => json(&c.live.lock().unwrap().assist),
        "/api/board" => match c.board() {
            Ok(b) => json(&b),
            Err(e) => error("400 Bad Request", &e.to_string()),
        },
        "/api/aircraft" => json(&aircraft(c)),
        _ => not_found(),
    }
}

/// `GET /api/tiles/<katman>/<z>/<x>/<y>`: harita karosu (bkz. `tiles`). Yoksa 404, çevrimiçi karo alınamıyorsa 503.
fn tile(rest: &str, career: Option<&Arc<Career>>) -> Reply {
    match tiles::get(rest, career) {
        Ok(t) => {
            let mut r = reply("200 OK", t.mime, t.body);
            r.headers.push(("Cache-Control", format!("public, max-age={}", t.max_age)));
            r
        }
        Err(tiles::Miss::NotFound) => not_found(),
        Err(tiles::Miss::Unavailable(why)) => error("503 Service Unavailable", &format!("tile unavailable: {why}")),
    }
}

#[derive(Deserialize)]
struct MapArgs {
    south: f64,
    west: f64,
    north: f64,
    east: f64,
    detail: u8,
}

/// `GET /api/call/<komut>?a=<JSON nesnesi>`: uygulamadaki komutun aynısı (bkz. `CALLS`).
fn call(cmd: &str, query: &str, career: Option<&Arc<Career>>) -> Reply {
    if !CALLS.contains(&cmd) {
        return not_found();
    }
    let args = match query_param(query, "a") {
        None => serde_json::Value::Object(Default::default()),
        Some(a) => match serde_json::from_str::<serde_json::Value>(&a) {
            Ok(v) if v.is_object() => v,
            _ => return error("400 Bad Request", "invalid args"),
        },
    };
    match cmd {
        "msfs_career_map_airports" => {
            return match serde_json::from_value::<MapArgs>(args) {
                Ok(a) => json(&commands::map_airports(a.south, a.west, a.north, a.east, a.detail)),
                Err(e) => error("400 Bad Request", &e.to_string()),
            };
        }
        "msfs_career_deck_info" => return json(&deck::remote_info()),
        "msfs_career_tiles_info" => return json(&tiles::info()),
        _ => {}
    }
    let Some(c) = career else { return error("503 Service Unavailable", "career unavailable") };
    match cmd {
        "msfs_career_state" => json(&c.view()),
        "msfs_career_live" => json(&c.live()),
        "msfs_career_track" => json(&c.active_track()),
        // Bağlantı iş parçacığı çalışma zamanının dışında: METAR isteği burada beklenir.
        "msfs_career_weather" => match tauri::async_runtime::block_on(commands::weather(c)) {
            Ok(v) => json(&v),
            Err(e) => error("400 Bad Request", &e.to_string()),
        },
        _ => not_found(),
    }
}

/// Uçak listesi ve her uçağın gerçek tipi ile fotoğrafı.
fn aircraft(c: &Career) -> Vec<serde_json::Value> {
    c.installed_aircraft()
        .into_iter()
        .map(|o| {
            let fam = families::family_of(&o.title);
            let mut v = serde_json::to_value(&o).unwrap_or_default();
            if let Some(m) = v.as_object_mut() {
                m.insert("family".into(), fam.map(|f| f.name.clone()).into());
                m.insert("photo".into(), fam.filter(|f| families::photo(&f.id).is_some()).map(|f| format!("/api/photo/{}.jpg", f.id)).into());
            }
            v
        })
        .collect()
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Body {
    id: String,
    title: String,
    livery: String,
    start: Option<StartAt>,
    /// `/api/sim-assist`: sim içi kodun isteği nasıl işlediği (günlük için).
    result: String,
}

/// Sim içinden gelen kısa sonuç metni günlüğe güvenle yazılsın: yalnızca harf, rakam ve birkaç işaret, en çok 80 karakter.
fn log_token(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ',' | '.' | ':' | ' ')).take(80).collect()
}

fn post(path: &str, body: &[u8], c: &Career) -> Reply {
    let b: Body = if body.is_empty() { Body::default() } else {
        match serde_json::from_slice(body) {
            Ok(b) => b,
            Err(_) => return error("400 Bad Request", "invalid json"),
        }
    };
    if path == "/api/sim-assist" {
        // Sim içi kod aktif duraklatma isteğini işledi (bkz. `pause_guard`); yalnızca günlüğe yazılır.
        c.note("duraklatma", format!("sim içi kod istek {} işledi: {}", log_token(&b.id), log_token(&b.result)));
        return json(&serde_json::json!({ "ok": true }));
    }
    c.note("sim içi", format!("işlem: {path}"));
    let r = match path {
        "/api/accept" => c.accept(&b.id),
        "/api/pick" => c.pick_aircraft(&b.title, &b.livery, None),
        "/api/launch" => c.launch(b.start),
        "/api/cancel" => c.cancel(),
        _ => return not_found(),
    };
    match r {
        Ok(()) => json(&serde_json::json!({ "ok": true })),
        Err(e) => {
            c.note("sim içi", format!("işlem reddedildi: {path}: {e}"));
            error("400 Bad Request", &e.to_string())
        }
    }
}

/// `POST /api/deck/open`: simin ana menüsünden uçuş ekranı penceresi.
fn deck_open() -> Reply {
    match deck::open_window() {
        Ok(()) => json(&serde_json::json!({ "ok": true })),
        Err(e) => error("400 Bad Request", &e.to_string()),
    }
}

// ---------- Uçuş ekranı sayfası ----------

/// Sürüm derlemesi: uçuş ekranının sayfası ve derlenmiş ön yüz dosyaları (anahtarsız; içlerinde veri yoktur).
#[cfg(not(debug_assertions))]
fn page(path: &str, _query: &str, _lan: bool) -> Outcome {
    embedded_file(path, EMBEDDED.get()).into()
}

/// Geliştirme: gömülü dosya yoktur, sayfa Vite geliştirme sunucusundan aktarılır.
#[cfg(debug_assertions)]
fn page(path: &str, query: &str, lan: bool) -> Outcome {
    match proxy_target(path, query, lan) {
        Some(t) => Outcome::Proxy(t),
        None => not_found().into(),
    }
}

/// Gömülü dosyalardan yalnızca uçuş ekranının ihtiyacı olanlar: sayfa, `assets/…` ve simge.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn embedded_file(path: &str, files: Option<&AssetFn>) -> Reply {
    let file = match path {
        "/deck" | "/deck/" => "/deck.html",
        "/favicon.svg" => path,
        p if p.strip_prefix("/assets/").is_some_and(safe_asset) => p,
        _ => return not_found(),
    };
    let Some((body, mime)) = files.and_then(|f| f(file)) else { return not_found() };
    let mut r = reply("200 OK", &with_charset(&mime), body);
    if file == "/deck.html" {
        r.headers.push(("Content-Security-Policy", DECK_CSP.to_string()));
    } else if file.starts_with("/assets/") {
        // Vite dosya adlarına içerik özeti koyar: içerik değişmez, tablet her açılışta yeniden indirmesin.
        r.headers.push(("Cache-Control", "public, max-age=31536000, immutable".to_string()));
    }
    r
}

#[cfg_attr(debug_assertions, allow(dead_code))]
fn safe_asset(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && !name.starts_with('/')
        && !name.contains("..")
        && !name.contains("//")
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'/'))
}

#[cfg_attr(debug_assertions, allow(dead_code))]
fn with_charset(mime: &str) -> String {
    let textual = mime.starts_with("text/") || matches!(mime, "application/javascript" | "application/json" | "image/svg+xml");
    if textual && !mime.contains("charset") { format!("{mime}; charset=utf-8") } else { mime.to_string() }
}

/// Geliştirmede Vite'a aktarılacak yol: `/api`, `/hud`, `/menu` ve üst klasör (`..`) asla aktarılmaz. Ağdan gelen
/// isteklerde geliştirme sunucusunun dosya erişimi (`/@fs/`, gizli dosyalar, kodlanmış yol) de kapalıdır.
#[cfg(debug_assertions)]
fn proxy_target(path: &str, query: &str, lan: bool) -> Option<String> {
    if !path.starts_with('/') || path.contains("..") || path.contains('\\') || section(path, "/api") || section(path, "/hud") || section(path, "/menu") {
        return None;
    }
    // Vite'ın önceden paketlediği bağımlılıklar (`/node_modules/.vite/deps/…`) gizli klasördedir ama sayfa onlarsız açılmaz.
    let hidden = path.split('/').any(|seg| seg.starts_with('.')) && !path.starts_with("/node_modules/.vite/");
    if lan && (path.starts_with("/@fs/") || hidden || path.contains('%')) {
        return None;
    }
    let target = if matches!(path, "/deck" | "/deck/") { "/deck.html" } else { path };
    Some(if query.is_empty() { target.to_string() } else { format!("{target}?{query}") })
}

/// İsteği Vite'a (127.0.0.1:`MODSTEAD_PORT`, yoksa 1420) aktarır ve yanıtı olduğu gibi geri akıtır. Vite'a
/// bağlanılamazsa `false` (çağıran 502 yazar). WebSocket (HMR) aktarılmaz.
#[cfg(debug_assertions)]
fn proxy(s: &mut TcpStream, target: &str, accept: Option<&str>) -> bool {
    let port = std::env::var("MODSTEAD_PORT").ok().and_then(|p| p.parse::<u16>().ok()).unwrap_or(1420);
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut up) = TcpStream::connect_timeout(&addr, Duration::from_secs(2)) else { return false };
    let _ = up.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = up.set_write_timeout(Some(Duration::from_secs(5)));
    let accept = accept.filter(|a| a.bytes().all(|b| (0x20..0x7f).contains(&b))).unwrap_or("*/*");
    let head = format!("GET {target} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAccept: {accept}\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n");
    if up.write_all(head.as_bytes()).is_err() {
        return false;
    }
    let _ = s.set_write_timeout(Some(Duration::from_secs(30)));
    let _ = std::io::copy(&mut up, s);
    true
}

fn handle(mut s: TcpStream, port: u16, career: Option<&Arc<Career>>, via: &Via) {
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = s.set_write_timeout(Some(Duration::from_secs(2)));
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 4096];
    let head_end = loop {
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break Some(i + 4);
        }
        if buf.len() > 16 * 1024 {
            break None;
        }
        match s.read(&mut chunk) {
            Ok(0) | Err(_) => break None,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    };
    let Some(head_end) = head_end else { return };
    let head = String::from_utf8_lossy(&buf[..head_end]).into_owned();
    let mut lines = head.split("\r\n");
    let mut parts = lines.next().unwrap_or("").split(' ');
    let mut req = Request { method: parts.next().unwrap_or("").to_string(), path: parts.next().unwrap_or("").to_string(), ..Default::default() };
    let mut length = 0usize;
    for l in lines {
        if let Some((k, v)) = l.split_once(':') {
            let v = v.trim().to_string();
            match k.trim().to_ascii_lowercase().as_str() {
                "host" => req.host = Some(v),
                "origin" => req.origin = Some(v),
                "x-modstead-key" => req.key = Some(v),
                "accept" => req.accept = Some(v),
                "content-length" => length = v.parse().unwrap_or(0),
                _ => {}
            }
        }
    }
    if length > MAX_BODY {
        return;
    }
    req.body = buf[head_end..].to_vec();
    while req.body.len() < length {
        match s.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => req.body.extend_from_slice(&chunk[..n]),
        }
    }
    req.body.truncate(length);
    let r = match route(&req, port, career, via) {
        Outcome::Reply(r) => r,
        #[cfg(debug_assertions)]
        Outcome::Proxy(target) => {
            if proxy(&mut s, &target, req.accept.as_deref()) {
                return;
            }
            error("502 Bad Gateway", "vite dev server unavailable")
        }
    };
    let mut out = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n",
        r.status,
        r.kind,
        r.body.len()
    );
    if !r.headers.iter().any(|(k, _)| *k == "Cache-Control") {
        out.push_str("Cache-Control: no-store\r\n");
    }
    for (k, v) in &r.headers {
        out.push_str(&format!("{k}: {v}\r\n"));
    }
    // Simin sayfaları yalnızca bu bilgisayardan (127.0.0.1) bağlanır; ağdan gelen isteğe CORS izni verilmez.
    if let (Via::Loopback, Some(o)) = (via, req.origin.as_deref().filter(|o| from_sim(Some(o)))) {
        out.push_str(&format!("Access-Control-Allow-Origin: {o}\r\nVary: Origin\r\n"));
        if r.preflight {
            out.push_str("Access-Control-Allow-Methods: GET, POST\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Max-Age: 600\r\n");
        }
    }
    out.push_str("\r\n");
    let _ = s.write_all(out.as_bytes());
    let _ = s.write_all(&r.body);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;

    fn send(port: u16, raw: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = Vec::new();
        s.read_to_end(&mut out).unwrap();
        String::from_utf8_lossy(&out).into_owned()
    }

    fn get_as(port: u16, host: &str, path: &str, extra: &str) -> String {
        send(port, &format!("GET {path} HTTP/1.1\r\nHost: {host}\r\n{extra}\r\n"))
    }

    fn career() -> Arc<Career> {
        Career::open(modstead_core::Services::for_tests(), Arc::new(Vec::new))
    }

    #[test]
    fn serves_only_the_sim_pages() {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        spawn(l, port, None);
        let ok = |path: &str, origin: &str| send(port, &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {origin}\r\n\r\n"));

        let v = ok("/hud/v", "coui://html_ui");
        assert!(v.starts_with("HTTP/1.1 200 OK"), "{v}");
        assert!(v.contains("\"app\":\"modstead-career-hud\"") && v.contains("Access-Control-Allow-Origin: coui://html_ui"), "{v}");
        assert!(ok("/hud/app.js?v=1", "coui://html_ui").contains("customElements.define"));
        assert!(ok("/hud/app.css", "coui://html_ui").contains("200 OK"));
        assert!(ok("/menu/app.js", "coui://html_ui").starts_with("HTTP/1.1 200 OK"));
        let body = ok("/hud/body.html", "coui://html_ui");
        assert!(body.contains("<div id=\"ms-root\"") && !body.contains("</ingame-ui>"), "{body}");
        let photo = ok("/api/photo/c172.jpg", "coui://html_ui");
        assert!(photo.contains("Content-Type: image/jpeg"), "{}", &photo[..200]);
        assert!(ok("/api/photo/..%2Fc172.jpg", "coui://x").starts_with("HTTP/1.1 404"));

        // Başka bir site yanıtı okuyamaz ve işlem yapamaz; bilinmeyen yollar yok; başka ad (DNS yeniden bağlama) reddedilir.
        assert!(!ok("/hud/v", "https://example.com").contains("Access-Control-Allow-Origin"));
        assert!(ok("/../../Windows/win.ini", "coui://x").starts_with("HTTP/1.1 404"));
        let post = |origin: &str| send(port, &format!("POST /api/launch HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: {origin}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{{}}"));
        assert!(post("https://example.com").starts_with("HTTP/1.1 403"));
        assert!(send(port, &format!("POST /api/launch HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\n\r\n")).starts_with("HTTP/1.1 403"));
        let pre = send(port, &format!("OPTIONS /api/launch HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: coui://html_ui\r\n\r\n"));
        assert!(pre.starts_with("HTTP/1.1 204") && pre.contains("Access-Control-Allow-Methods: GET, POST"), "{pre}");
        assert!(send(port, &format!("OPTIONS /api/launch HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nOrigin: https://example.com\r\n\r\n")).starts_with("HTTP/1.1 403"));
        assert!(send(port, "GET /hud/v HTTP/1.1\r\nHost: evil.example:80\r\n\r\n").starts_with("HTTP/1.1 403"));
        assert!(send(port, "GET /hud/v HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 403"));
    }

    #[test]
    fn remote_calls_on_loopback() {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        spawn(l, port, Some(career()));
        let host = format!("127.0.0.1:{port}");
        let g = |path: &str| get_as(port, &host, path, "");

        let live = g("/api/call/msfs_career_live");
        assert!(live.starts_with("HTTP/1.1 200") && live.contains("\"link\":{\"state\":\"waiting\""), "{live}");
        let state = g("/api/call/msfs_career_state");
        assert!(state.starts_with("HTTP/1.1 200") && state.contains("\"pilot\":null"), "{state}");
        assert!(g("/api/call/msfs_career_track").ends_with("\r\n\r\n[]"));
        let a: String = url::form_urlencoded::byte_serialize(br#"{"south":40,"west":28,"north":42,"east":30,"detail":0}"#).collect();
        let map = g(&format!("/api/call/msfs_career_map_airports?a={a}"));
        assert!(map.starts_with("HTTP/1.1 200") && map.contains("\"icao\":\"LTFM\""), "{}", &map[..map.len().min(400)]);
        let info = g("/api/call/msfs_career_deck_info");
        assert!(info.starts_with("HTTP/1.1 200") && info.contains("\"lan\":{\"enabled\":false") && info.contains("\"windowOpen\":false"), "{info}");

        // Eksik ya da bozuk argüman 400; listede olmayan komut 404 (yazan komutlar uzaktan çağrılamaz).
        assert!(g("/api/call/msfs_career_map_airports").starts_with("HTTP/1.1 400"));
        assert!(g("/api/call/msfs_career_state?a=%7Bx").starts_with("HTTP/1.1 400"));
        assert!(g("/api/call/msfs_career_state?a=%5B%5D").starts_with("HTTP/1.1 400"));
        for cmd in ["msfs_career_create", "msfs_career_reset", "msfs_career_accept", "", "../state"] {
            assert!(g(&format!("/api/call/{cmd}")).starts_with("HTTP/1.1 404"), "{cmd}");
        }
        // Yerel ağ kapalıyken QR kodu yok.
        assert!(g("/api/deck/qr.svg").starts_with("HTTP/1.1 404"));
        // Uçuş ekranı penceresini yalnızca simin sayfaları açabilir; GET ile açılmaz.
        let open = |extra: &str| send(port, &format!("POST /api/deck/open HTTP/1.1\r\nHost: {host}\r\n{extra}Content-Length: 0\r\n\r\n"));
        assert!(open("Origin: https://example.com\r\n").starts_with("HTTP/1.1 403"));
        assert!(open("").starts_with("HTTP/1.1 403"));
        assert!(g("/api/deck/open").starts_with("HTTP/1.1 404"));
    }

    #[test]
    fn sim_assist_request_and_result() {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        let c = career();
        spawn(l, port, Some(c.clone()));
        let host = format!("127.0.0.1:{port}");
        assert!(get_as(port, &host, "/api/sim-assist", "").ends_with("\r\n\r\n{\"unpause\":0,\"notice\":null}"));
        c.live.lock().unwrap().assist = crate::career::SimAssist { unpause: 4, notice: Some("Pause".into()) };
        assert!(get_as(port, &host, "/api/sim-assist", "").ends_with("{\"unpause\":4,\"notice\":\"Pause\"}"));
        // Sonuç yalnızca simin sayfalarından; günlüğe süzülerek yazılır.
        let body = r#"{"id":"4","result":"toolbar\nsahte satır"}"#;
        let post = |origin: &str| send(port, &format!("POST /api/sim-assist HTTP/1.1\r\nHost: {host}\r\nOrigin: {origin}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}", body.len()));
        assert!(post("https://example.com").starts_with("HTTP/1.1 403"));
        assert!(post("coui://html_ui").starts_with("HTTP/1.1 200"));
        assert!(c.journal_tail(5).iter().any(|l| l.contains("sim içi kod istek 4 işledi: toolbarsahte satr")), "{:?}", c.journal_tail(5));
        assert_eq!(log_token("a\r\nb;<x>"), "abx");
    }

    #[test]
    fn lan_requires_host_and_key_and_is_read_only() {
        // 127.0.0.1 gerçek ağ adresinin yerine geçer; kurallar `Host` ve anahtara bakar.
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        let key = Arc::new(RwLock::new("a".repeat(26)));
        let lan = format!("192.0.2.10:{port}");
        let stop = Arc::new(AtomicBool::new(false));
        let thread = spawn_lan(l, port, Some(career()), LanAuth { host: lan.clone(), key: key.clone() }, stop.clone()).unwrap();
        let k = "a".repeat(26);
        let with_key = format!("X-Modstead-Key: {k}\r\n");
        let g = |host: &str, path: &str, extra: &str| get_as(port, host, path, extra);

        // DNS yeniden bağlama: yalnızca ağ adresi kabul edilir (127.0.0.1 adı bile).
        assert!(g(&format!("127.0.0.1:{port}"), "/api/call/msfs_career_live", &with_key).starts_with("HTTP/1.1 403"));
        assert!(g("evil.example", "/api/call/msfs_career_live", &with_key).starts_with("HTTP/1.1 403"));
        // Anahtar: başlıkla ya da `k` ile; yoksa ya da yanlışsa 401.
        assert!(g(&lan, "/api/call/msfs_career_live", "").starts_with("HTTP/1.1 401"));
        assert!(g(&lan, "/api/state", "X-Modstead-Key: yanlis\r\n").starts_with("HTTP/1.1 401"));
        assert!(g(&lan, &format!("/api/state?k={}", "b".repeat(26)), "").starts_with("HTTP/1.1 401"));
        assert!(g(&lan, "/api/photo/c172.jpg", "").starts_with("HTTP/1.1 401"));
        let live = g(&lan, "/api/call/msfs_career_live", &format!("{with_key}Origin: coui://html_ui\r\n"));
        assert!(live.starts_with("HTTP/1.1 200") && !live.contains("Access-Control-Allow-Origin"), "{live}");
        assert!(g(&lan, &format!("/api/state?k={k}"), "").starts_with("HTTP/1.1 200"));
        // Aynı kurallar: listede olmayan komut 404, yerel ağ kipi (genel durum) kapalıyken QR yok.
        assert!(g(&lan, &format!("/api/call/msfs_career_reset?k={k}"), "").starts_with("HTTP/1.1 404"));
        assert!(g(&lan, &format!("/api/deck/qr.svg?k={k}"), "").starts_with("HTTP/1.1 404"));
        // Sim sayfaları ağa açık değil.
        assert!(g(&lan, "/hud/v", &with_key).starts_with("HTTP/1.1 404"));
        assert!(g(&lan, "/menu/app.js", &with_key).starts_with("HTTP/1.1 404"));
        // Ağdan hiçbir POST ya da ön istek yok (anahtar ve sim kaynağı olsa bile).
        let post = |path: &str| send(port, &format!("POST {path} HTTP/1.1\r\nHost: {lan}\r\nOrigin: coui://html_ui\r\n{with_key}Content-Length: 2\r\n\r\n{{}}"));
        assert!(post("/api/launch").starts_with("HTTP/1.1 403"));
        assert!(post("/api/deck/open").starts_with("HTTP/1.1 403"));
        assert!(send(port, &format!("OPTIONS /api/launch HTTP/1.1\r\nHost: {lan}\r\nOrigin: coui://html_ui\r\n\r\n")).starts_with("HTTP/1.1 403"));
        // Anahtar yenilenince eskisi hemen geçersiz.
        *key.write().unwrap() = "c".repeat(26);
        assert!(g(&lan, "/api/state", &with_key).starts_with("HTTP/1.1 401"));
        assert!(g(&lan, &format!("/api/state?k={}", "c".repeat(26)), "").starts_with("HTTP/1.1 200"));
        // Boş anahtar hiçbir isteği geçirmez.
        *key.write().unwrap() = String::new();
        assert!(g(&lan, "/api/state?k=", "X-Modstead-Key: \r\n").starts_with("HTTP/1.1 401"));

        // Kapatınca dinleyici gerçekten kapanır.
        stop.store(true, Ordering::Relaxed);
        thread.join().unwrap();
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        assert!(TcpStream::connect_timeout(&addr, Duration::from_millis(800)).is_err());
    }

    #[test]
    fn tiles_on_loopback_and_lan() {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        spawn(l, port, Some(career()));
        let host = format!("127.0.0.1:{port}");
        let g = |path: &str| get_as(port, &host, path, "");

        // Gömülü katman: JPEG, tarayıcı önbelleğine izin, simin sayfası okuyabilir (tuval kirlenmesin).
        let t = get_as(port, &host, "/api/tiles/relief/0/0/0", "Origin: coui://html_ui\r\n");
        let head = &t[..t.find("\r\n\r\n").unwrap()];
        assert!(head.starts_with("HTTP/1.1 200") && head.contains("Content-Type: image/jpeg"), "{head}");
        assert!(head.contains("Cache-Control: public, max-age=") && !head.contains("no-store"), "{head}");
        assert!(head.contains("Access-Control-Allow-Origin: coui://html_ui"), "{head}");
        assert!(g("/api/tiles/relief/5/31/31").starts_with("HTTP/1.1 200"));
        // Aralık dışı, bozuk yol, bilinmeyen katman: 404 (önbelleğe alınmaz).
        for p in ["/api/tiles/relief/6/0/0", "/api/tiles/relief/1/2/0", "/api/tiles/sat/14/0/0", "/api/tiles/osm/0/0/0", "/api/tiles/relief/0/0/0.jpg", "/api/tiles/relief/../0/0", "/api/tiles/", "/api/tiles/relief/0/0/%30"] {
            let r = g(p);
            assert!(r.starts_with("HTTP/1.1 404") && r.contains("no-store"), "{p}: {r}");
        }
        // Çevrimiçi katman alınamazsa 503 (testin sunucu listesinde EOX yok: ağa çıkılmaz).
        let s = g("/api/tiles/sat/1/0/1");
        assert!(s.starts_with("HTTP/1.1 503") && s.contains("\"error\":\"tile unavailable") && s.contains("no-store"), "{s}");
        let info = g("/api/call/msfs_career_tiles_info");
        assert!(info.starts_with("HTTP/1.1 200") && info.contains("\"id\":\"relief\"") && info.contains("\"id\":\"sat\""), "{info}");

        // Yerel ağ: karolar da anahtar ister; anahtarsız istek uydu sunucusuna hiç ulaşmaz.
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        let k = "d".repeat(26);
        let lan = format!("192.0.2.11:{port}");
        let stop = Arc::new(AtomicBool::new(false));
        let thread = spawn_lan(l, port, Some(career()), LanAuth { host: lan.clone(), key: Arc::new(RwLock::new(k.clone())) }, stop.clone()).unwrap();
        assert!(get_as(port, &lan, "/api/tiles/relief/0/0/0", "").starts_with("HTTP/1.1 401"));
        assert!(get_as(port, &lan, "/api/tiles/sat/2/1/1", "").starts_with("HTTP/1.1 401"));
        let t = get_as(port, &lan, &format!("/api/tiles/relief/2/1/1?k={k}"), "Origin: coui://html_ui\r\n");
        assert!(t.starts_with("HTTP/1.1 200") && t.contains("Content-Type: image/jpeg") && !t.contains("Access-Control-Allow-Origin"));
        assert!(get_as(port, &lan, "/api/tiles/relief/2/1/1", &format!("X-Modstead-Key: {k}\r\n")).starts_with("HTTP/1.1 200"));
        stop.store(true, Ordering::Relaxed);
        thread.join().unwrap();
    }

    fn request(method: &str, path: &str, host: &str) -> Request {
        Request { method: method.into(), path: path.into(), host: Some(host.into()), ..Default::default() }
    }

    #[cfg(debug_assertions)]
    #[test]
    fn dev_proxy_never_takes_reserved_paths() {
        for p in ["/api", "/api/state", "/api/call/msfs_career_live", "/api/nope", "/hud", "/hud/v", "/menu/app.js", "deck", "/../x", "/a\\b"] {
            assert_eq!(proxy_target(p, "", false), None, "{p}");
        }
        assert_eq!(proxy_target("/deck", "lang=tr", false).as_deref(), Some("/deck.html?lang=tr"));
        assert_eq!(proxy_target("/deck/", "", true).as_deref(), Some("/deck.html"));
        assert_eq!(proxy_target("/src/deck/main.tsx", "", true).as_deref(), Some("/src/deck/main.tsx"));
        assert_eq!(proxy_target("/apis.js", "", false).as_deref(), Some("/apis.js"));
        assert_eq!(proxy_target("/node_modules/.vite/deps/react.js", "v=1", true).as_deref(), Some("/node_modules/.vite/deps/react.js?v=1"));
        for p in ["/@fs/C:/Windows/win.ini", "/.env", "/src/.secret/x", "/src/../package.json", "/%2e%2e/x", "/src\\x"] {
            assert_eq!(proxy_target(p, "", true), None, "{p}");
        }

        let lan = Via::Lan(LanAuth { host: "192.0.2.10:1".into(), key: Arc::new(RwLock::new("k".into())) });
        let status = |o: Outcome| match o {
            Outcome::Reply(r) => r.status.to_string(),
            Outcome::Proxy(t) => format!("proxy {t}"),
        };
        // Sayfa anahtarsız açılır; veri anahtarsız açılmaz ve hiçbir /api yolu Vite'a gitmez.
        assert_eq!(status(route(&request("GET", "/deck?lang=tr", "192.0.2.10:1"), 1, None, &lan)), "proxy /deck.html?lang=tr");
        assert!(status(route(&request("GET", "/api/nope", "192.0.2.10:1"), 1, None, &lan)).starts_with("401"));
        assert!(status(route(&request("GET", "/api/nope?k=k", "192.0.2.10:1"), 1, None, &lan)).starts_with("404"));
        assert!(status(route(&request("GET", "/api/nope", "127.0.0.1:1"), 1, None, &Via::Loopback)).starts_with("404"));
        assert!(status(route(&request("GET", "/hud/nope", "127.0.0.1:1"), 1, None, &Via::Loopback)).starts_with("404"));
        assert_eq!(status(route(&request("GET", "/assets/x.js", "localhost:1"), 1, None, &Via::Loopback)), "proxy /assets/x.js");
    }

    #[test]
    fn embedded_files_are_limited_to_the_deck() {
        let files: AssetFn = Arc::new(|p: &str| match p {
            "/deck.html" => Some((b"<!doctype html>".to_vec(), "text/html".into())),
            "/assets/deck-1a2b.js" => Some((b"x".to_vec(), "text/javascript".into())),
            "/index.html" => Some((b"main".to_vec(), "text/html".into())),
            _ => None,
        });
        let page = embedded_file("/deck", Some(&files));
        assert!(page.status.starts_with("200") && page.kind == "text/html; charset=utf-8");
        assert!(page.headers.iter().any(|(k, v)| *k == "Content-Security-Policy" && v.contains("connect-src 'self'") && v.contains("frame-ancestors 'none'")));
        let js = embedded_file("/assets/deck-1a2b.js", Some(&files));
        assert!(js.status.starts_with("200") && js.headers.iter().any(|(k, v)| *k == "Cache-Control" && v.contains("immutable")));
        for p in ["/index.html", "/", "/assets/", "/assets/../index.html", "/assets//x.js", "/assets/missing.js", "/deck.html.map"] {
            assert!(embedded_file(p, Some(&files)).status.starts_with("404"), "{p}");
        }
        assert!(embedded_file("/deck", None).status.starts_with("404"));
    }

    #[test]
    fn key_compare() {
        assert!(same(b"abc", b"abc") && !same(b"abc", b"abd") && !same(b"abc", b"ab") && same(b"", b""));
        assert!(section("/api", "/api") && section("/api/x", "/api") && !section("/apis", "/api"));
    }

    #[test]
    fn body_is_the_root_block() {
        let html = "<ingame-ui id=\"x\">\n\t<div id=\"ms-root\" class=\"a\"><div>b</div></div>\n\t</ingame-ui>";
        assert_eq!(panel_body(html), "<div id=\"ms-root\" class=\"a\"><div>b</div></div>");
        assert_eq!(panel_body("no root"), "");
    }
}
