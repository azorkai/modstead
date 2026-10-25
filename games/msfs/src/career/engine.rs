//! Bağlantının kariyer tarafı: veri tanımları, telemetri, uçuş öncesi kontrol, otomatik başlatma ve takip.
//!
//! Otomatik başlatma (araştırmanın sonucu; ayrıntı `KARIYER.md`):
//! 1. Sim kapalıysa Modstead açar ve bağlantıyı bekler.
//! 2. Kalkış havalimanının park yerleri simden alınır, işe uygun yer seçilir; `.FLT` ve `.PLN` yazılır.
//! 3. Kullanıcı zaten doğru uçakla bir uçuştaysa uçak doğrudan park yerine taşınır (`Initial Position`);
//!    değilse `SimConnect_FlightLoad` ile uçuş yüklenir.
//! 4. Uçuş açılınca konum denetlenir, gerekirse park yerine taşınır, yük istasyonlara yazılır.
//! 5. Yükleme olmazsa (MSFS 2024'te FlightLoad her zaman güvenilir değil) "elle" kipine geçilir: kullanıcı herhangi
//!    bir serbest uçuşu açar, Modstead uçağı park yerine taşır. Kontrol kapısı yeşile dönünce takip kendiliğinden kurulur.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use modstead_core::fsx;
use modstead_core::prelude::*;

use super::aircraft::{SimSpecs, classify_name, classify_specs, manages_own_loading};
use super::airports::{db, distance_nm};
use super::flt::{self, AirportDetail, Parking, Runway};
use super::link::{Command, Handler, LinkState, Outbox, Target};
use super::model::{KnownAircraft, Stage};
use super::simconnect::{DataType, OBJECT_USER, PROTO_SUNRISE, Period, Reader, Recv, Request, SIMOBJECT_AIRCRAFT, SIMOBJECT_HELICOPTER, flow};
use super::tracker::{Airfield, Telemetry, Tracker};
use super::{AircraftNow, Career, Check, FlightLive, Installed, LaunchView, LinkView, SimAirports, check_aircraft_for_job};

const DEF_TEL: u32 = 1;
const DEF_AC: u32 = 2;
const DEF_INIT: u32 = 3;
const DEF_PAYLOAD: u32 = 4;
const DEF_HUD: u32 = 5;
const DEF_FAC: u32 = 10;

const REQ_TEL: u32 = 1;
const REQ_AC: u32 = 2;
const REQ_LIV_A: u32 = 3;
const REQ_LIV_H: u32 = 4;
const REQ_AIRPORTS: u32 = 5;
const REQ_FAC_BASE: u32 = 1000;

const EV_SIMSTART: u32 = 1;
const EV_SIMSTOP: u32 = 2;
const EV_PAUSE: u32 = 3;
const EV_CRASHED: u32 = 4;

/// Telemetri alanları (sıra = gelen verinin sırası).
const TEL: &[(&str, &str)] = &[
    ("PLANE LATITUDE", "degrees"),
    ("PLANE LONGITUDE", "degrees"),
    ("PLANE ALTITUDE", "feet"),
    ("PLANE ALT ABOVE GROUND", "feet"),
    ("GROUND VELOCITY", "knots"),
    ("AIRSPEED INDICATED", "knots"),
    ("VERTICAL SPEED", "feet per minute"),
    ("PLANE HEADING DEGREES TRUE", "degrees"),
    ("PLANE PITCH DEGREES", "degrees"),
    ("PLANE BANK DEGREES", "degrees"),
    ("SIM ON GROUND", "bool"),
    ("G FORCE", "gforce"),
    ("FUEL TOTAL QUANTITY WEIGHT", "pounds"),
    ("TOTAL WEIGHT", "pounds"),
    ("GENERAL ENG COMBUSTION:1", "bool"),
    ("GENERAL ENG COMBUSTION:2", "bool"),
    ("GENERAL ENG COMBUSTION:3", "bool"),
    ("GENERAL ENG COMBUSTION:4", "bool"),
    ("BRAKE PARKING POSITION", "bool"),
    ("GEAR HANDLE POSITION", "bool"),
    ("FLAPS HANDLE PERCENT", "percent over 100"),
    ("OVERSPEED WARNING", "bool"),
    ("STALL WARNING", "bool"),
    ("FLAP SPEED EXCEEDED", "bool"),
    ("SIMULATION RATE", "number"),
    ("IS SLEW ACTIVE", "bool"),
    ("ON ANY RUNWAY", "bool"),
    ("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second"),
    ("PLANE TOUCHDOWN BANK DEGREES", "degrees"),
    ("PLANE TOUCHDOWN PITCH DEGREES", "degrees"),
    ("ABSOLUTE TIME", "seconds"),
    ("CRASH FLAG", "number"),
];

/// Uçak bilgisi alanları (değişince gelir).
const AC: &[(&str, &str, DataType)] = &[
    ("TITLE", "", DataType::String256),
    ("ATC MODEL", "", DataType::String64),
    ("ATC ID", "", DataType::String64),
    ("CATEGORY", "", DataType::String64),
    ("ENGINE TYPE", "enum", DataType::Float64),
    ("NUMBER OF ENGINES", "number", DataType::Float64),
    ("MAX GROSS WEIGHT", "pounds", DataType::Float64),
    ("EMPTY WEIGHT", "pounds", DataType::Float64),
    ("FUEL TOTAL CAPACITY", "gallons", DataType::Float64),
    ("DESIGN SPEED VC", "knots", DataType::Float64),
    ("PAYLOAD STATION COUNT", "number", DataType::Float64),
];

/// Havalimanı ayrıntısı tanımı (alanların sırası `on_facility` ile aynı olmalı).
const FAC: &[&str] = &[
    "OPEN AIRPORT",
    "LATITUDE",
    "LONGITUDE",
    "ALTITUDE",
    "OPEN TAXI_PARKING",
    "TYPE",
    "NAME",
    "SUFFIX",
    "NUMBER",
    "HEADING",
    "RADIUS",
    "BIAS_X",
    "BIAS_Z",
    "CLOSE TAXI_PARKING",
    "OPEN RUNWAY",
    "LATITUDE",
    "LONGITUDE",
    "ALTITUDE",
    "HEADING",
    "LENGTH",
    "PRIMARY_NUMBER",
    "PRIMARY_DESIGNATOR",
    "SECONDARY_NUMBER",
    "SECONDARY_DESIGNATOR",
    "SURFACE",
    "CLOSE RUNWAY",
    "CLOSE AIRPORT",
];

/// Otomatik başlatmanın adımı.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    WaitingSim,
    FetchingAirport,
    Loading,
    Positioning,
    Done,
    Manual,
}

#[derive(Debug, Clone)]
pub struct Launch {
    pub step: Step,
    pub started: Instant,
    pub since: Instant,
    pub opened_sim: bool,
    pub flight_started: bool,
    pub teleported: bool,
    pub payload_done: bool,
    pub note: String,
}

impl Launch {
    pub fn new(opened_sim: bool) -> Self {
        let now = Instant::now();
        Launch {
            step: Step::WaitingSim,
            started: now,
            since: now,
            opened_sim,
            flight_started: false,
            teleported: false,
            payload_done: false,
            note: if opened_sim {
                tr!("Sim açılıyor; ana menüye geldiğinde Modstead uçuşu yükleyecek.", "Starting the sim; Modstead will load the flight once it reaches the main menu.").into()
            } else {
                tr!("Simle bağlantı kuruluyor…", "Connecting to the sim…").into()
            },
        }
    }

    fn go(&mut self, step: Step, note: impl Into<String>) {
        self.step = step;
        self.since = Instant::now();
        self.note = note.into();
    }
}

