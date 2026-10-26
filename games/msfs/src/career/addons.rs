//! Mod uçakları: Modstead'in kütüphanesindeki ve simlerin Community klasörlerindeki paketlerde bulunan uçaklar
//! (topluluk ve üçüncü parti eklentiler: Fenix, PMDG, iniBuilds, FlyByWire, Just Flight, Black Square…).
//!
//! Simin kendi listesi (`EnumerateSimObjectsAndLiveries`) yalnızca MSFS 2024'te ve sim açıkken gelir; uçağın
//! değerleri de ancak uçağa binilince öğrenilir. Bu modül paketlerin dosyalarını **salt okunur** okuyarak mod
//! uçaklarını sim kapalıyken ve 2020'de de seçilebilir kılar: başlık, boyalar, ICAO tip kodu, motor türü ve sayısı,
//! azami ağırlıklar, yakıt kapasitesi, seyir hızı, kendi EFB'si olup olmadığı ve küçük resmi. Hiçbir dosya
//! çalıştırılmaz, hiçbir yere yazılmaz; paketin içindeki bağlantılar (junction, symlink) izlenmez, ek yolları
//! `fsx::resolve_under` ile paket klasörüne kilitlenir.
//!
//! Okunan biçimler:
//! - **2020 (ve 2024'teki eski biçim):** `SimObjects/Airplanes|Rotorcraft/<klasör>/aircraft.cfg` — her
//!   `[FLTSIM.n]` simde ayrı bir başlıktır; `[GENERAL]` ICAO alanları; yanındaki `flight_model.cfg` ve `engines.cfg`
//!   (çok eski uçaklarda hepsi `aircraft.cfg`'de). Boya paketleri `[VARIATION] base_container = "..\Taban"` ile
//!   tabanın değerlerini alır. Küçük resim `texture.<boya>/thumbnail.jpg`.
//! - **2024 modüler:** başlık `presets/<geliştirici>/<ön ayar>/config/aircraft.cfg`'de; değerler ön ayarın
//!   `attached_objects.cfg`'indeki eklerden (`attachment_root`; ekin `attachment.cfg` → `[Inherit] base`,
//!   `[Tags] tag.n`) ve `common/config`'ten birleştirilir (önce ön ayar, sonra ekler, en son ortak). Boyalar
//!   `liveries/<geliştirici>/<boya>/livery.cfg` (`[GENERAL] name`, `[SELECTION] required_tags`); başka paketlerin
//!   aynı uçak klasörüne eklediği boyalar da sayılır. Küçük resim boyanın `thumbnail/thumbnail.png`'i.
//!
//! Sonuç süreç boyunca tek bir dizinde durur (`index`): bağlantı iş parçacığı (`engine`) uçağın kendi EFB'si olup
//! olmadığını (`aircraft::manages_own_loading`) ve sınıfını (`Career::class_of`) buradan da öğrenir.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::SystemTime;

use modstead_core::fsx;
use modstead_core::prelude::*;
use serde::{Deserialize, Serialize};

use super::aircraft::{self, Class, Confidence, Inference, SimSpecs};
use super::model::CareerData;
use super::{AircraftOption, Career, families};

/// Bir cfg dosyası için üst sınır: gerçek dosyalar birkaç yüz KB'yi geçmez.
const MAX_CFG: u64 = 4 * 1024 * 1024;
/// Küçük resim için üst sınır (arayüze ham bayt olarak gider).
const MAX_THUMB: u64 = 8 * 1024 * 1024;
/// Ek kalıtım zincirinin en çok derinliği (döngüye karşı da `seen` var).
const MAX_INHERIT: usize = 8;

// ---------- cfg (INI benzeri) ayrıştırıcı ----------

/// MSFS'in `.cfg` dosyası: `[bölüm]` + `anahtar = değer`. Bölüm ve anahtar adları küçük harfe çevrilir; `;`, `//`
/// ve `#` ile başlayan satırlar ve tırnak dışındaki satır sonu yorumları atılır; değerin çevresindeki tırnaklar
/// soyulur. Aynı bölüm iki kez yazılmışsa birleşir, aynı anahtarda sonuncusu geçerlidir (simin davranışı).
#[derive(Debug, Clone, Default)]
pub struct Cfg {
    sections: Vec<(String, Vec<(String, String)>)>,
}

impl Cfg {
    pub fn parse(text: &str) -> Cfg {
        let mut cfg = Cfg::default();
        let mut cur: Option<usize> = None;
        for raw in text.trim_start_matches('\u{feff}').lines() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with(';') || line.starts_with("//") || line.starts_with('#') {
                continue;
            }
            if let Some(rest) = line.strip_prefix('[') {
                if let Some(end) = rest.find(']') {
                    let name = rest[..end].trim().to_ascii_lowercase();
                    cur = Some(match cfg.sections.iter().position(|(n, _)| *n == name) {
                        Some(i) => i,
                        None => {
                            cfg.sections.push((name, Vec::new()));
                            cfg.sections.len() - 1
                        }
                    });
                }
                continue;
            }
            // Bölümden önceki satırlar yok sayılır.
            let Some(i) = cur else { continue };
            let Some((k, v)) = line.split_once('=') else { continue };
            let key = k.trim().to_ascii_lowercase();
            if key.is_empty() {
                continue;
            }
            let value = clean_value(v);
            let entries = &mut cfg.sections[i].1;
            match entries.iter_mut().find(|(kk, _)| *kk == key) {
                Some(e) => e.1 = value,
                None => entries.push((key, value)),
            }
        }
        cfg
    }

    /// Boş olmayan değer.
    pub fn get(&self, section: &str, key: &str) -> Option<&str> {
        self.section(section)?.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str()).filter(|v| !v.is_empty())
    }

    pub fn section(&self, name: &str) -> Option<&[(String, String)]> {
        self.sections.iter().find(|(n, _)| n == name).map(|(_, e)| e.as_slice())
    }

    pub fn sections(&self) -> impl Iterator<Item = (&str, &[(String, String)])> {
        self.sections.iter().map(|(n, e)| (n.as_str(), e.as_slice()))
    }

    /// `[fltsim.0]`, `[fltsim.1]`… sıralı.
    fn fltsims(&self) -> Vec<&[(String, String)]> {
        let mut v: Vec<(u32, &[(String, String)])> = self
            .sections()
            .filter_map(|(n, e)| n.strip_prefix("fltsim.").and_then(|i| i.trim().parse::<u32>().ok()).map(|i| (i, e)))
            .collect();
        v.sort_by_key(|(i, _)| *i);
        v.into_iter().map(|(_, e)| e).collect()
    }
}

fn entry<'a>(entries: &'a [(String, String)], key: &str) -> Option<&'a str> {
    entries.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str()).filter(|v| !v.is_empty())
}

/// Satır sonu yorumunu (tırnak dışındaki `;` ya da `//`) ve çevreleyen tırnakları atar.
fn clean_value(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    let mut in_quote = false;
    let mut chars = v.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '"' {
            in_quote = !in_quote;
        } else if !in_quote && (c == ';' || (c == '/' && chars.peek() == Some(&'/'))) {
            break;
        }
        out.push(c);
    }
    let t = out.trim();
    let t = t.strip_prefix('"').map(|s| s.strip_suffix('"').unwrap_or(s)).unwrap_or(t);
    t.trim().to_string()
}

/// Değerin başındaki sayı ("169754", "2550 lbs", "1.2e5", "-4.5, -5.8, 2.6").
fn num(v: &str) -> Option<f64> {
    let first = v.trim().split(|c: char| c == ',' || c.is_whitespace()).next()?;
    first.parse::<f64>().ok().filter(|x| x.is_finite())
}

/// Metin çözme: UTF-8 (BOM'lu ya da değil), UTF-16 LE (BOM'lu), olmazsa Latin-1 (eski Windows dosyaları).
fn decode(bytes: &[u8]) -> String {
    if let Some(b) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        let units: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return String::from_utf16_lossy(&units);
    }
    let b = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    match std::str::from_utf8(b) {
        Ok(s) => s.to_string(),
        Err(_) => b.iter().map(|&c| c as char).collect(),
    }
}

// ---------- Güvenli dosya erişimi ----------

/// Bağlantı (junction, symlink) olmayan gerçek dosya.
fn real_file(p: &Path) -> bool {
    fs::symlink_metadata(p).map(|m| m.is_file() && !m.file_type().is_symlink()).unwrap_or(false) && !fsx::is_link(p)
}

/// Bağlantı olmayan gerçek klasör: paketin içindeki bir junction paketin dışına çıkabilir, izlenmez.
fn real_dir(p: &Path) -> bool {
    fs::symlink_metadata(p).map(|m| m.is_dir()).unwrap_or(false) && !fsx::is_link(p)
}

fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    let mut v: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| real_dir(p)).collect();
    v.sort();
    v
}

fn read_cfg(path: &Path) -> Result<Cfg, String> {
    if !real_file(path) {
        return Err("yok".into());
    }
    let len = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if len > MAX_CFG {
        return Err(format!("çok büyük ({} KB)", len / 1024));
    }
    fs::read(path).map(|b| Cfg::parse(&decode(&b))).map_err(|e| e.to_string())
}

fn opt_cfg(path: &Path) -> Option<Cfg> {
    read_cfg(path).ok()
}

fn file_name(p: &Path) -> String {
    p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default()
}

/// Klasördeki ilk küçük resim (adlar sırayla denenir).
fn first_image(dir: &Path, names: &[&str]) -> Option<PathBuf> {
    names.iter().map(|n| dir.join(n)).find(|p| real_file(p))
}

// ---------- Paketin uçakları ----------

/// Kütüphanedeki ya da Community'deki bir paket (taramadan).
#[derive(Debug, Clone, Default)]
pub struct PackageInput {
    pub id: String,
    pub title: String,
    pub creator: String,
    pub manufacturer: String,
    pub folder: String,
    pub path: PathBuf,
    /// Paketin etkin olduğu simler ("msfs2020", "msfs2024"); boşsa hiçbir simde yüklenmez.
    pub sims: Vec<String>,
    /// Paketin kendi küçük resmi (`ContentInfo/…/Thumbnail.jpg`).
    pub thumbnail: Option<PathBuf>,
}

