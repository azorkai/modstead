//! Uçak sınıfları: kariyerin ekonomisi, lisansları ve iş üretimi uçağın kendisine değil sınıfına bakar.
//!
//! Bir uçağın sınıfı şu yollardan bulunur (sıra `addons::class_for`'da):
//! 1. **ICAO tip kodu** (`ICAO_TYPES`): paketin `icao_type_designator`'ı ya da ATC modeli ("A20N", "B738"). Tip
//!    yetkisi (dar gövde, geniş gövde) sınıftan geldiği için en kesin yol budur.
//! 2. **Simden okunan değerler**: motor türü, motor sayısı, azami kalkış ağırlığı, kategori. Kullanıcı bir uçağa
//!    ilk bindiğinde öğrenilir ve saklanır.
//! 3. **Mod paketinin dosyaları** (`addons`): aynı değerler `engines.cfg` ve `flight_model.cfg`'den; helikopter
//!    klasörü (`SimObjects/Rotorcraft`).
//! 4. **Ad kalıpları**: başlık ve ATC modeli ("C172", "King Air"…).
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

/// Başlık ve ATC modelinden tahmin. ATC modeli bilinen bir ICAO tip kodunu taşıyorsa o kazanır (`classify_icao`).
pub fn classify_name(title: &str, atc_model: &str) -> Option<Class> {
    if let Some(c) = icao_from_atc_model(atc_model).as_deref().and_then(classify_icao) {
        return Some(c);
    }
    // ATC modeli "TT:ATCCOM.AC_MODEL_C172.0.text" gibi bir yerelleştirme anahtarı olabilir.
    let model = icao_from_atc_model(atc_model).map(|m| m.to_ascii_lowercase()).unwrap_or_else(|| atc_model.to_ascii_lowercase());
    let hay = format!("{} {}", title.to_ascii_lowercase(), model);
    PATTERNS.iter().find(|(p, _)| hay.contains(p)).map(|(_, c)| *c)
}

/// ATC modelinden tip kodu: "TT:ATCCOM.AC_MODEL_C172.0.text", "TT:ATCCOM.AC_MODEL A320.0.text" (Fenix boşlukla
/// yazar), "$$:B738" ya da düz "A20N". Kod 2–4 harf/rakamdır; değilse `None`.
pub fn icao_from_atc_model(atc_model: &str) -> Option<String> {
    let m = atc_model.trim().trim_matches('"');
    let lower = m.to_ascii_lowercase();
    let m = match lower.find("ac_model") {
        Some(i) => {
            let rest = &m[i + "ac_model".len()..];
            let rest = rest.trim_start_matches(['_', ' ']);
            rest.split('.').next().unwrap_or(rest)
        }
        None => m.trim_start_matches("$$:"),
    };
    let m = m.trim().to_ascii_uppercase();
    (m.len() >= 2 && m.len() <= 4 && m.chars().all(|c| c.is_ascii_alphanumeric()) && m.chars().any(|c| c.is_ascii_alphabetic())).then_some(m)
}

