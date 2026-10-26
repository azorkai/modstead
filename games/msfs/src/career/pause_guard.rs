//! Başlatmadan sonra simin "aktif duraklatma"da kalmasına karşı bekçi.
//!
//! Gerçek simde görülen (MSFS 2024 1.9.21, 25–26.10.2026; kariyer günlüğündeki başlatmalar): sim yüklenen uçuşu
//! açılış sineması (RTC) bitene kadar aktif duraklatmada ve "Uçuşa hazır" kamerasında (`CAMERA STATE` 31) tutuyor;
//! `RTC_END` ikisini birden bırakıyor (park yeri: RTC_START → 2,6 sn → RTC_END, uçak sorunsuz). Sinema hiç oynamazsa
//! (taksi durumuyla yüklenen pist başı, açık bir uçuşun üstüne yükleme) ya da takılırsa bırakma hiç gelmiyor: kamera
//! 31'de kalıyor (Modstead kokpite alıyor) ve uçak motor çalışırken, park freni bırakılmışken kıpırdamıyor
//! (`IS IN ACTIVE PAUSE` = 1, `G FORCE` ≈ 0, `SIMULATION TIME` ilerlemiyor). Pause tuşu ya da ESC → Devam düzeltiyor.
//! Sim `Pause_EX1` ile aktif duraklatmayı bildirmiyor ve SimConnect `ACTIVE_PAUSE_TOGGLE` olay adını tanımıyor
//! (istisna 7, NAME_UNRECOGNIZED). Uçuş dosyasında bunu önleyen bir anahtar bulunamadı (simin kendi FLT'leriyle
//! karşılaştırıldı); bu yüzden durum başlatmadan hemen sonra yakalanıp kapatılır.
//!
//! Bekçi yalnızca bir başlatmadan sonra, kullanıcı uçağın başına geçtikten sonraki ilk iki dakikada ve duraklatma o
//! andan beri hiç kalkmamışsa iş yapar. Sim bir kez akarken görülürse, uçak kıpırdarsa ya da durum bir kez çözülürse
//! kapanır: pilotun sonradan kendi açtığı aktif duraklatmaya dokunulmaz. Denemeler (aralarında birkaç saniye, her
//! birinden önce durum yeniden okunur):
//! 1. SimConnect `PAUSE_OFF` (kapatır; aç/kapa değil, tekrarı zararsız). Sim bir gün `ACTIVE_PAUSE_TOGGLE`'ı tanırsa
//!    ve `IS IN ACTIVE PAUSE` açık diyorsa onun yerine o (aç/kapa olduğu için yalnızca değişken açık derken).
//! 2. Sim içi: Modstead'in ana arayüzdeki kodu simin araç çubuğunun yaptığını yapar
//!    (`TOOLBAR_SET_ACTIVE_PAUSE`, false; bkz. `hud/menu/ModsteadMenu.js`, `/api/sim-assist`).
//! 3. SimConnect `PAUSE_ON`, bir saniye sonra `PAUSE_OFF` (ESC → Devam'ın karşılığı; `PAUSE_OFF` her durumda gider).
//!
//! Hâlâ kapanmadıysa kullanıcıya Pause tuşu söylenir.

use std::time::{Duration, Instant};

/// Kullanıcı uçağın başına geçtikten sonra bekçinin yeni bir duraklatma olayı açabileceği süre.
pub const WINDOW: Duration = Duration::from_secs(120);
/// Başlatmadan sonra kullanıcının uçağın başına geçmesi için beklenen en uzun süre (sim açılışı, yükleme, "Uçuşa hazır").
pub const ARM_MAX: Duration = Duration::from_secs(15 * 60);
/// Denemeler arası.
pub const SPACING: Duration = Duration::from_secs(3);
/// `PAUSE_ON` ile `PAUSE_OFF` arası.
pub const CYCLE_GAP: Duration = Duration::from_secs(1);
/// En çok deneme.
pub const MAX_ATTEMPTS: u8 = 3;
/// Olay açmak için art arda takılı örnek (saniyede bir); simin kendi bırakmasıyla yarışmamak için.
const STUCK_SAMPLES: u8 = 2;
/// Bekçiyi kapatmak için art arda akan örnek.
const RUNNING_SAMPLES: u8 = 2;

