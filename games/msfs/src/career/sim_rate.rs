//! Sim hızını (zaman hızlandırma) Modstead'den yönetme: seyirde 2×–16×, güvenli olmayan anda kendiliğinden 1×.
//!
//! Sim hızı SimConnect'te `SIM_RATE_INCR` / `SIM_RATE_DECR` olaylarıyla ikiye katlanır ya da yarıya iner; hedefe birer
//! adımla gidilir ve her adımdan sonra simin bildirdiği `SIMULATION RATE` değişene kadar beklenir (sim bir hızı
//! kabul etmezse birkaç denemeden sonra simin hızında kalınır).
//!
//! Hızlandırma yalnızca takip edilen bir kariyer uçuşunda, tırmanış ya da seyir evresinde, yerden en az 2.000 ft
//! yüksekte, sert alçalmıyorken, uyarı yokken ve varışa en az 30 nm ve (yer hızıyla) 12 dakika varken açılır.
//! Modstead'in açtığı hızlandırma bunlardan biri bozulunca kendiliğinden 1×'e döner ve neden arayüzde gösterilir.
//! Pilotun simin kendi tuşlarıyla açtığı hıza dokunulmaz. Kariyer kuralı her iki durumda aynıdır: lisans saati
//! gerçek sürenin en çok 1,5 katı sayılır (bkz. `KARIYER.md`).

use std::time::{Duration, Instant};

use modstead_core::tr;
use serde::Serialize;

use super::tracker::Phase;

/// Seçilebilen hızlar.
pub const RATES: [u32; 5] = [1, 2, 4, 8, 16];
/// Hızlandırma için yerden en az yükseklik (ft).
pub const MIN_AGL_FT: f64 = 2000.0;
/// Varışa en az uzaklık (nm) ve yer hızıyla en az süre (dk).
pub const MIN_REMAINING_NM: f64 = 30.0;
pub const MIN_REMAINING_MIN: f64 = 12.0;
/// Bundan sert alçalırken hızlandırılmaz (fpm).
pub const MAX_DESCENT_FPM: f64 = 1500.0;
/// Bir adımdan sonra simin yeni hızı bildirmesi için beklenen süre; gelmezse adım yinelenir.
const STEP_WAIT: Duration = Duration::from_millis(1500);
/// Hedefe ulaşmadan vazgeçmeden önceki en çok adım (1× → 16× dört adımdır).
const MAX_STEPS: u8 = 10;

/// Hızlandırmanın neden açılamadığı ya da neden 1×'e dönüldüğü.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Hold {
    /// Takip edilen bir kariyer uçuşu yok ya da sim bağlı değil.
    NoFlight,
    Ground,
    /// Tırmanış ya da seyir dışında bir evre (kalkış, alçalma, yaklaşma…).
    Phase,
    Low,
    Descent,
    Arrival,
    /// Stall ya da aşırı hız uyarısı.
    Warning,
}

impl Hold {
    pub fn text(self) -> &'static str {
        match self {
            Hold::NoFlight => tr!("Hızlandırma yalnızca takip edilen bir kariyer uçuşunda açılır.", "Time acceleration only works during a tracked career flight."),
            Hold::Ground => tr!("Yerdeyken hızlandırılamaz.", "Time acceleration is off on the ground."),
            Hold::Phase => tr!("Yalnızca tırmanışta ve seyirde hızlandırılabilir.", "Time acceleration only works in the climb and cruise."),
            Hold::Low => tr!("Yerden en az 2.000 ft yüksekte hızlandırılabilir.", "Time acceleration needs at least 2,000 ft above the ground."),
            Hold::Descent => tr!("Sert alçalırken hızlandırılamaz.", "Time acceleration is off in a steep descent."),
            Hold::Arrival => tr!("Varışa yaklaştın: hızlandırma kapalı.", "You are close to the destination: time acceleration is off."),
            Hold::Warning => tr!("Uyarı varken hızlandırılamaz.", "Time acceleration is off while a warning is active."),
        }
    }
}

/// Karar için okunan durum (motorun dört Hz'lik döngüsünde).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Sample {
    /// Sim bağlı, uçuş verisi geliyor ve kariyer uçuşu başlamış (blok kalkışı yapılmış, henüz bitmemiş).
    pub flying: bool,
    pub phase: Phase,
    pub on_ground: bool,
    pub agl_ft: f64,
    pub vs_fpm: f64,
    pub gs_kt: f64,
    pub remaining_nm: f64,
    pub warning: bool,
    /// Simin şu anki hızı (`SIMULATION RATE`).
    pub rate: f64,
}

/// Şu an hızlandırmaya izin var mı? Yoksa neden.
pub fn hold(s: &Sample) -> Option<Hold> {
    if !s.flying {
        return Some(Hold::NoFlight);
    }
    if s.on_ground {
        return Some(Hold::Ground);
    }
    if s.warning {
        return Some(Hold::Warning);
    }
    if !matches!(s.phase, Phase::Climb | Phase::Cruise) {
        return Some(Hold::Phase);
    }
    if s.agl_ft < MIN_AGL_FT {
        return Some(Hold::Low);
    }
    if s.vs_fpm < -MAX_DESCENT_FPM {
        return Some(Hold::Descent);
    }
    let minutes = if s.gs_kt > 30.0 { s.remaining_nm / s.gs_kt * 60.0 } else { f64::INFINITY };
    if s.remaining_nm < MIN_REMAINING_NM || minutes < MIN_REMAINING_MIN {
        return Some(Hold::Arrival);
    }
    None
}

