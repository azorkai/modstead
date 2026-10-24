//! Hazırlık denetimi: bir paketin Community klasöründe durması, simde yüklenip çalışacağı anlamına gelmez.
//!
//! Her etkin mod için, etkin olduğu HER sim ayrı ayrı denetlenir:
//! - **Sim tanıması** (Content.xml): sim paketi görmüş mü, İçerik Yöneticisi'nde kapatılmış mı?
//!   2024: `LocalCache\<oyuncu>\Content.xml`, `<Package name="communityfs24-fnx-aircraft-320" active="Activated"/>`;
//!   önek simin paketi hangi SDK ile derlenmiş saydığını gösterir (`communityfs20-` / `communityfs24-`).
//!   Değerler: `Activated`, `UserDisabled`, `SystemDisabled`. `UserDisabled` paket YÜKLENMEZ.
//!   2020: yapılandırma klasöründe `Content.xml`, düz paket adları ve `active="true"/"false"`; SU10'dan beri
//!   simin çekirdeği bu dosyayı büyük ölçüde kullanmaz, bu yüzden 2020'deki `false` yalnızca uyarıdır.
//! - **Yardımcı programlar** (exe.xml, requirements.json): Fenix A320 ancak FenixBootstrapper sim tarafından
//!   başlatılırsa çalışır; GSX ancak Couatl başlatılırsa. Girdi o simin exe.xml'inde olmalı, kapatılmamış olmalı
//!   ve program diskte bulunmalı.
//! - **Paket sağlığı**: manifest.json alanları, layout.json, Windows'un 260 karakterlik yol sınırı.
//!
//! Taramada hızlı denetimler yapılır (Content.xml / exe.xml değişiklik zamanına göre önbelleklenir);
//! `verify` ise isteğe bağlı derin denetimdir (layout.json'daki her dosyanın diskte varlığı ve boyutu).

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, SystemTime};

use modstead_core::fsx::norm_key;
use modstead_core::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::exexml::{ExeXml, LaunchAddon};
use crate::package::path_len;
use crate::scanner::{Issue, ModEntry, ScanResult, SimState};
use crate::sims::{SimInstall, SIM_2020, SIM_2024};

/// Windows MAX_PATH 260'tır ve sondaki NUL karakterini de sayar: kullanılabilir en uzun yol 259 karakter.
pub const MAX_PATH_CHARS: usize = 259;
/// Bu uzunluğun üstü "sınıra yakın" uyarısı alır.
pub const PATH_WARN_CHARS: usize = 240;

