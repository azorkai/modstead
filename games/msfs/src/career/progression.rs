//! İlerleme: lisanslar ve yetkiler, seviye/XP, itibar, pilot puanı.
//!
//! Gerçek havacılıktaki sıra izlenir: Öğrenci → Özel (PPL) → Ticari (CPL) → Havayolu (ATPL); yanında çok motor (ME),
//! aletli uçuş (IR), helikopter ve tip yetkileri. Her lisansın saat, seviye ve ücret şartı vardır ve bir **sınav
//! uçuşuyla** alınır (A Pilot's Life ve MSFS 2024 kariyerindeki gibi). Zorluk saat ve ücretleri ölçekler.
//!
//! Puan para kazandırmaz; XP'yi ve itibarı belirler (OnAir'in ilkesi: hatalı bir ceza cebinizi yakmasın).

use serde::{Deserialize, Serialize};

use super::aircraft::Class;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Difficulty {
    Easy,
    #[default]
    Normal,
    Realistic,
}

impl Difficulty {
    /// Lisans saat şartı çarpanı.
    pub fn hours(self) -> f64 {
        match self {
            Difficulty::Easy => 0.5,
            Difficulty::Normal => 1.0,
            Difficulty::Realistic => 2.0,
        }
    }
    /// Ücret, kira ve masraf çarpanı.
    pub fn costs(self) -> f64 {
        match self {
            Difficulty::Easy => 0.6,
            Difficulty::Normal => 1.0,
            Difficulty::Realistic => 1.4,
        }
    }
    /// Sınav uçuşunda geçme puanı.
    pub fn pass_score(self) -> u8 {
        match self {
            Difficulty::Easy => 65,
            Difficulty::Normal => 75,
            Difficulty::Realistic => 85,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct License {
    pub id: &'static str,
    pub short: &'static str,
    pub name_tr: &'static str,
    pub name_en: &'static str,
    pub about_tr: &'static str,
    pub about_en: &'static str,
    pub requires: &'static [&'static str],
    /// Normal zorlukta saat ve seviye şartı, ücret ($).
    pub hours: f64,
    pub level: u32,
    pub fee: i64,
    /// Sınav uçuşunun sınıfı (sınavda bu sınıf lisans şartı olmadan uçulur).
    pub exam_class: Class,
}

pub const LICENSES: [License; 10] = [
    License {
        id: "spl",
        short: "SPL",
        name_tr: "Öğrenci pilot",
        name_en: "Student pilot",
        about_tr: "Uçuş okulunda eğitmenle eğitim uçuşları. Kariyer buradan başlar.",
        about_en: "Training flights with an instructor at the flight school. Every career starts here.",
        requires: &[],
        hours: 0.0,
        level: 1,
        fee: 0,
        exam_class: Class::LightPiston,
    },
    License {
        id: "ppl",
        short: "PPL",
        name_tr: "Özel pilot lisansı",
        name_en: "Private pilot licence",
        about_tr: "Hafif uçakla küçük kargo, uçak teslimi ve arazi (bush) işleri.",
        about_en: "Small cargo, aircraft ferry and bush work in light aircraft.",
        requires: &["spl"],
        hours: 3.0,
        level: 2,
        fee: 800,
        exam_class: Class::LightPiston,
    },
    License {
        id: "cpl",
        short: "CPL",
        name_tr: "Ticari pilot lisansı",
        name_en: "Commercial pilot licence",
        about_tr: "Ücretli yolcu ve charter işleri, tek motorlu turboproplar ve kendi hesabına (şirket) uçuşlar.",
        about_en: "Paid passengers and charters, single turboprops and flying on your own account (company).",
        requires: &["ppl"],
        hours: 15.0,
        level: 5,
        fee: 2500,
        exam_class: Class::LightPiston,
    },
    License {
        id: "me",
        short: "ME",
        name_tr: "Çok motor yetkisi",
        name_en: "Multi-engine rating",
        about_tr: "Çift motorlu pistonlu ve turboprop uçaklar.",
        about_en: "Twin piston and twin turboprop aircraft.",
        requires: &["ppl"],
        hours: 8.0,
        level: 3,
        fee: 1500,
        exam_class: Class::PistonTwin,
    },
    License {
        id: "ir",
        short: "IR",
        name_tr: "Aletli uçuş yetkisi",
        name_en: "Instrument rating",
        about_tr: "Gece ve kötü hava işleri; jetlerin şartı.",
        about_en: "Night and bad-weather work; required for jets.",
        requires: &["ppl"],
        hours: 10.0,
        level: 4,
        fee: 2000,
        exam_class: Class::LightPiston,
    },
    License {
        id: "heli",
        short: "H",
        name_tr: "Helikopter yetkisi",
        name_en: "Helicopter rating",
        about_tr: "Helikopterle kısa mesafe, tıbbi ve charter işleri.",
        about_en: "Short-range, medical and charter work by helicopter.",
        requires: &["ppl"],
        hours: 5.0,
        level: 3,
        fee: 3500,
        exam_class: Class::Helicopter,
    },
    License {
        id: "jet",
        short: "JET",
        name_tr: "Jet tip intibakı",
        name_en: "Jet type rating",
        about_tr: "İş jetleri ve bölgesel jetler (ATPL ile).",
        about_en: "Business jets, and regional jets with an ATPL.",
        requires: &["cpl", "ir"],
        hours: 30.0,
        level: 8,
        fee: 6000,
        exam_class: Class::Bizjet,
    },
    License {
        id: "atpl",
        short: "ATPL",
        name_tr: "Havayolu taşımacı pilot lisansı",
        name_en: "Airline transport pilot licence",
        about_tr: "Bölgesel turboproplar ve tarifeli seferler.",
        about_en: "Regional turboprops and scheduled airline flights.",
        requires: &["cpl", "me", "ir"],
        hours: 60.0,
        level: 12,
        fee: 8000,
        exam_class: Class::RegionalTurboprop,
    },
    License {
        id: "narrow",
        short: "TR-N",
        name_tr: "Dar gövde tip yetkisi",
        name_en: "Narrowbody type rating",
        about_tr: "A320 ailesi, 737 ve benzerleri.",
        about_en: "A320 family, 737 and similar.",
        requires: &["atpl", "jet"],
        hours: 100.0,
        level: 16,
        fee: 15_000,
        exam_class: Class::Narrowbody,
    },
    License {
        id: "wide",
        short: "TR-W",
        name_tr: "Geniş gövde tip yetkisi",
        name_en: "Widebody type rating",
        about_tr: "787, 777, A350 ve uzun menzil seferleri.",
        about_en: "787, 777, A350 and long-haul flights.",
        requires: &["narrow"],
        hours: 200.0,
        level: 22,
        fee: 30_000,
        exam_class: Class::Widebody,
    },
];

pub fn license(id: &str) -> Option<&'static License> {
    LICENSES.iter().find(|l| l.id == id)
}

/// Bir pilotun bir lisansa başvurup başvuramayacağı ve eksikleri.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Eligibility {
    pub id: String,
    pub held: bool,
    pub hours_needed: f64,
    pub level_needed: u32,
    pub fee: i64,
    pub missing_licenses: Vec<String>,
    pub ready: bool,
}