/// Uçağın `[GENERAL]` ve `[FLTSIM]` alanları.
#[derive(Debug, Clone, Default, PartialEq)]
struct Fields {
    icao_type: String,
    icao_manufacturer: String,
    icao_model: String,
    icao_engine_type: String,
    icao_engine_count: String,
    category: String,
    atc_model: String,
    ui_manufacturer: String,
    ui_type: String,
    ui_variation: String,
    ui_createdby: String,
}

impl Fields {
    /// Eksik alanları `other`dan doldurur.
    fn fill_from(&mut self, other: &Fields) {
        let pairs: [(&mut String, &String); 11] = [
            (&mut self.icao_type, &other.icao_type),
            (&mut self.icao_manufacturer, &other.icao_manufacturer),
            (&mut self.icao_model, &other.icao_model),
            (&mut self.icao_engine_type, &other.icao_engine_type),
            (&mut self.icao_engine_count, &other.icao_engine_count),
            (&mut self.category, &other.category),
            (&mut self.atc_model, &other.atc_model),
            (&mut self.ui_manufacturer, &other.ui_manufacturer),
            (&mut self.ui_type, &other.ui_type),
            (&mut self.ui_variation, &other.ui_variation),
            (&mut self.ui_createdby, &other.ui_createdby),
        ];
        for (a, b) in pairs {
            if a.is_empty() {
                a.clone_from(b);
            }
        }
    }
}

/// Simde seçilebilen bir başlık (bir `[FLTSIM.n]`).
#[derive(Debug, Clone, Default)]
struct Variant {
    title: String,
    /// `SimObjects/Airplanes/<klasör>`.
    simobject: String,
    rotorcraft: bool,
    modular: bool,
    /// 2024 modüler: ön ayarın etiketleri (boya eşleştirmesi; küçük harf).
    tags: Vec<String>,
    fields: Fields,
    specs: SimSpecs,
    engine_type_known: bool,
    /// 2020 boya paketi: `base_container`'ın klasör adı.
    base: Option<String>,
    thumb: Option<PathBuf>,
}

/// 2024 boyası (`livery.cfg`).
#[derive(Debug, Clone, Default)]
struct Livery {
    /// Uçak klasörü (küçük harf).
    simobject: String,
    name: String,
    required: Vec<String>,
    thumb: Option<PathBuf>,
    /// Boyanın paketi (küçük resim yolu bunun içinde denetlenir).
    root: PathBuf,
}

/// Okunamayan ya da eksik dosya (arayüzde ve gerçek tarama testinde gösterilir).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    pub package: String,
    /// Paket köküne göre yol.
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default)]
struct PackageScan {
    variants: Vec<Variant>,
    liveries: Vec<Livery>,
    problems: Vec<Problem>,
}

/// Bir klasördeki `aircraft.cfg`, `flight_model.cfg` ve `engines.cfg` (birleştirmenin bir katmanı).
#[derive(Debug, Clone, Default)]
struct Layer {
    cfgs: Vec<Cfg>,
}

impl Layer {
    fn read(dir: &Path) -> Layer {
        Layer { cfgs: ["aircraft.cfg", "flight_model.cfg", "engines.cfg"].iter().filter_map(|f| opt_cfg(&dir.join(f))).collect() }
    }

    fn with(cfg: Cfg, rest: Layer) -> Layer {
        let mut cfgs = vec![cfg];
        cfgs.extend(rest.cfgs);
        Layer { cfgs }
    }
}

/// Katmanlar öncelik sırasıyla: değer ilk bulunduğu katmandan alınır.
struct Layers(Vec<Layer>);

impl Layers {
    fn get(&self, section: &str, key: &str) -> Option<&str> {
        self.0.iter().flat_map(|l| l.cfgs.iter()).find_map(|c| c.get(section, key))
    }

    fn num(&self, section: &str, key: &str) -> Option<f64> {
        self.get(section, key).and_then(num)
    }

    /// Bölümün kendisi (ilk bulunduğu katmandan; bazı anahtarlar varsa).
    fn section_where(&self, section: &str, pred: impl Fn(&[(String, String)]) -> bool) -> Option<&[(String, String)]> {
        self.0.iter().flat_map(|l| l.cfgs.iter()).filter_map(|c| c.section(section)).find(|s| pred(s))
    }

    fn fields(&self) -> Fields {
        let g = |k: &str| self.get("general", k).unwrap_or_default().to_string();
        Fields {
            icao_type: g("icao_type_designator"),
            icao_manufacturer: g("icao_manufacturer"),
            icao_model: g("icao_model"),
            icao_engine_type: g("icao_engine_type"),
            icao_engine_count: g("icao_engine_count"),
            category: self.get("general", "category").or_else(|| self.get("general", "object_class")).unwrap_or_default().to_string(),
            atc_model: g("atc_model"),
            ..Default::default()
        }
    }

    /// Simin `SimSpecs`'iyle aynı alanlar; motor türü bulunduysa ikinci değer `true`.
    fn specs(&self, fields: &Fields) -> (SimSpecs, bool) {
        let mut s = SimSpecs { category: fields.category.clone(), ..Default::default() };
        let engine_type = self.num("generalenginedata", "engine_type").map(|v| v as i32).or_else(|| engine_type_from_icao(&fields.icao_engine_type));
        s.engine_type = engine_type.unwrap_or(0);
        let is_engine_key = |k: &str| k.strip_prefix("engine.").is_some_and(|i| !i.is_empty() && i.chars().all(|c| c.is_ascii_digit()));
        s.engines = self
            .section_where("generalenginedata", |e| e.iter().any(|(k, _)| is_engine_key(k)))
            .map(|e| e.iter().filter(|(k, _)| is_engine_key(k)).count() as u32)
            .or_else(|| num(&fields.icao_engine_count).map(|n| n as u32))
            .unwrap_or(0);
        s.mtow_lb = self.num("weight_and_balance", "max_gross_weight").unwrap_or(0.0);
        s.max_takeoff_lb = self.num("weight_and_balance", "max_takeoff_weight").unwrap_or(0.0);
        s.max_landing_lb = self.num("weight_and_balance", "max_landing_weight").unwrap_or(0.0);
        if s.mtow_lb <= 0.0 {
            s.mtow_lb = s.max_takeoff_lb;
        }
        s.empty_lb = self.num("weight_and_balance", "empty_weight").unwrap_or(0.0);
        s.cruise_kt = self.num("reference speeds", "cruise_speed").unwrap_or(0.0);
        s.payload_stations = self.num("weight_and_balance", "max_number_of_stations").map(|n| n as u32).unwrap_or_else(|| {
            self.section_where("weight_and_balance", |e| e.iter().any(|(k, _)| k.starts_with("station_load.")))
                .map(|e| e.iter().filter(|(k, _)| k.starts_with("station_load.")).count() as u32)
                .unwrap_or(0)
        });
        s.fuel_capacity_gal = self.fuel_capacity_gal();
        (s, engine_type.is_some())
    }

    /// Yakıt kapasitesi (galon): eski `[FUEL]` tankları (4. değer kullanılabilir kapasite) ya da yeni
    /// `[FUEL_SYSTEM]` `Tank.n = …#Capacity:26#…`.
    fn fuel_capacity_gal(&self) -> f64 {
        const TANKS: [&str; 11] = ["center1", "center2", "center3", "leftmain", "rightmain", "leftaux", "rightaux", "lefttip", "righttip", "external1", "external2"];
        if let Some(sec) = self.section_where("fuel", |e| e.iter().any(|(k, _)| TANKS.contains(&k.as_str()))) {
            return sec.iter().filter(|(k, _)| TANKS.contains(&k.as_str())).filter_map(|(_, v)| v.split(',').nth(3).and_then(num)).filter(|v| *v > 0.0).sum();
        }
        if let Some(sec) = self.section_where("fuel_system", |e| e.iter().any(|(k, _)| k.starts_with("tank."))) {
            return sec
                .iter()
                .filter(|(k, _)| k.starts_with("tank."))
                .filter_map(|(_, v)| {
                    v.split('#').find_map(|part| {
                        let (name, val) = part.split_once(':')?;
                        name.trim().eq_ignore_ascii_case("capacity").then(|| num(val)).flatten()
                    })
                })
                .filter(|v| *v > 0.0)
                .sum();
        }
        0.0
    }
}

/// `icao_engine_type` → simin `ENGINE TYPE` kodu (0 pistonlu, 1 jet, 3 helikopter türbini, 5 turboprop).
fn engine_type_from_icao(v: &str) -> Option<i32> {
    match v.trim().to_ascii_lowercase().as_str() {
        "piston" => Some(0),
        "jet" | "turbofan" => Some(1),
        "turboprop" => Some(5),
        "helo-turbine" | "turboshaft" | "helicopter" => Some(3),
        _ => None,
    }
}

/// FLTSIM bölümündeki başlık ve arayüz alanları.
fn fltsim_fields(e: &[(String, String)]) -> Fields {
    let g = |k: &str| entry(e, k).unwrap_or_default().to_string();
    Fields {
        icao_type: g("icao_type_designator"),
        icao_manufacturer: g("icao_manufacturer"),
        icao_model: g("icao_model"),
        atc_model: g("atc_model"),
        ui_manufacturer: g("ui_manufacturer"),
        ui_type: g("ui_type"),
        ui_variation: g("ui_variation"),
        ui_createdby: g("ui_createdby"),
        ..Default::default()
    }
}

/// Simde seçilebilir mi (`isUserSelectable = 0` yapay zekâ trafiği içindir).
fn selectable(e: &[(String, String)]) -> bool {
    entry(e, "isuserselectable").and_then(num).is_none_or(|v| v != 0.0)
}

fn rel(pkg: &Path, p: &Path) -> String {
    p.strip_prefix(pkg).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_else(|_| p.display().to_string())
}

/// Paketin `SimObjects/Airplanes` ve `SimObjects/Rotorcraft` klasörleri.
fn simobject_roots(pkg: &Path) -> Vec<(PathBuf, bool)> {
    let so = pkg.join("SimObjects");
    if !real_dir(&so) {
        return Vec::new();
    }
    [("Airplanes", false), ("Rotorcraft", true)].iter().map(|(n, r)| (so.join(n), *r)).filter(|(p, _)| real_dir(p)).collect()
}