/// Saniyede bir okunan durum (ortam verisiyle).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Sample {
    /// Uçuş verisi geliyor (menüdeki yer tutucu değil).
    pub in_flight: bool,
    /// Kamera uçakta (kokpit, dış…); "Uçuşa hazır" ekranı, sinema ve menüler değil.
    pub in_control: bool,
    /// Sim tam duraklatmada ya da ESC menüsünde (`Pause_EX1` sıfır değil).
    pub menu_paused: bool,
    /// `IS IN ACTIVE PAUSE`; sim değişkeni tanımıyorsa `None`.
    pub active_pause: Option<bool>,
    /// `SIMULATION TIME` (sn); okunamıyorsa `None`.
    pub sim_time: Option<f64>,
    pub on_ground: bool,
    pub gs_kt: f64,
    pub g: f64,
}

impl Sample {
    /// Uçak kıpırdıyor: duraklatmada olamaz.
    pub fn moving(&self) -> bool {
        !self.on_ground || self.gs_kt > 2.0
    }
}

/// Takılmanın neyle görüldüğü.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Detection {
    /// `IS IN ACTIVE PAUSE` açık.
    Var,
    /// Değişken okunamıyor; uçak donmuş görünüyor (yerde, sim saati ilerlemiyor ya da G ≈ 0).
    Frozen,
}

/// Değişken okunamıyorsa: yerde duran uçakta sim saati iki örnek arasında ilerlemiyorsa (saat okunamıyorsa G ≈ 0;
/// fizik çalışırken yerde G ≈ 1) donmuş sayılır.
pub fn looks_frozen(s: &Sample, prev_sim_time: Option<f64>) -> bool {
    if !s.on_ground || s.gs_kt > 0.5 {
        return false;
    }
    match (prev_sim_time, s.sim_time) {
        (Some(a), Some(b)) => a == b,
        _ => s.g.abs() < 0.2,
    }
}

/// Takılı mı? Değişken okunabiliyorsa yalnızca ona bakılır.
pub fn detect(s: &Sample, prev_sim_time: Option<f64>) -> Option<Detection> {
    match s.active_pause {
        Some(true) => Some(Detection::Var),
        Some(false) => None,
        None => looks_frozen(s, prev_sim_time).then_some(Detection::Frozen),
    }
}

/// SimConnect ile gönderilecek olay.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimEvent {
    /// `ACTIVE_PAUSE_TOGGLE` (aç/kapa).
    Toggle,
    PauseOn,
    PauseOff,
}

impl SimEvent {
    pub fn name(self) -> &'static str {
        match self {
            SimEvent::Toggle => "ACTIVE_PAUSE_TOGGLE",
            SimEvent::PauseOn => "PAUSE_ON",
            SimEvent::PauseOff => "PAUSE_OFF",
        }
    }
}

/// Bekçinin motora söylediği.
#[derive(Debug, Clone, PartialEq)]
pub enum Act {
    Detected(Detection),
    /// `attempt` 1'den başlar; `PAUSE_ON` ardından gelen `PAUSE_OFF` için 0.
    Send { event: SimEvent, attempt: u8 },
    /// Sim içi koddan kapatma isteği (numara her olayda yenidir).
    InSim { request: u32, attempt: u8 },
    GaveUp,
    Resolved { attempts: u8, secs: f64 },
    Disarmed(&'static str),
}

/// Kullanıcıya gösterilecek durum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Notice {
    /// Modstead kapatmayı deniyor.
    Working,
    /// Kendiliğinden kapanmadı: Pause tuşu.
    Manual,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Try {
    SimConnect,
    InSim,
    Cycle,
}

#[derive(Debug, Clone)]
struct Episode {
    since: Instant,
    how: Detection,
    attempts: u8,
    last: Option<Instant>,
    request: u32,
    gave_up: bool,
}

#[derive(Debug, Clone, Default)]
pub struct PauseGuard {
    armed_at: Option<Instant>,
    control_at: Option<Instant>,
    stuck_n: u8,
    running_n: u8,
    prev_sim_time: Option<f64>,
    episode: Option<Episode>,
    /// `PAUSE_ON` gönderildi; bu andan sonra `PAUSE_OFF` gider (bekçi kapansa da).
    pending_off: Option<Instant>,
    next_request: u32,
    /// Sim olay adlarını tanıdı mı (eşleme istisna vermediyse).
    pub toggle_ok: bool,
    pub pause_ok: bool,
}

impl PauseGuard {
    /// Yeni bir başlatma: uçuş yükleniyor ya da uçak taşınıyor. Önceki olay unutulur.
    pub fn arm(&mut self, now: Instant) {
        self.reset();
        self.armed_at = Some(now);
    }

