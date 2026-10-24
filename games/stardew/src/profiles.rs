//! Profiller: hangi modların etkin olacağını tutan adlandırılmış listeler.
//! Modlar UniqueID ile eşlenir; böylece klasör adı değişse de profil bozulmaz.

use std::collections::HashSet;

use modstead_core::{AppError, AppResult, fsx, tr, version};
use serde::{Deserialize, Serialize};

use crate::ops::{self, JournalEntry};
use crate::scan::{self, ModInfo};
use crate::{Stardew, bail, util};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub mods: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffItem {
    pub folder: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProfileDiff {
    pub profile_id: String,
    pub enable: Vec<DiffItem>,
    pub disable: Vec<DiffItem>,
    pub missing: Vec<String>,
    pub unchanged: u32,
}

pub fn mod_key(m: &ModInfo) -> String {
    match &m.unique_id {
        Some(id) => id.to_lowercase(),
        None => format!("folder:{}", m.folder_name.to_lowercase()),
    }
}

pub fn list(game: &Stardew) -> Vec<Profile> {
    fsx::read_json(&game.data_file("profiles.json"))
}

fn save_all(game: &Stardew, all: &[Profile]) -> AppResult<()> {
    fsx::write_json(&game.data_file("profiles.json"), &all)
}

fn current_keys(game: &Stardew) -> AppResult<Vec<String>> {
    let scan = scan::scan_mods(&game.mods_dir()?);
    let mut keys: Vec<String> = scan.mods.iter().filter(|m| m.enabled).map(mod_key).collect();
    keys.sort();
    keys.dedup();
    Ok(keys)
}

/// Yeni profil oluşturur ya da var olanı günceller. `capture` doğruysa mevcut etkin modlar kaydedilir.
pub fn save(game: &Stardew, id: Option<String>, name: String, description: Option<String>, capture: bool, mods: Option<Vec<String>>) -> AppResult<Profile> {
    let name: String = name.trim().chars().take(80).collect();
    if name.is_empty() {
        bail!("Profil adı boş olamaz.", "Profile name can't be empty.");
    }
    let description = description.map(|d| d.trim().chars().take(400).collect::<String>()).filter(|d| !d.is_empty());
    let mut all = list(game);
    let now = util::now_ms();
    let captured = if capture { Some(current_keys(game)?) } else { None };
    let profile = match id.and_then(|id| all.iter_mut().find(|p| p.id == id)) {
        Some(p) => {
            p.name = name;
            p.description = description;
            if let Some(k) = captured.or(mods) {
                p.mods = k;
            }
            p.updated_at = now;
            p.clone()
        }
        None => {
            let p = Profile { id: fsx::short_id(), name, description, mods: captured.or(mods).unwrap_or_default(), created_at: now, updated_at: now };
            all.push(p.clone());
            p
        }
    };
    save_all(game, &all)?;
    Ok(profile)
}

pub fn delete(game: &Stardew, id: &str) -> AppResult<()> {
    let mut all = list(game);
    all.retain(|p| p.id != id);
    save_all(game, &all)?;
    if game.settings().active_profile.as_deref() == Some(id) {
        game.update_settings(|s| s.active_profile = None)?;
    }
    Ok(())
}

fn find(game: &Stardew, id: &str) -> AppResult<Profile> {
    list(game).into_iter().find(|p| p.id == id).ok_or_else(|| AppError::NotFound(tr!("profil", "profile").into()))
}

pub fn diff(game: &Stardew, id: &str) -> AppResult<ProfileDiff> {
    let profile = find(game, id)?;
    let scan = scan::scan_mods(&game.mods_dir()?);
    Ok(compute_diff(&profile, &scan.mods))
}

pub fn compute_diff(profile: &Profile, mods: &[ModInfo]) -> ProfileDiff {
    let wanted: HashSet<String> = profile.mods.iter().map(|k| k.to_lowercase()).collect();
    let mut chosen: HashSet<String> = HashSet::new();
    let mut missing = Vec::new();
    for key in &wanted {
        let mut candidates: Vec<&ModInfo> = mods.iter().filter(|m| &mod_key(m) == key && !m.disabled_by_parent).collect();
        if candidates.is_empty() {
            missing.push(key.clone());
            continue;
        }
        candidates.sort_by(|a, b| {
            b.enabled.cmp(&a.enabled).then_with(|| version::compare(b.version.as_deref().unwrap_or("0"), a.version.as_deref().unwrap_or("0")).unwrap_or(std::cmp::Ordering::Equal))
        });
        chosen.insert(candidates[0].folder.clone());
    }
    let mut enable = Vec::new();
    let mut disable = Vec::new();
    let mut unchanged = 0;
    for m in mods.iter().filter(|m| !m.disabled_by_parent) {
        match (chosen.contains(&m.folder), m.enabled) {
            (true, false) => enable.push(DiffItem { folder: m.folder.clone(), name: m.name.clone() }),
            (false, true) => disable.push(DiffItem { folder: m.folder.clone(), name: m.name.clone() }),
            _ => unchanged += 1,
        }
    }
    missing.sort();
    ProfileDiff { profile_id: profile.id.clone(), enable, disable, missing, unchanged }
}

pub fn apply(game: &Stardew, id: &str) -> AppResult<JournalEntry> {
    let profile = find(game, id)?;
    let d = diff(game, id)?;
    let enable: Vec<String> = d.enable.iter().map(|i| i.folder.clone()).collect();
    let disable: Vec<String> = d.disable.iter().map(|i| i.folder.clone()).collect();
    let (on, off) = (enable.len(), disable.len());
    let mut details = vec![tr!(format!("{on} mod açıldı, {off} mod kapatıldı"), format!("{on} mods enabled, {off} mods disabled"))];
    if !d.missing.is_empty() {
        let n = d.missing.len();
        details.push(tr!(format!("Kurulu olmayan {n} mod atlandı"), format!("Skipped {n} mods that aren't installed")));
    }
    let title = tr!(format!("'{}' profili uygulandı", profile.name), format!("Applied profile '{}'", profile.name));
    let entry = ops::apply_toggles(game, &enable, &disable, title, details)?;
    game.update_settings(|s| s.active_profile = Some(profile.id.clone()))?;
    Ok(entry)
}

/// Paylaşılan bir profil metnini (JSON) içe aktarır.
pub fn import(game: &Stardew, json: &str) -> AppResult<Profile> {
    #[derive(Deserialize)]
    struct Shared {
        name: String,
        description: Option<String>,
        mods: Vec<String>,
    }
    let shared: Shared = serde_json::from_str(json.trim()).map_err(|_| AppError::msg(tr!("Profil metni okunamadı. Dışa aktarılmış bir profil yapıştırın.", "Couldn't read the profile text. Paste an exported profile.")))?;
    let mods: Vec<String> = shared.mods.into_iter().map(|m| m.trim().to_lowercase()).filter(|m| !m.is_empty() && m.len() < 200).take(5000).collect();
    save(game, None, shared.name, shared.description, false, Some(mods))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analyze::tests::m as info;
    use crate::testkit::fixture;

    #[test]
    fn diff_enables_disables_and_reports_missing() {
        let mods = vec![info("A", "x.a", "1.0", true), info(".B", "x.b", "1.0", false), info("C", "x.c", "1.0", true)];
        let p = Profile { id: "p".into(), name: "P".into(), mods: vec!["x.a".into(), "X.B".into(), "x.gone".into()], ..Default::default() };
        let d = compute_diff(&p, &mods);
        assert_eq!(d.enable.iter().map(|i| i.folder.as_str()).collect::<Vec<_>>(), vec![".B"]);
        assert_eq!(d.disable.iter().map(|i| i.folder.as_str()).collect::<Vec<_>>(), vec!["C"]);
        assert_eq!(d.missing, vec!["x.gone".to_string()]);
        assert_eq!(d.unchanged, 1);
    }

    #[test]
    fn capture_apply_and_import() {
        let f = fixture();
        f.add_mod("A", "x.a");
        f.add_mod("B", "x.b");
        let p = save(&f.game, None, "Hepsi".into(), None, true, None).unwrap();
        assert_eq!(p.mods, vec!["x.a".to_string(), "x.b".to_string()]);
        let only_a = import(&f.game, r#"{"name":"Yalnız A","mods":["X.A"]}"#).unwrap();
        apply(&f.game, &only_a.id).unwrap();
        assert!(f.mods().join(".B").is_dir());
        assert_eq!(f.game.settings().active_profile.as_deref(), Some(only_a.id.as_str()));
        apply(&f.game, &p.id).unwrap();
        assert!(f.mods().join("B").is_dir());
        delete(&f.game, &p.id).unwrap();
        assert_eq!(list(&f.game).len(), 1);
        assert!(import(&f.game, "nope").is_err());
    }
}