/// ICAO tip kodları (Doc 8643): kod, sınıf ve gerçek tip adı. Tip yetkisi sınıftan gelir (`ClassInfo.licenses`:
/// dar gövde TR-N, geniş gövde TR-W…); bu tablo yalnızca mod uçağının hangi sınıfta olduğunu kesinleştirir.
/// Ağırlığa göre sınıflandırma sınırdaki tiplerde yanılır (737-700 ve A318 160.000 lb'nin altında, Global 7500
/// 100.000 lb'nin üstünde); tip kodu bilindiğinde ağırlıktan önce gelir.
const ICAO_TYPES: &[(&str, Class, &str)] = &[
    // Dar gövde
    ("A318", Class::Narrowbody, "Airbus A318"),
    ("A319", Class::Narrowbody, "Airbus A319"),
    ("A320", Class::Narrowbody, "Airbus A320"),
    ("A321", Class::Narrowbody, "Airbus A321"),
    ("A19N", Class::Narrowbody, "Airbus A319neo"),
    ("A20N", Class::Narrowbody, "Airbus A320neo"),
    ("A21N", Class::Narrowbody, "Airbus A321neo"),
    ("B712", Class::Narrowbody, "Boeing 717"),
    ("B721", Class::Narrowbody, "Boeing 727-100"),
    ("B722", Class::Narrowbody, "Boeing 727-200"),
    ("B731", Class::Narrowbody, "Boeing 737-100"),
    ("B732", Class::Narrowbody, "Boeing 737-200"),
    ("B733", Class::Narrowbody, "Boeing 737-300"),
    ("B734", Class::Narrowbody, "Boeing 737-400"),
    ("B735", Class::Narrowbody, "Boeing 737-500"),
    ("B736", Class::Narrowbody, "Boeing 737-600"),
    ("B737", Class::Narrowbody, "Boeing 737-700"),
    ("B738", Class::Narrowbody, "Boeing 737-800"),
    ("B739", Class::Narrowbody, "Boeing 737-900"),
    ("B37M", Class::Narrowbody, "Boeing 737 MAX 7"),
    ("B38M", Class::Narrowbody, "Boeing 737 MAX 8"),
    ("B39M", Class::Narrowbody, "Boeing 737 MAX 9"),
    ("B3XM", Class::Narrowbody, "Boeing 737 MAX 10"),
    ("B752", Class::Narrowbody, "Boeing 757-200"),
    ("B753", Class::Narrowbody, "Boeing 757-300"),
    ("DC91", Class::Narrowbody, "Douglas DC-9-10"),
    ("DC93", Class::Narrowbody, "Douglas DC-9-30"),
    ("DC95", Class::Narrowbody, "Douglas DC-9-50"),
    ("MD81", Class::Narrowbody, "McDonnell Douglas MD-81"),
    ("MD82", Class::Narrowbody, "McDonnell Douglas MD-82"),
    ("MD83", Class::Narrowbody, "McDonnell Douglas MD-83"),
    ("MD87", Class::Narrowbody, "McDonnell Douglas MD-87"),
    ("MD88", Class::Narrowbody, "McDonnell Douglas MD-88"),
    ("MD90", Class::Narrowbody, "McDonnell Douglas MD-90"),
    ("T204", Class::Narrowbody, "Tupolev Tu-204"),
    ("C919", Class::Narrowbody, "COMAC C919"),
    // Geniş gövde
    ("A306", Class::Widebody, "Airbus A300-600"),
    ("A30B", Class::Widebody, "Airbus A300B"),
    ("A310", Class::Widebody, "Airbus A310"),
    ("A332", Class::Widebody, "Airbus A330-200"),
    ("A333", Class::Widebody, "Airbus A330-300"),
    ("A338", Class::Widebody, "Airbus A330-800neo"),
    ("A339", Class::Widebody, "Airbus A330-900neo"),
    ("A359", Class::Widebody, "Airbus A350-900"),
    ("A35K", Class::Widebody, "Airbus A350-1000"),
    ("A388", Class::Widebody, "Airbus A380-800"),
    ("B741", Class::Widebody, "Boeing 747-100"),
    ("B742", Class::Widebody, "Boeing 747-200"),
    ("B743", Class::Widebody, "Boeing 747-300"),
    ("B744", Class::Widebody, "Boeing 747-400"),
    ("B748", Class::Widebody, "Boeing 747-8"),
    ("B74S", Class::Widebody, "Boeing 747SP"),
    ("B762", Class::Widebody, "Boeing 767-200"),
    ("B763", Class::Widebody, "Boeing 767-300"),
    ("B764", Class::Widebody, "Boeing 767-400"),
    ("B772", Class::Widebody, "Boeing 777-200"),
    ("B77L", Class::Widebody, "Boeing 777-200LR"),
    ("B773", Class::Widebody, "Boeing 777-300"),
    ("B77W", Class::Widebody, "Boeing 777-300ER"),
    ("B778", Class::Widebody, "Boeing 777-8"),
    ("B779", Class::Widebody, "Boeing 777-9"),
    ("B788", Class::Widebody, "Boeing 787-8"),
    ("B789", Class::Widebody, "Boeing 787-9"),
    ("B78X", Class::Widebody, "Boeing 787-10"),
    ("DC10", Class::Widebody, "McDonnell Douglas DC-10"),
    ("MD11", Class::Widebody, "McDonnell Douglas MD-11"),
    ("L101", Class::Widebody, "Lockheed L-1011 TriStar"),
    ("IL96", Class::Widebody, "Ilyushin Il-96"),
    ("A124", Class::Widebody, "Antonov An-124"),
    // Bölgesel jet
    ("BCS1", Class::RegionalJet, "Airbus A220-100"),
    ("BCS3", Class::RegionalJet, "Airbus A220-300"),
    ("CRJ1", Class::RegionalJet, "Bombardier CRJ100"),
    ("CRJ2", Class::RegionalJet, "Bombardier CRJ200"),
    ("CRJ7", Class::RegionalJet, "Bombardier CRJ700"),
    ("CRJ9", Class::RegionalJet, "Bombardier CRJ900"),
    ("CRJX", Class::RegionalJet, "Bombardier CRJ1000"),
    ("E135", Class::RegionalJet, "Embraer ERJ 135"),
    ("E145", Class::RegionalJet, "Embraer ERJ 145"),
    ("E170", Class::RegionalJet, "Embraer E170"),
    ("E75S", Class::RegionalJet, "Embraer E175"),
    ("E75L", Class::RegionalJet, "Embraer E175"),
    ("E190", Class::RegionalJet, "Embraer E190"),
    ("E195", Class::RegionalJet, "Embraer E195"),
    ("E290", Class::RegionalJet, "Embraer E190-E2"),
    ("E295", Class::RegionalJet, "Embraer E195-E2"),
    ("B461", Class::RegionalJet, "BAe 146-100"),
    ("B462", Class::RegionalJet, "BAe 146-200"),
    ("B463", Class::RegionalJet, "BAe 146-300"),
    ("RJ70", Class::RegionalJet, "Avro RJ70"),
    ("RJ85", Class::RegionalJet, "Avro RJ85"),
    ("RJ1H", Class::RegionalJet, "Avro RJ100"),
    ("F70", Class::RegionalJet, "Fokker 70"),
    ("F100", Class::RegionalJet, "Fokker 100"),
    ("SU95", Class::RegionalJet, "Sukhoi Superjet 100"),
    ("AJ27", Class::RegionalJet, "COMAC ARJ21"),
    // Bölgesel turboprop
    ("AT43", Class::RegionalTurboprop, "ATR 42-300"),
    ("AT45", Class::RegionalTurboprop, "ATR 42-500"),
    ("AT46", Class::RegionalTurboprop, "ATR 42-600"),
    ("AT72", Class::RegionalTurboprop, "ATR 72"),
    ("AT75", Class::RegionalTurboprop, "ATR 72-500"),
    ("AT76", Class::RegionalTurboprop, "ATR 72-600"),
    ("DH8A", Class::RegionalTurboprop, "De Havilland Dash 8-100"),
    ("DH8B", Class::RegionalTurboprop, "De Havilland Dash 8-200"),
    ("DH8C", Class::RegionalTurboprop, "De Havilland Dash 8-300"),
    ("DH8D", Class::RegionalTurboprop, "De Havilland Dash 8-400"),
    ("SF34", Class::RegionalTurboprop, "Saab 340"),
    ("SB20", Class::RegionalTurboprop, "Saab 2000"),
    ("F50", Class::RegionalTurboprop, "Fokker 50"),
    ("JS41", Class::RegionalTurboprop, "BAe Jetstream 41"),
    ("D328", Class::RegionalTurboprop, "Dornier 328"),
    ("E120", Class::RegionalTurboprop, "Embraer EMB 120 Brasilia"),
    // İş jeti
    ("C510", Class::Bizjet, "Cessna Citation Mustang"),
    ("C525", Class::Bizjet, "Cessna CitationJet"),
    ("C25A", Class::Bizjet, "Cessna Citation CJ2"),
    ("C25B", Class::Bizjet, "Cessna Citation CJ3"),
    ("C25C", Class::Bizjet, "Cessna Citation CJ4"),
    ("C25M", Class::Bizjet, "Cessna Citation M2"),
    ("C56X", Class::Bizjet, "Cessna Citation Excel"),
    ("C680", Class::Bizjet, "Cessna Citation Sovereign"),
    ("C68A", Class::Bizjet, "Cessna Citation Latitude"),
    ("C700", Class::Bizjet, "Cessna Citation Longitude"),
    ("C750", Class::Bizjet, "Cessna Citation X"),
    ("HDJT", Class::Bizjet, "Honda HondaJet"),
    ("SF50", Class::Bizjet, "Cirrus Vision Jet"),
    ("EA50", Class::Bizjet, "Eclipse 500"),
    ("E50P", Class::Bizjet, "Embraer Phenom 100"),
    ("E55P", Class::Bizjet, "Embraer Phenom 300"),
    ("E545", Class::Bizjet, "Embraer Praetor 500"),
    ("E550", Class::Bizjet, "Embraer Praetor 600"),
    ("LJ35", Class::Bizjet, "Learjet 35"),
    ("LJ45", Class::Bizjet, "Learjet 45"),
    ("LJ75", Class::Bizjet, "Learjet 75"),
    ("CL30", Class::Bizjet, "Bombardier Challenger 300"),
    ("CL35", Class::Bizjet, "Bombardier Challenger 350"),
    ("CL60", Class::Bizjet, "Bombardier Challenger 650"),
    ("GLEX", Class::Bizjet, "Bombardier Global Express"),
    ("GL5T", Class::Bizjet, "Bombardier Global 5000"),
    ("GL7T", Class::Bizjet, "Bombardier Global 7500"),
    ("GLF4", Class::Bizjet, "Gulfstream IV"),
    ("GLF5", Class::Bizjet, "Gulfstream V"),
    ("GLF6", Class::Bizjet, "Gulfstream G650"),
    ("G280", Class::Bizjet, "Gulfstream G280"),
    ("FA7X", Class::Bizjet, "Dassault Falcon 7X"),
    ("FA8X", Class::Bizjet, "Dassault Falcon 8X"),
    ("F2TH", Class::Bizjet, "Dassault Falcon 2000"),
    ("F900", Class::Bizjet, "Dassault Falcon 900"),
    ("PC24", Class::Bizjet, "Pilatus PC-24"),
    ("PRM1", Class::Bizjet, "Beechcraft Premier I"),
    ("H25B", Class::Bizjet, "Hawker 800"),
    // Tek motorlu turboprop
    ("C208", Class::TurbopropSingle, "Cessna 208 Caravan"),
    ("KODI", Class::TurbopropSingle, "Daher Kodiak"),
    ("PC12", Class::TurbopropSingle, "Pilatus PC-12"),
    ("PC6T", Class::TurbopropSingle, "Pilatus PC-6 Turbo Porter"),
    ("TBM7", Class::TurbopropSingle, "Daher TBM 700"),
    ("TBM8", Class::TurbopropSingle, "Daher TBM 850"),
    ("TBM9", Class::TurbopropSingle, "Daher TBM 900"),
    ("P46T", Class::TurbopropSingle, "Piper M500/M600"),
    ("EPIC", Class::TurbopropSingle, "Epic E1000"),
    ("AT8T", Class::TurbopropSingle, "Air Tractor AT-802"),
    // Çift motorlu turboprop
    ("B350", Class::TurbopropTwin, "Beechcraft King Air 350"),
    ("BE20", Class::TurbopropTwin, "Beechcraft King Air 200"),
    ("BE9L", Class::TurbopropTwin, "Beechcraft King Air 90"),
    ("BE10", Class::TurbopropTwin, "Beechcraft King Air 100"),
    ("B190", Class::TurbopropTwin, "Beechcraft 1900"),
    ("DHC6", Class::TurbopropTwin, "De Havilland DHC-6 Twin Otter"),
    ("P180", Class::TurbopropTwin, "Piaggio P.180 Avanti"),
    ("D228", Class::TurbopropTwin, "Dornier 228"),
    ("C441", Class::TurbopropTwin, "Cessna 441 Conquest II"),
    ("JS32", Class::TurbopropTwin, "BAe Jetstream 32"),
    ("L410", Class::TurbopropTwin, "Let L-410 Turbolet"),
    ("MU2", Class::TurbopropTwin, "Mitsubishi MU-2"),
    // Çift motorlu pistonlu
    ("BE55", Class::PistonTwin, "Beechcraft Baron 55"),
    ("BE58", Class::PistonTwin, "Beechcraft Baron 58"),
    ("BE76", Class::PistonTwin, "Beechcraft Duchess"),
    ("DA42", Class::PistonTwin, "Diamond DA42"),
    ("DA62", Class::PistonTwin, "Diamond DA62"),
    ("PA23", Class::PistonTwin, "Piper Aztec"),
    ("PA30", Class::PistonTwin, "Piper Twin Comanche"),
    ("PA31", Class::PistonTwin, "Piper Navajo"),
    ("PA34", Class::PistonTwin, "Piper Seneca"),
    ("PA44", Class::PistonTwin, "Piper Seminole"),
    ("C310", Class::PistonTwin, "Cessna 310"),
    ("C340", Class::PistonTwin, "Cessna 340"),
    ("C414", Class::PistonTwin, "Cessna 414"),
    ("C421", Class::PistonTwin, "Cessna 421"),
    ("BN2P", Class::PistonTwin, "Britten-Norman Islander"),
    ("P68", Class::PistonTwin, "Partenavia P.68"),
    ("DC3", Class::PistonTwin, "Douglas DC-3"),
    ("G21", Class::PistonTwin, "Grumman G-21 Goose"),
    // Hafif pistonlu
    ("C150", Class::LightPiston, "Cessna 150"),
    ("C152", Class::LightPiston, "Cessna 152"),
    ("C162", Class::LightPiston, "Cessna 162 Skycatcher"),
    ("C170", Class::LightPiston, "Cessna 170"),
    ("C172", Class::LightPiston, "Cessna 172 Skyhawk"),
    ("C177", Class::LightPiston, "Cessna 177 Cardinal"),
    ("C182", Class::LightPiston, "Cessna 182 Skylane"),
    ("C185", Class::LightPiston, "Cessna 185 Skywagon"),
    ("C206", Class::LightPiston, "Cessna 206 Stationair"),
    ("C210", Class::LightPiston, "Cessna 210 Centurion"),
    ("COL4", Class::LightPiston, "Cessna 400 Corvalis"),
    ("P28A", Class::LightPiston, "Piper PA-28 Cherokee"),
    ("P28B", Class::LightPiston, "Piper PA-28-236 Dakota"),
    ("P28R", Class::LightPiston, "Piper PA-28R Arrow"),
    ("PA18", Class::LightPiston, "Piper PA-18 Super Cub"),
    ("PA24", Class::LightPiston, "Piper PA-24 Comanche"),
    ("J3", Class::LightPiston, "Piper J-3 Cub"),
    ("DA40", Class::LightPiston, "Diamond DA40"),
    ("DA20", Class::LightPiston, "Diamond DA20"),
    ("DV20", Class::LightPiston, "Diamond DV20 Katana"),
    ("SR20", Class::LightPiston, "Cirrus SR20"),
    ("SR22", Class::LightPiston, "Cirrus SR22"),
    ("S22T", Class::LightPiston, "Cirrus SR22T"),
    ("BE33", Class::LightPiston, "Beechcraft Debonair"),
    ("BE35", Class::LightPiston, "Beechcraft Bonanza V35"),
    ("BE36", Class::LightPiston, "Beechcraft Bonanza A36"),
    ("M20P", Class::LightPiston, "Mooney M20"),
    ("M20T", Class::LightPiston, "Mooney M20 Turbo"),
    ("DR40", Class::LightPiston, "Robin DR400"),
    ("PTS1", Class::LightPiston, "Pitts S-1"),
    ("PTS2", Class::LightPiston, "Pitts S-2"),
    ("E300", Class::LightPiston, "Extra 300"),
    ("CTSW", Class::LightPiston, "Flight Design CT"),
    ("DHC2", Class::LightPiston, "De Havilland DHC-2 Beaver"),
    ("A5", Class::LightPiston, "ICON A5"),
    ("RV7", Class::LightPiston, "Van's RV-7"),
    ("RV8", Class::LightPiston, "Van's RV-8"),
    ("RV10", Class::LightPiston, "Van's RV-10"),
    // Helikopterler
    ("EC30", Class::Helicopter, "Airbus H130"),
    ("AS50", Class::Helicopter, "Airbus H125"),
    ("EC35", Class::Helicopter, "Airbus H135"),
    ("EC45", Class::Helicopter, "Airbus H145"),
    ("EC55", Class::Helicopter, "Airbus H155"),
    ("EC75", Class::Helicopter, "Airbus H175"),
    ("H160", Class::Helicopter, "Airbus H160"),
    ("B06", Class::Helicopter, "Bell 206"),
    ("B407", Class::Helicopter, "Bell 407"),
    ("B412", Class::Helicopter, "Bell 412"),
    ("B429", Class::Helicopter, "Bell 429"),
    ("B505", Class::Helicopter, "Bell 505"),
    ("R22", Class::Helicopter, "Robinson R22"),
    ("R44", Class::Helicopter, "Robinson R44"),
    ("R66", Class::Helicopter, "Robinson R66"),
    ("G2CA", Class::Helicopter, "Guimbal Cabri G2"),
    ("S76", Class::Helicopter, "Sikorsky S-76"),
    ("S92", Class::Helicopter, "Sikorsky S-92"),
    ("S64", Class::Helicopter, "Sikorsky S-64 Skycrane"),
    ("UH1", Class::Helicopter, "Bell UH-1 Iroquois"),
    ("H60", Class::Helicopter, "Sikorsky UH-60 Black Hawk"),
    ("H47", Class::Helicopter, "Boeing CH-47 Chinook"),
    ("A109", Class::Helicopter, "Leonardo AW109"),
    ("A139", Class::Helicopter, "Leonardo AW139"),
    ("A169", Class::Helicopter, "Leonardo AW169"),
];

