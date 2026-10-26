//! Sim içi HUD: Modstead'e bağlı bir araç çubuğu paneli (MSFS 2020 SU12+ ve 2024; VR ve tam ekranda da görünür).
//!
//! Veri yolu: Modstead açık SimConnect bağlantısından saniyede bir `L:MODSTEAD_HUD_*` yerel değişkenlerini yazar
//! (`AddToDataDefinition` + `SetDataOnSimObject`); panel bunları okur. Yeni port, bağımlılık ya da enjeksiyon yok.
//! Panel hiçbir şey hesaplamaz: `SEQ` birkaç saniye artmazsa "Modstead bağlı değil" der. Kariyer Modstead olmadan
//! çalışmaz, panel de öyle.
//!
//! Paket (`games/msfs/hud/package`) uygulamaya gömülüdür. Kurulunca kütüphaneye yazılır, `layout.json` ve
//! `manifest.json` o an üretilir ve paket simlerin Community klasörüne bağlanır (diğer modlarla aynı yol). Panel
//! tanımı (`InGamePanels/*.spb`) bir kez derlendi; kaynağı `hud/source/modstead-career-hud.xml`.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering::SeqCst;
use std::time::{Duration, Instant};

use modstead_core::fsx;
use modstead_core::prelude::*;
use serde::Serialize;

use super::airports::{db, distance_nm};
use super::model::Stage;
use super::{Career, Check, tracker::Phase};
use crate::sims::SimInstall;
use crate::util::{is_link, link_target};
use crate::{Msfs, linker};

/// Panel değişkenleri; sıra = yazılan verinin sırası. Panel (`ModsteadCareer.js`) aynı adları okur.
pub const FIELDS: &[&str] = &[
    "SEQ",
    "STATE",
    "PHASE",
    "FROM",
    "TO",
    "DIST_NM",
    "TOTAL_NM",
    "ETA_MIN",
    "SCORE",
    "LAND_FPM",
    "LAND_G",
    "PAY",
    "DUE_MIN",
    "LANG",
    "KIND",
    "CHECKS_OK",
    "CHECKS_TOTAL",
    "EVENTS",
    "CHECK_LIST",
];

pub fn var_name(field: &str) -> String {
    format!("L:MODSTEAD_HUD_{field}")
}

/// Panelin gösterdiği durum.
mod state {
    pub const NO_CAREER: f64 = 0.0;
    pub const IDLE: f64 = 1.0;
    pub const PREPARING: f64 = 2.0;
    pub const READY: f64 = 3.0;
    pub const FLYING: f64 = 4.0;
    pub const INTERRUPTED: f64 = 5.0;
}

const KINDS: &[&str] = &["training", "cargo", "passenger", "charter", "ferry", "bush", "medical", "airline", "checkride"];

/// Kontrol kapısının sabit sırası (`engine.rs` → `emit_live` kimlikleri). Panel (`MS_CHECK_IDS`) aynı sırayı kullanır.
pub const CHECK_IDS: &[&str] = &["connected", "in_flight", "at_departure", "aircraft", "slew", "fuel", "payload"];

/// Kontrol kapısı tek sayıda: `CHECK_IDS` sırasıyla her kontrol taban-4 bir basamak, küçük basamak önce
/// (0 yok, 1 tamam, 2 eksik, 3 eksik ama yalnızca öneri). Bilinmeyen kimlik atlanır.
pub fn check_list(checks: &[Check]) -> f64 {
    let mut v = 0.0;
    for c in checks {
        if let Some(i) = CHECK_IDS.iter().position(|id| *id == c.id) {
            let d = if c.ok { 1.0 } else if c.required { 2.0 } else { 3.0 };
            v += d * 4f64.powi(i as i32);
        }
    }
    v
}

/// ICAO kodu sayıya: rakamlar 1–10, harfler 11–36, küçük basamak önce (9 karaktere kadar f64'te kesin).
pub fn icao_code(s: &str) -> f64 {
    let mut v = 0.0;
    let mut k = 1.0;
    for c in s.chars().take(9) {
        let d = match c.to_ascii_uppercase() {
            c @ '0'..='9' => c as u32 - '0' as u32 + 1,
            c @ 'A'..='Z' => c as u32 - 'A' as u32 + 11,
            _ => continue,
        };
        v += d as f64 * k;
        k *= 37.0;
    }
    v
}

