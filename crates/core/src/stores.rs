//! Oyun mağazalarından kurulum bulma: Steam (kayıt defteri + `libraryfolders.vdf`), GOG (kayıt
//! defteri), Epic (manifest dosyaları), Xbox/Microsoft Store (`XboxGames`). Oyunlar yalnızca klasör
//! adını ve "bu klasör gerçekten benim oyunum mu" denetimini verir.

use std::fs;
use std::path::{Path, PathBuf};

use crate::fsx::{dunce, norm_key};

#[cfg(windows)]
pub fn steam_roots() -> Vec<PathBuf> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    let mut roots = Vec::new();
    if let Ok(k) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
        if let Ok(p) = k.get_value::<String, _>("SteamPath") {
            roots.push(PathBuf::from(p.replace('/', "\\")));
        }
    }
    for sub in ["SOFTWARE\\WOW6432Node\\Valve\\Steam", "SOFTWARE\\Valve\\Steam"] {
        if let Ok(k) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(sub) {
            if let Ok(p) = k.get_value::<String, _>("InstallPath") {
                roots.push(PathBuf::from(p));
            }
        }
    }
    roots.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    dedup(roots)
}

#[cfg(not(windows))]
pub fn steam_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn dedup(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    paths.into_iter().filter(|p| seen.insert(norm_key(p))).collect()
}

/// `libraryfolders.vdf` içindeki `"path"` değerleri.
pub fn parse_library_folders(vdf: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for line in vdf.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("\"path\"") {
            let value = rest.trim().trim_matches('"').replace("\\\\", "\\");
            if !value.is_empty() {
                out.push(PathBuf::from(value));
            }
        }
    }
    out
}

/// Tüm Steam kütüphaneleri (kök klasörler dahil, tekrarsız).
pub fn steam_libraries() -> Vec<PathBuf> {
    let mut libs = Vec::new();
    for root in steam_roots() {
        libs.push(root.clone());
        if let Ok(text) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
            libs.extend(parse_library_folders(&text));
        }
    }
    dedup(libs)
}

/// Steam'de `steamapps/common/<folder>` adayları; uygulama bildirimi (appmanifest) olan önce gelir.
pub fn steam_game_dirs(folder: &str, app_id: Option<u32>) -> Vec<PathBuf> {
    let mut with_manifest = Vec::new();
    let mut others = Vec::new();
    for lib in steam_libraries() {
        let dir = lib.join("steamapps").join("common").join(folder);
        if !dir.is_dir() {
            continue;
        }
        let has_manifest = app_id.is_some_and(|id| lib.join("steamapps").join(format!("appmanifest_{id}.acf")).is_file());
        if has_manifest { with_manifest.push(dir) } else { others.push(dir) }
    }
    with_manifest.extend(others);
    with_manifest
}

/// Steam kütüphanesindeki oyun için Workshop klasörü: `steamapps/workshop/content/<app_id>`.
pub fn steam_workshop_dir(game_root: &Path, app_id: u32) -> Option<PathBuf> {
    let common = game_root.parent()?;
    let steamapps = common.parent()?;
    if !common.file_name()?.to_string_lossy().eq_ignore_ascii_case("common") || !steamapps.file_name()?.to_string_lossy().eq_ignore_ascii_case("steamapps") {
        return None;
    }
    let w = steamapps.join("workshop").join("content").join(app_id.to_string());
    w.is_dir().then_some(w)
}

/// Microsoft Store (MSIX) uygulamasının kurulu sürümleri. Kayıt defterinde her kurulum
/// `…\AppModel\Repository\Packages\<Ad>_<sürüm>_<mimari>__<yayıncı>` anahtarıdır; `name` paketin adıdır
/// (ör. `Publisher.App`). Oyun güncellenince sürüm değişir; oyunlar bunu güncellemeleri fark etmek için kullanır.
#[cfg(windows)]
pub fn appx_versions(name: &str) -> Vec<String> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;
    let Ok(k) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages") else {
        return Vec::new();
    };
    appx_versions_in(k.enum_keys().flatten(), name)
}

