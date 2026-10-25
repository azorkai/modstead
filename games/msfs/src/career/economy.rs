//! Ekonomi: iş ücretleri, masraflar ve uçuş sonrası hesap.
//!
//! İki çalışma biçimi vardır (OnAir'in "serbest/şirket" ve MSFS 2024'ün "çalışan" kipinden):
//! - **Operatör adına:** uçak, yakıt ve harçlar operatörün; pilot saatlik ücret alır. Risk yok, kazanç sınırlı.
//! - **Kendi hesabına** (CPL'den sonra): pilot işi doğrudan alır; kira (ya da kendi uçağının bakımı), yakıt ve
//!   iniş harcını öder. Piyasa ücreti o sınıfın tipik işletme maliyeti + %10 ve doluluğa göre operatör
//!   ücretinin 1–2 katı kâr payıdır; verimli uçan (az yakıt, kısa blok süresi, kendi uçağı) daha çok kazanır.
//!
//! Kısa uçuşlara ek ücret uygulanır: yarım saatlik oturumlar da değerli olsun.
//! Formüller burada ve `games/msfs/KARIYER.md`de açıktır; arayüz uçuş sonu dökümünü bundan gösterir.

use serde::{Deserialize, Serialize};

use super::aircraft::{Class, ClassInfo, Fuel, info};
use super::airports::Size;
use super::progression::{Difficulty, reputation_multiplier};

/// Yolcu başına (bagajla) ağırlık.
pub const PAX_KG: f64 = 90.0;
pub const LB_PER_KG: f64 = 2.204_62;

pub fn fuel_price_kg(f: Fuel) -> f64 {
    match f {
        Fuel::Avgas => 2.5,
        Fuel::JetA => 0.95,
    }
}

/// Sınıfın tipik azami kalkış ağırlığı (lb); iniş harcı bununla hesaplanır.
pub fn typical_mtow_lb(c: Class) -> f64 {
    match c {
        Class::LightPiston => 2_550.0,
        Class::PistonTwin => 5_500.0,
        Class::TurbopropSingle => 8_000.0,
        Class::TurbopropTwin => 15_000.0,
        Class::RegionalTurboprop => 50_000.0,
        Class::Bizjet => 20_000.0,
        Class::RegionalJet => 85_000.0,
        Class::Narrowbody => 174_000.0,
        Class::Widebody => 560_000.0,
        Class::Helicopter => 5_000.0,
    }
}

/// İniş harcı: 7 $ / 1000 lb azami ağırlık (OnAir), havalimanı büyüklüğüyle ölçeklenir.
pub fn landing_fee(c: Class, size: Size, d: Difficulty) -> i64 {
    let mult = match size {
        Size::Large => 1.5,
        Size::Medium => 1.0,
        Size::Small => 0.3,
        Size::Seaplane => 0.3,
    };
    (7.0 * typical_mtow_lb(c) / 1000.0 * mult * d.costs()).round() as i64
}

fn taxi_minutes(c: Class) -> f64 {
    match c {
        Class::Helicopter => 4.0,
        Class::LightPiston => 8.0,
        Class::PistonTwin | Class::TurbopropSingle | Class::TurbopropTwin => 10.0,
        Class::Bizjet => 12.0,
        Class::RegionalTurboprop => 15.0,
        Class::RegionalJet => 18.0,
        Class::Narrowbody => 22.0,
        Class::Widebody => 28.0,
    }
}

/// Uçuş planı tahmini.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Plan {
    pub distance_nm: f64,
    pub block_min: f64,
    pub air_min: f64,
    /// Yol yakıtı + yedek (piston 45 dk, türbin 30 dk + %5).
    pub fuel_kg: f64,
    pub payload_kg: f64,
    pub cruise_alt_ft: u32,
}

