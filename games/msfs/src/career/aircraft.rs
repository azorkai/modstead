//! Uçak sınıfları: kariyerin ekonomisi, lisansları ve iş üretimi uçağın kendisine değil sınıfına bakar.
//!
//! Bir uçağın sınıfı iki yoldan bulunur:
//! 1. **Simden okunan değerler** (en güvenilir): motor türü, motor sayısı, azami kalkış ağırlığı, kategori.
//!    Kullanıcı bir uçağa ilk bindiğinde öğrenilir ve saklanır.
//! 2. **Ad kalıpları**: henüz binilmemiş uçaklar için başlık ve ATC modeli ("C172", "A20N", "King Air"…).
//!
//! Kullanıcı her zaman elle düzeltebilir (`overrides`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Class {
    LightPiston,
    PistonTwin,
    TurbopropSingle,
    TurbopropTwin,
    RegionalTurboprop,
    Bizjet,
    RegionalJet,
    Narrowbody,
    Widebody,
    Helicopter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Fuel {
    Avgas,
    JetA,
}

/// Bir sınıfın tipik değerleri. Ekonomi bunlarla hesaplanır; gerçek uçuşta harcanan yakıt ve süre kullanılır.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassInfo {
    pub id: Class,
    pub name_tr: &'static str,
    pub name_en: &'static str,
    pub examples: &'static str,
    /// Tipik yolcu koltuğu ve kargo kapasitesi (kg).
    pub seats: u32,
    pub cargo_kg: u32,
    pub cruise_kt: u32,
    /// İş üretiminde hedef menzil (nm).
    pub min_leg_nm: u32,
    pub max_leg_nm: u32,
    /// En kısa uygun pist (ft); 0 = pist gerekmez.
    pub min_runway_ft: u32,
    /// Kaplamasız (çim, toprak) piste inebilir mi?
    pub unpaved: bool,
    pub burn_kg_h: f64,
    pub fuel: Fuel,
    /// Kiralama ($/blok saat, yakıtsız), satın alma ($, oyun ölçeğinde: gerçeğin yaklaşık yarısı), bakım ($/saat).
    pub rent_h: i64,
    pub price: i64,
    pub maint_h: i64,
    /// Operatör adına uçarken pilotun saatlik ücreti.
    pub wage_h: i64,
    /// Park yeri seçimi için gereken yarıçap (m).
    pub parking_radius_m: f32,
    /// Bu sınıfı uçurmak için gereken lisans ve yetkiler (hepsi).
    pub licenses: &'static [&'static str],
    /// İnişte "iyi" sayılan dikey hız sınırı (fpm). Ağır uçaklar biraz daha sert iner.
    pub firm_fpm: f64,
}