// ---------- Veri türleri ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadinessCheck {
    /// Denetimin kimliği; aynı mod için tekildir (ör. `content:msfs2024`, `req:fenix-system:msfs2024`).
    pub id: String,
    /// Sonucun kararlı kodu (ör. `sim-user-disabled`, `companion-not-registered`, `path-too-long`).
    pub code: String,
    /// ok | warn | error | unknown
    pub status: String,
    /// sim | companion | package | path | files
    pub group: String,
    pub sim: Option<String>,
    pub title: String,
    pub detail: String,
    /// İsteğe bağlı bir yardımcıya ait denetim: eksikliği modun yüklenmesini engellemez, yalnızca özellik kaybıdır.
    pub optional: bool,
    /// Kullanıcıya ne yapacağını anlatan kısa öneri.
    pub hint: Option<String>,
    /// Modstead'in uygulayabileceği düzeltme (yalnızca açık komutla, yedek alınarak).
    pub fix: Option<ReadinessFix>,
    /// Bilgi tabanı girdisinin kaynağı (geliştirici belgesi).
    pub source: Option<String>,
    /// Etkilenen öğe sayısı (ör. yol sınırını aşan dosyalar); arayüzün kısa özeti için.
    pub count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReadinessFix {
    /// exe.xml'deki kapatılmış (`<Disabled>True</Disabled>`) girdiyi yeniden aç.
    EnableExeEntry { sim: String, name: String, path: String },
    /// Content.xml'de `UserDisabled` olan paketi `Activated` yap.
    ActivateContentPackage { sim: String, package: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixOutcome {
    pub message: String,
    pub file: PathBuf,
    pub backup: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModVerification {
    pub id: String,
    pub title: String,
    pub checks: Vec<ReadinessCheck>,
    /// ok | warn | error | unknown — en kötü sonuç.
    pub status: String,
    pub files_checked: u32,
    pub duration_ms: u64,
    pub verified_at: String,
}

fn check(id: impl Into<String>, code: &str, status: &str, group: &str, sim: Option<&str>, title: impl Into<String>, detail: impl Into<String>) -> ReadinessCheck {
    ReadinessCheck {
        id: id.into(),
        code: code.into(),
        status: status.into(),
        group: group.into(),
        sim: sim.map(String::from),
        title: title.into(),
        detail: detail.into(),
        optional: false,
        hint: None,
        fix: None,
        source: None,
        count: None,
    }
}

impl ReadinessCheck {
    fn hint(mut self, h: impl Into<String>) -> Self {
        self.hint = Some(h.into());
        self
    }
    fn hint_opt(mut self, h: Option<&String>) -> Self {
        self.hint = h.cloned();
        self
    }
    fn fix(mut self, f: ReadinessFix) -> Self {
        self.fix = Some(f);
        self
    }
    fn source(mut self, s: Option<&String>) -> Self {
        self.source = s.cloned();
        self
    }
    fn with_count(mut self, n: Option<usize>) -> Self {
        self.count = n;
        self
    }
}

fn status_rank(s: &str) -> u8 {
    match s {
        "error" => 3,
        "warn" => 2,
        "unknown" => 1,
        _ => 0,
    }
}

/// En kötü sonuç; isteğe bağlı yardımcıların denetimleri sayılmaz (modun çalışmasını engellemezler).
pub fn worst_status(checks: &[ReadinessCheck]) -> String {
    checks.iter().filter(|c| !c.optional).map(|c| c.status.as_str()).max_by_key(|s| status_rank(s)).unwrap_or("ok").to_string()
}

fn sim_short(sim: &str) -> &'static str {
    if sim == SIM_2020 {
        "2020"
    } else {
        "2024"
    }
}

fn is_active(st: &SimState) -> bool {
    matches!(st.state.as_str(), "enabled" | "physical" | "foreign")
}

// ---------- Content.xml ----------

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Activation {
    Active,
    UserDisabled,
    SystemDisabled,
    Other(String),
}

impl Activation {
    fn from_raw(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "activated" | "true" => Activation::Active,
            "userdisabled" | "false" => Activation::UserDisabled,
            "systemdisabled" => Activation::SystemDisabled,
            _ => Activation::Other(raw.trim().to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ContentRecord {
    /// Dosyadaki adıyla (ör. `communityfs24-fnx-aircraft-320`).
    pub raw_name: String,
    /// 2024 biçiminde paketin kapsayıcısı: `community` ya da `community2024`. Resmi/marketplace paketlerde yok.
    pub container: Option<String>,
    /// 2024 biçiminde simin paketi saydığı SDK: `fs20` ya da `fs24`.
    pub sdk: Option<String>,
    /// Önekler atılmış klasör adı (küçük harf).
    pub folder: String,
    pub active_raw: String,
    pub activation: Activation,
}

#[derive(Debug, Clone, Default)]
pub struct ContentXml {
    pub records: Vec<ContentRecord>,
    /// "2024" (Activated/UserDisabled, önekli adlar) ya da "2020" (true/false, düz adlar)
    pub format: String,
}

impl ContentXml {
    /// Community paketine ait kayıtlar (klasör adı ya da bağlantı adıyla).
    pub fn community(&self, folder: &str) -> Vec<&ContentRecord> {
        let f = folder.to_lowercase();
        self.records
            .iter()
            .filter(|r| r.folder == f && (self.format == "2020" || r.container.is_some()))
            .collect()
    }
}

static PKG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<Package\b([^>]*)>").unwrap());
static ATTR_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')"#).unwrap());
static ACTIVE_ATTR_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"(?i)(\bactive\s*=\s*)(?:"([^"]*)"|'([^']*)')"#).unwrap());
static COMMUNITY_NAME_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(community2024|community)(fs\d{2})-(.+)$").unwrap());
static OFFICIAL_NAME_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(fs\d{2})-(.+)$").unwrap());

fn attrs(element: &str) -> HashMap<String, String> {
    ATTR_RE
        .captures_iter(element)
        .map(|c| {
            let v = c.get(2).or_else(|| c.get(3)).map(|m| m.as_str()).unwrap_or_default();
            (c[1].to_ascii_lowercase(), v.replace("&amp;", "&"))
        })
        .collect()
}

pub fn parse_content_xml(text: &str) -> ContentXml {
    let raw: Vec<(String, String)> = PKG_RE
        .captures_iter(text)
        .filter_map(|c| {
            let a = attrs(&c[1]);
            let name = a.get("name")?.trim().to_string();
            (!name.is_empty()).then(|| (name, a.get("active").cloned().unwrap_or_default()))
        })
        .collect();
    let is_2024 = raw.iter().any(|(n, a)| {
        let a = a.to_ascii_lowercase();
        matches!(a.as_str(), "activated" | "userdisabled" | "systemdisabled") || COMMUNITY_NAME_RE.is_match(&n.to_lowercase())
    });
    let records = raw
        .into_iter()
        .map(|(name, active)| {
            let lower = name.to_lowercase();
            let (container, sdk, folder) = if is_2024 {
                if let Some(c) = COMMUNITY_NAME_RE.captures(&lower) {
                    (Some(c[1].to_string()), Some(c[2].to_string()), c[3].to_string())
                } else if let Some(c) = OFFICIAL_NAME_RE.captures(&lower) {
                    (None, Some(c[1].to_string()), c[2].to_string())
                } else {
                    (None, None, lower.clone())
                }
            } else {
                (None, None, lower.clone())
            };
            ContentRecord { activation: Activation::from_raw(&active), raw_name: name, container, sdk, folder, active_raw: active }
        })
        .collect();
    ContentXml { records, format: if is_2024 { "2024" } else { "2020" }.into() }
}

/// Content.xml'de adı verilen paketin `active` değerini değiştirir (kopya kayıtların hepsi). Önce yedek alınır.
pub fn set_content_active(content_xml: &Path, package: &str, value: &str) -> AppResult<PathBuf> {
    let bytes = fs::read(content_xml)?;
    let Ok(text) = String::from_utf8(bytes) else {
        return Err(AppError::msg(tr!("Content.xml UTF-8 değil; bozmamak için değiştirilmedi.", "Content.xml is not UTF-8; it was left unchanged to avoid damaging it.")));
    };
    let mut out = String::with_capacity(text.len() + 16);
    let mut last = 0usize;
    let mut changed = 0usize;
    for c in PKG_RE.captures_iter(&text) {
        let inner = c.get(1).unwrap();
        let a = attrs(inner.as_str());
        if !a.get("name").map(|n| n.trim().eq_ignore_ascii_case(package)).unwrap_or(false) {
            continue;
        }
        let Some(m) = ACTIVE_ATTR_RE.captures(inner.as_str()) else { continue };
        let val = m.get(2).or_else(|| m.get(3)).unwrap();
        if val.as_str() == value {
            continue;
        }
        let abs_start = inner.start() + val.start();
        let abs_end = inner.start() + val.end();
        out.push_str(&text[last..abs_start]);
        out.push_str(value);
        last = abs_end;
        changed += 1;
    }
    if changed == 0 {
        return Err(AppError::msg(tr!(
            format!("Content.xml'de değiştirilecek “{package}” kaydı bulunamadı (zaten etkin olabilir)."),
            format!("No “{package}” record to change was found in Content.xml (it may already be enabled).")
        )));
    }
    out.push_str(&text[last..]);
    let backup = crate::util::backup_file(content_xml)?;
    crate::util::write_atomic(content_xml, &out)?;
    Ok(backup)
}

// ---------- Bilgi tabanı (requirements.json) ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KbRequirement {
    pub id: String,
    /// exeXml | program | package
    pub kind: String,
    /// required | optional
    pub level: String,
    pub app: String,
    #[serde(default)]
    pub app_en: Option<String>,
    /// exe.xml girdisi bu dosya adlarından birini başlatmalı (öncelikli eşleşme).
    #[serde(default)]
    pub exe_names: Vec<String>,
    /// exe.xml'deki `<Name>` değerleri (dosya adı eşleşmezse).
    #[serde(default)]
    pub entry_names: Vec<String>,
    /// `program` türü: bu yollardan biri diskte olmalı. `%ProgramFiles%` gibi değişkenler ve simin
    /// Community klasörleri için `{community}` açılır.
    #[serde(default)]
    pub paths: Vec<String>,
    /// Sim çalışırken bu süreçlerden biri de çalışıyor olmalı (küçük harf, ör. `fenix.exe`).
    #[serde(default)]
    pub processes: Vec<String>,
    /// `package` türü: aynı simde bu kalıplara uyan bir paket etkin olmalı.
    #[serde(default)]
    pub packages: Vec<String>,
    /// Boşsa iki sim için de geçerli.
    #[serde(default)]
    pub sims: Vec<String>,
    pub why: String,
    #[serde(default)]
    pub why_en: Option<String>,
    #[serde(default)]
    pub fix: Option<String>,
    #[serde(default)]
    pub fix_en: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
}

impl KbRequirement {
    /// Etkin dilde program adı, gerekçe ve öneri (İngilizcesi yoksa Türkçesi).
    pub fn app(&self) -> &str {
        if modstead_core::i18n::is_en() { self.app_en.as_deref().unwrap_or(&self.app) } else { &self.app }
    }
    pub fn why(&self) -> &str {
        if modstead_core::i18n::is_en() { self.why_en.as_deref().unwrap_or(&self.why) } else { &self.why }
    }
    pub fn fix_text(&self) -> Option<String> {
        if modstead_core::i18n::is_en() { self.fix_en.clone().or_else(|| self.fix.clone()) } else { self.fix.clone() }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KbAddon {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub name_en: Option<String>,
    pub packages: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
    pub requires: Vec<KbRequirement>,
}

impl KbAddon {
    pub fn display_name(&self) -> &str {
        if modstead_core::i18n::is_en() { self.name_en.as_deref().unwrap_or(&self.name) } else { &self.name }
    }
}

#[derive(Debug, Deserialize)]
struct KbFile {
    addons: Vec<KbAddon>,
}

pub struct Kb {
    pub addons: Vec<(KbAddon, Regex, Option<Regex>)>,
    package_patterns: HashMap<String, Regex>,
}

/// `fnx-aircraft-*` gibi basit kalıpları (yalnızca `*`) büyük/küçük harf duyarsız regex'e çevirir.
pub fn glob_regex(patterns: &[String]) -> Option<Regex> {
    if patterns.is_empty() {
        return None;
    }
    let alts: Vec<String> = patterns.iter().map(|p| p.split('*').map(regex::escape).collect::<Vec<_>>().join(".*")).collect();
    Regex::new(&format!("(?i)^(?:{})$", alts.join("|"))).ok()
}

impl Kb {
    pub fn parse(json: &str) -> Result<Kb, String> {
        let file: KbFile = serde_json::from_str(json).map_err(|e| e.to_string())?;
        let mut addons = Vec::new();
        let mut package_patterns = HashMap::new();
        for a in file.addons {
            let inc = glob_regex(&a.packages).ok_or_else(|| format!("{}: paket kalıbı yok", a.id))?;
            let exc = glob_regex(&a.exclude);
            for r in &a.requires {
                if !matches!(r.kind.as_str(), "exeXml" | "program" | "package") {
                    return Err(format!("{}: bilinmeyen gereksinim türü {}", r.id, r.kind));
                }
                if !matches!(r.level.as_str(), "required" | "optional") {
                    return Err(format!("{}: bilinmeyen düzey {}", r.id, r.level));
                }
                if r.kind == "package" {
                    let re = glob_regex(&r.packages).ok_or_else(|| format!("{}: paket kalıbı yok", r.id))?;
                    package_patterns.insert(r.id.clone(), re);
                }
            }
            addons.push((a, inc, exc));
        }
        Ok(Kb { addons, package_patterns })
    }

    /// Paket adına (klasör ya da bağlantı adı) uyan bilgi tabanı girdileri.
    pub fn matching(&self, names: &[&str]) -> Vec<&KbAddon> {
        self.addons
            .iter()
            .filter(|(_, inc, exc)| names.iter().any(|n| inc.is_match(n) && !exc.as_ref().map(|e| e.is_match(n)).unwrap_or(false)))
            .map(|(a, _, _)| a)
            .collect()
    }
}

pub static KB: LazyLock<Kb> = LazyLock::new(|| Kb::parse(include_str!("requirements.json")).expect("requirements.json geçersiz"));

/// `%ProgramFiles%` gibi ortam değişkenlerini açar.
fn expand_env(s: &str) -> String {
    static VAR_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"%([A-Za-z0-9_()]+)%").unwrap());
    VAR_RE.replace_all(s, |c: &regex::Captures| std::env::var(&c[1]).unwrap_or_else(|_| c[0].to_string())).into_owned()
}

// ---------- Sim bağlamı (tarama başına bir kez) ----------

type Stamp = (Option<SystemTime>, u64);

fn stamp(p: &Path) -> Option<Stamp> {
    let m = fs::metadata(p).ok()?;
    Some((m.modified().ok(), m.len()))
}

/// Content.xml ve exe.xml ayrıştırma önbelleği: dosya değişmediyse yeniden okunmaz.
#[derive(Default)]
pub struct FileCache {
    content: HashMap<String, (Stamp, Arc<ContentXml>)>,
    exe: HashMap<String, (Stamp, Arc<ExeXml>)>,
}

impl FileCache {
    fn content(&mut self, p: &Path) -> Option<Arc<ContentXml>> {
        let st = stamp(p)?;
        let key = norm_key(p);
        if let Some((s, v)) = self.content.get(&key) {
            if *s == st {
                return Some(v.clone());
            }
        }
        let text = String::from_utf8_lossy(&fs::read(p).ok()?).into_owned();
        let v = Arc::new(parse_content_xml(&text));
        self.content.insert(key, (st, v.clone()));
        Some(v)
    }

    fn exe(&mut self, p: &Path) -> Option<Arc<ExeXml>> {
        let st = stamp(p)?;
        let key = norm_key(p);
        if let Some((s, v)) = self.exe.get(&key) {
            if *s == st {
                return Some(v.clone());
            }
        }
        let v = Arc::new(crate::exexml::read_file(p)?);
        self.exe.insert(key, (st, v.clone()));
        Some(v)
    }
}

pub struct SimContext {
    pub id: String,
    pub short: String,
    pub running: bool,
    /// Simin okuduğu Community klasörleri.
    pub containers: Vec<PathBuf>,
    /// Çalışan süreç adları (küçük harf); yalnızca bir sim açıkken doldurulur.
    pub processes: Arc<HashSet<String>>,
    pub content_path: Option<PathBuf>,
    pub content: Option<Arc<ContentXml>>,
    pub content_modified: Option<SystemTime>,
    pub exe_path: Option<PathBuf>,
    pub exe: Option<Arc<ExeXml>>,
    /// exe.xml'deki her yolun diskte olup olmadığı (her taramada yeniden bakılır: program kaldırılmış olabilir).
    pub exe_exists: HashMap<String, bool>,
    /// Bu simde etkin paketlerin adları (klasör ve bağlantı adı, küçük harf).
    pub active_packages: HashSet<String>,
}

pub fn contexts(sims: &[SimInstall], cache: &mut FileCache) -> Vec<SimContext> {
    let processes: Arc<HashSet<String>> =
        Arc::new(if sims.iter().any(|s| s.running) { modstead_core::platform::running_processes().into_iter().collect() } else { HashSet::new() });
    sims.iter()
        .filter(|s| s.usable())
        .map(|s| {
            // Sim bilgisi taramadan önce alınmış olabilir; Content.xml'i yeniden ara (sim arada yazmış olabilir).
            let content_path = s
                .content_xml
                .clone()
                .filter(|p| p.is_file())
                .or_else(|| s.config_dir.as_deref().and_then(|d| crate::sims::find_content_xml(&s.id, d)));
            let content = content_path.as_deref().and_then(|p| cache.content(p));
            let content_modified = content_path.as_deref().and_then(|p| fs::metadata(p).ok()).and_then(|m| m.modified().ok());
            let exe_path = s.exe_xml.clone().or_else(|| s.config_dir.as_ref().map(|d| d.join("exe.xml")));
            let exe = exe_path.as_deref().and_then(|p| cache.exe(p));
            let exe_exists = exe
                .as_ref()
                .map(|x| x.addons.iter().map(|a| (a.path.to_lowercase(), !a.path.is_empty() && Path::new(&a.path).is_file())).collect())
                .unwrap_or_default();
            SimContext {
                id: s.id.clone(),
                short: s.short.clone(),
                running: s.running,
                containers: s.containers().into_iter().map(|(_, p)| p).collect(),
                processes: processes.clone(),
                content_path,
                content,
                content_modified,
                exe_path,
                exe,
                exe_exists,
                active_packages: HashSet::new(),
            }
        })
        .collect()
}

/// Simde paketin göründüğü ad: Community'deki bağlantı/klasör adı.
fn sim_name(m: &ModEntry, st: &SimState) -> String {
    st.link_path
        .as_deref()
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| m.info.folder.to_lowercase())
}

pub fn fill_active<'a>(ctxs: &mut [SimContext], mods: impl Iterator<Item = &'a ModEntry>) {
    for m in mods {
        for ctx in ctxs.iter_mut() {
            if let Some(st) = m.sims.get(&ctx.id).filter(|st| is_active(st)) {
                ctx.active_packages.insert(sim_name(m, st));
                ctx.active_packages.insert(m.info.folder.to_lowercase());
            }
        }
    }
}

// ---------- Denetimler ----------

fn package_checks(m: &ModEntry, out: &mut Vec<ReadinessCheck>) {
    if !m.info.manifest_ok {
        out.push(
            check(
                "manifest",
                "bad-manifest",
                "error",
                "package",
                None,
                tr!("manifest.json okunamadı — sim paketi yüklemez", "manifest.json could not be read — the sim will not load the package"),
                tr!("Dosya yok ya da geçerli JSON değil.", "The file is missing or is not valid JSON."),
            )
            .hint(tr!("Paketi yeniden indirip kurun.", "Download and install the package again.")),
        );
    } else if !m.info.missing_manifest_fields.is_empty() {
        out.push(
            check(
                "manifest",
                "manifest-fields",
                "warn",
                "package",
                None,
                tr!("manifest.json'da temel alanlar eksik", "Basic fields are missing in manifest.json"),
                tr!(
                    format!(
                        "Eksik: {}. SDK bu alanları her pakete yazar; eksikliği paketin elle hazırlandığını ya da bozulduğunu gösterebilir. Sim çoğu durumda yine de yükler.",
                        m.info.missing_manifest_fields.join(", ")
                    ),
                    format!(
                        "Missing: {}. The SDK writes these fields into every package; their absence can mean the package was assembled by hand or is damaged. The sim usually loads it anyway.",
                        m.info.missing_manifest_fields.join(", ")
                    )
                ),
            )
            .hint(tr!("Paketin güncel sürümünü kurun.", "Install the current version of the package.")),
        );
    } else {
        out.push(check("manifest", "manifest-ok", "ok", "package", None, tr!("manifest.json geçerli", "manifest.json is valid"), tr!("Temel alanlar tam.", "Basic fields are complete.")));
    }
    if m.info.manifest_ok && !m.info.has_layout {
        out.push(
            check(
                "layout",
                "no-layout",
                "warn",
                "package",
                None,
                tr!("layout.json yok", "No layout.json"),
                tr!(
                    "Sim, layout.json'da listelenmeyen dosyaları görmez; paket eksik yüklenebilir.",
                    "The sim does not see files that are not listed in layout.json; the package may load incompletely."
                ),
            )
            .hint(tr!("MSFSLayoutGenerator ile yeniden oluşturun ya da paketi yeniden kurun.", "Regenerate it with MSFSLayoutGenerator or reinstall the package.")),
        );
    } else if m.info.has_layout {
        out.push(check(
            "layout",
            "layout-present",
            "ok",
            "package",
            None,
            tr!("layout.json var", "layout.json present"),
            tr!(format!("{} dosya listeli.", m.info.file_count), format!("{} files listed.", m.info.file_count)),
        ));
    }
}

/// Bağlantı yolu verildiğinde sınırı aşan göreli yol sayısı (uzunluklar büyükten küçüğe sıralı).
pub fn count_over(lengths: &[u16], link: &Path) -> usize {
    let base = path_len(&link.display().to_string()) + 1;
    lengths.iter().take_while(|l| base + **l as usize > MAX_PATH_CHARS).count()
}

/// Simin göreceği en uzun yol: `<Community bağlantısı>\<layout yolu>`.
///
/// Neden hata: Asobo simin uzun yolları desteklemesi gerektiğini söylüyor ama kodun bazı bölümlerinin bunu
/// yapmayabileceğini kabul ediyor (devsupport #4303, 2022); MSFS 2024'te Windows'ta LongPathsEnabled=1 iken bile
/// sorun bildirildi (devsupport #11944, 2024). Etkilenen dosyalar sessizce yüklenmez; paketin geri kalanı yüklenir.
pub fn path_check(sim: &str, link: &Path, longest_rel: &str, over_count: Option<usize>) -> ReadinessCheck {
    let id = format!("path:{sim}");
    if longest_rel.is_empty() {
        return check(
            id,
            "path-length-unknown",
            "unknown",
            "path",
            Some(sim),
            tr!("Yol uzunluğu ölçülemedi", "Path length could not be measured"),
            tr!("layout.json olmadan dosya yolları bilinmiyor; derin doğrulama diski tarar.", "Without layout.json the file paths are unknown; deep verification scans the disk."),
        );
    }
    let full = format!("{}\\{}", link.display(), longest_rel);
    let n = path_len(&full);
    let short = sim_short(sim);
    if n > MAX_PATH_CHARS {
        let many = over_count.map(|c| tr!(format!("{c} dosya sınırı aşıyor. "), format!("{c} files exceed the limit. "))).unwrap_or_default();
        check(
            id,
            "path-too-long",
            "error",
            "path",
            Some(sim),
            tr!(
                format!("Yol Windows sınırını aşıyor ({n}/{MAX_PATH_CHARS}) — bu dosyalar MSFS {short}'te sessizce yüklenmeyebilir"),
                format!("Path exceeds the Windows limit ({n}/{MAX_PATH_CHARS}) — these files may silently fail to load in MSFS {short}")
            ),
            tr!(
                format!(
                    "{many}En uzun yol: {full}. Sim bu dosyaları atlarsa paketin geri kalanı yüklenir ama ilgili model/doku/ayar eksik kalır; Windows'ta uzun yolları açmak MSFS 2024'te yetmeyebilir."
                ),
                format!(
                    "{many}Longest path: {full}. If the sim skips these files the rest of the package loads but the affected model/texture/config is missing; enabling long paths in Windows may not be enough for MSFS 2024."
                )
            ),
        )
        .hint(tr!(
            "Simin paket klasörünü (InstalledPackagesPath) daha kısa bir yola taşıyın, ör. D:\\MSFS\\Packages. Microsoft Store sürümünün varsayılan yolu çok uzundur.",
            "Move the sim's package folder (InstalledPackagesPath) to a shorter path, e.g. D:\\MSFS\\Packages. The Microsoft Store version's default path is very long."
        ))
        .with_count(over_count)
    } else if n > PATH_WARN_CHARS {
        check(
            id,
            "path-near-limit",
            "warn",
            "path",
            Some(sim),
            tr!(format!("Yol uzunluğu sınıra yakın ({n}/{MAX_PATH_CHARS})"), format!("Path length is close to the limit ({n}/{MAX_PATH_CHARS})")),
            tr!(format!("En uzun yol: {full}. Paketin bir sonraki sürümü sınırı aşabilir."), format!("Longest path: {full}. The next version of the package may exceed the limit.")),
        )
    } else {
        check(
            id,
            "path-ok",
            "ok",
            "path",
            Some(sim),
            tr!(format!("Yol uzunluğu uygun ({n}/{MAX_PATH_CHARS})"), format!("Path length is fine ({n}/{MAX_PATH_CHARS})")),
            tr!(format!("En uzun yol: {full}"), format!("Longest path: {full}")),
        )
    }
}

fn link_time(link: &Path) -> Option<SystemTime> {
    let m = fs::symlink_metadata(link).ok()?;
    [m.created().ok(), m.modified().ok()].into_iter().flatten().max()
}

fn fmt_time(t: SystemTime) -> String {
    chrono::DateTime::<chrono::Local>::from(t).format("%d.%m.%Y %H:%M").to_string()
}

fn content_check(m: &ModEntry, ctx: &SimContext, name: &str, link: Option<&Path>) -> ReadinessCheck {
    let sim = ctx.id.as_str();
    let id = format!("content:{sim}");
    let short = &ctx.short;
    let Some(content) = &ctx.content else {
        return if sim == SIM_2024 {
            check(
                id,
                "sim-content-unknown",
                "unknown",
                "sim",
                Some(sim),
                tr!(format!("MSFS {short} paketi tanıyor mu bilinmiyor"), format!("Unknown whether MSFS {short} recognises the package")),
                tr!("Content.xml bulunamadı; sim bu kullanıcıyla hiç açılmamış olabilir.", "Content.xml was not found; the sim may never have been started with this user."),
            )
            .hint(tr!("Simi bir kez açıp ana menüye kadar bekleyin, sonra yeniden tarayın.", "Start the sim once, wait for the main menu, then rescan."))
        } else {
            check(
                id,
                "sim-not-disabled",
                "ok",
                "sim",
                Some(sim),
                tr!(format!("MSFS {short} paketi devre dışı bırakmamış"), format!("MSFS {short} has not disabled the package")),
                tr!("Content.xml yok; MSFS 2020 Community paketlerini doğrudan klasörden yükler.", "No Content.xml; MSFS 2020 loads Community packages straight from the folder."),
            )
        };
    };
    let records = content.community(name);
    if records.is_empty() {
        if content.format == "2020" {
            return check(
                id,
                "sim-not-disabled",
                "ok",
                "sim",
                Some(sim),
                tr!(format!("MSFS {short} paketi devre dışı bırakmamış"), format!("MSFS {short} has not disabled the package")),
                tr!("Content.xml'de bu paket için kapatma kaydı yok.", "Content.xml has no disable record for this package."),
            );
        }
        let written = ctx.content_modified;
        let placed = link.and_then(link_time);
        return match (written, placed) {
            (Some(w), Some(p)) if w > p + Duration::from_secs(120) => check(
                id,
                "sim-not-registered",
                "warn",
                "sim",
                Some(sim),
                tr!(format!("MSFS {short} paketi listesine almamış"), format!("MSFS {short} has not listed the package")),
                tr!(
                    format!(
                        "Paket {} tarihinden beri Community'de, sim Content.xml'i {} tarihinde yazdı ama “{name}” listede yok. Paket bozuk, yanlış klasörde ya da sim tarafından reddedilmiş olabilir.",
                        fmt_time(p),
                        fmt_time(w)
                    ),
                    format!(
                        "The package has been in Community since {}, the sim wrote Content.xml on {}, but “{name}” is not listed. The package may be damaged, in the wrong folder or rejected by the sim.",
                        fmt_time(p),
                        fmt_time(w)
                    )
                ),
            )
            .hint(tr!(
                "Simi açıp İçerik Yöneticisi'nde paketi arayın; görünmüyorsa paketi yeniden kurun.",
                "Open the sim and look for the package in the Content Manager; if it is not there, reinstall the package."
            )),
            _ => check(
                id,
                "sim-not-seen",
                "unknown",
                "sim",
                Some(sim),
                tr!(format!("MSFS {short} paketi henüz görmedi"), format!("MSFS {short} has not seen the package yet")),
                tr!(
                    format!(
                        "Paket simin son açılışından{} sonra eklendi; bir sonraki açılışta tanınacak.",
                        written.map(|w| format!(" ({})", fmt_time(w))).unwrap_or_default()
                    ),
                    format!(
                        "The package was added after the sim last started{}; it will be recognised on the next launch.",
                        written.map(|w| format!(" ({})", fmt_time(w))).unwrap_or_default()
                    )
                ),
            )
            .hint(tr!("Simi bir kez açtıktan sonra yeniden tarayın.", "Rescan after starting the sim once.")),
        };
    }

    let last = records.last().unwrap();
    let distinct: HashSet<&Activation> = records.iter().map(|r| &r.activation).collect();
    let sdk_note = match (last.sdk.as_deref(), m.info.built_for.as_str()) {
        (Some("fs20"), "2024") => tr!(
            " Dikkat: manifest 2024 yapımı diyor ama sim paketi MSFS 2020 SDK'sıyla derlenmiş sayıyor.",
            " Note: the manifest says it was built for 2024, but the sim treats the package as built with the MSFS 2020 SDK."
        ),
        (Some("fs20"), _) => tr!(
            " Sim paketi MSFS 2020 SDK'sıyla derlenmiş sayıyor (2024 bunları uyumluluk katmanıyla yükler).",
            " The sim treats the package as built with the MSFS 2020 SDK (2024 loads these through its compatibility layer)."
        ),
        (Some("fs24"), _) => tr!(" Sim paketi MSFS 2024 SDK'sıyla derlenmiş sayıyor.", " The sim treats the package as built with the MSFS 2024 SDK."),
        _ => "",
    };
    if distinct.len() > 1 {
        let states: Vec<&str> = records.iter().map(|r| r.active_raw.as_str()).collect();
        let mut c = check(
            id,
            "sim-state-conflict",
            "warn",
            "sim",
            Some(sim),
            tr!(format!("MSFS {short} Content.xml'de çelişkili kayıtlar"), format!("Conflicting records in MSFS {short} Content.xml")),
            tr!(
                format!("“{}” için {} kayıt var: {}. Hangisinin geçerli olduğu belli değil.", last.raw_name, records.len(), states.join(", ")),
                format!("“{}” has {} records: {}. It is unclear which one applies.", last.raw_name, records.len(), states.join(", "))
            ),
        )
        .hint(tr!("Simin İçerik Yöneticisi'nde paketin durumunu kontrol edin.", "Check the package's state in the sim's Content Manager."));
        if records.iter().any(|r| r.activation == Activation::UserDisabled) {
            c = c.fix(ReadinessFix::ActivateContentPackage { sim: sim.into(), package: last.raw_name.clone() });
        }
        return c;
    }
    match &last.activation {
        Activation::Active => check(
            id,
            "sim-active",
            "ok",
            "sim",
            Some(sim),
            tr!(format!("MSFS {short} paketi tanıyor ve etkin"), format!("MSFS {short} recognises the package and it is active")),
            format!("Content.xml: {} = {}.{sdk_note}", last.raw_name, last.active_raw),
        ),
        Activation::UserDisabled if content.format == "2024" => check(
            id,
            "sim-user-disabled",
            "error",
            "sim",
            Some(sim),
            tr!(
                format!("MSFS {short} İçerik Yöneticisi'nde kapatılmış — paket YÜKLENMEZ"),
                format!("Disabled in the MSFS {short} Content Manager — the package will NOT load")
            ),
            {
                let file = ctx.content_path.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "Content.xml".into());
                tr!(
                    format!("Paket Community'de ve Modstead'de açık, ama sim onu kullanıcı tarafından devre dışı bırakılmış sayıyor ({file}: {} = {}).", last.raw_name, last.active_raw),
                    format!("The package is in Community and enabled in Modstead, but the sim considers it disabled by the user ({file}: {} = {}).", last.raw_name, last.active_raw)
                )
            },
        )
        .hint(tr!(
            "Simde İçerik Yöneticisi'nden (My Library) paketi yeniden etkinleştirin ya da Modstead'in düzeltmesini kullanın (sim kapalıyken; Content.xml önce yedeklenir).",
            "Re-enable the package from the Content Manager (My Library) in the sim, or use Modstead's fix (with the sim closed; Content.xml is backed up first)."
        ))
        .fix(ReadinessFix::ActivateContentPackage { sim: sim.into(), package: last.raw_name.clone() }),
        Activation::UserDisabled => check(
            id,
            "sim-user-disabled",
            "warn",
            "sim",
            Some(sim),
            tr!(format!("MSFS {short} Content.xml'de kapalı görünüyor"), format!("Appears disabled in MSFS {short} Content.xml")),
            tr!(
                format!(
                    "Content.xml: {} = {}. MSFS 2020 bu dosyayı SU10'dan beri büyük ölçüde yok sayar; paket yine de yüklenebilir.",
                    last.raw_name, last.active_raw
                ),
                format!("Content.xml: {} = {}. MSFS 2020 has largely ignored this file since SU10; the package may load anyway.", last.raw_name, last.active_raw)
            ),
        )
        .hint(tr!(
            "Paket simde görünmüyorsa kaydı etkinleştirin (Content.xml önce yedeklenir).",
            "If the package does not show up in the sim, enable the record (Content.xml is backed up first)."
        ))
        .fix(ReadinessFix::ActivateContentPackage { sim: sim.into(), package: last.raw_name.clone() }),
        Activation::SystemDisabled => check(
            id,
            "sim-system-disabled",
            "error",
            "sim",
            Some(sim),
            tr!(format!("MSFS {short} paketi kendisi devre dışı bıraktı — paket YÜKLENMEZ"), format!("MSFS {short} disabled the package itself — the package will NOT load")),
            tr!(
                format!("Content.xml: {} = {}. Genelde sürüm uyumsuzluğu ya da bozuk paket demektir.{sdk_note}", last.raw_name, last.active_raw),
                format!("Content.xml: {} = {}. This usually means a version mismatch or a damaged package.{sdk_note}", last.raw_name, last.active_raw)
            ),
        )
        .hint(tr!(
            "Paketin bu sim için güncel sürümünü kurun; sorun sürerse İçerik Yöneticisi'nden durumu kontrol edin.",
            "Install the current version of the package for this sim; if the problem persists, check its state in the Content Manager."
        )),
        Activation::Other(raw) => check(
            id,
            "sim-state-unknown",
            "warn",
            "sim",
            Some(sim),
            tr!(format!("MSFS {short} paket durumu tanınmadı"), format!("MSFS {short} package state not recognised")),
            tr!(format!("Content.xml: {} = “{raw}”. Modstead bu değeri bilmiyor.", last.raw_name), format!("Content.xml: {} = “{raw}”. Modstead does not know this value.", last.raw_name)),
        ),
    }
}

fn find_entry<'a>(exe: &'a ExeXml, req: &KbRequirement, ctx: &SimContext) -> Option<&'a LaunchAddon> {
    let by_exe = |a: &&LaunchAddon| {
        let file = Path::new(&a.path).file_name().map(|f| f.to_string_lossy().to_lowercase()).unwrap_or_default();
        req.exe_names.iter().any(|e| e.eq_ignore_ascii_case(&file))
    };
    let by_name = |a: &&LaunchAddon| req.entry_names.iter().any(|n| n.eq_ignore_ascii_case(a.name.trim()));
    let candidates: Vec<&LaunchAddon> = exe.addons.iter().filter(|a| by_exe(a) || by_name(a)).collect();
    // Birden fazla girdi varsa çalışacak olanı (açık ve programı diskte) tercih et.
    let works = |a: &&&LaunchAddon| !a.disabled && *ctx.exe_exists.get(&a.path.to_lowercase()).unwrap_or(&false);
    candidates.iter().find(works).or_else(|| candidates.iter().find(|a| !a.disabled)).or_else(|| candidates.first()).copied()
}

