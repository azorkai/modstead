//! Uçuş takipçisi: simden gelen telemetriyle uçuşun evrelerini izler, inişi yakalar, ihlalleri ve hileyi not eder,
//! sonunda puanı hesaplar.
//!
//! Kurallar açıktır ve arayüzde aynı adlarla gösterilir (MSFS 2024 kariyerine yöneltilen "gizli ceza" eleştirisi):
//! her kuralın bir kodu, bir puan kesintisi ve bir üst sınırı vardır; bir kural aynı uçuşta en çok o sınır kadar
//! puan götürür. Sınırlar OnAir ve A Pilot's Life'ın yayımlanmış kurallarından uyarlandı.
//!
//! Zaman simin `ABSOLUTE TIME` saatiyle ölçülür: duraklatınca durur, sim hızı artınca hızlanır.

use serde::{Deserialize, Serialize};

use super::aircraft::{Class, info};
use super::airports::distance_nm;

/// Simden saniyede birkaç kez gelen değerler.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Telemetry {
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: f64,
    pub agl_ft: f64,
    pub gs_kt: f64,
    pub ias_kt: f64,
    pub vs_fpm: f64,
    pub heading: f64,
    pub pitch: f64,
    pub bank: f64,
    pub on_ground: bool,
    pub g: f64,
    pub fuel_lb: f64,
    pub total_lb: f64,
    pub engines_on: bool,
    pub parking_brake: bool,
    pub gear_down: bool,
    pub flaps: f64,
    pub overspeed: bool,
    pub stall: bool,
    pub flap_overspeed: bool,
    pub sim_rate: f64,
    pub slew: bool,
    pub on_runway: bool,
    /// Son temasın dikey hızı (ft/sn, simin kendi ölçümü).
    pub td_fps: f64,
    pub td_bank: f64,
    pub td_pitch: f64,
    pub abs_time: f64,
    pub crash: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    #[default]
    Preflight,
    TaxiOut,
    Takeoff,
    Climb,
    Cruise,
    Descent,
    Approach,
    Rollout,
    TaxiIn,
    Parked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    #[default]
    Info,
    Minor,
    Major,
    /// Uçuş geçersiz (hile ya da kaza).
    Fatal,
}

/// Uçuşta olan bir şey: arayüzde zaman çizelgesi, sonunda puan dökümü.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct FlightEvent {
    /// Uçuş başından beri sim saniyesi.
    pub t: f64,
    pub code: String,
    pub severity: Severity,
    /// Puan kesintisi (üst sınır uygulanmış hali).
    pub penalty: u8,
    pub value: f64,
}

/// İniş ölçümü.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Landing {
    pub fpm: f64,
    pub g: f64,
    pub bank: f64,
    pub pitch: f64,
    pub ias_kt: f64,
    pub bounces: u32,
    pub lat: f64,
    pub lon: f64,
    pub on_runway: bool,
    /// "butter" | "smooth" | "good" | "firm" | "hard" | "very_hard"
    pub label: String,
}

/// Kural: kod, tek seferlik kesinti, uçuş başına üst sınır, iki tetik arasındaki en kısa süre (sim sn).
struct Rule {
    code: &'static str,
    penalty: u8,
    cap: u8,
    cooldown: f64,
}

const RULES: &[Rule] = &[
    Rule { code: "overspeed", penalty: 5, cap: 15, cooldown: 20.0 },
    Rule { code: "stall", penalty: 5, cap: 15, cooldown: 20.0 },
    Rule { code: "flap_overspeed", penalty: 3, cap: 9, cooldown: 20.0 },
    Rule { code: "bank", penalty: 3, cap: 9, cooldown: 20.0 },
    Rule { code: "pitch", penalty: 3, cap: 9, cooldown: 20.0 },
    Rule { code: "g_limit", penalty: 5, cap: 10, cooldown: 10.0 },
    Rule { code: "speed_10k", penalty: 5, cap: 10, cooldown: 60.0 },
    Rule { code: "taxi_speed", penalty: 2, cap: 6, cooldown: 30.0 },
    Rule { code: "bounce", penalty: 4, cap: 12, cooldown: 0.0 },
    Rule { code: "low_fuel", penalty: 5, cap: 5, cooldown: 0.0 },
];

