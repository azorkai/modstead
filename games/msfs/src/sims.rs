//! MSFS 2020 ve 2024 kurulumlarını (Steam / Microsoft Store) bulur.
//!
//! Yollar:
//! - 2020 Store: %LOCALAPPDATA%\Packages\Microsoft.FlightSimulator_8wekyb3d8bbwe\LocalCache
//! - 2020 Steam: %APPDATA%\Microsoft Flight Simulator
//! - 2024 Store: %LOCALAPPDATA%\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache
//! - 2024 Steam: %APPDATA%\Microsoft Flight Simulator 2024
//!
//! Paketlerin yeri UserCfg.opt içindeki `InstalledPackagesPath` satırındadır.
//! MSFS 2024 hem `Community` hem `Community2024` klasörünü okur; 2020 yalnızca `Community`yi.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use modstead_core::prelude::*;
use modstead_core::{fsx, platform};
use serde::Serialize;

use crate::settings::MsfsSettings;

pub const SIM_2020: &str = "msfs2020";
pub const SIM_2024: &str = "msfs2024";
pub const SIMS: [&str; 2] = [SIM_2020, SIM_2024];

/// Steam uygulama kimlikleri.
pub const STEAM_APP_2020: u32 = 1250410;
pub const STEAM_APP_2024: u32 = 2537590;
/// Microsoft Store / Xbox uygulama kimlikleri (AUMID); `Get-StartApps` ile doğrulandı.
pub const STORE_AUMID_2020: &str = "Microsoft.FlightSimulator_8wekyb3d8bbwe!App";
pub const STORE_AUMID_2024: &str = "Microsoft.Limitless_8wekyb3d8bbwe!App";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimInstall {
    pub id: String,
    pub name: String,
    pub short: String,
    /// "steam" | "store" | "manual" (yalnızca elle seçilmiş yol) | "disabled" (kullanıcı kapattı) | "" (bulunamadı)
    pub edition: String,
    pub detected: bool,
    pub config_dir: Option<PathBuf>,
    pub user_cfg: Option<PathBuf>,
    pub packages_path: Option<PathBuf>,
    pub community_path: Option<PathBuf>,
    /// Yalnızca 2024: sadece 2024'ün okuduğu ikinci topluluk klasörü.
    pub community2024_path: Option<PathBuf>,
    pub exe_xml: Option<PathBuf>,
    pub content_xml: Option<PathBuf>,
    pub running: bool,
    /// 2020 ile 2024 aynı paket klasörünü paylaşıyor mu?
    pub shares_packages: bool,
    /// Paket klasörü kullanıcı tarafından elle seçildi.
    pub overridden: bool,
    #[serde(skip)]
    pub last_used: Option<SystemTime>,
}

impl SimInstall {
    /// Bu simülatörün okuduğu topluluk klasörleri: (etiket, yol).
    pub fn containers(&self) -> Vec<(String, PathBuf)> {
        let mut v = Vec::new();
        if let Some(c) = &self.community_path {
            v.push(("Community".to_string(), c.clone()));
        }
        if let Some(c) = &self.community2024_path {
            v.push(("Community2024".to_string(), c.clone()));
        }
        v
    }

    pub fn usable(&self) -> bool {
        self.detected && self.community_path.is_some()
    }
}

pub fn short_of(sim: &str) -> &'static str {
    if sim == SIM_2020 { "2020" } else { "2024" }
}

fn process_name(sim: &str) -> &'static str {
    if sim == SIM_2020 { "flightsimulator.exe" } else { "flightsimulator2024.exe" }
}

fn candidates(sim: &str) -> Vec<(&'static str, PathBuf)> {
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from);
    let (store_pkg, steam_dir) = if sim == SIM_2020 {
        ("Microsoft.FlightSimulator_8wekyb3d8bbwe", "Microsoft Flight Simulator")
    } else {
        ("Microsoft.Limitless_8wekyb3d8bbwe", "Microsoft Flight Simulator 2024")
    };
    let mut v = Vec::new();
    if let Some(l) = &local {
        v.push(("store", l.join("Packages").join(store_pkg).join("LocalCache")));
    }
    if let Some(r) = &roaming {
        v.push(("steam", r.join(steam_dir)));
    }
    v
}