pub struct Engine {
    career: Arc<Career>,
    protocol: u32,
    connected: bool,
    tel_sent: HashMap<u32, usize>,
    tel_missing: HashSet<usize>,
    ac_sent: HashMap<u32, usize>,
    ac_missing: HashSet<usize>,
    flight_load_sent: Option<u32>,
    liveries: Vec<(String, String)>,
    liveries_pending: u8,
    airports: HashSet<String>,
    facility: HashMap<u32, (String, AirportDetail)>,
    next_fac: u32,
    pending_reposition: bool,
    grace_abs: f64,
    last_emit: Instant,
    last_save: Instant,
    sims_at: Option<Instant>,
    sims: Vec<crate::sims::SimInstall>,
    connected_at: Option<Instant>,
    /// Testlerde sahte sunucu; uygulamada `None` (sim süreçten bulunur).
    fixed_target: Option<Target>,
    /// Sim içi panelin `L:` değişkenleri.
    hud: super::hud::Feed,
}

impl Engine {
    pub fn new(career: Arc<Career>) -> Self {
        Engine {
            career,
            protocol: PROTO_SUNRISE,
            connected: false,
            tel_sent: HashMap::new(),
            tel_missing: HashSet::new(),
            ac_sent: HashMap::new(),
            ac_missing: HashSet::new(),
            flight_load_sent: None,
            liveries: Vec::new(),
            liveries_pending: 0,
            airports: HashSet::new(),
            facility: HashMap::new(),
            next_fac: 0,
            pending_reposition: false,
            grace_abs: 0.0,
            last_emit: Instant::now(),
            last_save: Instant::now(),
            sims_at: None,
            sims: Vec::new(),
            connected_at: None,
            fixed_target: None,
            hud: Default::default(),
        }
    }

    #[cfg(test)]
    pub fn with_target(career: Arc<Career>, target: Target) -> Self {
        Engine { fixed_target: Some(target), ..Engine::new(career) }
    }

    /// Kullanıcı uçağının verisini iste. Yeni bir uçuş açılınca (yeni uçak nesnesi) yeniden çağrılır.
    fn request_data(out: &mut Outbox) {
        out.send(Request::RequestDataOnSimObject { request: REQ_TEL, define: DEF_TEL, object: OBJECT_USER, period: Period::SimFrame, flags: 0, interval: 6 });
        out.send(Request::RequestDataOnSimObject { request: REQ_AC, define: DEF_AC, object: OBJECT_USER, period: Period::Second, flags: super::simconnect::DATA_FLAG_CHANGED, interval: 0 });
    }

    fn request_detail(&mut self, out: &mut Outbox, icao: &str) {
        if self.facility.values().any(|(i, _)| i == icao) {
            return;
        }
        let req = REQ_FAC_BASE + self.next_fac;
        self.next_fac = (self.next_fac + 1) % 5000;
        self.facility.insert(req, (icao.to_string(), AirportDetail { icao: icao.to_string(), ..Default::default() }));
        out.send(Request::RequestFacilityData { define: DEF_FAC, request: req, icao: icao.to_string(), region: String::new() });
    }

    fn detail(&self, icao: &str) -> Option<AirportDetail> {
        let mut c = self.career.caches.lock().unwrap();
        if let Some(d) = c.details.get(icao) {
            return Some(d.clone());
        }
        let path = self.career.cache_path(&format!("airports/{}.json", fsx::sanitize_name(icao)));
        let d: AirportDetail = fsx::read_json(&path);
        // Sahne güncellenmiş olabilir: 30 günden eski önbellek yeniden istenir.
        if d.icao == icao && fsx::now_ts() - d.fetched_at < 30 * 86400 {
            c.details.insert(icao.to_string(), d.clone());
            return Some(d);
        }
        None
    }

    fn on_facility(&mut self, request: u32, kind: u32, data: &[u8]) {
        let Some((_, d)) = self.facility.get_mut(&request) else { return };
        let mut r = Reader::new(data);
        match kind {
            0 => {
                d.lat = r.f64();
                d.lon = r.f64();
                d.alt_m = r.f64();
            }
            15 => d.parkings.push(Parking {
                kind: r.i32(),
                name: r.i32(),
                suffix: r.i32(),
                number: r.u32(),
                heading: r.f32(),
                radius: r.f32(),
                bias_x: r.f32(),
                bias_z: r.f32(),
            }),
            1 => d.runways.push(Runway {
                lat: r.f64(),
                lon: r.f64(),
                alt_m: r.f64(),
                heading: r.f32(),
                length_m: r.f32(),
                primary_number: r.i32(),
                primary_designator: r.i32(),
                secondary_number: r.i32(),
                secondary_designator: r.i32(),
                surface: r.i32(),
            }),
            _ => {}
        }
    }

    fn on_facility_end(&mut self, out: &mut Outbox, request: u32) {
        let Some((icao, mut d)) = self.facility.remove(&request) else { return };
        if d.lat == 0.0 && d.lon == 0.0 {
            log::info!("sim {icao} için havalimanı verisi döndürmedi");
            return;
        }
        d.fetched_at = fsx::now_ts();
        let path = self.career.cache_path(&format!("airports/{}.json", fsx::sanitize_name(&icao)));
        let _ = std::fs::create_dir_all(path.parent().unwrap());
        let _ = fsx::write_json(&path, &d);
        self.career.caches.lock().unwrap().details.insert(icao, d);
        if self.pending_reposition {
            self.pending_reposition = false;
            self.reposition(out);
        }
    }

    /// Kalkış havalimanında işe uygun park yeri ve konumu.
    fn departure_spot(&self) -> Option<(String, Option<Parking>, f64, f64, f64, f64, Option<(String, String)>)> {
        let d = self.career.lock_data();
        let a = d.active.as_ref()?;
        let class = a.aircraft.as_ref().and_then(|p| p.class).or(a.job.class)?;
        let cargo = a.job.pax == 0 && a.job.cargo_kg > 0;
        let seed = a.job.id.bytes().fold(0u64, |h, b| h.wrapping_mul(31).wrapping_add(b as u64));
        let from = a.job.from.clone();
        drop(d);
        let apt = db().get(&from)?;
        let elev_ft = apt.elevation_ft as f64;
        match self.detail(&from) {
            Some(det) => {
                let rwy = det.runways.iter().max_by(|a, b| a.length_m.total_cmp(&b.length_m)).map(flt::runway_ends);
                let p = flt::choose_parking(&det, class, cargo, seed).cloned();
                match &p {
                    Some(p) => {
                        let (lat, lon) = flt::parking_position(&det, p);
                        Some((from, Some(p.clone()), lat, lon, det.alt_m * 3.28084, p.heading as f64, rwy))
                    }
                    None => Some((from, None, det.lat, det.lon, det.alt_m * 3.28084, 0.0, rwy)),
                }
            }
            None => Some((from, None, apt.lat, apt.lon, elev_ft, 0.0, None)),
        }
    }

    /// Uçağı park yerine taşır (Modstead'in kendi ışınlaması hile sayılmaz).
    fn reposition(&mut self, out: &mut Outbox) {
        let Some((icao, parking, lat, lon, alt, hdg, _)) = self.departure_spot() else { return };
        if parking.is_none() {
            if self.detail(&icao).is_none() {
                self.pending_reposition = true;
                self.request_detail(out, &icao);
            } else {
                // Uygun park yeri yoksa uçak havalimanının referans noktasına (pist, bina olabilir) konmaz.
                log::info!("kariyer: {icao} havalimanında uygun park yeri yok; taşıma yapılmadı");
            }
            return;
        }
        let mut data = Vec::with_capacity(56);
        for v in [lat, lon, alt, 0.0, 0.0, hdg] {
            data.extend_from_slice(&v.to_le_bytes());
        }
        data.extend_from_slice(&1u32.to_le_bytes());
        data.extend_from_slice(&0u32.to_le_bytes());
        let abs = self.career.live.lock().unwrap().telemetry.as_ref().map(|t| t.abs_time).unwrap_or(0.0);
        self.grace_abs = abs + 30.0;
        if let Some(t) = self.career.lock_data().active.as_mut().and_then(|a| a.tracker.as_mut()) {
            t.grace_until = self.grace_abs;
        }
        out.send(Request::SetDataOnSimObject { define: DEF_INIT, object: OBJECT_USER, data });
        log::info!("kariyer: uçak {icao} park yerine taşındı ({lat:.5}, {lon:.5})");
    }

