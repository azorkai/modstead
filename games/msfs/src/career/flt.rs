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
    /// Genişlik (m); eski önbellekte 0.
    pub width_m: f32,
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

/// Bir pist ucu: ad ("06L"), uçağın kalkışa dizileceği nokta ve yön.
#[derive(Debug, Clone, PartialEq)]
pub struct RunwayEnd {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: f64,
    pub heading: f64,
}

/// Eşikten içeri doğru pay (m): eşik çizgileri ve kaydırılmış eşikler için; kısa pistlerde pistin dörtte biri.
const LINEUP_MARGIN_M: f64 = 60.0;

fn end_name(number: i32, designator: i32) -> String {
    let letter = match designator {
        1 => "L",
        2 => "R",
        3 => "C",
        4 => "W",
        5 => "A",
        6 => "B",
        _ => "",
    };
    format!("{number:02}{letter}")
}

/// Havalimanının pist uçları, en uzun pistten başlayarak (her pistin önce birincil ucu). Pist verisinde
/// merkez ve birincil yön vardır: birincil uçta uçak birincil yöne bakar ve merkezin gerisinde durur.
pub fn runway_ends_of(d: &AirportDetail) -> Vec<RunwayEnd> {
    let mut rs: Vec<&Runway> = d.runways.iter().filter(|r| r.length_m > 0.0).collect();
    rs.sort_by(|a, b| b.length_m.total_cmp(&a.length_m));
    let mut out = Vec::new();
    for r in rs {
        let half = r.length_m as f64 / 2.0;
        let back = (half - LINEUP_MARGIN_M.min(half / 2.0)).max(0.0);
        let hdg = r.heading as f64;
        for (number, designator, facing) in [(r.primary_number, r.primary_designator, hdg), (r.secondary_number, r.secondary_designator, (hdg + 180.0) % 360.0)] {
            if number <= 0 {
                continue;
            }
            // Uçak `facing` yönüne bakar; eşik ise merkezden tam ters yöndedir.
            let b = (facing + 180.0).to_radians();
            let (lat, lon) = offset(r.lat, r.lon, back * b.sin(), back * b.cos());
            out.push(RunwayEnd { name: end_name(number, designator), lat, lon, alt_ft: r.alt_m * 3.28084, heading: facing });
        }
    }
    out
}

/// İstenen pist ucu; adı tutmazsa aynı numaralı uç ("06R" istendi, simde "06L" var), o da yoksa ilk uç.
pub fn choose_runway_end(d: &AirportDetail, wanted: Option<&str>) -> Option<RunwayEnd> {
    let ends = runway_ends_of(d);
    let norm = |s: &str| {
        let s = s.trim().to_ascii_uppercase();
        let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
        (digits.parse::<i32>().unwrap_or(-1), s.trim_start_matches(|c: char| c.is_ascii_digit()).to_string())
    };
    if let Some(w) = wanted.map(norm) {
        if let Some(e) = ends.iter().find(|e| norm(&e.name) == w) {
            return Some(e.clone());
        }
        if let Some(e) = ends.iter().find(|e| norm(&e.name).0 == w.0) {
            return Some(e.clone());
        }
    }
    ends.into_iter().next()
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
    /// Kuyruk tescili (2024 dosyasında; boşsa sim kendi tescilini koyar).
    pub tail_number: &'a str,
    pub from: &'a Airport,
    pub to: &'a Airport,
    pub parking: Option<&'a Parking>,
    /// Pist başında başla. 2020'de simin `FLIGHT_RUNWAY` durumu (motorlar çalışır). 2024'te o durum ana menüden de,
    /// açık bir uçuşun üstüne de yüklenince "Uçuşa hazır"dan sonraki sinemada (CAMERA STATE 16) takılı kalıyor; ESC
    /// de çalışmıyor. Bu yüzden 2024'te `PREFLIGHT_TAXI` yazılır: koltukta, motorlar çalışır, sinemasız (gerçek simde
    /// denendi, 26.10.2026).
    pub runway_start: bool,
    /// Başlangıç konumu (park yeri, pist ucu ya da havalimanı noktası) ve yönü.
    pub lat: f64,
    pub lon: f64,
    pub alt_ft: f64,
    pub heading: f64,
    pub runway: Option<(String, String)>,
    pub pln_name: Option<&'a str>,
    pub cruise_alt_ft: u32,
    /// UTC zaman (canlı işte şimdi, senaryo işinde senaryonun saati).
    pub when: chrono::DateTime<chrono::Utc>,
    /// Senaryo havası: simin yerleşik ön ayar dosyası ("Snow.WPR"); `None` ise canlı hava.
    pub weather_preset: Option<&'a str>,
    /// Mevsim ("Winter"); `None` ise tarihten.
    pub season: Option<&'a str>,
}

