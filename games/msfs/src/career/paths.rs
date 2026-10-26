//! Kariyer yolları: havayolu, kargo, arazi (bush), ambulans ve arama-kurtarma, charter ve iş jeti, hava işleri ve
//! genel (karışık). Yol pilotun neye odaklandığını söyler; hiçbir işi kapatmaz. Kurallar (`KARIYER.md` →
//! "Kariyer yolları"):
//!
//! - **İlan panosu** (`weigh_kinds`, `fit`): yolun iş türleri panonun yaklaşık %60'ını oluşturur (zaten daha
//!   fazlaysa dokunulmaz); bu işlerde yolun uçak sınıfları 2,5 kat sık çıkar. Yolun dışındaki işler işaretlenir ama
//!   alınabilir. Yolun türü henüz lisansla açılmadıysa (ör. ATPL'siz havayolu pilotu) pano değişmez, hiçbir iş "yol
//!   dışı" sayılmaz: o işler saat biriktirmektir.
//! - **Rütbe** (`status`): her yolun üç basamağı vardır. Basamak; lisanslardan, yolda uçulan saatten (yolun iş
//!   türlerindeki uçuş saatlerinin toplamı, zorlukla ölçeklenir) ve itibardan türetilir. Ulaşılan basamak kalıcıdır
//!   (`Pilot::path_ranks`): itibar sonradan düşse de rütbe geri alınmaz.
//! - **Prim** (yalnızca yoldaki işlerde): ücrete rütbeye göre +%4 / +%7 / +%10 (kendi hesabına işte kâr kısmına),
//!   XP'ye +%10. Genel yolda prim yoktur; onun yerine pano her türden işi eşit sunar.
//! - **Deneyimli başla** (`start`): yolun lisans paketi, her lisansın saat şartını karşılayan tutarlı bir uçuş geçmişi
//!   (sınıf, gece, aletli, çok motor, yol uçuşu saatleri ve inişler), tam yeterlilik ve sağlık sertifikası. Para
//!   azdır (atlanan lisans ücretlerinin yaklaşık üçte biri); yolda uçulmuş saat sıfırdan başlar.
//! - **Yol değiştirmek** ücretsizdir: lisans, saat, para ve itibar kalır. Rütbe yeni yolun kendi saatlerinden
//!   hesaplanır (o tür işlerde baştan beri uçulan saat sayılır), bu yüzden yeni yolda çoğu zaman ilk basamaktan
//!   başlanır. İtibar sıfırlanmaz: itibar pilotundur, ücretleri her işte etkiler.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::aircraft::{CLASSES, Class};
use super::airports::{Airport, AirportDb};
use super::model::{LogEntry, Pilot, Stats};
use super::progression::{Difficulty, can_fly, license, xp_for_level};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum CareerPath {
    /// Tarifeli yolcu seferleri: bölgesel turboproptan geniş gövdeye.
    Airline,
    /// Yük: besleme turbopropundan kargo jetlerine.
    Cargo,
    /// Arazi (bush): kısa ve kaplamasız pistler, uzak bölgeler.
    Bush,
    /// Hava ambulansı ve arama-kurtarma: helikopter ve turboprop.
    Medical,
    /// Charter, VIP ve iş jetleri.
    Charter,
    /// Hava işleri: panoramik tur, paraşüt atlayışı, hava fotoğrafı.
    Aerial,
    /// Karışık: her türden iş (yollar gelmeden önceki davranış; eski kayıtlar da böyle açılır).
    #[default]
    General,
}

pub const PATHS: [CareerPath; 7] = [CareerPath::Airline, CareerPath::Cargo, CareerPath::Bush, CareerPath::Medical, CareerPath::Charter, CareerPath::Aerial, CareerPath::General];

/// Rütbe basamağı. Saat şartı Normal zorlukta yolda uçulan saattir.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rank {
    pub id: &'static str,
    pub name_tr: &'static str,
    pub name_en: &'static str,
    pub licenses: &'static [&'static str],
    pub hours: f64,
    pub reputation: f64,
}

/// "Deneyimli başla" paketi (Normal zorlukta).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pack {
    pub licenses: &'static [&'static str],
    /// Toplam uçuş saati ve sınıflara dağılımı (paylar, toplamı 1).
    pub hours: f64,
    pub class_share: &'static [(Class, f64)],
    /// Gece ve aletli koşulda geçen saatin payı.
    pub night: f64,
    pub instrument: f64,
    pub money: i64,
}

pub struct PathDef {
    pub id: CareerPath,
    pub name_tr: &'static str,
    pub name_en: &'static str,
    /// Yolun iş türleri (yoldaki işler).
    pub kinds: &'static [&'static str],
    /// Yolun uçak sınıfları (bu işlerde daha sık çıkar).
    pub classes: &'static [Class],
    /// Yolun lisans sırası (sıradaki hedef bundan seçilir).
    pub route: &'static [&'static str],
    pub ranks: &'static [Rank],
    pub fast: Pack,
    /// Önerilen ana üsler (her havalimanı yine seçilebilir).
    pub homes: &'static [&'static str],
}

