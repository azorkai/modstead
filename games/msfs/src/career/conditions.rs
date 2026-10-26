//! Hava ve zaman senaryoları (`KARIYER.md` → "Hava ve zaman senaryoları").
//!
//! Her iş ya **canlıdır** (bugünkü gibi: gerçek saat, simin canlı havası, gerçek METAR) ya da bir **senaryo** taşır:
//! kalkış saati (gündüz, şafak, alacakaranlık, gece) ve/veya simin yerleşik hava ön ayarlarından biri (açık, az bulutlu,
//! dağınık bulutlu, parçalı bulutlu, kapalı, yağmur, kar, fırtına). Senaryo uçuş dosyasına yazılır: 2024'te `[Weather]`
//! bölümüne ön ayar (Asobo'nun kendi kariyer dosyalarındaki `WeatherPresetFile` biçimi) ve `[DateTimeSeason]`'a saat;
//! 2020'de yalnızca saat (ön ayar anahtarları 2020'de doğrulanmadı, orada hava canlı kalır).
//!
//! - **Saat:** işin tarihinde, kalkış havalimanında güneşin yüksekliği hedefe uyan bir UTC anı 5 dakikalık adımlarla
//!   aranır: gündüz > 25° (kışın alçak güneşte > 8°), şafak ve alacakaranlık −4°…+6° (yükselen / alçalan), gece < −12°
//!   (beyaz gecelerde < −6°). Hedef hiç yoksa (kutup gecesi ya da gündüzü) en yakın an seçilir ve `fallback` işaretlenir.
//! - **Hava:** ön ayarın bulutu, görüşü, rüzgârı ve yağışı `.WPR` dosyalarından türetilen tablodadır (`PRESETS`); uçuş
//!   kategorisi FAA tanımıyla. Uçuş kâğıdı ve hava rozetleri senaryo havalı işte METAR yerine bunu kullanır.
//! - **Üretim** (`generate`): öğrenci ve eğitim uçuşu yalnızca gündüz, açık/az/dağınık bulut; gece, şafak ve
//!   alacakaranlık PPL ve ışıklı pist ister; IFR ön ayarları (kar, fırtına) geçerli aletli yetki ve aletli uçabilen
//!   sınıf ister; fırtına yalnızca türbinlilerde; kar kışın, yüksek enlemde ve yüksekte daha sık; helikopter, arazi
//!   uçuşu ve hava işleri görerek uçuş koşullarında kalır.
//! - **Ek** (`bonus`): ücret `hava + saat` (en çok %40), XP bunun yarısı (en çok %20).

use chrono::{Datelike, TimeZone};
use serde::{Deserialize, Serialize};

use super::aircraft::Class;
use super::airports::Airport;
use super::env::{FlightCategory, flight_category, sun_elevation_deg};
use super::jobs::Rng;
use super::weather::bad_weather_bonus;

/// Kalkış saati.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default, Hash)]
#[serde(rename_all = "snake_case")]
pub enum TimeOfDay {
    /// Gerçek saat (canlı): uçuş simde o anki UTC saatiyle başlar.
    #[default]
    Now,
    Day,
    Dawn,
    Dusk,
    Night,
}

/// Hava: canlı ya da simin yerleşik ön ayarlarından biri.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default, Hash)]
#[serde(rename_all = "snake_case")]
pub enum WeatherPreset {
    /// Simin canlı havası (gerçek gözlemler) ve gerçek METAR.
    #[default]
    Live,
    Clear,
    Few,
    Scattered,
    Broken,
    Overcast,
    Rain,
    Snow,
    Storm,
}

/// Ön ayarın türetilmiş değerleri (uçuş kâğıdı ve arayüz için; METAR'ın karşılığı).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct ScenarioWx {
    /// Simin ön ayar dosyası (`fs-base-spb/WeatherPresets/`).
    pub file: String,
    /// Bulut katmanları METAR biçiminde ("FEW015 BKN030"); boşsa gökyüzü açık.
    pub sky: String,
    /// Tavan: en alçak BKN/OVC tabanı (ft, yerden).
    pub ceiling_ft: Option<f64>,
    /// Görüş (deniz mili; 10 = 10 ve üstü).
    pub visibility_sm: f64,
    pub wind_dir: f64,
    pub wind_kt: f64,
    pub temp_c: f64,
    /// Yağış: "" | "rain" | "snow".
    pub precip: String,
    pub thunderstorm: bool,
    /// Yerdeki kar örtüsü (m).
    pub snow_cover_m: f64,
    pub category: FlightCategory,
}

impl ScenarioWx {
    /// Yoğunluk irtifası için (sıcaklık °C, QNH hPa): ön ayarların hepsi 1013,25 hPa.
    pub fn temp_qnh(&self) -> (f64, f64) {
        (self.temp_c, 1013.25)
    }

    /// Islak (ya da karlı) pist.
    pub fn wet(&self) -> bool {
        !self.precip.is_empty()
    }
}

