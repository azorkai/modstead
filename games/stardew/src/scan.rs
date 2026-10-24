//! Mods klasörünü SMAPI'nin yaptığı gibi tarar: manifest.json içeren klasör bir moddur,
//! manifest'i olmayıp yalnızca alt klasör içeren klasör bir gruptur, "." ile başlayan
//! klasörler SMAPI tarafından yok sayılır (yani devre dışıdır).

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::fsx;
use serde::Serialize;

use crate::manifest::{self, ContentPackFor, Dependency};
use crate::util;

pub const CORE_IDS: &[&str] = &["SMAPI.ConsoleCommands", "SMAPI.SaveBackup"];
const SUSPICIOUS_EXT: &[&str] = &["exe", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "scr", "msi", "com", "hta", "lnk", "reg", "pif", "cpl"];
const ARCHIVE_EXT: &[&str] = &["zip", "7z", "rar"];
const IGNORED_FILES: &[&str] = &["desktop.ini", "thumbs.db", ".ds_store", "__folder_managed_by_vortex"];
/// Arşivlerde mod kökü ararken atlanan klasörler.
const SKIP_NAMES: &[&str] = &["__macosx", ".ds_store", "thumbs.db", "desktop.ini"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    /// Mods klasörüne göre gerçek göreli yol (devre dışıysa "." ile).
    pub folder: String,
    /// Görüntülenecek klasör adı ("." olmadan).
    pub folder_name: String,
    pub group: Option<String>,
    pub enabled: bool,
    pub disabled_by_parent: bool,
    pub manifest_error: Option<String>,
    pub problems: Vec<String>,
    pub unique_id: Option<String>,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    /// smapi | content | unknown
    pub kind: String,
    pub entry_dll: Option<String>,
    pub content_pack_for: Option<ContentPackFor>,
    pub minimum_api_version: Option<String>,
    pub minimum_game_version: Option<String>,
    pub dependencies: Vec<Dependency>,
    pub update_keys: Vec<String>,
    pub nexus_id: Option<u64>,
    pub size: u64,
    pub file_count: u32,
    pub modified: u64,
    pub has_config: bool,
    pub executables: Vec<String>,
    pub dlls: Vec<String>,
    pub is_core: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Stray {
    pub path: String,
    /// archive | no-manifest | empty
    pub kind: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub mods_path: Option<String>,
    pub exists: bool,
    pub mods: Vec<ModInfo>,
    pub strays: Vec<Stray>,
    pub scanned_at: u64,
}

fn rel_str(base: &Path, p: &Path) -> String {
    p.strip_prefix(base).unwrap_or(p).to_string_lossy().replace('/', "\\")
}

fn ext_lower(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default()
}

fn find_manifest(dir: &Path) -> Option<PathBuf> {
    let direct = dir.join("manifest.json");
    if direct.is_file() {
        return Some(direct);
    }
    fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| p.is_file() && p.file_name().is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("manifest.json")))
}

pub fn scan_mods(mods_dir: &Path) -> ScanResult {
    let mut result = ScanResult { mods_path: Some(mods_dir.to_string_lossy().into_owned()), exists: mods_dir.is_dir(), scanned_at: util::now_ms(), ..Default::default() };
    if result.exists {
        walk(mods_dir, mods_dir, None, false, &mut result);
    }
    result.mods.sort_by_key(|m| m.name.to_lowercase());
    result
}

fn walk(base: &Path, dir: &Path, group: Option<String>, parent_disabled: bool, out: &mut ScanResult) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = rd.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(ft) = entry.file_type() else { continue };
        // Bağlar (symlink/junction) izlenmez: Mods dışına işaret edebilirler.
        if ft.is_symlink() || fsx::is_link(&path) {
            continue;
        }
        if !ft.is_dir() {
            if ARCHIVE_EXT.contains(&ext_lower(&path).as_str()) {
                out.strays.push(Stray { path: rel_str(base, &path), kind: "archive".into(), size: entry.metadata().map(|m| m.len()).unwrap_or(0) });
            }
            continue;
        }
        let disabled = parent_disabled || name.starts_with('.');
        if let Some(manifest_path) = find_manifest(&path) {
            out.mods.push(read_mod(base, &path, &manifest_path, group.clone(), disabled, parent_disabled));
            continue;
        }
        let children: Vec<_> = fs::read_dir(&path).map(|r| r.flatten().collect()).unwrap_or_default();
        let has_subdirs = children.iter().any(|c| c.path().is_dir());
        let meaningful_files = children
            .iter()
            .filter(|c| c.path().is_file())
            .filter(|c| !IGNORED_FILES.contains(&c.file_name().to_string_lossy().to_ascii_lowercase().as_str()))
            .count();
        if has_subdirs {
            let g = name.trim_start_matches('.').to_string();
            let group_name = match &group {
                Some(parent) => format!("{parent} / {g}"),
                None => g,
            };
            walk(base, &path, Some(group_name), disabled, out);
        } else if !disabled {
            let (size, _) = fsx::dir_stats(&path);
            out.strays.push(Stray { path: rel_str(base, &path), kind: if meaningful_files == 0 { "empty".into() } else { "no-manifest".into() }, size });
        }
    }
}

/// Tek bir mod klasörünü okur (kurulum öncesi inceleme için).
pub fn scan_one(base: &Path, dir: &Path) -> ModInfo {
    let manifest = find_manifest(dir).unwrap_or_else(|| dir.join("manifest.json"));
    read_mod(base, dir, &manifest, None, false, false)
}

