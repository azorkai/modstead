//! Uçuşu simde hazırlamak: park yeri seçimi, `.FLT` (SimConnect_FlightLoad için) ve `.PLN` (EFB/GPS planı).
//!
//! Park yerleri simin kendi havalimanı verisinden gelir (`SimConnect_RequestFacilityData`: TAXI_PARKING tür,
//! ad, numara, yarıçap ve referans noktasına göre kayma). Uçağın boyutuna ve işin türüne uygun yer seçilir:
//! hafif uçak GA apronuna, yolcu jeti kapıya, kargo jeti kargo apronuna.
//!
//! FLT biçimi MSFS 2024 SDK'sındaki "FLT File Properties" sayfasından; dosya Windows-1252 yazılır.

use serde::{Deserialize, Serialize};

use super::aircraft::{Class, info};
use super::airports::{Airport, offset};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Parking {
    /// `TYPE`: 1 RAMP_GA, 2 RAMP_GA_SMALL, 3 RAMP_GA_MEDIUM, 4 RAMP_GA_LARGE, 5 RAMP_CARGO, 8–10 GATE_S/M/H…
    pub kind: i32,
    /// `NAME`: 1 PARKING, 2–9 yönlü, 10 GATE, 11 DOCK, 12–37 GATE_A–GATE_Z
    pub name: i32,
    pub suffix: i32,
    pub number: u32,
    pub heading: f32,
    pub radius: f32,
    pub bias_x: f32,
    pub bias_z: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Runway {
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
    pub heading: f32,
    pub length_m: f32,
    pub primary_number: i32,
    pub primary_designator: i32,
    pub secondary_number: i32,
    pub secondary_designator: i32,
    pub surface: i32,
}

/// Simden alınan havalimanı ayrıntısı (önbelleğe yazılır).
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct AirportDetail {
    pub icao: String,
    pub lat: f64,
    pub lon: f64,
    pub alt_m: f64,
    pub parkings: Vec<Parking>,
    pub runways: Vec<Runway>,
    pub fetched_at: i64,
}

const PARKING_NAMES: [&str; 12] = ["NONE", "PARKING", "N_PARKING", "NE_PARKING", "E_PARKING", "SE_PARKING", "S_PARKING", "SW_PARKING", "W_PARKING", "NW_PARKING", "GATE", "DOCK"];

/// `NAME`/`SUFFIX` sayısı → FLT'deki ad ("PARKING", "GATE_B"…).
pub fn parking_name(code: i32) -> String {
    match code {
        0..=11 => PARKING_NAMES[code as usize].to_string(),
        12..=37 => format!("GATE_{}", (b'A' + (code - 12) as u8) as char),
        _ => "NONE".to_string(),
    }
}

/// Arayüzde gösterilen kısa ad ("Kapı B12", "Park 4").
pub fn parking_label(p: &Parking) -> String {
    let n = parking_name(p.name);
    let letter = n.strip_prefix("GATE_").map(|l| l.to_string());
    match (letter, n.as_str()) {
        (Some(l), _) => format!("{l}{}", p.number),
        (None, "GATE") => format!("G{}", p.number),
        _ => format!("{}", p.number),
    }
}

/// Uçak sınıfına ve işe göre tercih edilen park türleri (sıra öncelik).
fn preferred(class: Class, cargo: bool) -> &'static [i32] {
    match class {
        Class::Helicopter => &[2, 1, 3, 14],
        Class::LightPiston => &[2, 1, 3, 14],
        Class::PistonTwin | Class::TurbopropSingle | Class::TurbopropTwin => &[3, 4, 1, 2, 14],
        Class::Bizjet => &[4, 3, 8, 1],
        Class::RegionalTurboprop | Class::RegionalJet | Class::Narrowbody => {
            if cargo {
                &[5, 9, 8, 10, 15]
            } else {
                &[8, 9, 10, 15, 5]
            }
        }
        Class::Widebody => {
            if cargo {
                &[5, 10, 15]
            } else {
                &[10, 15, 9]
            }
        }
    }
}