/// Bir işin koşulları. Eski kayıtlarda alan yoksa "canlı / şimdi" sayılır (`Default`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct JobConditions {
    pub time: TimeOfDay,
    pub weather: WeatherPreset,
    /// Uçuşun simdeki kalkış anı (unix sn, UTC). `time == Now` ise 0: uçuş gerçek saatle başlar.
    pub utc: i64,
    /// Kalkış havalimanının yerel saat farkı (dk). Boylamdan (15° = 1 saat); yaz saati ve siyasi saat dilimleri
    /// hesaba katılmaz, bu yüzden arayüzde "yaklaşık yerel" diye gösterilir.
    pub utc_offset_min: i32,
    /// Kalkışta güneşin ufuktan yüksekliği (derece).
    pub sun_deg: f64,
    /// İstenen ışık bu tarihte bu enlemde yok (kutup gecesi ya da gündüzü): en yakın an seçildi.
    pub fallback: bool,
    /// Varış gece mi (tahmini varışta güneş varışta −6°'nin altında)? Yalnızca senaryo saatinde anlamlı.
    pub night_arrival: bool,
    /// Simin mevsimi ("" = tarihe göre; kar senaryosunda "Winter": yer ve bitki örtüsü kış).
    pub season: String,
    /// Ön ayarın değerleri; canlı havada `None`.
    pub wx: Option<ScenarioWx>,
    /// Ücret ve XP eki (%).
    pub pay_bonus: u8,
    pub xp_bonus: u8,
    /// Ön ayar aletli uçuş koşullarında (IFR/LIFR): geçerli aletli yetki gerekir.
    pub needs_ir: bool,
}

impl JobConditions {
    /// Bugünkü gibi: gerçek saat ve canlı hava.
    pub fn is_live(&self) -> bool {
        self.time == TimeOfDay::Now && self.weather == WeatherPreset::Live
    }

    /// Kalkış anı (unix sn): senaryoda işin saati, canlıda şimdi.
    pub fn departure(&self, now: i64) -> i64 {
        if self.time == TimeOfDay::Now || self.utc == 0 { now } else { self.utc }
    }

    /// Varış gece mi (güneş varış havalimanında −6°'nin altında)?
    pub fn arrives_at_night(&self, to: &Airport, now: i64, block_min: f64) -> bool {
        let t = self.departure(now) as f64 + block_min * 60.0;
        super::env::is_night(to.lat, to.lon, t)
    }

    /// Uçuş dosyasının saati (UTC).
    pub fn flt_time(&self, now: chrono::DateTime<chrono::Utc>) -> chrono::DateTime<chrono::Utc> {
        if self.time == TimeOfDay::Now || self.utc == 0 {
            return now;
        }
        chrono::DateTime::from_timestamp(self.utc, 0).unwrap_or(now)
    }
}

// ----- Ön ayarlar -----

struct Def {
    id: WeatherPreset,
    file: &'static str,
    sky: &'static str,
    ceiling_ft: Option<f64>,
    visibility_sm: f64,
    wind_kt: f64,
    temp_c: f64,
    precip: &'static str,
    thunderstorm: bool,
    snow_cover_m: f64,
}

/// MSFS 2024'ün `fs-base-spb/WeatherPresets/*.WPR` dosyalarından türetilen değerler (dosyalar dağıtılmaz; doğrulama
/// testi kullanıcının simindeki kopyayı salt okur: `presets_match_the_sim_files`). Kurallar:
/// - Katman tabanı `CloudLayerAltitudeBot` (yerden: `IsAltitudeAMGL`), ft'ye çevrilip yüzlere yuvarlanır. Yoğunluğu
///   0,05'in altında ya da kalınlığı 0 olan katman yok sayılır.
/// - Kapalılık yoğunluk (d) ve dağınıklıktan (s): d ≥ 0,9 ve s ≤ 0,1 → OVC; d ≥ 0,5 ve s ≤ 0,5 → BKN;
///   d ≥ 0,5 ve s ≤ 0,9 → SCT; diğerleri FEW. Tavan en alçak BKN/OVC tabanıdır.
/// - Görüş: pus (`AerosolDensity` a) a ≤ 1,5 → 10 mil, ≤ 2 → 8, ≤ 2,5 → 5, ≤ 3 → 4, üstü 3; yağış sınırı yağmurda
///   ≤ 10 mm/sa → 3 mil, daha şiddetlisinde 1,5 mil, karda 1 mil; ikisinin küçüğü.
/// - Rüzgâr yerdeki rüzgâr katmanından (hepsinde 270°), sıcaklık `MSLTemperature`'dan, kar örtüsü `SnowCover`'dan,
///   oraj `ThunderstormIntensity > 0`'dan.
const PRESETS: [Def; 8] = [
    Def { id: WeatherPreset::Clear, file: "ClearSky.WPR", sky: "", ceiling_ft: None, visibility_sm: 10.0, wind_kt: 2.0, temp_c: 15.0, precip: "", thunderstorm: false, snow_cover_m: 0.0 },
    Def { id: WeatherPreset::Few, file: "FewClouds.WPR", sky: "FEW016 FEW164", ceiling_ft: None, visibility_sm: 10.0, wind_kt: 4.0, temp_c: 15.0, precip: "", thunderstorm: false, snow_cover_m: 0.0 },
    Def { id: WeatherPreset::Scattered, file: "ScatteredClouds.WPR", sky: "SCT015 BKN130 BKN300", ceiling_ft: Some(13_000.0), visibility_sm: 10.0, wind_kt: 5.0, temp_c: 15.0, precip: "", thunderstorm: false, snow_cover_m: 0.0 },
    Def { id: WeatherPreset::Broken, file: "BrokenClouds.WPR", sky: "FEW015 BKN030", ceiling_ft: Some(3_000.0), visibility_sm: 8.0, wind_kt: 12.0, temp_c: 15.0, precip: "", thunderstorm: false, snow_cover_m: 0.0 },
    Def { id: WeatherPreset::Overcast, file: "Overcast.WPR", sky: "FEW015 OVC040 BKN100", ceiling_ft: Some(4_000.0), visibility_sm: 5.0, wind_kt: 8.0, temp_c: 15.0, precip: "", thunderstorm: false, snow_cover_m: 0.0 },
    Def { id: WeatherPreset::Rain, file: "Rain.WPR", sky: "SCT015 BKN030 SCT100", ceiling_ft: Some(3_000.0), visibility_sm: 3.0, wind_kt: 10.0, temp_c: 15.0, precip: "rain", thunderstorm: false, snow_cover_m: 0.0 },
    Def { id: WeatherPreset::Snow, file: "Snow.WPR", sky: "OVC018 SCT047", ceiling_ft: Some(1_800.0), visibility_sm: 1.0, wind_kt: 5.0, temp_c: -5.0, precip: "snow", thunderstorm: false, snow_cover_m: 0.5 },
    Def { id: WeatherPreset::Storm, file: "Storm.WPR", sky: "OVC015 OVC030CB BKN200", ceiling_ft: Some(1_500.0), visibility_sm: 1.5, wind_kt: 30.0, temp_c: 15.0, precip: "rain", thunderstorm: true, snow_cover_m: 0.0 },
];