/// İstenen hızı geçerli bir değere yuvarlar (listede yoksa bir altındaki).
pub fn normalize(rate: u32) -> u32 {
    RATES.iter().copied().filter(|r| *r <= rate.max(1)).max().unwrap_or(1)
}

/// Motora söylenen adım.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Faster,
    Slower,
}

/// Arayüzün gördüğü durum (`Live.rate`).
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RateView {
    /// Modstead'in hedeflediği hız (1 = normal).
    pub target: u32,
    /// Hız Modstead'den açıldı (kendiliğinden 1×'e dönüş yalnızca bunda).
    pub managed: bool,
    /// Şu an hızlandırma açılamıyorsa nedeni.
    pub hold: Option<Hold>,
    /// Modstead'in açtığı hızlandırma kendiliğinden 1×'e döndüyse nedeni (pilot yeni bir hız seçince silinir).
    pub returned: Option<Hold>,
}

#[derive(Debug)]
pub struct RateControl {
    target: u32,
    managed: bool,
    /// Hedefe gidiliyor (pilotun isteği ya da kendiliğinden dönüş); değilse simin hızı izlenir.
    steering: bool,
    /// Son adımın zamanı ve o andaki hız.
    waiting: Option<(Instant, f64)>,
    steps: u8,
    hold: Option<Hold>,
    returned: Option<Hold>,
}

impl Default for RateControl {
    fn default() -> Self {
        RateControl { target: 1, managed: false, steering: false, waiting: None, steps: 0, hold: Some(Hold::NoFlight), returned: None }
    }
}

/// Simin bildirdiği hız hedefle aynı mı (hızlar ikinin kuvvetleridir; küçük kayma yutulur)?
fn same(rate: f64, target: u32) -> bool {
    (rate - target as f64).abs() < 0.05 * target as f64
}

impl RateControl {
    /// Pilotun isteği. Hızlandırma şu an yasaksa neden döner (1× her zaman kabul edilir).
    pub fn request(&mut self, rate: u32, s: &Sample) -> Result<(), Hold> {
        let rate = normalize(rate);
        if rate > 1 {
            if let Some(h) = hold(s) {
                return Err(h);
            }
        }
        self.target = rate;
        self.managed = rate > 1;
        self.steering = true;
        self.waiting = None;
        self.steps = 0;
        self.returned = None;
        Ok(())
    }

    /// Bağlantı koptu ya da uçuş bitti: yönetim bırakılır (simin hızına dokunulmaz).
    pub fn reset(&mut self) {
        let returned = self.returned;
        *self = RateControl { returned, ..Default::default() };
    }

    /// Döngü başına: gerekirse simin hızını bir adım değiştir.
    pub fn observe(&mut self, s: &Sample, now: Instant) -> Option<Step> {
        self.hold = hold(s);
        if !s.flying {
            if self.target != 1 || self.managed || self.steering {
                self.reset();
            }
            return None;
        }
        // Modstead'in açtığı hızlandırma güvenli olmayan anda 1×'e döner.
        if self.managed && self.target > 1 {
            if let Some(h) = self.hold {
                self.target = 1;
                self.managed = false;
                self.steering = true;
                self.waiting = None;
                self.steps = 0;
                self.returned = Some(h);
            }
        }
        if !self.steering {
            // Pilot simin tuşlarıyla değiştirdiyse o hız benimsenir; Modstead'in açtığı hızlandırmayı pilot yalnızca
            // değiştirdiyse varışta yine 1×'e dönülür.
            if !same(s.rate, self.target) {
                let now_rate = normalize(s.rate.round().max(1.0) as u32);
                self.managed = self.managed && now_rate > 1;
                self.target = now_rate;
            }
            return None;
        }
        if same(s.rate, self.target) {
            self.steering = false;
            self.waiting = None;
            return None;
        }
        if let Some((at, rate)) = self.waiting {
            if s.rate == rate && now.duration_since(at) < STEP_WAIT {
                return None;
            }
        }
        if self.steps >= MAX_STEPS {
            // Sim bu hızı kabul etmiyor (ör. simin üst sınırı): simin hızında kalınır.
            self.steering = false;
            self.waiting = None;
            self.target = normalize(s.rate.round().max(1.0) as u32);
            self.managed = self.managed && self.target > 1;
            return None;
        }
        self.steps += 1;
        self.waiting = Some((now, s.rate));
        Some(if s.rate < self.target as f64 { Step::Faster } else { Step::Slower })
    }