/// Tarihten mevsim (kuzey yarımküre ayları; sim de tarihten hesaplar).
fn season_of(when: &chrono::DateTime<chrono::Utc>) -> &'static str {
    use chrono::Datelike;
    match when.month0() {
        11 | 0 | 1 => "Winter",
        2..=4 => "Spring",
        5..=7 => "Summer",
        _ => "Fall",
    }
}

/// 2024 `[Weather]` bölümünün hava satırları. Ön ayar Asobo'nun kendi kariyer dosyalarındaki biçimle yazılır
/// (`fs-career-asobo/.../Certification/Turboprop.FLT`): dosya yolu simin sanal dosya sisteminin kökünden,
/// `fs-base-spb/WeatherPresets/` klasöründeki yerleşik ön ayar.
fn weather_lines_2024(preset: Option<&str>) -> String {
    match preset {
        Some(file) => format!("UseWeatherFile=True\nUseLiveWeather=False\nWeatherPresetFile=.\\WeatherPresets\\{file}\nWeatherCanBeLive=False"),
        None => "UseWeatherFile=False\nUseLiveWeather=True\nWeatherCanBeLive=True".to_string(),
    }
}

/// Simin uçağı hangi durumda hazırlayacağı: park yerinde soğuk, pistte motorlar çalışır.
fn first_state(s: &FlightSetup) -> &'static str {
    if s.runway_start {
        "FLIGHT_RUNWAY"
    } else if s.parking.is_some() {
        "PREFLIGHT_GATE"
    } else {
        "PREFLIGHT_TAXI"
    }
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
    sec("FreeFlight", &[("FirstFlightState", first_state(s).into())]);
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
    let season = s.season.unwrap_or_else(|| season_of(&s.when));
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
    // 2020'de hava hep canlı: ön ayar anahtarlarının (`WeatherPresetFile`) 2020'de çalıştığı doğrulanmadı. Senaryonun
    // saati ve mevsimi yukarıda uygulanır.
    sec("Weather", &[("UseWeatherFile", "False".into()), ("UseLiveWeather", "True".into()), ("WeatherCanBeLive", "True".into())]);
    if let Some(p) = s.pln_name {
        sec("GPS_Engine", &[("Filename", p.to_string())]);
    }
    o
}