pub const CLASSES: [ClassInfo; 10] = [
    ClassInfo {
        id: Class::LightPiston,
        name_tr: "Hafif pistonlu",
        name_en: "Light piston",
        examples: "C152, C172, DA40, PA-28, Cub",
        seats: 3,
        cargo_kg: 250,
        cruise_kt: 110,
        min_leg_nm: 15,
        max_leg_nm: 260,
        min_runway_ft: 1400,
        unpaved: true,
        burn_kg_h: 30.0,
        fuel: Fuel::Avgas,
        rent_h: 140,
        price: 85_000,
        maint_h: 25,
        wage_h: 70,
        parking_radius_m: 6.0,
        licenses: &["spl"],
        firm_fpm: 300.0,
    },
    ClassInfo {
        id: Class::PistonTwin,
        name_tr: "Çift motorlu pistonlu",
        name_en: "Piston twin",
        examples: "Baron G58, DA62, Seneca",
        seats: 5,
        cargo_kg: 550,
        cruise_kt: 175,
        min_leg_nm: 60,
        max_leg_nm: 650,
        min_runway_ft: 2500,
        unpaved: false,
        burn_kg_h: 75.0,
        fuel: Fuel::Avgas,
        rent_h: 380,
        price: 350_000,
        maint_h: 70,
        wage_h: 105,
        parking_radius_m: 8.0,
        licenses: &["ppl", "me"],
        firm_fpm: 320.0,
    },
    ClassInfo {
        id: Class::TurbopropSingle,
        name_tr: "Tek motorlu turboprop",
        name_en: "Single turboprop",
        examples: "Caravan, Kodiak, PC-12, TBM 930",
        seats: 8,
        cargo_kg: 1200,
        cruise_kt: 210,
        min_leg_nm: 40,
        max_leg_nm: 900,
        min_runway_ft: 1800,
        unpaved: true,
        burn_kg_h: 180.0,
        fuel: Fuel::JetA,
        rent_h: 750,
        price: 1_200_000,
        maint_h: 140,
        wage_h: 150,
        parking_radius_m: 9.0,
        licenses: &["cpl"],
        firm_fpm: 320.0,
    },
    ClassInfo {
        id: Class::TurbopropTwin,
        name_tr: "Çift motorlu turboprop",
        name_en: "Twin turboprop",
        examples: "King Air 350, Twin Otter",
        seats: 9,
        cargo_kg: 1500,
        cruise_kt: 280,
        min_leg_nm: 80,
        max_leg_nm: 1200,
        min_runway_ft: 3200,
        unpaved: false,
        burn_kg_h: 330.0,
        fuel: Fuel::JetA,
        rent_h: 1300,
        price: 2_200_000,
        maint_h: 220,
        wage_h: 190,
        parking_radius_m: 11.0,
        licenses: &["cpl", "me"],
        firm_fpm: 340.0,
    },
    ClassInfo {
        id: Class::RegionalTurboprop,
        name_tr: "Bölgesel turboprop",
        name_en: "Regional turboprop",
        examples: "ATR 42/72, Dash 8 Q400",
        seats: 68,
        cargo_kg: 7000,
        cruise_kt: 275,
        min_leg_nm: 80,
        max_leg_nm: 750,
        min_runway_ft: 4000,
        unpaved: false,
        burn_kg_h: 750.0,
        fuel: Fuel::JetA,
        rent_h: 2400,
        price: 9_000_000,
        maint_h: 420,
        wage_h: 260,
        parking_radius_m: 15.0,
        licenses: &["atpl"],
        firm_fpm: 360.0,
    },
    ClassInfo {
        id: Class::Bizjet,
        name_tr: "İş jeti",
        name_en: "Business jet",
        examples: "Citation CJ4, Longitude, HondaJet, Vision Jet",
        seats: 8,
        cargo_kg: 900,
        cruise_kt: 430,
        min_leg_nm: 150,
        max_leg_nm: 2200,
        min_runway_ft: 4000,
        unpaved: false,
        burn_kg_h: 650.0,
        fuel: Fuel::JetA,
        rent_h: 2600,
        price: 6_000_000,
        maint_h: 450,
        wage_h: 300,
        parking_radius_m: 12.0,
        licenses: &["cpl", "ir", "jet"],
        firm_fpm: 340.0,
    },
    ClassInfo {
        id: Class::RegionalJet,
        name_tr: "Bölgesel jet",
        name_en: "Regional jet",
        examples: "CRJ 550/700, E175, A220",
        seats: 80,
        cargo_kg: 9000,
        cruise_kt: 450,
        min_leg_nm: 150,
        max_leg_nm: 1500,
        min_runway_ft: 5500,
        unpaved: false,
        burn_kg_h: 1700.0,
        fuel: Fuel::JetA,
        rent_h: 3600,
        price: 14_000_000,
        maint_h: 650,
        wage_h: 380,
        parking_radius_m: 16.0,
        licenses: &["atpl", "jet"],
        firm_fpm: 380.0,
    },
    ClassInfo {
        id: Class::Narrowbody,
        name_tr: "Dar gövde jet",
        name_en: "Narrowbody jet",
        examples: "A320neo, A321, 737-800, 737 MAX",
        seats: 170,
        cargo_kg: 18_000,
        cruise_kt: 450,
        min_leg_nm: 200,
        max_leg_nm: 3000,
        min_runway_ft: 6500,
        unpaved: false,
        burn_kg_h: 2500.0,
        fuel: Fuel::JetA,
        rent_h: 5200,
        price: 28_000_000,
        maint_h: 900,
        wage_h: 500,
        parking_radius_m: 20.0,
        licenses: &["atpl", "narrow"],
        firm_fpm: 400.0,
    },
    ClassInfo {
        id: Class::Widebody,
        name_tr: "Geniş gövde jet",
        name_en: "Widebody jet",
        examples: "787, 777, A330, A350, 747",
        seats: 300,
        cargo_kg: 45_000,
        cruise_kt: 490,
        min_leg_nm: 1200,
        max_leg_nm: 7500,
        min_runway_ft: 8500,
        unpaved: false,
        burn_kg_h: 6500.0,
        fuel: Fuel::JetA,
        rent_h: 11_000,
        price: 80_000_000,
        maint_h: 1800,
        wage_h: 750,
        parking_radius_m: 33.0,
        licenses: &["atpl", "wide"],
        firm_fpm: 420.0,
    },
    ClassInfo {
        id: Class::Helicopter,
        name_tr: "Helikopter",
        name_en: "Helicopter",
        examples: "H125, H135, Bell 407, Cabri G2",
        seats: 5,
        cargo_kg: 500,
        cruise_kt: 120,
        min_leg_nm: 8,
        max_leg_nm: 160,
        min_runway_ft: 0,
        unpaved: true,
        burn_kg_h: 150.0,
        fuel: Fuel::JetA,
        rent_h: 900,
        price: 900_000,
        maint_h: 200,
        wage_h: 160,
        parking_radius_m: 8.0,
        licenses: &["ppl", "heli"],
        firm_fpm: 250.0,
    },
];