/// Uygun park yeri. Aynı işe hep aynı yer düşsün diye `seed` ile en iyi birkaç aday arasından seçilir.
pub fn choose_parking(d: &AirportDetail, class: Class, cargo: bool, seed: u64) -> Option<&Parking> {
    let need = info(class).parking_radius_m;
    let prefs = preferred(class, cargo);
    let mut ranked: Vec<(usize, f32, &Parking)> = d
        .parkings
        .iter()
        .filter(|p| p.radius >= need && !matches!(p.kind, 12 | 13))
        .map(|p| (prefs.iter().position(|k| *k == p.kind).unwrap_or(prefs.len() + 1), p.radius, p))
        .collect();
    // Önce tercih sırası, sonra uçağa en yakın boyut (büyük yerleri büyük uçaklara bırak).
    ranked.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
    let best_rank = ranked.first()?.0;
    let top: Vec<&Parking> = ranked.iter().filter(|r| r.0 == best_rank).take(6).map(|r| r.2).collect();
    top.get((seed % top.len() as u64) as usize).copied()
}

pub fn parking_position(d: &AirportDetail, p: &Parking) -> (f64, f64) {
    offset(d.lat, d.lon, p.bias_x as f64, p.bias_z as f64)
}

const DESIGNATORS: [&str; 8] = ["NONE", "LEFT", "RIGHT", "CENTER", "WATER", "A", "B", "LAST"];

/// Kalkış pisti: en uzun açık pist; hangi ucu kullanılacağını rüzgârı bilmeden sim seçer.
pub fn runway_ends(r: &Runway) -> (String, String) {
    (format!("{:02}", r.primary_number), DESIGNATORS.get(r.primary_designator as usize).unwrap_or(&"NONE").to_string())
}

/// FLT'deki derece-dakika-saniye biçimi: `N40° 58' 33.60"`.
pub fn dms(v: f64, lat: bool) -> String {
    let hemi = match (lat, v >= 0.0) {
        (true, true) => 'N',
        (true, false) => 'S',
        (false, true) => 'E',
        (false, false) => 'W',
    };
    let a = v.abs();
    let deg = a.floor();
    let min_f = (a - deg) * 60.0;
    let min = min_f.floor();
    let sec = (min_f - min) * 60.0;
    // 59.995 → 60.00 yazılmasın.
    let (deg, min, sec) = if sec >= 59.995 { if min + 1.0 >= 60.0 { (deg + 1.0, 0.0, 0.0) } else { (deg, min + 1.0, 0.0) } } else { (deg, min, sec) };
    format!("{hemi}{}° {}' {:.2}\"", deg as i64, min as i64, sec)
}

fn alt_str(ft: f64) -> String {
    format!("{}{:09.2}", if ft < 0.0 { '-' } else { '+' }, ft.abs())
}

/// FLT için gereken her şey.
pub struct FlightSetup<'a> {
    pub title: &'a str,
    pub description: &'a str,
    pub aircraft_title: &'a str,
    pub livery: &'a str,
    pub from: &'a Airport,
    pub to: &'a Airport,
    pub parking: Option<&'a Parking>,
    /// Başlangıç konumu (park yeri ya da havalimanı noktası) ve yönü.
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: f64,
    pub heading: f64,
    pub runway: Option<(String, String)>,
    pub pln_name: Option<&'a str>,
    pub cruise_alt_ft: u32,
    /// UTC zaman.
    pub when: chrono::DateTime<chrono::Utc>,
}