fn rule(code: &str) -> &'static Rule {
    RULES.iter().find(|r| r.code == code).expect("tanımlı kural")
}

/// Nokta: [enlem, boylam, irtifa ft, yer hızı kt].
pub type TrackPoint = [f32; 4];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Airfield {
    pub icao: String,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Tracker {
    pub job_id: String,
    pub from: Airfield,
    pub to: Airfield,
    pub class: Option<Class>,
    pub phase: Phase,
    pub off_block: Option<f64>,
    pub takeoff: Option<f64>,
    pub touchdown: Option<f64>,
    pub on_block: Option<f64>,
    pub real_start_ms: i64,
    pub real_end_ms: i64,
    pub fuel_start_lb: f64,
    pub fuel_takeoff_lb: f64,
    pub fuel_end_lb: f64,
    pub weight_takeoff_lb: f64,
    pub max_alt_ft: f64,
    pub flown_nm: f64,
    pub sim_rate_max: f64,
    pub events: Vec<FlightEvent>,
    pub landings: Vec<Landing>,
    pub track: Vec<TrackPoint>,
    /// Geçersiz kılan neden (slew, ışınlanma, havada yakıt, kaza).
    pub invalid: Option<String>,
    pub crashed: bool,
    /// Modstead'in kendi ışınlaması bu sim saatine kadar hile sayılmaz.
    pub grace_until: f64,
    pub last: Option<Telemetry>,
    /// Kuralların son tetiklenme zamanı (kod → sim saati).
    last_hit: Vec<(String, f64)>,
    air_since: Option<f64>,
    ground_since: Option<f64>,
    parked_since: Option<f64>,
    last_track: f64,
    g_window: Vec<(f64, f64)>,
    pending_landing: Option<f64>,
}

/// Uçuşun sonucu (seyir defterine ve hesaba gider).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Summary {
    pub score: u8,
    pub grade: String,
    pub block_s: f64,
    pub air_s: f64,
    pub real_s: f64,
    pub fuel_used_lb: f64,
    pub fuel_left_lb: f64,
    pub flown_nm: f64,
    pub max_alt_ft: f64,
    pub landing: Option<Landing>,
    pub arrived_at_destination: bool,
    pub distance_to_dest_nm: f64,
    pub invalid: Option<String>,
    pub crashed: bool,
    pub sim_rate_max: f64,
}

pub fn grade(score: u8) -> &'static str {
    match score {
        95..=100 => "A+",
        88..=94 => "A",
        78..=87 => "B",
        65..=77 => "C",
        50..=64 => "D",
        _ => "F",
    }
}

/// İniş sertliği etiketi ve puan kesintisi (sınıfın "sert" eşiğine göre ölçeklenir).
pub fn landing_rating(class: Option<Class>, fpm: f64) -> (&'static str, u8) {
    let k = class.map(|c| info(c).firm_fpm / 300.0).unwrap_or(1.0);
    match fpm / k {
        f if f < 60.0 => ("butter", 0),
        f if f < 200.0 => ("smooth", 0),
        f if f < 300.0 => ("good", 3),
        f if f < 400.0 => ("firm", 8),
        f if f < 500.0 => ("hard", 15),
        _ => ("very_hard", 25),
    }
}

impl Tracker {
    pub fn new(job_id: &str, from: Airfield, to: Airfield, class: Option<Class>, now_ms: i64) -> Self {
        Tracker { job_id: job_id.to_string(), from, to, class, real_start_ms: now_ms, ..Default::default() }
    }

    pub fn started(&self) -> bool {
        self.off_block.is_some()
    }

    pub fn airborne_ever(&self) -> bool {
        self.takeoff.is_some()
    }

    fn since_start(&self, abs: f64) -> f64 {
        self.off_block.map(|s| (abs - s).max(0.0)).unwrap_or(0.0)
    }

    fn penalized(&self, code: &str) -> u32 {
        self.events.iter().filter(|e| e.code == code).map(|e| e.penalty as u32).sum()
    }

