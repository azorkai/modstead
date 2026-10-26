//! Uçuş takipçisi: simden gelen telemetriyle uçuşun evrelerini izler, inişi yakalar, ihlalleri ve hileyi not eder,
//! sonunda puanı hesaplar.
//!
//! Kurallar açıktır ve arayüzde aynı adlarla gösterilir (MSFS 2024 kariyerine yöneltilen "gizli ceza" eleştirisi):
//! her kuralın bir kodu, bir puan kesintisi ve bir üst sınırı vardır; bir kural aynı uçuşta en çok o sınır kadar
//! puan götürür. Sınırlar OnAir ve A Pilot's Life'ın yayımlanmış kurallarından uyarlandı.
//!
//! **Puan yalnızca güvenlik için düşer** (kararsız yaklaşma, düşük irtifada aşırı yatış, kuyruk sürtmesi, aşırı
//! ağırlık, aletli yetkisiz buluta girme, oksijensiz yüksek irtifa…). Prosedürler (ışıklar, kemer işareti,
//! transponder), kararlı yaklaşma, gece ve aletli iniş yalnızca **XP bonusu** verir; simin bir değişkeni
//! okunamıyorsa o madde sayılmaz (uçak onu kullanmıyor olabilir). Yolcu konforu ve hassas kargonun durumu puanı
//! değil, bahşişi ve kargo tazminatını belirler.
//!
//! Zaman simin `ABSOLUTE TIME` saatiyle ölçülür: duraklatınca durur, sim hızı artınca hızlanır.

use serde::{Deserialize, Serialize};

use super::aircraft::{Class, info};
use super::airports::{bearing_deg, distance_nm, offset};
use super::env::{Env, is_night, wind_components};
use super::flt::Runway;

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

/// İnişin pistteki yeri (varışın pist verisi simden alındıysa).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RunwayFix {
    /// Pist ucu ("24R").
    pub runway: String,
    /// Pist ucunun gerçek yönü (derece).
    pub heading: f64,
    /// Eşikten uzaklık (m); eksi değer eşikten önce demektir.
    pub distance_m: f64,
    /// Eksenden sapma (m; sağ artı).
    pub centerline_m: f64,
    pub length_m: f64,
    pub width_m: f64,
    /// Teker koyma bölgesinin sonu (m): pistin ilk 900 m'si ya da üçte biri, hangisi kısaysa.
    pub tdz_m: f64,
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
    pub night: bool,
    /// Bulutta ya da düşük görüşte (aletli koşullarda) yapılan yaklaşma.
    pub imc: bool,
    pub wind_kt: f64,
    pub wind_dir: f64,
    pub crosswind_kt: f64,
    pub headwind_kt: f64,
    pub visibility_m: f64,
    pub weight_lb: f64,
    pub overweight: bool,
    pub runway: Option<RunwayFix>,
}

/// Uçuşa özgü kurallar (takip kurulurken verilir).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct FlightRules {
    /// Pilotun aletli uçuş yetkisi var mı?
    pub ir: bool,
    /// Aletli kurallarla (IFR) planlanan uçuş.
    pub ifr: bool,
    /// Yolcu taşınıyor (konfor ölçülür).
    pub passengers: bool,
    /// Yükün özel durumu: "" | "fragile" | "livestock" | "medical" | "perishable" | "dangerous"
    pub care: String,
    /// Azami kalkış ve iniş ağırlığı (lb); 0 = bilinmiyor.
    pub mtow_lb: f64,
    pub mlw_lb: f64,
    /// Varış havalimanının yüksekliği (ft).
    pub dest_elev_ft: f64,
    /// Hava işinin hedefleri.
    pub objectives: Vec<super::missions::Objective>,
}

/// Kararlı yaklaşma kapısı (Flight Safety Foundation): varışın 1000 ft (aletli koşulda) ya da 500 ft (görerek)
/// üstünde dikey hız ≤ 1000 fpm, yatış küçük, iniş takımı açık, hız sınıfın yaklaşma bandında. Kapıdan sonra
/// 100 ft'e kadar da izlenir.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct ApproachGate {
    pub gate_ft: f64,
    pub evaluated: bool,
    pub stable: bool,
    /// "sink" | "bank" | "gear" | "speed_high" | "speed_low"
    pub reasons: Vec<String>,
    pub vs_fpm: f64,
    pub ias_kt: f64,
    pub bank: f64,
}

/// Bir prosedür maddesi: `ok` yoksa değerlendirilmedi.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Procedure {
    /// "beacon" | "nav_lights" | "strobe" | "landing_lights" | "seatbelt" | "transponder"
    pub code: String,
    pub ok: Option<bool>,
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
    Rule { code: "bank_low", penalty: 3, cap: 6, cooldown: 20.0 },
    Rule { code: "pitch", penalty: 3, cap: 9, cooldown: 20.0 },
    Rule { code: "g_limit", penalty: 5, cap: 10, cooldown: 10.0 },
    Rule { code: "speed_10k", penalty: 5, cap: 10, cooldown: 60.0 },
    Rule { code: "taxi_speed", penalty: 2, cap: 6, cooldown: 30.0 },
    Rule { code: "bounce", penalty: 4, cap: 12, cooldown: 0.0 },
    Rule { code: "low_fuel", penalty: 5, cap: 5, cooldown: 0.0 },
    Rule { code: "unstable_approach", penalty: 5, cap: 5, cooldown: 0.0 },
    Rule { code: "tail_strike", penalty: 10, cap: 10, cooldown: 30.0 },
    Rule { code: "long_landing", penalty: 3, cap: 3, cooldown: 0.0 },
    Rule { code: "short_landing", penalty: 8, cap: 8, cooldown: 0.0 },
    Rule { code: "off_centerline", penalty: 2, cap: 2, cooldown: 0.0 },
    Rule { code: "overweight_takeoff", penalty: 5, cap: 5, cooldown: 0.0 },
    Rule { code: "overweight_landing", penalty: 5, cap: 5, cooldown: 0.0 },
    Rule { code: "vfr_imc", penalty: 10, cap: 10, cooldown: 300.0 },
    Rule { code: "oxygen", penalty: 5, cap: 10, cooldown: 600.0 },
];