    /// İşin yükünü istasyonlara yazar (dış EFB'li uçaklarda yapılmaz).
    fn apply_payload(&mut self, out: &mut Outbox) {
        let (payload_kg, title) = {
            let d = self.career.lock_data();
            let Some(a) = d.active.as_ref() else { return };
            (a.job.plan.payload_kg, a.aircraft.as_ref().map(|p| p.title.clone()).unwrap_or_default())
        };
        let live = self.career.live();
        let Some(ac) = live.aircraft else { return };
        if payload_kg <= 0.0 || manages_own_loading(&ac.title) || manages_own_loading(&title) {
            return;
        }
        let n = ac.specs.payload_stations;
        if n < 2 {
            return;
        }
        // 1. istasyon çoğu uçakta pilottur; yük kalanlara eşit dağıtılır.
        out.send(Request::ClearDataDefinition { define: DEF_PAYLOAD });
        for i in 2..=n.min(40) {
            out.send(Request::AddToDataDefinition { define: DEF_PAYLOAD, name: format!("PAYLOAD STATION WEIGHT:{i}"), units: "pounds".into(), datatype: DataType::Float64, epsilon: 0.0 });
        }
        let each = payload_kg * super::economy::LB_PER_KG / (n.min(40) - 1) as f64;
        let mut data = Vec::new();
        for _ in 2..=n.min(40) {
            data.extend_from_slice(&each.to_le_bytes());
        }
        out.send(Request::SetDataOnSimObject { define: DEF_PAYLOAD, object: OBJECT_USER, data });
    }

    /// FLT ve PLN dosyalarını yazar; FLT yolunu döner.
    fn write_files(&self) -> AppResult<String> {
        let (job, pick) = {
            let d = self.career.lock_data();
            let a = d.active.as_ref().ok_or_else(|| AppError::msg("aktif iş yok"))?;
            (a.job.clone(), a.aircraft.clone().unwrap_or_default())
        };
        let (from, to) = (db().get(&job.from).ok_or_else(|| AppError::NotFound(job.from.clone()))?, db().get(&job.to).ok_or_else(|| AppError::NotFound(job.to.clone()))?);
        let (_, parking, lat, lon, alt, hdg, rwy) = self.departure_spot().ok_or_else(|| AppError::msg("kalkış yeri yok"))?;
        let dir = self.career.flights_dir().join(fsx::sanitize_name(&job.id));
        std::fs::create_dir_all(&dir)?;
        let pln_name = format!("{}_{}", job.from, job.to);
        let ifr = matches!(job.class, Some(c) if !matches!(c, super::aircraft::Class::LightPiston | super::aircraft::Class::Helicopter));
        fsx::atomic_write(&dir.join(format!("{pln_name}.pln")), flt::write_pln(from, to, job.plan.cruise_alt_ft, ifr).as_bytes())?;
        let title = format!("Modstead: {} - {}", job.from, job.to);
        let flt_text = flt::write_flt(&flt::FlightSetup {
            title: &title,
            description: &format!("{} {}", job.client, job.cargo),
            aircraft_title: &pick.title,
            livery: &pick.livery,
            from,
            to,
            parking: parking.as_ref(),
            lat,
            lon,
            alt_ft: alt,
            heading: hdg,
            runway: rwy,
            pln_name: Some(&pln_name),
            cruise_alt_ft: job.plan.cruise_alt_ft,
            when: chrono::Utc::now(),
        });
        let path = dir.join("Modstead.flt");
        fsx::atomic_write(&path, &flt::to_ansi(&flt_text))?;
        let s = path.display().to_string();
        if !s.chars().all(|c| (c as u32) < 256) {
            return Err(AppError::msg(tr!(
                "Uçuş dosyasının yolunda simin okuyamadığı karakterler var; uçuşu elle açın.",
                "The flight file path has characters the sim cannot read; open the flight manually."
            )));
        }
        Ok(s)
    }

    fn in_flight(&self) -> bool {
        self.career.live.lock().unwrap().last_data.is_some_and(|t| t.elapsed() < Duration::from_secs(3))
    }

    /// Otomatik başlatmayı bir adım ilerletir (tick'ten).
    fn advance_launch(&mut self, out: &mut Outbox) {
        let Some(mut l) = self.career.live.lock().unwrap().launch_state.clone() else { return };
        let in_flight = self.in_flight();
        let live = self.career.live();
        let from = self.career.lock_data().active.as_ref().map(|a| (a.job.from.clone(), a.aircraft.as_ref().map(|p| p.title.clone()).unwrap_or_default()));
        let Some((from, pick_title)) = from else {
            self.career.live.lock().unwrap().launch_state = None;
            return;
        };
        let elapsed = l.since.elapsed();
        match l.step {
            Step::WaitingSim => {
                // Modstead simi yeni açtıysa SimConnect ana menüden önce dinlemeye başlar: biraz bekle.
                if l.opened_sim && !in_flight && self.connected_at.is_some_and(|c| c.elapsed() < Duration::from_secs(25)) {
                    return self.store_launch(l);
                }
                if self.detail(&from).is_none() {
                    self.request_detail(out, &from);
                }
                l.go(Step::FetchingAirport, tr!(format!("{from} park yerleri simden alınıyor…"), format!("Getting the parking spots at {from} from the sim…")));
            }
            Step::FetchingAirport => {
                if self.detail(&from).is_some() || elapsed > Duration::from_secs(8) {
                    let same_aircraft = live.aircraft.as_ref().is_some_and(|a| a.title == pick_title);
                    if in_flight && same_aircraft {
                        self.reposition(out);
                        l.teleported = true;
                        l.go(Step::Positioning, tr!("Uçak park yerine taşınıyor…", "Moving the aircraft to the parking spot…"));
                    } else {
                        match self.write_files() {
                            Ok(path) => {
                                self.flight_load_sent = out.send(Request::FlightLoad { path });
                                l.go(
                                    Step::Loading,
                                    tr!(
                                        "Uçuş simde yükleniyor. Sim bir onay isterse \"Uçuşa hazır\" düğmesine basın.",
                                        "Loading the flight in the sim. If the sim asks, press \"Ready to fly\"."
                                    ),
                                );
                            }
                            Err(e) => l.go(Step::Manual, e.to_string()),
                        }
                    }
                }
            }
            Step::Loading => {
                let t = live.telemetry.clone();
                let near = t.as_ref().and_then(|t| db().get(&from).map(|a| distance_nm(t.lat, t.lon, a.lat, a.lon))).unwrap_or(f64::MAX);
                if in_flight && (l.flight_started || near < 3.0) && elapsed > Duration::from_secs(3) {
                    l.go(Step::Positioning, tr!("Uçuş açıldı; konum ve yük ayarlanıyor…", "Flight is open; setting position and payload…"));
                } else if elapsed > Duration::from_secs(150) {
                    l.go(
                        Step::Manual,
                        tr!(
                            format!("Sim uçuşu kendiliğinden açmadı. Serbest uçuşu {from} havalimanında seçtiğiniz uçakla başlatın; Modstead uçağı park yerine taşır ve takibi başlatır."),
                            format!("The sim did not open the flight by itself. Start a free flight at {from} with the chosen aircraft; Modstead will move it to the parking spot and start tracking.")
                        ),
                    );
                }
            }
            Step::Positioning => {
                if !in_flight {
                    return self.store_launch(l);
                }
                if !l.teleported {
                    let far = match (self.departure_spot(), live.telemetry.as_ref()) {
                        (Some((_, Some(_), lat, lon, ..)), Some(t)) => distance_nm(lat, lon, t.lat, t.lon) * 1852.0 > 150.0,
                        _ => false,
                    };
                    if far && live.telemetry.as_ref().is_some_and(|t| t.on_ground && t.gs_kt < 2.0) {
                        self.reposition(out);
                    }
                    l.teleported = true;
                    l.since = Instant::now();
                } else if !l.payload_done && elapsed > Duration::from_secs(4) {
                    self.apply_payload(out);
                    l.payload_done = true;
                    let own = live.aircraft.as_ref().is_some_and(|a| a.manages_own_loading);
                    l.go(
                        Step::Done,
                        if own {
                            tr!("Hazır. Bu uçak yükü ve yakıtı kendi EFB'sinden yönetiyor: plandaki değerleri EFB'ye girin.", "Ready. This aircraft manages payload and fuel in its own EFB: enter the planned values there.")
                                .to_string()
                        } else {
                            tr!("Hazır. Yakıtı plana göre ayarlayın; motorları çalıştırdığınızda takip başlar.", "Ready. Set fuel as planned; tracking starts when you start the engines.").to_string()
                        },
                    );
                }
            }
            Step::Done | Step::Manual => {}
        }
        self.store_launch(l);
    }

