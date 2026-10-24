//! Vadi'den (önceki uygulama) veri aktarımı. İlk açılışta `%APPDATA%\com.vadi.modmanager\` varsa
//! ayarlar, profiller, işlem günlüğü (salt geçmiş olarak) ve güncelleme önbelleği Modstead'e
//! kopyalanır; kayıt yedekleri yeni yedek klasörüne kopyalanır. Eski dosyalara asla yazılmaz;
//! aktarım bir işaret dosyasıyla (`imported-vadi.json`) bir kez yapılır.

use std::path::{Path, PathBuf};

use modstead_core::{Services, fsx};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{ID, StardewSettings, detect, ops::JournalEntry, util};

const VADI_ID: &str = "com.vadi.modmanager";
const MARKER: &str = "imported-vadi.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Marker {
    imported_at: u64,
    source: String,
    settings: bool,
    profiles: usize,
    journal: usize,
    save_backups: usize,
}

/// Vadi'nin ayar dosyası (yalnızca okunur; bilinmeyen alanlar yok sayılır).
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct VadiSettings {
    game_path: Option<String>,
    data_dir: Option<String>,
    accent: Option<String>,
    auto_check_updates: Option<bool>,
    backup_saves_on_launch: Option<bool>,
    trash_retention_days: Option<u32>,
    save_backups_keep: Option<u32>,
    active_profile: Option<String>,
}

fn vadi_dirs() -> Option<(PathBuf, PathBuf)> {
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from)?.join(VADI_ID);
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).map(|p| p.join(VADI_ID)).unwrap_or_else(|| roaming.clone());
    Some((roaming, local))
}

/// İlk açılışta bir kez çalışır. Aktarılan ayarları döner (aktarım yoksa `None`).
pub fn import_vadi(services: &Services) -> Option<StardewSettings> {
    let (roaming, local) = vadi_dirs()?;
    import_from(services, &roaming, &local)
}

pub(crate) fn import_from(services: &Services, roaming: &Path, local: &Path) -> Option<StardewSettings> {
    let data = services.paths.game_data(ID);
    if data.join(MARKER).exists() || !roaming.join("settings.json").is_file() {
        return None;
    }
    let old: VadiSettings = serde_json::from_slice(&std::fs::read(roaming.join("settings.json")).ok()?).unwrap_or_default();
    let defaults = StardewSettings::default();
    let old_custom = old.data_dir.clone().map(PathBuf::from).filter(|p| p.is_absolute());
    let settings = StardewSettings {
        game_path: old.game_path.filter(|p| detect::is_game_dir(Path::new(p))),
        // Kullanıcı Vadi'de yedekleri başka bir diske almışsa (C: doluyken önerilen) aynı diskte kalınır,
        // ama eski dosyalarla karışmasın diye bir alt klasöre yazılır.
        data_dir: old_custom.as_ref().map(|p| p.join("Modstead").to_string_lossy().into_owned()),
        season: old.accent.filter(|a| ["auto", "spring", "summer", "fall", "winter"].contains(&a.as_str())).unwrap_or(defaults.season.clone()),
        auto_check_updates: old.auto_check_updates.unwrap_or(defaults.auto_check_updates),
        backup_saves_on_launch: old.backup_saves_on_launch.unwrap_or(defaults.backup_saves_on_launch),
        trash_retention_days: old.trash_retention_days.unwrap_or(defaults.trash_retention_days).min(3650),
        save_backups_keep: old.save_backups_keep.unwrap_or(defaults.save_backups_keep).clamp(1, 200),
        active_profile: old.active_profile,
    };
    if fsx::write_json(&data.join("settings.json"), &settings).is_err() {
        return None;
    }

    // Profiller aynı biçimde; olduğu gibi kopyalanır.
    let profiles: Vec<Value> = fsx::read_json(&roaming.join("profiles.json"));
    if !profiles.is_empty() {
        let _ = fsx::write_json(&data.join("profiles.json"), &profiles);
    }

    // Günlük: geçmiş olarak gösterilir, geri alma kapalıdır (adımlar eski klasörlere işaret eder).
    let mut journal: Vec<JournalEntry> = fsx::read_json(&roaming.join("journal.json"));
    for e in journal.iter_mut() {
        e.legacy = true;
    }
    if !journal.is_empty() {
        let _ = fsx::write_json(&data.join("journal.json"), &journal);
    }

    let cache: Value = fsx::read_json(&roaming.join("update-cache.json"));
    if cache.is_object() {
        let _ = fsx::write_json(&data.join("update-cache.json"), &cache);
    }

    // Kayıt yedekleri: kullanıcının değerli verisi; yeni yedek klasörüne kopyalanır (taşınmaz).
    let old_backups = old_custom.clone().unwrap_or_else(|| local.to_path_buf()).join("save-backups");
    let new_root = settings.data_dir.clone().map(PathBuf::from).unwrap_or_else(|| services.paths.game_local(ID));
    let new_backups = new_root.join("save-backups");
    let mut copied = 0;
    if old_backups.is_dir() && !new_backups.exists() {
        if fsx::copy_dir(&old_backups, &new_backups, |_| copied += 1).is_err() {
            let _ = fsx::remove_dir(&new_backups);
            copied = 0;
        }
    }

    let marker = Marker {
        imported_at: util::now_ms(),
        source: roaming.to_string_lossy().into_owned(),
        settings: true,
        profiles: profiles.len(),
        journal: journal.len(),
        save_backups: copied,
    };
    let _ = fsx::write_json(&data.join(MARKER), &marker);
    log::info!("Vadi verisi aktarıldı: {} profil, {} günlük kaydı, {copied} kayıt yedeği", profiles.len(), journal.len());
    Some(settings)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn imports_once_without_touching_old_files() {
        let services = Services::for_tests();
        let root = services.paths.data.parent().unwrap().to_path_buf();
        let roaming = root.join("vadi-roaming");
        let local = root.join("vadi-local");
        fs::create_dir_all(&roaming).unwrap();
        fs::write(roaming.join("settings.json"), r#"{"gamePath":"Z:\\nope","accent":"fall","saveBackupsKeep":5,"theme":"dark","onboarded":true}"#).unwrap();
        fs::write(roaming.join("profiles.json"), r#"[{"id":"p1","name":"Hepsi","mods":["a.b"],"createdAt":1,"updatedAt":1}]"#).unwrap();
        fs::write(roaming.join("journal.json"), r#"[{"id":"j1","time":1,"kind":"toggle","title":"X","details":[],"actions":[],"undone":false}]"#).unwrap();
        fs::create_dir_all(local.join("save-backups/Farm_1")).unwrap();
        fs::write(local.join("save-backups/Farm_1/20260101-000000__elle.zip"), "PK").unwrap();
        let before = fs::read(roaming.join("settings.json")).unwrap();

        let s = import_from(&services, &roaming, &local).unwrap();
        assert_eq!(s.season, "fall");
        assert_eq!(s.save_backups_keep, 5);
        assert!(s.game_path.is_none(), "geçersiz oyun yolu aktarılmamalı");
        let journal: Vec<JournalEntry> = fsx::read_json(&services.paths.game_data(ID).join("journal.json"));
        assert!(journal[0].legacy);
        assert!(services.paths.game_local(ID).join("save-backups/Farm_1/20260101-000000__elle.zip").is_file());
        assert_eq!(fs::read(roaming.join("settings.json")).unwrap(), before, "eski dosyaya dokunulmamalı");
        assert!(import_from(&services, &roaming, &local).is_none(), "aktarım bir kez yapılır");
        let _ = fsx::remove_dir(&root);
    }
}