fn rule(code: &str) -> &'static Rule {
    RULES.iter().find(|r| r.code == code).expect("tanımlı kural")
}

/// Kuralın kesintisi ve üst sınırı (arayüzdeki kural listesi için).
pub fn rules_table() -> Vec<(&'static str, u8, u8)> {
    RULES.iter().map(|r| (r.code, r.penalty, r.cap)).collect()
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
    pub rules: FlightRules,
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
    /// Varış havalimanının pistleri (simden; iniş noktası ve eksen sapması için).
    pub dest_runways: Vec<Runway>,
    /// Son ortam değerleri ve uçuş boyunca görülenler.
    pub env: Option<Env>,
    pub seen_lights: bool,
    pub seen_seatbelt: bool,
    pub seen_transponder: bool,
    /// Kabin basınçlandırılmış mı (yüksekte kabin irtifasından anlaşılır)?
    pub pressurized: Option<bool>,
    /// Havada gece ve aletli koşullarda geçen süre (sim sn).
    pub night_s: f64,
    pub imc_s: f64,
    /// Bu yaklaşmada aletli koşullara girildi mi (aletli yaklaşma sayılır)?
    imc_on_approach: bool,
    pub approach: Option<ApproachGate>,
    /// Kararsız yaklaşmadan pas geçildi (doğru karar).
    pub go_around_unstable: bool,
    pub procedures: Vec<Procedure>,
    /// Yolcu konforu (100'den başlar) ve kod → toplam kayıp.
    #[serde(default = "full")]
    pub comfort: f64,
    pub comfort_hits: Vec<(String, f64)>,
    /// Hassas yükün hasarı (%).
    pub cargo_damage: f64,
    /// Hedeflerde geçen süre (sn) ve tamamlananlar.
    pub objective_s: Vec<f64>,
    pub objective_done: Vec<bool>,
    /// Kuralların son tetiklenme zamanı (kod → sim saati).
    last_hit: Vec<(String, f64)>,
    air_since: Option<f64>,
    ground_since: Option<f64>,
    parked_since: Option<f64>,
    last_track: f64,
    g_window: Vec<(f64, f64)>,
    pending_landing: Option<f64>,
    taxi_fast_since: Option<f64>,
    imc_since: Option<f64>,
    high_since: Option<f64>,
    below_gate: bool,
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
    pub night_s: f64,
    pub imc_s: f64,
    /// Kararlı yaklaşma (değerlendirildiyse).
    pub stable_approach: Option<bool>,
    pub approach: Option<ApproachGate>,
    /// Aletli yaklaşma sayısı (IFR yeterliliği için).
    pub instrument_approaches: u32,
    pub procedures: Vec<Procedure>,
    /// Yolcu konforu (yolcu taşındıysa).
    pub comfort: Option<u8>,
    pub cargo_damage: f64,
    /// XP bonusları (kod → yüzde) ve toplamı.
    pub bonuses: Vec<(String, u8)>,
    pub bonus_pct: u8,
    /// Hava işinin tamamlanan ve toplam hedefleri.
    pub objectives_done: u32,
    pub objectives_total: u32,
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

/// Yaklaşma hızı bandı (kt, gösterge): sınıfın tipik Vref'i −5 ile +30 arası. Helikopterde yok.
pub fn approach_band(c: Class) -> Option<(f64, f64)> {
    let vref = match c {
        Class::LightPiston => 65.0,
        Class::PistonTwin => 90.0,
        Class::TurbopropSingle => 85.0,
        Class::TurbopropTwin => 105.0,
        Class::RegionalTurboprop => 110.0,
        Class::Bizjet => 115.0,
        Class::RegionalJet => 130.0,
        Class::Narrowbody => 135.0,
        Class::Widebody => 145.0,
        Class::Helicopter => return None,
    };
    Some((vref - 15.0, vref + 35.0))
}

/// Kuyruk sürtme yunuslama sınırı (derece; yalnızca jet yolcu uçakları: A320 11,7°, 737-800 11°).
pub fn tail_strike_pitch(c: Class) -> Option<f64> {
    match c {
        Class::RegionalJet => Some(10.5),
        Class::Narrowbody => Some(11.0),
        Class::Widebody => Some(10.0),
        _ => None,
    }
}

fn jet(c: Option<Class>) -> bool {
    matches!(c, Some(c) if !matches!(c, Class::LightPiston | Class::PistonTwin | Class::Helicopter | Class::TurbopropSingle))
}

/// Pistlerden, iniş noktasına ve yöne en uyanını bulur; eşikten uzaklık ve eksen sapması.
pub fn runway_fix(runways: &[Runway], lat: f64, lon: f64, heading: f64) -> Option<RunwayFix> {
    let mut best: Option<(f64, RunwayFix)> = None;
    for r in runways.iter().filter(|r| r.length_m > 0.0) {
        for (number, designator, dir) in [(r.primary_number, r.primary_designator, r.heading as f64), (r.secondary_number, r.secondary_designator, (r.heading as f64 + 180.0) % 360.0)] {
            if number <= 0 {
                continue;
            }
            let diff = ((heading - dir + 540.0) % 360.0 - 180.0).abs();
            if diff > 35.0 {
                continue;
            }
            // Eşik: merkezden iniş yönünün tersine yarım pist.
            let half = r.length_m as f64 / 2.0;
            let back = (dir + 180.0).to_radians();
            let (tlat, tlon) = offset(r.lat, r.lon, half * back.sin(), half * back.cos());
            let d = distance_nm(tlat, tlon, lat, lon) * 1852.0;
            let brg = bearing_deg(tlat, tlon, lat, lon);
            let rel = (brg - dir).to_radians();
            let along = d * rel.cos();
            let cross = d * rel.sin();
            let width = if r.width_m > 0.0 { r.width_m as f64 } else { 30.0 };
            if cross.abs() > width.max(60.0) * 1.5 || along < -400.0 || along > r.length_m as f64 + 200.0 {
                continue;
            }
            let name = {
                let letter = match designator {
                    1 => "L",
                    2 => "R",
                    3 => "C",
                    _ => "",
                };
                format!("{number:02}{letter}")
            };
            let fix = RunwayFix {
                runway: name,
                heading: dir,
                distance_m: along.round(),
                centerline_m: (cross * 10.0).round() / 10.0,
                length_m: r.length_m as f64,
                width_m: width,
                tdz_m: (r.length_m as f64 / 3.0).min(900.0),
            };
            let cost = cross.abs() + diff * 10.0;
            if best.as_ref().is_none_or(|(c, _)| cost < *c) {
                best = Some((cost, fix));
            }
        }
    }
    best.map(|(_, f)| f)
}

const PROCEDURES: [&str; 6] = ["beacon", "nav_lights", "strobe", "landing_lights", "seatbelt", "transponder"];

impl Tracker {
    pub fn new(job_id: &str, from: Airfield, to: Airfield, class: Option<Class>, now_ms: i64) -> Self {
        Tracker {
            job_id: job_id.to_string(),
            from,
            to,
            class,
            real_start_ms: now_ms,
            comfort: 100.0,
            procedures: PROCEDURES.iter().map(|c| Procedure { code: c.to_string(), ok: None }).collect(),
            ..Default::default()
        }
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
        let severity = if r.penalty >= 8 { Severity::Major } else { Severity::Minor };
        self.events.push(FlightEvent { t: self.since_start(abs), code: code.into(), severity, penalty, value: round1(value) });
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

    /// Konfor kaybı: kod başına bekleme süresi ve üst sınırla.
    fn discomfort(&mut self, code: &str, abs: f64, amount: f64, cooldown: f64, cap: f64) {
        if !self.rules.passengers {
            return;
        }
        let key = format!("c:{code}");
        if let Some((_, at)) = self.last_hit.iter().find(|(c, _)| *c == key) {
            if abs - at < cooldown {
                return;
            }
        }
        self.last_hit.retain(|(c, _)| *c != key);
        self.last_hit.push((key, abs));
        let used: f64 = self.comfort_hits.iter().filter(|(c, _)| c == code).map(|(_, v)| *v).sum();
        let take = amount.min((cap - used).max(0.0));
        if take <= 0.0 {
            return;
        }
        match self.comfort_hits.iter_mut().find(|(c, _)| c == code) {
            Some((_, v)) => *v += take,
            None => self.comfort_hits.push((code.to_string(), take)),
        }
        self.comfort = (self.comfort - take).max(0.0);
    }

    /// Hassas yüke zarar (kırılacak eşya, canlı hayvan, tıbbi malzeme).
    fn cargo_hit(&mut self, pct: f64) {
        if matches!(self.rules.care.as_str(), "fragile" | "livestock" | "medical") {
            self.cargo_damage = (self.cargo_damage + pct).min(100.0);
        }
    }

    fn proc(&mut self, code: &str, ok: bool) {
        if let Some(p) = self.procedures.iter_mut().find(|p| p.code == code) {
            p.ok = Some(p.ok.unwrap_or(true) && ok);
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

    /// Simden saniyede bir gelen ortam değerleri.
    pub fn set_env(&mut self, e: Env) {
        if e.light_beacon || e.light_landing || e.light_nav || e.light_strobe || e.light_taxi {
            self.seen_lights = true;
        }
        if e.seatbelt_sign {
            self.seen_seatbelt = true;
        }
        self.env = Some(e);
    }

    fn night_now(&self, t: &Telemetry) -> bool {
        self.env.as_ref().and_then(|e| e.unix_time()).is_some_and(|u| is_night(t.lat, t.lon, u))
    }

    /// Yeni telemetri. Evre değişimlerini ve ihlalleri işler.
    pub fn update(&mut self, t: &Telemetry, now_ms: i64) {
        let abs = t.abs_time;
        let prev = self.last.clone();
        let dt = prev.as_ref().map(|p| (abs - p.abs_time).clamp(0.0, 30.0)).unwrap_or(0.0);
        self.sim_rate_max = self.sim_rate_max.max(t.sim_rate);
        if t.crash != 0 {
            self.crash(abs);
        }
        let env = self.env.clone();

        // Hile: ışınlanma, havada slew, havada yakıt.
        if let Some(p) = &prev {
            let jump = distance_nm(p.lat, p.lon, t.lat, t.lon);
            // Işınlanma: iki örnek arasındaki gerçek süreyle (sınırsız) mümkün olandan uzun sıçrama.
            let dt_raw = (abs - p.abs_time).max(0.0);
            let possible = (p.gs_kt.max(t.gs_kt) + 60.0) / 3600.0 * dt_raw * 1.5 + 0.5;
            if self.started() && abs > self.grace_until && jump > possible.max(1.0) {
                self.fatal("teleport", abs);
            }
            if self.started() && !t.on_ground && t.slew && abs > self.grace_until {
                self.fatal("slew", abs);
            }
            if self.airborne_ever() && !t.on_ground && t.fuel_lb > p.fuel_lb * 1.02 + 2.0 && abs > self.grace_until {
                self.fatal("refuel_airborne", abs);
            }
            if self.started() && dt_raw < 30.0 {
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
                    if let Some(e) = &env {
                        self.proc("beacon", e.light_beacon);
                        if self.night_now(t) {
                            self.proc("nav_lights", e.light_nav);
                        }
                    }
                } else if !t.on_ground && t.agl_ft > 50.0 {
                    // Havada başlayan uçuş kariyerde sayılmaz (uçuş yerde başlamalı).
                    self.off_block = Some(abs);
                    self.fatal("airborne_start", abs);
                }
            }
            Phase::TaxiOut | Phase::TaxiIn | Phase::Rollout => {
                // Yerde 30 kt üstü: 3 saniye sürerse (anlık sıçramalar cezalandırılmaz).
                if t.on_ground && t.gs_kt > 30.0 && !t.on_runway && self.class != Some(Class::Helicopter) {
                    let since = *self.taxi_fast_since.get_or_insert(abs);
                    if abs - since >= 3.0 {
                        self.hit("taxi_speed", abs, t.gs_kt);
                        self.discomfort("taxi", abs, 2.0, 30.0, 6.0);
                    }
                } else {
                    self.taxi_fast_since = None;
                }
                // Kalkış koşusu: çakarlar ve iniş ışıkları.
                if self.phase == Phase::TaxiOut && t.on_runway && t.gs_kt > 40.0 {
                    if let Some(e) = &env {
                        self.proc("strobe", e.light_strobe);
                        self.proc("landing_lights", e.light_landing);
                        if self.seen_seatbelt {
                            self.proc("seatbelt", e.seatbelt_sign);
                        }
                    }
                }
            }
            _ => {}
        }

        // Kuyruk sürtmesi: yerde, hızlıyken burun sınırın üstünde (dönüşte ya da inişte).
        if let Some(limit) = self.class.and_then(tail_strike_pitch) {
            if self.started() && t.on_ground && t.gs_kt > 40.0 && t.pitch > limit {
                self.hit("tail_strike", abs, t.pitch);
            }
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
                    if self.rules.mtow_lb > 0.0 && t.total_lb > self.rules.mtow_lb * 1.005 {
                        self.hit("overweight_takeoff", abs, t.total_lb - self.rules.mtow_lb);
                    }
                }
                Phase::Rollout | Phase::TaxiIn if t.agl_ft > 5.0 => {
                    // Sekme: inişten kısa süre sonra yeniden havada.
                    if let Some(td) = self.pending_landing {
                        if abs - td < 15.0 {
                            if let Some(l) = self.landings.last_mut() {
                                l.bounces += 1;
                            }
                            self.hit("bounce", abs, 0.0);
                            self.discomfort("bounce", abs, 5.0, 2.0, 15.0);
                        }
                    }
                    if airborne_for > 10.0 && t.agl_ft > 100.0 {
                        // Dokun-kalk ya da pas geçme: uçuş sürüyor.
                        self.phase = Phase::Climb;
                        self.pending_landing = None;
                        self.note("go_around", abs, t.agl_ft);
                        self.approach = None;
                        self.below_gate = false;
                    }
                }
                _ => {}
            }
        }

        // Havada: evre, ihlaller, gece/aletli süre, konfor.
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
            let heli = self.class == Some(Class::Helicopter);
            if t.overspeed {
                self.hit("overspeed", abs, t.ias_kt);
            }
            if t.stall && t.agl_ft > 150.0 {
                self.hit("stall", abs, t.ias_kt);
            }
            if t.flap_overspeed {
                self.hit("flap_overspeed", abs, t.ias_kt);
            }
            if t.bank.abs() > if jet(self.class) { 35.0 } else { 45.0 } && !heli {
                self.hit("bank", abs, t.bank.abs());
            } else if t.bank.abs() > 30.0 && t.agl_ft < 1000.0 && t.agl_ft > 50.0 && !heli {
                // Yere yakınken 30°'nin üstünde yatış (FDM olayı).
                self.hit("bank_low", abs, t.bank.abs());
            }
            if (t.pitch > 25.0 || t.pitch < -15.0) && !heli {
                self.hit("pitch", abs, t.pitch);
            }
            if t.g > 2.5 || t.g < -1.0 {
                self.hit("g_limit", abs, t.g);
            }
            if jet(self.class) && t.alt_ft < 10_000.0 && t.agl_ft > 1500.0 && t.ias_kt > 265.0 {
                self.hit("speed_10k", abs, t.ias_kt);
            }

            // Gece ve aletli koşul süresi; aletli yetkisiz pilot için buluta girme.
            if self.night_now(t) {
                self.night_s += dt;
            }
            if let Some(e) = &env {
                if e.imc() {
                    self.imc_s += dt;
                    if self.phase == Phase::Approach {
                        self.imc_on_approach = true;
                    }
                    let since = *self.imc_since.get_or_insert(abs);
                    if !self.rules.ir && abs - since >= 30.0 {
                        self.hit("vfr_imc", abs, e.visibility_m);
                    }
                } else {
                    self.imc_since = None;
                }
                // Basınçlandırma: yüksekte kabin irtifası uçağınkinden belirgin düşükse kabin basınçlıdır.
                if e.cabin_alt_ft > 0.0 && t.alt_ft > 10_000.0 && self.pressurized.is_none() {
                    self.pressurized = Some(e.cabin_alt_ft < t.alt_ft - 2000.0);
                }
                if e.transponder > 0 {
                    self.seen_transponder = true;
                    if t.agl_ft > 1500.0 {
                        self.proc("transponder", e.transponder >= 3);
                    }
                }
                // Basınçlı kabinde 10.000 ft üstü kabin irtifası yolcuyu rahatsız eder.
                if self.pressurized == Some(true) && e.cabin_alt_ft > 10_000.0 {
                    self.discomfort("cabin_altitude", abs, 5.0, 60.0, 20.0);
                }
            }
            // Oksijen (FAA 91.211): basınçsız kabinde 12.500 ft üstü 30 dakikadan uzun ya da 15.000 ft üstü.
            let unpressurized = match self.pressurized {
                Some(p) => !p,
                None => matches!(self.class, Some(Class::LightPiston | Class::PistonTwin | Class::Helicopter)),
            };
            if unpressurized && t.alt_ft > 12_500.0 {
                let since = *self.high_since.get_or_insert(abs);
                if t.alt_ft > 15_000.0 && abs - since > 60.0 || abs - since > 1800.0 {
                    self.hit("oxygen", abs, t.alt_ft);
                    self.discomfort("cabin_altitude", abs, 5.0, 300.0, 20.0);
                }
            } else {
                self.high_since = None;
            }

            // Yolcu konforu ve hassas yük: sert manevra, ani G, hızlı alçalma.
            if t.bank.abs() > 30.0 && !heli {
                self.discomfort("bank", abs, 2.0, 5.0, 20.0);
            }
            let rough = t.g > 1.5 || t.g < 0.6;
            if rough {
                let belt_off = self.seen_seatbelt && env.as_ref().is_some_and(|e| !e.seatbelt_sign);
                self.discomfort("g", abs, if belt_off { 6.0 } else { 3.0 }, 5.0, 30.0);
                if t.g > 1.8 || t.g < 0.4 {
                    self.cargo_hit(10.0);
                }
            }
            let sink_limit = if jet(self.class) { -3000.0 } else { -1500.0 };
            if t.vs_fpm < sink_limit && self.pressurized != Some(true) {
                self.discomfort("descent_rate", abs, 3.0, 20.0, 15.0);
            }

            // Hava işinin hedefleri: koşullar sağlandıkça süre birikir.
            self.objectives(t, abs, dt);

            // Kararlı yaklaşma kapısı.
            self.approach_gate(t, abs, dist_to);
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

    fn objectives(&mut self, t: &Telemetry, abs: f64, dt: f64) {
        let n = self.rules.objectives.len();
        if n == 0 {
            return;
        }
        self.objective_s.resize(n, 0.0);
        self.objective_done.resize(n, false);
        for i in 0..n {
            if self.objective_done[i] {
                continue;
            }
            let o = &self.rules.objectives[i];
            if o.satisfied(t.lat, t.lon, t.alt_ft, t.agl_ft, t.ias_kt) {
                self.objective_s[i] += dt;
                if self.objective_s[i] >= o.hold_s {
                    self.objective_done[i] = true;
                    self.note("objective", abs, i as f64 + 1.0);
                }
            } else if o.hold_s > 0.0 {
                // Koşul bozulunca süre baştan (atlayış koşusu ve arama kesintisiz olmalı).
                self.objective_s[i] = 0.0;
            }
        }
    }

    /// Kapı yüksekliğine inilince yaklaşmanın kararlılığını değerlendirir; kapıdan 100 ft'e kadar izler.
    fn approach_gate(&mut self, t: &Telemetry, abs: f64, dist_to: f64) {
        let Some(class) = self.class else { return };
        if class == Class::Helicopter || dist_to > 12.0 {
            return;
        }
        let imc = self.env.as_ref().map(|e| e.imc()).unwrap_or(self.rules.ifr);
        let height = t.alt_ft - self.rules.dest_elev_ft;
        let gate = if imc { 1000.0 } else { 500.0 };
        let gear_needed = self.env.as_ref().is_some_and(|e| e.gear_retractable);
        if self.approach.is_none() && height <= gate && t.vs_fpm < 0.0 && self.last.as_ref().is_some_and(|p| p.alt_ft - self.rules.dest_elev_ft > gate) {
            let mut reasons = Vec::new();
            if t.vs_fpm < -1100.0 {
                reasons.push("sink".to_string());
            }
            if t.bank.abs() > 20.0 {
                reasons.push("bank".to_string());
            }
            if gear_needed && !t.gear_down {
                reasons.push("gear".to_string());
            }
            if let Some((lo, hi)) = approach_band(class) {
                if t.ias_kt > hi {
                    reasons.push("speed_high".to_string());
                } else if t.ias_kt < lo {
                    reasons.push("speed_low".to_string());
                }
            }
            let stable = reasons.is_empty();
            self.approach = Some(ApproachGate { gate_ft: gate, evaluated: true, stable, reasons, vs_fpm: t.vs_fpm.round(), ias_kt: t.ias_kt.round(), bank: round1(t.bank) });
            self.below_gate = true;
            self.note(if stable { "approach_stable" } else { "approach_unstable" }, abs, t.vs_fpm);
            if let Some(e) = self.env.clone() {
                self.proc("landing_lights", e.light_landing);
                if self.seen_seatbelt {
                    self.proc("seatbelt", e.seatbelt_sign);
                }
            }
            return;
        }
        // Kapının altında: 100 ft'e kadar kararlılık sürmeli.
        if let Some(a) = self.approach.as_mut() {
            if height > 100.0 && height <= a.gate_ft && a.stable {
                let mut why = None;
                if t.vs_fpm < -1300.0 {
                    why = Some("sink");
                } else if t.bank.abs() > 25.0 {
                    why = Some("bank");
                } else if gear_needed && !t.gear_down && height < 300.0 {
                    why = Some("gear");
                }
                if let Some(w) = why {
                    a.stable = false;
                    a.reasons.push(w.to_string());
                }
            }
            // Kapının üstüne geri tırmandı: pas geçme.
            if height > a.gate_ft + 300.0 && t.vs_fpm > 300.0 {
                let unstable = !a.stable;
                self.approach = None;
                self.below_gate = false;
                self.imc_on_approach = false;
                if unstable {
                    self.go_around_unstable = true;
                }
                self.note("go_around", abs, height);
            }
        }
    }

    fn begin_landing(&mut self, t: &Telemetry, abs: f64) {
        // Simin kendi temas ölçümü varsa o; yoksa son örneğin dikey hızı.
        let fpm = if t.td_fps.abs() > 0.01 { t.td_fps.abs() * 60.0 } else { self.last.as_ref().map(|p| -p.vs_fpm).unwrap_or(0.0).max(0.0) };
        let (label, _) = landing_rating(self.class, fpm);
        let g = self.g_window.iter().map(|(_, g)| *g).fold(t.g, f64::max);
        let near_dest = distance_nm(t.lat, t.lon, self.to.lat, self.to.lon) <= 3.0;
        let fix = if near_dest { runway_fix(&self.dest_runways, t.lat, t.lon, t.heading) } else { None };
        let env = self.env.clone().unwrap_or_default();
        let heading = fix.as_ref().map(|f| f.heading).unwrap_or(t.heading);
        let (head, cross) = if env.wind_kt > 0.0 { wind_components(env.wind_dir, env.wind_kt, heading) } else { (0.0, 0.0) };
        let night = self.night_now(t);
        let pitch = if t.td_pitch.abs() > 0.0 { t.td_pitch } else { t.pitch };
        let overweight = self.rules.mlw_lb > 0.0 && t.total_lb > self.rules.mlw_lb * 1.005;
        self.landings.push(Landing {
            fpm: fpm.round(),
            g: round2(g),
            bank: round1(if t.td_bank.abs() > 0.0 { t.td_bank } else { t.bank }),
            pitch: round1(pitch),
            ias_kt: self.last.as_ref().map(|p| p.ias_kt.round()).unwrap_or(0.0),
            bounces: 0,
            lat: t.lat,
            lon: t.lon,
            on_runway: t.on_runway,
            label: label.to_string(),
            night,
            imc: self.imc_on_approach || env.imc(),
            wind_kt: env.wind_kt.round(),
            wind_dir: env.wind_dir.round(),
            crosswind_kt: cross.round(),
            headwind_kt: head.round(),
            visibility_m: env.visibility_m.round(),
            weight_lb: t.total_lb.round(),
            overweight,
            runway: fix.clone(),
        });
        self.touchdown = Some(abs);
        self.pending_landing = Some(abs);
        self.phase = Phase::Rollout;
        self.note("touchdown", abs, fpm.round());

        if self.approach.as_ref().is_some_and(|a| a.evaluated && !a.stable) {
            self.hit("unstable_approach", abs, self.approach.as_ref().map(|a| a.vs_fpm).unwrap_or(0.0));
        }
        if let Some(limit) = self.class.and_then(tail_strike_pitch) {
            if pitch > limit {
                self.hit("tail_strike", abs, pitch);
            }
        }
        if overweight {
            self.hit("overweight_landing", abs, t.total_lb - self.rules.mlw_lb);
        }
        if let Some(f) = &fix {
            if f.distance_m < -5.0 {
                self.hit("short_landing", abs, f.distance_m);
            } else if f.distance_m > f.tdz_m + 150.0 {
                self.hit("long_landing", abs, f.distance_m);
            }
            if f.centerline_m.abs() > (f.width_m / 2.0 - 4.0).max(5.0) {
                self.hit("off_centerline", abs, f.centerline_m);
            }
        }
        // Konfor ve hassas yük: sert iniş.
        match label {
            "firm" => {
                self.discomfort("landing", abs, 5.0, 0.0, 25.0);
                self.cargo_hit(10.0);
            }
            "hard" => {
                self.discomfort("landing", abs, 15.0, 0.0, 25.0);
                self.cargo_hit(25.0);
            }
            "very_hard" => {
                self.discomfort("landing", abs, 25.0, 0.0, 25.0);
                self.cargo_hit(45.0);
            }
            _ => {}
        }
    }

    /// Uçuşu kapatır ve puanlar.
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
            // Son yedek: pistonlu 45, türbin 30, helikopter 20 dakika.
            let reserve_lb = super::dispatch::final_reserve_kg(c) * 2.204_62;
            if self.airborne_ever() && fuel_left < reserve_lb && !self.events.iter().any(|e| e.code == "low_fuel") {
                score -= rule("low_fuel").penalty as i32;
            }
        }
        if self.invalid.is_some() {
            score = 0;
        }
        let score = score.clamp(0, 100) as u8;
        let dist_to = distance_nm(last.lat, last.lon, self.to.lat, self.to.lon);
        let arrived = dist_to <= 3.0 && last.on_ground;

        // Prosedürler: yalnızca simin değişkenini okuyabildiklerimiz sayılır.
        let procedures: Vec<Procedure> = self
            .procedures
            .iter()
            .filter(|p| p.ok.is_some())
            .filter(|p| match p.code.as_str() {
                "seatbelt" => self.seen_seatbelt,
                "transponder" => self.seen_transponder,
                _ => self.seen_lights,
            })
            .cloned()
            .collect();
        let stable_approach = self.approach.as_ref().filter(|a| a.evaluated).map(|a| a.stable);
        let comfort = (self.rules.passengers && self.airborne_ever()).then(|| self.comfort.round().clamp(0.0, 100.0) as u8);

        // XP bonusları (OnAir'in "prosedür bonusu" ilkesi): yalnızca geçerli ve hedefe varan uçuşta.
        let mut bonuses: Vec<(String, u8)> = Vec::new();
        if self.invalid.is_none() && arrived && landing.is_some() {
            let passed = procedures.iter().filter(|p| p.ok == Some(true)).count() as u8;
            if passed > 0 {
                bonuses.push(("procedures".into(), passed));
            }
            if stable_approach == Some(true) {
                bonuses.push(("stable_approach".into(), 5));
            }
            if self.go_around_unstable {
                bonuses.push(("go_around".into(), 3));
            }
            if let Some(l) = &landing {
                if l.night {
                    bonuses.push(("night_landing".into(), 3));
                }
                if l.imc {
                    bonuses.push(("imc_landing".into(), 5));
                }
                if l.crosswind_kt >= 15.0 {
                    bonuses.push(("crosswind".into(), 3));
                }
            }
            if comfort.is_some_and(|c| c >= 90) {
                bonuses.push(("comfort".into(), 3));
            }
        }
        let bonus_pct = bonuses.iter().map(|(_, v)| *v as u32).sum::<u32>().min(20) as u8;
        // Hedefe aletli yaklaşma: aletli koşulda ya da IFR planlı uçuşta, aletli yetkili pilotla.
        let instrument_approaches = u32::from(arrived && self.rules.ir && landing.as_ref().is_some_and(|l| l.imc || self.rules.ifr));

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
            arrived_at_destination: arrived,
            distance_to_dest_nm: (dist_to * 10.0).round() / 10.0,
            invalid: self.invalid.clone(),
            crashed: self.crashed,
            sim_rate_max: self.sim_rate_max,
            night_s: self.night_s.round(),
            imc_s: self.imc_s.round(),
            stable_approach,
            approach: self.approach.clone(),
            instrument_approaches,
            procedures,
            comfort,
            cargo_damage: self.cargo_damage.round(),
            bonuses,
            bonus_pct,
            objectives_done: self.objective_done.iter().filter(|d| **d).count() as u32,
            objectives_total: self.rules.objectives.len() as u32,
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

fn full() -> f64 {
    100.0
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
        let mut t = Telemetry { lat: a.lat, lon: a.lon, on_ground: true, parking_brake: true, fuel_lb: 300.0, total_lb: 2300.0, sim_rate: 1.0, g: 1.0, gear_down: true, ..Default::default() };
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
            t.ias_kt = if f < 0.8 { 105.0 } else { 75.0 };
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
        // Kapıda 500 fpm, 75 kt: kararlı yaklaşma.
        assert_eq!(s.stable_approach, Some(true), "{:?}", tr.approach);
        assert!(s.bonuses.iter().any(|(c, _)| c == "stable_approach"));
        // Ortam değeri gelmedi: prosedürler sayılmaz, yolcu yok: konfor yok.
        assert!(s.procedures.is_empty());
        assert_eq!(s.comfort, None);
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

    #[test]
    fn unstable_approach_costs_points_and_go_around_is_rewarded() {
        // Kapıda 1500 fpm alçalma: kararsız; inişte kesinti.
        let mut tr = tracker();
        fly(&mut tr, 2.0, |_, t| {
            if !t.on_ground && t.vs_fpm < 0.0 {
                t.vs_fpm = -1500.0;
            }
        });
        let s = tr.summary();
        assert_eq!(s.stable_approach, Some(false));
        assert!(s.approach.as_ref().unwrap().reasons.contains(&"sink".to_string()));
        assert!(tr.deductions().iter().any(|(c, v)| c == "unstable_approach" && *v == 5));

        // Kararsız yaklaşmadan pas geçip yeniden yaklaşma: kesinti yok, "doğru karar" bonusu.
        let mut tr = tracker();
        tr.rules.dest_elev_ft = 0.0;
        let (_, b) = fields();
        let mut t = Telemetry { lat: b.lat - 0.05, lon: b.lon, alt_ft: 700.0, agl_ft: 700.0, ias_kt: 75.0, vs_fpm: -1600.0, gs_kt: 80.0, g: 1.0, fuel_lb: 200.0, sim_rate: 1.0, gear_down: true, ..Default::default() };
        tr.off_block = Some(0.0);
        tr.takeoff = Some(10.0);
        tr.phase = Phase::Approach;
        let mut abs = 100.0;
        for (alt, vs) in [(700.0, -1600.0), (450.0, -1600.0), (300.0, -1600.0), (500.0, 900.0), (900.0, 900.0), (1200.0, 500.0)] {
            abs += 5.0;
            t.alt_ft = alt;
            t.agl_ft = alt;
            t.vs_fpm = vs;
            t.abs_time = abs;
            tr.update(&t, (abs * 1000.0) as i64);
        }
        assert!(tr.go_around_unstable, "{:?}", tr.events);
        assert!(tr.approach.is_none());
        assert!(!tr.events.iter().any(|e| e.code == "unstable_approach"));
    }

    #[test]
    fn imc_vfr_pilot_night_time_and_procedures() {
        // Aletli yetkisi olmayan pilot bulutta: kesinti. Gece: süre ve gece inişi.
        let mut tr = tracker();
        tr.rules.ir = false;
        // 2026-12-21 18:00 UTC İstanbul: gece.
        let env = Env { in_cloud: true, light_beacon: true, light_nav: true, light_strobe: true, light_landing: true, zulu_year: 2026, zulu_day: 355, zulu_s: 18.0 * 3600.0, ..Default::default() };
        tr.set_env(env);
        fly(&mut tr, 2.0, |_, _| {});
        let s = tr.summary();
        assert!(tr.deductions().iter().any(|(c, _)| c == "vfr_imc"), "{:?}", tr.events);
        assert!(s.night_s > 1000.0, "{}", s.night_s);
        assert!(s.imc_s > 1000.0);
        let l = s.landing.clone().unwrap();
        assert!(l.night && l.imc);
        // Işıklar açıktı: işaret, seyrüsefer, çakar, iniş ışıkları geçti; kemer ve transponder görülmedi.
        let ok: Vec<&str> = s.procedures.iter().filter(|p| p.ok == Some(true)).map(|p| p.code.as_str()).collect();
        assert!(ok.contains(&"beacon") && ok.contains(&"nav_lights") && ok.contains(&"strobe") && ok.contains(&"landing_lights"), "{:?}", s.procedures);
        assert!(!s.procedures.iter().any(|p| p.code == "seatbelt" || p.code == "transponder"));
        assert!(s.bonuses.iter().any(|(c, _)| c == "night_landing") && s.bonuses.iter().any(|(c, _)| c == "imc_landing"));
        assert!(s.bonus_pct <= 20);

        // Aletli yetkili pilot: kesinti yok, aletli yaklaşma sayılır.
        let mut tr = tracker();
        tr.rules.ir = true;
        tr.set_env(Env { in_cloud: true, ..Default::default() });
        fly(&mut tr, 2.0, |_, _| {});
        assert!(!tr.events.iter().any(|e| e.code == "vfr_imc"));
        assert_eq!(tr.summary().instrument_approaches, 1);
    }

    #[test]
    fn passengers_comfort_and_fragile_cargo() {
        let mut tr = tracker();
        tr.rules.passengers = true;
        fly(&mut tr, 2.0, |abs, t| {
            if !t.on_ground && (1200.0..1300.0).contains(&abs) {
                t.bank = 40.0;
                t.g = 1.7;
            }
        });
        let s = tr.summary();
        let c = s.comfort.unwrap();
        assert!(c < 90 && c > 30, "{c} {:?}", tr.comfort_hits);
        assert!(!s.bonuses.iter().any(|(b, _)| b == "comfort"));

        let mut tr = tracker();
        tr.rules.care = "fragile".into();
        fly(&mut tr, 7.0, |_, _| {});
        let s = tr.summary();
        assert_eq!(s.landing.as_ref().unwrap().label, "hard");
        assert!(s.cargo_damage >= 25.0, "{}", s.cargo_damage);
        assert_eq!(s.comfort, None);
    }

    #[test]
    fn weights_tail_strike_and_runway_position() {
        let (a, b) = fields();
        let mut tr = Tracker::new("j2", a, b.clone(), Some(Class::Narrowbody), 0);
        tr.rules.mtow_lb = 2000.0;
        tr.rules.mlw_lb = 2000.0;
        // Varış pisti: merkez varışta, 270°, 3000 m. İniş eşikten ≈ 2200 m sonra: uzun iniş.
        tr.dest_runways = vec![Runway { lat: b.lat, lon: b.lon, heading: 270.0, length_m: 3000.0, width_m: 45.0, primary_number: 27, secondary_number: 9, ..Default::default() }];
        fly(&mut tr, 2.0, |_, t| {
            t.heading = 270.0;
            if t.on_ground && t.gs_kt > 50.0 && t.td_fps > 0.0 {
                t.pitch = 12.0;
                // Merkezden 700 m batıya (eşikten 2200 m).
                t.lon = b.lon - 700.0 / (111_320.0 * b.lat.to_radians().cos());
            }
        });
        let d = tr.deductions();
        for code in ["overweight_takeoff", "overweight_landing", "tail_strike", "long_landing"] {
            assert!(d.iter().any(|(c, _)| c == code), "{code} yok: {d:?}");
        }
        let fix = tr.summary().landing.unwrap().runway.unwrap();
        assert_eq!(fix.runway, "27");
        assert!((fix.distance_m - 2200.0).abs() < 30.0, "{fix:?}");
        assert!(fix.centerline_m.abs() < 5.0);
        assert_eq!(fix.tdz_m, 900.0);
    }

    #[test]
    fn runway_fix_finds_the_aligned_end() {
        let r = Runway { lat: 41.0, lon: 29.0, heading: 60.0, length_m: 3000.0, width_m: 45.0, primary_number: 6, secondary_number: 24, secondary_designator: 0, ..Default::default() };
        // 24 yönüne (240°) iniş, eksenin 10 m sağı, eşikten 400 m: eşik merkezin 1500 m kuzeydoğusunda.
        let back = 60f64.to_radians();
        let (tlat, tlon) = offset(41.0, 29.0, 1500.0 * back.sin(), 1500.0 * back.cos());
        let fwd = 240f64.to_radians();
        let right = 330f64.to_radians();
        let (p1, p2) = offset(tlat, tlon, 400.0 * fwd.sin(), 400.0 * fwd.cos());
        let (lat, lon) = offset(p1, p2, 10.0 * right.sin(), 10.0 * right.cos());
        let f = runway_fix(&[r.clone()], lat, lon, 240.0).unwrap();
        assert_eq!(f.runway, "24");
        assert!((f.distance_m - 400.0).abs() < 5.0, "{f:?}");
        assert!((f.centerline_m - 10.0).abs() < 1.5, "{f:?}");
        // Yön tutmayan pist ya da çok uzaktaki nokta: eşleşme yok.
        assert!(runway_fix(&[r.clone()], lat, lon, 150.0).is_none());
        assert!(runway_fix(&[r], 41.2, 29.2, 240.0).is_none());
    }
}