pub fn requirement_check(addon: &KbAddon, req: &KbRequirement, ctx: &SimContext) -> ReadinessCheck {
    let sim = ctx.id.as_str();
    let id = format!("req:{}:{sim}", req.id);
    let required = req.level == "required";
    let bad = if required { "error" } else { "warn" };
    let short = &ctx.short;
    let app = req.app();
    let opt = if required { "" } else { tr!(" (isteğe bağlı)", " (optional)") };
    let base = |code: &str, status: &str, title: String, detail: String| {
        let mut c = check(id.clone(), code, status, "companion", Some(sim), title, format!("{detail} {}", req.why()).trim().to_string()).source(req.source.as_ref());
        c.optional = !required;
        c
    };
    let c = requirement_static(addon, req, ctx, &base, bad, opt);
    // Sim şu an açıksa yardımcı programın gerçekten çalıştığına da bak.
    if c.status == "ok" && ctx.running && !req.processes.is_empty() && !ctx.processes.is_empty() {
        let running = req.processes.iter().any(|p| ctx.processes.contains(&p.to_lowercase()));
        if !running {
            return base(
                "companion-not-running",
                "warn",
                tr!(format!("MSFS {short} açık ama {app}{opt} çalışmıyor"), format!("MSFS {short} is running but {app}{opt} is not")),
                tr!(
                    format!("Beklenen süreç: {}. Program açılışta çökmüş, antivirüs tarafından engellenmiş ya da henüz başlamamış olabilir.", req.processes.join(" / ")),
                    format!("Expected process: {}. The program may have crashed at startup, been blocked by antivirus or not started yet.", req.processes.join(" / "))
                ),
            )
            .hint_opt(req.fix_text().as_ref());
        }
    }
    c
}

