//! Çevre hesapları: güneşin yüksekliği (gece/gündüz), rüzgâr bileşenleri, görüş koşulları (VMC/IMC) ve uçuş
//! kategorisi. Simden gelen ortam değerleri (`Env`) saniyede bir okunur; takipçi gece ve aletli uçuş süresini,
//! inişteki yan rüzgârı ve VFR pilotun buluta girmesini bunlarla ölçer.

use serde::{Deserialize, Serialize};

/// Simden saniyede bir gelen ortam ve kokpit değerleri (telemetrinin yanında, ayrı bir veri tanımıyla).
/// Simin tanımadığı bir değişken 0 gelir; `known` hangi grupların gerçekten okunduğunu söyler.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Env {
    pub light_beacon: bool,
    pub light_landing: bool,
    pub light_nav: bool,
    pub light_strobe: bool,
    pub light_taxi: bool,
    /// Rüzgâr (kt) ve geldiği yön (gerçek kuzeye göre derece).
    pub wind_kt: f64,
    pub wind_dir: f64,
    /// Görüş (m).
    pub visibility_m: f64,
    pub in_cloud: bool,
    /// Yağış: 0 yok, 1 yağmur, 2 kar.
    pub precip: u8,
    pub temperature_c: f64,
    pub qnh_hpa: f64,
    /// Gövdedeki buzlanma (0–1).
    pub structural_ice: f64,
    /// UTC saati (gece yarısından beri sn), yılın günü ve yıl: güneşin yüksekliği bununla hesaplanır.
    pub zulu_s: f64,
    pub zulu_day: u32,
    pub zulu_year: i32,
    pub gear_retractable: bool,
    pub seatbelt_sign: bool,
    /// Kabin basınç irtifası (ft); basınçlandırılmamış uçakta uçağın irtifası.
    pub cabin_alt_ft: f64,
    pub pressurized: bool,
    pub autopilot: bool,
    /// Transponder: 0 bilinmiyor/kapalı, 1 bekleme, 2 test, 3 açık, 4 irtifa, 5 yer (yalnızca 2024).
    pub transponder: u8,
    /// Işık değişkenlerinden biri hiç açık görüldü mü? Görülmediyse uçak bu değişkenleri kullanmıyordur.
    pub lights_seen: bool,
    /// Sim aktif duraklatmada: uçak donar, dünya akar (`IS IN ACTIVE PAUSE`; 2024'te `Pause_EX1` bunu bildirmiyor).
    pub active_pause: bool,
    /// `SIMULATION TIME` (sn): aktif duraklatmada ilerlemez. Yalnızca duraklatma bekçisi için; arayüze gitmez.
    #[serde(skip)]
    pub sim_time_s: f64,
}

impl Env {
    /// Simin saatinin unix zamanı (sn). Yıl bilinmiyorsa `None`.
    pub fn unix_time(&self) -> Option<f64> {
        if self.zulu_year < 1970 || self.zulu_day == 0 {
            return None;
        }
        let jan1 = chrono::NaiveDate::from_ymd_opt(self.zulu_year, 1, 1)?.and_hms_opt(0, 0, 0)?.and_utc().timestamp() as f64;
        Some(jan1 + (self.zulu_day as f64 - 1.0) * 86400.0 + self.zulu_s)
    }

    /// Görsel uçuş koşulları sağlanmıyor mu (bulutta ya da görüş 1500 m'nin altında)?
    pub fn imc(&self) -> bool {
        self.in_cloud || (self.visibility_m > 0.0 && self.visibility_m < 1500.0)
    }
}

/// Güneşin ufuktan yüksekliği (derece). Basitleştirilmiş NOAA/USNO hesabı; dakika mertebesinde doğru.
pub fn sun_elevation_deg(lat: f64, lon: f64, unix_s: f64) -> f64 {
    let d = (unix_s - 946_728_000.0) / 86400.0; // J2000.0'dan beri gün
    let g = (357.528 + 0.985_600_3 * d).to_radians();
    let l = 280.460 + 0.985_647_4 * d;
    let lambda = (l + 1.915 * g.sin() + 0.020 * (2.0 * g).sin()).to_radians();
    let eps = (23.439 - 0.000_000_4 * d).to_radians();
    let ra = (eps.cos() * lambda.sin()).atan2(lambda.cos());
    let dec = (eps.sin() * lambda.sin()).asin();
    let gmst_deg = (18.697_374_558 + 24.065_709_824_419_08 * d) * 15.0;
    let h = (gmst_deg + lon).to_radians() - ra;
    let phi = lat.to_radians();
    (phi.sin() * dec.sin() + phi.cos() * dec.cos() * h.cos()).asin().to_degrees()
}

/// Gece mi? Sivil alacakaranlığın bitişi ile başlangıcı arası (güneş −6°'nin altında; FAA ve EASA tanımı).
pub fn is_night(lat: f64, lon: f64, unix_s: f64) -> bool {
    sun_elevation_deg(lat, lon, unix_s) < -6.0
}

