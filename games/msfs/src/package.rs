//! Tek bir MSFS paketini (manifest.json + layout.json) okur ve sınıflandırır.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

use regex::Regex;
use serde::Serialize;
use serde_json::Value;


#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    pub folder: String,
    pub path: PathBuf,
    pub title: String,
    pub creator: String,
    pub manufacturer: String,
    pub content_type: String,
    /// Akıllı sınıf: aircraft, livery, airport, scenery, avionics, tool, mission, core, other
    pub category: String,
    pub version: String,
    pub min_game_version: String,
    pub builder: String,
    /// "2020" (2020 için derlenmiş, 2024'te çoğunlukla çalışır) ya da "2024" (yalnızca 2024).
    pub built_for: String,
    pub size: u64,
    pub file_count: u32,
    pub dependencies: Vec<Dependency>,
    pub thumbnail: Option<PathBuf>,
    pub icaos: Vec<String>,
    pub has_layout: bool,
    pub wasm_modules: u32,
    pub manifest_ok: bool,
    #[serde(skip)]
    pub layout_hashes: Arc<Vec<u64>>,
    /// layout.json'daki en uzun göreli yol (`\` ayraçlı); yol uzunluğu denetimi için.
    #[serde(skip)]
    pub longest_layout_path: String,
    /// layout.json'daki tüm göreli yolların uzunlukları (UTF-16, büyükten küçüğe); sınırı aşan dosya sayısı için.
    #[serde(skip)]
    pub layout_path_lengths: Arc<Vec<u16>>,
    /// manifest.json'da bulunmayan temel alanlar (title, package_version, minimum_game_version).
    #[serde(skip)]
    pub missing_manifest_fields: Vec<String>,
}

/// SDK'nın her pakete yazdığı temel alanlar. `content_type` bilerek yok: birçok çalışan topluluk modunda eksiktir.
pub const REQUIRED_MANIFEST_FIELDS: &[&str] = &["title", "package_version", "minimum_game_version"];

