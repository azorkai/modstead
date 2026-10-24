//! MSFS'e özel ayarlar (`games/msfs/settings.json`). Dil, tema ve güvenlik ayarları genel ayarlardadır;
//! VirusTotal anahtarı ve GitHub belirteci Kimlik Bilgisi Yöneticisi'ndedir.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct SimOverride {
    /// Kullanıcının elle seçtiği paket klasörü (içinde Community bulunan).
    pub packages_path: Option<PathBuf>,
    /// Bu simülatörü tamamen yok say.
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct MsfsSettings {
    /// Modların gerçek dosyalarının durduğu kütüphane klasörü.
    pub library_path: Option<PathBuf>,
    pub sim_overrides: HashMap<String, SimOverride>,
    /// Mod paketlerinin içinden çalıştırılabilir dosyaları (exe, dll, bat…) kurulumdan önce ayıkla.
    pub strip_executables: bool,
    /// MSFS'in ilk kurulum adımları (kütüphane seçimi, içe aktarma) tamamlandı.
    pub onboarded: bool,
}

impl Default for MsfsSettings {
    fn default() -> Self {
        MsfsSettings { library_path: None, sim_overrides: HashMap::new(), strip_executables: true, onboarded: false }
    }
}

/// Arayüzden gelen kısmi değişiklik.
#[derive(Debug, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct MsfsSettingsPatch {
    pub library_path: Option<PathBuf>,
    pub sim_overrides: Option<HashMap<String, SimOverride>>,
    pub strip_executables: Option<bool>,
    pub onboarded: Option<bool>,
}
