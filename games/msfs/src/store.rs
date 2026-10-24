//! Kalıcı veriler (`games/msfs/`): mod üst verileri (kaynak, güvenlik raporu, etiketler) ve profiller.

use std::collections::HashMap;

use modstead_core::security::SecurityReport;
use serde::{Deserialize, Deserializer, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct ModMeta {
    pub source_url: Option<String>,
    pub source_label: Option<String>,
    pub catalog_id: Option<String>,
    /// Katalogdan kurulduysa GitHub sürüm etiketi.
    pub release_tag: Option<String>,
    pub installed_at: Option<String>,
    pub archive_sha256: Option<String>,
    /// Kurulumdaki güvenlik raporu. Hangar'ın eski biçimindeki raporlar okunamaz ve düşer.
    #[serde(deserialize_with = "lenient_report")]
    pub report: Option<SecurityReport>,
    /// Kurulumdan önce ayıklanan çalıştırılabilir dosyalar (göreli yollar).
    pub stripped: Vec<String>,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub notes: String,
}

fn lenient_report<'de, D: Deserializer<'de>>(d: D) -> Result<Option<SecurityReport>, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(serde_json::from_value(v).ok())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Db {
    /// Anahtar: mod kimliği (kütüphaneye göre göreli yol, küçük harf).
    pub mods: HashMap<String, ModMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub description: String,
    /// simId -> etkin mod kimlikleri
    pub sims: HashMap<String, Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}

pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_hangar_reports_are_dropped_not_fatal() {
        let old = r#"{"mods":{"fnx":{"sourceLabel":"Community'den içe aktarıldı","report":{"verdict":"safe","riskScore":3},"favorite":true}}}"#;
        let db: Db = serde_json::from_str(old).unwrap();
        let m = &db.mods["fnx"];
        assert!(m.report.is_none());
        assert!(m.favorite);
        assert_eq!(m.source_label.as_deref(), Some("Community'den içe aktarıldı"));
    }
}
