//! Filonun bakım programı ve sigortası. Gerçek aralıklardan (FAA 91.409, Lycoming SI 1009, A320 bakım planı)
//! sadeleştirildi; ücretler oyunun ölçeğinde (uçak fiyatları gibi gerçeğin yaklaşık yarısı):
//!
//! | Sınıf | Muayene | Ağır bakım |
//! |---|---|---|
//! | Hafif pistonlu, helikopter | 100 saat ya da 12 ay | motor revizyonu 2000 / 3000 saat |
//! | Çift pistonlu | 100 saat ya da 12 ay | motor revizyonu 1800 saat |
//! | Turboprop | 200 saat ya da 12 ay (faz muayenesi) | motor revizyonu 3600 saat |
//! | İş jeti | 300 saat ya da 12 ay | ağır bakım 3500 saat ya da 48 ay |
//! | Bölgesel turboprop, jetler | A bakımı 500–800 saat ya da 4 ay | C bakımı 5000–8000 saat ya da 24 ay |
//!
//! Muayenesi geçen uçak uçamaz; saat sınırı %10 aşılabilir (FAA 91.409'daki 10 saatlik pay: uçağı bakıma
//! götürmek için). Ağır bakım yalnızca orta ve büyük havalimanlarında yapılır. Kolay zorlukta yalnızca uyarıdır.
//!
//! Sigorta (isteğe bağlı): prim uçuş saati başına uçak değerinin %0,0025'i (yılda ≈ 600 saatte %1,5); kaza
//! geçmişi primi artırır. Hasarda onarım bedelini sigorta öder, pilot muafiyeti (uçak değerinin %5'i) öder.

use serde::Serialize;

use super::aircraft::Class;
use super::progression::Difficulty;

const DAY: i64 = 86400;
const MONTH: i64 = 30 * DAY;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Program {
    /// "100h" | "phase" | "a_check" | "inspection"
    pub inspection: &'static str,
    pub inspection_h: f64,
    pub inspection_months: u32,
    pub inspection_cost: i64,
    /// "overhaul" | "c_check" | "heavy"
    pub heavy: &'static str,
    pub heavy_h: f64,
    /// 0 = takvim sınırı yok (yalnızca saat).
    pub heavy_months: u32,
    pub heavy_cost: i64,
}

pub fn program(c: Class) -> Program {
    let p = |inspection, inspection_h, inspection_months, inspection_cost, heavy, heavy_h, heavy_months, heavy_cost| Program {
        inspection,
        inspection_h,
        inspection_months,
        inspection_cost,
        heavy,
        heavy_h,
        heavy_months,
        heavy_cost,
    };
    match c {
        Class::LightPiston => p("100h", 100.0, 12, 1_200, "overhaul", 2000.0, 0, 18_000),
        Class::PistonTwin => p("100h", 100.0, 12, 2_500, "overhaul", 1800.0, 0, 45_000),
        Class::Helicopter => p("100h", 100.0, 12, 2_500, "overhaul", 3000.0, 0, 120_000),
        Class::TurbopropSingle => p("phase", 200.0, 12, 5_000, "overhaul", 3600.0, 0, 180_000),
        Class::TurbopropTwin => p("phase", 200.0, 12, 8_000, "overhaul", 3600.0, 0, 320_000),
        Class::Bizjet => p("inspection", 300.0, 12, 12_000, "heavy", 3500.0, 48, 350_000),
        Class::RegionalTurboprop => p("a_check", 500.0, 4, 18_000, "c_check", 5000.0, 24, 450_000),
        Class::RegionalJet => p("a_check", 600.0, 4, 30_000, "c_check", 6000.0, 24, 750_000),
        Class::Narrowbody => p("a_check", 750.0, 4, 45_000, "c_check", 7500.0, 24, 1_300_000),
        Class::Widebody => p("a_check", 800.0, 4, 90_000, "c_check", 8000.0, 24, 2_800_000),
    }
}

/// Bir uçağın bakım durumu.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Due {
    pub inspection_left_h: f64,
    pub inspection_left_days: i64,
    pub heavy_left_h: f64,
    /// Takvim sınırı yoksa `None`.
    pub heavy_left_days: Option<i64>,
    /// Saat sınırı geçti ama %10 pay içinde: bakıma götürmek için uçulabilir.
    pub in_tolerance: bool,
    /// Uçamaz (muayene ya da ağır bakım geçti).
    pub grounded: bool,
    pub inspection_cost: i64,
    pub heavy_cost: i64,
}

