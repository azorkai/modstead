//! Stardew Valley kurulumunu (Steam, GOG, Xbox, elle) ve SMAPI'yi bulur; modları sayar.
//! Kaynak: Vadi'nin game.rs / scan.rs (D:\Stardew Valley Manager). Tam tarama taşınırken
//! bu dosya `scan.rs` ile genişletilecek.

use std::path::{Path, PathBuf};

use modstead_core::{platform, stores};

pub const GAME_FOLDER: &str = "Stardew Valley";
pub const SMAPI_EXE: &str = "StardewModdingAPI.exe";
pub const GAME_PROCESSES: &[&str] = &["StardewModdingAPI.exe", "Stardew Valley.exe", "StardewValley.exe"];
const GOG_ID: &str = "1453375253";

pub fn is_game_dir(dir: &Path) -> bool {
    dir.join("Stardew Valley.dll").is_file() || dir.join("Stardew Valley.exe").is_file() || dir.join("StardewValley.exe").is_file()
}

/// Kullanıcının seçtiği klasörden oyun kökünü bulur: kökün kendisi, bir alt klasörü (ör. Mods)
/// ya da içinde "Stardew Valley" klasörü olan bir üst klasör (ör. steamapps\common).
pub fn resolve_game_dir(p: &Path) -> Option<PathBuf> {
    if is_game_dir(p) {
        return Some(p.to_path_buf());
    }
    if let Some(parent) = p.ancestors().skip(1).take(2).find(|a| is_game_dir(a)) {
        return Some(parent.to_path_buf());
    }
    Some(p.join(GAME_FOLDER)).filter(|c| is_game_dir(c))
}

/// Oyun sürümü ("1.6.15"); derleme numarası atılır.
pub fn game_version(dir: &Path) -> Option<String> {
    ["Stardew Valley.dll", "Stardew Valley.exe", "StardewValley.exe"]
        .iter()
        .map(|f| dir.join(f))
        .filter(|p| p.is_file())
        .find_map(|p| platform::file_version(&p))
        .map(|v| platform::format_version(v, false))
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Smapi {
    pub installed: bool,
    pub version: Option<String>,
}

pub fn smapi_info(dir: &Path) -> Smapi {
    let exe = dir.join(SMAPI_EXE);
    if !exe.is_file() {
        return Smapi { installed: false, version: None };
    }
    let version = platform::file_version(&dir.join("StardewModdingAPI.dll")).or_else(|| platform::file_version(&exe)).map(|v| platform::format_version(v, true));
    Smapi { installed: true, version }
}

/// Bu bilgisayardaki kurulumlar (doğrulanmış, tekrarsız).
pub fn candidates() -> Vec<(PathBuf, &'static str)> {
    let mut found: Vec<(PathBuf, &'static str)> = Vec::new();
    for dir in stores::steam_game_dirs(GAME_FOLDER, Some(413150)) {
        found.push((dir, "steam"));
    }
    for dir in stores::gog_games(|title, id| id == GOG_ID || title.to_lowercase().contains("stardew valley")) {
        found.push((dir, "gog"));
    }
    for dir in stores::xbox_game_dirs(GAME_FOLDER) {
        found.push((dir, "xbox"));
    }
    for drive in stores::drives() {
        found.push((drive.join("GOG Games").join(GAME_FOLDER), "gog"));
    }
    stores::verified(found, is_game_dir)
}

pub fn mods_dir(game: &Path) -> PathBuf {
    game.join("Mods")
}

/// %APPDATA%\StardewValley — kayıtlar ve SMAPI günlükleri burada.
pub fn appdata_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("StardewValley"))
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ModCount {
    pub total: u32,
    pub enabled: u32,
}

/// SMAPI kuralıyla sayar: `manifest.json` içeren klasör bir moddur; yolunda "." ile başlayan bir
/// klasör varsa SMAPI onu yok sayar (kapalı). En fazla 3 seviye iner.
pub fn count_mods(mods: &Path) -> ModCount {
    let mut c = ModCount::default();
    for e in walkdir::WalkDir::new(mods).min_depth(2).max_depth(4).follow_links(false).into_iter().flatten() {
        if !e.file_type().is_file() || !e.file_name().to_string_lossy().eq_ignore_ascii_case("manifest.json") {
            continue;
        }
        let Ok(rel) = e.path().strip_prefix(mods) else { continue };
        c.total += 1;
        let hidden = rel.parent().is_some_and(|p| p.components().any(|comp| comp.as_os_str().to_string_lossy().starts_with('.')));
        if !hidden {
            c.enabled += 1;
        }
    }
    c
}

pub fn is_running() -> bool {
    platform::process_running(GAME_PROCESSES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_enabled_and_hidden_mods() {
        let root = std::env::temp_dir().join(format!("modstead-sdv-{}", modstead_core::fsx::short_id()));
        let mods = root.join("Mods");
        for dir in ["ContentPatcher", "Group/LookupAnything", ".Disabled", "Group/.Off"] {
            std::fs::create_dir_all(mods.join(dir)).unwrap();
            std::fs::write(mods.join(dir).join("manifest.json"), "{}").unwrap();
        }
        let c = count_mods(&mods);
        assert_eq!((c.total, c.enabled), (4, 2));
        let _ = std::fs::remove_dir_all(&root);
    }
}
