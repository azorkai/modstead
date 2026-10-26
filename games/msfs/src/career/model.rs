//! Kariyerin kalıcı verisi (`games/msfs/career/`): pilot, aktif iş, filo, defter, hesap hareketleri.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::aircraft::{Class, SimSpecs};
use super::economy::{Plan, Quote, Settlement};
use super::progression::Difficulty;
use super::tracker::{FlightEvent, Landing, Summary, Tracker};

pub const DATA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Stats {
    pub flights: u32,
    /// Lisans için sayılan saat (sim hızıyla şişirilemez; bkz. `credited_hours`).
    pub hours: f64,
    pub sim_hours: f64,
    pub distance_nm: f64,
    pub landings: u32,
    pub butter_landings: u32,
    pub best_landing_fpm: Option<f64>,
    pub earned: i64,
    pub spent: i64,
    pub jobs_done: u32,
    pub jobs_failed: u32,
    pub crashes: u32,
    /// Tüm uçuş puanları (pilot puanı bundan hesaplanır).
    pub scores: Vec<u8>,
    /// Sınıf → saat.
    pub class_hours: HashMap<Class, f64>,
    /// Uçuş defteri sütunları: gece, aletli (bulutta/düşük görüş), çok motor ve yol uçuşu (≥ 50 nm) saatleri.
    pub night_hours: f64,
    pub instrument_hours: f64,
    pub multi_engine_hours: f64,
    pub cross_country_hours: f64,
    pub night_landings: u32,
    pub instrument_approaches: u32,
    pub stable_approaches: u32,
    /// İş türü → saat (kariyer yolunda uçulan saat bundan hesaplanır; bkz. `paths`).
    pub kind_hours: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Pilot {
    pub name: String,
    pub callsign: String,
    pub home: String,
    /// Pilotun şu an bulunduğu havalimanı (son inişin yeri).
    pub location: String,
    pub money: i64,
    /// Bankaya olan borç (her kazançlı uçuşun %25'i otomatik ödenir).
    pub loan: i64,
    pub xp: u64,
    pub licenses: Vec<String>,
    pub reputation: f64,
    pub difficulty: Difficulty,
    /// "student" (sıfırdan) | "fast" (deneyimli başla); eski kayıtlarda "commercial" | "airline".
    pub start: String,
    pub created_at: String,
    pub stats: Stats,
    /// Doğum yılı (0 = bilinmiyor, 30 yaş sayılır).
    pub birth_year: i32,
    /// Yeterlilik, sağlık sertifikası, görev süresi (`records`).
    pub records: super::records::Records,
    /// Kariyer yolu (`paths`); eski kayıtlarda yok → Genel.
    pub path: super::paths::CareerPath,
    /// Yolun seçildiği zaman (unix sn; 0 = kayıttan beri).
    pub path_since: i64,
    /// Yol başına ulaşılan rütbe basamağı (kalıcı: itibar düşse de geri alınmaz).
    pub path_ranks: super::paths::Ranks,
}

impl Pilot {
    pub fn has(&self, id: &str) -> bool {
        self.licenses.iter().any(|l| l == id)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Operatör adına: masraf yok, saatlik ücret.
    #[default]
    Employee,
    /// Kendi hesabına: kira/yakıt/harç pilotta, piyasa ücreti.
    Contract,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    /// "training" | "cargo" | "passenger" | "charter" | "ferry" | "bush" | "medical" | "airline" | "checkride"
    pub kind: String,
    pub mode: Mode,
    pub from: String,
    pub to: String,
    pub distance_nm: f64,
    pub class: Option<Class>,
    pub pax: u32,
    pub cargo_kg: u32,
    /// Yükün kısa tanımı (anahtar: arayüz sözlüğünde çevrilir).
    pub cargo: String,
    /// Yükün özel durumu (`economy::care`): "" | "fragile" | "livestock" | "medical" | "perishable" | "dangerous".
    pub care: String,
    pub client: String,
    /// Operatör adına ücret ya da kendi hesabına gelir.
    pub pay: i64,
    pub quote: Option<Quote>,
    pub plan: Plan,
    pub urgent: bool,
    /// Kabulden sonra teslim süresi (saat).
    pub deadline_h: f64,
    /// İlanın kalktığı zaman (unix sn).
    pub expires_at: i64,
    pub xp_estimate: u32,
    /// Sınav uçuşuysa hangi lisans için.
    pub checkride: Option<String>,
    /// Varıştaki uçuş kategorisi (METAR önbellekte varsa), kötü hava primi (%) ve aletli yetki gereği.
    pub weather: Option<super::env::FlightCategory>,
    pub weather_bonus: u8,
    pub ir_required: bool,
    /// Hava işinin hedefleri (tur, atlayış, fotoğraf, arama-kurtarma); boşsa sıradan iş.
    pub objectives: Vec<super::missions::Objective>,
    /// Hava ve zaman senaryosu (`conditions`); eski kayıtlarda yoksa canlı hava ve gerçek saat.
    pub conditions: super::conditions::JobConditions,
    /// Kariyer yoluna uyum (`paths::fit`): yol dışı mı; yoldaysa ücrete eklenmiş prim ve uçuş sonu XP primi (%).
    pub off_path: bool,
    pub path_pay_bonus: u8,
    pub path_xp_bonus: u8,
}

/// Uçuşa kullanılan uçak.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct AircraftPick {
    pub title: String,
    pub livery: String,
    pub class: Option<Class>,
    /// Kendi filondan ise kimliği; yoksa kiralık (ya da operatörün).
    pub fleet_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    /// Kabul edildi; uçak seçilip başlatılacak.
    #[default]
    Accepted,
    /// Modstead simi açıyor ya da uçuşu yüklüyor.
    Launching,
    /// Kalkış havalimanında, ön kontrol bekleniyor/tamam.
    Ready,
    /// Takip sürüyor (motorlar çalıştı / hareket başladı).
    Flying,
    /// Bağlantı koptu; sim yeniden açılınca kaldığı yerden sürer.
    Interrupted,
}

/// Uçuşun simde nerede başlayacağı.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct StartAt {
    /// Pist başında, motorlar çalışır ve kalkışa hazır (simin `FLIGHT_RUNWAY` durumu); değilse park yerinde, soğuk.
    pub runway: bool,
    /// İstenen pist ucu ("06L"); boşsa en uzun pistin birincil ucu.
    pub end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct ActiveJob {
    pub job: Job,
    pub accepted_at: i64,
    pub deadline_at: i64,
    pub aircraft: Option<AircraftPick>,
    pub start: StartAt,
    pub stage: Stage,
    /// Otomatik başlatmanın son durumu (arayüzde ilerleme metni).
    pub launch_note: Option<String>,
    pub tracker: Option<Tracker>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct FleetAircraft {
    pub id: String,
    pub class: Option<Class>,
    /// Simdeki uçağın başlığı (bu uçakla uçulunca filodaki kayıt kullanılır).
    pub title: String,
    pub registration: String,
    pub location: String,
    pub hours: f64,
    /// 0–100; 40'ın altında uçamaz.
    pub condition: f64,
    pub price_paid: i64,
    pub bought_at: String,
    /// Bakım sayaçları (`maintenance`): son muayeneden ve ağır bakımdan bu yana saat, zamanları (unix sn).
    pub since_inspection_h: f64,
    pub inspected_at: i64,
    pub since_heavy_h: f64,
    pub heavy_at: i64,
    /// İniş sayısı (döngü).
    pub cycles: u32,
    /// Gövde sigortası.
    pub insured: bool,
}

/// Simden öğrenilen uçak (başlık → değerler).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct KnownAircraft {
    pub title: String,
    pub atc_model: String,
    pub specs: SimSpecs,
    pub class: Option<Class>,
    pub seen_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LedgerEntry {
    pub ts: i64,
    pub amount: i64,
    /// Anahtar ("job_pay", "license_fee", "rent", "fuel", "ticket", "aircraft_buy"…) ve ayrıntı.
    pub kind: String,
    pub detail: String,
    pub balance: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct CareerData {
    pub version: u32,
    pub pilot: Option<Pilot>,
    pub active: Option<ActiveJob>,
    pub fleet: Vec<FleetAircraft>,
    /// Kabul edilmiş ya da bitmiş ilan kimlikleri (aynı ilan panoda yeniden çıkmasın).
    pub taken: Vec<String>,
    pub ledger: Vec<LedgerEntry>,
    pub known_aircraft: HashMap<String, KnownAircraft>,
    /// Kullanıcının elle verdiği sınıflar (başlık → sınıf).
    pub class_overrides: HashMap<String, Class>,
}

/// Seyir defteri kaydı.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LogEntry {
    pub id: String,
    pub job: Job,
    /// "completed" | "late" | "diverted" | "failed" | "crashed" | "invalid" | "abandoned"
    pub result: String,
    pub aircraft: AircraftPick,
    pub registration: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub arrived: String,
    pub summary: Summary,
    pub landing: Option<Landing>,
    pub events: Vec<FlightEvent>,
    pub deductions: Vec<(String, u32)>,
    pub settlement: Settlement,
    pub xp: u32,
    pub reputation_delta: f64,
    pub credited_hours: f64,
    /// Sınav uçuşuysa sonuç.
    pub checkride_passed: Option<bool>,
    /// İtiraz edilip kaldırılan kesintiler (kural kodları).
    pub appealed: Vec<String>,
    /// Bu uçuşla ulaşılan yeni rütbe (`paths`), varsa.
    pub promotion: Option<String>,
}