#[cfg(not(windows))]
pub fn appx_versions(_name: &str) -> Vec<String> {
    Vec::new()
}

fn appx_versions_in(keys: impl Iterator<Item = String>, name: &str) -> Vec<String> {
    let prefix = format!("{name}_");
    let mut v: Vec<String> = keys.filter_map(|k| k.strip_prefix(&prefix).and_then(|r| r.split('_').next()).filter(|s| !s.is_empty()).map(str::to_string)).collect();
    v.sort();
    v.dedup();
    v
}

/// GOG kayıt defteri: başlığı ya da oyun kimliği eşleşen kurulumların klasörleri.
#[cfg(windows)]
pub fn gog_games(matches: impl Fn(&str, &str) -> bool) -> Vec<PathBuf> {
    use winreg::RegKey;
    use winreg::enums::HKEY_LOCAL_MACHINE;
    let mut out = Vec::new();
    for sub in ["SOFTWARE\\WOW6432Node\\GOG.com\\Games", "SOFTWARE\\GOG.com\\Games"] {
        let Ok(games) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(sub) else { continue };
        for id in games.enum_keys().flatten() {
            let Ok(k) = games.open_subkey(&id) else { continue };
            let title: String = k.get_value("gameName").unwrap_or_default();
            if matches(&title, &id) {
                if let Ok(p) = k.get_value::<String, _>("path") {
                    out.push(PathBuf::from(p));
                }
            }
        }
    }
    dedup(out)
}

#[cfg(not(windows))]
pub fn gog_games(_matches: impl Fn(&str, &str) -> bool) -> Vec<PathBuf> {
    Vec::new()
}

/// Epic Games Launcher manifestleri: görünen adı eşleşen kurulumların klasörleri.
pub fn epic_games(matches: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    let Some(pd) = std::env::var_os("ProgramData") else { return Vec::new() };
    let dir = PathBuf::from(pd).join("Epic").join("EpicGamesLauncher").join("Data").join("Manifests");
    let Ok(rd) = fs::read_dir(dir) else { return Vec::new() };
    let mut out = Vec::new();
    for e in rd.flatten() {
        if e.path().extension().and_then(|x| x.to_str()) != Some("item") {
            continue;
        }
        let Ok(text) = fs::read_to_string(e.path()) else { continue };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
        if matches(v["DisplayName"].as_str().unwrap_or("")) {
            if let Some(loc) = v["InstallLocation"].as_str() {
                out.push(PathBuf::from(loc));
            }
        }
    }
    dedup(out)
}

/// Steam'in kütüphane için yerelde önbelleğe aldığı oyun görselleri (`appcache/librarycache`).
/// Yalnızca kullanıcının Steam kütüphanesindeki oyunlar için vardır; ağ gerekmez.
#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamArt {
    /// Geniş kahraman görseli (library_hero, ~1920×620).
    pub hero: Option<PathBuf>,
    /// Saydam oyun logosu (logo.png).
    pub logo: Option<PathBuf>,
    /// Mağaza başlık görseli (header, 460×215).
    pub header: Option<PathBuf>,
    /// Dikey kapak (library_600x900).
    pub portrait: Option<PathBuf>,
    /// Küçük uygulama simgesi.
    pub icon: Option<PathBuf>,
}

impl SteamArt {
    pub fn is_empty(&self) -> bool {
        self.hero.is_none() && self.logo.is_none() && self.header.is_none() && self.portrait.is_none() && self.icon.is_none()
    }

    pub fn get(&self, kind: &str) -> Option<&PathBuf> {
        match kind {
            "hero" => self.hero.as_ref(),
            "logo" => self.logo.as_ref(),
            "header" => self.header.as_ref(),
            "portrait" => self.portrait.as_ref(),
            "icon" => self.icon.as_ref(),
            _ => None,
        }
    }
}

