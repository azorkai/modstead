//! Kariyer kipi: sıfırdan başlayan pilot, iş ilanları, otomatik uçuş başlatma, uçuş takibi ve seyir defteri.
//!
//! Her şey Modstead'in içindedir; kariyer için simin içine paket kurulmaz. Sim ile SimConnect ağ protokolü üzerinden
//! (DLL'siz) konuşulur; Modstead kapalıyken kariyer de yoktur. İsteğe bağlı sim içi panel (`hud`) yalnızca Modstead'in
//! yazdığını gösterir. Tasarım ve araştırma: `games/msfs/KARIYER.md`.
//!
//! Katmanlar:
//! - `simconnect` / `link`: protokol ve bağlantı iş parçacığı,
//! - `engine`: bağlantının kariyer tarafı (veri tanımları, telemetri, otomatik başlatma, takip),
//! - `tracker`: uçuşun evreleri ve puanı, `economy` / `progression` / `jobs`: oyun kuralları,
//! - `hud`: sim içi panelin verisi ve paketi,
//! - bu dosya: kalıcı durum ve arayüzün çağırdığı işlemler.

pub mod aircraft;
pub mod airports;
pub mod commands;
pub mod economy;
pub mod families;
mod engine;
pub mod flt;
pub mod hud;
pub mod hud_server;
pub mod jobs;
pub mod journal;
pub mod link;
pub mod menu;
pub mod model;
pub mod progression;
pub mod simconnect;
pub mod tracker;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Instant;

use modstead_core::fsx;
use modstead_core::prelude::*;
use serde::{Deserialize, Serialize};

use aircraft::{Class, classify_name, info};
use airports::{Airport, db};
use economy::{Damage, Settlement};
use flt::AirportDetail;
use link::{Command, LinkHandle};
use model::*;
use model::Stage;
use progression::{Difficulty, LICENSES, License, can_fly, eligibility, level_for_xp, xp_for_level};
use tracker::{Telemetry, TrackPoint};

/// Canlı durum (≈1 Hz) ve kariyer verisi değişti olayları.
pub const EVENT_LIVE: &str = "msfs://career-live";
pub const EVENT_CHANGED: &str = "msfs://career";

pub type SimsFn = Arc<dyn Fn() -> Vec<crate::sims::SimInstall> + Send + Sync>;

// ---------- Canlı durum ----------

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LinkView {
    /// "waiting" | "connecting" | "connected"
    pub state: String,
    pub sim: Option<String>,
    pub detail: Option<String>,
}

/// Şu an simde uçulan uçak.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AircraftNow {
    pub title: String,
    pub atc_model: String,
    pub atc_id: String,
    pub class: Option<Class>,
    pub specs: aircraft::SimSpecs,
    pub manages_own_loading: bool,
}