fn scan_package(pkg: &PackageInput) -> PackageScan {
    let mut out = PackageScan::default();
    for (root, rotorcraft) in simobject_roots(&pkg.path) {
        for dir in subdirs(&root) {
            let simobject = file_name(&dir);
            let has_presets = real_dir(&dir.join("presets"));
            if real_file(&dir.join("aircraft.cfg")) {
                scan_legacy(pkg, &dir, &simobject, rotorcraft, &mut out);
            }
            if has_presets {
                scan_modular(pkg, &dir, &simobject, rotorcraft, &mut out);
            }
            // Boyalar (2024): uçağın kendi paketinde ya da yalnızca boya taşıyan pakette.
            let liv = dir.join("liveries");
            if real_dir(&liv) {
                scan_liveries(pkg, &liv, &simobject, &mut out);
            }
        }
    }
    out
}

/// 2020 biçimi: `aircraft.cfg` + aynı klasördeki `flight_model.cfg`, `engines.cfg`.
fn scan_legacy(pkg: &PackageInput, dir: &Path, simobject: &str, rotorcraft: bool, out: &mut PackageScan) {
    let path = dir.join("aircraft.cfg");
    let ac = match read_cfg(&path) {
        Ok(c) => c,
        Err(e) => {
            out.problems.push(Problem { package: pkg.id.clone(), path: rel(&pkg.path, &path), reason: e });
            return;
        }
    };
    let base = ac.get("variation", "base_container").map(|b| b.replace('/', "\\")).and_then(|b| b.split('\\').rfind(|s| !s.is_empty() && *s != "..").map(str::to_string));
    let layers = Layers(vec![Layer::with(ac.clone(), Layer { cfgs: ["flight_model.cfg", "engines.cfg"].iter().filter_map(|f| opt_cfg(&dir.join(f))).collect() })]);
    let general = layers.fields();
    let (specs, known) = layers.specs(&general);
    let sims = ac.fltsims();
    let before = out.variants.len();
    for e in sims {
        let Some(title) = entry(e, "title") else { continue };
        if !selectable(e) || aircraft::is_passive(title) {
            continue;
        }
        let mut fields = fltsim_fields(e);
        fields.fill_from(&general);
        // Küçük resim: `texture = "Turkish"` → `texture.Turkish/thumbnail.jpg`.
        let tex = entry(e, "texture").unwrap_or("");
        let tex_dir = if tex.is_empty() { dir.join("texture") } else if fsx::safe_component(tex) { dir.join(format!("texture.{tex}")) } else { dir.join("texture") };
        let thumb = real_dir(&tex_dir).then(|| first_image(&tex_dir, &["thumbnail.jpg", "thumbnail.png", "thumbnail.jpeg"])).flatten();
        out.variants.push(Variant {
            title: title.to_string(),
            simobject: simobject.to_string(),
            rotorcraft,
            modular: false,
            tags: Vec::new(),
            fields,
            specs: specs.clone(),
            engine_type_known: known,
            base: base.clone(),
            thumb,
        });
    }
    if out.variants.len() == before && !ac.fltsims().iter().any(|e| !selectable(e)) {
        out.problems.push(Problem { package: pkg.id.clone(), path: rel(&pkg.path, &path), reason: "seçilebilir başlık yok ([FLTSIM.n] title)".into() });
    }
}

/// Ekin katmanını, etiketlerini ve kalıtım zincirini toplar (`attachment.cfg` → `[Inherit] base`).
fn collect_attachment(pkg: &PackageInput, rel_root: &str, depth: usize, seen: &mut HashSet<String>, layers: &mut Vec<Layer>, tags: &mut Vec<String>, problems: &mut Vec<Problem>) {
    if depth > MAX_INHERIT {
        return;
    }
    let dir = match fsx::resolve_under(&pkg.path, &rel_root.replace('/', "\\")) {
        Ok(d) => d,
        Err(_) => {
            problems.push(Problem { package: pkg.id.clone(), path: rel_root.to_string(), reason: "ek yolu paketin dışına çıkıyor".into() });
            return;
        }
    };
    // Ek başka bir pakette olabilir (ör. simin kendi uçağı); o zaman burada yoktur, sessizce atlanır.
    if !real_dir(&dir) || !fsx::is_within(&pkg.path, &dir) {
        return;
    }
    if !seen.insert(fsx::norm_key(&dir)) {
        return;
    }
    let att = opt_cfg(&dir.join("attachment.cfg")).unwrap_or_default();
    if let Some(t) = att.section("tags") {
        for (k, v) in t {
            if k.starts_with("tag") && !v.is_empty() {
                let v = v.to_ascii_lowercase();
                if !tags.contains(&v) {
                    tags.push(v);
                }
            }
        }
    }
    layers.push(Layer::read(&dir.join("config")));
    if let Some(base) = att.get("inherit", "base") {
        collect_attachment(pkg, base, depth + 1, seen, layers, tags, problems);
    }
    // Ekin kendi ekleri (Fenix: dış görünüm → kanat "SL", motor "CFM"); boya etiketleri bunlardan da gelir.
    for r in attachment_roots(&dir.join("config").join("attached_objects.cfg")) {
        collect_attachment(pkg, &r, depth + 1, seen, layers, tags, problems);
    }
}

/// `attached_objects.cfg`'deki `[sim_attachment.n] attachment_root`'lar, sırayla.
fn attachment_roots(path: &Path) -> Vec<String> {
    let Some(att) = opt_cfg(path) else { return Vec::new() };
    let mut roots: Vec<(u32, String)> = att
        .sections()
        .filter_map(|(n, e)| {
            let i = n.strip_prefix("sim_attachment.")?.trim().parse::<u32>().ok()?;
            entry(e, "attachment_root").map(|r| (i, r.to_string()))
        })
        .collect();
    roots.sort();
    roots.into_iter().map(|(_, r)| r).collect()
}

/// 2024 modüler biçim: `presets/<geliştirici>/<ön ayar>/config/aircraft.cfg`.
fn scan_modular(pkg: &PackageInput, dir: &Path, simobject: &str, rotorcraft: bool, out: &mut PackageScan) {
    let common = Layer::read(&dir.join("common").join("config"));
    let mut presets: Vec<PathBuf> = Vec::new();
    for a in subdirs(&dir.join("presets")) {
        if real_file(&a.join("config").join("aircraft.cfg")) {
            presets.push(a);
            continue;
        }
        presets.extend(subdirs(&a).into_iter().filter(|b| real_file(&b.join("config").join("aircraft.cfg"))));
    }
    for preset in presets {
        let cfg_dir = preset.join("config");
        let path = cfg_dir.join("aircraft.cfg");
        let pac = match read_cfg(&path) {
            Ok(c) => c,
            Err(e) => {
                out.problems.push(Problem { package: pkg.id.clone(), path: rel(&pkg.path, &path), reason: e });
                continue;
            }
        };
        // Katmanlar: ön ayar > ekler (kalıtım sırasıyla) > ortak.
        let mut layers = vec![Layer::with(pac.clone(), Layer { cfgs: ["flight_model.cfg", "engines.cfg"].iter().filter_map(|f| opt_cfg(&cfg_dir.join(f))).collect() })];
        let mut tags: Vec<String> = Vec::new();
        let mut seen = HashSet::new();
        for r in attachment_roots(&cfg_dir.join("attached_objects.cfg")) {
            collect_attachment(pkg, &r, 0, &mut seen, &mut layers, &mut tags, &mut out.problems);
        }
        if let Some(t) = pac.section("tags") {
            for (k, v) in t {
                if k.starts_with("tag") && !v.is_empty() && !tags.contains(&v.to_ascii_lowercase()) {
                    tags.push(v.to_ascii_lowercase());
                }
            }
        }
        layers.push(common.clone());
        let layers = Layers(layers);
        let general = layers.fields();
        let (specs, known) = layers.specs(&general);
        let before = out.variants.len();
        for e in pac.fltsims() {
            let Some(title) = entry(e, "title") else { continue };
            if !selectable(e) || aircraft::is_passive(title) {
                continue;
            }
            let mut fields = fltsim_fields(e);
            fields.fill_from(&general);
            out.variants.push(Variant {
                title: title.to_string(),
                simobject: simobject.to_string(),
                rotorcraft,
                modular: true,
                tags: tags.clone(),
                fields,
                specs: specs.clone(),
                engine_type_known: known,
                base: None,
                thumb: first_image(&preset.join("thumbnail"), &["thumbnail.png", "thumbnail.jpg"]),
            });
        }
        if out.variants.len() == before && pac.fltsims().iter().all(|e| selectable(e)) {
            out.problems.push(Problem { package: pkg.id.clone(), path: rel(&pkg.path, &path), reason: "ön ayarda başlık yok ([FLTSIM.0] title)".into() });
        }
    }
}

/// `liveries/<geliştirici>/<boya>/livery.cfg` (bir düzey eksik de olabilir).
fn scan_liveries(pkg: &PackageInput, liv: &Path, simobject: &str, out: &mut PackageScan) {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for a in subdirs(liv) {
        if real_file(&a.join("livery.cfg")) {
            dirs.push(a);
        } else {
            dirs.extend(subdirs(&a).into_iter().filter(|b| real_file(&b.join("livery.cfg"))));
        }
    }
    for d in dirs {
        let path = d.join("livery.cfg");
        let cfg = match read_cfg(&path) {
            Ok(c) => c,
            Err(e) => {
                out.problems.push(Problem { package: pkg.id.clone(), path: rel(&pkg.path, &path), reason: e });
                continue;
            }
        };
        let Some(name) = cfg.get("general", "name") else { continue };
        let required: Vec<String> = cfg.get("selection", "required_tags").unwrap_or("").split(',').map(|s| s.trim().to_ascii_lowercase()).filter(|s| !s.is_empty()).collect();
        let thumb = first_image(&d.join("thumbnail"), &["thumbnail.png", "thumbnail.jpg", "thumbnail_side.png"]).or_else(|| first_image(&d, &["thumbnail.png", "thumbnail.jpg"]));
        out.liveries.push(Livery { simobject: simobject.to_ascii_lowercase(), name: name.to_string(), required, thumb, root: pkg.path.clone() });
    }
}

