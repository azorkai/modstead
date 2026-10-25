//! Simle canlı bağlantı: arka planda tek bir iş parçacığı sim açılınca bağlanır, kopunca yeniden dener.
//!
//! Bağlantı yerel TCP üzerindendir. MSFS 2024 her kurulumda `SimConnect.xml` dosyasına yerel bir IPv4 girişi
//! (öntanımlı 500) yazar; port oradan okunur. MSFS 2020 öntanımlı olarak yalnızca adlandırılmış boru açar; o
//! dosyada IPv4 girişi yoksa durum bunu söyler (Modstead kullanıcının sim ayarına kendiliğinden dokunmaz).
//!
//! Okuma kısa zaman aşımıyla yapılır; böylece aynı iş parçacığı arada giden istekleri de yazar (boru ya da
//! soket iki iş parçacığı arasında paylaşılmaz, kilitlenme olmaz).

use std::io::{ErrorKind, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::sync::mpsc::{Receiver, Sender, TryRecvError};
use std::time::{Duration, Instant};

use modstead_core::tr;

use super::simconnect::{ExceptionName, Framer, PROTO_KITTYHAWK, PROTO_SUNRISE, Recv, Request, decode};

/// Bağlanılacak sim.
#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    /// "msfs2020" | "msfs2024"
    pub sim: String,
    pub addr: SocketAddr,
    pub protocol: u32,
}

/// Bağlantı iş parçacığının kendisine verilen işi yapan taraf (kariyer motoru).
pub trait Handler: Send + 'static {
    /// Bağlanılacak sim (çalışmıyorsa `Err(neden)`); birkaç saniyede bir çağrılır.
    fn target(&mut self) -> Result<Target, String>;
    /// Oturum açıldı: veri tanımları ve abonelikler burada gönderilir.
    fn on_open(&mut self, out: &mut Outbox, target: &Target, version: (u32, u32, u32, u32));
    fn on_recv(&mut self, out: &mut Outbox, msg: Recv);
    /// Arayüzden gelen bir komut.
    fn on_command(&mut self, out: &mut Outbox, cmd: Command);
    /// Bağlıyken yaklaşık 4 kez/sn çağrılır (zaman aşımları, kayıt).
    fn tick(&mut self, out: &mut Outbox);
    fn on_state(&mut self, state: LinkState);
}

/// Bağlantı durumu (arayüzde rozet).
#[derive(Debug, Clone, PartialEq)]
pub enum LinkState {
    /// Sim açık değil ya da bağlanılacak yer bilinmiyor.
    Waiting(String),
    Connecting(String),
    Connected { sim: String, protocol: u32 },
    Failed(String),
}

/// Arayüzün bağlantı iş parçacığına gönderdikleri.
#[derive(Debug, Clone)]
pub enum Command {
    /// Uçağı kalkış havalimanındaki uygun park yerine taşı.
    Reposition,
    /// Bir havalimanının pist ve park yerlerini simden iste.
    AirportDetail { icao: String },
    /// Yüklü uçak ve boya listesini tazele.
    RefreshAircraft,
    Shutdown,
}

/// Giden istekler. Her isteğin gönderim numarası döner: sim bir hatayı bu numarayla bildirir.
pub struct Outbox {
    pub protocol: u32,
    next_id: u32,
    queue: Vec<(u32, Request)>,
}

impl Outbox {
    pub fn new(protocol: u32) -> Self {
        Outbox { protocol, next_id: 0, queue: Vec::new() }
    }

    #[cfg(test)]
    pub fn take(&mut self) -> Vec<(u32, Request)> {
        std::mem::take(&mut self.queue)
    }

    /// 2020 protokolünün tanımadığı işlevler gönderilmez (`None`); göndermek oturumu bozan bir hata üretir.
    pub fn send(&mut self, r: Request) -> Option<u32> {
        if r.needs_sunrise() && self.protocol < PROTO_SUNRISE {
            return None;
        }
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1);
        self.queue.push((id, r));
        Some(id)
    }
}