pub fn info(c: Class) -> &'static ClassInfo {
    CLASSES.iter().find(|i| i.id == c).expect("her sınıfın tanımı var")
}

pub fn name(c: Class) -> &'static str {
    let i = info(c);
    modstead_core::tr!(i.name_tr, i.name_en)
}

/// Simden okunan, sınıflandırmaya yetecek değerler.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct SimSpecs {
    /// `CATEGORY`: "Airplane", "Helicopter", "Glider"…
    pub category: String,
    /// `ENGINE TYPE`: 0 piston, 1 jet, 2 yok, 3 helikopter türbini, 4 desteklenmiyor, 5 turboprop
    pub engine_type: i32,
    pub engines: u32,
    pub mtow_lb: f64,
    pub empty_lb: f64,
    pub fuel_capacity_gal: f64,
    pub cruise_kt: f64,
    pub payload_stations: u32,
    /// MSFS 2024'ün `MAX TAKEOFF WEIGHT` ve `MAX LANDING WEIGHT` değerleri (lb; 2020'de yok, 0).
    pub max_takeoff_lb: f64,
    pub max_landing_lb: f64,
}

/// Simden okunan değerlerle sınıf. Belirsizse `None` (ör. planör).
pub fn classify_specs(s: &SimSpecs) -> Option<Class> {
    let cat = s.category.to_ascii_lowercase();
    if cat.contains("helicopter") || s.engine_type == 3 {
        return Some(Class::Helicopter);
    }
    if cat.contains("glider") || cat.contains("boat") || s.engine_type == 2 {
        return None;
    }
    let mtow = s.mtow_lb;
    let twin = s.engines >= 2;
    Some(match s.engine_type {
        0 => {
            if twin {
                Class::PistonTwin
            } else {
                Class::LightPiston
            }
        }
        5 => match (twin, mtow) {
            (false, _) => Class::TurbopropSingle,
            (true, m) if m > 25_000.0 => Class::RegionalTurboprop,
            _ => Class::TurbopropTwin,
        },
        1 => match mtow {
            m if m <= 0.0 => Class::Bizjet,
            m if m < 48_000.0 => Class::Bizjet,
            m if m < 160_000.0 => Class::RegionalJet,
            m if m < 260_000.0 => Class::Narrowbody,
            _ => Class::Widebody,
        },
        _ => return None,
    })
}