/// Uygulama kimliği için Steam görselleri; yeni (`<id>/library_hero.jpg`) ve eski (`<id>_library_hero.jpg`) düzen.
pub fn steam_library_art(app_id: u32) -> SteamArt {
    let mut art = SteamArt::default();
    for root in steam_roots() {
        let cache = root.join("appcache").join("librarycache");
        let dir = cache.join(app_id.to_string());
        let id = app_id;
        // Yeni düzen: <önbellek>/<id>/<ad>; eski düzen: <önbellek>/<id>_<ad>.
        let find = |name: &str| Some(dir.join(name)).filter(|p| p.is_file()).or_else(|| Some(cache.join(format!("{id}_{name}"))).filter(|p| p.is_file()));
        art.hero = art.hero.or_else(|| find("library_hero.jpg"));
        art.logo = art.logo.or_else(|| find("logo.png"));
        art.header = art.header.or_else(|| find("header.jpg"));
        art.portrait = art.portrait.or_else(|| find("library_600x900.jpg"));
        if art.icon.is_none() {
            // Simge, yeni düzende 40 onaltılık karakterli adla durur (ör. 35d13…fb40.jpg); eski düzende `<id>_icon.jpg`.
            art.icon = fs::read_dir(&dir)
                .ok()
                .and_then(|rd| {
                    rd.flatten().map(|e| e.path()).find(|p| {
                        let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
                        p.extension().is_some_and(|x| x == "jpg") && stem.len() == 40 && stem.chars().all(|c| c.is_ascii_hexdigit())
                    })
                })
                .or_else(|| Some(cache.join(format!("{id}_icon.jpg"))).filter(|p| p.is_file()));
        }
        if !art.is_empty() {
            break;
        }
    }
    art
}

/// Yol bir Steam kütüphane görsel önbelleğinin içinde mi? (görsel sunucusu yalnızca buradan okur)
pub fn is_steam_art_path(p: &Path) -> bool {
    let key = norm_key(p);
    !key.contains("..") && key.contains("\\appcache\\librarycache\\") && steam_roots().iter().any(|r| key.starts_with(&norm_key(r)))
}

/// Görsel türü → Steam dosya adı (yerel önbellekte ve Steam'in herkese açık deposunda aynı ad).
pub fn steam_art_file(kind: &str) -> Option<&'static str> {
    match kind {
        "hero" => Some("library_hero.jpg"),
        "logo" => Some("logo.png"),
        "header" => Some("header.jpg"),
        "portrait" => Some("library_600x900.jpg"),
        _ => None,
    }
}

/// Steam'in herkese açık mağaza görselleri (kütüphanede olmayan oyunlar için; anahtar gerekmez).
pub fn steam_cdn_url(app_id: u32, file: &str) -> String {
    format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/{file}")
}

/// `appmanifest_*.acf` içindeki bir anahtarın değeri (`"installdir"		"Stardew Valley"`).
fn acf_value<'a>(text: &'a str, key: &str) -> Option<&'a str> {
    let quoted = format!("\"{key}\"");
    text.lines().find_map(|line| {
        let rest = line.trim().strip_prefix(&quoted)?;
        let value = rest.trim().strip_prefix('"')?.strip_suffix('"')?;
        (!value.is_empty() && !value.contains(['/', '\\']) && value != "..").then_some(value)
    })
}

/// Steam'de kurulu uygulamanın klasörü (`steamapps/common/<installdir>`).
pub fn steam_install_dir(app_id: u32) -> Option<PathBuf> {
    steam_libraries().into_iter().find_map(|lib| {
        let text = fs::read_to_string(lib.join("steamapps").join(format!("appmanifest_{app_id}.acf"))).ok()?;
        let dir = lib.join("steamapps").join("common").join(acf_value(&text, "installdir")?);
        dir.is_dir().then_some(dir)
    })
}