/// MSFS 2024 biçimi. Sim, ana menüden `FlightLoad` ile yalnızca kendi serbest uçuş dosyasının yapısını yükler:
/// `[ObjectFile]`/`[WolfProgram]` serbest uçuş mantığı, kabin hizmetleri, ATC ve pencere bölümleri olmadan istek
/// sessizce yok sayılır. Bu şablon simin `MISSIONS\Custom\CustomFlight\CustomFlight.FLT` dosyasından uçağa özel
/// bölümler (yakıt, motor, ışık, kokpit değişkenleri) atılarak çıkarıldı ve gerçek simde denendi.
/// `[Departure]`/`[Arrival]` yazılmaz: 2024 bunlarla uçağı başka yere koyabiliyor. Plan `[GPS_Engine]` ile
/// verilir (yerden başlarken uçağın yerini değiştirmiyor; gerçek simde denendi).
pub fn write_flt_2024(s: &FlightSetup) -> String {
    use chrono::Datelike;
    use chrono::Timelike;
    let season = s.season.unwrap_or_else(|| season_of(&s.when));
    let text = format!(
        r#"[Main]
Title={title}
Description={description}
AppVersion=12.0.1
FlightVersion=1
MissionType=FreeFlight
MissionLocation={from}
OriginalFlight=
FlightType=NORMAL
StartingCameraCategory=Cockpit

[Options]
Sound=True
Moonlight=False
Save=False
SaveOriginalFlightPlan=False
TextDisplayPage=0
SlewDisplayPage=0
AxisIndicator=Off
Titles=False

[Sim.0]
Sim={aircraft}
Livery={livery}
Pilot=Default
Copilot=
TailNumber={tail}
AirlineCallSign=
FlightNumber=
AppendHeavy=False
DisableMassSections=False
{cabin}
[ObjectFile]
File.0=Missions\Asobo\FreeFlights\FreeFlight\FreeFlight
File.1=Missions\Asobo\FreeFlights\FreeFlight\Generic_Logic_Pause
File.2=missions\Asobo\FreeFlights\FreeFlight\Generic_Logic_MissionFailed
File.3=Missions\Asobo\FreeFlights\FreeFlight\ToolBarSettings
File.4=Missions\Asobo\FreeFlights\FreeFlight\FreeFlight_Services
File.5=Missions\Asobo\FreeFlights\FreeFlight\Generic_Logic_FlightPath
File.6=Missions\Asobo\FreeFlights\FreeFlight\Freeflight_BackOnTrack
File.7=missions\Asobo\SR\Common\Generic\Utilities\Detent_Notif_Mgr
File.8=missions\Asobo\SR\Common\Generic\FullFlight\FullFlightOverride

[WolfProgram]
NbFiles=1
File.0=missions\Asobo\FreeFlights\FreeFlight\FreeFlightMain.wolf

[FreeFlight]
FirstFlightState={state}

[Weather]
{weather}
CloudmapPosOverride=False
CloudmapInitialPosX=0
CloudmapInitialPosY=0
FixedClouds=False
DebugPublicAirflowDisplay=False

[SoundPackages]
NbFiles=0

[TrafficOptions]
AllowAmbientVehicleTraffic=True

[DateTimeSeason]
Season={season}
Year={year}
Day={day}
Hours={hours}
Minutes={minutes}
Seconds={seconds}
UseZuluTime=True

[Panels]
Panel.On=True
HUD.On=False

[Window.1]
Order=255
Active=True
Undocked=False
Maximized=False
ScreenUniCoords=0, 0, 0, 0
UndocCoords=0, 0, 0, 0

[ATC_AgentManager]
NumberofAgents=0

[ATC_Aircraft.0]
ActiveFlightPlan=False
RequestedFlightPlan=False
AcState=ACSTATE_REQUEST_TAXI_CLEARANCE_OUT_VFR_ATIS
NumberofWaypoints=0
ClearanceFlags=82
CtCur=CLEARANCE_NONE
WaypointNext=0
AltCleared=-1
HdgAssigned=-1
SquawkAssigned=4608
LandingSequence=LANDING_NONE
DepartureRequest=DEPARTURE_VFR_REQUEST_NONE
ParkingRequest=PARKING_NAME_NONE
ParkingTypeRequest=PARKING_TYPE_NONE
PatternLeg=PATTERN_LEG_NONE
ApproachIndex=-1
ApproachTransitionIndex=-1
ApproachRequestIndex=-1
ApproachTransitionRequestIndex=-1
HelipadIndex=-1
HelipadRequestIndex=-1
RunwayIndex=-1
RunwayRequestIndex=-1
ParkingIndex=-1
FlightFollowing=FLIGHT_FOLLOWING_NO
AirspaceTransition=AIRSPACE_TRANSITION_NONE
BVAirspaceTransition=BV_TYPE_NONE
BVAirspaceTransitionReq=BV_TYPE_NONE
TakeoffSequence=TAKEOFF_SEQUENCE_NONE
LandingSequenceNumber=-1
TaxiRouteCurrent=-1
CruisingAltitude=-1
RequestedCruisingAltitude=-1
ExpectedAltitude=-1
AircraftSignature=1,0

[ATC_AircraftManager]
NumberofAircraft=1

[ATC_MessageSystem]
FrequencyNodes=0

[SimplifiedSim.0]
Mode=None

[SimVars.0]
Latitude={lat}
Longitude={lon}
Altitude={alt}
Pitch=0
Bank=0
Heading={heading:.2}
PVelBodyAxis=0
BVelBodyAxis=0
HVelBodyAxis=0
XVelBodyAxis=0
YVelBodyAxis=0
ZVelBodyAxis=0
ZVelBodyAxis_IAS=0
SimOnGround=True
OnPlatformHeight=-9999999999

[Slew.0]
Active=False

[Freeze.0]
Location=False
Altitude=False
Attitude=False

[SimScheduler]
SimSpeed=001.00
{gps}"#,
        title = s.title,
        description = s.description,
        from = s.from.icao,
        aircraft = s.aircraft_title,
        livery = s.livery,
        tail = s.tail_number,
        cabin = CABIN_2024,
        state = match (s.runway_start, s.parking.is_some()) {
            (true, _) => "PREFLIGHT_TAXI",
            // Park yerinde 2024 kullanıcıyı uçağın yanında başlatır (dış kontrol); Shift+C ile binilir.
            (false, true) => "PREFLIGHT_GATE",
            (false, false) => "PREFLIGHT_TAXI",
        },
        weather = weather_lines_2024(s.weather_preset),
        season = season,
        year = s.when.year(),
        day = s.when.ordinal0(),
        hours = s.when.hour(),
        minutes = s.when.minute(),
        seconds = s.when.second(),
        lat = dms(s.lat, true),
        lon = dms(s.lon, false),
        alt = alt_str(s.alt_ft),
        heading = s.heading,
        // Yerden başlayan uçuşta plan simin GPS'ine yüklenir (gerçek simde: aktif plan, 2 nokta, sıradaki nokta
        // varış). Havada başlarken 2024 planlı uçağı piste ışınlıyor; Modstead hep yerden başlatır.
        gps = s.pln_name.map(|p| format!("\n[GPS_Engine]\nFilename={p}\n")).unwrap_or_default(),
    );
    text.replace('\n', "\r\n")
}