/// Uçuş öncesi kontrol (OnAir'in yeşile dönen kapısı).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    /// "connected" | "in_flight" | "at_departure" | "aircraft" | "capacity" | "slew" | "payload" | "fuel"
    pub id: String,
    pub ok: bool,
    /// Zorunlu değilse yalnızca uyarı.
    pub required: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchView {
    /// "waiting_sim" | "fetching_airport" | "loading" | "positioning" | "done" | "manual"
    pub step: String,
    pub note: String,
    pub elapsed_s: u64,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlightLive {
    pub phase: tracker::Phase,
    pub elapsed_s: f64,
    pub flown_nm: f64,
    pub remaining_nm: f64,
    pub fuel_used_lb: f64,
    pub score_now: u8,
    pub events: Vec<tracker::FlightEvent>,
    pub landing: Option<tracker::Landing>,
    pub invalid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Live {
    pub link: LinkView,
    pub in_flight: bool,
    pub paused: bool,
    pub telemetry: Option<Telemetry>,
    pub aircraft: Option<AircraftNow>,
    /// Yerdeyken en yakın havalimanı.
    pub nearest: Option<String>,
    pub checks: Vec<Check>,
    pub launch: Option<LaunchView>,
    pub flight: Option<FlightLive>,
    /// Simin `CAMERA STATE` değeri (2 kokpit, 16 açılış sineması…).
    pub camera: Option<u32>,
    #[serde(skip)]
    pub last_data: Option<Instant>,
    #[serde(skip)]
    pub launch_state: Option<engine::Launch>,
}

/// Simden öğrenilen ve diske yazılan önbellekler.
#[derive(Default)]
pub struct Caches {
    pub installed: Installed,
    pub sim_airports: Option<HashSet<String>>,
    pub details: HashMap<String, AirportDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Installed {
    /// (başlık, boya) çiftleri — MSFS 2024'ün `EnumerateSimObjectsAndLiveries` yanıtı.
    pub items: Vec<(String, String)>,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct SimAirports {
    idents: Vec<String>,
    fetched_at: i64,
}

// ---------- Arayüz görünümleri ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PilotView {
    #[serde(flatten)]
    pub pilot: Pilot,
    pub level: u32,
    pub level_xp: u64,
    pub next_level_xp: u64,
    pub title: String,
    pub rating: Option<f64>,
    pub can_contract: bool,
    /// Bankadan çekilebilecek en yüksek toplam borç.
    pub credit_limit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseView {
    #[serde(flatten)]
    pub license: &'static License,
    #[serde(flatten)]
    pub eligibility: progression::Eligibility,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveView {
    pub job: Job,
    pub accepted_at: i64,
    pub deadline_at: i64,
    pub aircraft: Option<AircraftPick>,
    pub start: StartAt,
    /// Kalkış havalimanının pist uçları (simden alındıysa simin verisi, yoksa Modstead'in listesi).
    pub runway_ends: Vec<String>,
    pub stage: Stage,
    pub launch_note: Option<String>,
    pub from: Option<Airport>,
    pub to: Option<Airport>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CareerView {
    pub pilot: Option<PilotView>,
    pub location: Option<Airport>,
    pub active: Option<ActiveView>,
    pub fleet: Vec<FleetAircraft>,
    pub licenses: Vec<LicenseView>,
    pub recent: Vec<LogEntry>,
    pub classes: Vec<&'static aircraft::ClassInfo>,
    pub link: LinkView,
}

/// Yüklü uçak seçeneği.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AircraftOption {
    pub title: String,
    pub liveries: Vec<String>,
    pub class: Option<Class>,
    /// "sim" (bu uçağa binildi, değerler simden) | "user" | "name" (adından tahmin) | "unknown"
    pub class_source: String,
    pub flyable: bool,
    pub manages_own_loading: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequest {
    pub name: String,
    pub callsign: String,
    pub home: String,
    pub difficulty: Difficulty,
    pub start: String,
}

// ---------- Kariyer ----------

pub struct Career {
    pub services: Arc<Services>,
    dir: PathBuf,
    cache_dir: PathBuf,
    data: Mutex<CareerData>,
    log: Mutex<Vec<LogEntry>>,
    pub(crate) live: Mutex<Live>,
    pub(crate) caches: Mutex<Caches>,
    pub(crate) journal: journal::Journal,
    link: OnceLock<LinkHandle>,
    sims: SimsFn,
}

fn now() -> i64 {
    fsx::now_ts()
}

impl Career {
    pub fn open(services: Arc<Services>, sims: SimsFn) -> Arc<Career> {
        let dir = services.paths.game_data(crate::ID).join("career");
        let cache_dir = services.paths.game_local(crate::ID).join("career");
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::create_dir_all(&cache_dir);
        let data: CareerData = fsx::read_json(&dir.join("career.json"));
        let log: Vec<LogEntry> = fsx::read_json(&dir.join("logbook.json"));
        let installed: Installed = fsx::read_json(&cache_dir.join("aircraft.json"));
        let sim_airports: SimAirports = fsx::read_json(&cache_dir.join("sim-airports.json"));
        let caches = Caches {
            installed,
            sim_airports: (!sim_airports.idents.is_empty()).then(|| sim_airports.idents.into_iter().collect()),
            details: HashMap::new(),
        };
        let journal = journal::Journal::new(&cache_dir.join("logs"));
        journal.write("uygulama", &format!("kariyer açıldı (Modstead {})", env!("CARGO_PKG_VERSION")));
        Arc::new(Career {
            services,
            dir,
            cache_dir,
            journal,
            data: Mutex::new(data),
            log: Mutex::new(log),
            live: Mutex::new(Live { link: LinkView { state: "waiting".into(), ..Default::default() }, ..Default::default() }),
            caches: Mutex::new(caches),
            link: OnceLock::new(),
            sims,
        })
    }

    /// Sim bağlantısını başlatır (yalnızca uygulamada; testlerde çağrılmaz).
    pub fn start_link(self: &Arc<Self>) {
        let handler = engine::Engine::new(self.clone());
        let _ = self.link.set(LinkHandle::spawn(handler));
        // Simin içindeki Modstead sayfalarının yerel sunucusu (yalnızca 127.0.0.1; bkz. hud_server).
        match hud_server::start(self.clone()) {
            Some(p) => self.note("panel", format!("panel sunucusu 127.0.0.1:{p} üzerinde")),
            None => self.note("panel", "panel sunucusu açılamadı (portlar dolu); panel paketteki kopyayla çalışır"),
        }
    }

    pub(crate) fn send(&self, cmd: Command) {
        if let Some(l) = self.link.get() {
            l.send(cmd);
        }
    }

    pub(crate) fn lock_data(&self) -> MutexGuard<'_, CareerData> {
        self.data.lock().unwrap()
    }

    pub(crate) fn save(&self, d: &CareerData) {
        let mut d = d.clone();
        d.version = DATA_VERSION;
        if let Err(e) = fsx::write_json(&self.dir.join("career.json"), &d) {
            log::warn!("kariyer verisi yazılamadı: {e}");
        }
    }

    pub(crate) fn changed(&self) {
        self.services.emit(EVENT_CHANGED, serde_json::json!({}));
    }

    pub(crate) fn cache_path(&self, name: &str) -> PathBuf {
        self.cache_dir.join(name)
    }

    /// Kariyer günlüğüne bir satır (bkz. `journal`).
    pub(crate) fn note(&self, area: &str, msg: impl AsRef<str>) {
        self.journal.write(area, msg.as_ref());
    }

    /// Günlüğün son satırları (arayüzdeki "Günlük" bölümü için).
    pub fn journal_tail(&self, n: usize) -> Vec<String> {
        self.journal.tail(n)
    }

    /// Günlük dosyasının yolu (Gezgin'de göstermek için).
    pub fn journal_path(&self) -> PathBuf {
        self.journal.path().to_path_buf()
    }

    pub(crate) fn sims(&self) -> Vec<crate::sims::SimInstall> {
        (self.sims)()
    }

    pub fn has_pilot(&self) -> bool {
        self.lock_data().pilot.is_some()
    }

    pub fn live(&self) -> Live {
        self.live.lock().unwrap().clone()
    }

    // ----- Görünüm -----

    pub fn view(&self) -> CareerView {
        let d = self.lock_data().clone();
        let link = self.live.lock().unwrap().link.clone();
        let recent: Vec<LogEntry> = self.log.lock().unwrap().iter().rev().take(6).map(light_entry).collect();
        let pilot = d.pilot.as_ref().map(|p| pilot_view(p, fleet_value(&d)));
        let licenses = match &d.pilot {
            Some(p) => {
                let level = level_for_xp(p.xp);
                LICENSES
                    .iter()
                    .map(|l| LicenseView { license: l, eligibility: eligibility(l, &p.licenses, p.stats.hours, level, p.money, p.difficulty) })
                    .collect()
            }
            None => Vec::new(),
        };
        CareerView {
            location: d.pilot.as_ref().and_then(|p| db().get(&p.location).cloned()),
            active: d.active.as_ref().map(|a| ActiveView {
                job: a.job.clone(),
                accepted_at: a.accepted_at,
                deadline_at: a.deadline_at,
                aircraft: a.aircraft.clone(),
                start: a.start.clone(),
                runway_ends: self.runway_end_names(&a.job.from),
                stage: a.stage,
                launch_note: a.launch_note.clone(),
                from: db().get(&a.job.from).cloned(),
                to: db().get(&a.job.to).cloned(),
            }),
            pilot,
            fleet: d.fleet.clone(),
            licenses,
            recent,
            classes: aircraft::CLASSES.iter().collect(),
            link,
        }
    }

    // ----- Pilot -----

    pub fn create(&self, req: CreateRequest) -> AppResult<()> {
        let name = req.name.trim();
        if name.is_empty() || name.chars().count() > 40 {
            return Err(AppError::msg(tr!("Pilot adı 1–40 karakter olmalı.", "The pilot name must be 1–40 characters.")));
        }
        let home = db().get(&req.home).ok_or_else(|| AppError::msg(tr!("Ana üs havalimanı bulunamadı.", "Home airport not found.")))?;
        let (licenses, money, level, hours): (&[&str], i64, u32, f64) = match req.start.as_str() {
            "commercial" => (&["spl", "ppl", "cpl", "me", "ir"], 25_000, 5, 20.0),
            "airline" => (&["spl", "ppl", "cpl", "me", "ir", "jet", "atpl", "narrow"], 120_000, 16, 120.0),
            _ => (&["spl"], 3_000, 1, 0.0),
        };
        let money_mult = match req.difficulty {
            Difficulty::Easy => 1.5,
            Difficulty::Normal => 1.0,
            Difficulty::Realistic => 0.7,
        };
        let money = (money as f64 * money_mult).round() as i64;
        let pilot = Pilot {
            name: name.to_string(),
            callsign: req.callsign.trim().chars().take(12).collect::<String>().to_uppercase(),
            home: home.icao.clone(),
            location: home.icao.clone(),
            money,
            loan: 0,
            xp: xp_for_level(level),
            licenses: licenses.iter().map(|s| s.to_string()).collect(),
            reputation: 50.0,
            difficulty: req.difficulty,
            start: if matches!(req.start.as_str(), "commercial" | "airline") { req.start.clone() } else { "student".into() },
            created_at: crate::store::now_iso(),
            stats: Stats { hours, ..Default::default() },
        };
        {
            let mut d = self.lock_data();
            let known = std::mem::take(&mut d.known_aircraft);
            let overrides = std::mem::take(&mut d.class_overrides);
            *d = CareerData { version: DATA_VERSION, pilot: Some(pilot), known_aircraft: known, class_overrides: overrides, ..Default::default() };
            push_ledger(&mut d, money, "start_funds", "");
            self.save(&d);
        }
        *self.log.lock().unwrap() = Vec::new();
        self.save_log();
        let _ = std::fs::remove_dir_all(self.dir.join("tracks"));
        self.changed();
        Ok(())
    }

    /// Kariyeri siler (öğrenilen uçak bilgileri kalır).
    pub fn reset(&self) {
        {
            let mut d = self.lock_data();
            let known = std::mem::take(&mut d.known_aircraft);
            let overrides = std::mem::take(&mut d.class_overrides);
            *d = CareerData { version: DATA_VERSION, known_aircraft: known, class_overrides: overrides, ..Default::default() };
            self.save(&d);
        }
        *self.log.lock().unwrap() = Vec::new();
        self.save_log();
        let _ = std::fs::remove_dir_all(self.dir.join("tracks"));
        self.live.lock().unwrap().launch_state = None;
        self.changed();
    }

    // ----- İlanlar -----

    pub fn board(&self) -> AppResult<Vec<Job>> {
        let d = self.lock_data();
        let p = d.pilot.as_ref().ok_or_else(no_pilot)?;
        let here = db().get(&p.location).ok_or_else(|| AppError::msg(tr!("Bulunduğunuz havalimanı veritabanında yok.", "Your current airport is not in the database.")))?;
        let fleet_here: Vec<Class> = d.fleet.iter().filter(|f| f.location == p.location && f.condition >= economy::GROUNDED_BELOW).filter_map(|f| f.class).collect();
        let caches = self.caches.lock().unwrap();
        Ok(jobs::board(&jobs::BoardInput { db: db(), pilot: p, airport: here, now: now(), sim_airports: caches.sim_airports.as_ref(), fleet_here: &fleet_here, taken: &d.taken }))
    }

    pub fn accept(&self, job_id: &str) -> AppResult<()> {
        let job = self.board()?.into_iter().find(|j| j.id == job_id).ok_or_else(|| AppError::msg(tr!("Bu ilan artık yok; pano yenilendi.", "This listing is gone; the board was refreshed.")))?;
        let mut d = self.lock_data();
        if d.active.is_some() {
            return Err(AppError::msg(tr!("Önce elinizdeki işi bitirin ya da bırakın.", "Finish or drop your current job first.")));
        }
        d.taken.push(job.id.clone());
        prune_taken(&mut d.taken);
        let t = now();
        self.note("komut", format!("iş kabul edildi: {} {} → {} ({}, {:?})", job.id, job.from, job.to, job.kind, job.class));
        d.active = Some(ActiveJob { deadline_at: t + (job.deadline_h * 3600.0) as i64, accepted_at: t, job, ..Default::default() });
        self.save(&d);
        drop(d);
        self.changed();
        Ok(())
    }

    /// Henüz uçulmamış işi bırakır (küçük itibar kaybı). Uçuş başladıysa `abandon` kullanılır.
    pub fn cancel(&self) -> AppResult<()> {
        let mut d = self.lock_data();
        let Some(a) = &d.active else { return Ok(()) };
        if a.tracker.as_ref().is_some_and(|t| t.started()) {
            return Err(AppError::msg(tr!("Uçuş başladı; işi bırakmak için uçuşu sonlandırın.", "The flight has started; end the flight to drop the job.")));
        }
        let checkride = a.job.kind == "checkride";
        let training = a.job.kind == "training";
        self.note("komut", format!("iş bırakıldı: {}", a.job.id));
        d.active = None;
        if let Some(p) = d.pilot.as_mut() {
            if !checkride && !training {
                p.reputation = (p.reputation - 1.0).max(0.0);
            }
        }
        self.save(&d);
        drop(d);
        self.live.lock().unwrap().launch_state = None;
        self.changed();
        Ok(())
    }

    /// Bir uçağın sınıfı: kullanıcı > simden öğrenilen > addan tahmin.
    pub(crate) fn class_of(d: &CareerData, title: &str, atc_model: &str) -> (Option<Class>, &'static str) {
        if let Some(c) = d.class_overrides.get(title) {
            return (Some(*c), "user");
        }
        if let Some(k) = d.known_aircraft.get(title) {
            if k.class.is_some() {
                return (k.class, "sim");
            }
        }
        match classify_name(title, atc_model) {
            Some(c) => (Some(c), "name"),
            None => (None, "unknown"),
        }
    }

    /// Simden alınmış havalimanı ayrıntısı (bellek ya da disk önbelleği).
    pub fn cached_detail(&self, icao: &str) -> Option<flt::AirportDetail> {
        let mut c = self.caches.lock().unwrap();
        if let Some(d) = c.details.get(icao) {
            return Some(d.clone());
        }
        let path = self.cache_path(&format!("airports/{}.json", fsx::sanitize_name(icao)));
        let d: flt::AirportDetail = fsx::read_json(&path);
        // Sahne güncellenmiş olabilir: 30 günden eski önbellek yeniden istenir.
        if d.icao == icao && fsx::now_ts() - d.fetched_at < 30 * 86400 {
            c.details.insert(icao.to_string(), d.clone());
            return Some(d);
        }
        None
    }

    /// Kalkış seçiminde gösterilen pist uçları: simin verisi varsa o, yoksa Modstead'in havalimanı listesi.
    pub fn runway_end_names(&self, icao: &str) -> Vec<String> {
        let from_sim: Vec<String> = self.cached_detail(icao).map(|d| flt::runway_ends_of(&d).into_iter().map(|e| e.name).collect()).unwrap_or_default();
        if !from_sim.is_empty() {
            return from_sim;
        }
        db().get(icao).map(|a| a.runway.split('/').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()).unwrap_or_default()
    }

    pub fn installed_aircraft(&self) -> Vec<AircraftOption> {
        let d = self.lock_data();
        let held = d.pilot.as_ref().map(|p| p.licenses.clone()).unwrap_or_default();
        let mut map: Vec<(String, Vec<String>)> = Vec::new();
        for (t, l) in &self.caches.lock().unwrap().installed.items {
            if aircraft::is_passive(t) {
                continue;
            }
            match map.iter_mut().find(|(x, _)| x == t) {
                Some((_, ls)) => {
                    if !l.is_empty() && !ls.contains(l) {
                        ls.push(l.clone());
                    }
                }
                None => map.push((t.clone(), if l.is_empty() { vec![] } else { vec![l.clone()] })),
            }
        }
        for k in d.known_aircraft.values() {
            if !map.iter().any(|(t, _)| *t == k.title) {
                map.push((k.title.clone(), vec![]));
            }
        }
        let mut out: Vec<AircraftOption> = map
            .into_iter()
            .map(|(title, liveries)| {
                let model = d.known_aircraft.get(&title).map(|k| k.atc_model.clone()).unwrap_or_default();
                let (class, src) = Self::class_of(&d, &title, &model);
                AircraftOption {
                    flyable: class.is_some_and(|c| can_fly(c, &held)),
                    manages_own_loading: aircraft::manages_own_loading(&title),
                    title,
                    liveries,
                    class,
                    class_source: src.to_string(),
                }
            })
            .collect();
        out.sort_by(|a, b| a.class.cmp(&b.class).then(a.title.to_lowercase().cmp(&b.title.to_lowercase())));
        out
    }

    pub fn set_class(&self, title: &str, class: Option<Class>) -> AppResult<()> {
        let mut d = self.lock_data();
        match class {
            Some(c) => d.class_overrides.insert(title.to_string(), c),
            None => d.class_overrides.remove(title),
        };
        self.save(&d);
        drop(d);
        self.changed();
        Ok(())
    }

    /// İş için uçak seçimi. Uçak türü işin sınıfıyla aynı olmak zorunda değildir; lisans ve kapasite yeterli olmalı.
    pub fn pick_aircraft(&self, title: &str, livery: &str, fleet_id: Option<String>) -> AppResult<()> {
        if aircraft::is_passive(title) {
            return Err(AppError::msg(tr!(
                "Bu, simin yapay zekâ trafiği için kullandığı uçulamayan bir model. Listeden başka bir uçak seçin.",
                "This is a non-flyable model the sim uses for AI traffic. Choose another aircraft from the list."
            )));
        }
        let mut d = self.lock_data();
        let (class, _) = Self::class_of(&d, title, "");
        let p = d.pilot.clone().ok_or_else(no_pilot)?;
        let a = d.active.as_ref().ok_or_else(|| AppError::msg(tr!("Önce bir iş kabul edin.", "Accept a job first.")))?;
        if a.tracker.as_ref().is_some_and(|t| t.started()) {
            return Err(AppError::msg(tr!("Uçuş başladıktan sonra uçak değiştirilemez.", "The aircraft cannot be changed after the flight has started.")));
        }
        if let Some(c) = class {
            check_aircraft_for_job(&p, &a.job, c)?;
        }
        if let Some(fid) = &fleet_id {
            let f = d.fleet.iter().find(|f| &f.id == fid).ok_or_else(|| AppError::msg(tr!("Filoda böyle bir uçak yok.", "No such aircraft in the fleet.")))?;
            if f.location != a.job.from {
                return Err(AppError::msg(tr!(format!("Bu uçak {} havalimanında duruyor.", f.location), format!("This aircraft is parked at {}.", f.location))));
            }
            if f.condition < economy::GROUNDED_BELOW {
                return Err(AppError::msg(tr!("Uçağın bakımı gerekiyor; uçuşa elverişli değil.", "The aircraft needs maintenance; it is not airworthy.")));
            }
            if a.job.mode != Mode::Contract {
                return Err(AppError::msg(tr!("Operatör adına işlerde operatörün uçağı kullanılır.", "Operator jobs use the operator's aircraft.")));
            }
        }
        let a = d.active.as_mut().unwrap();
        self.note("komut", format!("uçak seçildi: {title}{} (sınıf {:?}{})", if livery.is_empty() { String::new() } else { format!(" / {livery}") }, class, fleet_id.as_deref().map(|f| format!(", filo {f}")).unwrap_or_default()));
        a.aircraft = Some(AircraftPick { title: title.to_string(), livery: livery.to_string(), class, fleet_id });
        self.save(&d);
        drop(d);
        self.changed();
        Ok(())
    }

    /// "Uçuşu başlat": sim kapalıysa açar, sonra uçuşu yükler ve uçağı park yerine koyar (bağlantı iş parçacığı).
    /// `start` verilirse saklanır (park yeri ya da pist başı); verilmezse işin son seçimi kullanılır.
    pub fn launch(&self, start: Option<StartAt>) -> AppResult<()> {
        {
            let mut d = self.lock_data();
            let a = d.active.as_mut().ok_or_else(|| AppError::msg(tr!("Önce bir iş kabul edin.", "Accept a job first.")))?;
            if let Some(s) = start {
                a.start = s;
            }
            if a.aircraft.as_ref().is_none_or(|p| aircraft::is_passive(&p.title)) {
                return Err(AppError::msg(tr!("Önce bu iş için bir uçak seçin.", "Choose an aircraft for this job first.")));
            }
            if a.tracker.as_ref().is_some_and(|t| t.started()) {
                return Err(AppError::msg(tr!("Uçuş zaten sürüyor.", "The flight is already under way.")));
            }
            a.stage = Stage::Launching;
            a.launch_note = None;
            let where_ = if a.start.runway { format!("pist başı ({})", a.start.end.as_deref().unwrap_or("otomatik")) } else { "park yeri".into() };
            self.note("komut", format!("uçuşu başlat: {} → {} · {} · {where_}", a.job.from, a.job.to, a.aircraft.as_ref().map(|p| p.title.as_str()).unwrap_or("?")));
            self.save(&d);
        }
        let sims = self.sims();
        let running = sims.iter().any(|s| s.running);
        self.note("komut", format!("simler: {}", sims.iter().map(|s| format!("{} {}{}", s.id, s.edition, if s.running { " (açık)" } else { "" })).collect::<Vec<_>>().join(", ")));
        if !running {
            let sim = sims
                .iter()
                .filter(|s| s.detected && matches!(s.edition.as_str(), "steam" | "store"))
                .max_by_key(|s| (s.id == crate::sims::SIM_2024, s.last_used))
                .ok_or_else(|| AppError::GameNotFound(crate::INFO.name.into()))?;
            modstead_core::platform::open_launch_uri(&crate::sims::launch_uri(sim)?)?;
        }
        self.live.lock().unwrap().launch_state = Some(engine::Launch::new(!running));
        self.changed();
        Ok(())
    }

    /// Uçağı kalkış havalimanındaki uygun park yerine taşır (kullanıcı serbest uçuşu kendisi açtıysa).
    pub fn reposition(&self) -> AppResult<()> {
        let live = self.live();
        if live.link.state != "connected" || !live.in_flight {
            return Err(AppError::msg(tr!("Simde bir uçuş açık olmalı.", "A flight must be open in the sim.")));
        }
        self.note("komut", "park yerine / pist başına taşı");
        self.send(Command::Reposition);
        Ok(())
    }

    /// Park ettikten sonra uçuşu kapatır ve hesabı keser.
    pub fn finish(&self) -> AppResult<LogEntry> {
        let mut d = self.lock_data();
        let a = d.active.as_ref().ok_or_else(|| AppError::msg(tr!("Aktif iş yok.", "No active job.")))?;
        let t = a.tracker.as_ref().ok_or_else(|| AppError::msg(tr!("Uçuş henüz başlamadı.", "The flight has not started yet.")))?;
        if t.phase != tracker::Phase::Parked && !t.crashed && t.invalid.is_none() {
            return Err(AppError::msg(tr!("Önce uçağı durdurup park frenini çekin.", "Bring the aircraft to a stop and set the parking brake first.")));
        }
        let e = self.complete(&mut d, None);
        drop(d);
        self.note("komut", format!("uçuş kapatıldı: {} · puan {} · net ${}", e.result, e.summary.score, e.settlement.net));
        self.changed();
        Ok(e)
    }

    /// Uçuşu yarıda bırakır.
    pub fn abandon(&self) -> AppResult<Option<LogEntry>> {
        let mut d = self.lock_data();
        let started = d.active.as_ref().and_then(|a| a.tracker.as_ref()).is_some_and(|t| t.started());
        if !started {
            drop(d);
            self.cancel()?;
            return Ok(None);
        }
        let e = self.complete(&mut d, Some("abandoned"));
        drop(d);
        self.note("komut", "uçuş yarıda bırakıldı");
        self.changed();
        Ok(Some(e))
    }

    // ----- Defter -----

    fn save_log(&self) {
        let log = self.log.lock().unwrap();
        if let Err(e) = fsx::write_json(&self.dir.join("logbook.json"), &*log) {
            log::warn!("seyir defteri yazılamadı: {e}");
        }
    }

    pub fn logbook(&self) -> Vec<LogEntry> {
        self.log.lock().unwrap().iter().rev().map(light_entry).collect()
    }

    pub fn flight(&self, id: &str) -> AppResult<(LogEntry, Vec<TrackPoint>)> {
        let e = self.log.lock().unwrap().iter().find(|e| e.id == id).cloned().ok_or_else(|| AppError::NotFound(id.to_string()))?;
        let track: Vec<TrackPoint> = fsx::read_json(&self.dir.join("tracks").join(format!("{}.json", fsx::sanitize_name(id))));
        Ok((e, track))
    }

    /// Uçuşu kapatır: puan, para, XP, itibar, saat, konum, filo, defter. Veri kilidi tutulurken çağrılır.
    pub(crate) fn complete(&self, d: &mut CareerData, forced: Option<&str>) -> LogEntry {
        let Some(active) = d.active.take() else { return LogEntry::default() };
        let pilot = d.pilot.clone().unwrap_or_default();
        let tracker = active.tracker.clone().unwrap_or_default();
        let s = tracker.summary();
        let job = active.job.clone();
        let pick = active.aircraft.clone().unwrap_or_default();
        let class = pick.class.or(job.class).unwrap_or(Class::LightPiston);
        let ci = info(class);
        let t_now = now();

        let landed_somewhere = s.landing.is_some() && tracker.airborne_ever();
        let late = t_now > active.deadline_at;
        let result = if let Some(f) = forced {
            f.to_string()
        } else if s.crashed {
            "crashed".into()
        } else if s.invalid.is_some() {
            "invalid".into()
        } else if !tracker.airborne_ever() {
            "abandoned".into()
        } else if s.arrived_at_destination {
            if late { "late".into() } else { "completed".into() }
        } else if landed_somewhere {
            "diverted".into()
        } else {
            "abandoned".into()
        };
        let ok = matches!(result.as_str(), "completed" | "late");

        // Nereye vardık?
        let last = tracker.last.clone().unwrap_or_default();
        let arrived = if s.arrived_at_destination {
            job.to.clone()
        } else {
            db().nearest(last.lat, last.lon, 10.0).map(|(a, _)| a.icao.clone()).unwrap_or_else(|| job.from.clone())
        };
        let arrived_size = db().get(&arrived).map(|a| a.size).unwrap_or(airports::Size::Medium);

        // Hesap.
        let block_h = s.block_s / 3600.0;
        let owned = pick.fleet_id.as_ref().and_then(|id| d.fleet.iter().position(|f| &f.id == id));
        let damage = if s.crashed {
            Damage::Crash
        } else {
            s.landing.as_ref().map(|l| economy::landing_damage(class, l.fpm, l.g)).unwrap_or(Damage::None)
        };
        let mut st = Settlement::default();
        if ok {
            st.pay = job.pay;
            if late {
                st.late_penalty = economy::late_penalty(job.pay, (t_now - active.deadline_at) as f64 / 60.0);
            }
        }
        if job.mode == Mode::Contract && tracker.started() {
            let diff = pilot.difficulty;
            st.fuel = (s.fuel_used_lb / economy::LB_PER_KG * economy::fuel_price_kg(ci.fuel) * diff.costs()).round() as i64;
            if landed_somewhere {
                st.fees = economy::landing_fee(class, arrived_size, diff);
            }
            let (dmg_cost, cond_loss) = economy::damage_cost(class, damage, owned.is_some(), diff);
            st.damage = dmg_cost;
            match owned {
                Some(ix) => {
                    st.maintenance = (block_h * ci.maint_h as f64 * diff.costs()).round() as i64;
                    let f = &mut d.fleet[ix];
                    f.hours += block_h;
                    f.condition = (f.condition - block_h * economy::WEAR_PER_HOUR - cond_loss).clamp(0.0, 100.0);
                    f.location = arrived.clone();
                }
                None => st.rent = (block_h.max(0.25) * ci.rent_h as f64 * diff.costs()).round() as i64,
            }
        }
        let st = st.finish();

        // Sınav.
        let checkride_passed = job.checkride.as_ref().map(|_| {
            ok && s.score >= pilot.difficulty.pass_score() && s.landing.as_ref().is_some_and(|l| !matches!(l.label.as_str(), "hard" | "very_hard"))
        });

        let valid = s.invalid.is_none() && !s.crashed && tracker.airborne_ever();
        let xp = if valid && result != "abandoned" {
            progression::flight_xp(s.score, block_h, job.distance_nm.min(s.flown_nm.max(job.distance_nm * 0.5)), class, checkride_passed == Some(true))
        } else {
            0
        };
        let rep = match job.kind.as_str() {
            "training" | "checkride" => 0.0,
            _ => progression::reputation_delta(s.score, result == "late", !ok, s.crashed),
        };
        let credited = if valid { (s.block_s / 3600.0).min(s.real_s / 3600.0 * 1.5) } else { 0.0 };

        let id = format!("{}-{}", t_now, fsx::short_id());
        if let Some(p) = d.pilot.as_mut() {
            p.money += st.net;
            p.xp += xp as u64;
            p.reputation = (p.reputation + rep).clamp(0.0, 100.0);
            p.location = arrived.clone();
            let ps = &mut p.stats;
            ps.flights += u32::from(tracker.started());
            ps.hours += credited;
            ps.sim_hours += s.block_s / 3600.0;
            ps.distance_nm += s.flown_nm;
            *ps.class_hours.entry(class).or_default() += credited;
            if let Some(l) = &s.landing {
                ps.landings += 1;
                if l.label == "butter" {
                    ps.butter_landings += 1;
                }
                if valid {
                    ps.best_landing_fpm = Some(ps.best_landing_fpm.map_or(l.fpm, |b| b.min(l.fpm)));
                }
            }
            if st.net > 0 {
                ps.earned += st.net;
            } else {
                ps.spent += -st.net;
            }
            if ok {
                ps.jobs_done += 1;
            } else if tracker.started() {
                ps.jobs_failed += 1;
            }
            if s.crashed {
                ps.crashes += 1;
            }
            if valid {
                ps.scores.push(s.score);
            }
            if checkride_passed == Some(true) {
                if let Some(l) = &job.checkride {
                    if !p.licenses.contains(l) {
                        p.licenses.push(l.clone());
                    }
                }
            }
        }
        if st.net != 0 {
            let route = format!("{} → {}", job.from, job.to);
            push_ledger(d, st.net, if job.mode == Mode::Contract { "contract" } else { "job_pay" }, &route);
        }
        let loan_paid = d.pilot.as_ref().map(|p| if st.net > 0 && p.loan > 0 { ((st.net as f64 * economy::LOAN_SHARE).round() as i64).min(p.loan) } else { 0 }).unwrap_or(0);
        if loan_paid > 0 {
            if let Some(p) = d.pilot.as_mut() {
                p.money -= loan_paid;
                p.loan -= loan_paid;
            }
            push_ledger(d, -loan_paid, "loan_payment", "");
        }
        d.taken.push(job.id.clone());
        prune_taken(&mut d.taken);

        let entry = LogEntry {
            id: id.clone(),
            registration: owned.map(|ix| d.fleet[ix].registration.clone()).unwrap_or_default(),
            job,
            result,
            aircraft: pick,
            started_at: (tracker.real_start_ms / 1000).max(active.accepted_at),
            ended_at: t_now,
            arrived,
            landing: s.landing.clone(),
            events: tracker.events.clone(),
            deductions: tracker.deductions(),
            summary: s,
            settlement: st,
            xp,
            reputation_delta: rep,
            credited_hours: (credited * 100.0).round() / 100.0,
            checkride_passed,
        };
        self.save(d);
        let tracks = self.dir.join("tracks");
        let _ = std::fs::create_dir_all(&tracks);
        let _ = fsx::write_json(&tracks.join(format!("{}.json", fsx::sanitize_name(&id))), &tracker.track);
        self.log.lock().unwrap().push(entry.clone());
        self.save_log();
        let _ = std::fs::remove_file(self.cache_path("active-flight.json"));
        self.live.lock().unwrap().launch_state = None;
        entry
    }

    // ----- Lisans, seyahat, filo -----

    pub fn start_checkride(&self, license: &str) -> AppResult<()> {
        let mut d = self.lock_data();
        if d.active.is_some() {
            return Err(AppError::msg(tr!("Önce elinizdeki işi bitirin.", "Finish your current job first.")));
        }
        let p = d.pilot.clone().ok_or_else(no_pilot)?;
        let l = progression::license(license).ok_or_else(|| AppError::NotFound(license.to_string()))?;
        let e = eligibility(l, &p.licenses, p.stats.hours, level_for_xp(p.xp), p.money, p.difficulty);
        if !e.ready {
            return Err(AppError::msg(tr!("Bu lisansın şartları henüz sağlanmadı.", "The requirements for this licence are not met yet.")));
        }
        let here = db().get(&p.location).ok_or_else(no_pilot)?;
        let job = {
            let caches = self.caches.lock().unwrap();
            jobs::checkride(db(), here, l.id, l.exam_class, now(), caches.sim_airports.as_ref())
        }
        .ok_or_else(|| AppError::msg(tr!("Yakında sınav için uygun bir havalimanı bulunamadı. Başka bir havalimanına geçin.", "No suitable airport for the exam nearby. Move to another airport.")))?;
        let t = now();
        if let Some(pm) = d.pilot.as_mut() {
            pm.money -= e.fee;
        }
        push_ledger(&mut d, -e.fee, "license_fee", l.short);
        d.active = Some(ActiveJob { deadline_at: t + 24 * 3600, accepted_at: t, job, ..Default::default() });
        self.save(&d);
        drop(d);
        self.changed();
        Ok(())
    }

    pub fn travel(&self, icao: &str) -> AppResult<i64> {
        let mut d = self.lock_data();
        if d.active.is_some() {
            return Err(AppError::msg(tr!("Elinizde bir iş varken başka yere geçemezsiniz.", "You cannot travel while you have a job.")));
        }
        let p = d.pilot.clone().ok_or_else(no_pilot)?;
        let (from, to) = (db().get(&p.location).ok_or_else(no_pilot)?, db().get(icao).ok_or_else(|| AppError::NotFound(icao.to_string()))?);
        if from.icao == to.icao {
            return Ok(0);
        }
        let cost = jobs::travel_cost(from, to, &p);
        if p.money < cost {
            return Err(AppError::msg(tr!("Bilet için yeterli paranız yok.", "You do not have enough money for the ticket.")));
        }
        if let Some(pm) = d.pilot.as_mut() {
            pm.money -= cost;
            pm.location = to.icao.clone();
            pm.stats.spent += cost;
        }
        push_ledger(&mut d, -cost, "ticket", &format!("{} → {}", from.icao, to.icao));
        self.save(&d);
        drop(d);
        self.changed();
        Ok(cost)
    }

    pub fn buy(&self, class: Class, title: &str) -> AppResult<()> {
        let mut d = self.lock_data();
        let p = d.pilot.clone().ok_or_else(no_pilot)?;
        if !p.has("cpl") {
            return Err(AppError::msg(tr!("Uçak sahibi olmak için ticari pilot lisansı (CPL) gerekir.", "Owning aircraft requires a commercial pilot licence (CPL).")));
        }
        if !can_fly(class, &p.licenses) {
            return Err(AppError::msg(tr!("Bu sınıfı uçurmaya yetkiniz yok.", "You are not rated for this class.")));
        }
        let price = economy::purchase_price(class, p.difficulty);
        if p.money < price {
            return Err(AppError::msg(tr!("Bu uçak için yeterli paranız yok.", "You do not have enough money for this aircraft.")));
        }
        let country = db().get(&p.home).map(|a| a.country.clone()).unwrap_or_default();
        let reg = registration(&country, &d.fleet);
        if let Some(pm) = d.pilot.as_mut() {
            pm.money -= price;
            pm.stats.spent += price;
        }
        d.fleet.push(FleetAircraft {
            id: fsx::short_id(),
            class: Some(class),
            title: title.to_string(),
            registration: reg.clone(),
            location: p.location.clone(),
            hours: 0.0,
            condition: 100.0,
            price_paid: price,
            bought_at: crate::store::now_iso(),
        });
        push_ledger(&mut d, -price, "aircraft_buy", &reg);
        self.save(&d);
        drop(d);
        self.changed();
        Ok(())
    }

    pub fn sell(&self, id: &str) -> AppResult<i64> {
        let mut d = self.lock_data();
        if d.active.as_ref().and_then(|a| a.aircraft.as_ref()).and_then(|p| p.fleet_id.as_deref()) == Some(id) {
            return Err(AppError::msg(tr!("Bu uçak aktif işte kullanılıyor.", "This aircraft is assigned to the active job.")));
        }
        let ix = d.fleet.iter().position(|f| f.id == id).ok_or_else(|| AppError::NotFound(id.to_string()))?;
        let f = d.fleet.remove(ix);
        let diff = d.pilot.as_ref().map(|p| p.difficulty).unwrap_or_default();
        let value = economy::resale_value(f.class.unwrap_or(Class::LightPiston), f.condition, diff);
        if let Some(p) = d.pilot.as_mut() {
            p.money += value;
        }
        push_ledger(&mut d, value, "aircraft_sell", &f.registration);
        self.save(&d);
        drop(d);
        self.changed();
        Ok(value)
    }

    pub fn repair(&self, id: &str) -> AppResult<i64> {
        let mut d = self.lock_data();
        let diff = d.pilot.as_ref().map(|p| p.difficulty).unwrap_or_default();
        let money = d.pilot.as_ref().map(|p| p.money).ok_or_else(no_pilot)?;
        let f = d.fleet.iter_mut().find(|f| f.id == id).ok_or_else(|| AppError::NotFound(id.to_string()))?;
        let cost = ((100.0 - f.condition).max(0.0) * economy::repair_cost_per_point(f.class.unwrap_or(Class::LightPiston), diff) as f64).round() as i64;
        if cost > money {
            return Err(AppError::msg(tr!("Bakım için yeterli paranız yok.", "You do not have enough money for maintenance.")));
        }
        f.condition = 100.0;
        let reg = f.registration.clone();
        if let Some(p) = d.pilot.as_mut() {
            p.money -= cost;
            p.stats.spent += cost;
        }
        push_ledger(&mut d, -cost, "maintenance", &reg);
        self.save(&d);
        drop(d);
        self.changed();
        Ok(cost)
    }

    /// Bankadan borç alır. Açılış masrafı borca eklenir; zamana bağlı faiz yoktur.
    pub fn borrow(&self, amount: i64) -> AppResult<i64> {
        let mut d = self.lock_data();
        let fv = fleet_value(&d);
        let p = d.pilot.clone().ok_or_else(no_pilot)?;
        if !p.has("cpl") {
            return Err(AppError::msg(tr!("Kredi için ticari pilot lisansı (CPL) gerekir.", "A commercial pilot licence (CPL) is required for a loan.")));
        }
        let limit = economy::credit_limit(level_for_xp(p.xp), p.reputation, fv);
        let owed = (amount as f64 * (1.0 + economy::loan_fee_rate(p.difficulty))).round() as i64;
        if amount <= 0 || p.loan + owed > limit {
            return Err(AppError::msg(tr!(
                format!("Kredi sınırınız ${limit}; şu anki borcunuz ${}.", p.loan),
                format!("Your credit limit is ${limit}; you currently owe ${}.", p.loan)
            )));
        }
        if let Some(pm) = d.pilot.as_mut() {
            pm.money += amount;
            pm.loan += owed;
        }
        push_ledger(&mut d, amount, "loan", &owed.to_string());
        self.save(&d);
        drop(d);
        self.changed();
        Ok(owed)
    }

    pub fn repay(&self, amount: i64) -> AppResult<i64> {
        let mut d = self.lock_data();
        let p = d.pilot.clone().ok_or_else(no_pilot)?;
        let pay = amount.min(p.loan).min(p.money);
        if pay <= 0 {
            return Ok(0);
        }
        if let Some(pm) = d.pilot.as_mut() {
            pm.money -= pay;
            pm.loan -= pay;
        }
        push_ledger(&mut d, -pay, "loan_payment", "");
        self.save(&d);
        drop(d);
        self.changed();
        Ok(pay)
    }

    pub fn ledger(&self) -> Vec<LedgerEntry> {
        self.lock_data().ledger.iter().rev().cloned().collect()
    }

    /// Aktif işin uçuş dosyalarının klasörü (PLN'yi EFB'ye elle yüklemek için).
    pub fn flights_dir(&self) -> PathBuf {
        self.cache_path("flights")
    }

    /// Aktif işin uçuş planını (.PLN) yazar ve klasörünü döner (EFB'ye elle yüklemek için).
    pub fn write_plan(&self) -> AppResult<PathBuf> {
        let job = self.lock_data().active.as_ref().map(|a| a.job.clone()).ok_or_else(|| AppError::msg(tr!("Aktif iş yok.", "No active job.")))?;
        let (from, to) = (db().get(&job.from).ok_or_else(|| AppError::NotFound(job.from.clone()))?, db().get(&job.to).ok_or_else(|| AppError::NotFound(job.to.clone()))?);
        let dir = self.flights_dir().join(fsx::sanitize_name(&job.id));
        std::fs::create_dir_all(&dir)?;
        let ifr = matches!(job.class, Some(c) if !matches!(c, Class::LightPiston | Class::Helicopter));
        fsx::atomic_write(&dir.join(format!("{}_{}.pln", job.from, job.to)), flt::write_pln(from, to, job.plan.cruise_alt_ft, ifr).as_bytes())?;
        Ok(dir)
    }

    pub fn simbrief_url(&self) -> Option<String> {
        let d = self.lock_data();
        let a = d.active.as_ref()?;
        let model = a.aircraft.as_ref().and_then(|p| d.known_aircraft.get(&p.title)).map(|k| k.atc_model.clone()).unwrap_or_default();
        Some(flt::simbrief_url(&a.job.from, &a.job.to, flt::icao_type(&model).as_deref()))
    }
}

/// Defter listesinde olaylar gereksiz yer kaplamasın.
fn light_entry(e: &LogEntry) -> LogEntry {
    LogEntry { events: Vec::new(), ..e.clone() }
}

fn no_pilot() -> AppError {
    AppError::msg(tr!("Önce bir kariyer başlatın.", "Start a career first."))
}

fn prune_taken(v: &mut Vec<String>) {
    if v.len() > 600 {
        let n = v.len() - 600;
        v.drain(..n);
    }
}

pub(crate) fn push_ledger(d: &mut CareerData, amount: i64, kind: &str, detail: &str) {
    let balance = d.pilot.as_ref().map(|p| p.money).unwrap_or(0);
    d.ledger.push(LedgerEntry { ts: now(), amount, kind: kind.to_string(), detail: detail.to_string(), balance });
    if d.ledger.len() > 400 {
        let n = d.ledger.len() - 400;
        d.ledger.drain(..n);
    }
}

fn fleet_value(d: &CareerData) -> i64 {
    let diff = d.pilot.as_ref().map(|p| p.difficulty).unwrap_or_default();
    d.fleet.iter().map(|f| economy::resale_value(f.class.unwrap_or(Class::LightPiston), f.condition, diff)).sum()
}

fn pilot_view(p: &Pilot, fleet_value: i64) -> PilotView {
    let level = level_for_xp(p.xp);
    let (tr_t, en_t) = progression::title(&p.licenses);
    PilotView {
        level,
        level_xp: xp_for_level(level),
        next_level_xp: xp_for_level(level + 1),
        title: tr!(tr_t, en_t).to_string(),
        rating: progression::pilot_rating(&p.stats.scores),
        can_contract: p.has("cpl"),
        credit_limit: if p.has("cpl") { economy::credit_limit(level, p.reputation, fleet_value) } else { 0 },
        pilot: p.clone(),
    }
}

/// Uçak bu işe uygun mu? Ferry ve sınavda sınıf aynı olmalı; diğerlerinde lisans ve kapasite yeter.
pub(crate) fn check_aircraft_for_job(p: &Pilot, job: &Job, class: Class) -> AppResult<()> {
    let exam = job.checkride.is_some() && job.class == Some(class);
    if !exam && !can_fly(class, &p.licenses) {
        return Err(AppError::msg(tr!(
            format!("{} sınıfı için lisansınız yok.", aircraft::name(class)),
            format!("You are not licensed for the {} class.", aircraft::name(class))
        )));
    }
    if matches!(job.kind.as_str(), "ferry" | "checkride") && job.class.is_some_and(|c| c != class) {
        return Err(AppError::msg(tr!(
            format!("Bu iş {} gerektiriyor.", job.class.map(aircraft::name).unwrap_or("")),
            format!("This job requires a {}.", job.class.map(aircraft::name).unwrap_or(""))
        )));
    }
    let ci = info(class);
    if job.pax > ci.seats || job.cargo_kg > ci.cargo_kg {
        return Err(AppError::msg(tr!("Bu uçak yükü taşıyamaz (koltuk ya da kargo kapasitesi yetmiyor).", "This aircraft cannot carry the load (not enough seats or cargo capacity).")));
    }
    let dest = db().get(&job.to);
    if dest.is_some_and(|a| !a.suits(ci)) {
        return Err(AppError::msg(tr!("Varış havalimanının pisti bu uçağa uygun değil.", "The destination runway is not suitable for this aircraft.")));
    }
    Ok(())
}

/// Tescil işareti: ana üssün ülkesine göre ("TC-ABC", "N123AB"…), filoda tekrar etmeyen.
fn registration(country: &str, fleet: &[FleetAircraft]) -> String {
    let mut rng = jobs::Rng::new(fsx::now_ms() as u64);
    let letters = |rng: &mut jobs::Rng, n: usize| (0..n).map(|_| (b'A' + (rng.next() % 26) as u8) as char).collect::<String>();
    for _ in 0..50 {
        let r = match country {
            "TR" => format!("TC-{}", letters(&mut rng, 3)),
            "GB" => format!("G-{}", letters(&mut rng, 4)),
            "DE" => format!("D-E{}", letters(&mut rng, 3)),
            "FR" => format!("F-{}", letters(&mut rng, 4)),
            "IT" => format!("I-{}", letters(&mut rng, 4)),
            "ES" => format!("EC-{}", letters(&mut rng, 3)),
            "NL" => format!("PH-{}", letters(&mut rng, 3)),
            "CA" => format!("C-{}", letters(&mut rng, 4)),
            "AU" => format!("VH-{}", letters(&mut rng, 3)),
            _ => format!("N{}{}", 100 + rng.next() % 900, letters(&mut rng, 2)),
        };
        if !fleet.iter().any(|f| f.registration == r) {
            return r;
        }
    }
    format!("N{}", fsx::short_id().to_uppercase())
}

#[cfg(test)]
mod tests;
