//! Uçuş kâğıdı (dispatch): yakıt planı, ağırlıklar, yedek meydan ve pist uzunluğu. Gerçek havayollarının uçuş
//! öncesi hesabının sadeleştirilmiş hali; kurallar `KARIYER.md` → "Uçuş kâğıdı" bölümündedir.
//!
//! - **Yakıt** (EASA CAT.OP.MPA.181 ve FAA 91.151/91.167): taksi + yol + ihtiyat (yolun %5'i, en az 5 dakika) +
//!   yedek meydan + son yedek (türbin 30 dk, pistonlu 45 dk; VFR'de gündüz 30, gece 45 dk; helikopter VFR 20 dk).
//!   VFR uçuşta ihtiyat ve yedek meydan yakıtı yoktur.
//! - **Ağırlıklar:** boş ağırlık + yük = sıfır yakıt ağırlığı; + yakıt = kalkış; − yol yakıtı = iniş. Azami kalkış
//!   (MTOW) ve iniş (MLW) ağırlığı uçağın kendi değerinden (simden okunduysa) ya da sınıfın tipik değerinden gelir.
//! - **Pist:** sınıfın gereken pisti yoğunluk irtifasıyla uzar (pistonlu ve turboprop 1000 ft başına %7, jet %5);
//!   ıslak pistte iniş mesafesi %15 artar.
//!
//! Tipik değerlerle yapılan hesap yalnızca uyarıdır; uçak simde tanındıysa (boş ağırlık, MTOW, yakıt kapasitesi
//! simden) sonuçlar kesindir.

use serde::{Deserialize, Serialize};

use super::aircraft::{Class, Fuel, SimSpecs, info};
use super::airports::{Airport, AirportDb, Size, Surface, distance_nm};
use super::economy::{PAX_KG, taxi_minutes};
use super::env::{FlightCategory, density_altitude_ft};

pub const KG_PER_LB: f64 = 0.453_592;
/// Yakıt yoğunluğu (kg/galon): avgas 6,0 lb/gal, Jet A 6,7 lb/gal.
pub fn fuel_kg_per_gal(f: Fuel) -> f64 {
    match f {
        Fuel::Avgas => 2.72,
        Fuel::JetA => 3.04,
    }
}

/// Sınıfın tipik ağırlıkları (kg) ve yakıt kapasitesi (kg). Uçak simde tanınmadıysa bunlar kullanılır.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Typical {
    pub empty_kg: f64,
    pub mtow_kg: f64,
    /// MLW / MTOW (hafif uçaklarda 1; geniş gövdede ≈ 0,77).
    pub mlw_ratio: f64,
    pub fuel_kg: f64,
}

pub fn typical(c: Class) -> Typical {
    let t = |empty_kg: f64, mtow_kg: f64, mlw_ratio: f64, fuel_kg: f64| Typical { empty_kg, mtow_kg, mlw_ratio, fuel_kg };
    match c {
        Class::LightPiston => t(770.0, 1_160.0, 1.0, 145.0),
        Class::PistonTwin => t(1_650.0, 2_500.0, 0.97, 540.0),
        Class::TurbopropSingle => t(2_600.0, 4_700.0, 0.95, 1_250.0),
        Class::TurbopropTwin => t(4_100.0, 7_250.0, 0.97, 2_300.0),
        Class::RegionalTurboprop => t(13_500.0, 22_800.0, 0.97, 5_000.0),
        Class::Bizjet => t(6_000.0, 11_500.0, 0.87, 5_000.0),
        Class::RegionalJet => t(21_000.0, 38_600.0, 0.87, 9_000.0),
        Class::Narrowbody => t(42_600.0, 79_000.0, 0.85, 26_000.0),
        Class::Widebody => t(150_000.0, 330_000.0, 0.77, 140_000.0),
        Class::Helicopter => t(1_300.0, 2_270.0, 1.0, 410.0),
    }
}

/// Bu sınıf aletli kurallarla (IFR) mı uçar? Hafif pistonlu ve helikopter görerek (VFR) uçar; hava IFR ise o da IFR.
pub fn is_ifr(c: Class, destination: Option<FlightCategory>) -> bool {
    !matches!(c, Class::LightPiston | Class::Helicopter) || destination.is_some_and(|f| f >= FlightCategory::Ifr)
}