/// 2024 serbest uçuşunun kabin hizmetleri (yolcu, kargo, ambulans, paraşüt, vinç); uçak hangisini destekliyorsa o
/// kullanılır. Simin kendi dosyasındaki gibi.
const CABIN_2024: &str = r"
[CabinService.0]
Name=PassengerBoardingService
GraphPath=navigation_graph_passenger.cfg
CharacterQuality=SECONDARY

[CabinServiceObject.0]
CabinServiceName=PassengerBoardingService
BehaviourName=PassengerBoarding
Quantity=-1
NodeTag=SIT
Density=100
CountByMass=True
ReduceQuantityOnSharedSeatWithCopilot=True
GeneratedCharacters=Passenger

[CabinService.1]
Name=CargoService
GraphPath=navigation_graph_cargo.cfg
CharacterQuality=SECONDARY

[CabinService.2]
Name=MedicService
GraphPath=navigation_graph_medic.cfg
CharacterQuality=SECONDARY

[CabinServiceObject.1]
CabinServiceName=MedicService
BehaviourName=Wounded
Quantity=-1
NodeTag=PATIENT
Density=100
CountByMass=True
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=Patient

[CabinServiceObject.2]
CabinServiceName=MedicService
BehaviourName=Doctor
Quantity=1
NodeTag=SIT
Density=100
CountByMass=False
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=Medic

[CabinServiceObject.3]
CabinServiceName=MedicService
BehaviourName=Nurse
Quantity=1
NodeTag=SIT
Density=100
CountByMass=False
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=Medic

[CabinServiceObject.4]
CabinServiceName=MedicService
BehaviourName=Relative
Quantity=1
NodeTag=SIT
Density=100
CountByMass=False
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=Passenger

[CabinService.3]
Name=SkydiveService
GraphPath=navigation_graph_skydive.cfg
CharacterQuality=SECONDARY

[CabinServiceObject.5]
CabinServiceName=SkydiveService
BehaviourName=Skydiver
Quantity=-1
NodeTag=SIT
Density=100
CountByMass=True
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=Skydiver