    fn store_launch(&self, l: Launch) {
        let note = l.note.clone();
        let step = l.step;
        self.career.live.lock().unwrap().launch_state = Some(l);
        let mut d = self.career.lock_data();
        if let Some(a) = d.active.as_mut() {
            if a.launch_note.as_deref() != Some(note.as_str()) {
                a.launch_note = Some(note);
                if step == Step::Done && a.stage == Stage::Launching {
                    a.stage = Stage::Ready;
                }
            }
        }
    }

    fn parse_telemetry(&self, data: &[u8]) -> Telemetry {
        let mut r = Reader::new(data);
        let mut v = [0.0f64; 32];
        for (i, slot) in v.iter_mut().enumerate().take(TEL.len()) {
            if !self.tel_missing.contains(&i) {
                *slot = r.f64();
            }
        }
        Telemetry {
            lat: v[0],
            lon: v[1],
            alt_ft: v[2],
            agl_ft: v[3],
            gs_kt: v[4],
            ias_kt: v[5],
            vs_fpm: v[6],
            heading: v[7],
            // MSFS'te burun aşağı pozitiftir; Modstead burun yukarıyı pozitif tutar.
            pitch: -v[8],
            bank: v[9],
            on_ground: v[10] != 0.0,
            g: v[11],
            fuel_lb: v[12],
            total_lb: v[13],
            engines_on: v[14] != 0.0 || v[15] != 0.0 || v[16] != 0.0 || v[17] != 0.0,
            parking_brake: v[18] != 0.0,
            gear_down: v[19] != 0.0,
            flaps: v[20],
            overspeed: v[21] != 0.0,
            stall: v[22] != 0.0,
            flap_overspeed: v[23] != 0.0,
            sim_rate: if v[24] == 0.0 { 1.0 } else { v[24] },
            slew: v[25] != 0.0,
            on_runway: v[26] != 0.0,
            td_fps: v[27],
            td_bank: v[28],
            td_pitch: -v[29],
            abs_time: v[30],
            crash: v[31] as i32,
        }
    }

    fn on_aircraft(&mut self, data: &[u8]) {
        let mut r = Reader::new(data);
        let mut strs: Vec<String> = Vec::new();
        let mut nums: Vec<f64> = Vec::new();
        for (i, (_, _, dt)) in AC.iter().enumerate() {
            let missing = self.ac_missing.contains(&i);
            match dt {
                DataType::Float64 => nums.push(if missing { 0.0 } else { r.f64() }),
                other => strs.push(if missing { String::new() } else { r.str(other.size()) }),
            }
        }
        let (title, model, atc_id, category) = (strs[0].clone(), strs[1].clone(), strs[2].clone(), strs[3].clone());
        if title.is_empty() {
            return;
        }
        let specs = SimSpecs {
            category,
            engine_type: nums[0] as i32,
            engines: nums[1] as u32,
            mtow_lb: nums[2],
            empty_lb: nums[3],
            fuel_capacity_gal: nums[4],
            cruise_kt: nums[5],
            payload_stations: nums[6] as u32,
        };
        let learned = classify_specs(&specs).or_else(|| classify_name(&title, &model));
        let mut d = self.career.lock_data();
        let known = KnownAircraft { title: title.clone(), atc_model: model.clone(), specs: specs.clone(), class: learned, seen_at: crate::store::now_iso() };
        let changed = d.known_aircraft.get(&title).map(|k| k.specs != known.specs || k.class != known.class).unwrap_or(true);
        if changed {
            d.known_aircraft.insert(title.clone(), known);
            self.career.save(&d);
        }
        let (class, _) = Career::class_of(&d, &title, &model);
        drop(d);
        self.career.live.lock().unwrap().aircraft = Some(AircraftNow { manages_own_loading: manages_own_loading(&title), title, atc_model: model, atc_id, class, specs });
        if changed {
            self.career.changed();
        }
    }

    fn on_telemetry(&mut self, t: Telemetry) {
        {
            let mut live = self.career.live.lock().unwrap();
            live.last_data = Some(Instant::now());
            live.in_flight = true;
            live.telemetry = Some(t.clone());
        }
        let now_ms = fsx::now_ms();
        let aircraft = self.career.live.lock().unwrap().aircraft.clone();
        let mut finished = None;
        let mut save = false;
        {
            let mut d = self.career.lock_data();
            let pilot = d.pilot.clone();
            let Some(a) = d.active.as_mut() else { return };
            let Some(p) = pilot else { return };
            let dep = db().get(&a.job.from).cloned();
            let dest = db().get(&a.job.to).cloned();
            let (Some(dep), Some(dest)) = (dep, dest) else { return };

            // Kesilen uçuş: aynı yerden sürüyorsa devam.
            if a.stage == Stage::Interrupted {
                if let Some(tr) = a.tracker.as_mut() {
                    let close = tr.last.as_ref().is_some_and(|l| distance_nm(l.lat, l.lon, t.lat, t.lon) < 20.0);
                    if close {
                        tr.grace_until = t.abs_time + 30.0;
                        tr.last = None;
                        a.stage = if tr.started() { Stage::Flying } else { Stage::Ready };
                        save = true;
                    } else {
                        return;
                    }
                }
            }

            let started = a.tracker.as_ref().is_some_and(|tr| tr.started());
            if !started {
                let at_dep = t.on_ground && distance_nm(t.lat, t.lon, dep.lat, dep.lon) <= 3.0;
                let class = aircraft.as_ref().and_then(|ac| ac.class);
                let fits = class.is_some_and(|c| check_aircraft_for_job(&p, &a.job, c).is_ok());
                if at_dep && fits && !t.slew {
                    if a.tracker.is_none() {
                        let mut tr = Tracker::new(
                            &a.job.id,
                            Airfield { icao: dep.icao.clone(), lat: dep.lat, lon: dep.lon },
                            Airfield { icao: dest.icao.clone(), lat: dest.lat, lon: dest.lon },
                            class,
                            now_ms,
                        );
                        tr.grace_until = self.grace_abs.max(t.abs_time + 10.0);
                        a.tracker = Some(tr);
                        if matches!(a.stage, Stage::Accepted | Stage::Launching) {
                            a.stage = Stage::Ready;
                        }
                        // Gerçekte uçulan uçak deftere geçsin.
                        if let Some(ac) = &aircraft {
                            let fleet_id = a.aircraft.as_ref().and_then(|p| p.fleet_id.clone());
                            let livery = a.aircraft.as_ref().filter(|p| p.title == ac.title).map(|p| p.livery.clone()).unwrap_or_default();
                            a.aircraft = Some(super::model::AircraftPick { title: ac.title.clone(), livery, class, fleet_id });
                        }
                        save = true;
                    }
                } else if a.tracker.is_some() && !at_dep {
                    // Başlamadan kalkış yerinden ayrıldı (başka uçuş açtı): kapı yeniden kurulacak.
                    a.tracker = None;
                    if a.stage == Stage::Ready {
                        a.stage = Stage::Accepted;
                    }
                    save = true;
                }
            }

            if let Some(tr) = a.tracker.as_mut() {
                let was = tr.started();
                tr.update(&t, now_ms);
                if tr.started() && !was {
                    a.stage = Stage::Flying;
                    save = true;
                }
                let done = tr.crashed
                    || (tr.phase == super::tracker::Phase::Parked
                        && tr.airborne_ever()
                        && (!t.engines_on || tr.on_block.is_some_and(|ob| t.abs_time - ob >= 20.0)));
                if done {
                    finished = Some(());
                }
            }
            if finished.is_some() {
                let entry = self.career.complete(&mut d, None);
                drop(d);
                notify_done(&self.career, &entry);
                self.career.changed();
                return;
            }
            if save || (started && self.last_save.elapsed() > Duration::from_secs(20)) {
                self.last_save = Instant::now();
                self.career.save(&d);
            }
        }
        if save {
            self.career.changed();
        }
        if self.last_emit.elapsed() >= Duration::from_millis(900) {
            self.emit_live();
        }
    }