    /// Kurala uyan bir ihlal: bekleme süresi ve üst sınırla.
    fn hit(&mut self, code: &str, abs: f64, value: f64) {
        let r = rule(code);
        if let Some((_, at)) = self.last_hit.iter().find(|(c, _)| c == code) {
            if abs - at < r.cooldown {
                return;
            }
        }
        self.last_hit.retain(|(c, _)| c != code);
        self.last_hit.push((code.to_string(), abs));
        let left = (r.cap as u32).saturating_sub(self.penalized(code)) as u8;
        let penalty = r.penalty.min(left);
        self.events.push(FlightEvent { t: self.since_start(abs), code: code.into(), severity: Severity::Minor, penalty, value: round1(value) });
    }

    fn note(&mut self, code: &str, abs: f64, value: f64) {
        self.events.push(FlightEvent { t: self.since_start(abs), code: code.into(), severity: Severity::Info, penalty: 0, value: round1(value) });
    }

    fn fatal(&mut self, code: &str, abs: f64) {
        if self.invalid.is_none() {
            self.invalid = Some(code.to_string());
            self.events.push(FlightEvent { t: self.since_start(abs), code: code.into(), severity: Severity::Fatal, penalty: 0, value: 0.0 });
        }
    }

    /// Simden gelen bir akış olayı (yalnızca 2024): ışınlanma, faz atlama, tekrar, kaza.
    pub fn flow(&mut self, name: &str, abs: f64) {
        if !self.started() {
            return;
        }
        match name {
            "PLANE_CRASH" => self.crash(abs),
            "TELEPORT_START" | "SKIP_START" | "BACK_ON_TRACK_START" if abs > self.grace_until => self.fatal("teleport", abs),
            _ => {}
        }
    }

    pub fn crash(&mut self, abs: f64) {
        if self.started() && !self.crashed {
            self.crashed = true;
            self.fatal("crash", abs);
        }
    }