[CabinServiceObject.6]
CabinServiceName=SkydiveService
BehaviourName=JumpMaster
Quantity=1
NodeTag=JUMPMASTER_SIT
Density=100
CountByMass=False
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=Skydiver

[CabinService.4]
Name=HoistService
GraphPath=navigation_graph_hoist_rescue.cfg
CharacterQuality=SECONDARY

[CabinServiceObject.7]
CabinServiceName=HoistService
BehaviourName=HoistController
Quantity=-1
NodeTag=SIDE
Density=100
CountByMass=True
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=AirRescue

[CabinServiceObject.8]
CabinServiceName=HoistService
BehaviourName=Rescuer
Quantity=1
NodeTag=
Density=100
CountByMass=False
ReduceQuantityOnSharedSeatWithCopilot=False
GeneratedCharacters=AirRescue

[Copilot]
CopilotWeight=-1
PilotWeight=170
SpawnCopilot=TRUE
CopilotProfil=
";

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn lla(a: &Airport) -> String {
    format!("{},{},{}", dms(a.lat, true), dms(a.lon, false), alt_str(a.elevation_ft as f64))
}

/// Doğrudan (GPS) VFR/IFR planı. EFB'ye "PLN yükle" ile ya da `SimConnect_FlightPlanLoad` ile verilir.
pub fn write_pln(from: &Airport, to: &Airport, cruise_alt_ft: u32, ifr: bool) -> String {
    write_pln_route(from, to, cruise_alt_ft, ifr, &[])
}

