//! Diskteki modlar: Paradox Mods abonelikleri (oyunun önbelleği) ve yerel modlar.
//!
//! - Paradox: `<kullanıcı>\.cache\Mods\pdx_mods\<modId>_<sürüm>` (1.1–1.5 sürümlerinde `mods_subscribed`).
//!   Kök klasörler oyunun `mod_directory.json` dosyasından da okunur. Oyun bir modu güncelleyince eski
//!   sürüm klasörü çoğu zaman silinmeden kalır (`<id>_6` yanında `<id>_7`): bunlar "eski sürüm" olarak
//!   ayrılır ve temizlenebilir. Yarım kalmış indirmeler `.downloading` ekiyle durur.
//! - Yerel: `<kullanıcı>\Mods\<klasör>`; başında nokta olan klasör oyun tarafından yüklenmez (kapalı).

use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use modstead_core::{fsx, platform};
use serde::Serialize;

use crate::paradox::PdxMeta;

/// Bilinen kötü amaçlı mod sürümleri: (Paradox mod numarası, sürüm, DLL SHA-256, açıklama).
/// 2024'te Paradox Mods'taki "Traffic" modunun 0.2.3 sürümü (`80095_13`) `FastMath.dll` içinde kötü
/// amaçlı kod taşıdı ve yayından kaldırıldı; önbellekte kalmış olabilir.
pub const KNOWN_BAD: &[(&str, u32, &str, &str)] = &[(
    "80095",
    13,
    "8c6c3f9b3fd8497322cd9e798790aa3485a44f9c5418bb4aa97b630a3fb8cead",
    "Traffic 0.2.3 · FastMath.dll",
)];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StaleVersion {
    pub folder: String,
    pub version: u32,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    /// `pdx:<modId>` ya da `local:<klasör>` (klasör adı noktasız).
    pub key: String,
    /// "paradox" | "local"
    pub source: &'static str,
    pub name: String,
    /// Diskteki klasör adı (yerel: kapalıysa başında nokta; Paradox: `<id>_<sürüm>`).
    pub folder: String,
    pub path: String,
    pub enabled: bool,
    pub mod_id: Option<String>,
    /// Paradox: sürüm numarası (oyunun klasör adındaki); yerel: ana DLL'in dosya sürümü.
    pub version: Option<String>,
    /// "code" | "asset" | "map" | "save" | "other"
    pub kind: &'static str,
    pub dlls: Vec<String>,
    /// Arayüz modülü (.mjs/.js) içeriyor.
    pub has_ui: bool,
    pub size: u64,
    pub file_count: u32,
    pub modified: i64,
    /// Paradox: aynı modun eski sürüm klasörleri (oyunun silmediği).
    pub stale: Vec<StaleVersion>,
    /// Yerel: BepInEx eklentisi (oyunun yerleşik mod sistemiyle yüklenmez).
    pub bepinex: bool,
    /// Bilinen kötü amaçlı sürüm.
    pub known_bad: Option<String>,
    /// Paradox Mods kataloğundan (önbellekten) ad, görsel, uyumluluk, bağımlılıklar.
    pub meta: Option<PdxMeta>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModScan {
    pub mods: Vec<ModEntry>,
    pub local_dir: String,
    pub local_exists: bool,
    /// Paradox önbellek kökleri (var olanlar).
    pub pdx_roots: Vec<String>,
    /// Yarım kalmış indirmeler (Paradox köklerine göre ad).
    pub partial: Vec<String>,
}

/// Paradox önbellek kökleri: oyunun `mod_directory.json`'ı + bilinen varsayılanlar (yalnızca kullanıcı verisi içinde).
pub fn pdx_roots(user_dir: &Path) -> Vec<PathBuf> {
    let cache = user_dir.join(".cache").join("Mods");
    let mut roots = vec![cache.join("pdx_mods"), cache.join("mods_subscribed")];
    if let Ok(bytes) = fs::read(cache.join("mod_directory.json")) {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            for src in v.get("modsSources").and_then(|s| s.as_array()).into_iter().flatten() {
                if src.get("source").and_then(|s| s.as_str()) != Some("pdx_mods") {
                    continue;
                }
                for p in src.get("rootPaths").and_then(|r| r.as_array()).into_iter().flatten().filter_map(|p| p.as_str()) {
                    let path = PathBuf::from(p.replace('/', "\\"));
                    if path.is_dir() && fsx::is_within(user_dir, &path) {
                        roots.push(path);
                    }
                }
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    roots.into_iter().filter(|r| r.is_dir() && !fsx::is_link(r) && seen.insert(fsx::norm_key(r))).collect()
}

/// `<modId>_<sürüm>` → (modId, sürüm)
pub fn parse_pdx_folder(name: &str) -> Option<(String, u32)> {
    let (id, ver) = name.split_once('_')?;
    let digits = |s: &str, max: usize| !s.is_empty() && s.len() <= max && s.chars().all(|c| c.is_ascii_digit());
    if !digits(id, 12) || !digits(ver, 6) {
        return None;
    }
    Some((id.to_string(), ver.parse().ok()?))
}

fn mtime(path: &Path) -> i64 {
    fs::metadata(path).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Burst'ün üreteceği yerel kitaplıklar ve yardımcılar "ana DLL" sayılmaz.
fn is_native_helper(name: &str) -> bool {
    let l = name.to_ascii_lowercase();
    l.ends_with("_win_x86_64.dll") || l.starts_with("lib_burst_generated")
}

struct Contents {
    dlls: Vec<String>,
    has_ui: bool,
    kind: &'static str,
    size: u64,
    files: u32,
}

/// Klasör içeriğini (bağları izlemeden, sınırlı derinlikte) özetler.
fn inspect(dir: &Path) -> Contents {
    let (mut dlls, mut has_ui, mut prefab, mut cok, mut size, mut files) = (Vec::new(), false, false, Vec::new(), 0u64, 0u32);
    for e in walkdir::WalkDir::new(dir).follow_links(false).max_depth(6).into_iter().flatten().take(20_000) {
        if !e.file_type().is_file() {
            continue;
        }
        files += 1;
        size += e.metadata().map(|m| m.len()).unwrap_or(0);
        let name = e.file_name().to_string_lossy().into_owned();
        let lower = name.to_ascii_lowercase();
        if lower.ends_with(".dll") {
            dlls.push(e.path().strip_prefix(dir).unwrap_or(e.path()).to_string_lossy().replace('\\', "/"));
        } else if lower.ends_with(".mjs") || lower.ends_with(".js") {
            has_ui = true;
        } else if lower.ends_with(".prefab") {
            prefab = true;
        } else if lower.ends_with(".cok") && cok.len() < 3 {
            cok.push(e.path().to_path_buf());
        }
    }
    let kind = if !dlls.is_empty() {
        "code"
    } else if let Some(k) = cok.iter().find_map(|p| cok_kind(p)) {
        k
    } else if prefab {
        "asset"
    } else {
        "other"
    };
    dlls.sort_by_key(|d| (d.contains('/'), d.to_ascii_lowercase()));
    Contents { dlls, has_ui, kind, size, files }
}

/// `.cok` bir ZIP'tir: içinde `*.SaveGameMetadata` varsa kayıt, `*.MapMetadata` varsa harita.
pub fn cok_kind(path: &Path) -> Option<&'static str> {
    let f = fs::File::open(path).ok()?;
    let zip = zip::ZipArchive::new(f).ok()?;
    let names: Vec<String> = zip.file_names().filter_map(|n| n.ok()).map(|n| n.to_ascii_lowercase()).collect();
    if names.iter().any(|n| n.ends_with(".savegamemetadata")) {
        Some("save")
    } else if names.iter().any(|n| n.ends_with(".mapmetadata")) {
        Some("map")
    } else {
        None
    }
}

/// Ana DLL: klasör adıyla aynı adı taşıyan, yoksa en üst düzeydeki ilk yönetilen kitaplık.
fn main_dll<'a>(folder: &str, dlls: &'a [String]) -> Option<&'a String> {
    let want = format!("{}.dll", folder.trim_start_matches('.')).to_ascii_lowercase();
    dlls.iter().find(|d| d.to_ascii_lowercase() == want).or_else(|| dlls.iter().find(|d| !d.contains('/') && !is_native_helper(d))).or_else(|| dlls.iter().find(|d| !is_native_helper(d)))
}

fn dll_stem(rel: &str) -> String {
    let file = rel.rsplit('/').next().unwrap_or(rel);
    file.strip_suffix(".dll").or_else(|| file.strip_suffix(".DLL")).unwrap_or(file).to_string()
}

/// Yönetilen bir DLL BepInEx'e başvuruyor mu? (meta veri dizgelerinde "BepInEx" geçer)
pub fn references_bepinex(path: &Path) -> bool {
    let Ok(mut f) = fs::File::open(path) else { return false };
    let mut buf = Vec::new();
    if f.by_ref().take(16 * 1024 * 1024).read_to_end(&mut buf).is_err() {
        return false;
    }
    buf.windows(7).any(|w| w == b"BepInEx")
}

/// Bütün modlar. `meta` sonradan (Paradox önbelleğinden) doldurulur.
pub fn scan(user_dir: &Path) -> ModScan {
    let mut mods = Vec::new();
    let mut partial = Vec::new();
    let roots = pdx_roots(user_dir);

    // Paradox: modId → sürüm → klasör
    let mut by_id: BTreeMap<String, Vec<(u32, PathBuf)>> = BTreeMap::new();
    for root in &roots {
        for e in fs::read_dir(root).into_iter().flatten().flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.to_ascii_lowercase().contains(".downloading") {
                partial.push(name);
                continue;
            }
            let path = e.path();
            if !path.is_dir() || fsx::is_link(&path) {
                continue;
            }
            if let Some((id, ver)) = parse_pdx_folder(&name) {
                by_id.entry(id).or_default().push((ver, path));
            }
        }
    }
    for (id, mut versions) in by_id {
        versions.sort_by(|a, b| b.0.cmp(&a.0));
        let (ver, path) = versions.remove(0);
        let folder = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
        let c = inspect(&path);
        let stale = versions
            .into_iter()
            .map(|(v, p)| StaleVersion { folder: p.file_name().unwrap_or_default().to_string_lossy().into_owned(), version: v, size: fsx::dir_stats(&p).0 })
            .collect::<Vec<_>>();
        let known_bad = KNOWN_BAD.iter().find(|(bid, bver, _, _)| *bid == id && (*bver == ver || stale_has(&stale, *bver))).map(|(_, _, _, label)| label.to_string());
        let name = main_dll(&folder, &c.dlls).map(|d| dll_stem(d)).unwrap_or_else(|| format!("Paradox Mods #{id}"));
        mods.push(ModEntry {
            key: format!("pdx:{id}"),
            source: "paradox",
            name,
            folder,
            path: path.to_string_lossy().into_owned(),
            enabled: true,
            mod_id: Some(id),
            version: Some(ver.to_string()),
            kind: c.kind,
            dlls: c.dlls,
            has_ui: c.has_ui,
            size: c.size,
            file_count: c.files,
            modified: mtime(&path),
            stale,
            bepinex: false,
            known_bad,
            meta: None,
        });
    }

    // Yerel modlar
    let local = user_dir.join("Mods");
    for e in fs::read_dir(&local).into_iter().flatten().flatten() {
        let path = e.path();
        if !path.is_dir() || fsx::is_link(&path) {
            continue;
        }
        let folder = e.file_name().to_string_lossy().into_owned();
        let enabled = !folder.starts_with('.');
        let clean = folder.trim_start_matches('.').to_string();
        if clean.is_empty() {
            continue;
        }
        let c = inspect(&path);
        let main = main_dll(&folder, &c.dlls).cloned();
        let version = main.as_ref().and_then(|d| platform::file_version(&path.join(d))).map(|v| platform::format_version(v, false)).filter(|v| v != "0.0.0");
        let bepinex = c.dlls.iter().any(|d| !is_native_helper(d) && references_bepinex(&path.join(d)));
        mods.push(ModEntry {
            key: format!("local:{clean}"),
            source: "local",
            name: clean,
            folder,
            path: path.to_string_lossy().into_owned(),
            enabled,
            mod_id: None,
            version,
            kind: c.kind,
            dlls: c.dlls,
            has_ui: c.has_ui,
            size: c.size,
            file_count: c.files,
            modified: mtime(&path),
            stale: Vec::new(),
            bepinex,
            known_bad: None,
            meta: None,
        });
    }
    ModScan {
        mods,
        local_exists: local.is_dir(),
        local_dir: local.to_string_lossy().into_owned(),
        pdx_roots: roots.iter().map(|r| r.to_string_lossy().into_owned()).collect(),
        partial,
    }
}