const fn rank(id: &'static str, name_tr: &'static str, name_en: &'static str, licenses: &'static [&'static str], hours: f64, reputation: f64) -> Rank {
    Rank { id, name_tr, name_en, licenses, hours, reputation }
}

use Class::*;

pub const DEFS: [PathDef; 7] = [
    PathDef {
        id: CareerPath::Airline,
        name_tr: "Havayolu",
        name_en: "Airline",
        kinds: &["airline", "passenger"],
        classes: &[RegionalTurboprop, RegionalJet, Narrowbody, Widebody],
        route: &["ppl", "cpl", "me", "ir", "atpl", "jet", "narrow", "wide"],
        ranks: &[
            rank("first_officer", "İkinci pilot", "First officer", &["atpl"], 0.0, 0.0),
            rank("captain", "Kaptan", "Captain", &["atpl", "jet"], 60.0, 60.0),
            rank("senior_captain", "Kıdemli kaptan", "Senior captain", &["atpl", "wide"], 150.0, 70.0),
        ],
        fast: Pack {
            licenses: &["spl", "ppl", "cpl", "me", "ir", "jet", "atpl", "narrow"],
            hours: 130.0,
            class_share: &[(LightPiston, 0.3), (PistonTwin, 0.15), (TurbopropTwin, 0.1), (Bizjet, 0.15), (Narrowbody, 0.3)],
            night: 0.12,
            instrument: 0.18,
            money: 10_000,
        },
        homes: &["LTFM", "EGLL", "EDDF", "LFPG", "KJFK", "OMDB"],
    },
    PathDef {
        id: CareerPath::Cargo,
        name_tr: "Kargo",
        name_en: "Cargo",
        kinds: &["cargo"],
        classes: &[TurbopropSingle, TurbopropTwin, RegionalTurboprop, Narrowbody, Widebody],
        route: &["ppl", "cpl", "me", "ir", "atpl", "jet", "narrow", "wide"],
        ranks: &[
            rank("feeder_pilot", "Besleme pilotu", "Feeder pilot", &["cpl"], 0.0, 0.0),
            rank("cargo_first_officer", "Kargo ikinci pilotu", "Cargo first officer", &["atpl"], 30.0, 50.0),
            rank("cargo_captain", "Kargo kaptanı", "Cargo captain", &["atpl", "narrow"], 100.0, 65.0),
        ],
        fast: Pack {
            licenses: &["spl", "ppl", "cpl", "me", "ir"],
            hours: 30.0,
            class_share: &[(LightPiston, 0.55), (PistonTwin, 0.2), (TurbopropSingle, 0.25)],
            night: 0.15,
            instrument: 0.12,
            money: 6_000,
        },
        homes: &["EDDP", "EBLG", "KMEM", "KSDF", "PANC", "VHHH"],
    },
    PathDef {
        id: CareerPath::Bush,
        name_tr: "Arazi (bush)",
        name_en: "Bush",
        kinds: &["bush"],
        classes: &[LightPiston, TurbopropSingle],
        route: &["ppl", "cpl", "ir", "me"],
        ranks: &[
            rank("bush_pilot", "Arazi pilotu", "Bush pilot", &["ppl"], 0.0, 0.0),
            rank("senior_bush_pilot", "Kıdemli arazi pilotu", "Senior bush pilot", &["cpl"], 25.0, 55.0),
            rank("chief_bush_pilot", "Baş arazi pilotu", "Chief bush pilot", &["cpl"], 80.0, 70.0),
        ],
        fast: Pack { licenses: &["spl", "ppl"], hours: 14.0, class_share: &[(LightPiston, 1.0)], night: 0.03, instrument: 0.0, money: 3_500 },
        homes: &["PATK", "PAMR", "CYXY", "NZQN", "AYMH", "HKNW"],
    },
    PathDef {
        id: CareerPath::Medical,
        name_tr: "Ambulans ve kurtarma",
        name_en: "Air ambulance & rescue",
        kinds: &["medical", "sar"],
        classes: &[Helicopter, TurbopropSingle, TurbopropTwin],
        route: &["ppl", "cpl", "heli", "ir", "me"],
        ranks: &[
            rank("ambulance_pilot", "Ambulans pilotu", "Air ambulance pilot", &["cpl"], 0.0, 0.0),
            rank("senior_ambulance_pilot", "Kıdemli ambulans pilotu", "Senior ambulance pilot", &["cpl", "ir"], 25.0, 55.0),
            rank("rescue_captain", "Kurtarma kaptanı", "Rescue captain", &["cpl", "ir", "heli"], 70.0, 70.0),
        ],
        fast: Pack {
            licenses: &["spl", "ppl", "cpl", "heli", "ir"],
            hours: 32.0,
            class_share: &[(LightPiston, 0.5), (Helicopter, 0.35), (TurbopropSingle, 0.15)],
            night: 0.12,
            instrument: 0.1,
            money: 6_000,
        },
        homes: &["LOWI", "LSZH", "ENTC", "YBAS", "LTAC", "PAFA"],
    },
    PathDef {
        id: CareerPath::Charter,
        name_tr: "Charter ve iş jeti",
        name_en: "Charter & business jets",
        kinds: &["charter"],
        classes: &[PistonTwin, TurbopropTwin, Bizjet],
        route: &["ppl", "cpl", "me", "ir", "jet"],
        ranks: &[
            rank("charter_pilot", "Charter pilotu", "Charter pilot", &["cpl"], 0.0, 0.0),
            rank("charter_captain", "Charter kaptanı", "Charter captain", &["cpl", "me", "ir"], 30.0, 55.0),
            rank("bizjet_captain", "İş jeti kaptanı", "Business jet captain", &["cpl", "ir", "jet"], 80.0, 70.0),
        ],
        fast: Pack {
            licenses: &["spl", "ppl", "cpl", "me", "ir"],
            hours: 32.0,
            class_share: &[(LightPiston, 0.5), (PistonTwin, 0.3), (TurbopropTwin, 0.2)],
            night: 0.1,
            instrument: 0.12,
            money: 6_000,
        },
        homes: &["KTEB", "LFMN", "LSGG", "EGLF", "LTBA", "KVNY"],
    },
    PathDef {
        id: CareerPath::Aerial,
        name_tr: "Hava işleri",
        name_en: "Aerial work",
        kinds: &["tour", "skydive", "survey"],
        classes: &[LightPiston, TurbopropSingle],
        route: &["ppl", "cpl", "me", "ir"],
        ranks: &[
            rank("aerial_pilot", "Hava işi pilotu", "Aerial work pilot", &["cpl"], 0.0, 0.0),
            rank("senior_aerial_pilot", "Kıdemli hava işi pilotu", "Senior aerial work pilot", &["cpl"], 25.0, 55.0),
            rank("master_pilot", "Usta pilot", "Master pilot", &["cpl", "me"], 70.0, 70.0),
        ],
        fast: Pack {
            licenses: &["spl", "ppl", "cpl"],
            hours: 22.0,
            class_share: &[(LightPiston, 0.8), (TurbopropSingle, 0.2)],
            night: 0.04,
            instrument: 0.0,
            money: 5_000,
        },
        homes: &["KGCN", "PHOG", "NZQN", "BIRK", "LTFE", "LSZS"],
    },
    PathDef {
        id: CareerPath::General,
        name_tr: "Serbest pilot",
        name_en: "Freelance pilot",
        kinds: &[],
        classes: &[],
        route: &[],
        ranks: &[],
        fast: Pack {
            licenses: &["spl", "ppl", "cpl", "me", "ir"],
            hours: 22.0,
            class_share: &[(LightPiston, 0.75), (PistonTwin, 0.25)],
            night: 0.08,
            instrument: 0.1,
            money: 6_000,
        },
        homes: &["LTBA", "LTFJ", "EGKB", "KPAO", "LFPN", "EDNY"],
    },
];

pub fn def(path: CareerPath) -> &'static PathDef {
    DEFS.iter().find(|d| d.id == path).expect("her yolun tanımı var")
}