/// Ad kalıpları (başlık ya da ATC modeli içinde, büyük/küçük harf duyarsız). Sıra önemlidir: ilk eşleşen kazanır.
const PATTERNS: &[(&str, Class)] = &[
    // Helikopterler
    ("h125", Class::Helicopter),
    ("as350", Class::Helicopter),
    ("h135", Class::Helicopter),
    ("h145", Class::Helicopter),
    ("h160", Class::Helicopter),
    ("bell 407", Class::Helicopter),
    ("b407", Class::Helicopter),
    ("cabri", Class::Helicopter),
    ("r44", Class::Helicopter),
    ("r66", Class::Helicopter),
    ("r22", Class::Helicopter),
    ("ec135", Class::Helicopter),
    ("helicopter", Class::Helicopter),
    ("puma", Class::Helicopter),
    ("chinook", Class::Helicopter),
    ("black hawk", Class::Helicopter),
    ("uh-60", Class::Helicopter),
    // Geniş gövde
    ("747", Class::Widebody),
    ("b748", Class::Widebody),
    ("777", Class::Widebody),
    ("787", Class::Widebody),
    ("b78", Class::Widebody),
    ("a330", Class::Widebody),
    ("a339", Class::Widebody),
    ("a350", Class::Widebody),
    ("a359", Class::Widebody),
    ("a380", Class::Widebody),
    ("a310", Class::Widebody),
    ("a300", Class::Widebody),
    ("md-11", Class::Widebody),
    ("767", Class::Widebody),
    // Dar gövde
    ("a318", Class::Narrowbody),
    ("a319", Class::Narrowbody),
    ("a320", Class::Narrowbody),
    ("a20n", Class::Narrowbody),
    ("a321", Class::Narrowbody),
    ("a21n", Class::Narrowbody),
    ("a32nx", Class::Narrowbody),
    ("fnx", Class::Narrowbody),
    ("737", Class::Narrowbody),
    ("b73", Class::Narrowbody),
    ("b38m", Class::Narrowbody),
    ("b39m", Class::Narrowbody),
    ("757", Class::Narrowbody),
    ("md-8", Class::Narrowbody),
    // Bölgesel jet
    ("a220", Class::RegionalJet),
    ("bcs3", Class::RegionalJet),
    ("crj", Class::RegionalJet),
    ("e170", Class::RegionalJet),
    ("e175", Class::RegionalJet),
    ("e190", Class::RegionalJet),
    ("e195", Class::RegionalJet),
    ("e-jet", Class::RegionalJet),
    ("bae 146", Class::RegionalJet),
    ("avro rj", Class::RegionalJet),
    // Bölgesel turboprop
    ("atr 42", Class::RegionalTurboprop),
    ("atr 72", Class::RegionalTurboprop),
    ("atr42", Class::RegionalTurboprop),
    ("atr72", Class::RegionalTurboprop),
    ("at76", Class::RegionalTurboprop),
    ("at46", Class::RegionalTurboprop),
    ("dash 8", Class::RegionalTurboprop),
    ("dhc-8", Class::RegionalTurboprop),
    ("q400", Class::RegionalTurboprop),
    ("saab 340", Class::RegionalTurboprop),
    // İş jeti
    ("cj4", Class::Bizjet),
    ("citation", Class::Bizjet),
    ("longitude", Class::Bizjet),
    ("hondajet", Class::Bizjet),
    ("ha420", Class::Bizjet),
    ("vision jet", Class::Bizjet),
    ("sf50", Class::Bizjet),
    ("phenom", Class::Bizjet),
    ("learjet", Class::Bizjet),
    ("challenger", Class::Bizjet),
    ("global ", Class::Bizjet),
    ("gulfstream", Class::Bizjet),
    ("falcon", Class::Bizjet),
    ("pc-24", Class::Bizjet),
    ("eclipse", Class::Bizjet),
    // Çift motorlu turboprop
    ("king air", Class::TurbopropTwin),
    ("kingair", Class::TurbopropTwin),
    ("b350", Class::TurbopropTwin),
    ("twin otter", Class::TurbopropTwin),
    ("dhc-6", Class::TurbopropTwin),
    ("p180", Class::TurbopropTwin),
    ("avanti", Class::TurbopropTwin),
    ("dornier 228", Class::TurbopropTwin),
    // Tek motorlu turboprop
    ("caravan", Class::TurbopropSingle),
    ("c208", Class::TurbopropSingle),
    ("208b", Class::TurbopropSingle),
    ("kodiak", Class::TurbopropSingle),
    ("pc-12", Class::TurbopropSingle),
    ("pc12", Class::TurbopropSingle),
    ("pc-6", Class::TurbopropSingle),
    ("porter", Class::TurbopropSingle),
    ("tbm", Class::TurbopropSingle),
    ("m600", Class::TurbopropSingle),
    ("m700", Class::TurbopropSingle),
    ("beaver", Class::LightPiston),
    // Çift motorlu pistonlu
    ("baron", Class::PistonTwin),
    ("da62", Class::PistonTwin),
    ("da42", Class::PistonTwin),
    ("seneca", Class::PistonTwin),
    ("seminole", Class::PistonTwin),
    ("twin comanche", Class::PistonTwin),
    ("islander", Class::PistonTwin),
    // Hafif pistonlu
    ("c152", Class::LightPiston),
    ("cessna 152", Class::LightPiston),
    ("c172", Class::LightPiston),
    ("cessna 172", Class::LightPiston),
    ("skyhawk", Class::LightPiston),
    ("c182", Class::LightPiston),
    ("c170", Class::LightPiston),
    ("da40", Class::LightPiston),
    ("da20", Class::LightPiston),
    ("dv20", Class::LightPiston),
    ("pa-28", Class::LightPiston),
    ("pa28", Class::LightPiston),
    ("archer", Class::LightPiston),
    ("warrior", Class::LightPiston),
    ("cub", Class::LightPiston),
    ("savage", Class::LightPiston),
    ("icon a5", Class::LightPiston),
    ("bonanza", Class::LightPiston),
    ("sr22", Class::LightPiston),
    ("cirrus", Class::LightPiston),
    ("dr400", Class::LightPiston),
    ("cap10", Class::LightPiston),
    ("extra 330", Class::LightPiston),
    ("pitts", Class::LightPiston),
    ("zlin", Class::LightPiston),
    ("shock ultra", Class::LightPiston),
    ("vl3", Class::LightPiston),
    ("flight design", Class::LightPiston),
    ("husky", Class::LightPiston),
    ("mooney", Class::LightPiston),
    ("c310", Class::PistonTwin),
];