pub fn write_flt(s: &FlightSetup) -> String {
    use chrono::Datelike;
    use chrono::Timelike;
    let mut o = String::new();
    let mut sec = |name: &str, kv: &[(&str, String)]| {
        o.push_str(&format!("[{name}]\r\n"));
        for (k, v) in kv {
            o.push_str(&format!("{k}={v}\r\n"));
        }
        o.push_str("\r\n");
    };
    sec(
        "Main",
        &[
            ("Title", s.title.to_string()),
            ("Description", s.description.to_string()),
            ("AppVersion", "10.0.0".into()),
            ("FlightVersion", "1".into()),
            ("MissionType", "FreeFlight".into()),
            ("FlightType", "NORMAL".into()),
            ("StartingCameraCategory", "Cockpit".into()),
        ],
    );
    let (rwy_n, rwy_d) = s.runway.clone().unwrap_or_else(|| ("".into(), "NONE".into()));
    let mut dep = vec![("ICAO", s.from.icao.clone()), ("RunwayNumber", rwy_n), ("RunwayDesignator", rwy_d)];
    if let Some(p) = s.parking {
        dep.push(("GateName", parking_name(p.name)));
        dep.push(("GateNumber", p.number.to_string()));
        dep.push(("GateSuffix", parking_name(p.suffix)));
    }
    sec("Departure", &dep);
    sec("Arrival", &[("ICAO", s.to.icao.clone()), ("RunwayNumber", "".into()), ("RunwayDesignator", "NONE".into())]);
    sec("FreeFlight", &[("FirstFlightState", if s.parking.is_some() { "PREFLIGHT_GATE" } else { "PREFLIGHT_TAXI" }.into())]);
    let mut sim = vec![("Sim", s.aircraft_title.to_string())];
    if !s.livery.is_empty() {
        sim.push(("Livery", s.livery.to_string()));
    }
    sec("Sim.0", &sim);
    sec(
        "SimVars.0",
        &[
            ("Latitude", dms(s.lat, true)),
            ("Longitude", dms(s.lon, false)),
            ("Altitude", alt_str(s.alt_ft)),
            ("Pitch", "0".into()),
            ("Bank", "0".into()),
            ("Heading", format!("{:.2}", s.heading)),
            ("PVelBodyAxis", "0".into()),
            ("BVelBodyAxis", "0".into()),
            ("HVelBodyAxis", "0".into()),
            ("XVelBodyAxis", "0".into()),
            ("YVelBodyAxis", "0".into()),
            ("ZVelBodyAxis", "0".into()),
            ("SimOnGround", "True".into()),
            ("OnPlatformHeight", "-9999999999".into()),
        ],
    );
    let month = s.when.month0();
    let season = match month {
        11 | 0 | 1 => "Winter",
        2..=4 => "Spring",
        5..=7 => "Summer",
        _ => "Fall",
    };
    sec(
        "DateTimeSeason",
        &[
            ("Season", season.into()),
            ("Year", s.when.year().to_string()),
            ("Day", s.when.ordinal0().to_string()),
            ("Hours", s.when.hour().to_string()),
            ("Minutes", s.when.minute().to_string()),
            ("Seconds", s.when.second().to_string()),
            ("UseZuluTime", "True".into()),
        ],
    );
    sec("Weather", &[("UseWeatherFile", "False".into()), ("UseLiveWeather", "True".into()), ("WeatherCanBeLive", "True".into())]);
    if let Some(p) = s.pln_name {
        sec("GPS_Engine", &[("Filename", p.to_string())]);
    }
    o
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn lla(a: &Airport) -> String {
    format!("{},{},{}", dms(a.lat, true), dms(a.lon, false), alt_str(a.elevation_ft as f64))
}

/// Doğrudan (GPS) VFR/IFR planı. EFB'ye "PLN yükle" ile ya da `SimConnect_FlightPlanLoad` ile verilir.
pub fn write_pln(from: &Airport, to: &Airport, cruise_alt_ft: u32, ifr: bool) -> String {
    let wp = |a: &Airport| {
        format!(
            "    <ATCWaypoint id=\"{id}\">\n      <ATCWaypointType>Airport</ATCWaypointType>\n      <WorldPosition>{pos}</WorldPosition>\n      <ICAO>\n        <ICAOIdent>{id}</ICAOIdent>\n      </ICAO>\n    </ATCWaypoint>\n",
            id = xml_escape(&a.icao),
            pos = lla(a)
        )
    };
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<SimBase.Document Type=\"AceXML\" version=\"1,0\">\n  <Descr>AceXML Document</Descr>\n  <FlightPlan.FlightPlan>\n    <Title>{f} to {t}</Title>\n    <FPType>{fp}</FPType>\n    <RouteType>Direct</RouteType>\n    <CruisingAlt>{alt}</CruisingAlt>\n    <DepartureID>{f}</DepartureID>\n    <DepartureLLA>{dlla}</DepartureLLA>\n    <DestinationID>{t}</DestinationID>\n    <DestinationLLA>{alla}</DestinationLLA>\n    <Descr>{f}, {t}</Descr>\n    <DepartureName>{fname}</DepartureName>\n    <DestinationName>{tname}</DestinationName>\n    <AppVersion>\n      <AppVersionMajor>11</AppVersionMajor>\n      <AppVersionBuild>282174</AppVersionBuild>\n    </AppVersion>\n{w1}{w2}  </FlightPlan.FlightPlan>\n</SimBase.Document>\n",
        f = xml_escape(&from.icao),
        t = xml_escape(&to.icao),
        fp = if ifr { "IFR" } else { "VFR" },
        alt = cruise_alt_ft,
        dlla = lla(from),
        alla = lla(to),
        fname = xml_escape(&from.name),
        tname = xml_escape(&to.name),
        w1 = wp(from),
        w2 = wp(to),
    )
}