/// Sıfırdan başlayan pilotun parası (Normal zorlukta; her yolda aynı).
pub const SCRATCH_MONEY: i64 = 3_000;
/// Deneyimli başlangıcın parası en çok bu kadardır (Normal zorlukta): lisans ücretleri atlanır, birikim yoktur.
pub const FAST_MONEY_CAP: i64 = 10_000;

/// Yoldaki işlerin ücret primi (%), rütbeye göre: henüz basamakta değil, 1, 2, 3.
pub const PAY_BONUS: [u8; 4] = [0, 4, 7, 10];
/// Yoldaki işlerin XP primi (%), rütbeden bağımsız.
pub const XP_BONUS: u8 = 10;
/// Yolun türleri panonun bu payına çıkarılır.
pub const ON_PATH_SHARE: f64 = 0.6;
/// Yoldaki işte yolun uçak sınıflarının seçilme çarpanı.
pub const CLASS_PREFERENCE: f64 = 2.5;

/// Başlangıç parasının zorluk çarpanı.
pub fn money_multiplier(d: Difficulty) -> f64 {
    match d {
        Difficulty::Easy => 1.5,
        Difficulty::Normal => 1.0,
        Difficulty::Realistic => 0.7,
    }
}

// ---------- Başlangıç ----------

/// Yeni pilotun başlangıcı: lisanslar, para, XP ve (deneyimliyse) uçuş geçmişi.
#[derive(Debug, Clone)]
pub struct Start {
    pub licenses: Vec<String>,
    pub money: i64,
    pub xp: u64,
    pub stats: Stats,
}