fn stale_has(stale: &[StaleVersion], ver: u32) -> bool {
    stale.iter().any(|s| s.version == ver)
}

/// Ana sayfa kartı için ucuz sayım: yalnızca klasör adları okunur.
#[derive(Default, Clone, Copy, Debug)]
pub struct QuickCounts {
    pub paradox: u32,
    pub local: u32,
    pub local_enabled: u32,
}

impl QuickCounts {
    pub fn total(&self) -> u32 {
        self.paradox + self.local
    }

    pub fn enabled(&self) -> u32 {
        self.paradox + self.local_enabled
    }
}

pub fn quick_counts(user_dir: &Path) -> QuickCounts {
    let mut ids = std::collections::HashSet::new();
    for root in pdx_roots(user_dir) {
        for e in fs::read_dir(root).into_iter().flatten().flatten() {
            if let Some((id, _)) = parse_pdx_folder(&e.file_name().to_string_lossy()) {
                ids.insert(id);
            }
        }
    }
    let mut c = QuickCounts { paradox: ids.len() as u32, ..Default::default() };
    for e in fs::read_dir(user_dir.join("Mods")).into_iter().flatten().flatten() {
        if e.path().is_dir() {
            c.local += 1;
            if !e.file_name().to_string_lossy().starts_with('.') {
                c.local_enabled += 1;
            }
        }
    }
    c
}

