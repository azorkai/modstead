//! Mod listesi profilleri (ör. "ROT kampanyası", "Sade oyun").

use std::path::Path;

use modstead_core::{AppError, AppResult, fsx, tr};
use serde::{Deserialize, Serialize};

use crate::modules::sort::ModEntry;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntry {
    pub id: String,
    pub enabled: bool,
    #[serde(default)]
    pub version: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub created: i64,
    pub updated: i64,
    pub modules: Vec<ProfileEntry>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct ProfileStore {
    pub profiles: Vec<Profile>,
}

const MAX_ENTRIES: usize = 2000;

fn clean_name(name: &str) -> AppResult<String> {
    let n: String = name.trim().chars().filter(|c| !c.is_control()).take(60).collect();
    if n.is_empty() {
        return Err(AppError::msg(tr!("profil adı boş olamaz", "profile name cannot be empty")));
    }
    Ok(n)
}

fn valid_module_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && !id.chars().any(|c| c.is_control() || c == '*' || c == '"')
}

pub fn load(path: &Path) -> ProfileStore {
    fsx::read_json(path)
}

pub fn save(path: &Path, store: &ProfileStore) -> AppResult<()> {
    fsx::write_json(path, store)
}

pub fn upsert(
    path: &Path,
    id: Option<&str>,
    name: &str,
    entries: Vec<ProfileEntry>,
) -> AppResult<Profile> {
    let name = clean_name(name)?;
    if entries.len() > MAX_ENTRIES || entries.iter().any(|e| !valid_module_id(&e.id)) {
        return Err(AppError::msg(tr!("profil geçersiz modül kimlikleri içeriyor", "the profile contains invalid module ids")));
    }
    let mut store = load(path);
    let now = fsx::now_ts();
    let profile = if let Some(existing) = id.and_then(|id| store.profiles.iter_mut().find(|p| p.id == id)) {
        existing.name = name;
        existing.modules = entries;
        existing.updated = now;
        existing.clone()
    } else {
        let p = Profile { id: fsx::short_id(), name, created: now, updated: now, modules: entries };
        store.profiles.push(p.clone());
        p
    };
    save(path, &store)?;
    Ok(profile)
}

pub fn rename(path: &Path, id: &str, name: &str) -> AppResult<()> {
    let name = clean_name(name)?;
    let mut store = load(path);
    let p = store
        .profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::NotFound(tr!("profil", "profile").into()))?;
    p.name = name;
    p.updated = fsx::now_ts();
    save(path, &store)
}

pub fn delete(path: &Path, id: &str) -> AppResult<()> {
    let mut store = load(path);
    store.profiles.retain(|p| p.id != id);
    save(path, &store)
}

pub fn get(path: &Path, id: &str) -> AppResult<Profile> {
    load(path)
        .profiles
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::NotFound(tr!("profil", "profile").into()))
}

/// Paylaşılan profil metni. Otağ'ın biçimi (`otagProfile: 1`) de okunur.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharedProfile {
    #[serde(alias = "otagProfile")]
    modstead_profile: u32,
    #[serde(default = "default_game")]
    game: String,
    name: String,
    modules: Vec<ProfileEntry>,
}

fn default_game() -> String {
    crate::ID.into()
}

/// Paylaşılabilir metin (JSON).
pub fn export(p: &Profile) -> AppResult<String> {
    Ok(serde_json::to_string_pretty(&SharedProfile { modstead_profile: 1, game: crate::ID.into(), name: p.name.clone(), modules: p.modules.clone() })?)
}

pub fn import(path: &Path, text: &str) -> AppResult<Profile> {
    if text.len() > 512 * 1024 {
        return Err(AppError::msg(tr!("profil metni çok büyük", "profile text is too large")));
    }
    let shared: SharedProfile = serde_json::from_str(text.trim())
        .map_err(|_| AppError::msg(tr!("bu metin bir Bannerlord mod profili değil", "this text is not a Bannerlord mod profile")))?;
    if shared.game != crate::ID {
        return Err(AppError::msg(tr!(format!("bu profil başka bir oyuna ait ({})", shared.game), format!("this profile belongs to another game ({})", shared.game))));
    }
    if shared.modstead_profile != 1 {
        return Err(AppError::msg(tr!("desteklenmeyen profil sürümü", "unsupported profile version")));
    }
    upsert(path, None, &shared.name, shared.modules)
}

pub fn to_entries(order: &[ModEntry], version_of: impl Fn(&str) -> String) -> Vec<ProfileEntry> {
    order
        .iter()
        .map(|e| ProfileEntry { id: e.id.clone(), enabled: e.enabled, version: version_of(&e.id) })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_otag_and_modstead_texts() {
        let path = std::env::temp_dir().join(format!("modstead-prof-{}.json", fsx::short_id()));
        let otag = r#"{"otagProfile":1,"name":"ROT","modules":[{"id":"Bannerlord.Harmony","enabled":true}]}"#;
        let p = import(&path, otag).unwrap();
        assert_eq!(p.modules.len(), 1);
        let text = export(&p).unwrap();
        assert!(text.contains("modsteadProfile") && text.contains("bannerlord"));
        assert_eq!(import(&path, &text).unwrap().name, "ROT");
        assert!(import(&path, r#"{"modsteadProfile":1,"game":"stardew","name":"x","modules":[]}"#).is_err());
        assert_eq!(load(&path).profiles.len(), 2);
        let _ = std::fs::remove_file(&path);
    }
}