/// FLT dosyası Windows-1252 olmalı (° işareti 0xB0). Latin-1 dışı karakterler '?' olur.
pub fn to_ansi(s: &str) -> Vec<u8> {
    s.chars().map(|c| if (c as u32) < 256 { c as u8 } else { b'?' }).collect()
}

/// SimBrief'te bu işi planlamak için adres (kullanıcı tarayıcıda açar).
pub fn simbrief_url(from: &str, to: &str, simbrief_type: Option<&str>) -> String {
    let mut u = format!("https://dispatch.simbrief.com/options/custom?orig={from}&dest={to}");
    if let Some(t) = simbrief_type {
        u.push_str(&format!("&type={t}"));
    }
    u
}

/// SimBrief uçak türü (ICAO tip kodu) tahmini: ATC modelinden.
pub fn icao_type(atc_model: &str) -> Option<String> {
    let m = atc_model.trim();
    let m = m.strip_prefix("TT:ATCCOM.AC_MODEL_").map(|x| x.split('.').next().unwrap_or(x)).unwrap_or(m);
    let m = m.trim().to_ascii_uppercase();
    (m.len() >= 2 && m.len() <= 4 && m.chars().all(|c| c.is_ascii_alphanumeric())).then_some(m)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::airports::db;

    fn detail() -> AirportDetail {
        let p = |kind, name, number, radius, x, z| Parking { kind, name, suffix: 0, number, heading: 90.0, radius, bias_x: x, bias_z: z };
        AirportDetail {
            icao: "LTBA".into(),
            lat: 40.976,
            lon: 28.814,
            alt_m: 50.0,
            parkings: vec![
                p(2, 1, 1, 7.0, 100.0, 0.0),
                p(2, 1, 2, 7.0, 110.0, 0.0),
                p(9, 13, 12, 25.0, -200.0, 300.0),
                p(10, 14, 3, 40.0, -300.0, 300.0),
                p(5, 1, 20, 36.0, 500.0, -100.0),
                p(12, 1, 99, 50.0, 0.0, 0.0),
            ],
            runways: vec![Runway { primary_number: 5, primary_designator: 0, length_m: 3000.0, ..Default::default() }],
            fetched_at: 0,
        }
    }

    #[test]
    fn parking_names() {
        assert_eq!(parking_name(1), "PARKING");
        assert_eq!(parking_name(12), "GATE_A");
        assert_eq!(parking_name(37), "GATE_Z");
        assert_eq!(parking_label(&Parking { name: 13, number: 12, ..Default::default() }), "B12");
    }

    #[test]
    fn picks_parking_by_size_and_job() {
        let d = detail();
        assert_eq!(choose_parking(&d, Class::LightPiston, false, 0).unwrap().kind, 2);
        let n = choose_parking(&d, Class::Narrowbody, false, 0).unwrap();
        assert_eq!((n.kind, n.number), (9, 12));
        assert_eq!(choose_parking(&d, Class::Widebody, true, 0).unwrap().kind, 5);
        assert_eq!(choose_parking(&d, Class::Widebody, false, 0).unwrap().kind, 10);
        // Yakıt yeri asla seçilmez.
        let only_fuel = AirportDetail { parkings: vec![d.parkings[5].clone()], ..d.clone() };
        assert!(choose_parking(&only_fuel, Class::LightPiston, false, 0).is_none());
        let (lat, lon) = parking_position(&d, &d.parkings[0]);
        assert!((lat - d.lat).abs() < 1e-6 && lon > d.lon);
    }

    #[test]
    fn dms_format() {
        assert_eq!(dms(40.976, true), "N40° 58' 33.60\"");
        assert_eq!(dms(-122.5, false), "W122° 30' 0.00\"");
        assert_eq!(alt_str(163.4), "+000163.40");
    }

    #[test]
    fn flt_and_pln_contain_the_essentials() {
        let (a, b) = (db().get("LTBA").unwrap(), db().get("LTBU").unwrap());
        let d = detail();
        let p = &d.parkings[0];
        let s = FlightSetup {
            title: "Modstead: LTBA - LTBU",
            description: "Yedek parça",
            aircraft_title: "Cessna Skyhawk G1000 Asobo",
            livery: "",
            from: a,
            to: b,
            parking: Some(p),
            lat: 40.97,
            lon: 28.81,
            alt_ft: 163.0,
            heading: 90.0,
            runway: d.runways.first().map(runway_ends),
            pln_name: Some("LTBA_LTBU"),
            cruise_alt_ft: 4500,
            when: chrono::DateTime::from_timestamp(1_800_000_000, 0).unwrap(),
        };
        let flt = write_flt(&s);
        for needle in ["[Main]", "MissionType=FreeFlight", "ICAO=LTBA", "GateName=PARKING", "GateNumber=1", "Sim=Cessna Skyhawk G1000 Asobo", "SimOnGround=True", "ICAO=LTBU", "RunwayNumber=05", "FirstFlightState=PREFLIGHT_GATE", "UseZuluTime=True", "Filename=LTBA_LTBU"] {
            assert!(flt.contains(needle), "{needle}\n{flt}");
        }
        assert!(to_ansi(&flt).contains(&0xB0));
        let pln = write_pln(a, b, 4500, false);
        assert!(pln.contains("<DepartureID>LTBA</DepartureID>") && pln.contains("<FPType>VFR</FPType>") && pln.contains("ATCWaypoint id=\"LTBU\""));
        assert!(roxmltree::Document::parse(&pln).is_ok());
    }

    #[test]
    fn simbrief_helpers() {
        assert_eq!(icao_type("TT:ATCCOM.AC_MODEL_A20N.0.text").as_deref(), Some("A20N"));
        assert_eq!(icao_type("C172").as_deref(), Some("C172"));
        assert_eq!(icao_type("Bilinmeyen uzun ad"), None);
        assert!(simbrief_url("LTFM", "LTAI", Some("A20N")).ends_with("orig=LTFM&dest=LTAI&type=A20N"));
    }
}