fn phase_index(p: Phase) -> f64 {
    match p {
        Phase::Preflight => 0.0,
        Phase::TaxiOut => 1.0,
        Phase::Takeoff => 2.0,
        Phase::Climb => 3.0,
        Phase::Cruise => 4.0,
        Phase::Descent => 5.0,
        Phase::Approach => 6.0,
        Phase::Rollout => 7.0,
        Phase::TaxiIn => 8.0,
        Phase::Parked => 9.0,
    }
}

/// O anki değerler (`FIELDS` sırasıyla).
pub fn values(career: &Career, seq: u32) -> Vec<f64> {
    let mut v = vec![0.0; FIELDS.len()];
    let set = |v: &mut Vec<f64>, name: &str, x: f64| {
        if let Some(i) = FIELDS.iter().position(|f| *f == name) {
            v[i] = x;
        }
    };
    set(&mut v, "SEQ", seq as f64);
    set(&mut v, "LANG", if modstead_core::i18n::is_en() { 1.0 } else { 0.0 });
    set(&mut v, "PHASE", -1.0);
    set(&mut v, "SCORE", -1.0);
    set(&mut v, "ETA_MIN", -1.0);

    // Kilitler sırayla alınır (iç içe değil): önce canlı durum, sonra kalıcı veri.
    let (tele, checks, list) = {
        let live = career.live.lock().unwrap();
        let fresh = live.last_data.is_some_and(|t| t.elapsed() < Duration::from_secs(3));
        let req: Vec<bool> = live.checks.iter().filter(|c| c.required).map(|c| c.ok).collect();
        (live.telemetry.clone().filter(|_| fresh), (req.iter().filter(|ok| **ok).count(), req.len()), check_list(&live.checks))
    };
    let d = career.lock_data();
    if d.pilot.is_none() {
        set(&mut v, "STATE", state::NO_CAREER);
        return v;
    }
    let Some(a) = &d.active else {
        set(&mut v, "STATE", state::IDLE);
        return v;
    };
    let tracker = a.tracker.as_ref();
    let flying = tracker.is_some_and(|t| t.started());
    set(
        &mut v,
        "STATE",
        match a.stage {
            Stage::Interrupted => state::INTERRUPTED,
            _ if flying => state::FLYING,
            Stage::Ready => state::READY,
            _ => state::PREPARING,
        },
    );
    set(&mut v, "FROM", icao_code(&a.job.from));
    set(&mut v, "TO", icao_code(&a.job.to));
    set(&mut v, "KIND", KINDS.iter().position(|k| *k == a.job.kind).unwrap_or(1) as f64);
    set(&mut v, "PAY", a.job.pay as f64);
    set(&mut v, "DUE_MIN", ((a.deadline_at - fsx::now_ts()) as f64 / 60.0).floor());
    set(&mut v, "TOTAL_NM", a.job.distance_nm);
    set(&mut v, "CHECKS_OK", checks.0 as f64);
    set(&mut v, "CHECKS_TOTAL", checks.1 as f64);
    set(&mut v, "CHECK_LIST", list);

    let dest = db().get(&a.job.to);
    let remaining = match (&tele, dest) {
        (Some(t), Some(dest)) => distance_nm(t.lat, t.lon, dest.lat, dest.lon),
        _ => a.job.distance_nm,
    };
    set(&mut v, "DIST_NM", remaining);
    match &tele {
        // Havadayken yer hızından; yerdeyken planlanan blok süresinin kalanı.
        Some(t) if !t.on_ground && t.gs_kt > 40.0 => set(&mut v, "ETA_MIN", remaining / t.gs_kt * 60.0),
        _ if a.job.distance_nm > 0.0 => set(&mut v, "ETA_MIN", a.job.plan.block_min * remaining / a.job.distance_nm),
        _ => {}
    }
    if let Some(tr) = tracker {
        set(&mut v, "PHASE", phase_index(tr.phase));
        set(&mut v, "SCORE", tr.summary().score as f64);
        set(&mut v, "EVENTS", tr.events.iter().filter(|e| e.penalty > 0).count() as f64);
        if let Some(l) = tr.landings.last() {
            set(&mut v, "LAND_FPM", l.fpm);
            set(&mut v, "LAND_G", l.g);
        }
    }
    v
}