/// Sınıfın saat başına tipik iniş sayısı (deneyimli başlangıcın uçuş defteri için).
fn landings_per_hour(c: Class) -> f64 {
    match c {
        Class::LightPiston => 1.2,
        Class::Helicopter => 1.5,
        Class::PistonTwin | Class::TurbopropSingle => 0.8,
        Class::TurbopropTwin | Class::RegionalTurboprop => 0.7,
        _ => 0.5,
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

pub fn start(path: CareerPath, fast: bool, d: Difficulty) -> Start {
    let m = money_multiplier(d);
    if !fast {
        return Start { licenses: vec!["spl".into()], money: (SCRATCH_MONEY as f64 * m).round() as i64, xp: 0, stats: Stats::default() };
    }
    let pack = &def(path).fast;
    let licenses: Vec<String> = pack.licenses.iter().map(|s| s.to_string()).collect();
    let level = pack.licenses.iter().filter_map(|id| license(id)).map(|l| l.level).max().unwrap_or(1);
    let hours = round1(pack.hours * d.hours());
    let mut stats = Stats { hours, sim_hours: hours, ..Default::default() };
    let mut landings = 0.0;
    for (c, share) in pack.class_share {
        let h = round1(hours * share);
        *stats.class_hours.entry(*c).or_default() += h;
        landings += h * landings_per_hour(*c);
        if !matches!(c, Class::LightPiston | Class::TurbopropSingle | Class::Helicopter) {
            stats.multi_engine_hours += h;
        }
    }
    let ir = pack.licenses.contains(&"ir");
    stats.multi_engine_hours = round1(stats.multi_engine_hours);
    stats.night_hours = round1(hours * pack.night);
    stats.instrument_hours = round1(hours * pack.instrument);
    stats.cross_country_hours = round1(hours * 0.55);
    stats.landings = landings.round() as u32;
    // Gece yolcu yeterliliği için en az 3 gece inişi; aletli yeterlilik için en az 6 yaklaşma.
    stats.night_landings = ((landings * pack.night).round() as u32).max(3);
    stats.instrument_approaches = if ir { ((stats.instrument_hours * 1.5).round() as u32).max(6) } else { 0 };
    Start { licenses, money: (pack.money as f64 * m).round() as i64, xp: xp_for_level(level), stats }
}

// ---------- Rütbe ----------

/// Yolun işlerinde uçulan saat (Genel'de toplam saat).
pub fn path_hours(path: CareerPath, s: &Stats) -> f64 {
    let d = def(path);
    if d.kinds.is_empty() {
        return s.hours;
    }
    d.kinds.iter().map(|k| s.kind_hours.get(*k).copied().unwrap_or(0.0)).sum()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RankStep {
    pub id: &'static str,
    pub name_tr: &'static str,
    pub name_en: &'static str,
    pub licenses: &'static [&'static str],
    pub missing_licenses: Vec<String>,
    /// Zorlukla ölçeklenmiş saat şartı ve itibar şartı.
    pub hours_needed: f64,
    pub reputation_needed: f64,
    /// Bu basamakta yoldaki işlerin ücret primi (%).
    pub pay_bonus: u8,
    pub reached: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathStatus {
    pub path: CareerPath,
    pub name_tr: &'static str,
    pub name_en: &'static str,
    /// Yolun iş türleri ve lisans sırası.
    pub kinds: &'static [&'static str],
    pub route: &'static [&'static str],
    /// Yolun işlerinde uçulan saat.
    pub hours: f64,
    /// 0 = henüz ilk basamakta değil; 1..=3.
    pub rank: u8,
    pub rank_id: Option<&'static str>,
    pub ladder: Vec<RankStep>,
    /// Yoldaki işlerin ücret ve XP primi (%); Genel'de 0.
    pub pay_bonus: u8,
    pub xp_bonus: u8,
    /// Yolun lisans sırasında sahip olunmayan ilk lisans.
    pub next_license: Option<&'static str>,
}

/// Şartlara göre ulaşılan basamak (kalıcı kayda bakmadan).
fn earned_rank(p: &Pilot, path: CareerPath) -> u8 {
    let d = def(path);
    let hours = path_hours(path, &p.stats);
    let mut r = 0;
    for step in d.ranks {
        let ok = step.licenses.iter().all(|l| p.has(l)) && hours + 1e-6 >= step.hours * p.difficulty.hours() && p.reputation + 1e-6 >= step.reputation;
        if !ok {
            break;
        }
        r += 1;
    }
    r
}

/// Ulaşılan basamak: şartlar ya da daha önce ulaşılan (kalıcı) basamak, hangisi yüksekse.
pub fn rank_of(p: &Pilot, path: CareerPath) -> u8 {
    earned_rank(p, path).max(p.path_ranks.get(&path).copied().unwrap_or(0)).min(def(path).ranks.len() as u8)
}

/// Kalıcı rütbeyi günceller (uçuştan, sınavdan, yol seçiminden sonra). Yeni bir basamağa çıkıldıysa onun kimliği.
pub fn promote(p: &mut Pilot) -> Option<&'static str> {
    let path = p.path;
    if def(path).ranks.is_empty() {
        return None;
    }
    let before = p.path_ranks.get(&path).copied().unwrap_or(0);
    let now = rank_of(p, path);
    if now > before {
        p.path_ranks.insert(path, now);
        return def(path).ranks.get(now as usize - 1).map(|r| r.id);
    }
    None
}