pub fn eligibility(l: &License, held: &[String], hours: f64, level: u32, money: i64, d: Difficulty) -> Eligibility {
    let hours_needed = (l.hours * d.hours() * 10.0).round() / 10.0;
    let fee = (l.fee as f64 * d.costs()).round() as i64;
    let missing: Vec<String> = l.requires.iter().filter(|r| !held.iter().any(|h| h == *r)).map(|r| r.to_string()).collect();
    let is_held = held.iter().any(|h| h == l.id);
    Eligibility {
        id: l.id.to_string(),
        held: is_held,
        hours_needed,
        level_needed: l.level,
        fee,
        ready: !is_held && missing.is_empty() && hours + 1e-6 >= hours_needed && level >= l.level && money >= fee,
        missing_licenses: missing,
    }
}

/// Bu sınıfı uçurmaya yetkili mi?
pub fn can_fly(class: Class, held: &[String]) -> bool {
    super::aircraft::info(class).licenses.iter().all(|l| held.iter().any(|h| h == l))
}

// ---------- Seviye ve XP ----------

/// `level` seviyesine ulaşmak için gereken toplam XP (1. seviye 0'dan başlar).
pub fn xp_for_level(level: u32) -> u64 {
    let l = level.max(1) as u64;
    250 * l * (l - 1) / 2
}

pub fn level_for_xp(xp: u64) -> u32 {
    let mut l = 1;
    while xp_for_level(l + 1) <= xp && l < 200 {
        l += 1;
    }
    l
}

/// Mesafe çarpanı: kısa uçuşlar da değerli (kısa oturumlar cezalandırılmasın), uzunlar biraz daha fazla.
pub fn distance_multiplier(nm: f64) -> f64 {
    match nm {
        n if n < 50.0 => 0.7,
        n if n < 150.0 => 0.85,
        n if n < 600.0 => 1.0,
        n if n < 2500.0 => 1.1,
        _ => 1.2,
    }
}

/// Bir uçuşun XP'si.
pub fn flight_xp(score: u8, block_h: f64, distance_nm: f64, class: Class, checkride: bool) -> u32 {
    let class_mult = match class {
        Class::LightPiston => 1.0,
        Class::PistonTwin | Class::Helicopter | Class::TurbopropSingle => 1.1,
        Class::TurbopropTwin | Class::Bizjet => 1.2,
        Class::RegionalTurboprop | Class::RegionalJet => 1.3,
        Class::Narrowbody => 1.4,
        Class::Widebody => 1.5,
    };
    let base = 100.0 + 60.0 * block_h.min(14.0);
    let xp = base * (score as f64 / 100.0) * distance_multiplier(distance_nm) * class_mult + if checkride { 400.0 } else { 0.0 };
    xp.round().max(0.0) as u32
}