    /// Yeni telemetri. Evre değişimlerini ve ihlalleri işler.
    pub fn update(&mut self, t: &Telemetry, now_ms: i64) {
        let abs = t.abs_time;
        let prev = self.last.clone();
        self.sim_rate_max = self.sim_rate_max.max(t.sim_rate);
        if t.crash != 0 {
            self.crash(abs);
        }

        // Hile: ışınlanma, havada slew, havada yakıt.
        if let Some(p) = &prev {
            let dt = (abs - p.abs_time).max(0.0);
            let jump = distance_nm(p.lat, p.lon, t.lat, t.lon);
            let possible = (p.gs_kt.max(t.gs_kt) + 60.0) / 3600.0 * dt * 1.5 + 0.5;
            if self.started() && abs > self.grace_until && jump > possible.max(1.0) {
                self.fatal("teleport", abs);
            }
            if self.started() && !t.on_ground && t.slew && abs > self.grace_until {
                self.fatal("slew", abs);
            }
            if self.airborne_ever() && !t.on_ground && t.fuel_lb > p.fuel_lb * 1.02 + 2.0 && abs > self.grace_until {
                self.fatal("refuel_airborne", abs);
            }
            if self.started() && dt < 30.0 {
                self.flown_nm += jump;
            }
        }

        match self.phase {
            Phase::Preflight => {
                if t.on_ground && (t.gs_kt > 3.0 || (t.engines_on && !t.parking_brake)) {
                    self.off_block = Some(abs);
                    self.fuel_start_lb = t.fuel_lb;
                    self.real_start_ms = now_ms;
                    self.phase = Phase::TaxiOut;
                } else if !t.on_ground && t.agl_ft > 50.0 {
                    // Havada başlayan uçuş kariyerde sayılmaz (uçuş yerde başlamalı).
                    self.off_block = Some(abs);
                    self.fatal("airborne_start", abs);
                }
            }
            Phase::TaxiOut | Phase::TaxiIn | Phase::Rollout => {
                if t.on_ground && t.gs_kt > 30.0 && !t.on_runway && self.class != Some(Class::Helicopter) {
                    self.hit("taxi_speed", abs, t.gs_kt);
                }
            }
            _ => {}
        }

        // Yer/hava geçişleri.
        if t.on_ground {
            self.air_since = None;
            if self.ground_since.is_none() {
                self.ground_since = Some(abs);
                if matches!(self.phase, Phase::Takeoff | Phase::Climb | Phase::Cruise | Phase::Descent | Phase::Approach) {
                    self.begin_landing(t, abs);
                }
            }
        } else {
            self.ground_since = None;
            if self.air_since.is_none() {
                self.air_since = Some(abs);
            }
            let airborne_for = abs - self.air_since.unwrap_or(abs);
            match self.phase {
                Phase::TaxiOut | Phase::Preflight if self.started() && t.agl_ft > 15.0 && airborne_for >= 2.0 => {
                    self.takeoff = Some(abs);
                    self.fuel_takeoff_lb = t.fuel_lb;
                    self.weight_takeoff_lb = t.total_lb;
                    self.phase = Phase::Takeoff;
                    self.note("takeoff", abs, t.ias_kt);
                }
                Phase::Rollout | Phase::TaxiIn if t.agl_ft > 5.0 => {
                    // Sekme: inişten kısa süre sonra yeniden havada.
                    if let Some(td) = self.pending_landing {
                        if abs - td < 15.0 {
                            if let Some(l) = self.landings.last_mut() {
                                l.bounces += 1;
                            }
                            self.hit("bounce", abs, 0.0);
                        }
                    }
                    if airborne_for > 10.0 && t.agl_ft > 100.0 {
                        // Dokun-kalk ya da pas geçme: uçuş sürüyor.
                        self.phase = Phase::Climb;
                        self.pending_landing = None;
                        self.note("go_around", abs, t.agl_ft);
                    }
                }
                _ => {}
            }
        }

        // Havada: evre ve ihlaller.
        if !t.on_ground && self.takeoff.is_some() {
            self.max_alt_ft = self.max_alt_ft.max(t.alt_ft);
            let dist_to = distance_nm(t.lat, t.lon, self.to.lat, self.to.lon);
            self.phase = match self.phase {
                Phase::Rollout | Phase::TaxiIn | Phase::Parked => self.phase,
                _ if t.agl_ft < 3000.0 && dist_to < 15.0 && t.vs_fpm < 300.0 => Phase::Approach,
                _ if t.vs_fpm > 400.0 => Phase::Climb,
                _ if t.vs_fpm < -400.0 => Phase::Descent,
                Phase::Takeoff if t.agl_ft < 1000.0 => Phase::Takeoff,
                _ => Phase::Cruise,
            };
            let jet = matches!(self.class, Some(c) if !matches!(c, Class::LightPiston | Class::PistonTwin | Class::Helicopter | Class::TurbopropSingle));
            if t.overspeed {
                self.hit("overspeed", abs, t.ias_kt);
            }
            if t.stall && t.agl_ft > 150.0 {
                self.hit("stall", abs, t.ias_kt);
            }
            if t.flap_overspeed {
                self.hit("flap_overspeed", abs, t.ias_kt);
            }
            if t.bank.abs() > if jet { 35.0 } else { 45.0 } && self.class != Some(Class::Helicopter) {
                self.hit("bank", abs, t.bank.abs());
            }
            if (t.pitch > 25.0 || t.pitch < -15.0) && self.class != Some(Class::Helicopter) {
                self.hit("pitch", abs, t.pitch);
            }
            if t.g > 2.5 || t.g < -1.0 {
                self.hit("g_limit", abs, t.g);
            }
            if jet && t.alt_ft < 10_000.0 && t.agl_ft > 1500.0 && t.ias_kt > 265.0 {
                self.hit("speed_10k", abs, t.ias_kt);
            }
        }

        // İniş anı G'si için kısa pencere.
        self.g_window.push((abs, t.g));
        self.g_window.retain(|(a, _)| abs - a <= 3.0);
        if let Some(td) = self.pending_landing {
            if abs - td <= 2.0 {
                let g = self.g_window.iter().filter(|(a, _)| (a - td).abs() <= 2.0).map(|(_, g)| *g).fold(0.0, f64::max);
                if let Some(l) = self.landings.last_mut() {
                    l.g = round2(l.g.max(g));
                }
            }
        }

        // Yerde: yavaşlama, park.
        if t.on_ground {
            match self.phase {
                Phase::Rollout if t.gs_kt < 35.0 => self.phase = Phase::TaxiIn,
                Phase::TaxiIn | Phase::Rollout | Phase::Parked if t.gs_kt < 1.0 && (t.parking_brake || !t.engines_on) => {
                    if self.parked_since.is_none() {
                        self.parked_since = Some(abs);
                    }
                    if abs - self.parked_since.unwrap_or(abs) >= 3.0 && self.phase != Phase::Parked {
                        self.phase = Phase::Parked;
                        self.on_block = Some(abs);
                        self.fuel_end_lb = t.fuel_lb;
                        self.real_end_ms = now_ms;
                    }
                }
                Phase::Parked if t.gs_kt > 3.0 => {
                    // Yeniden hareket etti: park sayılmaz.
                    self.phase = Phase::TaxiIn;
                    self.parked_since = None;
                    self.on_block = None;
                }
                _ => {}
            }
            if t.gs_kt >= 1.0 {
                self.parked_since = None;
            }
        }

        if self.started() && (abs - self.last_track >= 15.0 || self.track.is_empty()) {
            self.last_track = abs;
            self.track.push([t.lat as f32, t.lon as f32, t.alt_ft as f32, t.gs_kt as f32]);
        }
        self.last = Some(t.clone());
    }