/// `InstalledPackagesPath "D:\MSFS"` satırı.
pub fn parse_installed_packages_path(text: &str) -> Option<PathBuf> {
    text.lines().find_map(|line| {
        let rest = line.trim().strip_prefix("InstalledPackagesPath")?;
        // "InstalledPackagesPathX" gibi başka bir anahtar olmasın.
        if !rest.starts_with(char::is_whitespace) {
            return None;
        }
        let value = rest.trim().trim_matches('"').trim();
        (!value.is_empty()).then(|| PathBuf::from(value))
    })
}

/// Content.xml: simin İçerik Yöneticisi'ndeki paket durumları.
/// - 2020 (Steam: %APPDATA%\Microsoft Flight Simulator, Store: LocalCache) doğrudan yapılandırma klasöründe.
/// - 2024 kullanıcıya özel bir alt klasörde tutar (ör. LocalCache\<oyuncu adı>\Content.xml).
///
/// Birden fazla aday varsa (birden çok oyuncu hesabı, eski bir kopya) en son yazılan kazanır.
pub fn find_content_xml(sim: &str, config_dir: &Path) -> Option<PathBuf> {
    let mut candidates = vec![config_dir.join("Content.xml")];
    if sim == SIM_2024 {
        if let Ok(rd) = fs::read_dir(config_dir) {
            for e in rd.flatten() {
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    candidates.push(e.path().join("Content.xml"));
                }
            }
        }
    }
    candidates
        .into_iter()
        .filter_map(|p| {
            let t = fs::metadata(&p).ok().filter(|m| m.is_file())?.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            Some((t, p))
        })
        .max_by_key(|(t, _)| *t)
        .map(|(_, p)| p)
}

/// Simi başlatmak için kabuğa verilecek adres.
pub fn launch_uri(s: &SimInstall) -> AppResult<String> {
    if !s.detected {
        return Err(AppError::msg(tr!(format!("MSFS {} bu bilgisayarda bulunamadı.", s.short), format!("MSFS {} was not found on this computer.", s.short))));
    }
    let is_2020 = s.id == SIM_2020;
    match s.edition.as_str() {
        "steam" => Ok(format!("steam://rungameid/{}", if is_2020 { STEAM_APP_2020 } else { STEAM_APP_2024 })),
        "store" => Ok(format!(r"shell:AppsFolder\{}", if is_2020 { STORE_AUMID_2020 } else { STORE_AUMID_2024 })),
        _ => Err(AppError::msg(tr!(
            format!("MSFS {} elle ayarlanmış; Steam mi Microsoft Store mu olduğu bilinmediği için başlatılamıyor.", s.short),
            format!("MSFS {} was set up manually; it cannot be launched because it is unknown whether it is the Steam or Microsoft Store version.", s.short)
        ))),
    }
}

