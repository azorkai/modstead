//! Pilot sicili: yeterlilik (son 90 günde iniş, gece iniş, son 6 ayda aletli yaklaşma), sağlık sertifikası ve
//! görev süresi. Kurallar gerçek mevzuattan sadeleştirildi (`KARIYER.md` → "Pilot sicili"):
//!
//! - **Yolcu yeterliliği** (FAA 61.57, EASA FCL.060): yolcu taşımak için son 90 günde aynı kategoride (uçak ya da
//!   helikopter) 3 iniş; gece yolcu için 3 gece inişi. Yolcusuz bir uçuşta pist turları da sayılır.
//! - **Aletli yeterlilik** (61.57(c)): son 6 ayda 6 aletli yaklaşma. Düşerse aletli yetki o süre için yok sayılır
//!   (bulutta uçmak ceza alır); aletli yaklaşmalar yeterliliği geri getirir.
//! - **Sağlık sertifikası** (FAA 61.23, EASA MED.A.045): ticari lisansla 1. sınıf (12 ay; 60 yaş üstü 6 ay),
//!   özel lisansla 2. sınıf (40 yaş altı 60 ay, 40–49 24 ay, 50+ 12 ay). Süresi biten pilot iş alamaz; muayene
//!   ücretlidir ve anında yenilenir.
//! - **Görev süresi** (EASA ORO.FTL, sadeleştirilmiş): görev ilk bloktan 1 saat önce başlar, son bloktan yarım saat
//!   sonra biter; en uzun görev 13 saat, ikinciden sonraki her sektör için 30 dakika kısalır (en az 9 saat).
//!   10 saat ara verilince görev kendiliğinden biter; "Dinlen" ile hemen bitirilebilir (evden uzaktaysa otel
//!   parası). Son 28 günde 100, son 12 ayda 1000 uçuş saati sınırı.
//!
//! Zorluk: Kolay'da bunlar yalnızca bilgi; Normal'de yeterlilik ve sağlık uygulanır, görev süresi uyarıdır;
//! Gerçekçi'de görev süresi de uygulanır.

use serde::{Deserialize, Serialize};

use super::progression::Difficulty;

const DAY: i64 = 86400;

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct LandingRec {
    pub ts: i64,
    pub night: bool,
    pub heli: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Records {
    /// Son 12 ayın inişleri.
    pub landings: Vec<LandingRec>,
    /// Son 12 ayın aletli yaklaşmaları (unix sn).
    pub approaches: Vec<i64>,
    /// Sağlık sertifikasının sınıfı (1 ya da 2; 0 = yok) ve geçerlilik sonu (unix sn).
    pub medical_class: u8,
    pub medical_until: i64,
    /// Görev: başlangıcı (unix sn), sektör sayısı, son bitişi (blok + 30 dk).
    pub duty_start: i64,
    pub duty_sectors: u32,
    pub duty_end: i64,
    /// Son 12 ayın uçuşları: (bitiş, saat).
    pub flights: Vec<(i64, f64)>,
}

/// Yeterlilik ve sınırların anlık durumu (arayüz ve kabul denetimi için).
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub landings_90d: u32,
    pub night_landings_90d: u32,
    pub heli_landings_90d: u32,
    pub passenger_current: bool,
    pub night_current: bool,
    pub heli_current: bool,
    pub approaches_6m: u32,
    pub ifr_current: bool,
    /// Gereken sağlık sınıfı, eldeki ve geçerlilik sonu.
    pub medical_required: u8,
    pub medical_class: u8,
    pub medical_until: i64,
    pub medical_valid: bool,
    /// Görev sürüyor mu, ne zamandan beri, kaç sektör, en uzun görev (sa) ve kalan (sa).
    pub on_duty: bool,
    pub duty_start: i64,
    pub duty_sectors: u32,
    pub duty_max_h: f64,
    pub duty_left_h: f64,
    pub hours_28d: f64,
    pub hours_12m: f64,
    /// Kurallar uygulanıyor mu (zorluğa göre)?
    pub enforce_currency: bool,
    pub enforce_duty: bool,
}