pub fn status(p: &Pilot) -> PathStatus {
    let d = def(p.path);
    let hours = path_hours(p.path, &p.stats);
    let rank = rank_of(p, p.path);
    let ladder = d
        .ranks
        .iter()
        .enumerate()
        .map(|(i, r)| RankStep {
            id: r.id,
            name_tr: r.name_tr,
            name_en: r.name_en,
            licenses: r.licenses,
            missing_licenses: r.licenses.iter().filter(|l| !p.has(l)).map(|l| l.to_string()).collect(),
            hours_needed: round1(r.hours * p.difficulty.hours()),
            reputation_needed: r.reputation,
            pay_bonus: PAY_BONUS[i + 1],
            reached: (i as u8) < rank,
        })
        .collect();
    let general = d.ranks.is_empty();
    PathStatus {
        path: p.path,
        name_tr: d.name_tr,
        name_en: d.name_en,
        kinds: d.kinds,
        route: d.route,
        hours: round1(hours),
        rank,
        rank_id: (rank > 0).then(|| d.ranks[rank as usize - 1].id),
        ladder,
        pay_bonus: if general { 0 } else { PAY_BONUS[rank as usize] },
        xp_bonus: if general { 0 } else { XP_BONUS },
        next_license: d.route.iter().copied().find(|l| !p.has(l)),
    }
}

/// Görünen unvan: yolda bir basamaktaysa rütbe, değilse en yüksek lisans.
pub fn title(p: &Pilot) -> (&'static str, &'static str) {
    let rank = rank_of(p, p.path) as usize;
    if let Some(r) = rank.checked_sub(1).and_then(|i| def(p.path).ranks.get(i)) {
        return (r.name_tr, r.name_en);
    }
    super::progression::title(&p.licenses)
}

// ---------- Pano ----------

/// Panodaki iş türlerinin ağırlıkları: yolun türleri toplamın yaklaşık `ON_PATH_SHARE`'i olacak biçimde büyütülür
/// (zaten fazlaysa dokunulmaz). Genel yolda ya da yolun türleri henüz açık değilse liste aynen döner.
pub fn weigh_kinds(path: CareerPath, kinds: Vec<(&'static str, f64)>) -> Vec<(&'static str, f64)> {
    let d = def(path);
    let on: f64 = kinds.iter().filter(|(k, _)| d.kinds.contains(k)).map(|(_, w)| w).sum();
    let off: f64 = kinds.iter().filter(|(k, _)| !d.kinds.contains(k)).map(|(_, w)| w).sum();
    if on <= 0.0 || off <= 0.0 {
        return kinds;
    }
    let f = (ON_PATH_SHARE / (1.0 - ON_PATH_SHARE) * off / on).max(1.0);
    kinds.into_iter().map(|(k, w)| (k, if d.kinds.contains(&k) { w * f } else { w })).collect()
}

/// Bir ilanın yola uyumu.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Fit {
    /// Yolun dışında (işaretlenir, alınabilir).
    pub off_path: bool,
    /// Yoldaki işte ücret ve XP primi (%).
    pub pay_bonus: u8,
    pub xp_bonus: u8,
    /// Bu işte yolun uçak sınıfları tercih edilir.
    pub prefer_classes: bool,
}

/// `open`: yolun türlerinden en az biri pilotun lisanslarıyla panoda açık mı (değilse hiçbir iş yol dışı değildir).
pub fn fit(path: CareerPath, rank: u8, kind: &str, open: bool) -> Fit {
    let d = def(path);
    if d.kinds.is_empty() || matches!(kind, "training" | "checkride") {
        return Fit::default();
    }
    if d.kinds.contains(&kind) {
        return Fit { off_path: false, pay_bonus: PAY_BONUS[(rank as usize).min(3)], xp_bonus: XP_BONUS, prefer_classes: true };
    }
    Fit { off_path: open, ..Fit::default() }
}

/// Yolun türlerinden biri bu türler arasında var mı?
pub fn open_on_board(path: CareerPath, kinds: &[(&'static str, f64)]) -> bool {
    let d = def(path);
    kinds.iter().any(|(k, _)| d.kinds.contains(k))
}

// ---------- Eski kayıtlar ----------

/// Tür başına saatleri olmayan eski kariyer: seyir defterinden hesaplanır (yolda uçulan saat buna dayanır).
pub fn backfill(stats: &mut Stats, log: &[LogEntry]) {
    if !stats.kind_hours.is_empty() {
        return;
    }
    for e in log {
        if e.credited_hours > 0.0 {
            *stats.kind_hours.entry(e.job.kind.clone()).or_default() += e.credited_hours;
        }
    }
}

// ---------- Arayüz kataloğu ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FastView {
    pub licenses: &'static [&'static str],
    /// Zorlukla ölçeklenmiş değerler.
    pub hours: f64,
    pub level: u32,
    pub money: i64,
    pub night_hours: f64,
    pub instrument_hours: f64,
    pub multi_engine_hours: f64,
    /// Bu lisanslarla uçulabilen sınıflar.
    pub flyable: Vec<Class>,
    /// Başlangıçtaki rütbe (ilk basamak).
    pub rank_id: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub id: CareerPath,
    pub name_tr: &'static str,
    pub name_en: &'static str,
    pub kinds: &'static [&'static str],
    pub classes: &'static [Class],
    pub route: &'static [&'static str],
    /// Basamaklar (saat şartı zorlukla ölçekli).
    pub ranks: Vec<Rank>,
    pub fast: FastView,
    pub scratch_money: i64,
    pub homes: Vec<Airport>,
}