fn requirement_static(
    addon: &KbAddon,
    req: &KbRequirement,
    ctx: &SimContext,
    base: &dyn Fn(&str, &str, String, String) -> ReadinessCheck,
    bad: &str,
    opt: &str,
) -> ReadinessCheck {
    let sim = ctx.id.as_str();
    let short = &ctx.short;
    let app = req.app();
    let addon_name = addon.display_name();
    match req.kind.as_str() {
        "exeXml" => {
            let Some(exe) = &ctx.exe else {
                let where_ = ctx.exe_path.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| tr!("yapılandırma klasörü", "configuration folder").into());
                return base(
                    "companion-no-exexml",
                    bad,
                    tr!(format!("{app}{opt} başlatılmayacak: MSFS {short} için exe.xml yok"), format!("{app}{opt} will not start: MSFS {short} has no exe.xml")),
                    tr!(
                        format!("{where_} bulunamadı; sim açılışta hiçbir yardımcı program başlatmaz. {addon_name} bunu gerektirir."),
                        format!("{where_} was not found; the sim starts no companion programs at launch. {addon_name} needs this.")
                    ),
                )
                .hint_opt(req.fix_text().as_ref());
            };
            if let Some(reason) = &exe.malformed {
                return base(
                    "exexml-malformed",
                    bad,
                    tr!(format!("MSFS {short} exe.xml bozuk — {app}{opt} başlamayabilir"), format!("MSFS {short} exe.xml is damaged — {app}{opt} may not start")),
                    tr!(format!("{reason}. Sim dosyayı okuyamazsa hiçbir program başlamaz."), format!("{reason}. If the sim cannot read the file, no program starts.")),
                )
                .hint(tr!(
                    "Son çalışan yedeği geri yükleyin ya da programın yükleyicisini “Repair” ile yeniden çalıştırın.",
                    "Restore the last working backup or run the program's installer again with “Repair”."
                ));
            }
            if exe.document_disabled {
                return base(
                    "exexml-disabled",
                    bad,
                    tr!(format!("MSFS {short} exe.xml tamamen kapalı — {app}{opt} başlamaz"), format!("MSFS {short} exe.xml is disabled entirely — {app}{opt} will not start")),
                    tr!("exe.xml'in kendisi <Disabled>True</Disabled> olarak işaretli.", "exe.xml itself is marked <Disabled>True</Disabled>.").into(),
                )
                .hint(tr!(
                    "exe.xml'in en üstündeki <Disabled> değerini False yapın (önce yedek alın).",
                    "Set the <Disabled> value at the top of exe.xml to False (make a backup first)."
                ));
            }
            let Some(entry) = find_entry(exe, req, ctx) else {
                return base(
                    "companion-not-registered",
                    bad,
                    tr!(format!("{app}{opt} MSFS {short} exe.xml'inde kayıtlı değil"), format!("{app}{opt} is not registered in MSFS {short} exe.xml")),
                    tr!(
                        format!("Sim açılırken {app} başlatılmayacak; {addon_name} bu simde eksik çalışır."),
                        format!("{app} will not be started with the sim; {addon_name} will not work fully in this sim.")
                    ),
                )
                .hint_opt(req.fix_text().as_ref());
            };
            let exists = *ctx.exe_exists.get(&entry.path.to_lowercase()).unwrap_or(&false);
            if entry.disabled {
                return base(
                    "companion-disabled",
                    bad,
                    tr!(format!("{app}{opt} MSFS {short} exe.xml'inde kapatılmış"), format!("{app}{opt} is disabled in MSFS {short} exe.xml")),
                    tr!(
                        format!("Girdi “{}” <Disabled>True</Disabled>; sim bu programı başlatmaz.", entry.name),
                        format!("Entry “{}” is <Disabled>True</Disabled>; the sim will not start this program.", entry.name)
                    ),
                )
                .hint(tr!(
                    "Modstead girdiyi yeniden açabilir (sim kapalıyken; exe.xml önce yedeklenir).",
                    "Modstead can re-enable the entry (with the sim closed; exe.xml is backed up first)."
                ))
                .fix(ReadinessFix::EnableExeEntry { sim: sim.into(), name: entry.name.clone(), path: entry.path.clone() });
            }
            if !exists {
                return base(
                    "companion-exe-missing",
                    bad,
                    tr!(format!("{app}{opt} kayıtlı ama program diskte yok"), format!("{app}{opt} is registered but the program is not on disk")),
                    tr!(
                        format!("exe.xml “{}” → {} gösteriyor ama dosya bulunamadı (kaldırılmış ya da taşınmış).", entry.name, entry.path),
                        format!("exe.xml “{}” points to {} but the file was not found (removed or moved).", entry.name, entry.path)
                    ),
                )
                .hint_opt(req.fix_text().as_ref());
            }
            base(
                "companion-ok",
                "ok",
                tr!(format!("{app} MSFS {short} açılışında başlatılıyor"), format!("{app} starts with MSFS {short}")),
                format!("exe.xml: {} → {}.", entry.name, entry.path),
            )
        }
        "program" => {
            let mut candidates: Vec<PathBuf> = Vec::new();
            for p in &req.paths {
                let p = expand_env(p);
                if p.contains("{community}") {
                    candidates.extend(ctx.containers.iter().map(|c| PathBuf::from(p.replace("{community}", &c.display().to_string()))));
                } else {
                    candidates.push(PathBuf::from(p));
                }
            }
            let found = candidates.into_iter().find(|p| p.exists());
            match found {
                Some(p) => base("companion-installed", "ok", tr!(format!("{app} kurulu"), format!("{app} is installed")), format!("{}.", p.display())),
                None => base(
                    "companion-not-installed",
                    bad,
                    tr!(format!("{app}{opt} kurulu görünmüyor"), format!("{app}{opt} does not appear to be installed")),
                    tr!(format!("Beklenen yerlerde yok: {}.", req.paths.join(", ")), format!("Not in the expected places: {}.", req.paths.join(", "))),
                )
                .hint_opt(req.fix_text().as_ref()),
            }
        }
        _ => {
            let re = KB.package_patterns.get(&req.id).cloned().or_else(|| glob_regex(&req.packages));
            let found = re.and_then(|re| ctx.active_packages.iter().find(|p| re.is_match(p)).cloned());
            match found {
                Some(p) => base(
                    "companion-package-ok",
                    "ok",
                    tr!(format!("{app} MSFS {short}'te etkin"), format!("{app} is active in MSFS {short}")),
                    tr!(format!("Paket: {p}."), format!("Package: {p}.")),
                ),
                None => base(
                    "companion-package-missing",
                    bad,
                    tr!(format!("{app}{opt} MSFS {short}'te etkin değil"), format!("{app}{opt} is not active in MSFS {short}")),
                    tr!(format!("Beklenen paket: {}.", req.packages.join(", ")), format!("Expected package: {}.", req.packages.join(", "))),
                )
                .hint_opt(req.fix_text().as_ref()),
            }
        }
    }
}