/// Rüzgârın piste göre bileşenleri: (karşı rüzgâr, yan rüzgâr) kt. Karşı rüzgâr negatifse arka rüzgârdır.
pub fn wind_components(wind_dir: f64, wind_kt: f64, runway_heading: f64) -> (f64, f64) {
    let diff = (wind_dir - runway_heading).to_radians();
    (wind_kt * diff.cos(), (wind_kt * diff.sin()).abs())
}

/// Uçuş kategorisi (FAA): tavan (ft) ve görüş (deniz mili) ile.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Default)]
#[serde(rename_all = "UPPERCASE")]
pub enum FlightCategory {
    #[default]
    Vfr,
    Mvfr,
    Ifr,
    Lifr,
}

pub fn flight_category(ceiling_ft: Option<f64>, visibility_sm: Option<f64>) -> FlightCategory {
    let c = ceiling_ft.unwrap_or(f64::INFINITY);
    let v = visibility_sm.unwrap_or(10.0);
    if c < 500.0 || v < 1.0 {
        FlightCategory::Lifr
    } else if c < 1000.0 || v < 3.0 {
        FlightCategory::Ifr
    } else if c <= 3000.0 || v <= 5.0 {
        FlightCategory::Mvfr
    } else {
        FlightCategory::Vfr
    }
}

/// Yoğunluk irtifası (ft): basınç irtifası + 120 × (sıcaklık − ISA sıcaklığı).
pub fn density_altitude_ft(elevation_ft: f64, qnh_hpa: f64, temperature_c: f64) -> f64 {
    let pressure_alt = elevation_ft + (1013.25 - qnh_hpa) * 27.0;
    let isa = 15.0 - 1.98 * pressure_alt / 1000.0;
    pressure_alt + 120.0 * (temperature_c - isa)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ts(s: &str) -> f64 {
        chrono::DateTime::parse_from_rfc3339(s).unwrap().timestamp() as f64
    }

    #[test]
    fn sun_is_up_at_noon_and_down_at_midnight() {
        // İstanbul, yaz gündönümü: öğlen ≈ 72°, gece yarısı derin gece.
        let noon = sun_elevation_deg(41.0, 29.0, ts("2026-06-21T10:05:00Z"));
        assert!((70.0..74.0).contains(&noon), "{noon}");
        assert!(sun_elevation_deg(41.0, 29.0, ts("2026-06-21T22:00:00Z")) < -20.0);
        assert!(is_night(41.0, 29.0, ts("2026-12-21T18:00:00Z")));
        assert!(!is_night(41.0, 29.0, ts("2026-12-21T11:00:00Z")));
        // Gün batımı (İstanbul, 21 Haziran ≈ 17:40 UTC): hemen sonrası henüz gece değil (alacakaranlık).
        assert!(!is_night(41.0, 29.0, ts("2026-06-21T17:50:00Z")));
        assert!(is_night(41.0, 29.0, ts("2026-06-21T18:40:00Z")));
        // Güney yarımküre ve tarih çizgisi yakını.
        assert!(sun_elevation_deg(-36.85, 174.76, ts("2026-01-01T00:00:00Z")) > 50.0);
    }

    #[test]
    fn env_time_and_imc() {
        let e = Env { zulu_year: 2026, zulu_day: 172, zulu_s: 36_000.0, ..Default::default() };
        assert_eq!(e.unix_time(), Some(ts("2026-06-21T10:00:00Z")));
        assert_eq!(Env::default().unix_time(), None);
        assert!(Env { in_cloud: true, ..Default::default() }.imc());
        assert!(Env { visibility_m: 800.0, ..Default::default() }.imc());
        assert!(!Env { visibility_m: 9000.0, ..Default::default() }.imc());
        assert!(!Env::default().imc(), "bilinmeyen görüş IMC sayılmaz");
    }

    #[test]
    fn wind_and_categories() {
        let (head, cross) = wind_components(270.0, 20.0, 240.0);
        assert!((head - 17.3).abs() < 0.1 && (cross - 10.0).abs() < 0.1);
        let (head, _) = wind_components(60.0, 10.0, 240.0);
        assert!(head < -9.9, "arka rüzgâr");
        assert_eq!(flight_category(Some(400.0), Some(5.0)), FlightCategory::Lifr);
        assert_eq!(flight_category(Some(800.0), Some(5.0)), FlightCategory::Ifr);
        assert_eq!(flight_category(Some(2500.0), Some(10.0)), FlightCategory::Mvfr);
        assert_eq!(flight_category(None, Some(10.0)), FlightCategory::Vfr);
        assert!(FlightCategory::Ifr > FlightCategory::Mvfr);
        // Sıcak ve yüksek: 5000 ft, 30 °C → ≈ 8000 ft.
        let da = density_altitude_ft(5000.0, 1013.25, 30.0);
        assert!((7500.0..9200.0).contains(&da), "{da}");
    }
}