    fn begin_landing(&mut self, t: &Telemetry, abs: f64) {
        // Simin kendi temas ölçümü varsa o; yoksa son örneğin dikey hızı.
        let fpm = if t.td_fps.abs() > 0.01 { t.td_fps.abs() * 60.0 } else { self.last.as_ref().map(|p| -p.vs_fpm).unwrap_or(0.0).max(0.0) };
        let (label, _) = landing_rating(self.class, fpm);
        let g = self.g_window.iter().map(|(_, g)| *g).fold(t.g, f64::max);
        self.landings.push(Landing {
            fpm: fpm.round(),
            g: round2(g),
            bank: round1(if t.td_bank.abs() > 0.0 { t.td_bank } else { t.bank }),
            pitch: round1(if t.td_pitch.abs() > 0.0 { t.td_pitch } else { t.pitch }),
            ias_kt: self.last.as_ref().map(|p| p.ias_kt.round()).unwrap_or(0.0),
            bounces: 0,
            lat: t.lat,
            lon: t.lon,
            on_runway: t.on_runway,
            label: label.to_string(),
        });
        self.touchdown = Some(abs);
        self.pending_landing = Some(abs);
        self.phase = Phase::Rollout;
        self.note("touchdown", abs, fpm.round());
    }

    /// Uçuşu kapatır ve puanlar. `fuel_burn_lb_h` düşük yakıt kuralı için (30 dk yedek).
    pub fn summary(&self) -> Summary {
        let last = self.last.clone().unwrap_or_default();
        let start = self.off_block.unwrap_or(last.abs_time);
        let end = self.on_block.unwrap_or(last.abs_time);
        let landing = self.landings.last().cloned();
        let mut score: i32 = 100;
        for e in &self.events {
            score -= e.penalty as i32;
        }
        if let Some(l) = &landing {
            score -= landing_rating(self.class, l.fpm).1 as i32;
            if l.g > 2.0 {
                score -= 10;
            } else if l.g > 1.5 {
                score -= 5;
            }
            let b = l.bank.abs();
            if b > 10.0 {
                score -= 10;
            } else if b > 6.0 {
                score -= 5;
            }
        } else {
            score -= 30;
        }
        let fuel_left = if self.fuel_end_lb > 0.0 { self.fuel_end_lb } else { last.fuel_lb };
        if let Some(c) = self.class {
            let reserve_lb = info(c).burn_kg_h * 0.5 * 2.204_62;
            if self.airborne_ever() && fuel_left < reserve_lb && !self.events.iter().any(|e| e.code == "low_fuel") {
                score -= rule("low_fuel").penalty as i32;
            }
        }
        if self.invalid.is_some() {
            score = 0;
        }
        let score = score.clamp(0, 100) as u8;
        let dist_to = distance_nm(last.lat, last.lon, self.to.lat, self.to.lon);
        Summary {
            score,
            grade: grade(score).to_string(),
            block_s: (end - start).max(0.0),
            air_s: match (self.takeoff, self.touchdown) {
                (Some(a), Some(b)) => (b - a).max(0.0),
                _ => 0.0,
            },
            real_s: ((if self.real_end_ms > 0 { self.real_end_ms } else { modstead_core::fsx::now_ms() } - self.real_start_ms) as f64 / 1000.0).max(0.0),
            fuel_used_lb: (self.fuel_start_lb - fuel_left).max(0.0),
            fuel_left_lb: fuel_left,
            flown_nm: (self.flown_nm * 10.0).round() / 10.0,
            max_alt_ft: self.max_alt_ft.round(),
            landing,
            arrived_at_destination: dist_to <= 3.0 && last.on_ground,
            distance_to_dest_nm: (dist_to * 10.0).round() / 10.0,
            invalid: self.invalid.clone(),
            crashed: self.crashed,
            sim_rate_max: self.sim_rate_max,
        }
    }

