//! Cities: Skylines II kurulumunu ve kullanıcı verisini bulur.
//!
//! Kurulum: Steam (`steamapps\common\Cities Skylines II`), Xbox uygulaması (`XboxGames\…\Content`),
//! Microsoft Store/Game Pass paketi (`WindowsApps\ParadoxInteractive.CitiesSkylinesII-PCEdition_…`; klasör
//! listelenemez, yer kayıt defterindeki paket kaydından okunur) ve oyunun kendi günlüğü (`Player.log` ilk
//! satırındaki `Mono path`). Sürüm, oyunun her açılışta yazdığı `<kullanıcı>\version` dosyasından okunur.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::{platform, stores};
use serde::Serialize;

pub const EXE: &str = "Cities2.exe";
pub const PROCESSES: &[&str] = &["Cities2.exe"];
pub const STEAM_APP: u32 = 949230;
pub const STEAM_FOLDER: &str = "Cities Skylines II";
/// Microsoft Store / Game Pass paket adı (aile adı = ad + "_" + yayıncı kimliği).
pub const PACKAGE_NAME: &str = "ParadoxInteractive.CitiesSkylinesII-PCEdition";
const XBOX_APP_ID: &str = "Cities2";

pub fn is_game_dir(dir: &Path) -> bool {
    dir.join(EXE).is_file() || dir.join("Cities2_Data").is_dir()
}

/// Kullanıcının seçtiği klasörden oyun kökünü bulur: kökün kendisi, bir alt klasörü (ör. Cities2_Data)
/// ya da içinde "Cities Skylines II" klasörü olan bir üst klasör (ör. steamapps\common).
pub fn resolve_game_dir(p: &Path) -> Option<PathBuf> {
    if is_game_dir(p) {
        return Some(p.to_path_buf());
    }
    if let Some(parent) = p.ancestors().skip(1).take(2).find(|a| is_game_dir(a)) {
        return Some(parent.to_path_buf());
    }
    [p.join(STEAM_FOLDER), p.join("Content")].into_iter().find(|c| is_game_dir(c))
}

/// `%USERPROFILE%\AppData\LocalLow\Colossal Order\Cities Skylines II`
pub fn default_user_dir() -> PathBuf {
    let locallow = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .and_then(|l| l.parent().map(|p| p.join("LocalLow")))
        .or_else(|| std::env::var_os("USERPROFILE").map(|u| PathBuf::from(u).join("AppData").join("LocalLow")))
        .unwrap_or_else(|| PathBuf::from(r"C:\Users\Default\AppData\LocalLow"));
    locallow.join("Colossal Order").join("Cities Skylines II")
}

/// Oyun sürümü ("1.6.2f1"): oyunun her açılışta yazdığı `version` dosyası, yoksa günlükteki "Game version:".
pub fn game_version(user_dir: &Path) -> Option<String> {
    if let Ok(text) = fs::read_to_string(user_dir.join("version")) {
        if let Some(v) = text.split_whitespace().next().filter(|v| looks_like_version(v)) {
            return Some(v.to_string());
        }
    }
    ["Player.log", "Player-prev.log"].iter().find_map(|f| {
        let head = read_head(&user_dir.join(f), 64 * 1024)?;
        head.lines().find_map(|l| l.strip_prefix("Game version:")).and_then(|r| r.split_whitespace().next()).filter(|v| looks_like_version(v)).map(str::to_string)
    })
}

fn looks_like_version(v: &str) -> bool {
    v.len() <= 32 && v.starts_with(|c: char| c.is_ascii_digit()) && v.contains('.')
}

/// "1.6.2f1" → (1, 6, 2). Uyumluluk karşılaştırması için.
pub fn version_parts(v: &str) -> Vec<u32> {
    v.split('.').map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>()).take_while(|p| !p.is_empty()).filter_map(|p| p.parse().ok()).collect()
}

fn read_head(path: &Path, max: usize) -> Option<String> {
    use std::io::Read;
    let mut f = fs::File::open(path).ok()?;
    let mut buf = vec![0u8; max];
    let n = f.read(&mut buf).ok()?;
    buf.truncate(n);
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// `Player.log` ilk satırları: `Mono path[0] = 'C:/…/Cities2_Data/Managed'` → oyun kökü.
pub fn game_dir_from_logs(user_dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for f in ["Player.log", "Player-prev.log"] {
        let Some(head) = read_head(&user_dir.join(f), 16 * 1024) else { continue };
        for line in head.lines().take(10) {
            if let Some(rest) = line.strip_prefix("Mono path[0] = '") {
                let path = rest.trim_end_matches('\'').replace('/', "\\");
                if let Some(root) = Path::new(&path).parent().and_then(|p| p.parent()) {
                    out.push(root.to_path_buf());
                }
            }
        }
    }
    out
}

/// Microsoft Store / Game Pass paketinin kurulum klasörleri (kayıt defterindeki paket kayıtları).
#[cfg(windows)]
pub fn package_roots() -> Vec<(PathBuf, String)> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;
    let key = r"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages";
    let Ok(packages) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(key) else { return Vec::new() };
    packages
        .enum_keys()
        .flatten()
        .filter(|k| k.starts_with(&format!("{PACKAGE_NAME}_")))
        .filter_map(|k| {
            let root: String = packages.open_subkey(&k).ok()?.get_value("PackageRootFolder").ok()?;
            Some((PathBuf::from(root), k))
        })
        .collect()
}

