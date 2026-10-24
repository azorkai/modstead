//! Bannerlord kurulumunu (Steam, GOG, Epic, elle) bulur ve oyunun klasörlerini çıkarır.
//! Kaynak: Otağ'ın game.rs; mağaza taraması çekirdekte (`modstead_core::stores`).

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::{platform, stores};
use serde::Serialize;

use crate::modules::submodule::{decode_xml, parse_xml};

pub const GAME_FOLDER: &str = "Mount & Blade II Bannerlord";
pub const STEAM_APP_ID: u32 = 261550;

pub const GAME_PROCESSES: &[&str] = &[
    "bannerlord.exe",
    "bannerlord.native.exe",
    "bannerlord.blse.standalone.exe",
    "bannerlord.blse.launcher.exe",
    "bannerlord.blse.launcherex.exe",
    "taleworlds.mountandblade.launcher.exe",
    "taleworlds.mountandblade.launcher.singleplayer.exe",
];

/// Oyunun klasörleri ve dosyaları (Otağ'daki `GameInfo`; arayüz aynı alanları kullanır).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameDirs {
    pub root: String,
    pub bin: String,
    pub modules_dir: String,
    pub workshop_dir: Option<String>,
    /// "steam" | "gog" | "epic" | "unknown"
    pub platform: String,
    pub version: String,
    pub exe: String,
    pub blse: Option<String>,
    pub configs_dir: String,
    pub launcher_data: String,
    /// "steam" | "gog" | "epic" | "manual"
    pub detected_by: String,
}

pub fn is_valid_root(p: &Path) -> bool {
    p.join("bin").join("Win64_Shipping_Client").join("Bannerlord.exe").is_file() && p.join("Modules").join("Native").join("SubModule.xml").is_file()
}

pub fn bin_dir(root: &Path) -> PathBuf {
    root.join("bin").join("Win64_Shipping_Client")
}

/// `bin/Win64_Shipping_Client/Version.xml` → "v1.2.12.xxxxx".
pub fn read_version(root: &Path) -> Option<String> {
    let text = decode_xml(&fs::read(bin_dir(root).join("Version.xml")).ok()?);
    let doc = parse_xml(&text).ok()?;
    doc.descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "Singleplayer")
        .and_then(|n| n.attribute("Value").or_else(|| n.attribute("value")))
        .map(str::to_string)
        .filter(|v| !v.is_empty())
}

/// Bu bilgisayardaki kurulumlar (doğrulanmış, tekrarsız; Steam önce).
pub fn candidates() -> Vec<(PathBuf, &'static str)> {
    let mut found: Vec<(PathBuf, &'static str)> = Vec::new();
    for dir in stores::steam_game_dirs(GAME_FOLDER, Some(STEAM_APP_ID)) {
        found.push((dir, "steam"));
    }
    for dir in stores::gog_games(|title, _| title.to_lowercase().contains("bannerlord")) {
        found.push((dir, "gog"));
    }
    for dir in stores::epic_games(|name| name.to_lowercase().contains("bannerlord")) {
        found.push((dir, "epic"));
    }
    stores::verified(found, is_valid_root)
}

pub fn configs_dir(documents: &Path) -> PathBuf {
    documents.join("Mount and Blade II Bannerlord").join("Configs")
}

pub fn launcher_data(documents: &Path) -> PathBuf {
    configs_dir(documents).join("LauncherData.xml")
}

fn find_blse(bin: &Path) -> Option<PathBuf> {
    ["Bannerlord.BLSE.Standalone.exe", "Bannerlord.BLSE.LauncherEx.exe", "Bannerlord.BLSE.Launcher.exe"].iter().map(|n| bin.join(n)).find(|p| p.is_file())
}

pub fn build_dirs(root: &Path, documents: &Path, detected_by: &str) -> GameDirs {
    let bin = bin_dir(root);
    let workshop = stores::steam_workshop_dir(root, STEAM_APP_ID);
    let store = stores::store_of(root);
    let platform = if workshop.is_some() || store == "steam" {
        "steam"
    } else if detected_by == "gog" || store == "gog" {
        "gog"
    } else if detected_by == "epic" || store == "epic" {
        "epic"
    } else {
        "unknown"
    };
    let configs = configs_dir(documents);
    let s = |p: &Path| p.to_string_lossy().into_owned();
    GameDirs {
        root: s(root),
        modules_dir: s(&root.join("Modules")),
        workshop_dir: workshop.as_deref().map(s),
        platform: platform.into(),
        version: read_version(root).unwrap_or_default(),
        exe: s(&bin.join("Bannerlord.exe")),
        blse: find_blse(&bin).as_deref().map(s),
        launcher_data: s(&configs.join("LauncherData.xml")),
        configs_dir: s(&configs),
        bin: s(&bin),
        detected_by: detected_by.into(),
    }
}

/// Elle seçilen klasör geçerliyse o, değilse bulunan ilk kurulum.
pub fn detect(override_path: Option<&str>, documents: &Path) -> Option<GameDirs> {
    if let Some(p) = override_path.map(PathBuf::from) {
        if is_valid_root(&p) {
            return Some(build_dirs(&p, documents, "manual"));
        }
    }
    candidates().into_iter().next().map(|(p, store)| build_dirs(&p, documents, store))
}

/// Oyun ya da resmî başlatıcı açık mı? (Açıkken modül klasörlerine dokunulmaz.)
pub fn is_running() -> bool {
    platform::process_running(GAME_PROCESSES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_folders_without_the_game() {
        let dir = std::env::temp_dir().join(format!("modstead-bl-{}", modstead_core::fsx::short_id()));
        fs::create_dir_all(dir.join("Modules").join("Native")).unwrap();
        assert!(!is_valid_root(&dir));
        fs::create_dir_all(bin_dir(&dir)).unwrap();
        fs::write(bin_dir(&dir).join("Bannerlord.exe"), b"").unwrap();
        fs::write(dir.join("Modules").join("Native").join("SubModule.xml"), b"<Module/>").unwrap();
        assert!(is_valid_root(&dir));
        assert!(detect(Some(&dir.to_string_lossy()), &dir).is_some_and(|g| g.detected_by == "manual" && g.blse.is_none()));
        let _ = fs::remove_dir_all(&dir);
    }
}
