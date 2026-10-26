//! Gerçek hava: METAR (aviationweather.gov Data API, HTTPS, ücretsiz, anahtar istemez). Kariyer simin "canlı hava"
//! kipini kullanır (`.FLT`'de `UseLiveWeather`); sim de gerçek gözlemlerden beslendiği için iş panosundaki ve uçuş
//! kâğıdındaki hava simdekine yakındır.
//!
//! - Uçuş kategorisi (VFR/MVFR/IFR/LIFR): tavan ve görüşten (FAA tanımı). Varışı IFR ya da LIFR olan iş aletli
//!   yetki ve yeterlilik ister; yetkili pilota kötü hava primi (%15 / %25) verilir.
//! - Uçuş kâğıdı: sıcaklık ve QNH'den yoğunluk irtifası, yağıştan ıslak pist.
//! - Önbellek 30 dakika; bir istekte en çok 40 havalimanı (servisin sınırı dakikada 100 istek).
//!
//! Ağ yoksa ya da servis yanıt vermezse hava bilinmiyor sayılır; kariyer havasız da çalışır.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::env::{FlightCategory, flight_category};

pub const HOST: &str = "aviationweather.gov";
const TTL_S: i64 = 30 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Metar {
    pub icao: String,
    pub raw: String,
    /// Gözlem zamanı (unix sn).
    pub observed: i64,
    /// Rüzgâr yönü (derece; değişkense `None`), hız ve hamle (kt).
    pub wind_dir: Option<f64>,
    pub wind_kt: f64,
    pub gust_kt: Option<f64>,
    /// Görüş (deniz mili; 10 = 10 ve üstü).
    pub visibility_sm: Option<f64>,
    /// Tavan: en alçak BKN/OVC/VV tabanı (ft).
    pub ceiling_ft: Option<f64>,
    pub temp_c: Option<f64>,
    pub dewpoint_c: Option<f64>,
    pub qnh_hpa: Option<f64>,
    /// Yağış ya da gök gürültülü fırtına (ıslak pist).
    pub wet: bool,
    pub thunderstorm: bool,
    pub category: FlightCategory,
    pub fetched_at: i64,
}

impl Metar {
    /// Yoğunluk irtifası hesabı için (sıcaklık °C, QNH hPa).
    pub fn temp_qnh(&self) -> Option<(f64, f64)> {
        Some((self.temp_c?, self.qnh_hpa.unwrap_or(1013.25)))
    }

    pub fn fresh(&self, now: i64) -> bool {
        now - self.fetched_at < TTL_S
    }
}

/// Kötü hava primi (yüzde): IFR %15, LIFR %25.
pub fn bad_weather_bonus(c: FlightCategory) -> u8 {
    match c {
        FlightCategory::Lifr => 25,
        FlightCategory::Ifr => 15,
        _ => 0,
    }
}