/// Pilot puanı (A Pilot's Life): son 10 uçuşun ortalaması ile tüm uçuşların ortalamasının ortası.
pub fn pilot_rating(scores: &[u8]) -> Option<f64> {
    if scores.is_empty() {
        return None;
    }
    let avg = |s: &[u8]| s.iter().map(|&v| v as f64).sum::<f64>() / s.len() as f64;
    let last = &scores[scores.len().saturating_sub(10)..];
    Some(((avg(last) + avg(scores)) / 2.0 * 10.0).round() / 10.0)
}

/// İtibar değişimi (0–100 ölçeğinde).
pub fn reputation_delta(score: u8, late: bool, failed: bool, crashed: bool) -> f64 {
    if crashed {
        return -15.0;
    }
    if failed {
        return -6.0;
    }
    let mut d = (score as f64 - 70.0) / 10.0;
    if late {
        d -= 3.0;
    }
    d.clamp(-5.0, 3.0)
}

/// İtibarın ücretlere etkisi: 0 → ×0.85, 50 → ×1.0, 100 → ×1.2.
pub fn reputation_multiplier(rep: f64) -> f64 {
    let r = rep.clamp(0.0, 100.0);
    if r < 50.0 { 0.85 + 0.15 * r / 50.0 } else { 1.0 + 0.2 * (r - 50.0) / 50.0 }
}

/// Görünen unvan: en yüksek lisansa göre.
pub fn title(held: &[String]) -> (&'static str, &'static str) {
    let has = |id: &str| held.iter().any(|h| h == id);
    if has("wide") {
        ("Kıdemli kaptan", "Senior captain")
    } else if has("narrow") {
        ("Kaptan", "Captain")
    } else if has("atpl") {
        ("Havayolu pilotu", "Airline pilot")
    } else if has("cpl") {
        ("Ticari pilot", "Commercial pilot")
    } else if has("ppl") {
        ("Özel pilot", "Private pilot")
    } else {
        ("Öğrenci pilot", "Student pilot")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn held(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn license_graph_is_consistent() {
        for l in &LICENSES {
            for r in l.requires {
                assert!(license(r).is_some(), "{} → {r}", l.id);
            }
        }
        // Her sınıfı uçurmanın bir yolu var.
        for c in &crate::career::aircraft::CLASSES {
            for l in c.licenses {
                assert!(license(l).is_some(), "{:?} → {l}", c.id);
            }
        }
    }

    #[test]
    fn eligibility_reports_whats_missing() {
        let ppl = license("ppl").unwrap();
        let e = eligibility(ppl, &held(&["spl"]), 1.0, 1, 5000, Difficulty::Normal);
        assert!(!e.ready);
        assert_eq!(e.hours_needed, 3.0);
        let e = eligibility(ppl, &held(&["spl"]), 3.2, 2, 5000, Difficulty::Normal);
        assert!(e.ready);
        let e = eligibility(ppl, &held(&["spl"]), 1.6, 2, 5000, Difficulty::Easy);
        assert!(e.ready, "kolayda saat yarıya iner");
        let atpl = license("atpl").unwrap();
        let e = eligibility(atpl, &held(&["spl", "ppl", "cpl"]), 100.0, 20, 1_000_000, Difficulty::Normal);
        assert_eq!(e.missing_licenses, vec!["me".to_string(), "ir".to_string()]);
        assert!(!e.ready);
    }

    #[test]
    fn class_permissions() {
        assert!(can_fly(Class::LightPiston, &held(&["spl"])));
        assert!(!can_fly(Class::PistonTwin, &held(&["spl", "ppl"])));
        assert!(can_fly(Class::PistonTwin, &held(&["spl", "ppl", "me"])));
        assert!(!can_fly(Class::Narrowbody, &held(&["spl", "ppl", "cpl", "me", "ir", "atpl"])));
    }

    #[test]
    fn levels_and_xp() {
        assert_eq!(level_for_xp(0), 1);
        assert_eq!(xp_for_level(2), 250);
        assert_eq!(level_for_xp(249), 1);
        assert_eq!(level_for_xp(250), 2);
        assert_eq!(level_for_xp(xp_for_level(12)), 12);
        // İyi bir 1 saatlik uçuş anlamlı XP verir; puan düştükçe azalır.
        let good = flight_xp(95, 1.0, 120.0, Class::LightPiston, false);
        let poor = flight_xp(55, 1.0, 120.0, Class::LightPiston, false);
        assert!(good > poor && good > 100, "{good} {poor}");
        assert!(flight_xp(90, 1.0, 120.0, Class::LightPiston, true) > good);
    }

    #[test]
    fn rating_and_reputation() {
        assert_eq!(pilot_rating(&[]), None);
        assert_eq!(pilot_rating(&[80, 90]), Some(85.0));
        let mut s = vec![50u8; 20];
        s.extend([100u8; 10]);
        // Son 10 uçuş ağır basar.
        assert!(pilot_rating(&s).unwrap() > 75.0);
        assert!(reputation_delta(95, false, false, false) > 0.0);
        assert!(reputation_delta(95, true, false, false) < reputation_delta(95, false, false, false));
        assert_eq!(reputation_delta(100, false, false, true), -15.0);
        assert!((reputation_multiplier(50.0) - 1.0).abs() < 1e-9);
        assert!(reputation_multiplier(100.0) > reputation_multiplier(0.0));
    }
}