/// `SimConnect.xml` içindeki ilk sabit, yerel IPv4 portu.
pub fn ipv4_port(xml: &str) -> Option<u16> {
    let doc = roxmltree::Document::parse(xml).ok()?;
    doc.descendants().filter(|n| n.has_tag_name("SimConnect.Comm")).find_map(|n| {
        let child = |tag: &str| n.children().find(|c| c.has_tag_name(tag)).and_then(|c| c.text()).map(|t| t.trim().to_string());
        let proto = child("Protocol")?;
        if !proto.eq_ignore_ascii_case("IPv4") {
            return None;
        }
        if child("Disabled").is_some_and(|d| d.eq_ignore_ascii_case("true") || d == "1") {
            return None;
        }
        let port: u16 = child("Port")?.parse().ok()?;
        (port != 0).then_some(port)
    })
}

/// Bir simin yapılandırma klasöründen bağlanma adresi.
pub fn target_for(sim: &str, config_dir: Option<&Path>) -> Result<Target, String> {
    let protocol = if sim == crate::sims::SIM_2020 { PROTO_KITTYHAWK } else { PROTO_SUNRISE };
    let port = config_dir
        .map(|d| d.join("SimConnect.xml"))
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| ipv4_port(&String::from_utf8_lossy(&b)));
    let port = match port {
        Some(p) => p,
        // 2024 her zaman 500'ü açar; dosya okunamadıysa da denemeye değer.
        None if protocol == PROTO_SUNRISE => 500,
        None => {
            return Err(tr!(
                "MSFS 2020 yerel TCP bağlantısı açmıyor (SimConnect.xml'de IPv4 girişi yok).",
                "MSFS 2020 does not open a local TCP connection (no IPv4 entry in SimConnect.xml)."
            )
            .to_string());
        }
    };
    Ok(Target { sim: sim.to_string(), addr: SocketAddr::from(([127, 0, 0, 1], port)), protocol })
}

/// Bağlantı iş parçacığının ana döngüsü. `Command::Shutdown` gelene kadar döner.
pub fn run(mut handler: impl Handler, commands: Receiver<Command>) {
    let mut last_state: Option<LinkState> = None;
    let mut set_state = |h: &mut dyn Handler, s: LinkState| {
        if last_state.as_ref() != Some(&s) {
            last_state = Some(s.clone());
            h.on_state(s);
        }
    };
    loop {
        let target = match handler.target() {
            Ok(t) => t,
            Err(why) => {
                set_state(&mut handler, LinkState::Waiting(why));
                if wait_commands(&commands, Duration::from_secs(4)) {
                    return;
                }
                continue;
            }
        };
        set_state(&mut handler, LinkState::Connecting(target.sim.clone()));
        let stream = match TcpStream::connect_timeout(&target.addr, Duration::from_secs(2)) {
            Ok(s) => s,
            Err(e) => {
                // Sim açılıyor olabilir: sunucu ana menüden biraz önce dinlemeye başlar.
                set_state(&mut handler, LinkState::Waiting(tr!(format!("Sim yanıt vermiyor ({e})."), format!("The sim is not answering ({e}).")).to_string()));
                if wait_commands(&commands, Duration::from_secs(4)) {
                    return;
                }
                continue;
            }
        };
        match session(&mut handler, &commands, stream, &target, &mut set_state) {
            SessionEnd::Shutdown => return,
            SessionEnd::Lost(why) => {
                log::info!("SimConnect oturumu kapandı: {why}");
                set_state(&mut handler, LinkState::Waiting(why));
                if wait_commands(&commands, Duration::from_secs(3)) {
                    return;
                }
            }
        }
    }
}

/// Bağlı değilken gelen komutları yutar (bekleyen otomatik başlatma motorun kendi durumunda tutulur).
fn wait_commands(rx: &Receiver<Command>, d: Duration) -> bool {
    let until = Instant::now() + d;
    while Instant::now() < until {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(Command::Shutdown) | Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return true,
            Ok(_) | Err(_) => {}
        }
    }
    false
}

enum SessionEnd {
    Shutdown,
    Lost(String),
}