// ---------- Paket önbelleği ----------

type Stamp = (Option<SystemTime>, Option<SystemTime>, Option<SystemTime>);

fn stamp(pkg: &Path) -> Stamp {
    let mt = |p: PathBuf| fs::metadata(p).and_then(|m| m.modified()).ok();
    (mt(pkg.join("manifest.json")), mt(pkg.join("layout.json")), mt(pkg.join("SimObjects")))
}

fn package_cache() -> &'static Mutex<HashMap<String, (Stamp, Arc<PackageScan>)>> {
    static C: OnceLock<Mutex<HashMap<String, (Stamp, Arc<PackageScan>)>>> = OnceLock::new();
    C.get_or_init(Default::default)
}

/// Paketi okur; manifest, layout ve `SimObjects` değişmediyse önbellekten.
fn scan_cached(pkg: &PackageInput) -> Arc<PackageScan> {
    let key = format!("{}|{}", fsx::norm_key(&pkg.path), pkg.id);
    let st = stamp(&pkg.path);
    if let Some((s, scan)) = package_cache().lock().unwrap().get(&key) {
        if *s == st {
            return scan.clone();
        }
    }
    let scan = Arc::new(scan_package(pkg));
    package_cache().lock().unwrap().insert(key, (st, scan.clone()));
    scan
}

// ---------- Dizin ----------

/// Paketin içindeki, simde seçilebilen bir mod uçağı.
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AddonAircraft {
    pub title: String,
    pub package_id: String,
    pub package_title: String,
    pub creator: String,
    /// Paketin etkin olduğu simler.
    pub sims: Vec<String>,
    /// `SimObjects/Airplanes/<klasör>`: aynı uçağın sürümleri aynı klasördedir.
    pub simobject: String,
    pub rotorcraft: bool,
    /// MSFS 2024 modüler uçak.
    pub modular: bool,
    pub liveries: Vec<String>,
    pub icao_type: String,
    pub icao_manufacturer: String,
    pub icao_model: String,
    pub atc_model: String,
    pub ui_manufacturer: String,
    pub ui_type: String,
    pub ui_variation: String,
    pub category: String,
    /// Dosyalardan okunan değerler (motor türü bilinmiyorsa `engine_type_known` yanlış).
    pub specs: SimSpecs,
    pub engine_type_known: bool,
    pub inference: Option<Inference>,
    /// Yükü ve yakıtı kendi EFB'sinden yöneten geliştirici (paket adı, yapımcı ya da başlıktan).
    pub efb_developer: Option<&'static str>,
    /// Gerçek tip adı (ICAO kodundan ya da aileden); bilinmiyorsa boş.
    pub real_type: String,
    /// Küçük resimler (önce sürümün kendisi, sonra boyalar, en son paketin kapağı).
    #[serde(skip)]
    pub thumbs: Vec<ThumbRef>,
}

/// Küçük resim: hangi boyanın ("" sürümün kendisi), dosya ve içinde bulunması gereken paket kökü.
#[derive(Debug, Clone, Default)]
pub struct ThumbRef {
    pub livery: String,
    pub path: PathBuf,
    pub root: PathBuf,
}

/// Mod uçağının paketi (arayüzdeki "Mod" rozeti ve paket adı).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AircraftPackage {
    pub id: String,
    pub title: String,
    pub creator: String,
    /// `SimObjects/Airplanes/<klasör>`: aynı uçağın sürümleri arayüzde birlikte gösterilir.
    pub simobject: String,
}

impl AddonAircraft {
    pub fn has_thumb(&self) -> bool {
        !self.thumbs.is_empty()
    }

    /// Dosyalardan okunan değerler yeterliyse (uçuş kâğıdı için) onlar.
    pub fn usable_specs(&self) -> Option<&SimSpecs> {
        (self.specs.mtow_lb > 0.0 || self.specs.empty_lb > 0.0 || self.specs.fuel_capacity_gal > 0.0).then_some(&self.specs)
    }
}

/// Mod uçaklarının dizini.
#[derive(Debug, Clone, Default)]
pub struct Index {
    pub aircraft: Vec<AddonAircraft>,
    pub problems: Vec<Problem>,
    /// Okunan paket ve uçak taşıyan paket sayısı.
    pub packages: usize,
    pub aircraft_packages: usize,
}

impl Index {
    /// Başlığa göre (büyük/küçük harf ve kenar boşluğu duyarsız).
    pub fn find(&self, title: &str) -> Option<&AddonAircraft> {
        let k = key(title);
        self.aircraft.iter().find(|a| key(&a.title) == k)
    }
}

fn key(title: &str) -> String {
    title.trim().to_lowercase()
}

/// Gerçek tip adı: ICAO kodu > uçak ailesi > `ui_manufacturer` + `ui_type` (yerelleştirme anahtarı değilse).
fn real_type(f: &Fields, title: &str) -> String {
    if let Some(n) = aircraft::icao_type_name(&f.icao_type) {
        return n.to_string();
    }
    if let Some(n) = aircraft::icao_from_atc_model(&f.atc_model).as_deref().and_then(aircraft::icao_type_name) {
        return n.to_string();
    }
    if let Some(fam) = families::family_of(title) {
        return fam.name.clone();
    }
    let clean = |s: &str| if s.starts_with("TT:") || s.starts_with("$$:") { String::new() } else { s.trim().to_string() };
    let (m, t) = (clean(&f.ui_manufacturer), clean(&f.ui_type));
    match (m.is_empty(), t.is_empty()) {
        (false, false) if !t.to_lowercase().starts_with(&m.to_lowercase()) => format!("{m} {t}"),
        (_, false) => t,
        _ => String::new(),
    }
}

/// Paketlerden dizin (saf: yalnızca verilen paketleri okur).
pub fn build(packages: &[PackageInput]) -> Index {
    let available: Vec<&PackageInput> = packages.iter().filter(|p| !p.sims.is_empty()).collect();
    let scans: Vec<(&PackageInput, Arc<PackageScan>)> = crate::scanner::parallel_map(&available, |p| (*p, scan_cached(p)));
    let mut index = Index { packages: available.len(), ..Default::default() };
    // Boyalar uçak klasörüne göre (başka paketlerden gelenler dahil).
    let mut liveries: HashMap<String, Vec<&Livery>> = HashMap::new();
    for (_, s) in &scans {
        for l in &s.liveries {
            liveries.entry(l.simobject.clone()).or_default().push(l);
        }
    }
    // 2020 boya paketleri tabanlarının değerlerini alır: klasör adı → ilk tam değerli sürüm.
    let mut bases: HashMap<String, &Variant> = HashMap::new();
    for (_, s) in &scans {
        for v in &s.variants {
            if v.base.is_none() {
                bases.entry(v.simobject.to_ascii_lowercase()).or_insert(v);
            }
        }
    }
    let mut seen: HashMap<String, usize> = HashMap::new();
    for (pkg, s) in &scans {
        index.problems.extend(s.problems.iter().cloned());
        if !s.variants.is_empty() {
            index.aircraft_packages += 1;
        }
        for v in &s.variants {
            let mut v = v.clone();
            if let Some(b) = v.base.as_ref().and_then(|b| bases.get(&b.to_ascii_lowercase())) {
                v.fields.fill_from(&b.fields);
                if !v.engine_type_known && v.specs.mtow_lb <= 0.0 {
                    v.specs = b.specs.clone();
                    v.engine_type_known = b.engine_type_known;
                }
                v.rotorcraft |= b.rotorcraft;
            }
            let k = key(&v.title);
            if let Some(&i) = seen.get(&k) {
                // Aynı başlık iki pakette (ör. kütüphanede ve Community'de): simler birleşir, ilk kayıt kalır.
                let a: &mut AddonAircraft = &mut index.aircraft[i];
                for s in &pkg.sims {
                    if !a.sims.contains(s) {
                        a.sims.push(s.clone());
                    }
                }
                continue;
            }
            let mut names: Vec<String> = Vec::new();
            let mut thumbs: Vec<ThumbRef> = Vec::new();
            if v.modular {
                for l in liveries.get(&v.simobject.to_ascii_lowercase()).map(|l| l.as_slice()).unwrap_or_default() {
                    // "Disabled" etiketi hiçbir ön ayarda yoktur: o boya seçilemez.
                    if l.required.iter().all(|r| v.tags.contains(r)) && !names.iter().any(|n| n.eq_ignore_ascii_case(&l.name)) {
                        names.push(l.name.clone());
                        if let Some(t) = &l.thumb {
                            thumbs.push(ThumbRef { livery: l.name.clone(), path: t.clone(), root: l.root.clone() });
                        }
                    }
                }
            }
            if let Some(t) = &v.thumb {
                thumbs.insert(0, ThumbRef { livery: String::new(), path: t.clone(), root: pkg.path.clone() });
            }
            if let Some(t) = &pkg.thumbnail {
                thumbs.push(ThumbRef { livery: String::new(), path: t.clone(), root: pkg.path.clone() });
            }
            let rotorcraft = v.rotorcraft || v.fields.category.to_ascii_lowercase().contains("helicopter");
            let inference = aircraft::infer(&v.fields.icao_type, rotorcraft, v.engine_type_known.then_some(&v.specs), &v.title, &v.fields.atc_model);
            let hay = format!("{} {} {} {} {} {}", v.title, pkg.folder, pkg.title, pkg.creator, pkg.manufacturer, v.fields.ui_createdby);
            let mut sims = pkg.sims.clone();
            sims.sort();
            seen.insert(k, index.aircraft.len());
            index.aircraft.push(AddonAircraft {
                real_type: real_type(&v.fields, &v.title),
                efb_developer: aircraft::efb_developer(&hay),
                title: v.title.clone(),
                package_id: pkg.id.clone(),
                package_title: pkg.title.clone(),
                creator: pkg.creator.clone(),
                sims,
                simobject: v.simobject.clone(),
                rotorcraft,
                modular: v.modular,
                liveries: names,
                icao_type: v.fields.icao_type.trim().to_ascii_uppercase(),
                icao_manufacturer: v.fields.icao_manufacturer.clone(),
                icao_model: v.fields.icao_model.clone(),
                atc_model: v.fields.atc_model.clone(),
                ui_manufacturer: v.fields.ui_manufacturer.clone(),
                ui_type: v.fields.ui_type.clone(),
                ui_variation: v.fields.ui_variation.clone(),
                category: v.fields.category.clone(),
                specs: v.specs.clone(),
                engine_type_known: v.engine_type_known,
                inference,
                thumbs,
            });
        }
    }
    index
}