#[cfg(not(windows))]
pub fn package_roots() -> Vec<(PathBuf, String)> {
    Vec::new()
}

/// Bu bilgisayardaki kurulumlar (doğrulanmış, tekrarsız). Günlükte görülen kurulum en son açılandır, önce gelir.
pub fn candidates(user_dir: &Path) -> Vec<(PathBuf, &'static str)> {
    let mut found: Vec<(PathBuf, &'static str)> = Vec::new();
    for dir in game_dir_from_logs(user_dir) {
        let store = store_of(&dir);
        found.push((dir, store));
    }
    for dir in stores::steam_game_dirs(STEAM_FOLDER, Some(STEAM_APP)) {
        found.push((dir, "steam"));
    }
    for dir in stores::xbox_game_dirs_like("Cities Skylines II") {
        found.push((dir, "xbox"));
    }
    for (dir, _) in package_roots() {
        found.push((dir, "xbox"));
    }
    // `verified` yolları kanonikleştirir: WindowsApps bağı gerçek kurulum klasörüne çözülür.
    stores::verified(found, is_game_dir).into_iter().map(|(p, _)| { let s = store_of(&p); (p, s) }).collect()
}

pub fn is_running() -> bool {
    platform::process_running(PROCESSES)
}

/// Kurulum klasöründeki oyun koşucuları: BepInEx (1.1 öncesi gayriresmî mod yükleyicisi) kalıntıları.
/// Bunlar oyunun yerleşik mod sistemiyle çakışır ve açılışta çökmeye yol açar.
pub const BEPINEX_FILES: &[&str] = &["winhttp.dll", "doorstop_config.ini", ".doorstop_version", "BepInEx"];

pub fn bepinex_leftovers(game_dir: &Path) -> Vec<String> {
    BEPINEX_FILES.iter().filter(|f| game_dir.join(f).exists()).map(|f| f.to_string()).collect()
}

/// Microsoft Store / Xbox uygulaması kurulumu mu? Xbox uygulaması oyunu kullanıcının seçtiği klasöre de
/// (ör. `D:\Games\<oyun>\Content`) kurabilir; `WindowsApps` yolu oraya bağlanır. Paket bildirimi belirleyicidir.
pub fn is_package_dir(dir: &Path) -> bool {
    let lower = dir.to_string_lossy().to_ascii_lowercase();
    lower.contains("windowsapps") || lower.contains("xboxgames") || dir.join("appxmanifest.xml").is_file() || dir.join("MicrosoftGame.Config").is_file()
}

/// Kurulumun mağazası: paket kurulumları "xbox", gerisi yoldan.
pub fn store_of(dir: &Path) -> &'static str {
    if is_package_dir(dir) { "xbox" } else { stores::store_of(dir) }
}

/// Paket kurulumunun klasörüne yazılamaz (kullanıcıya yalnızca okuma izni verilir).
pub fn is_protected_dir(dir: &Path) -> bool {
    is_package_dir(dir)
}

// ───────────── Paradox hesabı ─────────────

/// Oyunun gömülü Paradox SDK'sının yerel durumu (`.pdxsdk\<kullanıcı>\database.json`).
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PdxAccount {
    /// Paradox hesabına giriş yapılmış mı (bilinmiyorsa yok).
    pub logged_in: Option<bool>,
    /// Platform hesabı: "steam" | "xbox" | başka.
    pub platform: Option<String>,
    /// Kayıtların durduğu `Saves\<kimlik>` klasörünün adı.
    pub user_folder: Option<String>,
}

pub fn paradox_account(user_dir: &Path) -> PdxAccount {
    let sdk = user_dir.join(".pdxsdk");
    let id = fs::read_to_string(sdk.join("LastUserId.txt")).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty() && s.len() < 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'));
    let Some(id) = id else { return PdxAccount::default() };
    let db: Option<serde_json::Value> = fs::read(sdk.join(&id).join("database.json")).ok().and_then(|b| serde_json::from_slice(&b).ok());
    let logged_in = db.as_ref().and_then(|d| d.get("LoggedIn")).and_then(|v| v.as_bool());
    let platform = db.as_ref().and_then(|d| d.pointer("/PseudonymizedUserData/IdType")).and_then(|v| v.as_str()).map(|t| {
        let t = t.to_ascii_lowercase();
        if t.contains("xbox") {
            "xbox".to_string()
        } else if t.contains("steam") {
            "steam".to_string()
        } else {
            t
        }
    });
    PdxAccount { logged_in, platform, user_folder: Some(id) }
}