/// Tarama sırasında bir mod için hızlı hazırlık denetimleri.
pub fn evaluate(m: &ModEntry, ctxs: &[SimContext]) -> Vec<ReadinessCheck> {
    evaluate_with(m, ctxs, &KB)
}

pub fn evaluate_with(m: &ModEntry, ctxs: &[SimContext], kb: &Kb) -> Vec<ReadinessCheck> {
    let mut out = Vec::new();
    package_checks(m, &mut out);
    for ctx in ctxs {
        let Some(st) = m.sims.get(&ctx.id).filter(|st| is_active(st)) else { continue };
        let name = sim_name(m, st);
        let link = st.link_path.as_deref();
        out.push(content_check(m, ctx, &name, link));
        if let Some(link) = link {
            let over = count_over(&m.info.layout_path_lengths, link);
            out.push(path_check(&ctx.id, link, &m.info.longest_layout_path, Some(over)));
        }
        let folder = m.info.folder.to_lowercase();
        for addon in kb.matching(&[name.as_str(), folder.as_str()]) {
            for req in addon.requires.iter().filter(|r| r.sims.is_empty() || r.sims.iter().any(|s| s == &ctx.id)) {
                out.push(requirement_check(addon, req, ctx));
            }
        }
    }
    out
}

/// Hata düzeyindeki hazırlık sorunlarını modun `issues` listesine de ekler (Sağlık sayfası için).
pub fn promote_errors(m: &mut ModEntry) {
    let new: Vec<Issue> = m
        .readiness
        .iter()
        .filter(|c| c.status == "error")
        .filter(|c| !m.issues.iter().any(|i| i.code == c.code && i.sim == c.sim))
        .map(|c| Issue {
            level: "error".into(),
            code: c.code.clone(),
            title: c.title.clone(),
            detail: match &c.hint {
                Some(h) => format!("{} {}", c.detail, h),
                None => c.detail.clone(),
            },
            sim: c.sim.clone(),
            path: c.sim.as_ref().and_then(|s| m.sims.get(s)).and_then(|s| s.link_path.clone()),
            mod_id: Some(m.id.clone()),
        })
        .collect();
    m.issues.extend(new);
}