/// Ön ayarın değerleri (canlı havada `None`).
pub fn preset(w: WeatherPreset) -> Option<ScenarioWx> {
    let d = PRESETS.iter().find(|d| d.id == w)?;
    Some(ScenarioWx {
        file: d.file.into(),
        sky: d.sky.into(),
        ceiling_ft: d.ceiling_ft,
        visibility_sm: d.visibility_sm,
        wind_dir: 270.0,
        wind_kt: d.wind_kt,
        temp_c: d.temp_c,
        precip: d.precip.into(),
        thunderstorm: d.thunderstorm,
        snow_cover_m: d.snow_cover_m,
        category: flight_category(d.ceiling_ft, Some(d.visibility_sm)),
    })
}

/// Ücret eki (%): hava + saat, en çok 40.
/// - Hava: uçuş kategorisi (canlı havadaki kötü hava primiyle aynı: IFR 15, LIFR 25) + yağmur 5, kar 10, oraj 10,
///   20 kt ve üstü rüzgâr 5.
/// - Saat: kalkışta güneş −6°'nin altındaysa (gece; kutup gecesindeki "gündüz" de) 10, şafak ve alacakaranlık 5.
pub fn bonus(time: TimeOfDay, sun_deg: f64, wx: Option<&ScenarioWx>) -> u8 {
    let w = wx.map_or(0, |w| {
        bad_weather_bonus(w.category) as u32
            + match w.precip.as_str() {
                "rain" => 5,
                "snow" => 10,
                _ => 0,
            }
            + if w.thunderstorm { 10 } else { 0 }
            + if w.wind_kt >= 20.0 { 5 } else { 0 }
    });
    let t = match time {
        TimeOfDay::Now => 0,
        _ if sun_deg < -6.0 => 10,
        TimeOfDay::Dawn | TimeOfDay::Dusk => 5,
        _ => 0,
    };
    (w + t).min(40) as u8
}

/// XP eki (%): ücret ekinin yarısı (yukarı yuvarlanır), en çok 20.
pub fn xp_bonus(pay_bonus: u8) -> u8 {
    pay_bonus.div_ceil(2).min(20)
}

// ----- Üretim -----

/// Üretim girdisi: pilot, iş ve rota.
pub struct Pick<'a> {
    pub ppl: bool,
    /// Geçerli aletli yetki (yetki + yeterlilik; Kolay'da yeterlilik aranmaz).
    pub ir: bool,
    pub kind: &'a str,
    pub class: Class,
    pub from: &'a Airport,
    pub to: &'a Airport,
    pub block_min: f64,
    /// İlanın penceresinin başı (unix sn): işin tarihi buradan.
    pub day: i64,
}

fn turbine(c: Class) -> bool {
    matches!(c, Class::TurbopropSingle | Class::TurbopropTwin | Class::RegionalTurboprop | Class::Bizjet | Class::RegionalJet | Class::Narrowbody | Class::Widebody)
}

fn student(p: &Pick) -> bool {
    !p.ppl || p.kind == "training"
}

/// Kar olasılığının çarpanı: mevsim (yarımküreye göre) × enlem × yükseklik.
pub fn snow_factor(month: u32, lat: f64, elev_ft: i32) -> f64 {
    // Güney yarımkürede aylar altı ay kaydırılır (temmuz = ocak).
    let m = if lat >= 0.0 { month } else { (month + 5) % 12 + 1 };
    let season = match m {
        12 | 1 | 2 => 1.0,
        11 | 3 => 0.6,
        10 | 4 => 0.25,
        _ => 0.05,
    };
    let a = lat.abs();
    let mut latf = if a >= 55.0 {
        2.5
    } else if a >= 45.0 {
        1.5
    } else if a >= 35.0 {
        1.0
    } else if a >= 25.0 {
        0.3
    } else {
        0.0
    };
    // Tropikte yalnızca çok yüksek havalimanlarında (And, Himalaya).
    if latf == 0.0 && elev_ft >= 8000 {
        latf = 0.4;
    }
    let elevf = if elev_ft >= 8000 {
        2.5
    } else if elev_ft >= 5000 {
        2.0
    } else if elev_ft >= 2500 {
        1.3
    } else {
        1.0
    };
    season * latf * elevf
}