pub fn plan(c: Class, distance_nm: f64, pax: u32, cargo_kg: u32) -> Plan {
    let i = info(c);
    let overhead_h = if matches!(c, Class::LightPiston | Class::Helicopter) { 0.08 } else { 0.15 };
    let air_h = distance_nm / (i.cruise_kt as f64 * 0.85) + overhead_h;
    let block_h = air_h + taxi_minutes(c) / 60.0;
    let reserve_h = if i.fuel == Fuel::Avgas { 0.75 } else { 0.5 };
    let fuel_kg = (air_h * 1.05 + reserve_h) * i.burn_kg_h + taxi_minutes(c) / 60.0 * i.burn_kg_h * 0.3;
    // Yüksek ve uzun uçuşlarda daha yüksek seyir.
    let cruise_alt_ft = match c {
        Class::LightPiston | Class::Helicopter => (((distance_nm / 25.0).clamp(2.0, 9.5)) * 1000.0) as u32 / 500 * 500,
        Class::PistonTwin | Class::TurbopropSingle => (((distance_nm / 30.0).clamp(5.0, 25.0)) * 1000.0) as u32 / 1000 * 1000,
        Class::TurbopropTwin | Class::RegionalTurboprop => (((distance_nm / 20.0).clamp(10.0, 27.0)) * 1000.0) as u32 / 1000 * 1000,
        _ => (((distance_nm / 12.0).clamp(15.0, 39.0)) * 1000.0) as u32 / 1000 * 1000,
    };
    Plan {
        distance_nm,
        block_min: (block_h * 60.0).round(),
        air_min: (air_h * 60.0).round(),
        fuel_kg: fuel_kg.round(),
        payload_kg: (pax as f64 * PAX_KG + cargo_kg as f64).round(),
        cruise_alt_ft,
    }
}

/// İş türünün ücret çarpanı.
pub fn kind_multiplier(kind: &str) -> f64 {
    match kind {
        "medical" => 1.4,
        "urgent" => 1.35,
        "bush" => 1.3,
        "charter" => 1.25,
        "passenger" | "airline" => 1.0,
        "cargo" => 1.0,
        "ferry" => 0.8,
        "training" => 1.0,
        _ => 1.0,
    }
}

/// Kısa uçuş eki: 150 nm altında artan, 30 nm'de ≈ ×1.5.
pub fn short_leg_bonus(distance_nm: f64) -> f64 {
    if distance_nm >= 150.0 { 0.0 } else { 0.6 * (1.0 - distance_nm / 150.0) }
}

/// Operatör adına uçuş ücreti (masrafsız).
pub fn wage_pay(c: &ClassInfo, plan: &Plan, kind: &str, rep: f64, d: Difficulty) -> i64 {
    let h = plan.block_min / 60.0;
    if kind == "training" {
        // Uçuş okulu bursu: eğitim uçuşları az ama kesin kazandırır.
        return ((40.0 + 30.0 * h) / d.costs().sqrt()).round() as i64;
    }
    let base = c.wage_h as f64 * (0.5 + h) * (1.0 + short_leg_bonus(plan.distance_nm));
    round10(base * kind_multiplier(kind) * reputation_multiplier(rep) / d.costs().sqrt())
}

/// Kendi hesabına uçuşun piyasa ücreti ve tipik masraf dökümü.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Quote {
    pub revenue: i64,
    pub est_rent: i64,
    pub est_fuel: i64,
    pub est_fees: i64,
    pub est_profit: i64,
}

pub fn contract_quote(c: &ClassInfo, plan: &Plan, kind: &str, load_fraction: f64, dest: Size, rep: f64, d: Difficulty) -> Quote {
    let h = plan.block_min / 60.0;
    let rent = c.rent_h as f64 * h * d.costs();
    let fuel_used = (plan.air_min / 60.0) * c.burn_kg_h;
    let fuel = fuel_used * fuel_price_kg(c.fuel) * d.costs();
    let fees = landing_fee(c.id, dest, d) as f64;
    let typical = rent + fuel + fees;
    // Masraflar %10 payla karşılanır; kâr kısmı aynı işin operatör ücretinin 1,0–2,0 katıdır (doluluğa göre).
    let wage_part = c.wage_h as f64 * (0.5 + h) * (1.0 + short_leg_bonus(plan.distance_nm));
    let load = 0.4 + 0.6 * load_fraction.clamp(0.0, 1.0);
    let profit_part = wage_part * 2.0 * load * kind_multiplier(kind) * reputation_multiplier(rep) / d.costs().sqrt();
    let revenue = round10(typical * 1.1 + profit_part);
    let (est_rent, est_fuel, est_fees) = (rent.round() as i64, fuel.round() as i64, fees.round() as i64);
    Quote { revenue, est_rent, est_fuel, est_fees, est_profit: revenue - est_rent - est_fuel - est_fees }
}