/// Hava işinin hedefleri ara noktalar (kullanıcı noktası) olarak plana girer; GPS sırayla gösterir.
pub fn write_pln_route(from: &Airport, to: &Airport, cruise_alt_ft: u32, ifr: bool, points: &[super::missions::Objective]) -> String {
    let user = |i: usize, o: &super::missions::Objective| {
        let id: String = format!("{}{}", o.name.chars().filter(|c| c.is_ascii_alphanumeric()).take(4).collect::<String>().to_ascii_uppercase(), i + 1);
        let alt = o.min_ft.or(o.max_ft).unwrap_or(cruise_alt_ft as f64);
        format!(
            "    <ATCWaypoint id=\"{id}\">\n      <ATCWaypointType>User</ATCWaypointType>\n      <WorldPosition>{},{},{}</WorldPosition>\n    </ATCWaypoint>\n",
            dms(o.lat, true),
            dms(o.lon, false),
            alt_str(alt),
            id = xml_escape(&id)
        )
    };
    let middle: String = points.iter().enumerate().map(|(i, o)| user(i, o)).collect();
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
        w1 = wp(from) + &middle,
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
            tail_number: "TC-MOD",
            from: a,
            to: b,
            parking: Some(p),
            runway_start: false,
            lat: 40.97,
            lon: 28.81,
            alt_ft: 163.0,
            heading: 90.0,
            runway: d.runways.first().map(runway_ends),
            pln_name: Some("LTBA_LTBU"),
            cruise_alt_ft: 4500,
            when: chrono::DateTime::from_timestamp(1_800_000_000, 0).unwrap(),
            weather_preset: None,
            season: None,
        };
        let flt = write_flt(&s);
        for needle in ["[Main]", "MissionType=FreeFlight", "ICAO=LTBA", "GateName=PARKING", "GateNumber=1", "Sim=Cessna Skyhawk G1000 Asobo", "SimOnGround=True", "ICAO=LTBU", "RunwayNumber=05", "FirstFlightState=PREFLIGHT_GATE", "UseZuluTime=True", "Filename=LTBA_LTBU"] {
            assert!(flt.contains(needle), "{needle}\n{flt}");
        }
        assert!(to_ansi(&flt).contains(&0xB0));
        let pln = write_pln(a, b, 4500, false);
        let pts = [crate::career::missions::Objective { name: "Silivri".into(), lat: 41.07, lon: 28.25, max_ft: Some(3000.0), ..Default::default() }];
        let tour = write_pln_route(a, a, 2500, false, &pts);
        assert!(tour.contains("<ATCWaypointType>User</ATCWaypointType>") && tour.contains("ATCWaypoint id=\"SILI1\""), "{tour}");
        assert_eq!(tour.matches("<ATCWaypoint ").count(), 3);
        assert!(pln.contains("<DepartureID>LTBA</DepartureID>") && pln.contains("<FPType>VFR</FPType>") && pln.contains("ATCWaypoint id=\"LTBU\""));
        assert!(roxmltree::Document::parse(&pln).is_ok());

        // 2024: simin kendi serbest uçuş yapısı ve plan; kalkış/varış yok (2024 uçağı başka yere koyabiliyor).
        let f24 = write_flt_2024(&s);
        for needle in ["AppVersion=12.0.1", "MissionLocation=LTBA", "Sim=Cessna Skyhawk G1000 Asobo", "TailNumber=TC-MOD", "[WolfProgram]", "FreeFlightMain.wolf", "[CabinService.0]", "[Copilot]", "FirstFlightState=PREFLIGHT_GATE", "SimOnGround=True", "[ATC_AircraftManager]", "[GPS_Engine]\r\nFilename=LTBA_LTBU", "\r\n"] {
            assert!(f24.contains(needle), "{needle}\n{f24}");
        }
        for absent in ["[Departure]", "[Arrival]", "\r\r"] {
            assert!(!f24.contains(absent), "{absent}");
        }
        assert!(f24.lines().all(|l| !l.trim_end_matches('\r').starts_with(' ')));
    }

    #[test]
    fn runway_ends_line_up_on_the_threshold() {
        // LTFJ, simin kendi verisi: tek pist 24R/06L, 3120 m.
        let d = AirportDetail {
            icao: "LTFJ".into(),
            runways: vec![Runway { lat: 40.89855, lon: 29.30923, alt_m: 94.0, heading: 244.1, length_m: 3120.0, width_m: 45.0, primary_number: 24, primary_designator: 2, secondary_number: 6, secondary_designator: 1, surface: 4 }],
            ..Default::default()
        };
        let ends = runway_ends_of(&d);
        assert_eq!(ends.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(), ["24R", "06L"]);
        let (r24, r06) = (&ends[0], &ends[1]);
        assert!((r24.heading - 244.1).abs() < 0.01 && (r06.heading - 64.1).abs() < 0.01);
        // 24R eşiği kuzeydoğuda, 06L güneybatıda; ikisi de merkezden ~1500 m.
        assert!(r24.lat > 40.89855 && r24.lon > 29.30923);
        assert!(r06.lat < 40.89855 && r06.lon < 29.30923);
        // Gerçek simde denenen nokta (06L başı): 40.89266, 29.29319.
        assert!((r06.lat - 40.89266).abs() < 2e-4 && (r06.lon - 29.29319).abs() < 2e-4, "{r06:?}");
        assert!((r06.alt_ft - 308.4).abs() < 0.5);

        assert_eq!(choose_runway_end(&d, Some("06L")).unwrap().name, "06L");
        // Modstead'in listesi "06R" diyor, simde 06L var: aynı numara seçilir.
        assert_eq!(choose_runway_end(&d, Some("6R")).unwrap().name, "06L");
        assert_eq!(choose_runway_end(&d, None).unwrap().name, "24R");
        assert_eq!(choose_runway_end(&d, Some("17")).unwrap().name, "24R");
    }

    #[test]
    fn runway_start_state_per_sim() {
        let (a, b) = (db().get("LTFJ").unwrap(), db().get("LTBQ").unwrap());
        let s = FlightSetup {
            title: "t",
            description: "d",
            aircraft_title: "Diamond DA40NG",
            livery: "",
            tail_number: "",
            from: a,
            to: b,
            parking: None,
            runway_start: true,
            lat: 40.89266,
            lon: 29.29319,
            alt_ft: 308.4,
            heading: 64.1,
            runway: None,
            pln_name: None,
            cruise_alt_ft: 2000,
            when: chrono::DateTime::from_timestamp(1_800_000_000, 0).unwrap(),
            weather_preset: None,
            season: None,
        };
        // 2020 simin kendi pist durumunu kullanır. 2024'te o durum sinemada takıldığı için hiç yazılmaz.
        assert!(write_flt(&s).contains("FirstFlightState=FLIGHT_RUNWAY"));
        assert!(write_flt_2024(&s).contains("FirstFlightState=PREFLIGHT_TAXI"));
        assert!(!write_flt_2024(&s).contains("FLIGHT_RUNWAY"));
    }

    #[test]
    fn scenario_weather_and_time_in_the_flt() {
        use crate::career::conditions::{JobConditions, TimeOfDay, WeatherPreset, find_time, offset_min, preset};
        // Gece, kar: Erzurum (LTCE), 15 Ocak 2027; kalkışta güneş −12°'nin altında.
        let (a, b) = (db().get("LTCE").unwrap(), db().get("LTCI").unwrap());
        let off = offset_min(a.lon) as i64 * 60;
        let midnight = chrono::DateTime::parse_from_rfc3339("2027-01-15T00:00:00Z").unwrap().timestamp() - off;
        let (utc, sun, fallback) = find_time(a.lat, a.lon, midnight, off, TimeOfDay::Night, &mut crate::career::jobs::Rng::new(3));
        assert!(sun < -12.0 && !fallback);
        let c = JobConditions { time: TimeOfDay::Night, weather: WeatherPreset::Snow, utc, wx: preset(WeatherPreset::Snow), season: "Winter".into(), ..Default::default() };
        let when = c.flt_time(chrono::Utc::now());
        assert_eq!(when.timestamp(), utc);
        let s = FlightSetup {
            title: "Modstead: LTCE - LTCI",
            description: "Kar, gece",
            aircraft_title: "Beechcraft King Air 350i",
            livery: "",
            tail_number: "TC-MOD",
            from: a,
            to: b,
            parking: None,
            runway_start: false,
            lat: a.lat,
            lon: a.lon,
            alt_ft: a.elevation_ft as f64,
            heading: 260.0,
            runway: None,
            pln_name: Some("LTCE_LTCI"),
            cruise_alt_ft: 17000,
            when,
            weather_preset: c.wx.as_ref().map(|w| w.file.as_str()),
            season: Some(c.season.as_str()),
        };
        let f24 = write_flt_2024(&s);
        use chrono::{Datelike, Timelike};
        let date = format!("[DateTimeSeason]\r\nSeason=Winter\r\nYear=2027\r\nDay={}\r\nHours={}\r\nMinutes={}\r\n", when.ordinal0(), when.hour(), when.minute());
        for needle in ["[Weather]\r\nUseWeatherFile=True\r\nUseLiveWeather=False\r\nWeatherPresetFile=.\\WeatherPresets\\Snow.WPR\r\nWeatherCanBeLive=False\r\nCloudmapPosOverride=False", date.as_str(), "UseZuluTime=True"] {
            assert!(f24.contains(needle), "{needle}\n{f24}");
        }
        assert!(!f24.contains("UseLiveWeather=True"));
        // 2020: saat ve mevsim uygulanır, hava canlı kalır.
        let f20 = write_flt(&s);
        assert!(f20.contains("Season=Winter") && f20.contains(&format!("Hours={}", when.hour())) && f20.contains("UseLiveWeather=True") && !f20.contains("WeatherPresetFile"));
        // Canlı iş: bugünkü gibi.
        let live = write_flt_2024(&FlightSetup { weather_preset: None, season: None, ..s });
        assert!(live.contains("UseWeatherFile=False\r\nUseLiveWeather=True\r\nWeatherCanBeLive=True") && !live.contains("WeatherPresetFile"));
    }

    #[test]
    fn simbrief_helpers() {
        assert_eq!(icao_type("TT:ATCCOM.AC_MODEL_A20N.0.text").as_deref(), Some("A20N"));
        assert_eq!(icao_type("C172").as_deref(), Some("C172"));
        assert_eq!(icao_type("Bilinmeyen uzun ad"), None);
        assert!(simbrief_url("LTFM", "LTAI", Some("A20N")).ends_with("orig=LTFM&dest=LTAI&type=A20N"));
    }
}