/// Hava ağırlıkları.
fn weather_weights(p: &Pick, snow: f64) -> Vec<(WeatherPreset, f64)> {
    use WeatherPreset::*;
    if student(p) {
        return vec![(Live, 45.0), (Clear, 25.0), (Few, 20.0), (Scattered, 10.0)];
    }
    match p.kind {
        // Atlayışta 10.000 ft'e (yerden) tırmanılır, fotoğrafta yer görünmeli: bulutsuza yakın.
        "skydive" | "survey" => return vec![(Live, 45.0), (Clear, 30.0), (Few, 25.0)],
        // Turda şehirlerin üstünden alçakta geçilir.
        "tour" => return vec![(Live, 45.0), (Clear, 25.0), (Few, 20.0), (Scattered, 10.0)],
        // Arama yerden 2000 ft altında: tavan 3000 ft'e kadar olur, aletli koşul olmaz.
        "sar" => return vec![(Live, 40.0), (Clear, 15.0), (Few, 15.0), (Scattered, 12.0), (Broken, 10.0), (Rain, 8.0)],
        _ => {}
    }
    let mut v = vec![(Live, 45.0), (Clear, 18.0), (Few, 16.0), (Scattered, 12.0), (Broken, 7.0)];
    if p.kind != "bush" {
        v.extend([(Overcast, 5.0), (Rain, 5.0)]);
    }
    // Aletli koşullar: helikopter ve arazi uçuşu görerek uçar.
    if p.ir && p.class != Class::Helicopter && p.kind != "bush" {
        // Hafif pistonlunun buzlanma koruması yok: kar daha seyrek.
        let k = if p.class == Class::LightPiston { 0.5 } else { 1.0 };
        v.push((Snow, (8.0 * snow).min(20.0) * k));
        if turbine(p.class) {
            v.push((Storm, 3.0));
        }
    }
    v
}

/// Saat ağırlıkları. Canlı havada çoğunlukla gerçek saat; ön ayarlı havada her zaman bir senaryo saati.
fn time_weights(p: &Pick, live_wx: bool) -> Vec<(TimeOfDay, f64)> {
    use TimeOfDay::*;
    let (now, day) = if live_wx { (75.0, 0.0) } else { (0.0, 70.0) };
    if student(p) {
        return vec![(Now, now), (Day, if live_wx { 0.0 } else { 1.0 })];
    }
    let (dawn, dusk, night) = match p.kind {
        "skydive" | "survey" => (0.0, 0.0, 0.0),
        "bush" => (8.0, 0.0, 0.0),
        "tour" => (0.0, 10.0, 8.0),
        "sar" => (0.0, 8.0, if p.class == Class::Helicopter { 6.0 } else { 0.0 }),
        _ => (7.0, 9.0, 12.0),
    };
    // Işıksız pistte gece kalkış ya da iniş yok (helikopter hariç).
    let lit = p.class == Class::Helicopter || (p.from.lighted && p.to.lighted);
    let (dawn, dusk, night) = if lit { (dawn, dusk, night) } else { (0.0, 0.0, 0.0) };
    vec![(Now, now), (Day, day), (Dawn, dawn), (Dusk, dusk), (Night, night)]
}

/// Yarımküreye göre kış ayı mı?
fn winter_month(month: u32, lat: f64) -> bool {
    if lat >= 0.0 { matches!(month, 12 | 1 | 2) } else { matches!(month, 6..=8) }
}

/// Boylamdan yerel saat farkı (dk; 15° = 1 saat).
pub fn offset_min(lon: f64) -> i32 {
    ((lon / 15.0).round() as i32).clamp(-12, 14) * 60
}

const STEP: i64 = 300;

/// İşin tarihinde (yerel gece yarısından başlayan 24 saat) güneşin hedefe uyduğu bir an: (unix sn, yükseklik, yedek mi).
pub fn find_time(lat: f64, lon: f64, day_start: i64, offset_s: i64, t: TimeOfDay, rng: &mut Rng) -> (i64, f64, bool) {
    let samples: Vec<(i64, f64, bool)> = (0..86400 / STEP)
        .map(|i| {
            let ts = day_start + i * STEP;
            let e = sun_elevation_deg(lat, lon, ts as f64);
            (ts, e, sun_elevation_deg(lat, lon, (ts + STEP) as f64) > e)
        })
        .collect();
    let hour = |ts: i64| (ts + offset_s).rem_euclid(86400) / 3600;
    // Önce asıl hedef, sonra gevşetilmiş hedef (kışın alçak güneş, beyaz geceler); ikisi de gerçek bir seçimdir.
    // (güneş yüksekliği, yükseliyor mu) → uygun mu
    type Target = fn(f64, bool) -> bool;
    let tiers: Vec<Target> = match t {
        TimeOfDay::Day => vec![|e, _| e > 25.0, |e, _| e > 8.0],
        TimeOfDay::Dawn => vec![|e, r| (-4.0..=6.0).contains(&e) && r],
        TimeOfDay::Dusk => vec![|e, r| (-4.0..=6.0).contains(&e) && !r],
        TimeOfDay::Night => vec![|e, _| e < -12.0, |e, _| e < -6.0],
        TimeOfDay::Now => vec![],
    };
    // Yerel saat tercihi: gündüz işi mesai saatinde, gece işi akşamın ilk saatlerinde (19–02).
    let preferred = |ts: i64| {
        let h = hour(ts);
        match t {
            TimeOfDay::Day => (8..17).contains(&h),
            TimeOfDay::Night => !(2..19).contains(&h),
            _ => true,
        }
    };
    for ok in &tiers {
        let cands: Vec<&(i64, f64, bool)> = samples.iter().filter(|s| ok(s.1, s.2)).collect();
        let pref: Vec<&(i64, f64, bool)> = cands.iter().copied().filter(|s| preferred(s.0)).collect();
        if let Some(s) = rng.pick(if pref.is_empty() { &cands } else { &pref }) {
            return (s.0, s.1, false);
        }
    }
    // Hedef bu enlemde bu tarihte yok: en uygun an.
    let key = |s: &(i64, f64, bool)| -> f64 {
        match t {
            TimeOfDay::Day => -s.1,
            TimeOfDay::Night => s.1,
            TimeOfDay::Dawn => (s.1 - 1.0).abs() + if s.2 { 0.0 } else { 90.0 },
            _ => (s.1 - 1.0).abs() + if s.2 { 90.0 } else { 0.0 },
        }
    };
    samples.iter().min_by(|a, b| key(a).total_cmp(&key(b))).map(|s| (s.0, s.1, true)).unwrap_or((day_start + 12 * 3600, 0.0, true))
}