// ---------- Derin doğrulama ----------

struct LayoutItem {
    path: String,
    size: Option<u64>,
}

fn read_layout_items(pkg: &Path) -> Option<Vec<LayoutItem>> {
    let v = crate::package::read_json_lenient(&pkg.join("layout.json"))?;
    let content = v.get("content")?.as_array()?;
    Some(
        content
            .iter()
            .filter_map(|i| {
                let p = i.get("path")?.as_str()?.replace('/', "\\");
                Some(LayoutItem { path: p, size: i.get("size").and_then(|s| s.as_u64()) })
            })
            .collect(),
    )
}

const SAMPLES: usize = 5;

/// layout.json'da olmaması normal olan artıklar (yedekler, belgeler, GSX'in `.gsx` kopyaları): uyarı verilmez.
fn is_leftover(lower: &str) -> bool {
    const EXT: &[&str] = &["bak", "orig", "old", "gsx", "txt", "md", "pdf", "log", "url", "tmp", "backup"];
    let name = lower.rsplit(['\\', '/']).next().unwrap_or(lower);
    name.starts_with('.') || name.rsplit('.').next().map(|e| EXT.contains(&e)).unwrap_or(false)
}

/// İsteğe bağlı derin denetim: hızlı denetimlere ek olarak layout.json'daki her dosyanın diskte olup olmadığını
/// ve boyutunu, layout'ta olmayan dosyaları ve TÜM dosyalar için yol uzunluğunu denetler.
pub fn verify(m: &ModEntry, scan: &ScanResult) -> ModVerification {
    let t0 = std::time::Instant::now();
    let mut cache = FileCache::default();
    let mut ctxs = contexts(&scan.sims, &mut cache);
    fill_active(&mut ctxs, scan.mods.iter());
    let mut checks: Vec<ReadinessCheck> = evaluate(m, &ctxs).into_iter().filter(|c| c.group != "path").collect();

    let pkg = m.info.path.clone();
    let mut files_checked = 0u32;
    // Simin göreceği göreli yollar: layout varsa layout, yoksa diskteki dosyalar.
    let mut rel_paths: Vec<String> = Vec::new();
    if !pkg.is_dir() {
        checks.push(check("files", "package-missing", "error", "files", None, tr!("Paket klasörü yok", "Package folder is missing"), pkg.display().to_string()));
    } else if let Some(items) = read_layout_items(&pkg) {
        // Büyük paketlerde (GSX World of Jetways ~30 bin dosya) dosya bilgileri paralel okunur.
        let results: Vec<(Option<String>, Option<String>)> = crate::scanner::parallel_map(&items, |it| match fs::metadata(pkg.join(&it.path)) {
            Ok(md) if md.is_file() => (None, it.size.filter(|sz| *sz != md.len()).map(|sz| format!("{} ({} ≠ {})", it.path, sz, md.len()))),
            _ => (Some(it.path.clone()), None),
        });
        let missing: Vec<String> = results.iter().filter_map(|r| r.0.clone()).collect();
        let mismatch: Vec<String> = results.iter().filter_map(|r| r.1.clone()).collect();
        files_checked = items.len() as u32;
        let listed: HashSet<String> = items.iter().map(|it| it.path.to_lowercase()).collect();
        rel_paths.extend(items.iter().map(|it| it.path.clone()));
        let mut extra = Vec::new();
        for e in walkdir::WalkDir::new(&pkg).follow_links(false).into_iter().flatten() {
            if !e.file_type().is_file() {
                continue;
            }
            let Ok(rel) = e.path().strip_prefix(&pkg) else { continue };
            let rel = rel.to_string_lossy().to_string();
            let lower = rel.to_lowercase();
            if lower == "manifest.json" || lower == "layout.json" || listed.contains(&lower) || is_leftover(&lower) {
                continue;
            }
            extra.push(rel);
        }
        if !missing.is_empty() {
            checks.push(
                check(
                    "files:missing",
                    "layout-files-missing",
                    "error",
                    "files",
                    None,
                    tr!(format!("layout.json'daki {} dosya diskte yok — paket eksik", missing.len()), format!("{} files from layout.json are missing on disk — the package is incomplete", missing.len())),
                    format!("{}: {}", tr!("Örnek", "Example"), missing.iter().take(SAMPLES).cloned().collect::<Vec<_>>().join(", ")),
                )
                .hint(tr!("Paket yarım kopyalanmış ya da açılmış olabilir; yeniden kurun.", "The package may have been copied or extracted only partly; reinstall it.")),
            );
        }
        if !mismatch.is_empty() {
            checks.push(
                check(
                    "files:size",
                    "layout-size-mismatch",
                    "warn",
                    "files",
                    None,
                    tr!(format!("{} dosyanın boyutu layout.json ile uyuşmuyor", mismatch.len()), format!("{} files do not match their size in layout.json", mismatch.len())),
                    {
                        let sample = mismatch.iter().take(SAMPLES).cloned().collect::<Vec<_>>().join(", ");
                        tr!(
                            format!("Dosyalar layout.json güncellenmeden değiştirilmiş. Örnek: {sample}"),
                            format!("Files were changed without updating layout.json. Example: {sample}")
                        )
                    },
                )
                .hint(tr!(
                    "Elle değiştirdiyseniz MSFSLayoutGenerator ile layout.json'u yenileyin; değilse paketi yeniden kurun.",
                    "If you changed them by hand, refresh layout.json with MSFSLayoutGenerator; otherwise reinstall the package."
                )),
            );
        }
        if !extra.is_empty() {
            checks.push(check(
                "files:extra",
                "files-not-in-layout",
                "warn",
                "files",
                None,
                tr!(format!("{} dosya layout.json'da yok — sim bunları görmez", extra.len()), format!("{} files are not in layout.json — the sim will not see them", extra.len())),
                format!("{}: {}", tr!("Örnek", "Example"), extra.iter().take(SAMPLES).cloned().collect::<Vec<_>>().join(", ")),
            ));
        }
        if missing.is_empty() && mismatch.is_empty() && extra.is_empty() {
            checks.push(check(
                "files",
                "layout-consistent",
                "ok",
                "files",
                None,
                tr!("layout.json diskle tutarlı", "layout.json matches the disk"),
                tr!(format!("{} dosya denetlendi.", items.len()), format!("{} files checked.", items.len())),
            ));
        }
    } else {
        for e in walkdir::WalkDir::new(&pkg).follow_links(false).into_iter().flatten() {
            if e.file_type().is_file() {
                files_checked += 1;
                if let Ok(rel) = e.path().strip_prefix(&pkg) {
                    rel_paths.push(rel.to_string_lossy().to_string());
                }
            }
        }
    }

    // Yol uzunluğu: etkin olduğu her sim için tüm yollar.
    for ctx in &ctxs {
        let Some(st) = m.sims.get(&ctx.id).filter(|st| is_active(st)) else { continue };
        let Some(link) = st.link_path.as_deref() else { continue };
        let base = path_len(&link.display().to_string()) + 1;
        let over = rel_paths.iter().filter(|r| base + path_len(r) > MAX_PATH_CHARS).count();
        let longest = rel_paths.iter().max_by_key(|r| path_len(r)).cloned().unwrap_or_default();
        checks.push(path_check(&ctx.id, link, &longest, Some(over)));
    }

    ModVerification {
        id: m.id.clone(),
        title: m.info.title.clone(),
        status: worst_status(&checks),
        checks,
        files_checked,
        duration_ms: t0.elapsed().as_millis() as u64,
        verified_at: crate::store::now_iso(),
    }
}

// ---------- Düzeltmeler (yalnızca açık komutla) ----------