/// Ham METAR metnini çözer (servisin JSON alanları eksik kalırsa ve testler için).
pub fn parse_raw(icao: &str, raw: &str) -> Metar {
    let mut m = Metar { icao: icao.to_string(), raw: raw.to_string(), ..Default::default() };
    let toks: Vec<&str> = raw.split_whitespace().collect();
    let mut i = 0;
    while i < toks.len() {
        let t = toks[i].trim_end_matches('=');
        // Açıklamalar (RMK) ve eğilim (TEMPO, BECMG) gözlemin parçası değil.
        if matches!(t, "RMK" | "TEMPO" | "BECMG" | "NOSIG") {
            break;
        }
        // Rüzgâr: 24015KT, 24015G25KT, VRB03KT, 12008MPS.
        if let Some(body) = t.strip_suffix("KT").or_else(|| t.strip_suffix("MPS")) {
            if body.len() >= 5 && (body[..3].chars().all(|c| c.is_ascii_digit()) || body.starts_with("VRB")) {
                let mps = t.ends_with("MPS");
                let k = if mps { 1.943_84 } else { 1.0 };
                m.wind_dir = body[..3].parse::<f64>().ok();
                let rest = &body[3..];
                let (spd, gust) = match rest.split_once('G') {
                    Some((a, b)) => (a, Some(b)),
                    None => (rest, None),
                };
                m.wind_kt = spd.parse::<f64>().unwrap_or(0.0) * k;
                m.gust_kt = gust.and_then(|g| g.parse::<f64>().ok()).map(|g| g * k);
                i += 1;
                continue;
            }
        }
        if t == "CAVOK" {
            m.visibility_sm = Some(10.0);
        } else if let Some(v) = t.strip_suffix("SM") {
            // 10SM, 1/2SM, P6SM, "1 1/2SM" (önceki token tam sayı).
            let v = v.trim_start_matches('P').trim_start_matches('M');
            let frac = match v.split_once('/') {
                Some((a, b)) => a.parse::<f64>().ok().zip(b.parse::<f64>().ok()).map(|(a, b)| a / b),
                None => v.parse::<f64>().ok(),
            };
            let whole = if i > 0 && v.contains('/') { toks[i - 1].parse::<f64>().ok().filter(|w| *w < 10.0).unwrap_or(0.0) } else { 0.0 };
            m.visibility_sm = frac.map(|f| f + whole);
        } else if t.len() == 4 && t.chars().all(|c| c.is_ascii_digit()) && m.visibility_sm.is_none() && i > 1 {
            // Metre: 9999 = 10 km ve üstü.
            let meters: f64 = t.parse().unwrap_or(0.0);
            m.visibility_sm = Some(if meters >= 9999.0 { 10.0 } else { meters / 1609.34 });
        } else if let Some(base) = ["BKN", "OVC", "VV"].iter().find_map(|p| t.strip_prefix(p)) {
            if let Ok(h) = base.get(..3).unwrap_or("").parse::<f64>() {
                let ft = h * 100.0;
                m.ceiling_ft = Some(m.ceiling_ft.map_or(ft, |c: f64| c.min(ft)));
            }
        } else if let Some((a, b)) = t.split_once('/') {
            // Sıcaklık/çiy noktası: 15/08, M02/M05.
            let num = |s: &str| if let Some(x) = s.strip_prefix('M') { x.parse::<f64>().ok().map(|v| -v) } else { s.parse::<f64>().ok() };
            if a.len() <= 3 && b.len() <= 3 && !a.is_empty() && num(a).is_some() {
                m.temp_c = num(a);
                m.dewpoint_c = num(b);
            }
        } else if let Some(q) = t.strip_prefix('Q').filter(|q| q.len() == 4) {
            m.qnh_hpa = q.parse::<f64>().ok();
        } else if let Some(a) = t.strip_prefix('A').filter(|a| a.len() == 4 && a.chars().all(|c| c.is_ascii_digit())) {
            m.qnh_hpa = a.parse::<f64>().ok().map(|v| (v / 100.0 * 33.8639 * 10.0).round() / 10.0);
        }
        let wx = t.trim_start_matches(['+', '-']).trim_start_matches("VC");
        if ["RA", "DZ", "SN", "SH", "TS", "GR", "PL", "SG", "FZ"].iter().any(|p| wx.starts_with(p) || wx.contains("RA") && wx.len() <= 6) && !t.contains('/') {
            m.wet = true;
        }
        if wx.starts_with("TS") || t.contains("TSRA") {
            m.thunderstorm = true;
        }
        i += 1;
    }
    m.category = flight_category(m.ceiling_ft, m.visibility_sm);
    m
}

/// Servisin JSON yanıtı (`format=json`): her kayıt bir havalimanı.
pub fn parse_json(body: &str, now: i64) -> Vec<Metar> {
    let Ok(serde_json::Value::Array(items)) = serde_json::from_str::<serde_json::Value>(body) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for it in items {
        let icao = it["icaoId"].as_str().unwrap_or("").to_ascii_uppercase();
        let raw = it["rawOb"].as_str().unwrap_or("");
        if icao.is_empty() || raw.is_empty() {
            continue;
        }
        let mut m = parse_raw(&icao, raw);
        m.observed = it["obsTime"].as_i64().unwrap_or(0);
        if let Some(t) = it["temp"].as_f64() {
            m.temp_c = Some(t);
        }
        if let Some(q) = it["altim"].as_f64() {
            m.qnh_hpa = Some(q);
        }
        if let Some(c) = it["fltCat"].as_str() {
            m.category = match c {
                "LIFR" => FlightCategory::Lifr,
                "IFR" => FlightCategory::Ifr,
                "MVFR" => FlightCategory::Mvfr,
                "VFR" => FlightCategory::Vfr,
                _ => m.category,
            };
        }
        m.fetched_at = now;
        out.push(m);
    }
    out
}

/// İstek adresi: en çok 40 havalimanı.
pub fn url(icaos: &[String]) -> String {
    let ids: Vec<&str> = icaos.iter().map(|s| s.as_str()).filter(|s| s.len() == 4 && s.chars().all(|c| c.is_ascii_alphanumeric())).take(40).collect();
    format!("https://{HOST}/api/data/metar?ids={}&format=json", ids.join(","))
}