/// Oyun klasöründe oyunun kendi .exe'sini bulur (simgesi için). Yalnızca adı oyun adıyla eşleşen
/// programlar aday olur (mod klasörlerindeki yabancı kurucular seçilmesin); en sığ ve en uzun eşleşme kazanır.
pub fn find_game_exe(dir: &Path, game_name: &str) -> Option<PathBuf> {
    let norm = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase();
    let hint = norm(game_name);
    const SKIP: &[&str] = &["unins", "setup", "redist", "crash", "report", "update", "helper", "install", "service", "native"];
    let mut best: Option<(i64, PathBuf)> = None;
    for e in walkdir::WalkDir::new(dir).max_depth(3).follow_links(false).into_iter().flatten() {
        let p = e.path();
        if !e.file_type().is_file() || !p.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe")) {
            continue;
        }
        let stem = norm(&p.file_stem().unwrap_or_default().to_string_lossy());
        if stem.len() < 4 || SKIP.iter().any(|s| stem.contains(s)) || !(hint.contains(&stem) || stem.contains(&hint)) {
            continue;
        }
        let score = stem.len() as i64 * 10 - e.depth() as i64 * 50;
        if best.as_ref().is_none_or(|b| score > b.0) {
            best = Some((score, p.to_path_buf()));
        }
    }
    best.map(|b| b.1)
}

/// Var olan sabit sürücülerin kökleri (C:\ … Z:\).
pub fn drives() -> Vec<PathBuf> {
    (b'C'..=b'Z').map(|l| PathBuf::from(format!("{}:\\", l as char))).filter(|p| p.is_dir()).collect()
}

/// Xbox uygulamasıyla kurulan oyunlar: `<sürücü>:\XboxGames\<folder>\Content`.
pub fn xbox_game_dirs(folder: &str) -> Vec<PathBuf> {
    drives().into_iter().map(|d| d.join("XboxGames").join(folder).join("Content")).filter(|p| p.is_dir()).collect()
}

/// Klasör adı oyun adını içeren Xbox kurulumları (ör. "Microsoft Flight Simulator 2024"); en uzun ad önce.
pub fn xbox_game_dirs_like(game_name: &str) -> Vec<PathBuf> {
    let norm = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).collect::<String>().to_lowercase();
    let hint = norm(game_name);
    let mut found: Vec<(usize, PathBuf)> = drives()
        .into_iter()
        .filter_map(|d| fs::read_dir(d.join("XboxGames")).ok())
        .flat_map(|rd| rd.flatten())
        .filter_map(|e| {
            let name = norm(&e.file_name().to_string_lossy());
            let content = e.path().join("Content");
            (name.contains(&hint) && content.is_dir()).then_some((name.len(), content))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|f| f.1).collect()
}

/// Xbox kurulumunun kutucuk logosu: `MicrosoftGame.Config` → `ShellVisuals Square150x150Logo` (saydam PNG).
/// Bu oyunların .exe'si çoğunlukla okunamaz; mağazanın gösterdiği simge budur.
pub fn xbox_tile_logo(content_dir: &Path) -> Option<PathBuf> {
    let config = fs::read_to_string(content_dir.join("MicrosoftGame.Config")).ok()?;
    let start = config.find("Square150x150Logo=\"")? + "Square150x150Logo=\"".len();
    let value = &config[start..start + config[start..].find('"')?];
    if value.is_empty() || value.contains("..") || value.contains(':') || value.starts_with(['/', '\\']) {
        return None;
    }
    let path = content_dir.join(value);
    (path.extension().is_some_and(|x| x.eq_ignore_ascii_case("png")) && path.is_file()).then_some(path)
}

/// Yolun hangi mağazadan geldiği (görüntüleme için).
pub fn store_of(path: &Path) -> &'static str {
    let s = path.to_string_lossy().to_lowercase();
    if s.contains("steamapps") {
        "steam"
    } else if s.contains("xboxgames") || s.contains("windowsapps") {
        "xbox"
    } else if s.contains("gog") {
        "gog"
    } else if s.contains("epic") {
        "epic"
    } else {
        "manual"
    }
}