    /// Kontrol kapısı ve uçuş özeti; arayüze ≈1 Hz.
    fn emit_live(&mut self) {
        self.last_emit = Instant::now();
        let d = self.career.lock_data().clone();
        let mut live = self.career.live.lock().unwrap();
        let in_flight = live.last_data.is_some_and(|t| t.elapsed() < Duration::from_secs(3));
        live.in_flight = in_flight;
        let t = live.telemetry.clone().filter(|_| in_flight);
        live.nearest = t.as_ref().filter(|t| t.on_ground).and_then(|t| db().nearest(t.lat, t.lon, 3.0)).map(|(a, _)| a.icao.clone());
        live.checks = Vec::new();
        live.flight = None;
        live.launch = live.launch_state.as_ref().map(|l| LaunchView {
            step: format!("{:?}", l.step).to_lowercase().replace("waitingsim", "waiting_sim").replace("fetchingairport", "fetching_airport"),
            note: l.note.clone(),
            elapsed_s: l.started.elapsed().as_secs(),
        });
        if let (Some(a), Some(p)) = (&d.active, &d.pilot) {
            let dep = db().get(&a.job.from);
            let mut checks = vec![Check { id: "connected".into(), ok: live.link.state == "connected", required: true, detail: live.link.sim.clone().unwrap_or_default() }];
            checks.push(Check { id: "in_flight".into(), ok: in_flight, required: true, detail: String::new() });
            let dist = match (&t, dep) {
                (Some(t), Some(dep)) => Some(distance_nm(t.lat, t.lon, dep.lat, dep.lon)),
                _ => None,
            };
            checks.push(Check {
                id: "at_departure".into(),
                ok: dist.is_some_and(|x| x <= 3.0) && t.as_ref().is_some_and(|t| t.on_ground),
                required: true,
                detail: dist.map(|x| format!("{:.1} nm", x)).unwrap_or_default(),
            });
            let class = live.aircraft.as_ref().and_then(|ac| ac.class);
            let fit = match class {
                Some(c) => check_aircraft_for_job(p, &a.job, c).err().map(|e| e.to_string()),
                None => Some(tr!("Uçağın sınıfı bilinmiyor; Kariyer → Hangar'dan seçin.", "The aircraft class is unknown; set it in Career → Hangar.").to_string()),
            };
            checks.push(Check {
                id: "aircraft".into(),
                ok: in_flight && fit.is_none(),
                required: true,
                detail: fit.unwrap_or_else(|| live.aircraft.as_ref().map(|ac| ac.title.clone()).unwrap_or_default()),
            });
            checks.push(Check { id: "slew".into(), ok: !t.as_ref().is_some_and(|t| t.slew), required: true, detail: String::new() });
            if let (Some(t), Some(ac)) = (&t, &live.aircraft) {
                let fuel_need = a.job.plan.fuel_kg * super::economy::LB_PER_KG;
                checks.push(Check { id: "fuel".into(), ok: t.fuel_lb >= fuel_need * 0.9, required: false, detail: format!("{:.0}/{:.0} lb", t.fuel_lb, fuel_need) });
                if a.job.plan.payload_kg > 0.0 && ac.specs.empty_lb > 0.0 && !ac.manages_own_loading {
                    let loaded = (t.total_lb - ac.specs.empty_lb - t.fuel_lb).max(0.0);
                    let need = a.job.plan.payload_kg * super::economy::LB_PER_KG;
                    checks.push(Check { id: "payload".into(), ok: loaded >= need * 0.85, required: false, detail: format!("{:.0}/{:.0} lb", loaded, need) });
                }
            }
            live.checks = checks;
            if let Some(tr) = &a.tracker {
                let s = tr.summary();
                let last = tr.last.clone().unwrap_or_default();
                live.flight = Some(FlightLive {
                    phase: tr.phase,
                    elapsed_s: tr.off_block.map(|o| (last.abs_time - o).max(0.0)).unwrap_or(0.0),
                    flown_nm: s.flown_nm,
                    remaining_nm: s.distance_to_dest_nm,
                    fuel_used_lb: s.fuel_used_lb,
                    score_now: s.score,
                    events: tr.events.iter().rev().take(20).cloned().collect(),
                    landing: tr.landings.last().cloned(),
                    invalid: tr.invalid.clone(),
                });
            }
        }
        let snapshot = live.clone();
        drop(live);
        self.career.services.emit(super::EVENT_LIVE, &snapshot);
    }

    /// Sim içi panel: uçuş açıkken saniyede bir `L:MODSTEAD_HUD_*` yazılır (ana menüde kullanıcı uçağı yok).
    fn feed_hud(&mut self, out: &mut Outbox) {
        if !self.connected || !self.hud.due() || !self.career.live.lock().unwrap().in_flight {
            return;
        }
        self.hud.seq = self.hud.seq.wrapping_add(1).max(1);
        self.hud.at = Some(Instant::now());
        let data = super::hud::Feed::encode(&super::hud::values(&self.career, self.hud.seq));
        out.send(Request::SetDataOnSimObject { define: DEF_HUD, object: OBJECT_USER, data });
    }

    fn refresh_sims(&mut self) {
        if self.sims_at.is_none_or(|t| t.elapsed() > Duration::from_secs(30)) {
            self.sims = self.career.sims();
            self.sims_at = Some(Instant::now());
        }
    }
}

fn notify_done(career: &Career, e: &super::model::LogEntry) {
    let money = if e.settlement.net >= 0 { format!("+${}", e.settlement.net) } else { format!("-${}", -e.settlement.net) };
    let title = match e.result.as_str() {
        "completed" => tr!(format!("Uçuş tamamlandı · {} · {money}", e.summary.grade), format!("Flight complete · {} · {money}", e.summary.grade)),
        "late" => tr!(format!("Geç teslim · {} · {money}", e.summary.grade), format!("Late delivery · {} · {money}", e.summary.grade)),
        "diverted" => tr!(format!("{} havalimanına inildi; iş tamamlanmadı", e.arrived), format!("Landed at {}; the job was not completed", e.arrived)),
        "crashed" => tr!("Kaza: uçuş başarısız".to_string(), "Crash: the flight failed".to_string()),
        "invalid" => tr!("Uçuş geçersiz sayıldı".to_string(), "The flight was invalidated".to_string()),
        _ => tr!("Uçuş sonlandı".to_string(), "Flight ended".to_string()),
    };
    let tone = if matches!(e.result.as_str(), "completed" | "late") { Tone::Ok } else { Tone::Warn };
    let detail = e.landing.as_ref().map(|l| tr!(format!("İniş {} fpm · {} G · +{} XP", l.fpm, l.g, e.xp), format!("Landing {} fpm · {} G · +{} XP", l.fpm, l.g, e.xp)));
    career.services.notify(tone, title, detail);
}