/// Taramanın modlarından paket girdileri: etkin olduğu simlerle (bağlı, fiziksel ya da başka aracın bağlantısı).
pub fn packages_from_scan(scan: &crate::scanner::ScanResult) -> Vec<PackageInput> {
    scan.mods
        .iter()
        .filter(|m| !m.info.folder.to_ascii_lowercase().starts_with("modstead-"))
        .map(|m| PackageInput {
            id: m.id.clone(),
            title: m.info.title.clone(),
            creator: m.info.creator.clone(),
            manufacturer: m.info.manufacturer.clone(),
            folder: m.info.folder.clone(),
            path: m.info.path.clone(),
            sims: m.sims.iter().filter(|(_, s)| matches!(s.state.as_str(), "enabled" | "physical" | "foreign")).map(|(id, _)| id.clone()).collect(),
            thumbnail: m.info.thumbnail.clone(),
        })
        .collect()
}

// ---------- Süreç boyunca dizin ve kullanıcının seçimleri ----------

/// Kullanıcının uçak başına seçimleri (`games/msfs/career/aircraft-prefs.json`). Kariyer silinse de kalır.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Prefs {
    /// Başlık → kendi EFB'si mi (elle). Yoksa otomatik.
    pub own_loading: BTreeMap<String, bool>,
}

impl Prefs {
    fn loading(&self, title: &str) -> Option<bool> {
        let k = key(title);
        self.own_loading.iter().find(|(t, _)| key(t) == k).map(|(_, v)| *v)
    }
}

#[derive(Default)]
struct Registry {
    index: Arc<Index>,
    /// Dizinin kurulduğu tarama (aynıysa yeniden kurulmaz).
    scan: Option<Arc<crate::scanner::ScanResult>>,
    prefs: Prefs,
    prefs_path: Option<PathBuf>,
}

fn registry() -> &'static RwLock<Registry> {
    static R: OnceLock<RwLock<Registry>> = OnceLock::new();
    R.get_or_init(Default::default)
}

/// Şu anki dizin.
pub fn index() -> Arc<Index> {
    registry().read().unwrap().index.clone()
}

pub fn prefs() -> Prefs {
    registry().read().unwrap().prefs.clone()
}

/// Dizini değiştirir (testler ve `refresh`).
pub fn install(index: Index) -> Arc<Index> {
    let arc = Arc::new(index);
    registry().write().unwrap().index = arc.clone();
    arc
}

/// Elle seçim, sonra paketin geliştiricisi; ikisi de yoksa `None` (başlıktan tahmin `aircraft`'ta).
pub fn own_loading(title: &str) -> Option<bool> {
    let r = registry().read().unwrap();
    if let Some(v) = r.prefs.loading(title) {
        return Some(v);
    }
    r.index.find(title).and_then(|a| a.efb_developer).map(|_| true)
}

fn prefs_file(career: &Career) -> PathBuf {
    career.services.paths.game_data(crate::ID).join("career").join("aircraft-prefs.json")
}

/// Kullanıcının seçimlerini (bir kez) diskten okur.
pub fn load_prefs(career: &Career) {
    let path = prefs_file(career);
    let mut r = registry().write().unwrap();
    if r.prefs_path.as_ref() != Some(&path) {
        r.prefs = fsx::read_json(&path);
        r.prefs_path = Some(path);
    }
}

/// "Kendi EFB'si": `Some` elle seçer, `None` otomatiğe döner.
pub fn set_own_loading(career: &Career, title: &str, own: Option<bool>) -> AppResult<()> {
    load_prefs(career);
    let title = title.trim();
    if title.is_empty() || title.chars().count() > 256 {
        return Err(AppError::msg(tr!("Geçersiz uçak adı.", "Invalid aircraft title.")));
    }
    let prefs = {
        let mut r = registry().write().unwrap();
        let k = key(title);
        r.prefs.own_loading.retain(|t, _| key(t) != k);
        if let Some(v) = own {
            r.prefs.own_loading.insert(title.to_string(), v);
        }
        r.prefs.clone()
    };
    fsx::write_json(&prefs_file(career), &prefs)?;
    career.note("komut", format!("kendi EFB'si: {title} → {}", own.map(|v| if v { "evet" } else { "hayır" }).unwrap_or("otomatik")));
    career.changed();
    Ok(())
}

/// Dizini taramadan kurar; tarama değişmediyse ve `force` değilse var olanı döner. `force` diski yeniden tarar
/// (kullanıcı "Listeyi yenile"ye bastı: Community'ye elle eklenen paketler de görünsün).
pub fn refresh(game: &crate::Msfs, force: bool) -> Arc<Index> {
    load_prefs(&game.career());
    let scan = if force { game.rescan() } else { game.inner.last_scan.read().unwrap().clone().unwrap_or_else(|| game.rescan()) };
    if !force {
        let r = registry().read().unwrap();
        if r.scan.as_ref().is_some_and(|s| Arc::ptr_eq(s, &scan)) {
            return r.index.clone();
        }
    }
    let t = std::time::Instant::now();
    let idx = build(&packages_from_scan(&scan));
    let msg = format!("mod uçakları: {} paket okundu, {} pakette {} uçak, {} sorun ({} ms)", idx.packages, idx.aircraft_packages, idx.aircraft.len(), idx.problems.len(), t.elapsed().as_millis());
    let arc = Arc::new(idx);
    {
        let mut r = registry().write().unwrap();
        r.index = arc.clone();
        r.scan = Some(scan);
    }
    game.career().note("uçaklar", msg);
    arc
}

/// Uygulama açılınca arka planda: seçimleri okur, dizini kurar (açılış taraması bitsin diye biraz bekler).
pub fn warm(game: crate::Msfs) {
    std::thread::spawn(move || {
        load_prefs(&game.career());
        std::thread::sleep(std::time::Duration::from_secs(6));
        if game.settings().library_path.is_some() || game.sims().iter().any(|s| s.detected) {
            refresh(&game, false);
        }
    });
}

/// Mod uçağının küçük resmi (ham bayt). Yalnızca dizindeki, paket klasörünün içindeki jpg/png okunur.
pub fn thumbnail(title: &str, livery: Option<&str>) -> AppResult<Vec<u8>> {
    let idx = index();
    let a = idx.find(title).ok_or_else(|| AppError::NotFound(tr!("küçük resim", "thumbnail").into()))?;
    let t = livery
        .filter(|l| !l.is_empty())
        .and_then(|l| a.thumbs.iter().find(|t| t.livery.eq_ignore_ascii_case(l)))
        .or_else(|| a.thumbs.first())
        .ok_or_else(|| AppError::NotFound(tr!("küçük resim", "thumbnail").into()))?;
    let pick = t.path.clone();
    if !crate::util::is_within(&pick, &t.root) || !fsx::is_within(&t.root, &pick) {
        return Err(AppError::security(tr!("Görsel paket klasörünün dışında.", "The image is outside the package folder.")));
    }
    let ext = pick.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !matches!(ext.as_str(), "jpg" | "jpeg" | "png") {
        return Err(AppError::security(tr!("Desteklenmeyen görsel türü", "Unsupported image type")));
    }
    if !real_file(&pick) || fs::metadata(&pick)?.len() > MAX_THUMB {
        return Err(AppError::msg(tr!("Görsel okunamadı ya da çok büyük", "The image is missing or too large")));
    }
    Ok(fs::read(&pick)?)
}

// ---------- Sim listesiyle birleştirme ----------

/// Bir uçağın sınıfı, kaynağı ve güveni: elle > ICAO tip kodu > simin değerleri (uçağa binildi) > paketin dosyaları
/// > ad. Kaynak: "user" | "icao" | "sim" | "cfg" | "name" | "unknown".
pub(crate) fn class_for(d: &CareerData, title: &str, atc_model: &str, addon: Option<&AddonAircraft>) -> (Option<Class>, &'static str, Option<Confidence>) {
    if let Some(c) = d.class_overrides.get(title) {
        return (Some(*c), "user", None);
    }
    auto_class(d, title, atc_model, addon)
}

/// Elle seçim olmasaydı sınıf (arayüzdeki "otomatik" seçeneği bunu gösterir).
pub(crate) fn auto_class(d: &CareerData, title: &str, atc_model: &str, addon: Option<&AddonAircraft>) -> (Option<Class>, &'static str, Option<Confidence>) {
    let known = d.known_aircraft.get(title);
    let model = [atc_model, known.map(|k| k.atc_model.as_str()).unwrap_or(""), addon.map(|a| a.atc_model.as_str()).unwrap_or("")].into_iter().find(|m| !m.trim().is_empty()).unwrap_or("");
    let icao = addon.map(|a| a.icao_type.clone()).filter(|i| !i.is_empty()).or_else(|| aircraft::icao_from_atc_model(model)).unwrap_or_default();
    if let Some(c) = aircraft::classify_icao(&icao) {
        return (Some(c), "icao", Some(Confidence::High));
    }
    if let Some(c) = known.and_then(|k| k.class) {
        return (Some(c), "sim", Some(Confidence::High));
    }
    if let Some(i) = addon.and_then(|a| a.inference).filter(|i| i.basis != "name") {
        return (Some(i.class), "cfg", Some(i.confidence));
    }
    match aircraft::classify_name(title, model) {
        Some(c) => (Some(c), "name", Some(Confidence::Low)),
        None => (None, "unknown", None),
    }
}

/// Kendi EFB'si ve kaynağı: "user" (elle) | "package" (paketin geliştiricisi) | "title" (başlıktan) | "" (yok).
fn loading_for(title: &str, addon: Option<&AddonAircraft>, prefs: &Prefs) -> (bool, &'static str) {
    if let Some(v) = prefs.loading(title) {
        return (v, "user");
    }
    if addon.is_some_and(|a| a.efb_developer.is_some()) {
        return (true, "package");
    }
    if aircraft::efb_developer(title).is_some() || title.to_ascii_lowercase().contains("fnx") {
        return (true, "title");
    }
    (false, "")
}

