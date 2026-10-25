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
use std::time::{Duration, Instant};

use modstead_core::fsx;
use modstead_core::prelude::*;
use serde::Serialize;

use super::airports::{db, distance_nm};
use super::model::Stage;
use super::{Career, tracker::Phase};
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
    let (tele, checks) = {
        let live = career.live.lock().unwrap();
        let fresh = live.last_data.is_some_and(|t| t.elapsed() < Duration::from_secs(3));
        let req: Vec<bool> = live.checks.iter().filter(|c| c.required).map(|c| c.ok).collect();
        (live.telemetry.clone().filter(|_| fresh), (req.iter().filter(|ok| **ok).count(), req.len()))
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
pub const HUD_VERSION: &str = "0.1.0";
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
    file!("html_ui/icons/toolbar/ICON_TOOLBAR_MODSTEAD_CAREER.svg"),
    file!("html_ui/Textures/Menu/toolbar/ICON_TOOLBAR_MODSTEAD_CAREER.svg"),
];

/// Windows FILETIME (1601'den beri 100 ns).
fn filetime(unix_s: i64) -> u64 {
    ((unix_s + 11_644_473_600) as u64) * 10_000_000
}

#[derive(Serialize)]
struct LayoutEntry<'a> {
    path: &'a str,
    size: usize,
    date: u64,
}

fn layout(now: i64) -> String {
    let content: Vec<LayoutEntry> = FILES.iter().map(|(p, b)| LayoutEntry { path: p, size: b.len(), date: filetime(now) }).collect();
    serde_json::to_string_pretty(&serde_json::json!({ "content": content })).unwrap()
}

fn manifest() -> String {
    let total: usize = FILES.iter().map(|(_, b)| b.len()).sum();
    serde_json::to_string_pretty(&serde_json::json!({
        "dependencies": [],
        "content_type": "MISC",
        "title": TITLE,
        "manufacturer": CREATOR,
        "creator": CREATOR,
        "package_version": HUD_VERSION,
        "minimum_game_version": "1.0.0",
        "release_notes": { "neutral": { "LastUpdate": "", "OlderHistory": "" } },
        "total_package_size": format!("{total:020}"),
    }))
    .unwrap()
}

/// Kütüphanedeki paket bizim mi? (Başka bir şeyin üstüne yazmayalım, başka bir şeyi silmeyelim.)
fn ours(dir: &Path) -> Option<String> {
    let m: serde_json::Value = serde_json::from_slice(&fs::read(dir.join("manifest.json")).ok()?).ok()?;
    (m["title"] == TITLE && m["creator"] == CREATOR).then(|| m["package_version"].as_str().unwrap_or_default().to_string())
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
}

fn linked_in(s: &SimInstall, pkg: &Path) -> bool {
    let key = fsx::norm_key(pkg);
    s.containers().iter().any(|(_, dir)| {
        let p = dir.join(FOLDER);
        is_link(&p) && link_target(&p).is_some_and(|t| fsx::norm_key(&t) == key)
    })
}

pub fn status(game: &Msfs) -> HudStatus {
    let library = game.settings().library_path;
    let pkg = library.as_ref().map(|l| l.join(FOLDER));
    let version = pkg.as_deref().and_then(ours);
    let sims = game
        .sims()
        .into_iter()
        .filter(|s| s.usable())
        .map(|s| HudSim { linked: pkg.as_deref().is_some_and(|p| version.is_some() && linked_in(&s, p)), running: s.running, short: s.short.clone(), id: s.id })
        .collect();
    HudStatus { library: library.is_some(), installed: version.is_some(), version, latest: HUD_VERSION.into(), sims }
}

fn ensure_closed(sims: &[SimInstall]) -> AppResult<()> {
    for s in sims.iter().filter(|s| s.usable()) {
        linker::ensure_not_running(s)?;
    }
    Ok(())
}

/// Paketi kütüphaneye yazar (varsa günceller) ve kullanılabilir bütün simlere bağlar. Simler kapalı olmalı.
pub fn install(game: &Msfs) -> AppResult<HudStatus> {
    let sims = game.sims();
    ensure_closed(&sims)?;
    let library = game.library()?;
    let pkg = library.join(FOLDER);
    if pkg.exists() && ours(&pkg).is_none() {
        return Err(AppError::msg(tr!(
            format!("Kütüphanede '{FOLDER}' adında başka bir klasör var; dokunulmadı."),
            format!("The library already has another folder named '{FOLDER}'; it was left untouched.")
        )));
    }
    // Önce yanına yazılır, sonra yer değiştirilir: yarım paket bağlı kalmasın.
    let staging = library.join(format!(".{FOLDER}.new"));
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    for (rel, bytes) in FILES {
        let path = staging.join(rel);
        fs::create_dir_all(path.parent().unwrap())?;
        fs::write(&path, bytes)?;
    }
    fs::write(staging.join("layout.json"), layout(fsx::now_ts()))?;
    fs::write(staging.join("manifest.json"), manifest())?;
    if pkg.exists() {
        fs::remove_dir_all(&pkg)?;
    }
    fs::rename(&staging, &pkg)?;
    for s in sims.iter().filter(|s| s.usable()) {
        linker::enable(&sims, &library, &pkg, "any", &s.id)?;
    }
    log::info!("kariyer HUD paketi kuruldu: {}", pkg.display());
    Ok(status(game))
}

/// Bağlantıları kaldırır ve kütüphanedeki paketi siler (yalnızca bizimse).
pub fn remove(game: &Msfs) -> AppResult<HudStatus> {
    let sims = game.sims();
    ensure_closed(&sims)?;
    let library = game.library()?;
    let pkg: PathBuf = library.join(FOLDER);
    if ours(&pkg).is_some() {
        for s in sims.iter().filter(|s| s.usable()) {
            linker::disable(&sims, &library, &pkg, &s.id)?;
        }
        fs::remove_dir_all(&pkg)?;
        log::info!("kariyer HUD paketi kaldırıldı");
    }
    Ok(status(game))
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
    fn package_files_are_consistent() {
        let html = std::str::from_utf8(FILES[1].1).unwrap();
        assert!(html.contains("panel-id=\"PANEL_MODSTEAD_CAREER\"") && html.contains("ingamepanel-modstead"));
        // .spb dosya kimliği ve içindeki adlar (metinler kodlu; boyutu kaynakla tutarlı).
        assert_eq!(&FILES[0].1[..2], &[0xAC, 0xEB]);
        assert_eq!(FILES[0].1.len(), 698);
        let l: serde_json::Value = serde_json::from_str(&layout(1_700_000_000)).unwrap();
        assert_eq!(l["content"].as_array().unwrap().len(), FILES.len());
        assert_eq!(l["content"][0]["date"], 133_444_736_000_000_000u64);
        let m: serde_json::Value = serde_json::from_str(&manifest()).unwrap();
        assert_eq!(m["package_version"], HUD_VERSION);
        assert_eq!(m["total_package_size"].as_str().unwrap().len(), 20);
    }
}
