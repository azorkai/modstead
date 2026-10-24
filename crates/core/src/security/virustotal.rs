//! İsteğe bağlı VirusTotal özet sorgusu: yalnızca SHA-256 sorulur, dosya YÜKLENMEZ.
//! Anahtar kullanıcınındır ve Kimlik Bilgisi Yöneticisi'nde durur (`credentials::VIRUSTOTAL_KEY`).

use super::{EngineResult, EngineStatus};
use crate::http::Http;

const ENGINE: &str = "VirusTotal";

/// Arayüzde gösterilecek, anahtar gerektirmeyen bağlantı.
pub fn gui_link(sha256: &str) -> String {
    format!("https://www.virustotal.com/gui/file/{sha256}")
}

pub async fn lookup(http: &Http, api_key: &str, sha256: &str) -> EngineResult {
    let link = Some(gui_link(sha256));
    let resp = http.client.get(format!("https://www.virustotal.com/api/v3/files/{sha256}")).header("x-apikey", api_key).send().await;
    match resp {
        Ok(r) if r.status().as_u16() == 404 => EngineResult {
            status: EngineStatus::Unknown,
            engine: ENGINE.into(),
            detail: tr!("VirusTotal bu dosyayı daha önce görmemiş.", "VirusTotal has not seen this file before.").into(),
            link,
            ..Default::default()
        },
        Ok(r) if r.status().is_success() => {
            let v: serde_json::Value = r.json().await.unwrap_or_default();
            let s = &v["data"]["attributes"]["last_analysis_stats"];
            let g = |k: &str| s[k].as_u64().unwrap_or(0) as u32;
            let (mal, sus) = (g("malicious"), g("suspicious"));
            EngineResult {
                status: if mal > 0 { EngineStatus::Threat } else { EngineStatus::Clean },
                engine: ENGINE.into(),
                detail: tr!(format!("{mal} motor zararlı, {sus} motor şüpheli dedi."), format!("{mal} engines flagged it malicious, {sus} suspicious.")),
                malicious: mal,
                suspicious: sus,
                link,
            }
        }
        Ok(r) if r.status().as_u16() == 401 => EngineResult {
            status: EngineStatus::Error,
            engine: ENGINE.into(),
            detail: tr!("VirusTotal anahtarı geçersiz.", "The VirusTotal key is invalid.").into(),
            link,
            ..Default::default()
        },
        Ok(r) => EngineResult {
            status: EngineStatus::Error,
            engine: ENGINE.into(),
            detail: format!("{}: {}", tr!("VirusTotal yanıtı", "VirusTotal response"), r.status()),
            link,
            ..Default::default()
        },
        Err(e) => EngineResult {
            status: EngineStatus::Error,
            engine: ENGINE.into(),
            detail: format!("{}: {e}", tr!("VirusTotal'a ulaşılamadı", "could not reach VirusTotal")),
            link,
            ..Default::default()
        },
    }
}