/// Bağlantı başına HUD yazımı (engine tarafından sürülür).
#[derive(Debug)]
pub struct Feed {
    /// Tanımları sim kabul etti mi (2020 SU12 öncesi L: değişkenlerini tanımaz).
    pub ok: bool,
    pub defs: Vec<u32>,
    pub seq: u32,
    pub at: Option<Instant>,
}

impl Default for Feed {
    fn default() -> Self {
        Feed { ok: true, defs: Vec::new(), seq: 0, at: None }
    }
}

impl Feed {
    pub fn due(&self) -> bool {
        self.ok && self.at.is_none_or(|t| t.elapsed() >= Duration::from_millis(1000))
    }

    pub fn encode(values: &[f64]) -> Vec<u8> {
        values.iter().flat_map(|x| x.to_le_bytes()).collect()
    }
}

// --- Paket ------------------------------------------------------------------------------------------------------

/// Kütüphanedeki klasör adı (Community'de de bu adla bağlanır).
pub const FOLDER: &str = "modstead-career-hud";
/// Paket sürümü: panel dosyaları değişince artırılır; kurulu sürüm eskiyse arayüz güncelleme önerir.
pub const HUD_VERSION: &str = "0.3.0";
const TITLE: &str = "Modstead Career HUD";
const CREATOR: &str = "Modstead";

macro_rules! file {
    ($path:literal) => {
        ($path, include_bytes!(concat!("../../hud/package/", $path)) as &[u8])
    };
}

const FILES: &[(&str, &[u8])] = &[
    file!("InGamePanels/modstead-career-hud.spb"),
    file!("html_ui/InGamePanels/ModsteadCareer/ModsteadCareer.html"),
    file!("html_ui/InGamePanels/ModsteadCareer/ModsteadCareer.js"),
    file!("html_ui/InGamePanels/ModsteadCareer/ModsteadCareer.css"),
    // Yükleyici: kodu ve görünümü Modstead'in yerel sunucusundan alır (bkz. `hud_server`), yoksa paketteki kopyayı.
    file!("html_ui/InGamePanels/ModsteadCareer/ModsteadLoader.js"),
    file!("html_ui/icons/toolbar/ICON_TOOLBAR_MODSTEAD_CAREER.svg"),
    file!("html_ui/Textures/Menu/toolbar/ICON_TOOLBAR_MODSTEAD_CAREER.svg"),
];

/// Paneldeki bir dosyanın gömülü içeriği (`ModsteadCareer.js` gibi; yerel sunucu bunları sunar).
pub fn panel_file(name: &str) -> &'static [u8] {
    FILES.iter().find(|(p, _)| p.rsplit('/').next() == Some(name)).map(|(_, b)| *b).unwrap_or_default()
}

/// Windows FILETIME (1601'den beri 100 ns).
fn filetime(unix_s: i64) -> u64 {
    ((unix_s + 11_644_473_600) as u64) * 10_000_000
}