fn session(
    handler: &mut impl Handler,
    commands: &Receiver<Command>,
    mut stream: TcpStream,
    target: &Target,
    set_state: &mut impl FnMut(&mut dyn Handler, LinkState),
) -> SessionEnd {
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(Duration::from_millis(60)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let mut out = Outbox::new(target.protocol);
    out.send(Request::Open { app: "Modstead".into() });
    let mut framer = Framer::default();
    let mut buf = vec![0u8; 64 * 1024];
    let opened_at = Instant::now();
    let mut open = false;
    let mut last_tick = Instant::now();
    // Hata iletilerini isteğe bağlamak için son gönderilenler.
    let mut sent: std::collections::VecDeque<(u32, String)> = std::collections::VecDeque::new();

    loop {
        // Giden: önce arayüz komutları (yalnızca oturum açıkken anlamlı), sonra kuyruk.
        if open {
            loop {
                match commands.try_recv() {
                    Ok(Command::Shutdown) => return SessionEnd::Shutdown,
                    Ok(cmd) => handler.on_command(&mut out, cmd),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => return SessionEnd::Shutdown,
                }
            }
        }
        for (send_id, req) in out.queue.drain(..) {
            let bytes = req.encode(target.protocol, send_id);
            if sent.len() > 256 {
                sent.pop_front();
            }
            sent.push_back((send_id, format!("{req:?}").chars().take(120).collect()));
            if let Err(e) = stream.write_all(&bytes) {
                return SessionEnd::Lost(tr!(format!("Sime yazılamadı: {e}"), format!("Could not write to the sim: {e}")).to_string());
            }
        }

        // Gelen.
        match stream.read(&mut buf) {
            Ok(0) => return SessionEnd::Lost(tr!("Sim bağlantıyı kapattı.", "The sim closed the connection.").to_string()),
            Ok(n) => framer.push(&buf[..n]),
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(e) => return SessionEnd::Lost(tr!(format!("Bağlantı koptu: {e}"), format!("Connection lost: {e}")).to_string()),
        }
        while let Some(body) = framer.next() {
            match decode(&body) {
                Recv::Open { version, .. } => {
                    open = true;
                    set_state(handler, LinkState::Connected { sim: target.sim.clone(), protocol: target.protocol });
                    handler.on_open(&mut out, target, version);
                }
                Recv::Quit => return SessionEnd::Lost(tr!("Sim kapandı.", "The sim was closed.").to_string()),
                Recv::Exception { exception, send_id, index } => {
                    let what = sent.iter().find(|(id, _)| *id == send_id).map(|(_, w)| w.as_str()).unwrap_or("?");
                    log::debug!("SimConnect hatası {} (gönderim {send_id}, alan {index}): {what}", ExceptionName(exception));
                    handler.on_recv(&mut out, Recv::Exception { exception, send_id, index });
                }
                msg => handler.on_recv(&mut out, msg),
            }
        }

        if !open && opened_at.elapsed() > Duration::from_secs(10) {
            return SessionEnd::Lost(tr!("Sim oturum açma isteğine yanıt vermedi.", "The sim did not answer the open request.").to_string());
        }
        if open && last_tick.elapsed() >= Duration::from_millis(250) {
            last_tick = Instant::now();
            handler.tick(&mut out);
        }
    }
}

/// Bağlantı iş parçacığına komut göndermek için tutamaç.
#[derive(Clone)]
pub struct LinkHandle {
    tx: Sender<Command>,
}

impl LinkHandle {
    pub fn spawn(handler: impl Handler) -> LinkHandle {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::Builder::new()
            .name("msfs-simconnect".into())
            .spawn(move || run(handler, rx))
            .expect("simconnect iş parçacığı başlatılamadı");
        LinkHandle { tx }
    }

    pub fn send(&self, cmd: Command) {
        let _ = self.tx.send(cmd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const XML_2024: &str = r#"<?xml version="1.0" encoding="Windows-1252"?>
<SimBase.Document Type="SimConnect">
  <SimConnect.Comm><Descr>Static IP4 port</Descr><Protocol>IPv4</Protocol><Scope>local</Scope><Port>500</Port></SimConnect.Comm>
  <SimConnect.Comm><Descr>Static IP6 port</Descr><Protocol>IPv6</Protocol><Scope>local</Scope><Port>501</Port></SimConnect.Comm>
  <SimConnect.Comm><Descr>Dynamic IP4 port</Descr><Protocol>IPv4</Protocol><Scope>local</Scope><Port>0</Port></SimConnect.Comm>
</SimBase.Document>"#;

    #[test]
    fn reads_static_ipv4_port() {
        assert_eq!(ipv4_port(XML_2024), Some(500));
        let only_dynamic = XML_2024.replace("<Port>500</Port>", "<Port>0</Port>");
        assert_eq!(ipv4_port(&only_dynamic), None);
        let custom = XML_2024.replace("<Port>500</Port>", "<Port>4500</Port>");
        assert_eq!(ipv4_port(&custom), Some(4500));
        assert_eq!(ipv4_port("bozuk"), None);
    }

    #[test]
    fn sim_2020_without_tcp_is_explained() {
        assert!(target_for(crate::sims::SIM_2020, None).is_err());
        let t = target_for(crate::sims::SIM_2024, None).unwrap();
        assert_eq!(t.addr.port(), 500);
        assert_eq!(t.protocol, PROTO_SUNRISE);
    }
}

/// Gerçek simle salt okunur protokol denemesi (sim açıkken):
/// `cargo test -p game-msfs real_simconnect -- --ignored --nocapture`
/// Bağlanır, oturum açar, kullanıcı uçağının konumunu ve adını bir kez ister, yüklü uçak listesini ve havalimanı
/// sayısını alır. Hiçbir şey yazmaz, uçuş yüklemez.
#[cfg(test)]
mod real {
    use std::io::{Read, Write};
    use std::net::TcpStream;
    use std::time::{Duration, Instant};

    use super::super::simconnect::*;

    #[test]
    #[ignore]
    fn real_simconnect() {
        let cfg = std::env::var_os("LOCALAPPDATA").map(|l| std::path::PathBuf::from(l).join(r"Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache"));
        let target = super::target_for(crate::sims::SIM_2024, cfg.as_deref()).expect("hedef");
        println!("bağlanılıyor: {}", target.addr);
        let mut s = TcpStream::connect_timeout(&target.addr, Duration::from_secs(3)).expect("sim açık değil ya da port kapalı");
        s.set_read_timeout(Some(Duration::from_millis(200))).unwrap();
        let mut id = 0u32;
        let mut send = |s: &mut TcpStream, r: Request| {
            s.write_all(&r.encode(PROTO_SUNRISE, id)).unwrap();
            id += 1;
        };
        send(&mut s, Request::Open { app: "Modstead test".into() });
        for (n, u, t) in [("PLANE LATITUDE", "degrees", DataType::Float64), ("PLANE LONGITUDE", "degrees", DataType::Float64), ("SIM ON GROUND", "bool", DataType::Float64), ("TITLE", "", DataType::String256)] {
            send(&mut s, Request::AddToDataDefinition { define: 1, name: n.into(), units: u.into(), datatype: t, epsilon: 0.0 });
        }
        send(&mut s, Request::RequestDataOnSimObject { request: 1, define: 1, object: OBJECT_USER, period: Period::Once, flags: 0, interval: 0 });
        send(&mut s, Request::EnumerateSimObjectsAndLiveries { request: 2, kind: SIMOBJECT_AIRCRAFT });
        send(&mut s, Request::RequestAllFacilities { request: 3, kind: FACILITY_AIRPORT });
        send(&mut s, Request::SubscribeToFlowEvent);
        let mut fr = Framer::default();
        let mut buf = vec![0u8; 65536];
        let (mut liveries, mut airports) = (0usize, 0usize);
        let until = Instant::now() + Duration::from_secs(20);
        while Instant::now() < until {
            match s.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => fr.push(&buf[..n]),
                Err(_) => {}
            }
            while let Some(b) = fr.next() {
                match decode(&b) {
                    Recv::Open { app, version } => println!("oturum açıldı: {app} {version:?}"),
                    Recv::SimObjectData { request: 1, data, .. } => {
                        let mut r = Reader::new(&data);
                        println!("konum {:.5} {:.5} yerde={} uçak='{}'", r.f64(), r.f64(), r.f64(), r.str(256));
                    }
                    Recv::Liveries { items, entry, out_of, .. } => {
                        liveries += items.len();
                        if entry + 1 == out_of {
                            println!("{liveries} uçak/boya; ilk: {:?}", items.first());
                        }
                    }
                    Recv::AirportList { airports: a, entry, out_of, .. } => {
                        airports += a.len();
                        if entry + 1 == out_of {
                            println!("{airports} havalimanı");
                        }
                    }
                    Recv::Exception { exception, send_id, .. } => println!("hata {} (gönderim {send_id})", ExceptionName(exception)),
                    Recv::Flow { event, .. } => println!("akış: {}", flow::name(event)),
                    _ => {}
                }
            }
        }
        assert!(liveries > 0 || airports > 0, "simden yanıt gelmedi");
    }
}