    #[cfg(test)]
    pub fn armed(&self) -> bool {
        self.armed_at.is_some()
    }

    fn reset(&mut self) {
        self.armed_at = None;
        self.control_at = None;
        self.stuck_n = 0;
        self.running_n = 0;
        self.episode = None;
    }

    fn disarm(&mut self, why: &'static str, acts: &mut Vec<Act>) {
        if self.armed_at.is_some() {
            acts.push(Act::Disarmed(why));
        }
        self.reset();
    }

    /// Kullanıcıya gösterilecek not (olay sürerken).
    pub fn notice(&self) -> Option<Notice> {
        self.episode.as_ref().map(|e| if e.gave_up { Notice::Manual } else { Notice::Working })
    }

    /// Sim içi koda açık istek (0: yok).
    pub fn request(&self) -> u32 {
        self.episode.as_ref().map(|e| e.request).unwrap_or(0)
    }

    /// Sıradaki deneme türleri (simin tanıdığı olaylara göre).
    fn plan(&self) -> Vec<Try> {
        let mut v = Vec::new();
        if self.pause_ok || self.toggle_ok {
            v.push(Try::SimConnect);
        }
        v.push(Try::InSim);
        if self.pause_ok {
            v.push(Try::Cycle);
        }
        v.truncate(MAX_ATTEMPTS as usize);
        v
    }

    /// Bir sonraki denemeyi yapar ya da (deneme kalmadıysa) vazgeçer.
    fn attempt(&mut self, now: Instant, acts: &mut Vec<Act>) {
        let plan = self.plan();
        let Some(e) = self.episode.as_mut() else { return };
        let Some(kind) = plan.get(e.attempts as usize).copied() else {
            if !e.gave_up {
                e.gave_up = true;
                acts.push(Act::GaveUp);
            }
            return;
        };
        e.attempts += 1;
        e.last = Some(now);
        let n = e.attempts;
        match kind {
            // Aç/kapa olay yalnızca değişken açık derken; donma belirtisiyle ya da tanınmıyorsa kapatma olayı.
            Try::SimConnect if self.toggle_ok && e.how == Detection::Var => acts.push(Act::Send { event: SimEvent::Toggle, attempt: n }),
            Try::SimConnect => acts.push(Act::Send { event: SimEvent::PauseOff, attempt: n }),
            Try::InSim => {
                if e.request == 0 {
                    self.next_request = self.next_request.wrapping_add(1).max(1);
                    e.request = self.next_request;
                }
                acts.push(Act::InSim { request: e.request, attempt: n });
            }
            Try::Cycle => {
                acts.push(Act::Send { event: SimEvent::PauseOn, attempt: n });
                self.pending_off = Some(now + CYCLE_GAP);
            }
        }
    }

    /// Saniyede bir, ortam verisi gelince.
    pub fn observe(&mut self, s: &Sample, now: Instant) -> Vec<Act> {
        let mut acts = Vec::new();
        let prev = std::mem::replace(&mut self.prev_sim_time, s.sim_time);
        let Some(armed_at) = self.armed_at else { return acts };
        if self.control_at.is_none() && now.duration_since(armed_at) > ARM_MAX {
            self.disarm("başlatmadan sonra uçağın başına geçilmedi", &mut acts);
            return acts;
        }
        // Menüde, ESC'de ya da "Uçuşa hazır" ekranında sayılmaz.
        if !s.in_flight || s.menu_paused || !s.in_control {
            self.stuck_n = 0;
            self.running_n = 0;
            return acts;
        }
        let control_at = *self.control_at.get_or_insert(now);
        let stuck = if s.moving() { None } else { detect(s, prev) };
        let Some(how) = stuck else {
            self.stuck_n = 0;
            self.running_n = self.running_n.saturating_add(1);
            if let Some(e) = &self.episode {
                acts.push(Act::Resolved { attempts: e.attempts, secs: now.duration_since(e.since).as_secs_f64() });
                self.disarm("aktif duraklatma kapandı", &mut acts);
            } else if s.moving() {
                self.disarm("uçak hareket ediyor", &mut acts);
            } else if self.running_n >= RUNNING_SAMPLES {
                self.disarm("sim akıyor; aktif duraklatma yok", &mut acts);
            }
            return acts;
        };
        self.running_n = 0;
        self.stuck_n = self.stuck_n.saturating_add(1);
        match &self.episode {
            None => {
                if now.duration_since(control_at) > WINDOW {
                    self.disarm("başlatma penceresi bitti", &mut acts);
                } else if self.stuck_n >= STUCK_SAMPLES {
                    self.episode = Some(Episode { since: now, how, attempts: 0, last: None, request: 0, gave_up: false });
                    acts.push(Act::Detected(how));
                    self.attempt(now, &mut acts);
                }
            }
            Some(e) => {
                if !e.gave_up && e.last.is_none_or(|t| now.duration_since(t) >= SPACING) {
                    self.attempt(now, &mut acts);
                }
            }
        }
        acts
    }