/// ICAO tip kodunun sınıfı (büyük/küçük harf duyarsız, tam eşleşme).
pub fn classify_icao(code: &str) -> Option<Class> {
    let c = code.trim();
    ICAO_TYPES.iter().find(|(k, _, _)| k.eq_ignore_ascii_case(c)).map(|(_, cl, _)| *cl)
}

/// ICAO tip kodunun gerçek tip adı ("A20N" → "Airbus A320neo").
pub fn icao_type_name(code: &str) -> Option<&'static str> {
    let c = code.trim();
    ICAO_TYPES.iter().find(|(k, _, _)| k.eq_ignore_ascii_case(c)).map(|(_, _, n)| *n)
}

/// Otomatik sınıfın ne kadar güvenilir olduğu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    /// Tip kodu, helikopter klasörü ya da simin kendi değerleri.
    High,
    /// Uçağın dosyalarındaki motor ve ağırlık değerleri.
    Medium,
    /// Yalnızca addan tahmin.
    Low,
}

/// Uçağın dosyalarından (ya da simden) çıkarılan sınıf ve dayanağı.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inference {
    pub class: Class,
    pub confidence: Confidence,
    /// "icao" (tip kodu) | "rotorcraft" (helikopter klasörü) | "specs" (motor ve ağırlık) | "name" (ad)
    pub basis: &'static str,
}