/// Kayıt ekranının ve yol değiştirme penceresinin kataloğu (seçilen zorlukla).
pub fn catalog(db: &AirportDb, d: Difficulty) -> Vec<PathInfo> {
    DEFS.iter()
        .map(|def| {
            let s = start(def.id, true, d);
            let level = def.fast.licenses.iter().filter_map(|id| license(id)).map(|l| l.level).max().unwrap_or(1);
            PathInfo {
                id: def.id,
                name_tr: def.name_tr,
                name_en: def.name_en,
                kinds: def.kinds,
                classes: def.classes,
                route: def.route,
                ranks: def.ranks.iter().map(|r| Rank { hours: round1(r.hours * d.hours()), ..r.clone() }).collect(),
                fast: FastView {
                    licenses: def.fast.licenses,
                    hours: s.stats.hours,
                    level,
                    money: s.money,
                    night_hours: s.stats.night_hours,
                    instrument_hours: s.stats.instrument_hours,
                    multi_engine_hours: s.stats.multi_engine_hours,
                    flyable: CLASSES.iter().map(|c| c.id).filter(|c| can_fly(*c, &s.licenses)).collect(),
                    rank_id: def.ranks.first().filter(|r| r.licenses.iter().all(|l| def.fast.licenses.contains(l))).map(|r| r.id),
                },
                scratch_money: start(def.id, false, d).money,
                homes: def.homes.iter().filter_map(|i| db.get(i).cloned()).collect(),
            }
        })
        .collect()
}