/// Uçak listesi: simin listesi (2024) + uçulan uçaklar + mod paketleri, başlığa göre tekilleştirilmiş. Bir başlık bir
/// pakette bulunuyorsa "mod"dur (boyaları birleşir); hiçbir simde etkin olmayan paketler listede yoktur.
pub fn merge(d: &CareerData, sim_items: &[(String, String)], index: &Index, prefs: &Prefs) -> Vec<AircraftOption> {
    let held = d.pilot.as_ref().map(|p| p.licenses.clone()).unwrap_or_default();
    // Başlık (simdeki yazımıyla) ve boyalar, ilk görülme sırasıyla.
    let mut order: Vec<(String, Vec<String>)> = Vec::new();
    let mut at: HashMap<String, usize> = HashMap::new();
    let mut add = |title: &str, liveries: &[String]| {
        if title.trim().is_empty() || aircraft::is_passive(title) {
            return;
        }
        let k = key(title);
        let i = *at.entry(k).or_insert_with(|| {
            order.push((title.to_string(), Vec::new()));
            order.len() - 1
        });
        for l in liveries {
            if !l.trim().is_empty() && !order[i].1.iter().any(|x| x.eq_ignore_ascii_case(l)) {
                order[i].1.push(l.clone());
            }
        }
    };
    for (t, l) in sim_items {
        add(t, std::slice::from_ref(l));
    }
    for a in index.aircraft.iter().filter(|a| !a.sims.is_empty()) {
        add(&a.title, &a.liveries);
    }
    let mut known: Vec<&String> = d.known_aircraft.keys().collect();
    known.sort();
    for t in known {
        add(t, &[]);
    }
    let mut out: Vec<AircraftOption> = order
        .into_iter()
        .map(|(title, liveries)| {
            let addon = index.find(&title).filter(|a| !a.sims.is_empty());
            let known = d.known_aircraft.get(&title);
            let (class, src, confidence) = class_for(d, &title, "", addon);
            let (auto, auto_src, _) = auto_class(d, &title, "", addon);
            let (own, loading_source) = loading_for(&title, addon, prefs);
            let (auto_loading, _) = loading_for(&title, addon, &Prefs::default());
            let icao_type = addon
                .map(|a| a.icao_type.clone())
                .filter(|i| !i.is_empty())
                .or_else(|| known.and_then(|k| aircraft::icao_from_atc_model(&k.atc_model)).filter(|i| aircraft::classify_icao(i).is_some()))
                .unwrap_or_default();
            let real_type = addon
                .map(|a| a.real_type.clone())
                .filter(|r| !r.is_empty())
                .or_else(|| aircraft::icao_type_name(&icao_type).map(str::to_string))
                .or_else(|| families::family_of(&title).map(|f| f.name.clone()))
                .unwrap_or_default();
            // Uçuş kâğıdının değerleri: simin kendi değerleri (binildiyse) paketin dosyalarından önce gelir.
            let (specs, specs_source) = match (known, addon.and_then(|a| a.usable_specs())) {
                (Some(k), _) if k.specs.mtow_lb > 0.0 || k.specs.empty_lb > 0.0 => (Some(k.specs.clone()), "sim"),
                (_, Some(s)) => (Some(s.clone()), "cfg"),
                _ => (None, ""),
            };
            AircraftOption {
                flyable: class.is_some_and(|c| super::progression::can_fly(c, &held)),
                manages_own_loading: own,
                loading_source: loading_source.to_string(),
                auto_loading,
                origin: if addon.is_some() { "mod" } else { "sim" }.to_string(),
                package: addon.map(|a| AircraftPackage { id: a.package_id.clone(), title: a.package_title.clone(), creator: a.creator.clone(), simobject: a.simobject.clone() }),
                sims: addon.map(|a| a.sims.clone()).unwrap_or_default(),
                thumb: addon.is_some_and(|a| a.has_thumb()),
                icao_type,
                real_type,
                confidence,
                specs,
                specs_source: specs_source.to_string(),
                title,
                liveries,
                class,
                class_source: src.to_string(),
                auto_class: auto,
                auto_source: auto_src.to_string(),
            }
        })
        .collect();
    out.sort_by(|a, b| a.class.cmp(&b.class).then(a.title.to_lowercase().cmp(&b.title.to_lowercase())));
    out
}

/// Uçuş kâğıdı için paketin dosyalarından okunan değerler (uçak henüz simde yüklenmediyse).
pub fn specs_for(title: &str) -> Option<SimSpecs> {
    index().find(title).filter(|a| !a.sims.is_empty()).and_then(|a| a.usable_specs().cloned())
}