fn turbine(c: Class) -> bool {
    info(c).fuel == Fuel::JetA
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct FuelPlan {
    /// "ifr" | "vfr_day" | "vfr_night" | "heli_vfr"
    pub rule: String,
    pub taxi_kg: f64,
    pub trip_kg: f64,
    pub contingency_kg: f64,
    pub alternate_kg: f64,
    pub final_reserve_kg: f64,
    /// Varışta yakıt yoksa dönüş yakıtı.
    pub extra_kg: f64,
    /// Yasal en az blok yakıt (ekstra hariç) ve önerilen blok yakıt.
    pub minimum_kg: f64,
    pub block_kg: f64,
    pub reserve_min: u32,
    /// Blok yakıtla havada kalma süresi (dk).
    pub endurance_min: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Weights {
    pub empty_kg: f64,
    pub payload_kg: f64,
    pub zfw_kg: f64,
    pub tow_kg: f64,
    pub lw_kg: f64,
    pub mtow_kg: f64,
    pub mlw_kg: f64,
    pub fuel_capacity_kg: f64,
    /// Değerler simden mi (kesin) yoksa sınıfın tipik değerleri mi (tahmini)?
    pub from_sim: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct AlternateInfo {
    pub icao: String,
    pub name: String,
    pub distance_nm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RunwayInfo {
    pub icao: String,
    pub available_ft: u32,
    pub required_ft: u32,
    pub density_alt_ft: i32,
    pub lighted: bool,
    /// "both" | "avgas" | "none"
    pub fuel: String,
}

/// Uçuş kâğıdındaki bir bulgu. `blocking` ise uçuş bu hâliyle başlatılmamalı (Gerçekçi zorlukta engeller).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Issue {
    /// "over_mtow" | "over_mlw" | "fuel_capacity" | "runway_short_departure" | "runway_short_arrival" |
    /// "unlit_night" | "no_fuel_destination" | "no_alternate" | "imc_without_ir"
    pub code: String,
    pub blocking: bool,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Dispatch {
    pub ifr: bool,
    pub night_arrival: bool,
    pub fuel: FuelPlan,
    pub weights: Weights,
    pub alternate: Option<AlternateInfo>,
    pub departure: RunwayInfo,
    pub arrival: RunwayInfo,
    pub issues: Vec<Issue>,
}

pub struct DispatchInput<'a> {
    pub db: &'a AirportDb,
    pub class: Class,
    pub from: &'a Airport,
    pub to: &'a Airport,
    pub distance_nm: f64,
    pub air_min: f64,
    pub pax: u32,
    pub cargo_kg: u32,
    /// Uçak simde tanındıysa değerleri.
    pub specs: Option<&'a SimSpecs>,
    /// Varış ve kalkıştaki uçuş kategorisi ile sıcaklık/basınç (METAR'dan), bilinmiyorsa `None`.
    pub dest_category: Option<FlightCategory>,
    pub dep_weather: Option<(f64, f64)>,
    pub dest_weather: Option<(f64, f64)>,
    pub dest_wet: bool,
    /// Varış gece mi (tahmini varış saatinde güneş −6°'nin altında)?
    pub night_arrival: bool,
    pub pilot_ir: bool,
}

/// Havalimanında satılan yakıt: büyük ve orta havalimanında ikisi de; küçük kaplamalıda yalnızca avgas; kaplamasız
/// pist ve deniz uçağı limanında yok (OurAirports'ta yakıt verisi yok; büyüklük ve yüzeyden çıkarılır).
pub fn fuel_available(a: &Airport) -> &'static str {
    match (a.size, a.surface) {
        (Size::Large | Size::Medium, _) => "both",
        (Size::Seaplane, _) | (_, Surface::Unpaved | Surface::Water) => "none",
        _ => "avgas",
    }
}

fn sells(a: &Airport, f: Fuel) -> bool {
    match fuel_available(a) {
        "both" => true,
        "avgas" => f == Fuel::Avgas,
        _ => false,
    }
}

/// Yedek meydan: varışa 15–150 nm uzaktaki, sınıfa uygun, en yakın havalimanı (IFR'de orta ya da büyük olanlar önce).
pub fn alternate(db: &AirportDb, to: &Airport, from: &Airport, class: Class, ifr: bool) -> Option<AlternateInfo> {
    let ci = info(class);
    let mut list: Vec<(&Airport, f64)> = db
        .within(to.lat, to.lon, 150.0)
        .into_iter()
        .filter(|(a, d)| *d >= 15.0 && a.icao != to.icao && a.icao != from.icao && a.suits(ci) && a.surface != Surface::Water)
        .collect();
    if ifr {
        let big: Vec<(&Airport, f64)> = list.iter().filter(|(a, _)| matches!(a.size, Size::Large | Size::Medium)).cloned().collect();
        if !big.is_empty() {
            list = big;
        }
    }
    list.first().map(|(a, d)| AlternateInfo { icao: a.icao.clone(), name: a.name.clone(), distance_nm: (d * 10.0).round() / 10.0 })
}

/// Pist ihtiyacı (ft): sınıfın deniz seviyesi değeri yoğunluk irtifasıyla uzar.
pub fn runway_required_ft(c: Class, density_alt_ft: f64, landing: bool, wet: bool) -> u32 {
    let base = info(c).min_runway_ft as f64;
    if base <= 0.0 {
        return 0;
    }
    let per_1000 = if turbine(c) && !matches!(c, Class::TurbopropSingle | Class::TurbopropTwin | Class::RegionalTurboprop) { 0.05 } else { 0.07 };
    let da = density_alt_ft.max(0.0) / 1000.0;
    let mut req = if landing { base * 0.85 * (1.0 + 0.04 * da) } else { base * (1.0 + per_1000 * da) };
    if landing && wet {
        req *= 1.15;
    }
    (req / 10.0).round() as u32 * 10
}

fn runway_info(a: &Airport, c: Class, weather: Option<(f64, f64)>, landing: bool, wet: bool) -> RunwayInfo {
    // Hava bilinmiyorsa ISA: yoğunluk irtifası ≈ havalimanı yüksekliği.
    let (t, q) = weather.unwrap_or((15.0 - 1.98 * a.elevation_ft as f64 / 1000.0, 1013.25));
    let da = density_altitude_ft(a.elevation_ft as f64, q, t);
    RunwayInfo {
        icao: a.icao.clone(),
        available_ft: a.runway_ft,
        required_ft: runway_required_ft(c, da, landing, wet),
        density_alt_ft: da.round() as i32,
        lighted: a.lighted,
        fuel: fuel_available(a).to_string(),
    }
}

pub fn dispatch(i: &DispatchInput) -> Dispatch {
    let ci = info(i.class);
    let ty = typical(i.class);
    let ifr = is_ifr(i.class, i.dest_category);
    let burn = ci.burn_kg_h;
    let air_h = (i.air_min / 60.0).max(i.distance_nm / (ci.cruise_kt as f64 * 0.85));
    let taxi_kg = taxi_minutes(i.class) / 60.0 * burn * 0.3;
    let trip_kg = air_h * burn;
    let (rule, reserve_min) = match (i.class, ifr) {
        (_, true) => ("ifr", if turbine(i.class) { 30 } else { 45 }),
        (Class::Helicopter, false) => ("heli_vfr", 20),
        (_, false) if i.night_arrival => ("vfr_night", 45),
        _ => ("vfr_day", 30),
    };
    let contingency_kg = if ifr { (trip_kg * 0.05).max(burn * 5.0 / 60.0) } else { 0.0 };
    let alt = if ifr { alternate(i.db, i.to, i.from, i.class, ifr) } else { None };
    let alternate_kg = match &alt {
        Some(a) => (a.distance_nm / (ci.cruise_kt as f64 * 0.75) + 0.1) * burn,
        // Yedek meydan yoksa 15 dakika bekleme yakıtı (EASA).
        None if ifr => burn * 0.25,
        None => 0.0,
    };
    let final_reserve_kg = burn * reserve_min as f64 / 60.0;
    let extra_kg = if sells(i.to, ci.fuel) || i.from.icao == i.to.icao { 0.0 } else { trip_kg };
    let minimum_kg = taxi_kg + trip_kg + contingency_kg + alternate_kg + final_reserve_kg;
    let block_kg = minimum_kg + extra_kg;
    let r = |v: f64| v.round();

    // Ağırlıklar: simden okunan değerler varsa onlar.
    let sim = i.specs.filter(|s| s.empty_lb > 0.0 && s.mtow_lb > s.empty_lb);
    let (empty_kg, mtow_kg, cap_kg) = match sim {
        Some(s) => (
            s.empty_lb * KG_PER_LB,
            if s.max_takeoff_lb > 0.0 { s.max_takeoff_lb } else { s.mtow_lb } * KG_PER_LB,
            if s.fuel_capacity_gal > 0.0 { s.fuel_capacity_gal * fuel_kg_per_gal(ci.fuel) } else { ty.fuel_kg },
        ),
        None => (ty.empty_kg, ty.mtow_kg, ty.fuel_kg),
    };
    let mlw_kg = match sim {
        Some(s) if s.max_landing_lb > 0.0 => s.max_landing_lb * KG_PER_LB,
        _ => mtow_kg * ty.mlw_ratio,
    };
    let payload_kg = i.pax as f64 * PAX_KG + i.cargo_kg as f64;
    let zfw_kg = empty_kg + payload_kg;
    let tow_kg = zfw_kg + block_kg - taxi_kg;
    let lw_kg = tow_kg - trip_kg;
    let from_sim = sim.is_some();

    let mut issues = Vec::new();
    let mut add = |code: &str, blocking: bool, value: f64| issues.push(Issue { code: code.into(), blocking, value: r(value) });
    if tow_kg > mtow_kg * 1.001 {
        add("over_mtow", from_sim, tow_kg - mtow_kg);
    }
    if lw_kg > mlw_kg * 1.001 {
        add("over_mlw", false, lw_kg - mlw_kg);
    }
    if minimum_kg > cap_kg * 1.001 {
        add("fuel_capacity", from_sim, minimum_kg - cap_kg);
    }
    let departure = runway_info(i.from, i.class, i.dep_weather, false, false);
    let arrival = runway_info(i.to, i.class, i.dest_weather, true, i.dest_wet);
    if departure.required_ft > departure.available_ft && departure.available_ft > 0 {
        add("runway_short_departure", departure.available_ft as f64 * 1.2 < departure.required_ft as f64, departure.required_ft as f64 - departure.available_ft as f64);
    }
    if arrival.required_ft > arrival.available_ft && arrival.available_ft > 0 {
        add("runway_short_arrival", arrival.available_ft as f64 * 1.2 < arrival.required_ft as f64, arrival.required_ft as f64 - arrival.available_ft as f64);
    }
    if i.night_arrival && !i.to.lighted && i.class != Class::Helicopter {
        add("unlit_night", true, 0.0);
    }
    if extra_kg > 0.0 {
        add("no_fuel_destination", false, extra_kg);
    }
    if ifr && alt.is_none() {
        add("no_alternate", false, 0.0);
    }
    if !i.pilot_ir && i.dest_category.is_some_and(|f| f >= FlightCategory::Ifr) {
        add("imc_without_ir", true, 0.0);
    }

    Dispatch {
        ifr,
        night_arrival: i.night_arrival,
        fuel: FuelPlan {
            rule: rule.into(),
            taxi_kg: r(taxi_kg),
            trip_kg: r(trip_kg),
            contingency_kg: r(contingency_kg),
            alternate_kg: r(alternate_kg),
            final_reserve_kg: r(final_reserve_kg),
            extra_kg: r(extra_kg),
            minimum_kg: r(minimum_kg),
            block_kg: r(block_kg),
            reserve_min,
            endurance_min: r((block_kg - taxi_kg) / burn * 60.0),
        },
        weights: Weights {
            empty_kg: r(empty_kg),
            payload_kg: r(payload_kg),
            zfw_kg: r(zfw_kg),
            tow_kg: r(tow_kg),
            lw_kg: r(lw_kg),
            mtow_kg: r(mtow_kg),
            mlw_kg: r(mlw_kg),
            fuel_capacity_kg: r(cap_kg),
            from_sim,
        },
        alternate: alt,
        departure,
        arrival,
        issues,
    }
}

/// İniş anındaki son yedek yakıt (kg): sınıfın kuralına göre (pistonlu 45, türbin 30, helikopter 20 dk).
pub fn final_reserve_kg(c: Class) -> f64 {
    let min = match c {
        Class::Helicopter => 20.0,
        _ if turbine(c) => 30.0,
        _ => 45.0,
    };
    info(c).burn_kg_h * min / 60.0
}

/// Kalkış ve inişteki azami ağırlıklar (lb): simin kendi değerleri (2024'te MTOW ve MLW ayrı okunur), yoksa
/// `MAX GROSS WEIGHT` ve sınıfın MLW oranı, o da yoksa sınıfın tipik değeri.
pub fn limits_lb(c: Class, specs: Option<&SimSpecs>) -> (f64, f64) {
    let ty = typical(c);
    let s = specs.cloned().unwrap_or_default();
    let mtow_lb = [s.max_takeoff_lb, s.mtow_lb].into_iter().find(|v| *v > 0.0).unwrap_or(ty.mtow_kg / KG_PER_LB);
    let mlw_lb = if s.max_landing_lb > 0.0 { s.max_landing_lb } else { mtow_lb * ty.mlw_ratio };
    (mtow_lb, mlw_lb)
}

/// Kalkış ile varış arasındaki mesafeye göre hızlı kontrol (pano için): sınıfın tipik değerleriyle uçulabilir mi?
pub fn feasible(c: Class, distance_nm: f64, pax: u32, cargo_kg: u32) -> bool {
    let ci = info(c);
    let ty = typical(c);
    let air_h = distance_nm / (ci.cruise_kt as f64 * 0.85) + 0.15;
    let fuel = air_h * ci.burn_kg_h * 1.05 + ci.burn_kg_h * 0.9;
    let tow = ty.empty_kg + pax as f64 * PAX_KG + cargo_kg as f64 + fuel;
    fuel <= ty.fuel_kg * 1.05 && tow <= ty.mtow_kg * 1.05
}

/// Mesafe (nm) yardımcısı: iki havalimanı arası.
pub fn leg_nm(a: &Airport, b: &Airport) -> f64 {
    distance_nm(a.lat, a.lon, b.lat, b.lon)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::aircraft::CLASSES;
    use crate::career::airports::db;
    use crate::career::economy::plan;

    fn input<'a>(class: Class, from: &'a Airport, to: &'a Airport, pax: u32, cargo: u32) -> DispatchInput<'a> {
        let d = leg_nm(from, to);
        DispatchInput {
            db: db(),
            class,
            from,
            to,
            distance_nm: d,
            air_min: plan(class, d, pax, cargo).air_min,
            pax,
            cargo_kg: cargo,
            specs: None,
            dest_category: None,
            dep_weather: None,
            dest_weather: None,
            dest_wet: false,
            night_arrival: false,
            pilot_ir: true,
        }
    }

    #[test]
    fn vfr_light_piston_has_no_alternate_and_30_min_reserve() {
        let (a, b) = (db().get("LTBA").unwrap(), db().get("LTBU").unwrap());
        let d = dispatch(&input(Class::LightPiston, a, b, 1, 50));
        assert!(!d.ifr);
        assert_eq!(d.fuel.rule, "vfr_day");
        assert_eq!(d.fuel.reserve_min, 30);
        assert_eq!(d.fuel.contingency_kg, 0.0);
        assert!(d.alternate.is_none());
        assert_eq!(d.fuel.final_reserve_kg, 15.0);
        assert!(d.fuel.block_kg > d.fuel.trip_kg);
        assert!(d.issues.is_empty(), "{:?}", d.issues);
        // Gece VFR: 45 dk.
        let n = dispatch(&DispatchInput { night_arrival: true, ..input(Class::LightPiston, a, b, 1, 50) });
        assert_eq!(n.fuel.rule, "vfr_night");
        assert_eq!(n.fuel.reserve_min, 45);
    }

    #[test]
    fn ifr_jet_has_contingency_alternate_and_final_reserve() {
        let (a, b) = (db().get("LTFM").unwrap(), db().get("LTAI").unwrap());
        let d = dispatch(&input(Class::Narrowbody, a, b, 150, 1000));
        assert!(d.ifr);
        assert_eq!(d.fuel.reserve_min, 30);
        let alt = d.alternate.clone().expect("yedek meydan");
        assert!(alt.distance_nm >= 15.0 && alt.distance_nm <= 150.0 && alt.icao != "LTAI", "{alt:?}");
        assert!(d.fuel.contingency_kg >= d.fuel.trip_kg * 0.05 - 1.0);
        assert!(d.fuel.alternate_kg > 0.0);
        assert_eq!(d.fuel.final_reserve_kg, 1250.0);
        let w = &d.weights;
        assert!(!w.from_sim);
        assert_eq!(w.payload_kg, 150.0 * 90.0 + 1000.0);
        assert!((w.tow_kg - (w.zfw_kg + d.fuel.block_kg - d.fuel.taxi_kg)).abs() < 1.5);
        assert!(w.lw_kg < w.tow_kg && w.mlw_kg < w.mtow_kg);
        assert!(d.issues.is_empty(), "{:?}", d.issues);
    }

    #[test]
    fn sim_values_override_typical_and_issues_block() {
        let (a, b) = (db().get("LTFM").unwrap(), db().get("LTAI").unwrap());
        // A320neo: boş 44,3 t, MTOW 79 t, 6.300 galon.
        let specs = SimSpecs { empty_lb: 97_700.0, mtow_lb: 174_165.0, fuel_capacity_gal: 6_300.0, ..Default::default() };
        let d = dispatch(&DispatchInput { specs: Some(&specs), ..input(Class::Narrowbody, a, b, 170, 20_000) });
        assert!(d.weights.from_sim);
        assert!((d.weights.mtow_kg - 79_000.0).abs() < 50.0);
        assert!(d.issues.iter().any(|x| x.code == "over_mtow" && x.blocking), "{:?}", d.issues);
    }

    #[test]
    fn hot_high_short_unlit_and_no_fuel() {
        // La Paz (4.061 m): yoğunluk irtifası pisti uzatır.
        let lp = db().get("SLLP").unwrap();
        assert!(runway_required_ft(Class::Narrowbody, 16_000.0, false, false) > 6500 * 17 / 10);
        let ri = runway_info(lp, Class::Narrowbody, Some((15.0, 1013.0)), false, false);
        assert!(ri.density_alt_ft > 13_000, "{ri:?}");
        // Islak pist iniş mesafesini %15 uzatır.
        assert!(runway_required_ft(Class::Bizjet, 0.0, true, true) > runway_required_ft(Class::Bizjet, 0.0, true, false));
        // Helikopterin pist ihtiyacı yok.
        assert_eq!(runway_required_ft(Class::Helicopter, 10_000.0, false, false), 0);
        // Kaplamasız küçük pistte yakıt yok: dönüş yakıtı eklenir.
        let strip = db().list.iter().find(|a| a.size == Size::Small && a.surface == Surface::Unpaved && a.runway_ft >= 2500).unwrap();
        let near = db().within(strip.lat, strip.lon, 60.0).into_iter().find(|(a, d)| *d > 20.0 && a.size == Size::Medium).map(|(a, _)| a).unwrap();
        let d = dispatch(&input(Class::LightPiston, near, strip, 0, 100));
        assert!(d.fuel.extra_kg > 0.0 && d.issues.iter().any(|x| x.code == "no_fuel_destination"), "{d:?}");
        // Işıksız pistte gece iniş engellenir.
        let unlit = db().list.iter().find(|a| !a.lighted && a.size == Size::Small && a.surface == Surface::Paved && a.runway_ft > 3000).unwrap();
        let d = dispatch(&DispatchInput { night_arrival: true, ..input(Class::LightPiston, near, unlit, 1, 0) });
        assert!(d.issues.iter().any(|x| x.code == "unlit_night" && x.blocking));
    }

    #[test]
    fn imc_destination_needs_ir() {
        let (a, b) = (db().get("LTBA").unwrap(), db().get("LTBU").unwrap());
        let d = dispatch(&DispatchInput { dest_category: Some(FlightCategory::Ifr), pilot_ir: false, ..input(Class::LightPiston, a, b, 1, 0) });
        assert!(d.ifr, "IFR havada hafif uçak da IFR uçar");
        assert!(d.issues.iter().any(|x| x.code == "imc_without_ir" && x.blocking));
        assert!(d.alternate.is_some());
    }

    #[test]
    fn every_class_can_fly_its_typical_long_leg() {
        for c in &CLASSES {
            let seats = (c.seats as f64 * 0.7) as u32;
            assert!(feasible(c.id, c.max_leg_nm as f64, seats, 0), "{:?} {} nm", c.id, c.max_leg_nm);
            assert!(feasible(c.id, c.min_leg_nm as f64, c.seats, 0), "{:?} dolu", c.id);
            // Kargo uçuşu: tipik yükün yarısı.
            assert!(feasible(c.id, c.max_leg_nm as f64 * 0.6, 0, c.cargo_kg / 2), "{:?} kargo", c.id);
        }
        assert!(final_reserve_kg(Class::LightPiston) > final_reserve_kg(Class::LightPiston) * 0.99);
        assert_eq!(final_reserve_kg(Class::Narrowbody), 1250.0);
    }
}