/// Modstead'in sime kurduğu bir paket: araç çubuğu paneli ya da ana menü kutusu (`career::menu`). Kütüphaneye
/// yazılır ve simlerin Community klasörüne bağlanır; simler kapalıyken (sim paketleri yalnızca açılışta okur ve
/// oyun açıkken mod klasörüne yazılmaz).
pub struct SimPackage {
    /// Kütüphanedeki klasör adı (Community'de de bu adla bağlanır).
    pub folder: &'static str,
    pub title: &'static str,
    /// Paket sürümü: dosyalar değişince artırılır; kurulu sürüm eskiyse arayüz güncelleme önerir.
    pub version: &'static str,
    pub files: &'static [(&'static str, &'static [u8])],
    /// Yalnızca MSFS 2024'e bağlanır (ana menü 2020'de başka).
    pub only_2024: bool,
    /// "Sim kapanınca kur" bekliyor mu.
    pub queued: AtomicBool,
    /// Günlükte ve bildirimde görünen ad.
    pub label: (&'static str, &'static str),
    /// Kurulumda kullanıcının simden üretilen dosyalar (ana menü kutusu simin kendi bileşeninin kopyasını
    /// kullanır; depoda simin dosyası yoktur). Hata dönerse kurulum yapılmaz.
    pub generate: Option<fn(&Msfs) -> AppResult<Vec<(String, Vec<u8>)>>>,
}

pub static HUD: SimPackage = SimPackage {
    folder: FOLDER,
    title: TITLE,
    version: HUD_VERSION,
    files: FILES,
    only_2024: false,
    queued: AtomicBool::new(false),
    label: ("sim içi panel", "in-sim panel"),
    generate: None,
};

#[derive(Serialize)]
struct LayoutEntry<'a> {
    path: &'a str,
    size: usize,
    date: u64,
}

impl SimPackage {
    /// Paketin bütün dosyaları: gömülü olanlar ve kurulumda üretilenler.
    fn contents(&self, game: Option<&Msfs>) -> AppResult<Vec<(String, Vec<u8>)>> {
        let mut out: Vec<(String, Vec<u8>)> = self.files.iter().map(|(p, b)| (p.to_string(), b.to_vec())).collect();
        if let (Some(f), Some(g)) = (self.generate, game) {
            out.extend(f(g)?);
        }
        Ok(out)
    }

    fn layout_of(files: &[(String, Vec<u8>)], now: i64) -> String {
        let content: Vec<LayoutEntry> = files.iter().map(|(p, b)| LayoutEntry { path: p, size: b.len(), date: filetime(now) }).collect();
        serde_json::to_string_pretty(&serde_json::json!({ "content": content })).unwrap()
    }

    #[cfg(test)]
    fn layout(&self, now: i64) -> String {
        Self::layout_of(&self.contents(None).unwrap(), now)
    }

    #[cfg(test)]
    fn manifest(&self) -> String {
        self.manifest_of(&self.contents(None).unwrap())
    }

    fn manifest_of(&self, files: &[(String, Vec<u8>)]) -> String {
        let total: usize = files.iter().map(|(_, b)| b.len()).sum();
        serde_json::to_string_pretty(&serde_json::json!({
            "dependencies": [],
            "content_type": "MISC",
            "title": self.title,
            "manufacturer": CREATOR,
            "creator": CREATOR,
            "package_version": self.version,
            "minimum_game_version": "1.0.0",
            "release_notes": { "neutral": { "LastUpdate": "", "OlderHistory": "" } },
            "total_package_size": format!("{total:020}"),
        }))
        .unwrap()
    }

    /// Kütüphanedeki paket bizim mi? (Başka bir şeyin üstüne yazmayalım, başka bir şeyi silmeyelim.)
    fn ours(&self, dir: &Path) -> Option<String> {
        let m: serde_json::Value = serde_json::from_slice(&fs::read(dir.join("manifest.json")).ok()?).ok()?;
        (m["title"] == self.title && m["creator"] == CREATOR).then(|| m["package_version"].as_str().unwrap_or_default().to_string())
    }

    /// Bu paketin bağlanacağı simler.
    fn targets(&self, sims: &[SimInstall]) -> Vec<SimInstall> {
        sims.iter().filter(|s| s.usable() && (!self.only_2024 || s.id == crate::sims::SIM_2024)).cloned().collect()
    }

    fn linked_in(&self, s: &SimInstall, pkg: &Path) -> bool {
        let key = fsx::norm_key(pkg);
        s.containers().iter().any(|(_, dir)| {
            let p = dir.join(self.folder);
            is_link(&p) && link_target(&p).is_some_and(|t| fsx::norm_key(&t) == key)
        })
    }