/// Pilotun yaşı: doğum yılı bilinmiyorsa 30.
pub fn age(birth_year: i32, now: i64) -> i32 {
    if birth_year < 1900 {
        return 30;
    }
    let year = chrono::DateTime::from_timestamp(now, 0).map(|d| chrono::Datelike::year(&d)).unwrap_or(2026);
    (year - birth_year).max(16)
}

/// Lisanslara göre gereken sağlık sınıfı: ticari ya da havayolu lisansıyla 1, diğerlerinde 2.
pub fn medical_required(licenses: &[String]) -> u8 {
    if licenses.iter().any(|l| l == "cpl" || l == "atpl") { 1 } else { 2 }
}

/// Sağlık sertifikasının geçerlilik süresi (ay).
pub fn medical_months(class: u8, age: i32) -> u32 {
    match class {
        1 if age >= 60 => 6,
        1 => 12,
        _ if age < 40 => 60,
        _ if age < 50 => 24,
        _ => 12,
    }
}

/// Muayene ücreti ($): 1. sınıf daha pahalı.
pub fn medical_fee(class: u8, d: Difficulty) -> i64 {
    ((if class == 1 { 250.0 } else { 120.0 }) * d.costs()).round() as i64
}

/// En uzun görev süresi (sa): 13 saat, ikinciden sonraki her sektör için 30 dk eksik, en az 9.
pub fn max_fdp_h(sectors: u32) -> f64 {
    (13.0 - 0.5 * sectors.saturating_sub(2) as f64).max(9.0)
}

/// Görev sonrası dinlenme: 10 saat ara verilince görev biter.
pub const REST_H: f64 = 10.0;

impl Records {
    /// Yeni pilotun sicili: ticari ve havayolu başlangıcında yeterlilik tamdır (lisans sınavından yeni çıkmış gibi).
    pub fn new_pilot(licenses: &[String], experienced: bool, birth_year: i32, now: i64) -> Records {
        let class = medical_required(licenses);
        let mut r = Records { medical_class: class, medical_until: now + medical_months(class, age(birth_year, now)) as i64 * 30 * DAY, ..Default::default() };
        if experienced {
            for i in 0..3 {
                r.landings.push(LandingRec { ts: now - i * DAY, night: false, heli: false });
                r.landings.push(LandingRec { ts: now - i * DAY, night: true, heli: false });
            }
            r.approaches = (0..6).map(|i| now - i * DAY).collect();
        }
        r
    }

    /// Deneyimli helikopter pilotu: son günlerde 3 helikopter inişi (helikopterle yolcu yeterliliği tam).
    pub fn seed_helicopter(&mut self, now: i64) {
        for i in 0..3 {
            self.landings.push(LandingRec { ts: now - i * DAY, night: false, heli: true });
        }
    }

    fn prune(&mut self, now: i64) {
        let year = now - 365 * DAY;
        self.landings.retain(|l| l.ts > year);
        self.approaches.retain(|t| *t > year);
        self.flights.retain(|(t, _)| *t > year);
    }

    /// Biten bir uçuşu işler: inişler, aletli yaklaşmalar, uçuş süresi ve görev.
    pub fn add_flight(&mut self, start: i64, end: i64, hours: f64, landings: &[(bool, bool)], approaches: u32, now: i64) {
        for (night, heli) in landings {
            self.landings.push(LandingRec { ts: end, night: *night, heli: *heli });
        }
        for _ in 0..approaches {
            self.approaches.push(end);
        }
        if hours > 0.0 {
            self.flights.push((end, hours));
        }
        // Görev: önceki görevin bitişinden bu yana 10 saat geçmediyse aynı görev sürer.
        let report = start - 3600;
        if self.duty_end > 0 && report - self.duty_end < (REST_H * 3600.0) as i64 {
            self.duty_sectors += 1;
        } else {
            self.duty_start = report;
            self.duty_sectors = 1;
        }
        self.duty_end = end + 1800;
        self.prune(now);
    }

    /// Dinlenme: görev hemen biter.
    pub fn rest(&mut self) {
        self.duty_start = 0;
        self.duty_sectors = 0;
        self.duty_end = 0;
    }

    pub fn renew_medical(&mut self, class: u8, birth_year: i32, now: i64) {
        self.medical_class = class;
        self.medical_until = now + medical_months(class, age(birth_year, now)) as i64 * 30 * DAY;
    }

