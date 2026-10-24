//! Hangar'dan (önceki MSFS uygulaması) veri aktarımı.
//!
//! İlk açılışta `%APPDATA%\app.hangar.msfs\{settings,mods,profiles}.json` varsa kütüphane yolu, sim yolu
//! ayarları, mod kayıtları ve profiller `games/msfs/` altına kopyalanır. Düz metin duran VirusTotal anahtarı
//! ve GitHub belirteci Kimlik Bilgisi Yöneticisi'ne yazılır (orada zaten bir değer yoksa). Eski dosyalara
//! dokunulmaz; aktarımın yapıldığı bir işaret dosyasıyla hatırlanır.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::credentials;
use modstead_core::fsx;
use serde::Deserialize;

use crate::settings::{MsfsSettings, SimOverride};
use crate::store::{Db, Profile};

pub const MARKER: &str = ".hangar-aktarildi";

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct HangarSettings {
    library_path: Option<PathBuf>,
    sim_overrides: std::collections::HashMap<String, SimOverride>,
    virustotal_api_key: Option<String>,
    github_token: Option<String>,
    strip_executables: Option<bool>,
    onboarded: bool,
}

pub fn hangar_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("app.hangar.msfs"))
}

/// Dosyayı yalnızca okur (bozuksa yedeklemez, yazmaz).
fn read_only<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let bytes = fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

fn read_settings_from(dir: &Path) -> Option<HangarSettings> {
    read_only(&dir.join("settings.json"))
}

/// Hangar ayarlarını MSFS ayarlarına çevirir (salt okunur; gerçek sistem testleri de kullanır).
pub fn read_hangar_settings() -> Option<MsfsSettings> {
    let h = read_settings_from(&hangar_dir()?)?;
    Some(convert(&h))
}

fn convert(h: &HangarSettings) -> MsfsSettings {
    MsfsSettings {
        library_path: h.library_path.clone().filter(|p| p.is_absolute()),
        sim_overrides: h.sim_overrides.iter().filter(|(k, _)| crate::sims::SIMS.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect(),
        strip_executables: h.strip_executables.unwrap_or(true),
        onboarded: h.onboarded,
    }
}

#[derive(Debug, Default, PartialEq)]
pub struct Migrated {
    pub settings: bool,
    pub mods: usize,
    pub profiles: usize,
    pub secrets: usize,
}

/// `from` (Hangar veri klasörü) → `to` (MSFS veri klasörü). İşaret varsa ya da Hangar verisi yoksa hiçbir şey yapmaz.
/// `store_secret`: gizli değeri Kimlik Bilgisi Yöneticisi'ne yazar (testlerde sahte).
pub fn run(from: &Path, to: &Path, store_secret: &dyn Fn(&str, &str) -> bool) -> Option<Migrated> {
    if to.join(MARKER).exists() || !from.join("settings.json").is_file() {
        return None;
    }
    let mut out = Migrated::default();
    let _ = fs::create_dir_all(to);
    if let Some(h) = read_settings_from(from) {
        // Modstead'de zaten ayar yapıldıysa ezme.
        if !to.join("settings.json").exists() && fsx::write_json(&to.join("settings.json"), &convert(&h)).is_ok() {
            out.settings = true;
        }
        for (target, value) in [(credentials::VIRUSTOTAL_KEY, &h.virustotal_api_key), (credentials::GITHUB_TOKEN, &h.github_token)] {
            if let Some(v) = value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                if store_secret(target, v) {
                    out.secrets += 1;
                }
            }
        }
    }
    if !to.join("mods.json").exists() {
        if let Some(db) = read_only::<Db>(&from.join("mods.json")) {
            out.mods = db.mods.len();
            let _ = fsx::write_json(&to.join("mods.json"), &db);
        }
    }
    if !to.join("profiles.json").exists() {
        if let Some(profiles) = read_only::<Vec<Profile>>(&from.join("profiles.json")) {
            out.profiles = profiles.len();
            let _ = fsx::write_json(&to.join("profiles.json"), &profiles);
        }
    }
    let note = format!("Hangar verisi {} tarihinde {} klasöründen aktarıldı.\n", crate::store::now_iso(), from.display());
    let _ = fs::write(to.join(MARKER), note);
    Some(out)
}

/// Kimlik Bilgisi Yöneticisi'ne yazar; orada zaten bir değer varsa dokunmaz.
pub fn store_secret_if_empty(target: &str, value: &str) -> bool {
    if credentials::has(target) {
        return false;
    }
    credentials::set(target, value).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_once_without_touching_the_source() {
        let root = std::env::temp_dir().join(format!("msfs-migrate-{}", fsx::short_id()));
        let from = root.join("hangar");
        let to = root.join("modstead");
        fs::create_dir_all(&from).unwrap();
        let settings = r#"{"libraryPath":"E:\\MSFS Mods","simOverrides":{"msfs2020":{"disabled":true},"x":{}},"virustotalApiKey":"vt-123","githubToken":null,"stripExecutables":false,"onboarded":true}"#;
        fs::write(from.join("settings.json"), settings).unwrap();
        fs::write(from.join("mods.json"), r#"{"mods":{"fnx-aircraft-320":{"favorite":true,"report":{"verdict":"safe"}}}}"#).unwrap();
        fs::write(from.join("profiles.json"), r#"[{"id":"p1","name":"Airliner","sims":{"msfs2024":["fnx-aircraft-320"]}}]"#).unwrap();

        let stored = std::cell::RefCell::new(Vec::new());
        let r = run(&from, &to, &|t, v| {
            stored.borrow_mut().push((t.to_string(), v.to_string()));
            true
        })
        .unwrap();
        assert_eq!(r, Migrated { settings: true, mods: 1, profiles: 1, secrets: 1 });
        assert_eq!(stored.borrow()[0], (credentials::VIRUSTOTAL_KEY.to_string(), "vt-123".to_string()));

        let s: MsfsSettings = fsx::read_json(&to.join("settings.json"));
        assert_eq!(s.library_path, Some(PathBuf::from(r"E:\MSFS Mods")));
        assert!(s.sim_overrides["msfs2020"].disabled && !s.sim_overrides.contains_key("x"));
        assert!(!s.strip_executables && s.onboarded);
        let written = fs::read_to_string(to.join("settings.json")).unwrap();
        assert!(!written.contains("vt-123"), "anahtar düz metin olarak yazılmamalı");
        let db: Db = fsx::read_json(&to.join("mods.json"));
        assert!(db.mods["fnx-aircraft-320"].favorite);
        let profiles: Vec<Profile> = fsx::read_json(&to.join("profiles.json"));
        assert_eq!(profiles[0].sims["msfs2024"], vec!["fnx-aircraft-320".to_string()]);

        // Kaynak değişmedi; ikinci kez çalışmaz.
        assert_eq!(fs::read_to_string(from.join("settings.json")).unwrap(), settings);
        assert!(run(&from, &to, &|_, _| true).is_none());
        fs::remove_dir_all(&root).unwrap();
    }
}