/// Yol özetleri için hızlı, kararlı FNV-1a (çakışma tespiti; güvenlik amaçlı değil).
pub fn fnv1a(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Klasör boyutu ve dosya sayısı (bağlantıları izlemez, en fazla `max_files` dosya).
pub fn dir_stats(path: &Path, max_files: usize) -> (u64, u32) {
    let mut size = 0u64;
    let mut count = 0u32;
    for e in walkdir::WalkDir::new(path).follow_links(false).into_iter().flatten() {
        if e.file_type().is_file() {
            size += e.metadata().map(|m| m.len()).unwrap_or(0);
            count += 1;
            if count as usize >= max_files {
                break;
            }
        }
    }
    (size, count)
}

/// Windows yol uzunluğu (UTF-16 birimi); MAX_PATH bu birimle sayılır.
pub fn path_len(s: &str) -> usize {
    s.encode_utf16().count()
}

static TRAILING_COMMA: LazyLock<Regex> = LazyLock::new(|| Regex::new(r",(\s*[}\]])").unwrap());
static ICAO_PAREN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b([A-Z]{4})\b").unwrap());

/// ICAO'ya benzeyen ama havalimanı olmayan sık kelimeler.
const NOT_ICAO: &[&str] = &[
    "msfs", "pack", "mesh", "city", "core", "mods", "base", "free", "ware", "mega", "mini", "plus", "full",
    "lite", "free", "fsdt", "orbx", "tfdi", "pmdg", "aero", "airs", "port", "land", "park", "bush", "trip",
    "test", "demo", "beta", "real", "zone", "area", "town", "west", "east", "home", "lake", "isle", "fork",
    "liv", "fixe", "data", "navi", "nav", "path", "road", "rail", "ship", "boat", "farm", "tree", "rock",
    "hill", "dock", "pier", "wall", "gate", "dome", "spot", "view", "addon", "copy", "nyc", "with", "from",
    "only", "user", "file", "edit", "page", "flag", "logo", "icon", "line", "lane", "lamp", "neon", "taxi",
    "fsdreamteam", "jets", "jett", "heli", "tour", "vol", "part", "ctrl", "xbox", "game", "sims", "simw",
    "inib", "aerosoft", "simworks", "mod", "texture", "panel", "fbw", "a320", "b737", "neo", "sound",
    "rate", "time", "life", "live", "work", "wing", "fuel", "load", "nose", "tail", "door", "seat", "show",
    "fast", "slow", "high", "best", "true", "fake", "dark", "blue", "gold", "snow", "rain", "wind", "fogs",
    "sky", "moon", "star", "sun", "glow", "lite", "fix", "fixes", "hdr", "tool", "kit", "set", "sets", "auto",
];

fn str_field(v: &Value, key: &str) -> String {
    match v.get(key) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

pub(crate) fn read_json_lenient(path: &Path) -> Option<Value> {
    let bytes = fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let text = text.trim_start_matches('\u{feff}');
    serde_json::from_str(text)
        .ok()
        .or_else(|| serde_json::from_str(&TRAILING_COMMA.replace_all(text, "$1")).ok())
}

pub fn is_package_dir(p: &Path) -> bool {
    p.join("manifest.json").is_file()
}

/// Bir klasördeki paketleri bulur (manifest.json içeren klasörler). En fazla `depth` seviye iner.
pub fn find_package_roots(root: &Path, depth: usize) -> Vec<PathBuf> {
    let mut out = Vec::new();
    fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
        if is_package_dir(dir) {
            out.push(dir.to_path_buf());
            return;
        }
        if depth == 0 {
            return;
        }
        if let Ok(rd) = fs::read_dir(dir) {
            let mut entries: Vec<_> = rd.flatten().collect();
            entries.sort_by_key(|e| e.file_name());
            for e in entries {
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || name.eq_ignore_ascii_case("__MACOSX") {
                    continue;
                }
                let p = e.path();
                if p.is_dir() {
                    walk(&p, depth - 1, out);
                }
            }
        }
    }
    walk(root, depth, &mut out);
    out
}

fn extract_icaos(folder: &str, title: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let valid_first = |c: char| "ABCDEFGHKLMNOPRSTUVWYZ".contains(c);
    let mut push = |s: &str| {
        let up = s.to_uppercase();
        if up.len() == 4
            && up.chars().all(|c| c.is_ascii_alphabetic())
            && valid_first(up.chars().next().unwrap())
            && !NOT_ICAO.contains(&s.to_lowercase().as_str())
            && !out.contains(&up)
        {
            out.push(up);
        }
    };
    // Başlıkta büyük harfle yazılmış 4 harfli kodlar (ör. "Istanbul Airport (LTFM)") güçlü işarettir.
    for c in ICAO_PAREN.captures_iter(title) {
        push(&c[1]);
    }
    // Klasör adında ayraçla ayrılmış 4 harfli parçalar (ör. "xyz-airport-ltfm-istanbul").
    for token in folder.to_lowercase().split(|c: char| !c.is_ascii_alphanumeric()) {
        push(token);
    }
    out.truncate(6);
    out
}

/// layout.json yollarına bakarak içeriği sınıflandırır.
fn classify(content_type: &str, paths: &[String], icaos: &[String], folder: &str) -> String {
    let ct = content_type.to_uppercase();
    let folder_l = folder.to_lowercase();
    let mut simobj = 0usize;
    let mut texture = 0usize;
    let mut model = 0usize;
    let mut bgl = 0usize;
    let mut html = 0usize;
    let mut missions = 0usize;
    for p in paths {
        if p.starts_with("simobjects/airplanes/") || p.starts_with("simobjects/rotorcraft/") {
            simobj += 1;
            if p.contains("/texture") {
                texture += 1;
            }
            if p.contains("/model") {
                model += 1;
            }
        }
        if p.ends_with(".bgl") {
            bgl += 1;
        }
        if p.starts_with("html_ui/") || p.starts_with("ingamepanels/") {
            html += 1;
        }
        if p.starts_with("missions/") {
            missions += 1;
        }
    }
    let looks_livery = simobj > 0 && model == 0 && texture * 2 >= simobj;
    match ct.as_str() {
        "LIVERY" => return "livery".into(),
        "INSTRUMENTS" => return "avionics".into(),
        "CORE" => return "core".into(),
        "MISSION" | "MISSIONS" => return "mission".into(),
        "AIRCRAFT" => return if looks_livery { "livery".into() } else { "aircraft".into() },
        "SCENERY" => return if !icaos.is_empty() || folder_l.contains("airport") { "airport".into() } else { "scenery".into() },
        _ => {}
    }
    if simobj > 0 {
        return if looks_livery || folder_l.contains("livery") || folder_l.contains("liveries") {
            "livery".into()
        } else {
            "aircraft".into()
        };
    }
    if bgl > 0 {
        return if !icaos.is_empty() || folder_l.contains("airport") { "airport".into() } else { "scenery".into() };
    }
    if html > 0 {
        return "tool".into();
    }
    if missions > 0 {
        return "mission".into();
    }
    "other".into()
}

fn pick_thumbnail(pkg: &Path, paths: &[String]) -> Option<PathBuf> {
    let is_img = |p: &str| p.ends_with(".jpg") || p.ends_with(".png") || p.ends_with(".jpeg");
    let ranked: [fn(&str) -> bool; 5] = [
        |p: &str| p.starts_with("contentinfo/") && p.contains("thumbnail") && !p.contains("small"),
        |p: &str| p.starts_with("contentinfo/") && p.contains("thumbnail"),
        |p: &str| p.contains("/texture") && p.ends_with("/thumbnail.jpg"),
        |p: &str| p.ends_with("thumbnail.jpg") || p.ends_with("thumbnail.png"),
        |p: &str| p.starts_with("contentinfo/") && (p.contains("screenshot") || p.contains("preview")),
    ];
    for rule in ranked {
        if let Some(p) = paths.iter().find(|p| is_img(p.as_str()) && rule(p.as_str())) {
            let full = pkg.join(p.replace('/', "\\"));
            if full.is_file() {
                return Some(full);
            }
        }
    }
    None
}

/// layout.json olmayan paketlerde küçük resmi ContentInfo klasöründe ara.
fn thumbnail_from_disk(pkg: &Path) -> Option<PathBuf> {
    let ci = fs::read_dir(pkg).ok()?.flatten().find(|e| e.file_name().to_string_lossy().eq_ignore_ascii_case("contentinfo"))?;
    for sub in fs::read_dir(ci.path()).ok()?.flatten() {
        if let Ok(rd) = fs::read_dir(sub.path()) {
            for f in rd.flatten() {
                let n = f.file_name().to_string_lossy().to_lowercase();
                if n.starts_with("thumbnail") && (n.ends_with(".jpg") || n.ends_with(".png")) {
                    return Some(f.path());
                }
            }
        }
    }
    None
}

pub struct LayoutData {
    pub paths: Vec<String>,
    pub total_size: u64,
}

pub fn read_layout(pkg: &Path) -> Option<LayoutData> {
    let v = read_json_lenient(&pkg.join("layout.json"))?;
    let content = v.get("content")?.as_array()?;
    let mut paths = Vec::with_capacity(content.len());
    let mut total = 0u64;
    for item in content {
        if let Some(p) = item.get("path").and_then(|p| p.as_str()) {
            paths.push(p.replace('\\', "/").to_lowercase());
        }
        total += item.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
    }
    Some(LayoutData { paths, total_size: total })
}

pub fn read_package(pkg: &Path) -> PackageInfo {
    let folder = pkg.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
    let manifest = read_json_lenient(&pkg.join("manifest.json"));
    let m = manifest.clone().unwrap_or(Value::Null);

    let title = str_field(&m, "title");
    let content_type = str_field(&m, "content_type");
    let builder = str_field(&m, "builder");
    let min_compat = str_field(&m, "minimum_compatibility_version");
    let built_for = if builder.contains("2024") || !min_compat.is_empty() { "2024" } else { "2020" };

    let dependencies = m
        .get("dependencies")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .map(|d| Dependency { name: str_field(d, "name"), version: str_field(d, "package_version") })
                .filter(|d| !d.name.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let layout = read_layout(pkg);
    let manifest_size: u64 = str_field(&m, "total_package_size").trim_start_matches('0').parse().unwrap_or(0);

    let (paths, layout_size) = match &layout {
        Some(l) => (l.paths.clone(), l.total_size),
        None => (Vec::new(), 0),
    };
    let (size, file_count) = if layout.is_some() {
        (if layout_size > 0 { layout_size } else { manifest_size }, paths.len() as u32)
    } else if manifest_size > 0 {
        (manifest_size, 0)
    } else {
        dir_stats(pkg, 200_000)
    };

    let mut icaos = extract_icaos(&folder, &title);
    let category = classify(&content_type, &paths, &icaos, &folder);
    if category != "airport" && category != "scenery" {
        icaos.clear();
    }
    let thumbnail = pick_thumbnail(pkg, &paths).or_else(|| thumbnail_from_disk(pkg));
    let wasm_modules = paths.iter().filter(|p| p.ends_with(".wasm")).count() as u32;

    // Çakışma tespiti için yolların özetleri; paket kimliğini taşıyan dosyalar hariç.
    let mut hashes: Vec<u64> = paths
        .iter()
        .filter(|p| *p != "manifest.json" && *p != "layout.json" && !p.ends_with("/thumbnail.jpg"))
        .map(|p| fnv1a(p))
        .collect();
    hashes.sort_unstable();
    hashes.dedup();

    let longest_layout_path = paths.iter().max_by_key(|p| path_len(p)).map(|p| p.replace('/', "\\")).unwrap_or_default();
    let mut lengths: Vec<u16> = paths.iter().map(|p| path_len(p).min(u16::MAX as usize) as u16).collect();
    lengths.sort_unstable_by(|a, b| b.cmp(a));
    let missing_manifest_fields = if manifest.is_some() {
        REQUIRED_MANIFEST_FIELDS.iter().filter(|f| str_field(&m, f).is_empty()).map(|f| f.to_string()).collect()
    } else {
        Vec::new()
    };

    PackageInfo {
        title: if title.is_empty() { folder.clone() } else { title },
        creator: str_field(&m, "creator"),
        manufacturer: str_field(&m, "manufacturer"),
        content_type,
        category,
        version: str_field(&m, "package_version"),
        min_game_version: str_field(&m, "minimum_game_version"),
        builder,
        built_for: built_for.into(),
        size,
        file_count,
        dependencies,
        thumbnail,
        icaos,
        has_layout: layout.is_some(),
        wasm_modules,
        manifest_ok: manifest.is_some(),
        layout_hashes: Arc::new(hashes),
        longest_layout_path,
        layout_path_lengths: Arc::new(lengths),
        missing_manifest_fields,
        folder,
        path: pkg.to_path_buf(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icao_from_folder_and_title() {
        assert_eq!(extract_icaos("flytampa-ltfm-istanbul", "Istanbul Airport"), vec!["LTFM"]);
        assert_eq!(extract_icaos("x-scenery", "Heathrow (EGLL)"), vec!["EGLL"]);
        assert!(extract_icaos("fnx-aircraft-320", "Fenix Airbus A320").is_empty());
        assert!(extract_icaos("msfs-mesh-pack", "Mesh").is_empty());
    }

    #[test]
    fn lenient_json() {
        let dir = std::env::temp_dir().join(format!("msfs-pkg-test-{}", modstead_core::fsx::short_id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("manifest.json"), "\u{feff}{\"title\": \"X\", \"package_version\": 1.2,}").unwrap();
        let p = read_package(&dir);
        assert_eq!(p.title, "X");
        assert_eq!(p.version, "1.2");
        assert_eq!(p.built_for, "2020");
        fs::remove_dir_all(&dir).unwrap();
    }
}