    /// Sık (her tur): `PAUSE_ON`'dan sonra bekleyen `PAUSE_OFF`. Tam duraklatmada veri akışı durduğu için ortam
    /// verisine bağlı değildir.
    pub fn tick(&mut self, now: Instant) -> Vec<Act> {
        match self.pending_off {
            Some(t) if now >= t => {
                self.pending_off = None;
                vec![Act::Send { event: SimEvent::PauseOff, attempt: 0 }]
            }
            _ => Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Gerçek simdeki takılı durum (26.10.2026): kokpitte, yerde, 0 kt, G ≈ 0, değişken açık.
    fn stuck() -> Sample {
        Sample { in_flight: true, in_control: true, menu_paused: false, active_pause: Some(true), sim_time: Some(0.0), on_ground: true, gs_kt: 0.0, g: 1e-310 }
    }

    fn running() -> Sample {
        Sample { active_pause: Some(false), g: 1.0, ..stuck() }
    }

    fn guard() -> PauseGuard {
        PauseGuard { pause_ok: true, ..Default::default() }
    }

    fn secs(t0: Instant, s: f64) -> Instant {
        t0 + Duration::from_secs_f64(s)
    }

    /// Sırayla örnek verir; her örnekten önce `tick` de çağrılır.
    fn run(g: &mut PauseGuard, t0: Instant, samples: &[(f64, Sample)]) -> Vec<(f64, Act)> {
        let mut out = Vec::new();
        for (t, s) in samples {
            for a in g.tick(secs(t0, *t)) {
                out.push((*t, a));
            }
            for a in g.observe(s, secs(t0, *t)) {
                out.push((*t, a));
            }
        }
        out
    }

    #[test]
    fn detection_prefers_the_variable_and_falls_back_to_freeze_signs() {
        assert_eq!(detect(&stuck(), Some(0.0)), Some(Detection::Var));
        // Değişken kapalı diyorsa donma belirtileri yok sayılır (yanlışlıkla aç/kapa yapılmasın).
        assert_eq!(detect(&Sample { active_pause: Some(false), ..stuck() }, Some(0.0)), None);
        // Değişken okunamıyor: sim saati ilerlemiyor.
        let no_var = Sample { active_pause: None, g: 1.0, ..stuck() };
        assert_eq!(detect(&Sample { sim_time: Some(12.0), ..no_var.clone() }, Some(12.0)), Some(Detection::Frozen));
        assert_eq!(detect(&Sample { sim_time: Some(13.0), ..no_var.clone() }, Some(12.0)), None);
        // Saat de okunamıyor: yerde G ≈ 0.
        assert_eq!(detect(&Sample { sim_time: None, g: 0.0, ..no_var.clone() }, None), Some(Detection::Frozen));
        assert_eq!(detect(&Sample { sim_time: None, g: 0.98, ..no_var.clone() }, None), None);
        // Havada ya da kayarken donma sayılmaz.
        assert_eq!(detect(&Sample { on_ground: false, sim_time: None, g: 0.0, ..no_var.clone() }, None), None);
        assert_eq!(detect(&Sample { gs_kt: 3.0, sim_time: None, g: 0.0, ..no_var }, None), None);
    }

    #[test]
    fn stuck_launch_is_released_in_order_and_resolution_disarms() {
        let t0 = Instant::now();
        let mut g = guard();
        g.arm(t0);
        let acts = run(&mut g, t0, &[(10.0, stuck()), (11.0, stuck()), (12.0, stuck()), (14.0, stuck()), (15.0, stuck())]);
        let acts: Vec<Act> = acts.into_iter().map(|(_, a)| a).collect();
        // İki örnek sonra olay açılır, ilk deneme hemen; ikincisi aradan sonra.
        assert_eq!(acts[0], Act::Detected(Detection::Var));
        assert_eq!(acts[1], Act::Send { event: SimEvent::PauseOff, attempt: 1 });
        assert_eq!(acts[2], Act::InSim { request: 1, attempt: 2 });
        assert_eq!(acts.len(), 3);
        assert_eq!(g.request(), 1);
        assert_eq!(g.notice(), Some(Notice::Working));
        // Sim içi kod kapattı: olay çözülür, istek kalkar, bekçi kapanır.
        let acts = run(&mut g, t0, &[(16.0, running())]);
        assert!(matches!(acts[0].1, Act::Resolved { attempts: 2, .. }), "{acts:?}");
        assert_eq!(g.request(), 0);
        assert_eq!(g.notice(), None);
        assert!(!g.armed());
        // Pilot sonra kendisi aktif duraklatma açar: dokunulmaz.
        let acts = run(&mut g, t0, &[(30.0, stuck()), (31.0, stuck()), (32.0, stuck()), (40.0, stuck())]);
        assert!(acts.is_empty(), "{acts:?}");
    }

    #[test]
    fn max_attempts_then_the_user_is_told_once() {
        let t0 = Instant::now();
        let mut g = guard();
        g.arm(t0);
        let samples: Vec<(f64, Sample)> = (0..40).map(|i| (5.0 + i as f64 * 0.5, stuck())).collect();
        let acts = run(&mut g, t0, &samples);
        let sends: Vec<&Act> = acts.iter().map(|(_, a)| a).filter(|a| !matches!(a, Act::Detected(_))).collect();
        assert_eq!(
            sends,
            vec![
                &Act::Send { event: SimEvent::PauseOff, attempt: 1 },
                &Act::InSim { request: 1, attempt: 2 },
                &Act::Send { event: SimEvent::PauseOn, attempt: 3 },
                // ESC → Devam karşılığı: PAUSE_OFF bir saniye sonra, örnek beklemeden.
                &Act::Send { event: SimEvent::PauseOff, attempt: 0 },
                &Act::GaveUp,
            ]
        );
        // Denemeler arası en az SPACING.
        let at = |want: &Act| acts.iter().find(|(_, a)| a == want).unwrap().0;
        assert!(at(&Act::InSim { request: 1, attempt: 2 }) - at(&Act::Send { event: SimEvent::PauseOff, attempt: 1 }) >= SPACING.as_secs_f64());
        let on = at(&Act::Send { event: SimEvent::PauseOn, attempt: 3 });
        let off = at(&Act::Send { event: SimEvent::PauseOff, attempt: 0 });
        assert!(off - on >= CYCLE_GAP.as_secs_f64() && off - on < CYCLE_GAP.as_secs_f64() + 1.0);
        assert_eq!(g.notice(), Some(Notice::Manual));
        // İstek açık kalır (sim içi kod geç kalırsa yine kapatabilir); kullanıcı Pause'a basınca çözülür.
        assert_eq!(g.request(), 1);
        let acts = run(&mut g, t0, &[(60.0, running())]);
        assert!(matches!(acts[0].1, Act::Resolved { attempts: 3, .. }));
    }

    #[test]
    fn toggle_only_when_the_variable_says_paused_and_the_sim_knows_the_event() {
        let t0 = Instant::now();
        // Sim aç/kapa olayını tanıyor ve değişken açık: ilk deneme aç/kapa.
        let mut g = PauseGuard { toggle_ok: true, pause_ok: true, ..Default::default() };
        g.arm(t0);
        let acts = run(&mut g, t0, &[(1.0, stuck()), (2.0, stuck())]);
        assert_eq!(acts[1].1, Act::Send { event: SimEvent::Toggle, attempt: 1 });
        // Aç/kapa tek başına gider (yanında kapatma olayı yok: ikisi birlikte duraklatmayı geri açabilir).
        assert_eq!(acts.len(), 2);
        // Değişken okunamıyor, yalnızca donma belirtisi: aç/kapa asla gönderilmez.
        let mut g = PauseGuard { toggle_ok: true, pause_ok: true, ..Default::default() };
        g.arm(t0);
        let frozen = Sample { active_pause: None, sim_time: Some(5.0), ..stuck() };
        let acts = run(&mut g, t0, &[(1.0, frozen.clone()), (2.0, frozen.clone()), (3.0, frozen.clone()), (6.0, frozen.clone()), (9.0, frozen.clone()), (12.0, frozen)]);
        assert_eq!(acts[0].1, Act::Detected(Detection::Frozen));
        assert!(acts.iter().all(|(_, a)| !matches!(a, Act::Send { event: SimEvent::Toggle, .. })), "{acts:?}");
        // Sim hiçbir olayı tanımıyor: yalnızca sim içi yol, sonra kullanıcıya not.
        let mut g = PauseGuard::default();
        g.arm(t0);
        let acts = run(&mut g, t0, &[(1.0, stuck()), (2.0, stuck()), (5.0, stuck()), (8.0, stuck())]);
        let acts: Vec<Act> = acts.into_iter().map(|(_, a)| a).collect();
        assert_eq!(acts, vec![Act::Detected(Detection::Var), Act::InSim { request: 1, attempt: 1 }, Act::GaveUp]);
    }

    #[test]
    fn acts_only_in_the_launch_window_and_never_against_the_pilot() {
        let t0 = Instant::now();
        // Silahlı değil (başlatma yok): hiçbir şey yapılmaz.
        let mut g = guard();
        assert!(run(&mut g, t0, &[(1.0, stuck()), (2.0, stuck()), (3.0, stuck())]).is_empty());

        // Sim uçuşu düzgün bıraktı (akıyor), pilot 30 sn sonra aktif duraklatma açtı: dokunulmaz.
        let mut g = guard();
        g.arm(t0);
        let acts = run(&mut g, t0, &[(1.0, running()), (2.0, running()), (30.0, stuck()), (31.0, stuck()), (32.0, stuck())]);
        assert_eq!(acts, vec![(2.0, Act::Disarmed("sim akıyor; aktif duraklatma yok"))]);

        // Uçağın başına geçildikten sonra pencere bitti: olay açılmaz.
        let mut g = guard();
        g.arm(t0);
        let late = WINDOW.as_secs_f64() + 5.0;
        let acts = run(&mut g, t0, &[(1.0, Sample { in_control: false, ..stuck() }), (2.0, Sample { active_pause: Some(true), ..running() }), (2.0 + late, stuck())]);
        // İlk kontrol örneği 2. sn'de: tek takılı örnek olay açmaz; pencere dışındaki örnek bekçiyi kapatır.
        assert_eq!(acts, vec![(2.0 + late, Act::Disarmed("başlatma penceresi bitti"))]);

        // Menüde, ESC'de ya da "Uçuşa hazır" ekranındayken sayılmaz; kontrol gelince sayılır.
        let mut g = guard();
        g.arm(t0);
        let acts = run(
            &mut g,
            t0,
            &[
                (1.0, Sample { in_control: false, ..stuck() }),
                (2.0, Sample { menu_paused: true, ..stuck() }),
                (3.0, Sample { in_flight: false, ..stuck() }),
                (4.0, stuck()),
                (5.0, stuck()),
            ],
        );
        assert_eq!(acts[0], (5.0, Act::Detected(Detection::Var)));

        // Uçak kıpırdıyorsa duraklatmada değildir: bekçi kapanır.
        let mut g = guard();
        g.arm(t0);
        let acts = run(&mut g, t0, &[(1.0, Sample { gs_kt: 12.0, ..stuck() })]);
        assert_eq!(acts, vec![(1.0, Act::Disarmed("uçak hareket ediyor"))]);

        // Uçağın başına hiç geçilmedi: süre dolunca kapanır.
        let mut g = guard();
        g.arm(t0);
        let acts = run(&mut g, t0, &[(ARM_MAX.as_secs_f64() + 1.0, Sample { in_control: false, ..stuck() })]);
        assert_eq!(acts, vec![(ARM_MAX.as_secs_f64() + 1.0, Act::Disarmed("başlatmadan sonra uçağın başına geçilmedi"))]);
    }

    #[test]
    fn pending_pause_off_survives_a_new_launch() {
        let t0 = Instant::now();
        let mut g = guard();
        g.arm(t0);
        let samples: Vec<(f64, Sample)> = [1.0, 2.0, 5.0, 8.0].iter().map(|t| (*t, stuck())).collect();
        let acts = run(&mut g, t0, &samples);
        assert_eq!(acts.last().unwrap().1, Act::Send { event: SimEvent::PauseOn, attempt: 3 });
        // PAUSE_ON'dan hemen sonra yeni başlatma: PAUSE_OFF yine gider (sim tam duraklatmada kalmasın).
        g.arm(secs(t0, 8.2));
        assert!(g.tick(secs(t0, 8.5)).is_empty());
        assert_eq!(g.tick(secs(t0, 9.1)), vec![Act::Send { event: SimEvent::PauseOff, attempt: 0 }]);
        assert!(g.tick(secs(t0, 10.0)).is_empty());
    }
}