/// SimBrief ve arayüz için ICAO tip kodu (paketten).
pub fn icao_for(title: &str) -> Option<String> {
    index().find(title).map(|a| a.icao_type.clone()).filter(|i| !i.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::model::KnownAircraft;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("modstead-addons-{name}-{}", fsx::short_id()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    fn pkg(root: &Path, id: &str, sims: &[&str]) -> PackageInput {
        PackageInput { id: id.into(), title: id.into(), folder: id.into(), path: root.to_path_buf(), sims: sims.iter().map(|s| s.to_string()).collect(), ..Default::default() }
    }

    #[test]
    fn cfg_parser_handles_comments_quotes_and_duplicates() {
        let c = Cfg::parse(
            "\u{feff}; dosya başı yorumu\n\
             orphan = yok sayılır\n\
             [GENERAL]\n\
             atc_model = \"TT:ATCCOM.AC_MODEL A320.0.text\" ; yorum\n\
             icao_type_designator = \"A320\"\n\
             Category = Airplane // yorum\n\
             [FLTSIM.0]\n\
             title = \"Fenix; özel ad\" ; tırnaktaki ; yorum değil\n\
             ui_type = \"A320 | CFM\"\n\
             [general]\n\
             icao_manufacturer = AIRBUS\n\
             icao_type_designator = A20N\n\
             # diyez yorumu\n\
             bozuk satır\n\
             [WEIGHT_AND_BALANCE]\n\
             max_gross_weight =169754\n\
             empty_weight = 94137.5 ; (pounds)\n",
        );
        assert_eq!(c.get("general", "category"), Some("Airplane"));
        assert_eq!(c.get("general", "atc_model"), Some("TT:ATCCOM.AC_MODEL A320.0.text"));
        assert_eq!(c.get("general", "icao_manufacturer"), Some("AIRBUS"), "aynı bölüm iki kez: birleşir");
        assert_eq!(c.get("general", "icao_type_designator"), Some("A20N"), "aynı anahtar: sonuncusu");
        assert_eq!(c.get("fltsim.0", "title"), Some("Fenix; özel ad"));
        assert_eq!(c.get("fltsim.0", "ui_type"), Some("A320 | CFM"));
        assert_eq!(c.get("weight_and_balance", "empty_weight").and_then(num), Some(94137.5));
        assert!(c.section("orphan").is_none() && c.get("general", "orphan").is_none());
        assert_eq!(num("-4.5, -5.8, 2.6, 26, 1"), Some(-4.5));
        assert_eq!(num("abc"), None);
        assert_eq!(decode(&[b'a', 0xE9, b'b']), "aéb", "UTF-8 değilse Latin-1");
        assert_eq!(decode(&[0xFF, 0xFE, b'x', 0, b'y', 0]), "xy", "UTF-16 LE");
    }

    /// 2020 biçimi: birden çok [FLTSIM.n], ayrı flight_model/engines, eski [FUEL] tankları, AI sürümü atlanır.
    #[test]
    fn legacy_aircraft_with_liveries_and_specs() {
        let root = tmp("legacy");
        let a = "SimObjects/Airplanes/JF_PA28_Warrior";
        write(&root, &format!("{a}/aircraft.cfg"), "[VERSION]\nmajor = 1\n[GENERAL]\natc_type = \"TT:ATCCOM.ATC_NAME PIPER.0.text\"\natc_model = \"TT:ATCCOM.AC_MODEL_P28A.0.text\"\nCategory = \"airplane\"\nicao_type_designator = \"P28A\"\nicao_manufacturer = \"PIPER\"\n\n[FLTSIM.0]\ntitle = \"Just Flight PA-28-161 Warrior II G-BOYH\"\ntexture = \"BOYH\"\nui_manufacturer = \"Piper\"\nui_type = \"PA-28-161 Warrior II\"\nui_createdby = \"Just Flight\"\nisUserSelectable = 1\n\n[FLTSIM.1]\ntitle = \"Just Flight PA-28-161 Warrior II N123JF\"\ntexture = \"N123\"\n\n[FLTSIM.2]\ntitle = \"Warrior AI\"\nisUserSelectable = 0\n");
        write(&root, &format!("{a}/flight_model.cfg"), "[WEIGHT_AND_BALANCE]\nmax_gross_weight = 2440 ; lbs\nempty_weight = 1531\nmax_number_of_stations = 4\n[FUEL]\nLeftMain = -4.5, -5.8, 2.6, 24, 1\nRightMain = -4.5, 5.8, 2.6, 24, 1\n[REFERENCE SPEEDS]\ncruise_speed = 115\n");
        write(&root, &format!("{a}/engines.cfg"), "[GENERALENGINEDATA]\nengine_type = 0 ; 0=Piston\nEngine.0 = -2.6, 0, 0\n");
        write(&root, &format!("{a}/texture.BOYH/thumbnail.jpg"), "\u{FF}\u{D8}jpg");
        let idx = build(&[pkg(&root, "justflight-aircraft-pa28-warrior", &["msfs2020"])]);
        assert_eq!(idx.aircraft.len(), 2, "AI sürümü listede yok: {:?}", idx.aircraft.iter().map(|a| &a.title).collect::<Vec<_>>());
        let w = idx.find("just flight pa-28-161 warrior ii g-boyh").unwrap();
        assert_eq!(w.icao_type, "P28A");
        assert_eq!(w.real_type, "Piper PA-28 Cherokee");
        assert_eq!(w.specs.mtow_lb, 2440.0);
        assert_eq!(w.specs.empty_lb, 1531.0);
        assert_eq!(w.specs.engines, 1);
        assert_eq!(w.specs.fuel_capacity_gal, 48.0);
        assert_eq!(w.specs.cruise_kt, 115.0);
        assert_eq!(w.inference.unwrap().class, Class::LightPiston);
        assert_eq!(w.inference.unwrap().basis, "icao");
        assert_eq!(w.efb_developer, Some("Just Flight"));
        assert!(w.has_thumb(), "texture.BOYH/thumbnail.jpg");
        assert!(!idx.find("Just Flight PA-28-161 Warrior II N123JF").unwrap().has_thumb());
        assert!(idx.problems.is_empty(), "{:?}", idx.problems);
        fs::remove_dir_all(&root).unwrap();
    }

    /// 2024 modüler: ön ayar başlığı, eklerden kalıtımla değerler ve etiketler, etiketle eşleşen boyalar (başka
    /// paketten gelenler de), "Disabled" boya, küçük resim.
    #[test]
    fn modular_2024_presets_attachments_and_liveries() {
        let root = tmp("modular");
        let a = "SimObjects/Airplanes/FNX_32X";
        write(&root, &format!("{a}/common/config/aircraft.cfg"), "[VERSION]\nmajor = 1\n[SERVICES]\nJETWAY = 1\n");
        write(&root, &format!("{a}/presets/fnx/FNX_320_CFM_SL/config/aircraft.cfg"), "[fltsim.0]\ntitle = \"FenixA320 CFM SL\"\nui_manufacturer = \"Airbus\"\nui_type = \"A320 | CFM | SL\"\nui_createdby = \"FenixSim\"\nisuserselectable = 1\n");
        write(&root, &format!("{a}/presets/fnx/FNX_320_CFM_SL/config/flight_model.cfg"), "; generated file\n[MODULAR_MERGE]\nauto = true\n");
        write(&root, &format!("{a}/presets/fnx/FNX_320_CFM_SL/config/attached_objects.cfg"), "[sim_attachment.1]\nattachment_root = \"SimObjects/Airplanes/FNX_32X/attachments/fnx/Function_Interior\"\n[sim_attachment.0]\nattachment_root = \"SimObjects/Airplanes/FNX_32X/attachments/fnx/Function_Exterior_CFM_SL\"\n[sim_attachment.2]\nattachment_root = \"../../../Windows\"\n");
        write(&root, &format!("{a}/attachments/fnx/Function_Exterior_CFM_SL/attachment.cfg"), "[Inherit]\nbase = \"SimObjects\\Airplanes\\FNX_32X\\attachments\\fnx\\Part_Fuselage_A320\"\n[Tags]\ntag.0 = \"CFM\"\n");
        // Ekin kendi ekleri (gerçek Fenix'teki gibi): "SL" etiketi kanat ekinden gelir.
        write(&root, &format!("{a}/attachments/fnx/Function_Exterior_CFM_SL/config/attached_objects.cfg"), "[sim_attachment.0]\nattachment_root = \"SimObjects/Airplanes/FNX_32X/attachments/fnx/Part_Wings_SL\"\n");
        write(&root, &format!("{a}/attachments/fnx/Part_Wings_SL/attachment.cfg"), "[Tags]\ntag.0 = \"SL\"\n");
        write(&root, &format!("{a}/attachments/fnx/Function_Exterior_CFM_SL/config/flight_model.cfg"), "[WEIGHT_AND_BALANCE]\nmax_gross_weight =169754\nempty_weight =94137\nmax_number_of_stations =16\n[FUEL]\ncenter1 = -4.58, 0, -1.0, 2180, 3.1\nleftmain = -8.0, -10.3, 1.4, 2000, 0.5\nrightmain = -8.0, 10.3, 1.4, 2000, 0.5\n[REFERENCE SPEEDS]\ncruise_speed =460\n");
        write(&root, &format!("{a}/attachments/fnx/Function_Exterior_CFM_SL/config/engines.cfg"), "[GENERALENGINEDATA]\nengine_type = 1 ; 0=Piston, 1=Jet\nengine.0 = 6, -19.3, -4.0\nengine.1 = 6, 19.3, -4.0\n");
        write(&root, &format!("{a}/attachments/fnx/Part_Fuselage_A320/attachment.cfg"), "[Tags]\ntag.0 = \"A320\"\n");
        write(&root, &format!("{a}/attachments/fnx/Part_Fuselage_A320/config/aircraft.cfg"), "[GENERAL]\natc_model = \"TT:ATCCOM.AC_MODEL A320.0.text\"\nCategory = \"Airplane\"\nicao_type_designator = \"A320\"\nicao_manufacturer = \"AIRBUS\"\nicao_engine_type = \"Jet\"\nicao_engine_count = 2\n");
        write(&root, &format!("{a}/liveries/fnx/House_CFM_SL/livery.cfg"), "[Version]\nmajor = 1\n[GENERAL]\nName = \"Fenix House Colors\"\n[Selection]\nrequired_tags = \"A320,CFM,SL\"\n");
        write(&root, &format!("{a}/liveries/fnx/House_CFM_SL/thumbnail/thumbnail.png"), "png");
        write(&root, &format!("{a}/liveries/fnx/House_Disabled/livery.cfg"), "[GENERAL]\nName = \"Fenix House Colors\"\n[Selection]\nrequired_tags = \"Disabled\"\n");
        write(&root, &format!("{a}/liveries/fnx/IAE_Only/livery.cfg"), "[GENERAL]\nname = \"IAE Only\"\n[SELECTION]\nrequired_tags = \"A320,IAE\"\n");
        write(&root, "manifest.json", "{\"title\":\"Fenix Airbus A320\",\"creator\":\"Fenix Simulations\"}");
        // Başka paketten gelen boya (fnx-aircraft-320-liveries).
        let liv = tmp("modular-liv");
        write(&liv, &format!("{a}/liveries/fnx/thy-tc-jpp/livery.cfg"), "[SELECTION]\nrequired_tags = \"A320,CFM,SL\"\n[GENERAL]\nname = \"Turkish Airlines TC-JPP\"\n[FLTSIM]\natc_id = \"TC-JPP\"\n");
        write(&liv, &format!("{a}/liveries/fnx/thy-tc-jpp/thumbnail/thumbnail.png"), "png");
        let mut fenix = pkg(&root, "fnx-aircraft-320", &["msfs2024"]);
        fenix.title = "Fenix Airbus A320".into();
        fenix.creator = "Fenix Simulations".into();
        let idx = build(&[fenix, pkg(&liv, "fnx-aircraft-320-liveries", &["msfs2024"])]);
        assert_eq!(idx.aircraft.len(), 1);
        let f = &idx.aircraft[0];
        assert_eq!(f.title, "FenixA320 CFM SL");
        assert!(f.modular);
        assert_eq!(f.icao_type, "A320");
        assert_eq!(f.real_type, "Airbus A320");
        assert_eq!(f.specs.engine_type, 1);
        assert_eq!(f.specs.engines, 2);
        assert_eq!(f.specs.mtow_lb, 169_754.0);
        assert_eq!(f.specs.empty_lb, 94_137.0);
        assert_eq!(f.specs.fuel_capacity_gal, 6180.0);
        assert_eq!(f.specs.payload_stations, 16);
        assert_eq!(f.inference.unwrap().class, Class::Narrowbody);
        assert_eq!(f.efb_developer, Some("Fenix"));
        assert_eq!(f.liveries, vec!["Fenix House Colors".to_string(), "Turkish Airlines TC-JPP".to_string()], "IAE ve Disabled boyalar eşleşmez");
        assert!(f.thumbs.iter().any(|t| t.livery == "Turkish Airlines TC-JPP"));
        assert!(idx.problems.iter().any(|p| p.reason.contains("dışına")), "{:?}", idx.problems);
        // Küçük resim yalnızca paket klasörünün içinden.
        install(idx);
        assert_eq!(thumbnail("FenixA320 CFM SL", Some("Turkish Airlines TC-JPP")).unwrap(), b"png");
        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&liv).unwrap();
    }

    /// 2020 boya paketi tabanın (başka paket) değerlerini alır; helikopter klasörü; hiçbir simde etkin olmayan paket
    /// listede yoktur; okunamayan cfg sorun olarak kaydedilir.
    #[test]
    fn livery_packages_inherit_rotorcraft_and_unlinked() {
        let base = tmp("base");
        write(&base, "SimObjects/Airplanes/Asobo_Kodiak/aircraft.cfg", "[GENERAL]\nicao_type_designator = KODI\n[FLTSIM.0]\ntitle = \"Daher Kodiak 100 Base\"\n");
        write(&base, "SimObjects/Airplanes/Asobo_Kodiak/flight_model.cfg", "[WEIGHT_AND_BALANCE]\nmax_gross_weight = 7255\nempty_weight = 3700\n");
        write(&base, "SimObjects/Airplanes/Asobo_Kodiak/engines.cfg", "[GENERALENGINEDATA]\nengine_type = 5\nEngine.0 = 0,0,0\n");
        let liv = tmp("livpack");
        write(&liv, "SimObjects/Airplanes/Kodiak_Livery_Alaska/aircraft.cfg", "[VARIATION]\nbase_container = \"..\\Asobo_Kodiak\"\n[FLTSIM.0]\ntitle = \"Kodiak Alaska Bush\"\ntexture = \"ALASKA\"\n");
        let heli = tmp("heli");
        write(&heli, "SimObjects/Rotorcraft/Cowan_B206/aircraft.cfg", "[FLTSIM.0]\ntitle = \"Bell 206 JetRanger\"\n");
        let off = tmp("off");
        write(&off, "SimObjects/Airplanes/X/aircraft.cfg", "[FLTSIM.0]\ntitle = \"Unlinked Jet\"\n");
        let bad = tmp("bad");
        write(&bad, "SimObjects/Airplanes/Y/aircraft.cfg", "[GENERAL]\nCategory = airplane\n");
        let idx = build(&[pkg(&base, "kodiak-base", &["msfs2020"]), pkg(&liv, "kodiak-livery", &["msfs2020", "msfs2024"]), pkg(&heli, "cowan-206", &["msfs2024"]), pkg(&off, "off", &[]), pkg(&bad, "bad", &["msfs2024"])]);
        let k = idx.find("Kodiak Alaska Bush").unwrap();
        assert_eq!(k.specs.mtow_lb, 7255.0, "tabanın değerleri");
        assert_eq!(k.inference.unwrap().class, Class::TurbopropSingle);
        assert_eq!(k.sims, vec!["msfs2020".to_string(), "msfs2024".to_string()]);
        let h = idx.find("Bell 206 JetRanger").unwrap();
        assert_eq!(h.inference.unwrap(), Inference { class: Class::Helicopter, confidence: Confidence::High, basis: "rotorcraft" });
        assert!(idx.find("Unlinked Jet").is_none());
        assert!(idx.problems.iter().any(|p| p.package == "bad" && p.reason.contains("başlık")), "{:?}", idx.problems);
        for d in [base, liv, heli, off, bad] {
            fs::remove_dir_all(&d).unwrap();
        }
    }

    #[test]
    fn package_junctions_are_not_followed() {
        let outside = tmp("outside");
        write(&outside, "aircraft.cfg", "[FLTSIM.0]\ntitle = \"Escaped\"\n");
        let root = tmp("junction");
        fs::create_dir_all(root.join("SimObjects/Airplanes")).unwrap();
        crate::util::create_junction(&outside, &root.join("SimObjects/Airplanes/Link")).unwrap();
        let idx = build(&[pkg(&root, "junction", &["msfs2024"])]);
        assert!(idx.aircraft.is_empty(), "paketin içindeki bağlantı izlenmez");
        fs::remove_dir(root.join("SimObjects/Airplanes/Link")).unwrap();
        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&outside).unwrap();
    }

    fn addon(title: &str, icao: &str, inference: Option<Inference>, dev: Option<&'static str>) -> AddonAircraft {
        AddonAircraft {
            title: title.into(),
            package_id: "pkg".into(),
            package_title: "Paket".into(),
            sims: vec!["msfs2024".into()],
            icao_type: icao.into(),
            inference,
            efb_developer: dev,
            liveries: vec!["Mod Boya".into()],
            specs: SimSpecs { engine_type: 1, engines: 2, mtow_lb: 174_200.0, empty_lb: 91_300.0, fuel_capacity_gal: 6875.0, ..Default::default() },
            engine_type_known: true,
            ..Default::default()
        }
    }

    #[test]
    fn merge_dedupes_sim_and_library_entries() {
        let mut d = CareerData::default();
        d.known_aircraft.insert("C172SP G1000 Passengers".into(), KnownAircraft { title: "C172SP G1000 Passengers".into(), class: Some(Class::LightPiston), ..Default::default() });
        d.class_overrides.insert("Garip Mod".into(), Class::Bizjet);
        let index = Index {
            aircraft: vec![
                addon("PMDG 737-800 Mod", "B738", Some(Inference { class: Class::Narrowbody, confidence: Confidence::High, basis: "icao" }), Some("PMDG")),
                addon("Garip Mod", "", None, None),
                AddonAircraft { sims: vec![], ..addon("Hiçbir Simde", "B738", None, None) },
            ],
            ..Default::default()
        };
        let sim = vec![
            ("pmdg 737-800 MOD".to_string(), "".to_string()),
            ("pmdg 737-800 MOD".to_string(), "Sim Boya".to_string()),
            ("C172SP G1000 Passengers".to_string(), "Flight Seeing 01".to_string()),
            ("Asobo PassiveAircraft Bonanza 33".to_string(), "".to_string()),
        ];
        let prefs = Prefs::default();
        let list = merge(&d, &sim, &index, &prefs);
        let titles: Vec<&str> = list.iter().map(|o| o.title.as_str()).collect();
        assert_eq!(list.len(), 3, "{titles:?}");
        let p = list.iter().find(|o| o.title.eq_ignore_ascii_case("PMDG 737-800 Mod")).unwrap();
        assert_eq!(p.title, "pmdg 737-800 MOD", "simin yazımı kalır");
        assert_eq!(p.origin, "mod");
        assert_eq!(p.liveries, vec!["Sim Boya".to_string(), "Mod Boya".to_string()]);
        assert_eq!((p.class, p.class_source.as_str(), p.confidence), (Some(Class::Narrowbody), "icao", Some(Confidence::High)));
        assert!(p.manages_own_loading && p.loading_source == "package");
        assert_eq!(p.real_type, "Boeing 737-800", "ICAO kodundan");
        assert_eq!(p.specs_source, "cfg");
        let c = list.iter().find(|o| o.title == "C172SP G1000 Passengers").unwrap();
        assert_eq!((c.origin.as_str(), c.class_source.as_str()), ("sim", "sim"));
        assert_eq!(c.real_type, "Cessna 172 Skyhawk");
        let g = list.iter().find(|o| o.title == "Garip Mod").unwrap();
        assert_eq!((g.class, g.class_source.as_str(), g.confidence), (Some(Class::Bizjet), "user", None));
        assert_eq!((g.auto_class, g.auto_source.as_str()), (None, "unknown"), "elle seçim olmasa sınıf bilinmiyor");
        assert!(!titles.contains(&"Hiçbir Simde"));
        // Elle seçim paketi geçersiz kılar.
        let prefs = Prefs { own_loading: [("PMDG 737-800 MOD".to_string(), false)].into_iter().collect() };
        let p = merge(&d, &sim, &index, &prefs).into_iter().find(|o| o.origin == "mod" && o.class == Some(Class::Narrowbody)).unwrap();
        assert!(!p.manages_own_loading && p.loading_source == "user" && p.auto_loading, "otomatik olsa kendi EFB'si");
    }

    #[test]
    fn icao_beats_weight_and_sim_specs_win_for_dispatch() {
        let mut d = CareerData::default();
        // Simde binilen 737-700: ağırlıktan bölgesel jet sanılır, tip kodu dar gövde der.
        d.known_aircraft.insert(
            "Mod 737-700".into(),
            KnownAircraft {
                title: "Mod 737-700".into(),
                atc_model: "TT:ATCCOM.AC_MODEL_B737.0.text".into(),
                class: Some(Class::RegionalJet),
                specs: SimSpecs { engine_type: 1, engines: 2, mtow_lb: 154_500.0, empty_lb: 83_000.0, ..Default::default() },
                ..Default::default()
            },
        );
        let index = Index { aircraft: vec![addon("Mod 737-700", "", None, None)], ..Default::default() };
        let o = merge(&d, &[], &index, &Prefs::default()).remove(0);
        assert_eq!((o.class, o.class_source.as_str()), (Some(Class::Narrowbody), "icao"));
        assert_eq!(o.specs.as_ref().unwrap().mtow_lb, 154_500.0, "simin değerleri paketinkinden önce");
        assert_eq!(o.specs_source, "sim");
        assert_eq!(o.icao_type, "B737");
    }

    /// Bu makinedeki gerçek kütüphaneyi ve Community klasörlerini SALT OKUNUR tarar, bulunan mod uçaklarını ve
    /// okunamayan dosyaları yazar; simin son listesiyle (`aircraft.json` önbelleği) birleşmeyi de gösterir:
    /// `cargo test -p game-msfs real_addon_aircraft -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_addon_aircraft() {
        let appdata = PathBuf::from(std::env::var_os("APPDATA").expect("APPDATA"));
        let local = PathBuf::from(std::env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA"));
        let settings: crate::settings::MsfsSettings = ["app.modstead", "app.modstead-dev-msfs"]
            .iter()
            .map(|d| fsx::read_json::<crate::settings::MsfsSettings>(&appdata.join(d).join("games/msfs/settings.json")))
            .find(|s| s.library_path.is_some())
            .unwrap_or_default();
        let sims = crate::sims::detect_sims(&settings);
        for s in &sims {
            println!("{} detected={} running={} community={:?}", s.id, s.detected, s.running, s.community_path);
        }
        let scan = crate::scanner::scan(sims, settings.library_path.clone(), &crate::store::Db::default(), &mut crate::scanner::ScanCache::default());
        let t = std::time::Instant::now();
        let packages = packages_from_scan(&scan);
        let idx = build(&packages);
        println!(
            "kütüphane {:?}: {} paket ({} simde etkin), {} uçak paketi, {} mod uçağı, {} sorun, {:?}",
            settings.library_path,
            packages.len(),
            idx.packages,
            idx.aircraft_packages,
            idx.aircraft.len(),
            idx.problems.len(),
            t.elapsed()
        );
        for a in &idx.aircraft {
            println!(
                "- {} | paket {} | {:?} | {} | ICAO {} ({}) | sınıf {:?} | EFB {:?} | motor {}×{} | MTOW {} lb, boş {} lb, yakıt {} gal, seyir {} kt | {} boya | {} küçük resim",
                a.title,
                a.package_id,
                a.sims,
                if a.modular { "2024 modüler" } else { "cfg" },
                a.icao_type,
                a.real_type,
                a.inference.map(|i| (i.class, i.confidence, i.basis)),
                a.efb_developer,
                a.specs.engines,
                a.specs.engine_type,
                a.specs.mtow_lb,
                a.specs.empty_lb,
                a.specs.fuel_capacity_gal,
                a.specs.cruise_kt,
                a.liveries.len(),
                a.thumbs.len()
            );
        }
        for p in &idx.problems {
            println!("! {} {} — {}", p.package, p.path, p.reason);
        }
        let installed: super::super::Installed = ["app.modstead", "app.modstead-dev-msfs"]
            .iter()
            .map(|d| fsx::read_json::<super::super::Installed>(&local.join(d).join("games/msfs/career/aircraft.json")))
            .find(|i| !i.items.is_empty())
            .unwrap_or_default();
        let merged = merge(&CareerData::default(), &installed.items, &idx, &Prefs::default());
        let mods: Vec<&AircraftOption> = merged.iter().filter(|o| o.origin == "mod").collect();
        println!("birleşik liste: {} uçak (simin listesinde {} kayıt), {} mod", merged.len(), installed.items.len(), mods.len());
        for o in mods {
            println!("  mod: {} · {:?} ({}) · {} boya · EFB {} ({})", o.title, o.class, o.class_source, o.liveries.len(), o.manages_own_loading, o.loading_source);
        }
    }
}