/// Otomatik sınıf: tip kodu > helikopter klasörü > motor türü, sayısı ve azami ağırlık > ad. `specs` yalnızca motor
/// türü gerçekten bilindiğinde verilmeli (eksik değer 0 = pistonlu sayılmasın).
pub fn infer(icao_type: &str, rotorcraft: bool, specs: Option<&SimSpecs>, title: &str, atc_model: &str) -> Option<Inference> {
    let icao = if icao_type.trim().is_empty() { icao_from_atc_model(atc_model).unwrap_or_default() } else { icao_type.trim().to_string() };
    if let Some(c) = classify_icao(&icao) {
        return Some(Inference { class: c, confidence: Confidence::High, basis: "icao" });
    }
    if rotorcraft {
        return Some(Inference { class: Class::Helicopter, confidence: Confidence::High, basis: "rotorcraft" });
    }
    // Jette ağırlık bilinmiyorsa sınıf ağırlıktan çıkarılamaz (iş jeti de dar gövde de olabilir).
    if let Some(s) = specs.filter(|s| s.engine_type != 1 || s.mtow_lb > 0.0) {
        if let Some(c) = classify_specs(s) {
            return Some(Inference { class: c, confidence: Confidence::Medium, basis: "specs" });
        }
    }
    classify_name(title, atc_model).map(|c| Inference { class: c, confidence: Confidence::Low, basis: "name" })
}

