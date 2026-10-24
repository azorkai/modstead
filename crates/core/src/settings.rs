//! Genel ayarlar (tüm oyunlar için ortak). Oyuna özel ayarlar oyunun kendi veri klasöründe durur.

use serde::{Deserialize, Serialize};

use crate::security::SecurityPolicy;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "system" | "dark" | "light"
    pub theme: String,
    /// "auto" | "tr" | "en"
    pub language: String,
    pub reduce_motion: bool,
    /// Kurulumdan önce Microsoft Defender ile tara; tarama yapılamazsa açık onay iste.
    pub require_scan: bool,
    /// Kaynak özet yayımlamıyorsa açık onay iste.
    pub require_verified: bool,
    /// "Tehlikeli" kararlı paketleri hiç kurma.
    pub block_dangerous: bool,
    /// VirusTotal anahtarı kayıtlıysa arşiv özetini sor (dosya gönderilmez).
    pub virustotal: bool,
    /// Nexus aramasında yetişkin içerik.
    pub show_adult: bool,
    /// nxm:// işleyicisi Modstead'e kayıtlı mı ve önceki işleyici (geri vermek için).
    pub nxm_registered: bool,
    pub nxm_previous_command: Option<String>,
    pub onboarded: bool,
    /// Yönetilen oyunlar (kenar çubuğu sırası). Boşsa hepsi.
    pub games: Vec<String>,
    pub last_game: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "system".into(),
            language: "auto".into(),
            reduce_motion: false,
            require_scan: true,
            require_verified: true,
            block_dangerous: true,
            virustotal: true,
            show_adult: false,
            nxm_registered: false,
            nxm_previous_command: None,
            onboarded: false,
            games: Vec::new(),
            last_game: None,
        }
    }
}

/// Arayüzden gelen kısmi değişiklik. nxm alanları yamayla değişmez (kayıt işlemi yönetir).
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SettingsPatch {
    pub theme: Option<String>,
    pub language: Option<String>,
    pub reduce_motion: Option<bool>,
    pub require_scan: Option<bool>,
    pub require_verified: Option<bool>,
    pub block_dangerous: Option<bool>,
    pub virustotal: Option<bool>,
    pub show_adult: Option<bool>,
    pub onboarded: Option<bool>,
    pub games: Option<Vec<String>>,
    pub last_game: Option<Option<String>>,
}

impl Settings {
    pub fn apply(&mut self, p: SettingsPatch) {
        if let Some(v) = p.theme.filter(|v| matches!(v.as_str(), "system" | "dark" | "light")) {
            self.theme = v;
        }
        if let Some(v) = p.language.filter(|v| matches!(v.as_str(), "auto" | "tr" | "en")) {
            self.language = v;
        }
        if let Some(v) = p.reduce_motion {
            self.reduce_motion = v;
        }
        if let Some(v) = p.require_scan {
            self.require_scan = v;
        }
        if let Some(v) = p.require_verified {
            self.require_verified = v;
        }
        if let Some(v) = p.block_dangerous {
            self.block_dangerous = v;
        }
        if let Some(v) = p.virustotal {
            self.virustotal = v;
        }
        if let Some(v) = p.show_adult {
            self.show_adult = v;
        }
        if let Some(v) = p.onboarded {
            self.onboarded = v;
        }
        if let Some(v) = p.games {
            self.games = v.into_iter().filter(|g| g.len() <= 32 && g.chars().all(|c| c.is_ascii_alphanumeric())).take(64).collect();
        }
        if let Some(v) = p.last_game {
            self.last_game = v.filter(|g| g.len() <= 32);
        }
    }

    pub fn security_policy(&self) -> SecurityPolicy {
        SecurityPolicy { require_scan: self.require_scan, require_verified: self.require_verified, block_dangerous: self.block_dangerous }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_validates_values() {
        let mut s = Settings::default();
        s.apply(SettingsPatch { theme: Some("neon".into()), language: Some("en".into()), games: Some(vec!["msfs".into(), "../x".into()]), ..Default::default() });
        assert_eq!(s.theme, "system");
        assert_eq!(s.language, "en");
        assert_eq!(s.games, vec!["msfs".to_string()]);
    }

    #[test]
    fn old_files_get_defaults() {
        let s: Settings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(s.theme, "dark");
        assert!(s.require_scan && s.block_dangerous);
    }
}