pub fn apply_fix(sims: &[SimInstall], fix: &ReadinessFix) -> AppResult<FixOutcome> {
    let sim_id = match fix {
        ReadinessFix::EnableExeEntry { sim, .. } | ReadinessFix::ActivateContentPackage { sim, .. } => sim,
    };
    let Some(s) = sims.iter().find(|s| &s.id == sim_id && s.detected) else {
        return Err(AppError::msg(tr!(format!("Simülatör bulunamadı: {sim_id}"), format!("Simulator not found: {sim_id}"))));
    };
    if s.running || crate::sims::is_running(&s.id) {
        return Err(AppError::GameRunning(format!("MSFS {}", s.short)));
    }
    match fix {
        ReadinessFix::EnableExeEntry { name, path, .. } => {
            let Some(file) = s.exe_xml.clone().or_else(|| s.config_dir.as_ref().map(|d| d.join("exe.xml"))).filter(|p| p.is_file()) else {
                return Err(AppError::msg(tr!("exe.xml bulunamadı.", "exe.xml was not found.")));
            };
            let backup = crate::exexml::enable_entry(&file, name, path)?;
            let message = tr!(format!("“{name}” MSFS {} exe.xml'inde yeniden açıldı.", s.short), format!("“{name}” was re-enabled in MSFS {} exe.xml.", s.short));
            Ok(FixOutcome { message, file, backup })
        }
        ReadinessFix::ActivateContentPackage { package, .. } => {
            let Some(file) = s
                .content_xml
                .clone()
                .filter(|p| p.is_file())
                .or_else(|| s.config_dir.as_deref().and_then(|d| crate::sims::find_content_xml(&s.id, d)))
            else {
                return Err(AppError::msg(tr!("Content.xml bulunamadı.", "Content.xml was not found.")));
            };
            let text = String::from_utf8_lossy(&fs::read(&file)?).into_owned();
            let value = if parse_content_xml(&text).format == "2024" { "Activated" } else { "true" };
            let backup = set_content_active(&file, package, value)?;
            let message = tr!(format!("“{package}” MSFS {} Content.xml'inde etkinleştirildi.", s.short), format!("“{package}” was enabled in MSFS {} Content.xml.", s.short));
            Ok(FixOutcome { message, file, backup })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exexml::parse as parse_exe;

    const CONTENT_2024: &str = r#"<Packages>
	<Package name="fs24-asobo-aircraft-b737max" active="Activated"/>
	<Package name="fs20-asobo-aircraft-c152-aerobat-livery-01" active="Activated"/>
	<Package name="communityfs24-fnx-aircraft-320" active="Activated"/>
	<Package name="communityfs24-fnx-aircraft-320-liveries" active="UserDisabled"/>
	<Package name="communityfs20-fsdreamteam-gsx-world-of-jetways" active="Activated"/>
	<Package name="community2024fs24-new-thing" active="SystemDisabled"/>
	<Package name="communityfs20-dup" active="Activated"/>
	<Package name="communityfs20-dup" active="UserDisabled"/>
	<Package active="Pending" name="communityfs24-odd"/>
</Packages>"#;

    const CONTENT_2020: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<Content>
    <Package name="fs-base" active="true"/>
    <Package name="asobo-airport-kjfk-new-york" active="false"/>
    <Package name="fnx-aircraft-320" active="true"/>
    <Package name="some-livery" active="false"/>
</Content>"#;

    #[test]
    fn content_xml_2024_format() {
        let c = parse_content_xml(CONTENT_2024);
        assert_eq!(c.format, "2024");
        let fnx = c.community("fnx-aircraft-320");
        assert_eq!(fnx.len(), 1, "liveries paketi ayrı sayılmalı");
        assert_eq!(fnx[0].activation, Activation::Active);
        assert_eq!(fnx[0].sdk.as_deref(), Some("fs24"));
        assert_eq!(fnx[0].container.as_deref(), Some("community"));
        assert_eq!(c.community("FNX-Aircraft-320-Liveries")[0].activation, Activation::UserDisabled);
        let jw = c.community("fsdreamteam-gsx-world-of-jetways");
        assert_eq!(jw[0].sdk.as_deref(), Some("fs20"));
        let n = c.community("new-thing");
        assert_eq!(n[0].container.as_deref(), Some("community2024"));
        assert_eq!(n[0].activation, Activation::SystemDisabled);
        assert_eq!(c.community("dup").len(), 2);
        assert_eq!(c.community("odd")[0].activation, Activation::Other("Pending".into()));
        // Resmi paketler Community paketi sayılmaz.
        assert!(c.community("asobo-aircraft-b737max").is_empty());
        assert!(c.community("missing").is_empty());
    }

    #[test]
    fn content_xml_2020_format() {
        let c = parse_content_xml(CONTENT_2020);
        assert_eq!(c.format, "2020");
        assert_eq!(c.records.len(), 4);
        assert_eq!(c.community("fnx-aircraft-320")[0].activation, Activation::Active);
        assert_eq!(c.community("some-livery")[0].activation, Activation::UserDisabled);
        assert!(c.community("some-livery")[0].sdk.is_none());
        assert!(c.community("nope").is_empty());
    }

    #[test]
    fn content_xml_activation_writer() {
        let dir = std::env::temp_dir().join(format!("msfs-content-{}", modstead_core::fsx::short_id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("Content.xml");
        fs::write(&p, CONTENT_2024).unwrap();
        let backup = set_content_active(&p, "communityfs24-fnx-aircraft-320-liveries", "Activated").unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), CONTENT_2024);
        let after = fs::read_to_string(&p).unwrap();
        assert_eq!(parse_content_xml(&after).community("fnx-aircraft-320-liveries")[0].activation, Activation::Active);
        // Diğer satırlar aynı kalır.
        assert_eq!(after.replace("-liveries\" active=\"Activated\"", "-liveries\" active=\"UserDisabled\""), CONTENT_2024);
        // Kopya kayıtların hepsi düzelir.
        set_content_active(&p, "communityfs20-dup", "Activated").unwrap();
        let after = fs::read_to_string(&p).unwrap();
        assert!(parse_content_xml(&after).community("dup").iter().all(|r| r.activation == Activation::Active));
        assert!(set_content_active(&p, "communityfs20-dup", "Activated").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    fn ctx_with(exe_text: Option<&str>, existing: &[&str]) -> SimContext {
        let exe = exe_text.map(|t| Arc::new(parse_exe(t)));
        let exe_exists = exe
            .as_ref()
            .map(|x| x.addons.iter().map(|a| (a.path.to_lowercase(), existing.iter().any(|e| e.eq_ignore_ascii_case(&a.path)))).collect())
            .unwrap_or_default();
        SimContext {
            id: SIM_2024.into(),
            short: "2024".into(),
            running: false,
            containers: Vec::new(),
            processes: Arc::new(HashSet::new()),
            content_path: None,
            content: None,
            content_modified: None,
            exe_path: Some(PathBuf::from(r"C:\fake\exe.xml")),
            exe,
            exe_exists,
            active_packages: HashSet::new(),
        }
    }

    fn exe_doc(entries: &[(&str, &str, &str)]) -> String {
        let blocks: String = entries
            .iter()
            .map(|(n, d, p)| format!("  <Launch.Addon>\n    <Name>{n}</Name>\n    <Disabled>{d}</Disabled>\n    <Path>{p}</Path>\n  </Launch.Addon>\n"))
            .collect();
        format!("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<SimBase.Document Type=\"Launch\" version=\"1,0\">\n  <Disabled>False</Disabled>\n{blocks}</SimBase.Document>")
    }

    const FENIX: &str = r"C:\Program Files\FenixSim A320\deps\FenixBootstrapper.exe";
    const COUATL: &str = r"C:\Program Files (x86)\Addon Manager\couatl64\couatl64_boot.exe";

    #[test]
    fn knowledge_base_matches_packages() {
        let names = |n: &str| KB.matching(&[n]).iter().map(|a| a.id.clone()).collect::<Vec<_>>();
        assert!(!names("fnx-aircraft-320").is_empty());
        assert!(names("fnx-aircraft-320-liveries").is_empty(), "boya paketleri uygulama gerektirmez");
        assert!(!names("fsdreamteam-gsx-efb").is_empty());
        assert!(!names("FSDreamTeam-GSX-Pro").is_empty());
        assert!(names("sim-rate-selector").is_empty());
        // Her girdi tutarlı: exeXml türünde en az bir eşleştirme anahtarı ve bir kaynak olmalı.
        for (a, _, _) in &KB.addons {
            for r in &a.requires {
                if r.kind == "exeXml" {
                    assert!(!r.exe_names.is_empty() || !r.entry_names.is_empty(), "{}", r.id);
                }
                assert!(r.source.as_deref().map(|s| s.starts_with("https://")).unwrap_or(false), "{} kaynaksız", r.id);
            }
        }
    }

    #[test]
    fn requirement_matching_against_exe_xml() {
        let addon = KB.matching(&["fnx-aircraft-320"])[0];
        let req = addon.requires.iter().find(|r| r.kind == "exeXml" && r.level == "required").unwrap();

        // Var, açık ve program diskte.
        let ok = ctx_with(Some(&exe_doc(&[("FenixA320", "false", FENIX), ("Couatl", "False", COUATL)])), &[FENIX]);
        let c = requirement_check(addon, req, &ok);
        assert_eq!((c.code.as_str(), c.status.as_str()), ("companion-ok", "ok"), "{c:?}");

        // Sim açıkken yardımcı süreç de çalışıyor olmalı.
        let mut live = ctx_with(Some(&exe_doc(&[("FenixA320", "false", FENIX)])), &[FENIX]);
        live.running = true;
        live.processes = Arc::new(["flightsimulator2024.exe".to_string()].into_iter().collect());
        assert_eq!(requirement_check(addon, req, &live).code, "companion-not-running");
        live.processes = Arc::new(["flightsimulator2024.exe".to_string(), "fenixsystem.exe".to_string()].into_iter().collect());
        assert_eq!(requirement_check(addon, req, &live).code, "companion-ok");

        // Girdi yok (yalnızca Couatl kayıtlı).
        let missing = ctx_with(Some(&exe_doc(&[("Couatl", "False", COUATL)])), &[COUATL]);
        let c = requirement_check(addon, req, &missing);
        assert_eq!((c.code.as_str(), c.status.as_str()), ("companion-not-registered", "error"));

        // Girdi kapatılmış: düzeltme önerilir.
        let disabled = ctx_with(Some(&exe_doc(&[("FenixA320", "True", FENIX)])), &[FENIX]);
        let c = requirement_check(addon, req, &disabled);
        assert_eq!((c.code.as_str(), c.status.as_str()), ("companion-disabled", "error"));
        assert_eq!(c.fix, Some(ReadinessFix::EnableExeEntry { sim: SIM_2024.into(), name: "FenixA320".into(), path: FENIX.into() }));

        // Girdi var ama program kaldırılmış.
        let gone = ctx_with(Some(&exe_doc(&[("FenixA320", "false", FENIX)])), &[]);
        let c = requirement_check(addon, req, &gone);
        assert_eq!((c.code.as_str(), c.status.as_str()), ("companion-exe-missing", "error"));

        // Ad farklı ama exe aynı: yine bulunur.
        let renamed = ctx_with(Some(&exe_doc(&[("Fenix Bootstrapper", "false", FENIX)])), &[FENIX]);
        assert_eq!(requirement_check(addon, req, &renamed).code, "companion-ok");

        // İki girdiden biri kapalı, biri çalışıyor: çalışan seçilir.
        let both = ctx_with(Some(&exe_doc(&[("FenixA320", "True", FENIX), ("FenixA320", "false", FENIX)])), &[FENIX]);
        assert_eq!(requirement_check(addon, req, &both).code, "companion-ok");

        // exe.xml yok.
        let none = ctx_with(None, &[]);
        assert_eq!(requirement_check(addon, req, &none).code, "companion-no-exexml");

        // exe.xml bozuk ya da tamamen kapalı.
        let broken = exe_doc(&[("FenixA320", "false", FENIX)]).replace("</Launch.Addon>", "");
        assert_eq!(requirement_check(addon, req, &ctx_with(Some(&broken), &[FENIX])).code, "exexml-malformed");
        let off = exe_doc(&[("FenixA320", "false", FENIX)]).replacen("<Disabled>False</Disabled>", "<Disabled>True</Disabled>", 1);
        assert_eq!(requirement_check(addon, req, &ctx_with(Some(&off), &[FENIX])).code, "exexml-disabled");

        // GSX → Couatl.
        let gsx = KB.matching(&["fsdreamteam-gsx-efb"])[0];
        let greq = gsx.requires.iter().find(|r| r.kind == "exeXml").unwrap();
        assert_eq!(requirement_check(gsx, greq, &ok).code, "companion-exe-missing", "Couatl'ın exe'si diskte işaretlenmedi");
        let both_ok = ctx_with(Some(&exe_doc(&[("FenixA320", "false", FENIX), ("Couatl", "False", COUATL)])), &[FENIX, COUATL]);
        assert_eq!(requirement_check(gsx, greq, &both_ok).code, "companion-ok");
        assert_eq!(requirement_check(gsx, greq, &ctx_with(Some(&exe_doc(&[("FenixA320", "false", FENIX)])), &[FENIX])).code, "companion-not-registered");
    }

    #[test]
    fn optional_requirement_is_only_a_warning() {
        let kb = Kb::parse(
            r#"{"addons":[{"id":"x","name":"X","packages":["x-*"],"requires":[
                {"id":"x-app","kind":"exeXml","level":"optional","app":"X App","exeNames":["x.exe"],"why":"Ek özellikler.","source":"https://example.com"},
                {"id":"x-prog","kind":"program","level":"required","app":"X Prog","paths":["Z:\\yok\\x"],"why":"","source":"https://example.com"},
                {"id":"x-pkg","kind":"package","level":"required","app":"X Paket","packages":["x-core*"],"why":"","source":"https://example.com"}
            ]}]}"#,
        )
        .unwrap();
        let addon = kb.matching(&["x-plane"])[0];
        let mut ctx = ctx_with(Some(&exe_doc(&[])), &[]);
        let c = requirement_check(addon, &addon.requires[0], &ctx);
        assert_eq!((c.code.as_str(), c.status.as_str()), ("companion-not-registered", "warn"));
        assert_eq!(requirement_check(addon, &addon.requires[1], &ctx).code, "companion-not-installed");
        assert_eq!(requirement_check(addon, &addon.requires[2], &ctx).status, "error");
        ctx.active_packages.insert("x-core-lib".into());
        assert_eq!(requirement_check(addon, &addon.requires[2], &ctx).code, "companion-package-ok");
    }

    #[test]
    fn path_length_detection() {
        let store = Path::new(r"C:\Users\kullanici\AppData\Local\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\Packages\Community\fnx-aircraft-320");
        let steam = Path::new(r"D:\MSFS\Community\fnx-aircraft-320");
        let rel = format!(r"SimObjects\Airplanes\FNX_320_IAE\{}\texture.dds", "a".repeat(120));
        // Store yolunda sınır aşılır, kısa yolda aşılmaz.
        let long = path_check(SIM_2024, store, &rel, None);
        assert_eq!((long.code.as_str(), long.status.as_str()), ("path-too-long", "error"), "{}", long.detail);
        let short = path_check(SIM_2024, steam, &rel, None);
        assert_eq!(short.status, "ok", "{}", short.detail);
        // Sınır tam 259: 259 geçer, 260 geçmez.
        let base_len = path_len(&steam.display().to_string()) + 1;
        assert_eq!(path_check(SIM_2024, steam, &"b".repeat(MAX_PATH_CHARS - base_len), None).code, "path-near-limit");
        assert_eq!(path_check(SIM_2024, steam, &"b".repeat(MAX_PATH_CHARS - base_len + 1), None).code, "path-too-long");
        assert_eq!(path_check(SIM_2024, steam, "", None).status, "unknown");
        // UTF-16 birimiyle sayılır.
        assert_eq!(path_len("ğüşİ"), 4);
        // Sınırı aşan dosya sayısı (uzunluklar büyükten küçüğe).
        let room = (MAX_PATH_CHARS - base_len) as u16;
        assert_eq!(count_over(&[room + 5, room + 1, room, 10], steam), 2);
        assert_eq!(count_over(&[], steam), 0);
        assert!(path_check(SIM_2024, store, &rel, Some(34)).detail.starts_with("34 dosya"));
    }

    #[test]
    fn leftovers_are_not_reported() {
        assert!(is_leftover(r"simobjects\airplanes\fnx_32x\presets\config\attached_objects.cfg.gsx"));
        assert!(is_leftover("readme.txt") && is_leftover(r"docs\.ds_store") && is_leftover("aircraft.cfg.bak"));
        assert!(!is_leftover(r"simobjects\airplanes\x\aircraft.cfg") && !is_leftover(r"html_ui\a.js"));
    }

    /// Bu makinedeki gerçek kurulumu SALT OKUNUR denetler (hiçbir dosyaya yazmaz):
    /// `cargo test real_readiness -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_readiness() {
        // Hangar'ın gerçek ayarlarını yalnızca okur (yazmaz, bozuk dosyayı yedeklemez).
        let settings = crate::migrate::read_hangar_settings().unwrap_or_default();
        println!("kütüphane: {:?}", settings.library_path);
        let sims = crate::sims::detect_sims(&settings);
        for s in &sims {
            println!(
                "{} {} detected={} running={} exe.xml={:?} Content.xml={:?} community={:?}",
                s.id, s.edition, s.detected, s.running, s.exe_xml, s.content_xml, s.community_path
            );
            println!("   başlatma: {:?}", crate::sims::launch_uri(s).map_err(|e| e.to_string()));
        }
        let mut cache = crate::scanner::ScanCache::default();
        let t = std::time::Instant::now();
        let r = crate::scanner::scan(sims, settings.library_path.clone(), &crate::store::Db::default(), &mut cache);
        println!("tarama {:?}, {} mod", t.elapsed(), r.mods.len());
        let t = std::time::Instant::now();
        let r2 = crate::scanner::scan(r.sims.clone(), settings.library_path.clone(), &crate::store::Db::default(), &mut cache);
        println!("ikinci tarama (önbellekli) {:?}", t.elapsed());
        assert_eq!(r.mods.len(), r2.mods.len());
        for m in &r.mods {
            let states: Vec<String> = m.sims.iter().map(|(k, v)| format!("{k}={}", v.state)).collect();
            println!("\n=== {} [{}] {} | {:?} | genel: {}", m.info.folder, m.source, m.info.title, states, worst_status(&m.readiness));
            for c in &m.readiness {
                println!(
                    "  [{:7}] {:<26} {:<9} {} — {}",
                    c.status,
                    c.code,
                    c.sim.as_deref().unwrap_or("-"),
                    c.title,
                    c.detail
                );
                if let Some(h) = &c.hint {
                    println!("            öneri: {h}");
                }
                if let Some(f) = &c.fix {
                    println!("            düzeltme: {f:?}");
                }
            }
            let errs: Vec<&str> = m.issues.iter().filter(|i| i.level == "error").map(|i| i.code.as_str()).collect();
            println!("  issues(error): {errs:?}");
            let v = verify(m, &r);
            println!("  -- derin doğrulama: {} ({} dosya, {} ms)", v.status, v.files_checked, v.duration_ms);
            for c in v.checks.iter().filter(|c| c.group == "files" || c.group == "path") {
                println!("  [{:7}] {:<26} {:<9} {} — {}", c.status, c.code, c.sim.as_deref().unwrap_or("-"), c.title, c.detail);
            }
        }
    }
}