/// Yükü ve yakıtı kendi EFB'sinde (tablet, yük yöneticisi) yöneten, dışarıdan yük yazmayı yok sayan ya da bozan
/// eklentilerin geliştiricileri. İğne küçük harfle; 4 harf ve kısası bütün sözcük olarak aranır ("fnx-aircraft-320"
/// → "fnx"), uzunları metnin içinde. Kaynak: geliştiricilerin kılavuzları (yük ve yakıt yalnızca EFB'den).
const KNOWN_EFB: &[(&str, &str)] = &[
    ("fenix", "Fenix"),
    ("fnx", "Fenix"),
    ("pmdg", "PMDG"),
    ("inibuilds", "iniBuilds"),
    ("headwind", "Headwind"),
    ("a339x", "Headwind"),
    ("flybywire", "FlyByWire"),
    ("fbw", "FlyByWire"),
    ("a32nx", "FlyByWire"),
    ("a380x", "FlyByWire"),
    ("maddog", "Leonardo"),
    // Yalnızca "leonardo" değil: Leonardo aynı zamanda helikopter üreticisi (AW139).
    ("leonardo software", "Leonardo"),
    ("leonardo sh", "Leonardo"),
    ("fslabs", "FSLabs"),
    ("aerosoft crj", "Aerosoft"),
    ("aerosoft-aircraft-crj", "Aerosoft"),
    ("justflight", "Just Flight"),
    ("just flight", "Just Flight"),
    ("black square", "Black Square"),
    ("blacksquare", "Black Square"),
    ("bksq", "Black Square"),
    ("tfdi", "TFDi Design"),
    ("flightsim studio", "FlightSim Studio"),
    ("fss", "FlightSim Studio"),
    ("hot start", "Hot Start"),
    ("hotstart", "Hot Start"),
    ("salty", "Salty Simulations"),
    ("horizonsim", "HorizonSim"),
    ("a2a", "A2A Simulations"),
];