    /// Puanın dökümü (arayüzde): kural kodu → toplam kesinti.
    pub fn deductions(&self) -> Vec<(String, u32)> {
        let mut out: Vec<(String, u32)> = Vec::new();
        for e in self.events.iter().filter(|e| e.penalty > 0) {
            match out.iter_mut().find(|(c, _)| *c == e.code) {
                Some((_, v)) => *v += e.penalty as u32,
                None => out.push((e.code.clone(), e.penalty as u32)),
            }
        }
        out
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields() -> (Airfield, Airfield) {
        (Airfield { icao: "LTBA".into(), lat: 40.976, lon: 28.814 }, Airfield { icao: "LTBU".into(), lat: 41.138, lon: 27.919 })
    }

    /// Basit bir uçuş betiği: park → taksi → kalkış → seyir → yaklaşma → iniş → park.
    fn fly(tr: &mut Tracker, landing_fps: f64, extra: impl Fn(f64, &mut Telemetry)) {
        let (a, b) = fields();
        let mut t = Telemetry { lat: a.lat, lon: a.lon, on_ground: true, parking_brake: true, fuel_lb: 300.0, total_lb: 2300.0, sim_rate: 1.0, g: 1.0, ..Default::default() };
        let mut abs = 1000.0;
        let step = |tr: &mut Tracker, t: &mut Telemetry, abs: &mut f64, secs: f64| {
            *abs += secs;
            t.abs_time = *abs;
            extra(*abs, t);
            tr.update(t, (*abs * 1000.0) as i64);
        };
        step(tr, &mut t, &mut abs, 1.0);
        // Motor çalıştı, fren bırakıldı, taksi.
        t.engines_on = true;
        t.parking_brake = false;
        t.gs_kt = 12.0;
        for _ in 0..10 {
            step(tr, &mut t, &mut abs, 1.0);
        }
        // Kalkış.
        t.on_runway = true;
        t.gs_kt = 70.0;
        t.ias_kt = 70.0;
        step(tr, &mut t, &mut abs, 1.0);
        t.on_ground = false;
        t.agl_ft = 50.0;
        t.vs_fpm = 700.0;
        for _ in 0..5 {
            step(tr, &mut t, &mut abs, 1.0);
        }
        // Yol boyunca (44 nm, 110 kt): her adımda biraz ilerle.
        let n = 80;
        for i in 0..n {
            let f = (i + 1) as f64 / n as f64;
            t.lat = a.lat + (b.lat - a.lat) * f;
            t.lon = a.lon + (b.lon - a.lon) * f;
            t.gs_kt = 110.0;
            t.ias_kt = 105.0;
            t.alt_ft = if f < 0.8 { 4500.0 } else { 4500.0 * (1.0 - f) * 5.0 };
            t.agl_ft = t.alt_ft;
            t.vs_fpm = if f < 0.2 { 600.0 } else if f < 0.8 { 0.0 } else { -500.0 };
            t.fuel_lb -= 0.5;
            step(tr, &mut t, &mut abs, 18.0);
        }
        // Temas.
        t.lat = b.lat;
        t.lon = b.lon;
        t.agl_ft = 0.0;
        t.alt_ft = 0.0;
        t.vs_fpm = -landing_fps * 60.0;
        t.on_ground = true;
        t.td_fps = landing_fps;
        t.g = 1.2;
        t.gs_kt = 60.0;
        step(tr, &mut t, &mut abs, 1.0);
        t.g = 1.0;
        t.on_runway = false;
        t.gs_kt = 15.0;
        for _ in 0..5 {
            step(tr, &mut t, &mut abs, 2.0);
        }
        t.gs_kt = 0.0;
        t.parking_brake = true;
        for _ in 0..5 {
            step(tr, &mut t, &mut abs, 1.0);
        }
    }

    fn tracker() -> Tracker {
        let (a, b) = fields();
        Tracker::new("j1", a, b, Some(Class::LightPiston), 0)
    }

    #[test]
    fn clean_flight_scores_high_and_arrives() {
        let mut tr = tracker();
        fly(&mut tr, 2.0, |_, _| {});
        assert_eq!(tr.phase, Phase::Parked);
        let s = tr.summary();
        assert!(s.arrived_at_destination, "{s:?}");
        assert!(s.invalid.is_none());
        let l = s.landing.clone().unwrap();
        assert_eq!(l.fpm, 120.0);
        assert_eq!(l.label, "smooth");
        assert!(s.score >= 95, "{s:?} {:?}", tr.events);
        assert!(s.block_s > 1000.0 && s.air_s > 1000.0);
        assert!((40.0..50.0).contains(&s.flown_nm), "{}", s.flown_nm);
        assert!((s.fuel_used_lb - 40.0).abs() < 1.0, "{}", s.fuel_used_lb);
        assert!(!tr.track.is_empty());
    }

    #[test]
    fn hard_landing_and_violations_cost_points_with_caps() {
        let mut tr = tracker();
        fly(&mut tr, 9.0, |abs, t| {
            if !t.on_ground && abs > 1100.0 {
                t.overspeed = true;
            }
        });
        let s = tr.summary();
        assert_eq!(s.landing.as_ref().unwrap().label, "very_hard");
        let over: u32 = tr.events.iter().filter(|e| e.code == "overspeed").map(|e| e.penalty as u32).sum();
        assert_eq!(over, 15, "üst sınır");
        assert!(s.score <= 100 - 15 - 25);
        assert!(tr.deductions().iter().any(|(c, v)| c == "overspeed" && *v == 15));
    }

    #[test]
    fn teleport_and_slew_invalidate() {
        let mut tr = tracker();
        fly(&mut tr, 2.0, |abs, t| {
            if (1300.0..1320.0).contains(&abs) {
                t.lat += 2.0;
            }
        });
        assert_eq!(tr.summary().invalid.as_deref(), Some("teleport"));
        assert_eq!(tr.summary().score, 0);

        let mut tr = tracker();
        fly(&mut tr, 2.0, |abs, t| t.slew = !t.on_ground && (1200.0..1240.0).contains(&abs));
        assert_eq!(tr.summary().invalid.as_deref(), Some("slew"));
    }

    #[test]
    fn modstead_reposition_is_not_cheating() {
        let mut tr = tracker();
        tr.grace_until = 5000.0;
        fly(&mut tr, 2.0, |abs, t| {
            if (1300.0..1320.0).contains(&abs) {
                t.lat += 2.0;
            }
        });
        assert!(tr.summary().invalid.is_none());
    }

    #[test]
    fn refuel_in_air_and_crash() {
        let mut tr = tracker();
        fly(&mut tr, 2.0, |abs, t| {
            if (1400.0..1420.0).contains(&abs) {
                t.fuel_lb += 50.0;
            }
        });
        assert_eq!(tr.summary().invalid.as_deref(), Some("refuel_airborne"));

        let mut tr = tracker();
        fly(&mut tr, 2.0, |abs, t| {
            if abs > 1500.0 {
                t.crash = 4;
            }
        });
        let s = tr.summary();
        assert!(s.crashed);
        assert_eq!(s.invalid.as_deref(), Some("crash"));
    }

    #[test]
    fn landing_scale_depends_on_class() {
        assert_eq!(landing_rating(Some(Class::LightPiston), 350.0).0, "firm");
        // Ağır jet için 350 fpm yalnızca "iyi".
        assert_eq!(landing_rating(Some(Class::Widebody), 350.0).0, "good");
        assert_eq!(grade(96), "A+");
        assert_eq!(grade(40), "F");
    }
}
