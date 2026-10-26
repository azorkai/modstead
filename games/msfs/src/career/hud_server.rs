//! Simin içindeki Modstead sayfalarının yerel sunucusu: araç çubuğu panelinin ve ana menü arayüzünün kodunu,
//! görünümünü ve kariyer verisini verir; simin içinden kariyer işlemlerini (iş kabulü, uçak seçimi, uçuşu başlatma)
//! alır. Sim sayfaları yalnızca açılışta okuduğu için kod buradan gelir: Modstead güncellenince sayfalar simi
//! kapatmadan yenilenir. Uçlar: `games/msfs/hud/menu/API.md`.
//!
//! Güvenlik (kullanıcının onayıyla eklendi):
//! - Yalnızca 127.0.0.1'de dinler; yalnızca sabit yollar. Dosya ya da kabuk erişimi yoktur, diskten dosya okumaz:
//!   Modstead'e gömülü dosyaları ve kariyer verisini sunar.
//! - `Host` başlığı `127.0.0.1:<port>` ya da `localhost:<port>` değilse reddeder (DNS yeniden bağlama).
//! - Yanıtı okumaya (CORS) ve `POST`'a yalnızca simin `coui://` sayfaları izinlidir; başka kaynaklı ya da
//!   kaynaksız `POST` reddedilir. `POST` yalnızca kariyer işlemleridir.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

use serde::Deserialize;

use super::families;
use super::hud::panel_file;
use super::model::StartAt;
use super::Career;

/// Denenen portlar (sırayla; ilk boş olan). Simdeki yükleyiciler de bu listeyi dener.
pub const PORTS: [u16; 3] = [47213, 47214, 47215];
const APP: &str = "modstead-career-hud";
/// İstek gövdesinin üst sınırı (JSON işlemleri küçüktür).
const MAX_BODY: usize = 64 * 1024;

const MENU_JS: &[u8] = include_bytes!("../../hud/menu/ModsteadMenu.js");
const MENU_CSS: &[u8] = include_bytes!("../../hud/menu/ModsteadMenu.css");

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

/// Sunucuyu başlatır; dinlenen portu döner. Port bulunamazsa sayfalar paketteki kopyayla çalışır.
pub fn start(career: Arc<Career>) -> Option<u16> {
    PORTS.iter().find_map(|p| TcpListener::bind(("127.0.0.1", *p)).ok().map(|l| (l, *p))).map(|(l, p)| {
        spawn(l, p, Some(career));
        p
    })
}

fn spawn(listener: TcpListener, port: u16, career: Option<Arc<Career>>) {
    std::thread::Builder::new()
        .name("modstead-hud-server".into())
        .spawn(move || {
            for s in listener.incoming().flatten() {
                // Her bağlantı kısa sürer (tek istek, `Connection: close`); yavaş bir istemci diğerlerini bekletmesin.
                let c = career.clone();
                let _ = std::thread::Builder::new().name("modstead-hud-conn".into()).spawn(move || handle(s, port, c.as_deref()));
            }
        })
        .ok();
}

struct Request {
    method: String,
    path: String,
    host: Option<String>,
    origin: Option<String>,
    body: Vec<u8>,
}

struct Reply {
    status: &'static str,
    kind: &'static str,
    body: Vec<u8>,
    /// `OPTIONS` ön isteğine verilen izin başlıkları.
    preflight: bool,
}

fn reply(status: &'static str, kind: &'static str, body: impl Into<Vec<u8>>) -> Reply {
    Reply { status, kind, body: body.into(), preflight: false }
}

fn json(value: &impl serde::Serialize) -> Reply {
    reply("200 OK", "application/json; charset=utf-8", serde_json::to_vec(value).unwrap_or_default())
}

fn error(status: &'static str, msg: &str) -> Reply {
    reply(status, "application/json; charset=utf-8", serde_json::to_vec(&serde_json::json!({ "error": msg })).unwrap_or_default())
}

/// Simin sayfaları `coui://…` kaynağından gelir.
fn from_sim(origin: Option<&str>) -> bool {
    origin.is_some_and(|o| o.to_ascii_lowercase().starts_with("coui://"))
}