    /// Kütüphanedeki paket klasörü (kütüphane seçiliyse).
    pub fn dir(&self, game: &Msfs) -> Option<PathBuf> {
        game.settings().library_path.map(|l| l.join(self.folder))
    }

    pub fn status(&self, game: &Msfs) -> HudStatus {
        let library = game.settings().library_path;
        let pkg = library.as_ref().map(|l| l.join(self.folder));
        let version = pkg.as_deref().and_then(|p| self.ours(p));
        let sims = self
            .targets(&game.sims())
            .into_iter()
            .map(|s| HudSim { linked: pkg.as_deref().is_some_and(|p| version.is_some() && self.linked_in(&s, p)), running: s.running, short: s.short.clone(), id: s.id })
            .collect();
        HudStatus { library: library.is_some(), installed: version.is_some(), version, latest: self.version.into(), sims, queued: self.queued.load(SeqCst) }
    }

    /// Paketi kütüphaneye yazar (varsa günceller) ve simlere bağlar. Simler kapalı olmalı.
    pub fn install(&self, game: &Msfs) -> AppResult<HudStatus> {
        let sims = game.sims();
        ensure_closed(&sims)?;
        let library = game.library()?;
        let folder = self.folder;
        let pkg = library.join(folder);
        if pkg.exists() && self.ours(&pkg).is_none() {
            return Err(AppError::msg(tr!(
                format!("Kütüphanede '{folder}' adında başka bir klasör var; dokunulmadı."),
                format!("The library already has another folder named '{folder}'; it was left untouched.")
            )));
        }
        // Önce yanına yazılır, sonra yer değiştirilir: yarım paket bağlı kalmasın.
        let staging = library.join(format!(".{folder}.new"));
        if staging.exists() {
            fs::remove_dir_all(&staging)?;
        }
        let files = self.contents(Some(game))?;
        for (rel, bytes) in &files {
            let path = staging.join(rel);
            fs::create_dir_all(path.parent().unwrap())?;
            fs::write(&path, bytes)?;
        }
        fs::write(staging.join("layout.json"), Self::layout_of(&files, fsx::now_ts()))?;
        fs::write(staging.join("manifest.json"), self.manifest_of(&files))?;
        if pkg.exists() {
            fs::remove_dir_all(&pkg)?;
        }
        fs::rename(&staging, &pkg)?;
        for s in self.targets(&sims) {
            linker::enable(&sims, &library, &pkg, "any", &s.id)?;
        }
        game.career().note("paket", format!("{} kuruldu: {} ({})", self.label.0, pkg.display(), self.version));
        Ok(self.status(game))
    }

    /// Bağlantıları kaldırır ve kütüphanedeki paketi siler (yalnızca bizimse).
    pub fn remove(&self, game: &Msfs) -> AppResult<HudStatus> {
        let sims = game.sims();
        ensure_closed(&sims)?;
        let library = game.library()?;
        let pkg: PathBuf = library.join(self.folder);
        if self.ours(&pkg).is_some() {
            for s in self.targets(&sims) {
                linker::disable(&sims, &library, &pkg, &s.id)?;
            }
            fs::remove_dir_all(&pkg)?;
            game.career().note("paket", format!("{} kaldırıldı", self.label.0));
        }
        Ok(self.status(game))
    }