/// Sicilin kalıcı rütbe kaydı (yol → basamak).
pub type Ranks = BTreeMap<CareerPath, u8>;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::airports::db;
    use crate::career::progression::LICENSES;
    use crate::career::records::{self, Records};

    const NOW: i64 = 1_800_000_000;

    fn fast_pilot(path: CareerPath, d: Difficulty) -> Pilot {
        let s = start(path, true, d);
        let heli = s.licenses.iter().any(|l| l == "heli");
        let mut records = Records::new_pilot(&s.licenses, true, 0, NOW);
        if heli {
            records.seed_helicopter(NOW);
        }
        let mut p = Pilot { licenses: s.licenses, money: s.money, xp: s.xp, stats: s.stats, difficulty: d, reputation: 50.0, path, records, created_at: "2026-10-26T00:00:00Z".into(), ..Default::default() };
        promote(&mut p);
        p
    }

    #[test]
    fn old_saves_default_to_the_general_path() {
        let p: Pilot = serde_json::from_str(r#"{"name":"Oyuncu","licenses":["spl","ppl"],"reputation":50}"#).unwrap();
        assert_eq!(p.path, CareerPath::General);
        assert!(p.stats.kind_hours.is_empty() && p.path_ranks.is_empty());
        let s = status(&p);
        assert_eq!((s.rank, s.pay_bonus, s.xp_bonus), (0, 0, 0));
        assert_eq!(title(&p), ("Özel pilot", "Private pilot"));
        // Kimlikler arayüzle aynı (camelCase).
        assert_eq!(serde_json::to_string(&CareerPath::Medical).unwrap(), "\"medical\"");
        assert_eq!(serde_json::from_str::<CareerPath>("\"aerial\"").unwrap(), CareerPath::Aerial);
    }

    #[test]
    fn definitions_are_consistent() {
        for d in &DEFS {
            for l in d.fast.licenses.iter().chain(d.route).chain(d.ranks.iter().flat_map(|r| r.licenses)) {
                assert!(license(l).is_some(), "{:?} → {l}", d.id);
            }
            let share: f64 = d.fast.class_share.iter().map(|(_, s)| s).sum();
            assert!((share - 1.0).abs() < 1e-9, "{:?} {share}", d.id);
            assert_eq!(d.homes.len(), 6, "{:?}", d.id);
            for h in d.homes {
                assert!(db().get(h).is_some(), "{:?} → {h}", d.id);
            }
            // Basamaklar sıralı: saat ve itibar azalmaz.
            for w in d.ranks.windows(2) {
                assert!(w[1].hours >= w[0].hours && w[1].reputation >= w[0].reputation, "{:?}", d.id);
            }
        }
        assert_eq!(PATHS.len(), DEFS.len());
    }

    #[test]
    fn fast_start_is_consistent_for_every_path_and_difficulty() {
        for path in PATHS {
            for diff in [Difficulty::Easy, Difficulty::Normal, Difficulty::Realistic] {
                let p = fast_pilot(path, diff);
                let tag = format!("{path:?}/{diff:?}");
                // Her lisansın önkoşulu, saat ve seviye şartı karşılanıyor.
                let level = crate::career::progression::level_for_xp(p.xp);
                for id in &p.licenses {
                    let l = license(id).unwrap();
                    assert!(l.requires.iter().all(|r| p.has(r)), "{tag}: {id} önkoşul");
                    assert!(p.stats.hours + 1e-6 >= l.hours * diff.hours(), "{tag}: {id} saat {}", p.stats.hours);
                    assert!(level >= l.level, "{tag}: {id} seviye {level}");
                }
                // Defter sütunları birbirini tutuyor.
                let class_sum: f64 = p.stats.class_hours.values().sum();
                assert!((class_sum - p.stats.hours).abs() < 0.3, "{tag}: sınıf saatleri {class_sum} / {}", p.stats.hours);
                assert!(p.stats.night_hours <= p.stats.hours && p.stats.instrument_hours <= p.stats.hours && p.stats.cross_country_hours <= p.stats.hours);
                assert_eq!(p.stats.multi_engine_hours > 0.0, p.has("me"), "{tag}: çok motor saati");
                assert_eq!(p.stats.instrument_approaches >= 6, p.has("ir"), "{tag}: aletli yaklaşma");
                assert!(p.stats.landings > 0 && p.stats.night_landings >= 3, "{tag}");
                for (c, h) in &p.stats.class_hours {
                    assert!(can_fly(*c, &p.licenses), "{tag}: {c:?} saati var ama yetki yok ({h})");
                }
                // Sicil hemen engel olmuyor: sağlık geçerli, gündüz/gece yolcu ve (varsa) helikopter ile aletli yeterlilik tam.
                let st = p.records.status(&p.licenses, diff, NOW);
                assert!(st.medical_valid, "{tag}: sağlık");
                assert_eq!(st.medical_required, records::medical_required(&p.licenses));
                assert!(st.passenger_current && st.night_current, "{tag}: yolcu yeterliliği {st:?}");
                if p.has("ir") {
                    assert!(st.ifr_current, "{tag}: aletli yeterlilik");
                }
                if p.has("heli") {
                    assert!(st.heli_current, "{tag}: helikopter yeterliliği");
                }
                for heli in [false, true] {
                    assert_eq!(records::blocker(&st, true, heli && p.has("heli"), true, 2.0), None, "{tag}");
                }
                // Yolun ilk basamağında başlar; yolda uçulmuş saat yok.
                let s = status(&p);
                if path != CareerPath::General {
                    assert_eq!(s.rank, 1, "{tag}");
                    assert_eq!(s.hours, 0.0, "{tag}");
                }
                // Para az: en çok 10.000 $ (zorlukla ölçekli); kısa yol zenginlik getirmez.
                assert!(p.money <= (FAST_MONEY_CAP as f64 * money_multiplier(diff)).round() as i64, "{tag}: para {}", p.money);
                assert!(p.money >= (SCRATCH_MONEY as f64 * money_multiplier(diff)).round() as i64, "{tag}: öğrenciden az değil");
            }
        }
        // Sıfırdan: yalnızca öğrenci lisansı, saat yok.
        let s = start(CareerPath::Airline, false, Difficulty::Normal);
        assert_eq!(s.licenses, vec!["spl".to_string()]);
        assert_eq!((s.money, s.xp, s.stats.hours), (SCRATCH_MONEY, 0, 0.0));
        assert!(LICENSES.iter().any(|l| l.id == "spl"));
    }

    #[test]
    fn rank_ladder_follows_licences_hours_and_reputation() {
        let mut p = Pilot { licenses: vec!["spl".into(), "ppl".into()], reputation: 50.0, path: CareerPath::Airline, ..Default::default() };
        assert_eq!(rank_of(&p, CareerPath::Airline), 0);
        assert_eq!(title(&p), ("Özel pilot", "Private pilot"), "basamakta değilse lisans unvanı");
        // ATPL: ikinci pilot.
        p.licenses.extend(["cpl", "me", "ir", "atpl"].map(String::from));
        assert_eq!(rank_of(&p, CareerPath::Airline), 1);
        assert_eq!(title(&p), ("İkinci pilot", "First officer"));
        // Kaptan: jet yetkisi + 60 saat havayolu/yolcu işi + itibar 60.
        p.licenses.push("jet".into());
        p.stats.kind_hours.insert("airline".into(), 40.0);
        p.stats.kind_hours.insert("cargo".into(), 300.0);
        assert_eq!(rank_of(&p, CareerPath::Airline), 1, "kargo saati havayolunda sayılmaz");
        p.stats.kind_hours.insert("passenger".into(), 20.0);
        assert_eq!(path_hours(CareerPath::Airline, &p.stats), 60.0);
        assert_eq!(rank_of(&p, CareerPath::Airline), 1, "itibar yetmiyor");
        p.reputation = 61.0;
        assert_eq!(rank_of(&p, CareerPath::Airline), 2);
        assert_eq!(promote(&mut p), Some("captain"));
        assert_eq!(promote(&mut p), None, "ikinci kez terfi yok");
        // Ulaşılan basamak kalıcı: itibar düşse de kaptan kalır.
        p.reputation = 40.0;
        assert_eq!(rank_of(&p, CareerPath::Airline), 2);
        let s = status(&p);
        assert_eq!((s.rank, s.rank_id, s.pay_bonus, s.xp_bonus), (2, Some("captain"), 7, 10));
        assert!(s.ladder[0].reached && s.ladder[1].reached && !s.ladder[2].reached);
        assert_eq!(s.ladder[2].missing_licenses, vec!["wide".to_string()]);
        assert_eq!(s.next_license, Some("narrow"));
        // Gerçekçi zorlukta saat şartı iki katı.
        let mut q = Pilot { licenses: p.licenses.clone(), reputation: 61.0, path: CareerPath::Airline, difficulty: Difficulty::Realistic, stats: p.stats.clone(), ..Default::default() };
        assert_eq!(rank_of(&q, CareerPath::Airline), 1);
        q.stats.kind_hours.insert("airline".into(), 100.0);
        assert_eq!(rank_of(&q, CareerPath::Airline), 2);
        assert_eq!(status(&q).ladder[1].hours_needed, 120.0);
        // Kargo yolunda aynı pilotun 300 kargo saati var: kargo ikinci pilotu (TR-N yok, kaptan değil).
        q.path = CareerPath::Cargo;
        assert_eq!(rank_of(&q, CareerPath::Cargo), 2);
        assert_eq!(title(&q), ("Kargo ikinci pilotu", "Cargo first officer"));
    }

    #[test]
    fn kind_weights_favour_the_path_but_keep_variety() {
        let base = vec![("cargo", 30.0), ("ferry", 12.0), ("bush", 14.0), ("passenger", 26.0), ("charter", 14.0), ("medical", 8.0), ("tour", 6.0), ("skydive", 4.0), ("survey", 5.0), ("sar", 3.0)];
        assert_eq!(weigh_kinds(CareerPath::General, base.clone()), base, "genel yol bugünkü gibi");
        for path in PATHS.into_iter().filter(|p| *p != CareerPath::General) {
            let w = weigh_kinds(path, base.clone());
            let d = def(path);
            let on: f64 = w.iter().filter(|(k, _)| d.kinds.contains(k)).map(|(_, v)| v).sum();
            let total: f64 = w.iter().map(|(_, v)| v).sum();
            assert!((on / total - ON_PATH_SHARE).abs() < 1e-9 || on / total > ON_PATH_SHARE, "{path:?} {}", on / total);
        }
        // Yolun türü açık değilse dokunulmaz (ATPL'siz havayolu pilotu, PPL'li ambulans pilotu).
        let ppl = vec![("cargo", 30.0), ("ferry", 12.0), ("bush", 14.0), ("training", 8.0)];
        assert_eq!(weigh_kinds(CareerPath::Medical, ppl.clone()), ppl);
        assert!(!open_on_board(CareerPath::Medical, &ppl));
        // Uyum: yoldaki iş primli, yol dışı işaretli, eğitim ve sınav nötr.
        assert_eq!(fit(CareerPath::Cargo, 2, "cargo", true), Fit { off_path: false, pay_bonus: 7, xp_bonus: 10, prefer_classes: true });
        assert!(fit(CareerPath::Cargo, 2, "charter", true).off_path);
        assert!(!fit(CareerPath::Cargo, 2, "charter", false).off_path, "yolun işi açık değilse yol dışı yok");
        assert_eq!(fit(CareerPath::Cargo, 1, "training", true), Fit::default());
        assert_eq!(fit(CareerPath::General, 0, "cargo", true), Fit::default());
    }

    #[test]
    fn backfill_counts_logbook_hours_by_kind() {
        let mut s = Stats::default();
        let e = |kind: &str, h: f64| LogEntry { credited_hours: h, job: super::super::model::Job { kind: kind.into(), ..Default::default() }, ..Default::default() };
        backfill(&mut s, &[e("cargo", 1.5), e("cargo", 0.5), e("airline", 2.0), e("training", 0.0)]);
        assert_eq!(s.kind_hours.get("cargo"), Some(&2.0));
        assert_eq!(path_hours(CareerPath::Airline, &s), 2.0);
        // Dolu kayda dokunulmaz.
        backfill(&mut s, &[e("cargo", 10.0)]);
        assert_eq!(s.kind_hours.get("cargo"), Some(&2.0));
    }

    #[test]
    fn catalog_lists_every_path_with_homes() {
        let c = catalog(db(), Difficulty::Normal);
        assert_eq!(c.len(), 7);
        let airline = c.iter().find(|p| p.id == CareerPath::Airline).unwrap();
        assert!(airline.fast.flyable.contains(&Class::Narrowbody));
        assert_eq!(airline.fast.rank_id, Some("first_officer"));
        assert_eq!(airline.homes.len(), 6);
        assert_eq!(airline.scratch_money, SCRATCH_MONEY);
        let r = catalog(db(), Difficulty::Realistic);
        let a = r.iter().find(|p| p.id == CareerPath::Airline).unwrap();
        assert_eq!(a.ranks[1].hours, 120.0);
        assert!(a.fast.money < airline.fast.money && a.fast.hours > airline.fast.hours);
    }
}