fn round10(v: f64) -> i64 {
    ((v / 10.0).round() * 10.0) as i64
}

/// Yolcu olarak başka bir havalimanına geçmenin bilet ücreti.
pub fn ticket_price(distance_nm: f64, d: Difficulty) -> i64 {
    round10((60.0 + 0.12 * distance_nm) * d.costs())
}

/// Sahip olunan uçağın alış ve satış fiyatı.
pub fn purchase_price(c: Class, d: Difficulty) -> i64 {
    (info(c).price as f64 * d.costs()).round() as i64
}

pub fn resale_value(c: Class, condition: f64, d: Difficulty) -> i64 {
    round10(purchase_price(c, d) as f64 * 0.7 * (condition.clamp(0.0, 100.0) / 100.0).max(0.2))
}

/// Durumu bir puan yükseltmenin bakım bedeli.
pub fn repair_cost_per_point(c: Class, d: Difficulty) -> i64 {
    ((info(c).maint_h * 10) as f64 * d.costs()).round() as i64
}

/// Kredi üst sınırı: seviyeyle ve filonun değeriyle (teminat) büyür; itibar ±%50 etkiler.
pub fn credit_limit(level: u32, reputation: f64, fleet_value: i64) -> i64 {
    let base = 20_000.0 * (level.max(1) as f64).powi(2);
    let rep = 0.5 + reputation.clamp(0.0, 100.0) / 100.0;
    round10(base * rep + fleet_value as f64 * 0.5)
}

/// Kredi açılış masrafı (borca eklenir; zamana bağlı faiz yok).
pub fn loan_fee_rate(d: Difficulty) -> f64 {
    match d {
        Difficulty::Easy => 0.05,
        Difficulty::Normal => 0.10,
        Difficulty::Realistic => 0.15,
    }
}

/// Kazançlı bir uçuştan borca giden pay.
pub const LOAN_SHARE: f64 = 0.25;

/// Blok saati başına durum kaybı (OnAir: 100 saatte %12).
pub const WEAR_PER_HOUR: f64 = 0.12;
/// Bu durumun altında uçak uçamaz.
pub const GROUNDED_BELOW: f64 = 40.0;

/// İnişin sertliğine göre hasar sınıfı.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Damage {
    #[default]
    None,
    /// Muayene gerekir.
    Inspection,
    /// Yapısal hasar.
    Structural,
    Crash,
}

pub fn landing_damage(c: Class, fpm: f64, g: f64) -> Damage {
    let firm = info(c).firm_fpm;
    if fpm > firm * 2.0 || g > 2.6 {
        Damage::Structural
    } else if fpm > firm * 1.5 || g > 2.0 {
        Damage::Inspection
    } else {
        Damage::None
    }
}

/// Uçuş sonu hesap dökümü (arayüzde satır satır gösterilir).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Settlement {
    pub pay: i64,
    pub late_penalty: i64,
    pub rent: i64,
    pub fuel: i64,
    pub fees: i64,
    pub maintenance: i64,
    pub damage: i64,
    pub net: i64,
}

impl Settlement {
    pub fn finish(mut self) -> Self {
        self.net = self.pay - self.late_penalty - self.rent - self.fuel - self.fees - self.maintenance - self.damage;
        self
    }
}

/// Gecikme cezası: her saat için %10, en çok %50.
pub fn late_penalty(pay: i64, late_min: f64) -> i64 {
    if late_min <= 0.0 {
        return 0;
    }
    (pay as f64 * (late_min / 60.0 * 0.10).min(0.5)).round() as i64
}