/// Bakım sayaçları: son muayene ve ağır bakımdan bu yana saat ve zaman.
pub fn due(c: Class, since_inspection_h: f64, inspected_at: i64, since_heavy_h: f64, heavy_at: i64, d: Difficulty, now: i64) -> Due {
    let pr = program(c);
    let insp_left_h = pr.inspection_h - since_inspection_h;
    let insp_left_days = (inspected_at + pr.inspection_months as i64 * MONTH - now).div_euclid(DAY);
    let heavy_left_h = pr.heavy_h - since_heavy_h;
    let heavy_left_days = (pr.heavy_months > 0).then(|| (heavy_at + pr.heavy_months as i64 * MONTH - now).div_euclid(DAY));
    let tolerance = pr.inspection_h * 0.1;
    let hours_over = insp_left_h < 0.0 || heavy_left_h < 0.0;
    let in_tolerance = hours_over && insp_left_h >= -tolerance && heavy_left_h >= -pr.heavy_h * 0.01 - tolerance;
    let calendar_over = insp_left_days < 0 || heavy_left_days.is_some_and(|x| x < 0);
    let grounded = d != Difficulty::Easy && ((hours_over && !in_tolerance) || calendar_over);
    Due {
        inspection_left_h: (insp_left_h * 10.0).round() / 10.0,
        inspection_left_days: insp_left_days,
        heavy_left_h: (heavy_left_h * 10.0).round() / 10.0,
        heavy_left_days,
        in_tolerance,
        grounded,
        inspection_cost: (pr.inspection_cost as f64 * d.costs()).round() as i64,
        heavy_cost: (pr.heavy_cost as f64 * d.costs()).round() as i64,
    }
}

/// Sigorta primi (uçuş saati başına): değerin %0,0025'i, her kaza %25 artırır.
pub fn premium_per_hour(value: i64, crashes: u32, d: Difficulty) -> i64 {
    (value as f64 * 0.000_025 * (1.0 + 0.25 * crashes as f64) * d.costs()).round() as i64
}

/// Sigortalı hasarda pilotun ödediği muafiyet: uçak değerinin %5'i (onarım bedelinden fazla olamaz).
pub fn deductible(value: i64, repair: i64) -> i64 {
    ((value as f64 * 0.05).round() as i64).min(repair)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::aircraft::CLASSES;

    const NOW: i64 = 1_800_000_000;

    #[test]
    fn programs_are_ordered() {
        for c in &CLASSES {
            let p = program(c.id);
            assert!(p.inspection_h < p.heavy_h && p.inspection_cost < p.heavy_cost, "{:?}", c.id);
        }
        assert_eq!(program(Class::Narrowbody).inspection, "a_check");
        assert_eq!(program(Class::LightPiston).inspection_h, 100.0);
    }

    #[test]
    fn hours_calendar_and_tolerance() {
        let fresh = due(Class::LightPiston, 0.0, NOW, 0.0, NOW, Difficulty::Normal, NOW);
        assert!(!fresh.grounded && fresh.inspection_left_h == 100.0 && fresh.inspection_left_days >= 359);
        // 105 saat: %10 pay içinde, uçabilir (bakıma götürmek için).
        let d = due(Class::LightPiston, 105.0, NOW, 105.0, NOW, Difficulty::Normal, NOW);
        assert!(d.in_tolerance && !d.grounded);
        // 112 saat: yere bağlı; Kolay'da yalnızca uyarı.
        assert!(due(Class::LightPiston, 112.0, NOW, 112.0, NOW, Difficulty::Normal, NOW).grounded);
        assert!(!due(Class::LightPiston, 112.0, NOW, 112.0, NOW, Difficulty::Easy, NOW).grounded);
        // Yıllık muayene: 13 ay sonra yere bağlı.
        assert!(due(Class::LightPiston, 10.0, NOW, 10.0, NOW, Difficulty::Normal, NOW + 13 * MONTH).grounded);
        // A bakımı 4 ayda bir; C bakımının takvimi 24 ay.
        let a = due(Class::Narrowbody, 100.0, NOW, 100.0, NOW, Difficulty::Normal, NOW + 5 * MONTH);
        assert!(a.grounded && a.heavy_left_days.unwrap() > 0);
        // Motor revizyonu (saat): 2000 saat.
        assert!(due(Class::LightPiston, 0.0, NOW, 2100.0, NOW, Difficulty::Normal, NOW).grounded);
        assert!(d.inspection_cost > 0 && d.heavy_cost > d.inspection_cost);
    }

    #[test]
    fn insurance_numbers() {
        assert_eq!(premium_per_hour(1_000_000, 0, Difficulty::Normal), 25);
        assert!(premium_per_hour(1_000_000, 2, Difficulty::Normal) > 25);
        assert_eq!(deductible(1_000_000, 200_000), 50_000);
        assert_eq!(deductible(1_000_000, 10_000), 10_000);
    }
}