/// DLL dosya adlarına göre yerel ve Paradox kopyası olan modlar: (yerel anahtar, Paradox anahtarı, ortak DLL).
pub fn duplicates(mods: &[ModEntry]) -> Vec<(String, String, String)> {
    let mut out = Vec::new();
    for l in mods.iter().filter(|m| m.source == "local" && m.enabled) {
        for p in mods.iter().filter(|m| m.source == "paradox") {
            let common = l.dlls.iter().filter(|d| !is_native_helper(d)).map(|d| d.rsplit('/').next().unwrap_or(d).to_ascii_lowercase()).find(|d| {
                p.dlls.iter().any(|pd| pd.rsplit('/').next().unwrap_or(pd).eq_ignore_ascii_case(d))
            });
            if let Some(dll) = common {
                out.push((l.key.clone(), p.key.clone(), dll));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::fixture;

    #[test]
    fn parses_folder_names() {
        assert_eq!(parse_pdx_folder("75863_2"), Some(("75863".into(), 2)));
        assert_eq!(parse_pdx_folder("75863"), None);
        assert_eq!(parse_pdx_folder("abc_2"), None);
        assert_eq!(parse_pdx_folder("75863_2.downloading"), None);
    }

    #[test]
    fn scans_paradox_and_local_mods() {
        let fx = fixture();
        fx.add_pdx(74417, 13, "UnifiedIconLibrary.dll");
        fx.add_pdx(74417, 14, "UnifiedIconLibrary.dll");
        fx.add_pdx(80095, 13, "Traffic.dll");
        fx.add_local("MyTool", "MyTool.dll", b"MZ managed");
        fx.add_local(".OldPlugin", "OldPlugin.dll", b"MZ ... BepInEx.Core ...");
        fx.add_local("Dup", "UnifiedIconLibrary.dll", b"MZ");
        std::fs::create_dir_all(fx.game.mods_cache_dir().join("pdx_mods").join("77240_3.downloading")).unwrap();

        let scan = scan(&fx.user());
        let uil = scan.mods.iter().find(|m| m.key == "pdx:74417").unwrap();
        assert_eq!(uil.version.as_deref(), Some("14"));
        assert_eq!(uil.stale.len(), 1, "eski sürüm klasörü ayrılmalı");
        assert_eq!(uil.name, "UnifiedIconLibrary");
        assert_eq!(uil.kind, "code");
        assert!(scan.mods.iter().find(|m| m.key == "pdx:80095").unwrap().known_bad.is_some());
        let old = scan.mods.iter().find(|m| m.key == "local:OldPlugin").unwrap();
        assert!(!old.enabled);
        assert!(old.bepinex);
        assert!(!scan.mods.iter().find(|m| m.key == "local:MyTool").unwrap().bepinex);
        assert_eq!(scan.partial, vec!["77240_3.downloading".to_string()]);

        let dups = duplicates(&scan.mods);
        assert_eq!(dups.len(), 1);
        assert_eq!(dups[0].0, "local:Dup");
        assert_eq!(dups[0].1, "pdx:74417");

        let q = quick_counts(&fx.user());
        assert_eq!((q.paradox, q.local, q.local_enabled), (2, 3, 2));
    }
}
