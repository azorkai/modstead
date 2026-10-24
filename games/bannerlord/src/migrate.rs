//! Otağ'dan veri aktarımı (ilk açılışta, bir kez). Eski dosyalara dokunulmaz; yalnızca okunur.
//!
//! - `%APPDATA%\app.otag.bannerlord\settings.json` → oyuna özel ayarlar (oyun klasörü, kurulum ve başlatma tercihleri)
//! - `profiles.json`, `installs.json` → birebir kopya (biçimler aynı)
//! - Nexus API anahtarı (`Otag/NexusMods/ApiKey`) → Modstead'in ortak anahtarı (yoksa)
//!
//! Aktarıldığı `migrated-otag.json` işaret dosyasıyla hatırlanır. Oyun klasöründeki `.otag\backups`
//! yedekleri taşınmaz; yerinde okunur (bkz. `install::backups`).

use std::path::{Path, PathBuf};

use modstead_core::{Services, credentials, fsx};
use serde_json::json;

use crate::ID;
use crate::settings::BannerlordSettings;

const OTAG_KEY: &str = "Otag/NexusMods/ApiKey";
const MARKER: &str = "migrated-otag.json";

fn otag_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("app.otag.bannerlord"))
}

pub fn from_otag(services: &Services) {
    let Some(old) = otag_dir() else { return };
    // Testler (gerçek sistem denemeleri dahil) Kimlik Bilgisi Yöneticisi'ne yazmaz.
    migrate(&old, &services.paths.game_data(ID), !cfg!(test));
}

/// `old` → `data`. `with_key` testlerde Kimlik Bilgisi Yöneticisi'ne dokunmamak için kapatılır.
fn migrate(old: &Path, data: &Path, with_key: bool) -> bool {
    let marker = data.join(MARKER);
    if marker.is_file() || !old.join("settings.json").is_file() && !old.join("profiles.json").is_file() {
        return false;
    }
    let _ = std::fs::create_dir_all(data);
    let mut copied = Vec::new();

    let settings_path = data.join("settings.json");
    let current: BannerlordSettings = fsx::read_json(&settings_path);
    if old.join("settings.json").is_file() {
        // Otağ ayarlarında oyuna özel alanlar aynı adlarla durur; genel alanlar (tema, dil…) yok sayılır.
        let mut imported: BannerlordSettings = fsx::read_json(&old.join("settings.json"));
        // İskeletin kaydettiği oyun klasörü öncelikli.
        if current.game_path.is_some() {
            imported.game_path = current.game_path;
        }
        if fsx::write_json(&settings_path, &imported).is_ok() {
            copied.push("settings.json");
        }
    }
    for name in ["profiles.json", "installs.json"] {
        let (src, dst) = (old.join(name), data.join(name));
        if src.is_file() && !dst.exists() && std::fs::copy(&src, &dst).is_ok() {
            copied.push(name);
        }
    }
    if with_key && !credentials::has(credentials::NEXUS_KEY) {
        if let Ok(Some(key)) = credentials::get(OTAG_KEY) {
            if !key.is_empty() && credentials::set(credentials::NEXUS_KEY, &key).is_ok() {
                copied.push("nexus-key");
            }
        }
    }
    log::info!("Otağ verisi aktarıldı: {copied:?}");
    let _ = fsx::write_json(&marker, &json!({ "from": old.to_string_lossy(), "at": fsx::now_ts(), "copied": copied }));
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_once_without_touching_the_source() {
        let root = std::env::temp_dir().join(format!("modstead-mig-{}", fsx::short_id()));
        let (old, data) = (root.join("otag"), root.join("data"));
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("settings.json"), r#"{"gamePath":"E:\\BL","theme":"light","preferBlse":true}"#).unwrap();
        std::fs::write(old.join("profiles.json"), r#"{"profiles":[]}"#).unwrap();
        assert!(migrate(&old, &data, false));
        let s: BannerlordSettings = fsx::read_json(&data.join("settings.json"));
        assert_eq!(s.game_path.as_deref(), Some("E:\\BL"));
        assert!(s.prefer_blse);
        assert!(data.join("profiles.json").is_file());
        assert!(old.join("settings.json").is_file());
        // İkinci açılışta yeniden aktarılmaz.
        assert!(!migrate(&old, &data, false));
        let _ = std::fs::remove_dir_all(&root);
    }
}