/// Başlık ve ATC modelinden tahmin.
pub fn classify_name(title: &str, atc_model: &str) -> Option<Class> {
    // ATC modeli "TT:ATCCOM.AC_MODEL_C172.0.text" gibi bir yerelleştirme anahtarı olabilir.
    let model = atc_model.to_ascii_lowercase();
    let model = model.strip_prefix("tt:atccom.ac_model_").map(|m| m.split('.').next().unwrap_or(m).to_string()).unwrap_or(model);
    let hay = format!("{} {}", title.to_ascii_lowercase(), model);
    PATTERNS.iter().find(|(p, _)| hay.contains(p)).map(|(_, c)| *c)
}

/// Kullanıcının dış EFB ile yönettiği, dışarıdan yük ve yakıt yazmayı reddeden uçaklar.
pub fn manages_own_loading(title: &str) -> bool {
    let t = title.to_ascii_lowercase();
    ["fenix", "fnx", "pmdg", "inibuilds", "headwind", "a32nx", "flybywire", "maddog", "fslabs", "leonardo", "aerosoft crj"]
        .iter()
        .any(|k| t.contains(k))
}

/// Yapay zekâ trafiği ve gösteri için "pasif" modeller ("Asobo PassiveAircraft Bonanza 33", "Pitts Special S1
/// Reno Passive Toto Asobo"). Kullanıcı bunlarla uçamaz; MSFS 2024'ün listesinde uçakların üçte ikisi bunlardır.
pub fn is_passive(title: &str) -> bool {
    title.split(|c: char| !c.is_ascii_alphanumeric()).any(|w| w.eq_ignore_ascii_case("passive") || w.eq_ignore_ascii_case("passiveaircraft"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passive_models_are_not_offered() {
        assert!(is_passive("Asobo PassiveAircraft Bonanza 33"));
        assert!(is_passive("Asobo Aero L-39 Albatros Passive American Patriot"));
        assert!(is_passive("Pitts Special S1 Reno Passive Toto Asobo"));
        assert!(!is_passive("C172SP G1000 Passengers"));
        assert!(!is_passive("Beechcraft Bonanza"));
    }

    #[test]
    fn every_class_has_info_and_sane_numbers() {
        for c in &CLASSES {
            assert!(c.min_leg_nm < c.max_leg_nm, "{:?}", c.id);
            assert!(c.wage_h > 0 && c.rent_h > c.wage_h, "{:?}", c.id);
            assert!(!c.licenses.is_empty());
            assert_eq!(info(c.id).id, c.id);
        }
    }

    #[test]
    fn classifies_from_sim_specs() {
        let s = |cat: &str, et: i32, n: u32, mtow: f64| SimSpecs { category: cat.into(), engine_type: et, engines: n, mtow_lb: mtow, ..Default::default() };
        assert_eq!(classify_specs(&s("Airplane", 0, 1, 2550.0)), Some(Class::LightPiston));
        assert_eq!(classify_specs(&s("Airplane", 0, 2, 5500.0)), Some(Class::PistonTwin));
        assert_eq!(classify_specs(&s("Airplane", 5, 1, 7394.0)), Some(Class::TurbopropSingle));
        assert_eq!(classify_specs(&s("Airplane", 5, 2, 15000.0)), Some(Class::TurbopropTwin));
        assert_eq!(classify_specs(&s("Airplane", 5, 2, 50700.0)), Some(Class::RegionalTurboprop));
        assert_eq!(classify_specs(&s("Airplane", 1, 2, 17110.0)), Some(Class::Bizjet));
        assert_eq!(classify_specs(&s("Airplane", 1, 2, 85500.0)), Some(Class::RegionalJet));
        assert_eq!(classify_specs(&s("Airplane", 1, 2, 174_200.0)), Some(Class::Narrowbody));
        assert_eq!(classify_specs(&s("Airplane", 1, 2, 560_000.0)), Some(Class::Widebody));
        assert_eq!(classify_specs(&s("Helicopter", 3, 1, 5200.0)), Some(Class::Helicopter));
        assert_eq!(classify_specs(&s("Glider", 2, 0, 1100.0)), None);
    }

    #[test]
    fn classifies_from_names() {
        assert_eq!(classify_name("Cessna Skyhawk G1000 Asobo", ""), Some(Class::LightPiston));
        assert_eq!(classify_name("FenixA320 IAE - Turkish", ""), Some(Class::Narrowbody));
        assert_eq!(classify_name("Airbus A320 Neo Asobo", "TT:ATCCOM.AC_MODEL_A20N.0.text"), Some(Class::Narrowbody));
        assert_eq!(classify_name("Beechcraft King Air 350i", ""), Some(Class::TurbopropTwin));
        assert_eq!(classify_name("Boeing 787-10 Asobo", ""), Some(Class::Widebody));
        assert_eq!(classify_name("Airbus H125", ""), Some(Class::Helicopter));
        assert_eq!(classify_name("Daher TBM 930 Asobo", ""), Some(Class::TurbopropSingle));
        assert_eq!(classify_name("Cessna Citation CJ4", ""), Some(Class::Bizjet));
        assert_eq!(classify_name("ATR 72-600", ""), Some(Class::RegionalTurboprop));
        assert_eq!(classify_name("Bilinmeyen Kuş", ""), None);
        assert!(manages_own_loading("PMDG 737-800 THY"));
        assert!(!manages_own_loading("Cessna 172 Asobo"));
    }
}