/// İşin koşullarını üretir. Aynı girdi ve tohumla aynı sonuç.
pub fn generate(p: &Pick, rng: &mut Rng) -> JobConditions {
    let offset = offset_min(p.from.lon);
    let offset_s = offset as i64 * 60;
    let local = chrono::DateTime::from_timestamp(p.day + offset_s, 0).unwrap_or_default().date_naive();
    let elev = p.from.elevation_ft.max(p.to.elevation_ft);
    let weather = *rng.weighted(&weather_weights(p, snow_factor(local.month(), p.from.lat, elev))).unwrap_or(&WeatherPreset::Live);
    let time = *rng.weighted(&time_weights(p, weather == WeatherPreset::Live)).unwrap_or(&TimeOfDay::Now);
    let wx = preset(weather);
    let mut c = JobConditions { time, weather, utc_offset_min: offset, needs_ir: wx.as_ref().is_some_and(|w| w.category >= FlightCategory::Ifr), wx, ..Default::default() };
    if time != TimeOfDay::Now {
        // Kar senaryosu kış tarihinde: yer beyaz, bitki örtüsü kış (kuzeyde 15 Ocak, güneyde 15 Temmuz).
        let date = if weather == WeatherPreset::Snow && !winter_month(local.month(), p.from.lat) {
            chrono::NaiveDate::from_ymd_opt(local.year(), if p.from.lat >= 0.0 { 1 } else { 7 }, 15).unwrap_or(local)
        } else {
            local
        };
        let midnight = chrono::Utc.from_utc_datetime(&date.and_hms_opt(0, 0, 0).unwrap_or_default()).timestamp() - offset_s;
        let (utc, sun, fallback) = find_time(p.from.lat, p.from.lon, midnight, offset_s, time, rng);
        c.utc = utc;
        c.sun_deg = (sun * 10.0).round() / 10.0;
        c.fallback = fallback;
        c.night_arrival = super::env::is_night(p.to.lat, p.to.lon, utc as f64 + p.block_min * 60.0);
    }
    if weather == WeatherPreset::Snow {
        c.season = "Winter".into();
    }
    c.pay_bonus = bonus(c.time, c.sun_deg, c.wx.as_ref());
    c.xp_bonus = xp_bonus(c.pay_bonus);
    c
}

/// Görerek uçuşta (VFR) seyir irtifası tavanın 500 ft altında kalmalı (yerden; ön ayar bulutları araziyi izler).
/// Aletli kurallarla uçan uçuşta ya da tavan yoksa `None`.
pub fn vfr_cruise_cap(c: &JobConditions, ifr: bool, from: &Airport, to: &Airport) -> Option<u32> {
    if ifr {
        return None;
    }
    let ceiling = c.wx.as_ref()?.ceiling_ft?;
    let ground = from.elevation_ft.max(to.elevation_ft) as f64;
    let cap = ((ground + ceiling - 500.0) / 500.0).floor() * 500.0;
    Some(cap.max(((ground + 1000.0) / 500.0).ceil() * 500.0) as u32)
}