/// Kiralık uçakta hasar bedeli (sigorta muafiyeti) ya da kendi uçağında durum kaybı.
pub fn damage_cost(c: Class, dmg: Damage, owned: bool, d: Difficulty) -> (i64, f64) {
    let i = info(c);
    let rent = i.rent_h as f64 * d.costs();
    match (dmg, owned) {
        (Damage::None, _) => (0, 0.0),
        (Damage::Inspection, false) => ((rent * 0.5).round() as i64, 0.0),
        (Damage::Inspection, true) => (0, 2.0),
        (Damage::Structural, false) => ((rent * 3.0).round() as i64, 0.0),
        (Damage::Structural, true) => (0, 8.0),
        (Damage::Crash, false) => ((rent * 20.0).round() as i64, 0.0),
        (Damage::Crash, true) => (0, 100.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::aircraft::CLASSES;

    #[test]
    fn plans_are_reasonable() {
        let p = plan(Class::LightPiston, 100.0, 1, 50);
        assert!((60.0..90.0).contains(&p.block_min), "{p:?}");
        assert!(p.fuel_kg > 40.0 && p.fuel_kg < 90.0, "{p:?}");
        assert_eq!(p.payload_kg, 140.0);
        let j = plan(Class::Narrowbody, 600.0, 150, 2000);
        assert!((90.0..130.0).contains(&j.block_min), "{j:?}");
        assert!(j.cruise_alt_ft >= 30_000);
    }

    #[test]
    fn contract_work_is_profitable_when_flown_typically() {
        for c in &CLASSES {
            for nm in [c.min_leg_nm as f64, (c.min_leg_nm + c.max_leg_nm) as f64 / 2.0, c.max_leg_nm as f64] {
                let p = plan(c.id, nm, c.seats / 2, 0);
                let q = contract_quote(c, &p, "cargo", 0.5, Size::Medium, 50.0, Difficulty::Normal);
                assert!(q.est_profit > 0, "{:?} {nm}nm {q:?}", c.id);
                // Kendi hesabına uçmak ortalamada operatör ücretinden kazançlı olsun (risk primi).
                let w = wage_pay(c, &p, "cargo", 50.0, Difficulty::Normal);
                assert!(q.est_profit as f64 > w as f64 * 0.8, "{:?} {nm}nm kâr {} ücret {w}", c.id, q.est_profit);
            }
        }
    }

    #[test]
    fn short_legs_pay_well_per_hour() {
        let c = info(Class::LightPiston);
        let short = plan(c.id, 30.0, 1, 0);
        let long = plan(c.id, 200.0, 1, 0);
        let per_h = |p: &Plan| wage_pay(c, p, "cargo", 50.0, Difficulty::Normal) as f64 / (p.block_min / 60.0);
        assert!(per_h(&short) > per_h(&long));
    }

    #[test]
    fn penalties_and_damage() {
        assert_eq!(late_penalty(1000, 0.0), 0);
        assert_eq!(late_penalty(1000, 60.0), 100);
        assert_eq!(late_penalty(1000, 6000.0), 500);
        assert_eq!(landing_damage(Class::LightPiston, 200.0, 1.3), Damage::None);
        assert_eq!(landing_damage(Class::LightPiston, 500.0, 1.5), Damage::Inspection);
        assert_eq!(landing_damage(Class::LightPiston, 700.0, 1.5), Damage::Structural);
        assert_eq!(damage_cost(Class::Narrowbody, Damage::Structural, true, Difficulty::Normal), (0, 8.0));
        assert!(damage_cost(Class::Narrowbody, Damage::Structural, false, Difficulty::Normal).0 > 0);
        assert!(credit_limit(10, 50.0, 0) > credit_limit(5, 50.0, 0));
        assert!(credit_limit(5, 100.0, 0) > credit_limit(5, 0.0, 0));
        assert!(credit_limit(5, 50.0, 1_000_000) > credit_limit(5, 50.0, 0));
        let s = Settlement { pay: 1000, rent: 200, fuel: 100, fees: 20, ..Default::default() }.finish();
        assert_eq!(s.net, 680);
        assert!(landing_fee(Class::Widebody, Size::Large, Difficulty::Normal) > landing_fee(Class::LightPiston, Size::Small, Difficulty::Normal));
    }
}