/// Bellekteki METAR önbelleği.
#[derive(Default)]
pub struct Cache {
    pub items: HashMap<String, Metar>,
    /// Son istek zamanı (havalimanı → unix sn): bulunamayanlar da 30 dk yeniden istenmez.
    pub asked: HashMap<String, i64>,
}

impl Cache {
    pub fn get(&self, icao: &str, now: i64) -> Option<Metar> {
        self.items.get(icao).filter(|m| m.fresh(now)).cloned()
    }

    /// İstenmesi gerekenler: önbellekte taze olmayan ve son 30 dakikada sorulmamış olanlar.
    pub fn missing(&self, icaos: &[String], now: i64) -> Vec<String> {
        let mut v: Vec<String> = icaos
            .iter()
            .map(|s| s.trim().to_ascii_uppercase())
            .filter(|s| self.get(s, now).is_none() && self.asked.get(s).is_none_or(|t| now - t >= TTL_S))
            .collect();
        v.sort();
        v.dedup();
        v.truncate(40);
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_icao_and_us_metars() {
        let m = parse_raw("LTBA", "LTBA 261150Z 04012G22KT 9999 FEW030 BKN045 18/09 Q1016 NOSIG");
        assert_eq!(m.wind_dir, Some(40.0));
        assert_eq!(m.wind_kt, 12.0);
        assert_eq!(m.gust_kt, Some(22.0));
        assert_eq!(m.visibility_sm, Some(10.0));
        assert_eq!(m.ceiling_ft, Some(4500.0));
        assert_eq!(m.temp_c, Some(18.0));
        assert_eq!(m.qnh_hpa, Some(1016.0));
        assert_eq!(m.category, FlightCategory::Vfr);
        assert!(!m.wet);

        let m = parse_raw("KSEA", "KSEA 261153Z 18008KT 1 1/2SM -RA BR OVC007 08/07 A2992 RMK AO2");
        assert_eq!(m.visibility_sm, Some(1.5));
        assert_eq!(m.ceiling_ft, Some(700.0));
        assert_eq!(m.category, FlightCategory::Ifr);
        assert!(m.wet);
        assert!((m.qnh_hpa.unwrap() - 1013.2).abs() < 0.2);

        let m = parse_raw("EGLL", "EGLL 261150Z VRB02KT 0400 FG VV001 M01/M01 Q1025");
        assert_eq!(m.wind_dir, None);
        assert_eq!(m.ceiling_ft, Some(100.0));
        assert_eq!(m.temp_c, Some(-1.0));
        assert_eq!(m.category, FlightCategory::Lifr);

        let m = parse_raw("LTFM", "LTFM 261150Z 33010KT CAVOK 21/05 Q1012");
        assert_eq!(m.category, FlightCategory::Vfr);
        let m = parse_raw("LTAI", "LTAI 261150Z 20015KT 6000 TSRA BKN025CB 24/19 Q1008");
        assert!(m.thunderstorm && m.wet);
        assert_eq!(m.category, FlightCategory::Mvfr);
        assert_eq!(bad_weather_bonus(FlightCategory::Lifr), 25);
        assert_eq!(bad_weather_bonus(FlightCategory::Mvfr), 0);
    }

    #[test]
    fn parses_service_json_and_caches() {
        let body = r#"[{"icaoId":"LTBA","obsTime":1800000000,"temp":17.5,"altim":1015.9,"fltCat":"MVFR","rawOb":"LTBA 261150Z 04012KT 9999 BKN025 18/09 Q1016"},{"icaoId":"","rawOb":""}]"#;
        let v = parse_json(body, 1_800_000_100);
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].temp_c, Some(17.5));
        assert_eq!(v[0].category, FlightCategory::Mvfr);
        assert!(parse_json("not json", 0).is_empty());
        let mut c = Cache::default();
        c.items.insert("LTBA".into(), v[0].clone());
        assert!(c.get("LTBA", 1_800_000_200).is_some());
        assert!(c.get("LTBA", 1_800_000_100 + TTL_S + 1).is_none());
        let want = vec!["ltba".to_string(), "LTFM".to_string(), "LTFM".to_string()];
        assert_eq!(c.missing(&want, 1_800_000_200), vec!["LTFM".to_string()]);
        assert_eq!(url(&["LTBA".into(), "bad id".into(), "KSEA".into()]), "https://aviationweather.gov/api/data/metar?ids=LTBA,KSEA&format=json");
    }
}
