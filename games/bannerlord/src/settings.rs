//! Bannerlord'a özel ayarlar (`<veri>\games\bannerlord\settings.json`). Dil, tema, güvenlik,
//! Nexus ve nxm ayarları genel ayarlardadır (`Services::settings()`).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct BannerlordSettings {
    /// Elle seçilen oyun klasörü; boşsa bulunan ilk kurulum kullanılır.
    pub game_path: Option<String>,
    /// Kurulumdan sonra DLL'lerin Windows engelini (Mark of the Web) kaldır.
    pub unblock_after_install: bool,
    /// Yeni kurulan modu etkinleştir ve sıraya yerleştir.
    pub enable_after_install: bool,
    /// Kurulumdan sonra yükleme sırasını otomatik düzelt.
    pub auto_sort: bool,
    /// Modül başına tutulacak yedek sayısı.
    pub backups_per_module: u32,
    /// Oyun açılınca Modstead'i küçült.
    pub minimize_on_launch: bool,
    /// BLSE kuruluysa onunla başlat.
    pub prefer_blse: bool,
}

impl Default for BannerlordSettings {
    fn default() -> Self {
        BannerlordSettings {
            game_path: None,
            unblock_after_install: true,
            enable_after_install: true,
            auto_sort: true,
            backups_per_module: 3,
            minimize_on_launch: true,
            prefer_blse: false,
        }
    }
}

/// Arayüzden gelen kısmi değişiklik (oyun klasörü kabuğun `game_set_path` komutuyla değişir).
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    pub unblock_after_install: Option<bool>,
    pub enable_after_install: Option<bool>,
    pub auto_sort: Option<bool>,
    pub backups_per_module: Option<u32>,
    pub minimize_on_launch: Option<bool>,
    pub prefer_blse: Option<bool>,
}

impl BannerlordSettings {
    pub fn apply(&mut self, p: SettingsPatch) {
        if let Some(v) = p.unblock_after_install {
            self.unblock_after_install = v;
        }
        if let Some(v) = p.enable_after_install {
            self.enable_after_install = v;
        }
        if let Some(v) = p.auto_sort {
            self.auto_sort = v;
        }
        if let Some(v) = p.backups_per_module {
            self.backups_per_module = v.clamp(1, 20);
        }
        if let Some(v) = p.minimize_on_launch {
            self.minimize_on_launch = v;
        }
        if let Some(v) = p.prefer_blse {
            self.prefer_blse = v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_otag_settings_and_clamps() {
        // Otağ'ın settings.json'u: genel alanlar (tema, dil…) yok sayılır, oyuna özel olanlar alınır.
        let s: BannerlordSettings = serde_json::from_str(r#"{"gamePath":"D:\\Games\\BL","theme":"dark","autoSort":false,"backupsPerModule":5}"#).unwrap();
        assert_eq!(s.game_path.as_deref(), Some("D:\\Games\\BL"));
        assert!(!s.auto_sort && s.unblock_after_install);
        let mut s = s;
        s.apply(SettingsPatch { backups_per_module: Some(99), ..Default::default() });
        assert_eq!(s.backups_per_module, 20);
    }
}
