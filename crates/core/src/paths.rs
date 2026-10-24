//! Uygulama veri klasörleri. Kabuk açılışta belirler; oyunlar kendi alt klasörlerini kullanır.
//!
//! - `data` (%APPDATA%\app.modstead): ayarlar ve oyun verileri (`games/<id>/…`), yedeklenmesi gerekenler.
//! - `local` (%LOCALAPPDATA%\app.modstead): önbellek, günlükler, karantina, indirmeler.

use std::path::PathBuf;

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paths {
    pub data: PathBuf,
    pub local: PathBuf,
    pub documents: PathBuf,
}

impl Paths {
    pub fn settings_file(&self) -> PathBuf {
        self.data.join("settings.json")
    }

    /// Oyunun kalıcı verisi: ayarlar, profiller, kurulum kayıtları.
    pub fn game_data(&self, game: &str) -> PathBuf {
        self.data.join("games").join(game)
    }

    /// Oyunun yerel verisi: önbellek, indirmeler, çöp kutusu.
    pub fn game_local(&self, game: &str) -> PathBuf {
        self.local.join("games").join(game)
    }

    pub fn cache(&self) -> PathBuf {
        self.local.join("cache")
    }

    /// Varsayılan karantina kökü. Oyunlar mümkünse hedefle aynı birimde kendi karantinasını kullanır
    /// (son taşıma bir yeniden adlandırma olsun diye).
    pub fn staging(&self) -> PathBuf {
        self.local.join("staging")
    }

    pub fn logs(&self) -> PathBuf {
        self.local.join("logs")
    }
}