/// Bir isteği yanıtlar (bağlantıdan bağımsız; testler doğrudan çağırır).
fn respond(req: &Request, port: u16, career: Option<&Career>) -> Reply {
    let allowed_host = req.host.as_deref().is_some_and(|h| h.eq_ignore_ascii_case(&format!("127.0.0.1:{port}")) || h.eq_ignore_ascii_case(&format!("localhost:{port}")));
    if !allowed_host {
        return error("403 Forbidden", "forbidden");
    }
    let path = req.path.split('?').next().unwrap_or("");
    match req.method.as_str() {
        "OPTIONS" if from_sim(req.origin.as_deref()) => Reply { preflight: true, ..reply("204 No Content", "text/plain", Vec::new()) },
        "GET" => get(path, career),
        "POST" if from_sim(req.origin.as_deref()) => match career {
            Some(c) => post(path, &req.body, c),
            None => error("503 Service Unavailable", "career unavailable"),
        },
        "OPTIONS" | "POST" => error("403 Forbidden", "forbidden"),
        _ => error("405 Method Not Allowed", "method not allowed"),
    }
}

fn get(path: &str, career: Option<&Career>) -> Reply {
    let a = assets();
    match path {
        "/hud/v" => reply("200 OK", "application/json", format!("{{\"app\":\"{APP}\",\"v\":\"{}\"}}", a.version)),
        "/hud/app.js" => reply("200 OK", "text/javascript; charset=utf-8", a.js),
        "/hud/app.css" => reply("200 OK", "text/css; charset=utf-8", a.css),
        "/hud/body.html" => reply("200 OK", "text/html; charset=utf-8", a.body.clone()),
        "/menu/app.js" => reply("200 OK", "text/javascript; charset=utf-8", MENU_JS),
        "/menu/app.css" => reply("200 OK", "text/css; charset=utf-8", MENU_CSS),
        _ => {
            if let Some(id) = path.strip_prefix("/api/photo/").and_then(|p| p.strip_suffix(".jpg")) {
                return match families::photo(id) {
                    Some(b) => reply("200 OK", "image/jpeg", b),
                    None => error("404 Not Found", "not found"),
                };
            }
            if !matches!(path, "/api/state" | "/api/live" | "/api/board" | "/api/aircraft") {
                return error("404 Not Found", "not found");
            }
            let Some(c) = career else { return error("503 Service Unavailable", "career unavailable") };
            match path {
                "/api/state" => json(&c.view()),
                "/api/live" => json(&c.live()),
                "/api/board" => match c.board() {
                    Ok(b) => json(&b),
                    Err(e) => error("400 Bad Request", &e.to_string()),
                },
                "/api/aircraft" => json(&aircraft(c)),
                _ => error("404 Not Found", "not found"),
            }
        }
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
}

fn post(path: &str, body: &[u8], c: &Career) -> Reply {
    let b: Body = if body.is_empty() { Body::default() } else {
        match serde_json::from_slice(body) {
            Ok(b) => b,
            Err(_) => return error("400 Bad Request", "invalid json"),
        }
    };
    c.note("sim içi", format!("işlem: {path}"));
    let r = match path {
        "/api/accept" => c.accept(&b.id),
        "/api/pick" => c.pick_aircraft(&b.title, &b.livery, None),
        "/api/launch" => c.launch(b.start),
        "/api/cancel" => c.cancel(),
        _ => return error("404 Not Found", "not found"),
    };
    match r {
        Ok(()) => json(&serde_json::json!({ "ok": true })),
        Err(e) => {
            c.note("sim içi", format!("işlem reddedildi: {path}: {e}"));
            error("400 Bad Request", &e.to_string())
        }
    }
}

fn handle(mut s: TcpStream, port: u16, career: Option<&Career>) {
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
    let mut req = Request { method: parts.next().unwrap_or("").to_string(), path: parts.next().unwrap_or("").to_string(), host: None, origin: None, body: Vec::new() };
    let mut length = 0usize;
    for l in lines {
        if let Some((k, v)) = l.split_once(':') {
            let v = v.trim().to_string();
            match k.trim().to_ascii_lowercase().as_str() {
                "host" => req.host = Some(v),
                "origin" => req.origin = Some(v),
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
    let r = respond(&req, port, career);
    let mut out = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n",
        r.status,
        r.kind,
        r.body.len()
    );
    if let Some(o) = req.origin.as_deref().filter(|o| from_sim(Some(o))) {
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

    fn send(port: u16, raw: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = Vec::new();
        s.read_to_end(&mut out).unwrap();
        String::from_utf8_lossy(&out).into_owned()
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
    fn body_is_the_root_block() {
        let html = "<ingame-ui id=\"x\">\n\t<div id=\"ms-root\" class=\"a\"><div>b</div></div>\n\t</ingame-ui>";
        assert_eq!(panel_body(html), "<div id=\"ms-root\" class=\"a\"><div>b</div></div>");
        assert_eq!(panel_body("no root"), "");
    }
}