    /// "Sim kapanınca kur"u açar ya da kapatır. Bir arka plan iş parçacığı simleri 5 saniyede bir yoklar.
    pub fn queue(&'static self, game: &Msfs, on: bool) -> HudStatus {
        if !on {
            self.queued.store(false, SeqCst);
        } else if !self.queued.swap(true, SeqCst) {
            let g = game.clone();
            g.career().note("paket", format!("{}: sim kapanınca kurulacak", self.label.0));
            std::thread::spawn(move || {
                while self.queued.load(SeqCst) {
                    std::thread::sleep(Duration::from_secs(5));
                    if !self.queued.load(SeqCst) || g.sims().iter().any(|s| s.usable() && s.running) {
                        continue;
                    }
                    // Sim kapanır kapanmaz dosyaları hâlâ tutuyor olabilir: kısa bir bekleme.
                    std::thread::sleep(Duration::from_secs(3));
                    match self.install(&g) {
                        Ok(_) => g.services.notify(
                            Tone::Ok,
                            tr!(format!("Kuruldu: {}", self.label.0), format!("Installed: {}", self.label.1)),
                            Some(tr!("Simi açınca yeni hali görünecek.", "It shows up the next time you start the sim.").to_string()),
                        ),
                        Err(e) => g.career().note("paket", format!("{}: sim kapandı ama kurulamadı: {e}", self.label.0)),
                    }
                    self.queued.store(false, SeqCst);
                    g.rescan();
                    g.changed();
                }
            });
        }
        self.status(game)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudSim {
    pub id: String,
    pub short: String,
    pub linked: bool,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HudStatus {
    /// Kütüphane klasörü seçili mi (kurulum için gerekli).
    pub library: bool,
    pub installed: bool,
    pub version: Option<String>,
    pub latest: String,
    pub sims: Vec<HudSim>,
    /// "Sim kapanınca kur" bekliyor mu.
    pub queued: bool,
}

fn ensure_closed(sims: &[SimInstall]) -> AppResult<()> {
    for s in sims.iter().filter(|s| s.usable()) {
        linker::ensure_not_running(s)?;
    }
    Ok(())
}

pub fn status(game: &Msfs) -> HudStatus {
    HUD.status(game)
}

pub fn install(game: &Msfs) -> AppResult<HudStatus> {
    HUD.install(game)
}

pub fn remove(game: &Msfs) -> AppResult<HudStatus> {
    HUD.remove(game)
}

pub fn queue(game: &Msfs, on: bool) -> HudStatus {
    HUD.queue(game, on)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icao_codes_round_trip_like_the_panel() {
        // Panel (ModsteadCareer.js · msDecodeIcao) ile aynı çözüm.
        let decode = |v: f64| {
            let mut n = v as u64;
            let mut out = String::new();
            while n > 0 {
                let d = (n % 37) as u8;
                out.push(if d <= 10 { (47 + d) as char } else { (54 + d) as char });
                n /= 37;
            }
            out
        };
        for icao in ["LTBA", "KJFK", "EGLL", "00AK", "Y8U", "LTFM9ZZ"] {
            assert_eq!(decode(icao_code(icao)), icao);
        }
        assert_eq!(icao_code(""), 0.0);
    }

    #[test]
    fn panel_reads_every_field() {
        let js = std::str::from_utf8(FILES.iter().find(|(p, _)| p.ends_with(".js")).unwrap().1).unwrap();
        for f in FIELDS {
            assert!(js.contains(&format!("\"{f}\"")), "panel {f} alanını okumuyor");
        }
        assert!(js.contains("L:MODSTEAD_HUD_"));
    }

    #[test]
    fn check_list_matches_the_panel() {
        let c = |id: &str, ok: bool, required: bool| Check { id: id.into(), ok, required, detail: String::new() };
        let v = check_list(&[c("connected", true, true), c("at_departure", false, true), c("fuel", false, false), c("other", false, true)]);
        // Panel gibi çöz: basamak başına 0 yok, 1 tamam, 2 eksik, 3 öneri.
        let mut n = v as u64;
        let digits: Vec<u64> = (0..CHECK_IDS.len()).map(|_| { let d = n % 4; n /= 4; d }).collect();
        assert_eq!(digits, [1, 0, 2, 0, 0, 3, 0]);
        assert_eq!(check_list(&[]), 0.0);
        // Panel aynı sırayı kullanmalı.
        let js = std::str::from_utf8(FILES.iter().find(|(p, _)| p.ends_with(".js")).unwrap().1).unwrap();
        let ids = CHECK_IDS.iter().map(|id| format!("\"{id}\"")).collect::<Vec<_>>().join(", ");
        assert!(js.contains(&format!("var MS_CHECK_IDS = [{ids}];")), "panelin kontrol sırası CHECK_IDS ile aynı değil");
    }

    /// Simin motoru panel betiğinde tek bir sözdizimi hatasında bütün paneli boş bırakır (ilk gerçek denemede bir
    /// dizgedeki satır sonu yüzünden böyle oldu). Kaba bir tarayıcı: yorumları atlar, dizgeleri izler.
    #[test]
    fn panel_script_strings_and_brackets_are_closed() {
        let js = std::str::from_utf8(FILES.iter().find(|(p, _)| p.ends_with(".js")).unwrap().1).unwrap();
        assert!(!js.contains('`'), "şablon dizgesi (ES2015 sonrası araçlarla karışır) kullanılmasın");
        // Kaçış dizisi yerine bayt değerleri: satır sonu, ters bölü, tek ve çift tırnak.
        const NL: u8 = 10;
        const BS: u8 = 92;
        const SQ: u8 = 39;
        const DQ: u8 = 34;
        let b = js.as_bytes();
        let (mut i, mut line) = (0, 1);
        let mut stack: Vec<(u8, usize)> = Vec::new();
        while i < b.len() {
            match b[i] {
                NL => line += 1,
                b'/' if b.get(i + 1) == Some(&b'/') => {
                    while i < b.len() && b[i] != NL {
                        i += 1;
                    }
                    continue;
                }
                b'/' if b.get(i + 1) == Some(&b'*') => {
                    let end = js[i + 2..].find("*/").expect("kapanmayan yorum");
                    line += js.as_bytes()[i..i + 2 + end].iter().filter(|c| **c == NL).count();
                    i += end + 4;
                    continue;
                }
                q @ (SQ | DQ) => {
                    let start = line;
                    i += 1;
                    while b[i] != q {
                        assert!(b[i] != NL, "{start}. satırdaki dizge satır sonunda kapanmıyor");
                        i += if b[i] == BS { 2 } else { 1 };
                    }
                }
                o @ (b'(' | b'[' | b'{') => stack.push((o, line)),
                c @ (b')' | b']' | b'}') => {
                    let (o, at) = stack.pop().unwrap_or_else(|| panic!("{line}. satırda fazladan '{}'", c as char));
                    let want = match o {
                        b'(' => b')',
                        b'[' => b']',
                        _ => b'}',
                    };
                    assert_eq!(c, want, "{at}. satırda açılan parantez {line}. satırda yanlış kapanıyor");
                }
                _ => {}
            }
            i += 1;
        }
        assert!(stack.is_empty(), "kapanmayan parantez: {:?}", stack.last());
    }

    #[test]
    fn package_files_are_consistent() {
        let html = std::str::from_utf8(FILES[1].1).unwrap();
        assert!(html.contains("panel-id=\"PANEL_MODSTEAD_CAREER\"") && html.contains("ingamepanel-modstead"));
        // Kod ve görünüm yükleyiciyle gelir (yerel sunucu ya da paketteki kopya); yükleyici aynı portları dener.
        assert!(html.contains("src=\"ModsteadLoader.js\"") && !html.contains("src=\"ModsteadCareer.js\""));
        let loader = std::str::from_utf8(panel_file("ModsteadLoader.js")).unwrap();
        let ports = super::super::hud_server::PORTS.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", ");
        assert!(loader.contains(&format!("var PORTS = [{ports}];")), "yükleyicinin portları sunucuyla aynı değil");
        assert!(loader.contains("\"ModsteadCareer.js\"") && loader.contains("\"ModsteadCareer.css\""));
        // .spb dosya kimliği ve içindeki adlar (metinler kodlu; boyutu kaynakla tutarlı).
        assert_eq!(&FILES[0].1[..2], &[0xAC, 0xEB]);
        assert_eq!(FILES[0].1.len(), 698);
        let l: serde_json::Value = serde_json::from_str(&HUD.layout(1_700_000_000)).unwrap();
        assert_eq!(l["content"].as_array().unwrap().len(), FILES.len());
        assert_eq!(l["content"][0]["date"], 133_444_736_000_000_000u64);
        let m: serde_json::Value = serde_json::from_str(&HUD.manifest()).unwrap();
        assert_eq!(m["package_version"], HUD_VERSION);
        assert_eq!(m["total_package_size"].as_str().unwrap().len(), 20);
    }
}