impl Handler for Engine {
    fn target(&mut self) -> Result<Target, String> {
        if !self.career.has_pilot() {
            return Err(tr!("Kariyer başlatılmadı.", "No career started.").to_string());
        }
        if let Some(t) = &self.fixed_target {
            return Ok(t.clone());
        }
        self.refresh_sims();
        // Önce 2024; ikisi birden açık olamaz (aynı portu dinlerler).
        for id in [crate::sims::SIM_2024, crate::sims::SIM_2020] {
            if crate::sims::is_running(id) {
                let cfg = self.sims.iter().find(|s| s.id == id).and_then(|s| s.config_dir.clone());
                return super::link::target_for(id, cfg.as_deref());
            }
        }
        Err(tr!("Sim kapalı.", "The sim is not running.").to_string())
    }

    fn on_open(&mut self, out: &mut Outbox, target: &Target, version: (u32, u32, u32, u32)) {
        log::info!("SimConnect bağlandı: {} protokol {} sim {}.{}.{}.{}", target.sim, target.protocol, version.0, version.1, version.2, version.3);
        self.protocol = target.protocol;
        self.connected = true;
        self.connected_at = Some(Instant::now());
        self.tel_sent.clear();
        self.tel_missing.clear();
        self.ac_sent.clear();
        self.ac_missing.clear();
        self.facility.clear();
        self.liveries.clear();
        self.airports.clear();
        for (i, (name, units)) in TEL.iter().enumerate() {
            if let Some(id) = out.send(Request::AddToDataDefinition { define: DEF_TEL, name: name.to_string(), units: units.to_string(), datatype: DataType::Float64, epsilon: 0.0 }) {
                self.tel_sent.insert(id, i);
            }
        }
        for (i, (name, units, dt)) in AC.iter().enumerate() {
            if let Some(id) = out.send(Request::AddToDataDefinition { define: DEF_AC, name: name.to_string(), units: units.to_string(), datatype: *dt, epsilon: 0.0 }) {
                self.ac_sent.insert(id, i);
            }
        }
        out.send(Request::AddToDataDefinition { define: DEF_INIT, name: "Initial Position".into(), units: String::new(), datatype: DataType::InitPosition, epsilon: 0.0 });
        self.hud = Default::default();
        for f in super::hud::FIELDS {
            if let Some(id) = out.send(Request::AddToDataDefinition { define: DEF_HUD, name: super::hud::var_name(f), units: "number".into(), datatype: DataType::Float64, epsilon: 0.0 }) {
                self.hud.defs.push(id);
            }
        }
        for f in FAC {
            out.send(Request::AddToFacilityDefinition { define: DEF_FAC, field: f.to_string() });
        }
        Self::request_data(out);
        for (id, name) in [(EV_SIMSTART, "SimStart"), (EV_SIMSTOP, "SimStop"), (EV_PAUSE, "Pause_EX1"), (EV_CRASHED, "Crashed")] {
            out.send(Request::SubscribeToSystemEvent { event: id, name: name.into() });
        }
        out.send(Request::SubscribeToFlowEvent);
        self.on_command(out, Command::RefreshAircraft);
        let fresh = {
            let path = self.career.cache_path("sim-airports.json");
            let s: SimAirports = fsx::read_json(&path);
            !s.idents.is_empty() && fsx::now_ts() - s.fetched_at < 7 * 86400
        };
        if !fresh {
            out.send(Request::RequestAllFacilities { request: REQ_AIRPORTS, kind: super::simconnect::FACILITY_AIRPORT });
        }
        self.emit_live();
    }

    fn on_recv(&mut self, out: &mut Outbox, msg: Recv) {
        match msg {
            Recv::Exception { send_id, .. } => {
                if let Some(i) = self.tel_sent.get(&send_id) {
                    log::info!("SimConnect bu simde '{}' değişkenini tanımıyor; atlanıyor", TEL[*i].0);
                    self.tel_missing.insert(*i);
                } else if let Some(i) = self.ac_sent.get(&send_id) {
                    log::info!("SimConnect bu simde '{}' değişkenini tanımıyor; atlanıyor", AC[*i].0);
                    self.ac_missing.insert(*i);
                } else if self.hud.defs.contains(&send_id) {
                    if self.hud.ok {
                        log::info!("SimConnect L: değişkenlerini kabul etmedi; sim içi panel bu oturumda beslenmeyecek");
                    }
                    self.hud.ok = false;
                } else if self.flight_load_sent == Some(send_id) {
                    if let Some(l) = self.career.live.lock().unwrap().launch_state.as_mut() {
                        l.go(Step::Manual, tr!("Sim uçuş dosyasını kabul etmedi; serbest uçuşu elle başlatın.", "The sim rejected the flight file; start the free flight manually."));
                    }
                }
            }
            Recv::SimObjectData { request: REQ_TEL, data, .. } => {
                let t = self.parse_telemetry(&data);
                // Ana menüde konum 0,0 gelebilir.
                if t.lat == 0.0 && t.lon == 0.0 {
                    return;
                }
                self.on_telemetry(t);
            }
            Recv::SimObjectData { request: REQ_AC, data, .. } => self.on_aircraft(&data),
            Recv::Event { event, data, .. } => match event {
                EV_SIMSTART => Self::request_data(out),
                EV_PAUSE => self.career.live.lock().unwrap().paused = data != 0,
                EV_CRASHED => {
                    let abs = self.career.live.lock().unwrap().telemetry.as_ref().map(|t| t.abs_time).unwrap_or(0.0);
                    let mut d = self.career.lock_data();
                    if let Some(tr) = d.active.as_mut().and_then(|a| a.tracker.as_mut()) {
                        tr.crash(abs);
                    }
                }
                EV_SIMSTOP => self.career.live.lock().unwrap().in_flight = false,
                _ => {}
            },
            Recv::Flow { event, .. } => {
                let name = flow::name(event);
                log::debug!("akış olayı: {name}");
                let abs = self.career.live.lock().unwrap().telemetry.as_ref().map(|t| t.abs_time).unwrap_or(0.0);
                if matches!(event, flow::FLIGHT_START | flow::FLT_LOADED) {
                    Self::request_data(out);
                    if let Some(l) = self.career.live.lock().unwrap().launch_state.as_mut() {
                        l.flight_started = true;
                    }
                }
                let mut d = self.career.lock_data();
                if let Some(a) = d.active.as_mut() {
                    if let Some(tr) = a.tracker.as_mut() {
                        tr.flow(name, abs);
                    }
                    if event == flow::BACK_TO_MAIN_MENU && a.stage == Stage::Flying {
                        a.stage = Stage::Interrupted;
                        self.career.save(&d);
                        drop(d);
                        self.career.changed();
                    }
                }
            }
            Recv::Liveries { request, entry, out_of, items } if request == REQ_LIV_A || request == REQ_LIV_H => {
                self.liveries.extend(items);
                if entry + 1 >= out_of {
                    self.liveries_pending = self.liveries_pending.saturating_sub(1);
                    if self.liveries_pending == 0 {
                        let mut items = std::mem::take(&mut self.liveries);
                        items.sort();
                        items.dedup();
                        let inst = Installed { items, fetched_at: fsx::now_ts() };
                        let _ = fsx::write_json(&self.career.cache_path("aircraft.json"), &inst);
                        log::info!("kariyer: simde {} uçak/boya bulundu", inst.items.len());
                        self.career.caches.lock().unwrap().installed = inst;
                        self.career.changed();
                    }
                }
            }
            Recv::AirportList { request: REQ_AIRPORTS, entry, out_of, airports } => {
                self.airports.extend(airports.into_iter().map(|a| a.icao.to_ascii_uppercase()));
                if entry + 1 >= out_of {
                    let idents: Vec<String> = std::mem::take(&mut self.airports).into_iter().collect();
                    log::info!("kariyer: simde {} havalimanı var", idents.len());
                    // Çok az havalimanı dönmesi bir hatadır (yalnızca yakın çevre): süzgeç olarak kullanılmaz.
                    if idents.len() > 5000 {
                        let _ = fsx::write_json(&self.career.cache_path("sim-airports.json"), &SimAirports { idents: idents.clone(), fetched_at: fsx::now_ts() });
                        self.career.caches.lock().unwrap().sim_airports = Some(idents.into_iter().collect());
                    }
                }
            }
            Recv::FacilityData { request, kind, data, .. } => self.on_facility(request, kind, &data),
            Recv::FacilityDataEnd { request } => self.on_facility_end(out, request),
            _ => {}
        }
    }