// ───────────── Başlatma ─────────────

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LaunchTarget {
    /// `steam://run/949230//<argümanlar>/`
    Steam,
    /// `shell:AppsFolder\<aile adı>!<uygulama>`
    Package { family: String, app: String },
    /// Elle seçilmiş kurulum: .exe doğrudan.
    Exe(PathBuf),
}

/// `ParadoxInteractive.CitiesSkylinesII-PCEdition_1.6.2.0_x64__zfnrdv2de78ny` → `…-PCEdition_zfnrdv2de78ny`
pub fn family_from_full_name(full: &str) -> Option<String> {
    let (head, publisher) = full.rsplit_once("__")?;
    let name = head.split('_').next()?;
    (!name.is_empty() && !publisher.is_empty() && publisher.chars().all(|c| c.is_ascii_alphanumeric())).then(|| format!("{name}_{publisher}"))
}

/// `appxmanifest.xml` → `<Application Id="…">`
fn package_app_id(dir: &Path) -> String {
    fs::read_to_string(dir.join("appxmanifest.xml"))
        .ok()
        .and_then(|x| {
            let start = x.find("<Application ")?;
            let tag = &x[start..start + x[start..].find('>')?];
            let i = tag.find("Id=\"")? + 4;
            Some(tag[i..i + tag[i..].find('"')?].to_string())
        })
        .filter(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_'))
        .unwrap_or_else(|| XBOX_APP_ID.to_string())
}

pub fn launch_target(dir: &Path) -> LaunchTarget {
    match store_of(dir) {
        "steam" => LaunchTarget::Steam,
        "xbox" => {
            let from_folder = dir.file_name().and_then(|n| family_from_full_name(&n.to_string_lossy()));
            let from_registry = || package_roots().into_iter().find_map(|(_, full)| family_from_full_name(&full));
            match from_folder.or_else(from_registry) {
                Some(family) => LaunchTarget::Package { family, app: package_app_id(dir) },
                None => LaunchTarget::Exe(dir.join(EXE)),
            }
        }
        _ => LaunchTarget::Exe(dir.join(EXE)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_package_family() {
        assert_eq!(
            family_from_full_name("ParadoxInteractive.CitiesSkylinesII-PCEdition_1.6.2.0_x64__zfnrdv2de78ny").as_deref(),
            Some("ParadoxInteractive.CitiesSkylinesII-PCEdition_zfnrdv2de78ny")
        );
        assert_eq!(family_from_full_name("Cities Skylines II"), None);
        assert_eq!(family_from_full_name("A_1_x64__bad name"), None);
    }

    #[test]
    fn reads_version_file_and_log() {
        let dir = std::env::temp_dir().join(format!("cs2-ver-{}", modstead_core::fsx::short_id()));
        fs::create_dir_all(&dir).unwrap();
        assert_eq!(game_version(&dir), None);
        fs::write(dir.join("Player.log"), "Mono path[0] = 'C:/Games/CS2/Cities2_Data/Managed'\nGame version: 1.5.3f1 (1.2) [3]\n").unwrap();
        assert_eq!(game_version(&dir).as_deref(), Some("1.5.3f1"));
        assert_eq!(game_dir_from_logs(&dir), vec![PathBuf::from(r"C:\Games\CS2")]);
        fs::write(dir.join("version"), "1.6.2f1 (768.21d1) [6300.27778]").unwrap();
        assert_eq!(game_version(&dir).as_deref(), Some("1.6.2f1"));
        assert_eq!(version_parts("1.6.2f1"), vec![1, 6, 2]);
        assert_eq!(version_parts("1.6.*"), vec![1, 6]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_paradox_account() {
        let dir = std::env::temp_dir().join(format!("cs2-pdx-{}", modstead_core::fsx::short_id()));
        let sdk = dir.join(".pdxsdk").join("2533274879948927");
        fs::create_dir_all(&sdk).unwrap();
        fs::write(dir.join(".pdxsdk").join("LastUserId.txt"), "2533274879948927").unwrap();
        fs::write(sdk.join("database.json"), r#"{"LoggedIn":false,"PseudonymizedUserData":{"IdType":"xbox_xsts"}}"#).unwrap();
        let a = paradox_account(&dir);
        assert_eq!(a.logged_in, Some(false));
        assert_eq!(a.platform.as_deref(), Some("xbox"));
        assert_eq!(a.user_folder.as_deref(), Some("2533274879948927"));
        fs::write(dir.join(".pdxsdk").join("LastUserId.txt"), "../../etc").unwrap();
        assert_eq!(paradox_account(&dir).user_folder, None, "kimlik yol parçası olarak güvenli olmalı");
        let _ = fs::remove_dir_all(&dir);
    }
}