fn detect_one(sim: &str, settings: &MsfsSettings, procs: &[String]) -> SimInstall {
    let (name, short) = if sim == SIM_2020 { ("Microsoft Flight Simulator 2020", "2020") } else { ("Microsoft Flight Simulator 2024", "2024") };
    let mut out = SimInstall {
        id: sim.to_string(),
        name: name.to_string(),
        short: short.to_string(),
        edition: String::new(),
        detected: false,
        config_dir: None,
        user_cfg: None,
        packages_path: None,
        community_path: None,
        community2024_path: None,
        exe_xml: None,
        content_xml: None,
        running: procs.iter().any(|p| p == process_name(sim)),
        shares_packages: false,
        overridden: false,
        last_used: None,
    };

    let ov = settings.sim_overrides.get(sim).cloned().unwrap_or_default();
    if ov.disabled {
        out.edition = "disabled".into();
        return out;
    }

    // Birden fazla aday varsa en son değiştirilmiş UserCfg.opt kazanır.
    let mut best: Option<(SystemTime, &'static str, PathBuf)> = None;
    for (edition, dir) in candidates(sim) {
        if let Ok(meta) = fs::metadata(dir.join("UserCfg.opt")) {
            let t = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
            if best.as_ref().is_none_or(|(bt, _, _)| t > *bt) {
                best = Some((t, edition, dir));
            }
        }
    }

    if let Some((t, edition, dir)) = best {
        let cfg = dir.join("UserCfg.opt");
        out.detected = true;
        out.edition = edition.to_string();
        out.last_used = Some(t);
        out.packages_path = fs::read(&cfg).ok().and_then(|b| parse_installed_packages_path(&String::from_utf8_lossy(&b)));
        out.user_cfg = Some(cfg);
        let exe = dir.join("exe.xml");
        out.exe_xml = exe.is_file().then_some(exe);
        out.content_xml = find_content_xml(sim, &dir);
        out.config_dir = Some(dir);
    }

    if let Some(p) = ov.packages_path {
        out.packages_path = Some(p);
        out.overridden = true;
        if !out.detected {
            out.detected = true;
            out.edition = "manual".into();
        }
    }

    if let Some(pp) = &out.packages_path {
        let community = pp.join("Community");
        if community.is_dir() || out.detected {
            out.community_path = Some(community);
        }
        if sim == SIM_2024 {
            let c24 = pp.join("Community2024");
            if c24.is_dir() {
                out.community2024_path = Some(c24);
            }
        }
    }
    out
}

pub fn detect_sims(settings: &MsfsSettings) -> Vec<SimInstall> {
    let procs = platform::running_processes();
    let mut a = detect_one(SIM_2020, settings, &procs);
    let mut b = detect_one(SIM_2024, settings, &procs);
    if let (Some(pa), Some(pb)) = (&a.community_path, &b.community_path) {
        if fsx::norm_key(pa) == fsx::norm_key(pb) {
            a.shares_packages = true;
            b.shares_packages = true;
            // Paylaşımlı kurulumda 2024'e özel paketler Community2024'e gider; klasör yoksa oluşturulacak.
            if b.community2024_path.is_none() {
                b.community2024_path = b.packages_path.as_ref().map(|p| p.join("Community2024"));
            }
        }
    }
    vec![a, b]
}

pub fn is_running(sim_id: &str) -> bool {
    platform::process_running(&[process_name(sim_id)])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_user_cfg() {
        let text = "Version 1\n{Graphics\n}\nInstalledPackagesPath \"E:\\MSFS 2024\"\n";
        assert_eq!(parse_installed_packages_path(text), Some(PathBuf::from(r"E:\MSFS 2024")));
        assert_eq!(parse_installed_packages_path("  InstalledPackagesPath \"D:\\X\"\r\n"), Some(PathBuf::from(r"D:\X")));
        assert_eq!(parse_installed_packages_path("InstalledPackagesPathOld \"D:\\X\""), None);
        assert_eq!(parse_installed_packages_path("nothing"), None);
    }

    #[test]
    fn launch_uris() {
        let mut s = detect_one(SIM_2024, &MsfsSettings::default(), &[]);
        s.detected = true;
        s.edition = "store".into();
        assert_eq!(launch_uri(&s).unwrap(), r"shell:AppsFolder\Microsoft.Limitless_8wekyb3d8bbwe!App");
        s.edition = "steam".into();
        assert_eq!(launch_uri(&s).unwrap(), "steam://rungameid/2537590");
        s.id = SIM_2020.into();
        assert_eq!(launch_uri(&s).unwrap(), "steam://rungameid/1250410");
        s.edition = "store".into();
        assert_eq!(launch_uri(&s).unwrap(), r"shell:AppsFolder\Microsoft.FlightSimulator_8wekyb3d8bbwe!App");
        s.edition = "manual".into();
        assert!(launch_uri(&s).is_err());
        s.detected = false;
        assert!(launch_uri(&s).is_err());
    }

    #[test]
    fn disabled_override_hides_sim() {
        let mut settings = MsfsSettings::default();
        settings.sim_overrides.insert(SIM_2020.into(), crate::settings::SimOverride { packages_path: None, disabled: true });
        let s = detect_one(SIM_2020, &settings, &[]);
        assert!(!s.detected && s.edition == "disabled" && !s.usable());
    }
}