/// Aday klasörleri doğrular, gösterilecek biçime çevirir ve tekrarları atar.
pub fn verified(candidates: Vec<(PathBuf, &'static str)>, valid: impl Fn(&Path) -> bool) -> Vec<(PathBuf, &'static str)> {
    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|(p, _)| valid(p))
        .filter_map(|(p, store)| {
            let clean = dunce(&p);
            seen.insert(norm_key(&clean)).then_some((clean, store))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appx_version_from_package_keys() {
        let keys = ["Publisher.App_1.9.21.0_x64__abc", "Publisher.App_1.10.2.0_x64__abc", "Publisher.AppOther_2.0.0.0_x64__abc", "Publisher.App_1.9.21.0_neutral__abc", "Other_1.0_x64__x"];
        assert_eq!(appx_versions_in(keys.iter().map(|s| s.to_string()), "Publisher.App"), ["1.10.2.0", "1.9.21.0"]);
        assert!(appx_versions_in(std::iter::empty(), "Publisher.App").is_empty());
    }

    #[test]
    fn parses_vdf_paths() {
        let vdf = r#""libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}"#;
        assert_eq!(parse_library_folders(vdf), vec![PathBuf::from(r"C:\Program Files (x86)\Steam"), PathBuf::from(r"D:\SteamLibrary")]);
    }

    #[test]
    fn reads_acf_install_dir() {
        let acf = "\"AppState\"\n{\n\t\"appid\"\t\t\"413150\"\n\t\"installdir\"\t\t\"Stardew Valley\"\n}";
        assert_eq!(acf_value(acf, "installdir"), Some("Stardew Valley"));
        assert_eq!(acf_value("\"installdir\"\t\t\"..\\\\evil\"", "installdir"), None);
    }

    #[test]
    fn finds_the_games_own_exe() {
        let root = std::env::temp_dir().join(format!("modstead-exe-{}", crate::fsx::short_id()));
        let bin = root.join("bin").join("Win64_Shipping_Client");
        std::fs::create_dir_all(&bin).unwrap();
        for name in ["Bannerlord.exe", "Bannerlord.Native.exe", "TaleWorlds.MountAndBlade.Launcher.exe", "unins000.exe"] {
            std::fs::write(bin.join(name), b"MZ").unwrap();
        }
        std::fs::write(root.join("SomeModInstaller.exe"), b"MZ").unwrap();
        assert_eq!(find_game_exe(&root, "Mount & Blade II: Bannerlord"), Some(bin.join("Bannerlord.exe")));
        assert_eq!(find_game_exe(&root, "Stardew Valley"), None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn reads_xbox_tile_logo() {
        let root = std::env::temp_dir().join(format!("modstead-xbox-{}", crate::fsx::short_id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("Logo.png"), b"\x89PNG").unwrap();
        let config = |logo: &str| std::fs::write(root.join("MicrosoftGame.Config"), format!(r#"<Game><ShellVisuals DefaultDisplayName="X" Square150x150Logo="{logo}" Square44x44Logo="SmallLogo.png" /></Game>"#)).unwrap();
        config("Logo.png");
        assert_eq!(xbox_tile_logo(&root), Some(root.join("Logo.png")));
        config(r"..\..\secret.png");
        assert_eq!(xbox_tile_logo(&root), None);
        config("Missing.png");
        assert_eq!(xbox_tile_logo(&root), None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn classifies_stores() {
        assert_eq!(store_of(Path::new(r"D:\SteamLibrary\steamapps\common\Stardew Valley")), "steam");
        assert_eq!(store_of(Path::new(r"E:\XboxGames\Stardew Valley\Content")), "xbox");
        assert_eq!(store_of(Path::new(r"C:\Games\Foo")), "manual");
    }
}