    fn on_command(&mut self, out: &mut Outbox, cmd: Command) {
        match cmd {
            Command::Reposition => self.reposition(out),
            Command::AirportDetail { icao } => self.request_detail(out, &icao),
            Command::RefreshAircraft => {
                if out.send(Request::EnumerateSimObjectsAndLiveries { request: REQ_LIV_A, kind: SIMOBJECT_AIRCRAFT }).is_some() {
                    self.liveries.clear();
                    self.liveries_pending = 1;
                    if out.send(Request::EnumerateSimObjectsAndLiveries { request: REQ_LIV_H, kind: SIMOBJECT_HELICOPTER }).is_some() {
                        self.liveries_pending = 2;
                    }
                }
            }
            Command::Shutdown => {}
        }
    }

    fn tick(&mut self, out: &mut Outbox) {
        self.advance_launch(out);
        self.feed_hud(out);
        if self.last_emit.elapsed() >= Duration::from_secs(2) {
            self.emit_live();
        }
        // Bağlantı sürerken uçuş başlamışsa başlatma notu kalkar.
        let started = self.career.lock_data().active.as_ref().and_then(|a| a.tracker.as_ref()).is_some_and(|t| t.started());
        if started {
            let mut live = self.career.live.lock().unwrap();
            if live.launch_state.as_ref().is_some_and(|l| matches!(l.step, Step::Done | Step::Manual)) {
                live.launch_state = None;
            }
        }
    }

    fn on_state(&mut self, state: LinkState) {
        let view = match &state {
            LinkState::Waiting(why) => LinkView { state: "waiting".into(), sim: None, detail: Some(why.clone()) },
            LinkState::Connecting(sim) => LinkView { state: "connecting".into(), sim: Some(sim.clone()), detail: None },
            LinkState::Connected { sim, .. } => LinkView { state: "connected".into(), sim: Some(sim.clone()), detail: None },
            LinkState::Failed(why) => LinkView { state: "waiting".into(), sim: None, detail: Some(why.clone()) },
        };
        let was_connected = self.connected;
        self.connected = matches!(state, LinkState::Connected { .. });
        {
            let mut live = self.career.live.lock().unwrap();
            live.link = view;
            if !self.connected {
                live.in_flight = false;
                live.last_data = None;
            }
        }
        if was_connected && !self.connected {
            let mut d = self.career.lock_data();
            if let Some(a) = d.active.as_mut() {
                if a.stage == Stage::Flying {
                    a.stage = Stage::Interrupted;
                    self.career.save(&d);
                }
            }
        }
        self.emit_live();
        self.career.changed();
    }
}