fn read_mod(base: &Path, dir: &Path, manifest_path: &Path, group: Option<String>, disabled: bool, parent_disabled: bool) -> ModInfo {
    let folder = rel_str(base, dir);
    let folder_name = dir.file_name().map(|n| n.to_string_lossy().trim_start_matches('.').to_string()).unwrap_or_default();

    let mut size = 0u64;
    let mut file_count = 0u32;
    let mut executables = Vec::new();
    let mut dlls = Vec::new();
    for e in walkdir::WalkDir::new(dir).follow_links(false).into_iter().flatten() {
        if !e.file_type().is_file() {
            continue;
        }
        file_count += 1;
        size += e.metadata().map(|m| m.len()).unwrap_or(0);
        let ext = ext_lower(e.path());
        let rel = rel_str(dir, e.path());
        if SUSPICIOUS_EXT.contains(&ext.as_str()) {
            executables.push(rel);
        } else if ext == "dll" {
            dlls.push(rel);
        }
    }

    let (m, manifest_error) = match manifest::read_manifest(manifest_path) {
        Ok(m) => (m, None),
        Err(e) => (Default::default(), Some(e)),
    };
    let kind = if manifest_error.is_some() {
        "unknown"
    } else if m.content_pack_for.is_some() {
        "content"
    } else if m.entry_dll.is_some() {
        "smapi"
    } else {
        "unknown"
    };
    let is_core = m.unique_id.as_deref().is_some_and(|id| CORE_IDS.iter().any(|c| c.eq_ignore_ascii_case(id)));

    ModInfo {
        name: m.name.clone().unwrap_or_else(|| folder_name.clone()),
        nexus_id: manifest::nexus_id(&m.update_keys),
        has_config: dir.join("config.json").is_file(),
        modified: util::mtime_ms(manifest_path),
        folder,
        folder_name,
        group,
        enabled: !disabled,
        disabled_by_parent: parent_disabled,
        manifest_error,
        problems: m.problems,
        unique_id: m.unique_id,
        author: m.author,
        version: m.version,
        description: m.description,
        kind: kind.into(),
        entry_dll: m.entry_dll,
        content_pack_for: m.content_pack_for,
        minimum_api_version: m.minimum_api_version,
        minimum_game_version: m.minimum_game_version,
        dependencies: m.dependencies,
        update_keys: m.update_keys,
        size,
        file_count,
        executables,
        dlls,
        is_core,
    }
}

/// Açılmış bir arşivde en dıştaki mod köklerini (manifest.json içeren klasörler) bulur.
pub fn find_mod_roots(dir: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = fs::read_dir(&d) else { continue };
        let entries: Vec<_> = rd.flatten().collect();
        let has_manifest = entries.iter().any(|e| e.path().is_file() && e.file_name().to_string_lossy().eq_ignore_ascii_case("manifest.json"));
        if has_manifest {
            roots.push(d);
            continue;
        }
        for e in entries {
            let p = e.path();
            if p.is_dir() && !fsx::is_link(&p) && !SKIP_NAMES.contains(&e.file_name().to_string_lossy().to_ascii_lowercase().as_str()) {
                stack.push(p);
            }
        }
    }
    roots.sort();
    roots
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::util::TempDir;

    pub fn write(p: &Path, s: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, s).unwrap();
    }

    #[test]
    fn scans_groups_disabled_and_strays() {
        let d = TempDir::new();
        let m = d.path();
        write(&m.join("ContentPatcher/manifest.json"), r#"{"Name":"Content Patcher","Author":"P","Version":"2.0.0","UniqueID":"Pathoschild.ContentPatcher","EntryDll":"ContentPatcher.dll"}"#);
        write(&m.join("ContentPatcher/ContentPatcher.dll"), "x");
        write(&m.join(".Disabled/manifest.json"), r#"{"Name":"Off","Author":"A","Version":"1.0","UniqueID":"a.off","EntryDll":"Off.dll"}"#);
        write(&m.join("Group/[CP] Pack/manifest.json"), r#"{"Name":"Pack","Author":"A","Version":"1.0","UniqueID":"a.pack","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#);
        write(&m.join("Group/[CP] Pack/config.json"), "{}");
        write(&m.join("NoManifest/readme.txt"), "x");
        write(&m.join("Broken/manifest.json"), "{ nope");
        write(&m.join("Downloaded.zip"), "PK");
        write(&m.join("Evil/manifest.json"), r#"{"Name":"Evil","Author":"A","Version":"1.0","UniqueID":"a.evil","EntryDll":"E.dll"}"#);
        write(&m.join("Evil/run.bat"), "x");

        let r = scan_mods(m);
        assert_eq!(r.mods.len(), 5);
        let off = r.mods.iter().find(|x| x.name == "Off").unwrap();
        assert!(!off.enabled);
        assert_eq!(off.folder_name, "Disabled");
        let pack = r.mods.iter().find(|x| x.name == "Pack").unwrap();
        assert_eq!(pack.kind, "content");
        assert_eq!(pack.group.as_deref(), Some("Group"));
        assert!(pack.has_config);
        let broken = r.mods.iter().find(|x| x.folder == "Broken").unwrap();
        assert!(broken.manifest_error.is_some());
        let evil = r.mods.iter().find(|x| x.name == "Evil").unwrap();
        assert_eq!(evil.executables, vec!["run.bat".to_string()]);
        assert!(r.strays.iter().any(|s| s.kind == "archive" && s.path == "Downloaded.zip"));
        assert!(r.strays.iter().any(|s| s.kind == "no-manifest" && s.path == "NoManifest"));
    }

    #[test]
    fn finds_outermost_roots() {
        let d = TempDir::new();
        for p in ["Pack/[CP] A/manifest.json", "Pack/[JA] B/manifest.json", "Pack/[CP] A/inner/manifest.json", "__MACOSX/Pack/x/manifest.json"] {
            write(&d.path().join(p), "{}");
        }
        let roots = find_mod_roots(d.path());
        assert_eq!(roots.len(), 2);
    }
}