    pub fn status(&self, licenses: &[String], d: Difficulty, now: i64) -> Status {
        let d90 = now - 90 * DAY;
        let recent = |f: &dyn Fn(&LandingRec) -> bool| self.landings.iter().filter(|l| l.ts > d90 && f(l)).count() as u32;
        let landings_90d = recent(&|l| !l.heli);
        let night_landings_90d = recent(&|l| l.night && !l.heli);
        let heli_landings_90d = recent(&|l| l.heli);
        let approaches_6m = self.approaches.iter().filter(|t| **t > now - 182 * DAY).count() as u32;
        let required = medical_required(licenses);
        let on_duty = self.duty_end > 0 && now - self.duty_end < (REST_H * 3600.0) as i64;
        let duty_max_h = max_fdp_h(self.duty_sectors + 1);
        let used_h = if on_duty { (now - self.duty_start) as f64 / 3600.0 } else { 0.0 };
        let hours_in = |days: i64| self.flights.iter().filter(|(t, _)| *t > now - days * DAY).map(|(_, h)| h).sum::<f64>();
        Status {
            landings_90d,
            night_landings_90d,
            heli_landings_90d,
            passenger_current: landings_90d >= 3,
            night_current: night_landings_90d >= 3,
            heli_current: heli_landings_90d >= 3,
            approaches_6m,
            ifr_current: approaches_6m >= 6,
            medical_required: required,
            medical_class: self.medical_class,
            medical_until: self.medical_until,
            medical_valid: self.medical_class != 0 && self.medical_class <= required && self.medical_until > now,
            on_duty,
            duty_start: if on_duty { self.duty_start } else { 0 },
            duty_sectors: if on_duty { self.duty_sectors } else { 0 },
            duty_max_h: if on_duty { duty_max_h } else { max_fdp_h(1) },
            duty_left_h: if on_duty { ((duty_max_h - used_h) * 10.0).round() / 10.0 } else { max_fdp_h(1) },
            hours_28d: (hours_in(28) * 10.0).round() / 10.0,
            hours_12m: (hours_in(365) * 10.0).round() / 10.0,
            enforce_currency: d != Difficulty::Easy,
            enforce_duty: d == Difficulty::Realistic,
        }
    }
}