    pub fn view(&self) -> RateView {
        RateView { target: self.target, managed: self.managed, hold: self.hold, returned: self.returned }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cruise(rate: f64) -> Sample {
        Sample { flying: true, phase: Phase::Cruise, agl_ft: 8000.0, gs_kt: 140.0, remaining_nm: 200.0, rate, ..Default::default() }
    }

    /// Simi taklit eder: adımı uygular ve yeni hızı döner (üst sınır `max`).
    fn sim(rate: f64, step: Option<Step>, max: f64) -> f64 {
        match step {
            Some(Step::Faster) => (rate * 2.0).min(max),
            Some(Step::Slower) => rate / 2.0,
            None => rate,
        }
    }

    #[test]
    fn allowed_only_in_a_safe_cruise() {
        assert_eq!(hold(&cruise(1.0)), None);
        assert_eq!(hold(&Sample { flying: false, ..cruise(1.0) }), Some(Hold::NoFlight));
        assert_eq!(hold(&Sample { on_ground: true, ..cruise(1.0) }), Some(Hold::Ground));
        assert_eq!(hold(&Sample { phase: Phase::Approach, ..cruise(1.0) }), Some(Hold::Phase));
        assert_eq!(hold(&Sample { agl_ft: 1500.0, ..cruise(1.0) }), Some(Hold::Low));
        assert_eq!(hold(&Sample { vs_fpm: -2000.0, ..cruise(1.0) }), Some(Hold::Descent));
        assert_eq!(hold(&Sample { remaining_nm: 25.0, ..cruise(1.0) }), Some(Hold::Arrival));
        // 40 nm kaldı ama 300 kt ile 8 dakika: varış yakın.
        assert_eq!(hold(&Sample { remaining_nm: 40.0, gs_kt: 300.0, ..cruise(1.0) }), Some(Hold::Arrival));
        assert_eq!(hold(&Sample { warning: true, ..cruise(1.0) }), Some(Hold::Warning));
        assert_eq!((normalize(0), normalize(3), normalize(16), normalize(100)), (1, 2, 16, 16));
    }

    #[test]
    fn steps_to_the_target_and_back_to_1x_near_the_destination() {
        let mut c = RateControl::default();
        let t0 = Instant::now();
        assert_eq!(c.request(8, &Sample { phase: Phase::Takeoff, ..cruise(1.0) }), Err(Hold::Phase));
        c.request(8, &cruise(1.0)).unwrap();
        let mut rate = 1.0;
        let mut sent = 0;
        for i in 0..20 {
            let step = c.observe(&cruise(rate), t0 + Duration::from_millis(250 * i));
            sent += step.is_some() as u32;
            rate = sim(rate, step, 128.0);
        }
        assert_eq!((rate, sent), (8.0, 3));
        assert!(c.view().managed);
        // Varışa yaklaşınca kendiliğinden 1×.
        let mut s = cruise(rate);
        s.remaining_nm = 20.0;
        for i in 20..40 {
            s.rate = rate;
            rate = sim(rate, c.observe(&s, t0 + Duration::from_millis(250 * i)), 128.0);
        }
        assert_eq!(rate, 1.0);
        let v = c.view();
        assert_eq!((v.target, v.managed, v.returned, v.hold), (1, false, Some(Hold::Arrival), Some(Hold::Arrival)));
        // Yeni istek dönüş notunu siler.
        c.request(1, &cruise(1.0)).unwrap();
        assert_eq!(c.view().returned, None);
    }

    #[test]
    fn waits_for_the_sim_and_gives_up_at_its_limit() {
        let mut c = RateControl::default();
        let t0 = Instant::now();
        c.request(16, &cruise(1.0)).unwrap();
        // Sim adımı hemen uygulamıyor: bekleme süresi dolmadan yeni adım yok.
        assert_eq!(c.observe(&cruise(1.0), t0), Some(Step::Faster));
        assert_eq!(c.observe(&cruise(1.0), t0 + Duration::from_millis(500)), None);
        assert_eq!(c.observe(&cruise(1.0), t0 + Duration::from_millis(1600)), Some(Step::Faster));
        // Simin üst sınırı 4×: birkaç denemeden sonra 4×'te kalınır.
        let mut rate = 2.0;
        for i in 0..60 {
            rate = sim(rate, c.observe(&cruise(rate), t0 + Duration::from_millis(2000 + 1600 * i)), 4.0);
        }
        assert_eq!((rate, c.view().target), (4.0, 4));
    }

    #[test]
    fn manual_sim_rate_is_left_alone() {
        let mut c = RateControl::default();
        let t0 = Instant::now();
        // Pilot simin tuşlarıyla 4× yaptı: Modstead yönetmez, varışta da dokunmaz.
        assert_eq!(c.observe(&cruise(4.0), t0), None);
        let mut s = cruise(4.0);
        s.remaining_nm = 10.0;
        assert_eq!(c.observe(&s, t0 + Duration::from_secs(1)), None);
        let v = c.view();
        assert_eq!((v.target, v.managed, v.returned), (4, false, None));
        // Uçuş bitince yönetim bırakılır.
        assert_eq!(c.observe(&Sample { flying: false, ..s }, t0 + Duration::from_secs(2)), None);
        assert_eq!(c.view().target, 1);
    }
}