/// Elle başlatmada (sim uçuşu kendiliğinden açmadıysa) kullanıcının simde seçmesi gerekenler.
pub fn manual_hint(c: &JobConditions) -> Option<String> {
    if c.is_live() {
        return None;
    }
    let name_tr = |w: WeatherPreset| match w {
        WeatherPreset::Clear => "Açık",
        WeatherPreset::Few => "Az bulutlu",
        WeatherPreset::Scattered => "Dağınık bulutlu",
        WeatherPreset::Broken => "Parçalı bulutlu",
        WeatherPreset::Overcast => "Kapalı",
        WeatherPreset::Rain => "Yağmur",
        WeatherPreset::Snow => "Kar",
        WeatherPreset::Storm => "Fırtına",
        WeatherPreset::Live => "Canlı",
    };
    let name_en = |w: WeatherPreset| match w {
        WeatherPreset::Clear => "Clear skies",
        WeatherPreset::Few => "Few clouds",
        WeatherPreset::Scattered => "Scattered clouds",
        WeatherPreset::Broken => "Broken clouds",
        WeatherPreset::Overcast => "Overcast",
        WeatherPreset::Rain => "Rain",
        WeatherPreset::Snow => "Snow",
        WeatherPreset::Storm => "Storm",
        WeatherPreset::Live => "Live",
    };
    let clock = chrono::DateTime::from_timestamp(c.utc, 0).map(|d| d.format("%H:%M").to_string()).unwrap_or_default();
    let mut tr_parts = Vec::new();
    let mut en_parts = Vec::new();
    if c.weather != WeatherPreset::Live {
        tr_parts.push(format!("hava ön ayarı \"{}\"", name_tr(c.weather)));
        en_parts.push(format!("the \"{}\" weather preset", name_en(c.weather)));
    }
    if c.time != TimeOfDay::Now {
        tr_parts.push(format!("saat {clock} UTC"));
        en_parts.push(format!("{clock} UTC"));
    }
    Some(modstead_core::tr!(format!("Senaryo: simde {} seçin.", tr_parts.join(" ve ")), format!("Scenario: choose {} in the sim.", en_parts.join(" and "))))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::airports::db;

    fn ts(s: &str) -> i64 {
        chrono::DateTime::parse_from_rfc3339(s).unwrap().timestamp()
    }

    #[test]
    fn old_jobs_without_conditions_are_live() {
        let c: JobConditions = serde_json::from_str("{}").unwrap();
        assert!(c.is_live());
        assert_eq!(c.departure(123), 123);
        let job: crate::career::model::Job = serde_json::from_str(r#"{"id":"x","kind":"cargo"}"#).unwrap();
        assert!(job.conditions.is_live());
        // JSON biçimi: camelCase, küçük harfli değerler.
        let v = serde_json::to_value(JobConditions { time: TimeOfDay::Night, weather: WeatherPreset::Snow, wx: preset(WeatherPreset::Snow), ..Default::default() }).unwrap();
        assert_eq!(v["time"], "night");
        assert_eq!(v["weather"], "snow");
        assert_eq!(v["wx"]["category"], "IFR");
        assert_eq!(v["wx"]["file"], "Snow.WPR");
        assert!(v.get("utcOffsetMin").is_some() && v.get("payBonus").is_some());
    }

    #[test]
    fn preset_categories_follow_the_faa_rules() {
        let cat = |w| preset(w).unwrap().category;
        use WeatherPreset::*;
        for w in [Clear, Few, Scattered] {
            assert_eq!(cat(w), FlightCategory::Vfr, "{w:?}");
        }
        for w in [Broken, Overcast, Rain] {
            assert_eq!(cat(w), FlightCategory::Mvfr, "{w:?}");
        }
        assert_eq!(cat(Snow), FlightCategory::Ifr);
        assert_eq!(cat(Storm), FlightCategory::Ifr);
        assert!(preset(Live).is_none());
        let s = preset(Snow).unwrap();
        assert!(s.wet() && s.temp_c < 0.0 && s.snow_cover_m > 0.0);
        assert!(preset(Storm).unwrap().thunderstorm);
    }

    #[test]
    fn bonus_formula() {
        use WeatherPreset::*;
        let b = |t, sun, w| bonus(t, sun, preset(w).as_ref());
        assert_eq!(b(TimeOfDay::Now, 0.0, Live), 0);
        assert_eq!(b(TimeOfDay::Day, 40.0, Clear), 0);
        assert_eq!(b(TimeOfDay::Day, 40.0, Rain), 5);
        // Kar: IFR 15 + kar 10. Fırtına: IFR 15 + yağmur 5 + oraj 10 + rüzgâr 5.
        assert_eq!(b(TimeOfDay::Day, 40.0, Snow), 25);
        assert_eq!(b(TimeOfDay::Day, 40.0, Storm), 35);
        assert_eq!(b(TimeOfDay::Night, -20.0, Live), 10);
        assert_eq!(b(TimeOfDay::Night, -20.0, Snow), 35);
        assert_eq!(b(TimeOfDay::Night, -20.0, Storm), 40, "üst sınır");
        assert_eq!(b(TimeOfDay::Dusk, 2.0, Clear), 5);
        // Beyaz gecede "gece" işi aslında aydınlık: gece eki yok.
        assert_eq!(b(TimeOfDay::Night, 1.5, Clear), 0);
        assert_eq!(xp_bonus(35), 18);
        assert_eq!(xp_bonus(40), 20);
        assert_eq!(xp_bonus(5), 3);
    }

    #[test]
    fn finds_day_dawn_dusk_and_night_in_istanbul() {
        // İstanbul, 26 Ekim: yerel (boylamdan +2) gece yarısı 21:00 UTC.
        let (lat, lon) = (40.98, 28.81);
        let off = offset_min(lon) as i64 * 60;
        assert_eq!(off, 2 * 3600);
        let day = ts("2026-10-26T00:00:00Z") - off;
        for seed in 0..20 {
            let mut rng = Rng::new(seed);
            let (t, e, fb) = find_time(lat, lon, day, off, TimeOfDay::Night, &mut rng);
            assert!(e < -12.0 && !fb, "{e}");
            let h = (t + off).rem_euclid(86400) / 3600;
            assert!(!(2..19).contains(&h), "akşam saati {h}");
            let (t, e, fb) = find_time(lat, lon, day, off, TimeOfDay::Day, &mut rng);
            assert!(e > 25.0 && !fb && (t + off).rem_euclid(86400) / 3600 >= 8, "{e}");
            let (t, e, _) = find_time(lat, lon, day, off, TimeOfDay::Dawn, &mut rng);
            assert!((-4.0..=6.0).contains(&e) && sun_elevation_deg(lat, lon, (t + 600) as f64) > e, "şafakta güneş yükselir");
            let (t, e, _) = find_time(lat, lon, day, off, TimeOfDay::Dusk, &mut rng);
            assert!((-4.0..=6.0).contains(&e) && sun_elevation_deg(lat, lon, (t + 600) as f64) < e, "akşam güneş alçalır");
            assert!(t >= day && t < day + 86400);
        }
    }

    #[test]
    fn polar_day_and_night_fall_back_and_say_so() {
        // Svalbard (78° K): haziranda güneş batmaz, aralıkta doğmaz.
        let (lat, lon) = (78.25, 15.47);
        let off = offset_min(lon) as i64 * 60;
        let mut rng = Rng::new(7);
        let (_, e, fb) = find_time(lat, lon, ts("2026-06-21T00:00:00Z") - off, off, TimeOfDay::Night, &mut rng);
        assert!(fb && e > 0.0, "kutup gündüzü: en karanlık an {e}");
        let (_, e, fb) = find_time(lat, lon, ts("2026-12-21T00:00:00Z") - off, off, TimeOfDay::Day, &mut rng);
        assert!(fb && e < 0.0, "kutup gecesi: en aydınlık an {e}");
        // Londra'da aralık: güneş 25°'ye çıkmaz ama gündüz yine gerçek bir seçimdir (yedek değil).
        let (_, e, fb) = find_time(51.47, -0.45, ts("2026-12-21T00:00:00Z"), 0, TimeOfDay::Day, &mut rng);
        assert!(!fb && e > 8.0, "{e}");
        // Helsinki'de haziran: güneş −12°'ye inmez ama −6°'nin altına iner (sivil gece).
        let (_, e, fb) = find_time(60.32, 24.96, ts("2026-06-21T00:00:00Z") - 7200, 7200, TimeOfDay::Night, &mut rng);
        assert!(!fb && e < -6.0, "{e} {fb}");
    }

    #[test]
    fn snow_is_seasonal_and_regional() {
        assert!(snow_factor(1, 60.0, 0) > snow_factor(7, 60.0, 0) * 10.0, "kuzeyde kış");
        assert!(snow_factor(7, -45.0, 0) > snow_factor(1, -45.0, 0) * 10.0, "güneyde temmuz kış");
        assert!(snow_factor(1, 65.0, 0) > snow_factor(1, 38.0, 0));
        assert!(snow_factor(1, 40.0, 6000) > snow_factor(1, 40.0, 100));
        assert_eq!(snow_factor(1, 10.0, 100), 0.0, "tropikte kar yok");
        assert!(snow_factor(7, -16.5, 13_300) > 0.0, "La Paz");
    }

    fn pick<'a>(ppl: bool, ir: bool, kind: &'a str, class: Class, from: &'a Airport, to: &'a Airport, day: i64) -> Pick<'a> {
        Pick { ppl, ir, kind, class, from, to, block_min: 60.0, day }
    }

    #[test]
    fn generation_respects_licences_classes_and_missions() {
        let (a, b) = (db().get("LTBA").unwrap(), db().get("LTFE").unwrap());
        let day = ts("2027-01-10T08:00:00Z");
        let mut times = std::collections::HashSet::new();
        let mut skies = std::collections::HashSet::new();
        for seed in 0..600u64 {
            let mut rng = Rng::new(seed);
            // Öğrenci: gündüz ya da gerçek saat, yalnızca görerek uçuş koşulları.
            let c = generate(&pick(false, false, "training", Class::LightPiston, a, b, day), &mut rng);
            assert!(matches!(c.time, TimeOfDay::Now | TimeOfDay::Day), "{c:?}");
            assert!(matches!(c.weather, WeatherPreset::Live | WeatherPreset::Clear | WeatherPreset::Few | WeatherPreset::Scattered), "{c:?}");
            // PPL, aletli yetki yok: gece olabilir, IFR ön ayarı olmaz.
            let c = generate(&pick(true, false, "cargo", Class::LightPiston, a, b, day), &mut rng);
            assert!(!c.needs_ir && c.wx.as_ref().is_none_or(|w| w.category < FlightCategory::Ifr), "{c:?}");
            times.insert(c.time);
            // Ön ayarlı hava hep bir senaryo saatiyle gelir.
            if c.weather != WeatherPreset::Live {
                assert_ne!(c.time, TimeOfDay::Now);
                assert!(c.utc > 0);
            }
            // Aletli yetkili, türbinli: kar ve fırtına olabilir; helikopterde ve çift pistonluda fırtına olmaz.
            let c = generate(&pick(true, true, "airline", Class::Narrowbody, a, b, day), &mut rng);
            skies.insert(c.weather);
            assert_eq!(c.pay_bonus, bonus(c.time, c.sun_deg, c.wx.as_ref()));
            assert_eq!(c.needs_ir, matches!(c.weather, WeatherPreset::Snow | WeatherPreset::Storm));
            let h = generate(&pick(true, true, "medical", Class::Helicopter, a, b, day), &mut rng);
            assert!(!matches!(h.weather, WeatherPreset::Snow | WeatherPreset::Storm), "{h:?}");
            let p = generate(&pick(true, true, "cargo", Class::PistonTwin, a, b, day), &mut rng);
            assert_ne!(p.weather, WeatherPreset::Storm, "fırtına yalnızca türbinlilerde");
            // Hava işleri: atlayış ve fotoğraf gündüz, bulutsuza yakın.
            let s = generate(&pick(true, true, "skydive", Class::TurbopropSingle, a, a, day), &mut rng);
            assert!(matches!(s.time, TimeOfDay::Now | TimeOfDay::Day) && matches!(s.weather, WeatherPreset::Live | WeatherPreset::Clear | WeatherPreset::Few), "{s:?}");
        }
        assert!(times.contains(&TimeOfDay::Night) && times.contains(&TimeOfDay::Day) && times.contains(&TimeOfDay::Now), "{times:?}");
        assert!(skies.contains(&WeatherPreset::Snow) && skies.contains(&WeatherPreset::Storm), "ocakta İstanbul'da aletli yetkili jet pilotuna kar ve fırtına çıkmalı: {skies:?}");
    }

    #[test]
    fn unlit_fields_get_no_night_and_generation_is_deterministic() {
        let a = db().get("LTBA").unwrap();
        let unlit = db().list.iter().find(|x| !x.lighted && x.lat > 39.0 && x.lat < 42.0 && x.lon > 26.0 && x.lon < 31.0).unwrap();
        let day = ts("2026-10-26T08:00:00Z");
        for seed in 0..300u64 {
            let c = generate(&pick(true, true, "cargo", Class::LightPiston, a, unlit, day), &mut Rng::new(seed));
            assert!(matches!(c.time, TimeOfDay::Now | TimeOfDay::Day), "{c:?}");
            let x = generate(&pick(true, true, "cargo", Class::LightPiston, a, a, day), &mut Rng::new(seed));
            let y = generate(&pick(true, true, "cargo", Class::LightPiston, a, a, day), &mut Rng::new(seed));
            assert_eq!(x, y);
        }
    }

    #[test]
    fn snow_jobs_use_a_winter_date_and_season() {
        let (a, b) = (db().get("ESSA").unwrap(), db().get("ENGM").unwrap());
        // Haziranda bile kar senaryosu çıkarsa tarihi kış olur.
        let day = ts("2026-06-10T08:00:00Z");
        let mut found = false;
        for seed in 0..3000u64 {
            let c = generate(&pick(true, true, "airline", Class::Narrowbody, a, b, day), &mut Rng::new(seed));
            if c.weather == WeatherPreset::Snow {
                let d = chrono::DateTime::from_timestamp(c.utc, 0).unwrap();
                assert!(matches!(d.month(), 1 | 12 | 2), "{d}");
                assert_eq!(c.season, "Winter");
                found = true;
                break;
            }
        }
        assert!(found, "Stockholm'de yazın da (seyrek) kar senaryosu olabilir");
    }

    #[test]
    fn vfr_cruise_stays_below_the_ceiling() {
        let (a, b) = (db().get("LTBA").unwrap(), db().get("LTBU").unwrap());
        let c = JobConditions { weather: WeatherPreset::Broken, wx: preset(WeatherPreset::Broken), ..Default::default() };
        let cap = vfr_cruise_cap(&c, false, a, b).unwrap();
        let ground = a.elevation_ft.max(b.elevation_ft) as u32;
        assert!(cap <= ground + 2500 && cap >= ground + 1000, "{cap}");
        assert_eq!(vfr_cruise_cap(&c, true, a, b), None, "aletli uçuşta sınır yok");
        assert_eq!(vfr_cruise_cap(&JobConditions::default(), false, a, b), None);
        let hint = manual_hint(&JobConditions { time: TimeOfDay::Night, weather: WeatherPreset::Snow, utc: ts("2027-01-15T19:40:00Z"), ..Default::default() }).unwrap();
        assert!(hint.contains("19:40") && (hint.contains("Kar") || hint.contains("Snow")), "{hint}");
        assert!(manual_hint(&JobConditions::default()).is_none());
    }

    /// Ön ayar tablosunun simin kendi dosyalarına uyduğunu doğrular (kullanıcının simindeki kopyayı salt okur).
    #[test]
    #[ignore]
    fn presets_match_the_sim_files() {
        let dir = std::path::Path::new(r"C:\XboxGames\Microsoft Flight Simulator 2024\Content\Packages\fs-base-spb\WeatherPresets");
        for d in &PRESETS {
            let text = std::fs::read_to_string(dir.join(d.file)).unwrap_or_else(|e| panic!("{}: {e}", d.file));
            let doc = roxmltree::Document::parse(text.trim_start_matches('\u{feff}')).unwrap();
            let val = |n: roxmltree::Node, tag: &str| -> f64 { n.children().find(|c| c.has_tag_name(tag)).and_then(|c| c.attribute("Value")).and_then(|v| v.trim().parse().ok()).unwrap_or(0.0) };
            let root = doc.descendants().find(|n| n.has_tag_name("WeatherPreset.Preset")).unwrap();
            let mut sky = Vec::new();
            let mut ceiling: Option<f64> = None;
            for l in root.children().filter(|n| n.has_tag_name("CloudLayer")) {
                let (dens, bot, top, scat) = (val(l, "CloudLayerDensity"), val(l, "CloudLayerAltitudeBot"), val(l, "CloudLayerAltitudeTop"), val(l, "CloudLayerScattering"));
                if dens < 0.05 || top - bot < 1.0 {
                    continue;
                }
                let cover = if dens >= 0.9 && scat <= 0.1 {
                    "OVC"
                } else if dens >= 0.5 && scat <= 0.5 {
                    "BKN"
                } else if dens >= 0.5 && scat <= 0.9 {
                    "SCT"
                } else {
                    "FEW"
                };
                let ft = (bot * 3.28084 / 100.0).round() * 100.0;
                if matches!(cover, "BKN" | "OVC") {
                    ceiling = Some(ceiling.map_or(ft, |c: f64| c.min(ft)));
                }
                sky.push(format!("{cover}{:03}", (ft / 100.0) as i64));
            }
            let got = sky.join(" ");
            assert!(d.sky.replace("CB", "") == got, "{}: tablo {} / dosya {got}", d.file, d.sky);
            assert_eq!(d.ceiling_ft, ceiling, "{}", d.file);
            let wind = root.children().find(|n| n.has_tag_name("WindLayer")).map(|w| val(w, "WindLayerSpeed")).unwrap_or(0.0);
            assert!((wind - d.wind_kt).abs() < 0.01, "{} rüzgâr {wind}", d.file);
            let temp = val(root, "MSLTemperature") - 273.15;
            assert!((temp - d.temp_c).abs() < 0.1, "{} sıcaklık {temp}", d.file);
            assert_eq!(val(root, "Precipitations") > 0.0, !d.precip.is_empty(), "{}", d.file);
            assert!((val(root, "SnowCover") - d.snow_cover_m).abs() < 0.01, "{}", d.file);
            assert_eq!(val(root, "ThunderstormIntensity") > 0.0, d.thunderstorm, "{}", d.file);
            let aerosol = val(root, "AerosolDensity");
            let precip = val(root, "Precipitations");
            let haze = if aerosol <= 1.5 {
                10.0
            } else if aerosol <= 2.0 {
                8.0
            } else if aerosol <= 2.5 {
                5.0
            } else if aerosol <= 3.0 {
                4.0
            } else {
                3.0
            };
            let fall = match d.precip {
                "snow" => 1.0,
                "rain" if precip > 10.0 => 1.5,
                "rain" => 3.0,
                _ => 10.0,
            };
            assert!((d.visibility_sm - f64::min(haze, fall)).abs() < 0.01, "{} görüş", d.file);
        }
    }
}