/// Bir işi kabul etmenin önündeki sicil engeli (varsa kod): "medical" | "passenger_currency" | "night_currency" |
/// "duty" | "flight_time". Kolay zorlukta hiçbiri; görev ve uçuş süresi yalnızca Gerçekçi'de engeller.
pub fn blocker(s: &Status, passengers: bool, heli: bool, night: bool, block_h: f64) -> Option<&'static str> {
    if !s.enforce_currency {
        return None;
    }
    if !s.medical_valid {
        return Some("medical");
    }
    if passengers && !(if heli { s.heli_current } else { s.passenger_current }) {
        return Some("passenger_currency");
    }
    if passengers && night && !heli && !s.night_current {
        return Some("night_currency");
    }
    if s.enforce_duty {
        if block_h + 0.5 > s.duty_left_h {
            return Some("duty");
        }
        if s.hours_28d + block_h > 100.0 || s.hours_12m + block_h > 1000.0 {
            return Some("flight_time");
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;

    fn lic(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn medical_classes_and_validity_by_age() {
        assert_eq!(medical_required(&lic(&["spl", "ppl"])), 2);
        assert_eq!(medical_required(&lic(&["spl", "ppl", "cpl"])), 1);
        assert_eq!(medical_months(1, 30), 12);
        assert_eq!(medical_months(1, 61), 6);
        assert_eq!(medical_months(2, 30), 60);
        assert_eq!(medical_months(2, 45), 24);
        assert_eq!(medical_months(2, 55), 12);
        assert_eq!(age(0, NOW), 30);
        assert!(age(1990, NOW) >= 36);
        // Özel lisansla alınan 2. sınıf sertifika, ticari lisansla yetmez.
        let mut r = Records::new_pilot(&lic(&["spl", "ppl"]), false, 1995, NOW);
        assert!(r.status(&lic(&["spl", "ppl"]), Difficulty::Normal, NOW).medical_valid);
        let s = r.status(&lic(&["spl", "ppl", "cpl"]), Difficulty::Normal, NOW);
        assert!(!s.medical_valid);
        assert_eq!(blocker(&s, false, false, false, 1.0), Some("medical"));
        r.renew_medical(1, 1995, NOW);
        assert!(r.status(&lic(&["spl", "ppl", "cpl"]), Difficulty::Normal, NOW).medical_valid);
        // Süre dolunca geçersiz.
        assert!(!r.status(&lic(&["cpl"]), Difficulty::Normal, NOW + 400 * DAY).medical_valid);
        assert!(medical_fee(1, Difficulty::Normal) > medical_fee(2, Difficulty::Normal));
    }

    #[test]
    fn passenger_and_ifr_currency() {
        let l = lic(&["spl", "ppl", "cpl", "ir"]);
        let mut r = Records::new_pilot(&l, false, 1995, NOW);
        let s = r.status(&l, Difficulty::Normal, NOW);
        assert!(!s.passenger_current && !s.ifr_current);
        assert_eq!(blocker(&s, true, false, false, 1.0), Some("passenger_currency"));
        assert_eq!(blocker(&s, false, false, false, 1.0), None, "yolcusuz uçuş serbest");
        // Yolcusuz bir uçuşta üç pist turu (biri gece).
        r.add_flight(NOW - 3600, NOW, 1.0, &[(false, false), (false, false), (true, false)], 2, NOW);
        let s = r.status(&l, Difficulty::Normal, NOW);
        assert!(s.passenger_current && !s.night_current);
        assert_eq!(s.approaches_6m, 2);
        assert_eq!(blocker(&s, true, false, true, 1.0), Some("night_currency"));
        // 90 gün sonra yeterlilik düşer.
        assert!(!r.status(&l, Difficulty::Normal, NOW + 91 * DAY).passenger_current);
        // Kolay zorlukta engel yok; deneyimli başlangıçta yeterlilik tam.
        assert_eq!(blocker(&r.status(&l, Difficulty::Easy, NOW + 91 * DAY), true, false, true, 1.0), None);
        let e = Records::new_pilot(&l, true, 1995, NOW);
        let s = e.status(&l, Difficulty::Normal, NOW);
        assert!(s.passenger_current && s.night_current && s.ifr_current, "{s:?}");
    }

    #[test]
    fn duty_periods_sectors_and_rest() {
        let l = lic(&["spl", "ppl", "cpl"]);
        let mut r = Records::new_pilot(&l, true, 1995, NOW);
        // Üç sektör, aralarında 1 saat: aynı görev.
        let mut t = NOW;
        for _ in 0..3 {
            r.add_flight(t, t + 2 * 3600, 2.0, &[(false, false)], 0, t + 2 * 3600);
            t += 3 * 3600;
        }
        let now = t - 3600;
        let s = r.status(&l, Difficulty::Realistic, now);
        assert!(s.on_duty);
        assert_eq!(s.duty_sectors, 3);
        // 4. sektör için en uzun görev 12 saat; başlangıçtan bu yana ≈ 9 saat geçti.
        assert_eq!(s.duty_max_h, 12.0);
        assert!((s.duty_left_h - 3.0).abs() < 0.11, "{s:?}");
        assert_eq!(blocker(&s, false, false, false, 3.0), Some("duty"));
        assert_eq!(blocker(&s, false, false, false, 2.0), None);
        // Normal zorlukta görev süresi uyarıdır, engellemez.
        assert_eq!(blocker(&r.status(&l, Difficulty::Normal, now), false, false, false, 5.0), None);
        // Dinlenince görev biter; 10 saat ara da bitirir.
        r.rest();
        assert!(!r.status(&l, Difficulty::Realistic, now).on_duty);
        r.add_flight(now, now + 3600, 1.0, &[], 0, now + 3600);
        assert!(!r.status(&l, Difficulty::Realistic, now + 3600 + 11 * 3600).on_duty);
        assert!(r.status(&l, Difficulty::Realistic, now + 3600).hours_28d >= 7.0);
        assert_eq!(max_fdp_h(1), 13.0);
        assert_eq!(max_fdp_h(20), 9.0);
    }
}