#[cfg(test)]
mod tests {
    //! Sahte bir SimConnect sunucusuyla uçtan uca: bağlantı, oturum, veri tanımları, telemetri, takip, uçuş sonu.

    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};
    use std::time::{Duration, Instant};

    use super::*;
    use crate::career::airports::db;
    use crate::career::link::LinkHandle;
    use crate::career::progression::Difficulty;
    use crate::career::simconnect::Framer;
    use crate::career::CreateRequest;

    fn recv_packet(id: u32, fields: &[u8]) -> Vec<u8> {
        let mut v = Vec::new();
        v.extend_from_slice(&((12 + fields.len()) as u32).to_le_bytes());
        v.extend_from_slice(&PROTO_SUNRISE.to_le_bytes());
        v.extend_from_slice(&id.to_le_bytes());
        v.extend_from_slice(fields);
        v
    }

    fn sim_data(request: u32, define: u32, data: &[u8]) -> Vec<u8> {
        let mut f = Vec::new();
        for v in [request, 0, define, 0, 1, 1, 1] {
            f.extend_from_slice(&v.to_le_bytes());
        }
        f.extend_from_slice(data);
        recv_packet(8, &f)
    }

    fn fixed(s: &str, n: usize) -> Vec<u8> {
        let mut b = s.as_bytes().to_vec();
        b.resize(n, 0);
        b
    }

    /// Sahte sim: oturumu açar, telemetri alanlarını sayar, uçak bilgisini ve verilen uçuşu yollar.
    fn fake_sim(listener: TcpListener, flight: Vec<[f64; 32]>) {
        let (mut s, _) = listener.accept().unwrap();
        s.set_read_timeout(Some(Duration::from_millis(20))).unwrap();
        let mut fr = Framer::default();
        let mut buf = vec![0u8; 65536];
        let mut tel_fields = 0;
        let mut opened = false;
        let until = Instant::now() + Duration::from_secs(20);
        let mut sent = 0usize;
        while Instant::now() < until {
            match s.read(&mut buf) {
                Ok(0) => return,
                Ok(n) => fr.push(&buf[..n]),
                Err(_) => {}
            }
            while let Some(body) = fr.next() {
                let mut r = Reader::new(&body);
                let _proto = r.u32();
                let func = r.u32() & 0x0FFF_FFFF;
                let _send = r.u32();
                match func {
                    0x01 => {
                        let mut f = fixed("KittyHawk", 256);
                        for v in [12u32, 2, 282174, 999, 12, 2, 0, 0, 0, 0] {
                            f.extend_from_slice(&v.to_le_bytes());
                        }
                        let _ = s.write_all(&recv_packet(2, &f));
                        opened = true;
                    }
                    0x0c if r.u32() == DEF_TEL => tel_fields += 1,
                    _ => {}
                }
            }
            // Tanımlar geldikten sonra: önce uçak bilgisi, sonra uçuş.
            if opened && tel_fields == TEL.len() && sent < flight.len() {
                if sent == 0 {
                    let mut d = fixed("Cessna Skyhawk G1000 Asobo", 256);
                    d.extend(fixed("TT:ATCCOM.AC_MODEL_C172.0.text", 64));
                    d.extend(fixed("TC-MOD", 64));
                    d.extend(fixed("Airplane", 64));
                    for v in [0.0f64, 1.0, 2550.0, 1680.0, 56.0, 124.0, 4.0] {
                        d.extend_from_slice(&v.to_le_bytes());
                    }
                    let _ = s.write_all(&sim_data(REQ_AC, DEF_AC, &d));
                    std::thread::sleep(Duration::from_millis(200));
                }
                for row in flight.iter().skip(sent).take(20) {
                    let mut d = Vec::new();
                    for v in row {
                        d.extend_from_slice(&v.to_le_bytes());
                    }
                    let _ = s.write_all(&sim_data(REQ_TEL, DEF_TEL, &d));
                    sent += 1;
                }
                std::thread::sleep(Duration::from_millis(15));
            }
        }
    }

    struct Row {
        lat: f64,
        lon: f64,
        agl: f64,
        gs: f64,
        vs: f64,
        ground: bool,
        eng: bool,
        brake: bool,
        fuel: f64,
        td: f64,
    }

    /// Kalkış → iniş → park, `TEL` sırasıyla 32 alan.
    fn script(from: (f64, f64), to: (f64, f64)) -> Vec<[f64; 32]> {
        let mut rows = Vec::new();
        let mut abs = 5000.0;
        let mut row = |r: Row, dt: f64| {
            abs += dt;
            let mut v = [0.0f64; 32];
            v[0] = r.lat;
            v[1] = r.lon;
            v[2] = r.agl + 100.0;
            v[3] = r.agl;
            v[4] = r.gs;
            v[5] = r.gs;
            v[6] = r.vs;
            v[10] = r.ground as u8 as f64;
            v[11] = 1.0;
            v[12] = r.fuel;
            v[13] = 2300.0;
            v[14] = r.eng as u8 as f64;
            v[18] = r.brake as u8 as f64;
            v[24] = 1.0;
            v[27] = r.td;
            v[30] = abs;
            rows.push(v);
        };
        let at = |p: (f64, f64), agl: f64, gs: f64, vs: f64, ground: bool, eng: bool, brake: bool, fuel: f64, td: f64| Row { lat: p.0, lon: p.1, agl, gs, vs, ground, eng, brake, fuel, td };
        for _ in 0..3 {
            row(at(from, 0.0, 0.0, 0.0, true, false, true, 300.0, 0.0), 1.0);
        }
        for _ in 0..5 {
            row(at(from, 0.0, 12.0, 0.0, true, true, false, 300.0, 0.0), 1.0);
        }
        for _ in 0..4 {
            row(at(from, 60.0, 70.0, 600.0, false, true, false, 299.0, 0.0), 1.0);
        }
        let n = 120;
        for i in 0..n {
            let f = (i + 1) as f64 / n as f64;
            let p = (from.0 + (to.0 - from.0) * f, from.1 + (to.1 - from.1) * f);
            row(at(p, 4000.0, 110.0, 0.0, false, true, false, 299.0 - f * 40.0, 0.0), 12.0);
        }
        row(at(to, 0.0, 55.0, -120.0, true, true, false, 259.0, 2.0), 1.0);
        for _ in 0..4 {
            row(at(to, 0.0, 10.0, 0.0, true, true, false, 259.0, 2.0), 2.0);
        }
        for _ in 0..6 {
            row(at(to, 0.0, 0.0, 0.0, true, false, true, 259.0, 2.0), 1.0);
        }
        rows
    }

    #[test]
    fn full_flight_against_fake_simconnect() {
        let career = Career::open(modstead_core::Services::for_tests(), Arc::new(Vec::new));
        career
            .create(CreateRequest { name: "Oyuncu".into(), callsign: String::new(), home: "LTBA".into(), difficulty: Difficulty::Normal, start: "student".into() })
            .unwrap();
        let job = career.board().unwrap().remove(0);
        career.accept(&job.id).unwrap();
        career.pick_aircraft("Cessna Skyhawk G1000 Asobo", "", None).unwrap();
        let (a, b) = (db().get(&job.from).unwrap(), db().get(&job.to).unwrap());

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr: SocketAddr = listener.local_addr().unwrap();
        let flight = script((a.lat, a.lon), (b.lat, b.lon));
        let server = std::thread::spawn(move || fake_sim(listener, flight));
        let link = LinkHandle::spawn(Engine::with_target(career.clone(), Target { sim: "msfs2024".into(), addr, protocol: PROTO_SUNRISE }));

        let until = Instant::now() + Duration::from_secs(20);
        while Instant::now() < until && career.logbook().is_empty() {
            std::thread::sleep(Duration::from_millis(100));
        }
        link.send(Command::Shutdown);
        let log = career.logbook();
        assert_eq!(log.len(), 1, "uçuş kendiliğinden kapanmadı; canlı: {:?}", career.live().flight);
        let e = &log[0];
        assert_eq!(e.result, "completed", "{:?}", e.summary);
        assert_eq!(e.aircraft.title, "Cessna Skyhawk G1000 Asobo");
        assert_eq!(e.aircraft.class, Some(crate::career::aircraft::Class::LightPiston));
        assert_eq!(e.landing.as_ref().unwrap().fpm, 120.0);
        assert!(e.summary.score >= 90, "{:?}", e.events);
        assert!((e.summary.fuel_used_lb - 41.0).abs() < 2.0, "{}", e.summary.fuel_used_lb);
        let v = career.view();
        assert_eq!(v.pilot.unwrap().pilot.location, job.to);
        assert!(v.active.is_none());
        // Uçak simden öğrenildi.
        assert!(career.lock_data().known_aircraft.contains_key("Cessna Skyhawk G1000 Asobo"));
        let _ = server.join();
    }

    #[test]
    fn hud_feed_defines_lvars_and_writes_once_a_second() {
        use crate::career::hud::{FIELDS, icao_code, var_name};
        let career = Career::open(modstead_core::Services::for_tests(), Arc::new(Vec::new));
        career
            .create(CreateRequest { name: "Oyuncu".into(), callsign: String::new(), home: "LTBA".into(), difficulty: Difficulty::Normal, start: "student".into() })
            .unwrap();
        let mut e = Engine::new(career.clone());
        let mut out = Outbox::new(PROTO_SUNRISE);
        let target = Target { sim: "msfs2024".into(), addr: "127.0.0.1:500".parse().unwrap(), protocol: PROTO_SUNRISE };
        e.on_open(&mut out, &target, (12, 0, 0, 0));
        let sent = out.take();
        let names: Vec<String> = sent
            .iter()
            .filter_map(|(_, r)| match r {
                Request::AddToDataDefinition { define: DEF_HUD, name, units, datatype: DataType::Float64, .. } if units == "number" => Some(name.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(names, FIELDS.iter().map(|f| var_name(f)).collect::<Vec<_>>());

        let hud_writes = |out: &mut Outbox| -> Vec<Vec<f64>> {
            out.take()
                .into_iter()
                .filter_map(|(_, r)| match r {
                    Request::SetDataOnSimObject { define: DEF_HUD, object: OBJECT_USER, data } => {
                        Some(data.chunks(8).map(|c| f64::from_le_bytes(c.try_into().unwrap())).collect())
                    }
                    _ => None,
                })
                .collect()
        };
        let field = |v: &[f64], name: &str| v[FIELDS.iter().position(|f| *f == name).unwrap()];
        let fly = |c: &Career| {
            let mut l = c.live.lock().unwrap();
            l.in_flight = true;
            l.last_data = Some(Instant::now());
        };

        // Uçuş açık değilken (ana menü) yazılmaz.
        e.tick(&mut out);
        assert!(hud_writes(&mut out).is_empty());

        fly(&career);
        e.tick(&mut out);
        let w = hud_writes(&mut out);
        assert_eq!(w.len(), 1);
        assert_eq!(w[0].len(), FIELDS.len());
        assert_eq!(field(&w[0], "SEQ"), 1.0);
        assert_eq!(field(&w[0], "STATE"), 1.0, "aktif iş yok");
        // Saniyede bir: hemen ardından yazılmaz.
        e.tick(&mut out);
        assert!(hud_writes(&mut out).is_empty());

        let job = career.board().unwrap().remove(0);
        career.accept(&job.id).unwrap();
        e.hud.at = None;
        fly(&career);
        e.tick(&mut out);
        let w = hud_writes(&mut out);
        assert_eq!(field(&w[0], "SEQ"), 2.0);
        assert_eq!(field(&w[0], "STATE"), 2.0, "hazırlanıyor");
        assert_eq!(field(&w[0], "FROM"), icao_code(&job.from));
        assert_eq!(field(&w[0], "TO"), icao_code(&job.to));
        assert_eq!(field(&w[0], "PAY"), job.pay as f64);
        assert!(field(&w[0], "DUE_MIN") > 0.0);

        // Sim L: değişkenlerini tanımazsa (2020 SU12 öncesi) bu oturumda bir daha yazılmaz.
        let def_id = e.hud.defs[0];
        e.on_recv(&mut out, Recv::Exception { send_id: def_id, exception: 3, index: 0 });
        e.hud.at = None;
        e.tick(&mut out);
        assert!(hud_writes(&mut out).is_empty());
    }
}