/// Metindeki bilinen EFB'li geliştirici (başlık, paket klasörü, paket adı, yapımcı birlikte verilebilir).
pub fn efb_developer(text: &str) -> Option<&'static str> {
    let t = text.to_lowercase();
    let words: Vec<&str> = t.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).collect();
    // Kısa iğne bütün sözcük ya da ardından rakam gelen önek olmalı ("pmdg737", "fnx320"; "fssx" değil).
    let word_hit = |needle: &str| words.iter().any(|w| *w == needle || w.strip_prefix(needle).is_some_and(|rest| rest.starts_with(|c: char| c.is_ascii_digit())));
    KNOWN_EFB
        .iter()
        .find(|(needle, _)| if needle.len() <= 4 && !needle.contains(' ') { word_hit(needle) } else { t.contains(needle) })
        .map(|(_, dev)| *dev)
}

/// Kullanıcının dış EFB ile yönettiği, dışarıdan yük ve yakıt yazmayı reddeden uçaklar. Kullanıcının elle seçimi ve
/// mod paketinden öğrenilen bilgi önce gelir (`addons::own_loading`); yoksa başlıktaki geliştirici adı.
pub fn manages_own_loading(title: &str) -> bool {
    if let Some(v) = super::addons::own_loading(title) {
        return v;
    }
    efb_developer(title).is_some() || title.to_ascii_lowercase().contains("fnx")
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

    #[test]
    fn icao_designators_map_to_classes_and_type_ratings() {
        // Dar gövde (TR-N), geniş gövde (TR-W), bölgesel jet: sınıf lisansları tip yetkisini taşır.
        for code in ["A19N", "A20N", "A21N", "A318", "A319", "A320", "A321", "B737", "B738", "B739", "B38M", "B39M", "B752"] {
            assert_eq!(classify_icao(code), Some(Class::Narrowbody), "{code}");
        }
        for code in ["B788", "B789", "B78X", "A359", "A35K", "B77W", "B744", "B748", "A339", "MD11"] {
            assert_eq!(classify_icao(code), Some(Class::Widebody), "{code}");
        }
        for code in ["CRJ7", "CRJ9", "E170", "E75L", "E190", "E195", "BCS3"] {
            assert_eq!(classify_icao(code), Some(Class::RegionalJet), "{code}");
        }
        assert!(info(Class::Narrowbody).licenses.contains(&"narrow"));
        assert!(info(Class::Widebody).licenses.contains(&"wide"));
        assert_eq!(classify_icao("at76"), Some(Class::RegionalTurboprop));
        assert_eq!(classify_icao("GL7T"), Some(Class::Bizjet), "ağırlığı bölgesel jet kadar ama iş jeti");
        assert_eq!(classify_icao("ZZZZ"), None);
        assert_eq!(icao_type_name("A20N"), Some("Airbus A320neo"));
        // Her kod bir kez.
        let mut seen = std::collections::HashSet::new();
        assert!(ICAO_TYPES.iter().all(|(k, _, _)| seen.insert(*k)), "tekrarlanan ICAO kodu");
    }

    #[test]
    fn atc_model_formats() {
        assert_eq!(icao_from_atc_model("TT:ATCCOM.AC_MODEL_C172.0.text").as_deref(), Some("C172"));
        assert_eq!(icao_from_atc_model("TT:ATCCOM.AC_MODEL A320.0.text").as_deref(), Some("A320"), "Fenix boşlukla yazar");
        assert_eq!(icao_from_atc_model("\"B38M\"").as_deref(), Some("B38M"));
        assert_eq!(icao_from_atc_model("$$:B738").as_deref(), Some("B738"));
        assert_eq!(icao_from_atc_model("King Air 350"), None);
        assert_eq!(icao_from_atc_model("1234"), None);
        assert_eq!(classify_name("FenixA320 CFM SL", "TT:ATCCOM.AC_MODEL A320.0.text"), Some(Class::Narrowbody));
    }

    #[test]
    fn inference_prefers_type_code_then_rotorcraft_then_specs_then_name() {
        let jet = |mtow: f64| SimSpecs { engine_type: 1, engines: 2, mtow_lb: mtow, ..Default::default() };
        // 737-700 ağırlıkla bölgesel jet görünür; tip kodu dar gövde der.
        let i = infer("B737", false, Some(&jet(154_500.0)), "Mod 737-700", "").unwrap();
        assert_eq!((i.class, i.confidence, i.basis), (Class::Narrowbody, Confidence::High, "icao"));
        let i = infer("", true, None, "Bilinmeyen", "").unwrap();
        assert_eq!((i.class, i.basis), (Class::Helicopter, "rotorcraft"));
        let i = infer("", false, Some(&jet(85_000.0)), "Bilinmeyen Jet", "").unwrap();
        assert_eq!((i.class, i.confidence), (Class::RegionalJet, Confidence::Medium));
        let piston = SimSpecs { engine_type: 0, engines: 2, mtow_lb: 5500.0, ..Default::default() };
        assert_eq!(infer("", false, Some(&piston), "x", "").unwrap().class, Class::PistonTwin);
        // Jette ağırlık yoksa ağırlıktan sınıf çıkarılmaz; ad kalıbına düşer.
        let i = infer("", false, Some(&jet(0.0)), "Citation CJ4 Mod", "").unwrap();
        assert_eq!((i.class, i.confidence, i.basis), (Class::Bizjet, Confidence::Low, "name"));
        assert!(infer("", false, None, "Bilinmeyen Kuş", "").is_none());
    }

    #[test]
    fn efb_developers_from_titles_and_packages() {
        for (text, dev) in [
            ("fnx-aircraft-320 Fenix Simulations", "Fenix"),
            ("pmdg-aircraft-738", "PMDG"),
            ("PMDG737 Mod", "PMDG"),
            ("inibuilds-aircraft-a310", "iniBuilds"),
            ("flybywire-aircraft-a320-neo", "FlyByWire"),
            ("Headwind A339X", "Headwind"),
            ("justflight-aircraft-146", "Just Flight"),
            ("Black Square Starship", "Black Square"),
            ("tfdi-design-md11", "TFDi Design"),
            ("fss-aircraft-e-jets", "FlightSim Studio"),
            ("Maddog X MD-82", "Leonardo"),
        ] {
            assert_eq!(efb_developer(text), Some(dev), "{text}");
        }
        for text in ["Cessna 172 Asobo", "fssx-scenery", "Leonardo AW139 Rescue", "fnxtra", "Asobo A320neo V2"] {
            assert_eq!(efb_developer(text), None, "{text}");
        }
    }
}
