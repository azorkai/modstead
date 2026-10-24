//! smapi.io mod API'si ile güncelleme ve uyumluluk denetimi. Anahtar gerektirmez; Nexus,
//! GitHub, ModDrop ve CurseForge sayfalarını SMAPI'nin kendi sunucusu tarar. İstekler
//! çekirdeğin izin listeli istemcisiyle gider (`smapi.io`, `INFO.hosts` içinde).

use std::collections::HashSet;

use modstead_core::http::Http;
use modstead_core::{AppError, AppResult, tr};
use serde::{Deserialize, Serialize};

use crate::scan::ModInfo;
use crate::util;

const API: &str = "https://smapi.io/api/v4.0.0/mods";
pub const SMAPI_ID: &str = "Pathoschild.SMAPI";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateEntry {
    pub unique_id: String,
    pub name: Option<String>,
    pub installed: Option<String>,
    pub latest: Option<String>,
    pub url: Option<String>,
    pub has_update: bool,
    pub compat_status: Option<String>,
    pub compat_summary: Option<String>,
    pub broke_in: Option<String>,
    pub nexus_id: Option<u64>,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateCache {
    pub checked_at: u64,
    pub smapi: Option<UpdateEntry>,
    pub entries: Vec<UpdateEntry>,
}

impl UpdateCache {
    pub fn find(&self, unique_id: &str) -> Option<&UpdateEntry> {
        self.entries.iter().find(|e| e.unique_id.eq_ignore_ascii_case(unique_id))
    }

    /// Kurulu modlardan güncellemesi olanların sayısı.
    pub fn update_count(&self, mods: &[ModInfo]) -> u32 {
        mods.iter().filter(|m| m.unique_id.as_deref().and_then(|id| self.find(id)).is_some_and(|e| e.has_update)).count() as u32
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReqMod {
    id: String,
    update_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    installed_version: Option<String>,
    is_broken: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Req {
    mods: Vec<ReqMod>,
    api_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    game_version: Option<String>,
    platform: &'static str,
    include_extended_metadata: bool,
}

#[derive(Deserialize, Default)]
struct RemoteVersion {
    version: Option<String>,
    url: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Meta {
    name: Option<String>,
    #[serde(rename = "nexusID")]
    nexus_id: Option<u64>,
    main: Option<RemoteVersion>,
    #[serde(rename = "customUrl")]
    custom_url: Option<String>,
    #[serde(rename = "compatibilityStatus")]
    compatibility_status: Option<String>,
    #[serde(rename = "compatibilitySummary")]
    compatibility_summary: Option<String>,
    #[serde(rename = "brokeIn")]
    broke_in: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Resp {
    id: String,
    #[serde(rename = "suggestedUpdate")]
    suggested_update: Option<RemoteVersion>,
    metadata: Option<Meta>,
    errors: Vec<String>,
}

/// Uyumluluk özetindeki HTML etiketlerini ve varlıklarını temizler.
pub fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").trim().to_string()
}

pub fn nexus_url(id: u64) -> String {
    format!("https://www.nexusmods.com/stardewvalley/mods/{id}")
}

pub fn nexus_search_url(term: &str) -> String {
    let q: String = term
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    format!("https://www.nexusmods.com/games/stardewvalley/mods?keyword={q}")
}

fn to_entry(r: Resp, installed: Option<String>) -> UpdateEntry {
    let meta = r.metadata.unwrap_or_default();
    let suggested = r.suggested_update;
    let has_update = suggested.as_ref().and_then(|s| s.version.as_ref()).is_some();
    let latest = suggested.as_ref().and_then(|s| s.version.clone()).or_else(|| meta.main.as_ref().and_then(|m| m.version.clone()));
    let url = suggested
        .as_ref()
        .and_then(|s| s.url.clone())
        .or_else(|| meta.main.as_ref().and_then(|m| m.url.clone()))
        .or(meta.custom_url.clone())
        .or_else(|| meta.nexus_id.map(nexus_url));
    UpdateEntry {
        unique_id: r.id,
        name: meta.name,
        installed,
        latest,
        url,
        has_update,
        compat_status: meta.compatibility_status,
        compat_summary: meta.compatibility_summary.map(|s| strip_html(&s)).filter(|s| !s.is_empty()),
        broke_in: meta.broke_in,
        nexus_id: meta.nexus_id,
        errors: r.errors,
    }
}

async fn post(http: &Http, req: &Req) -> AppResult<Vec<Resp>> {
    let url = http.ensure_allowed(API)?;
    let resp = http.client.post(url).json(req).send().await?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(tr!(format!("smapi.io {status} döndürdü"), format!("smapi.io returned {status}"))));
    }
    Ok(resp.json::<Vec<Resp>>().await?)
}

pub async fn check(http: &Http, mods: &[ModInfo], smapi_version: Option<String>, game_version: Option<String>) -> AppResult<UpdateCache> {
    let api_version = smapi_version.clone().unwrap_or_else(|| "4.0.0".into());
    let mut seen = HashSet::new();
    let targets: Vec<&ModInfo> =
        mods.iter().filter(|m| m.manifest_error.is_none()).filter(|m| m.unique_id.as_ref().is_some_and(|id| seen.insert(id.to_lowercase()))).collect();

    let mut cache = UpdateCache { checked_at: util::now_ms(), ..Default::default() };
    let mut batches: Vec<Vec<ReqMod>> = targets
        .chunks(100)
        .map(|chunk| {
            chunk.iter().map(|m| ReqMod { id: m.unique_id.clone().unwrap_or_default(), update_keys: m.update_keys.clone(), installed_version: m.version.clone(), is_broken: false }).collect()
        })
        .collect();
    if batches.is_empty() {
        batches.push(Vec::new());
    }
    batches[0].push(ReqMod {
        id: SMAPI_ID.into(),
        update_keys: vec!["GitHub:Pathoschild/SMAPI".into()],
        installed_version: Some(smapi_version.clone().unwrap_or_else(|| "0.0.1".into())),
        is_broken: false,
    });

    for batch in batches {
        let req = Req { mods: batch, api_version: api_version.clone(), game_version: game_version.clone(), platform: "Windows", include_extended_metadata: true };
        for r in post(http, &req).await? {
            if r.id.eq_ignore_ascii_case(SMAPI_ID) {
                cache.smapi = Some(to_entry(r, smapi_version.clone()));
                continue;
            }
            let installed = targets.iter().find(|m| m.unique_id.as_deref().is_some_and(|id| id.eq_ignore_ascii_case(&r.id))).and_then(|m| m.version.clone());
            cache.entries.push(to_entry(r, installed));
        }
    }
    Ok(cache)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LookupResult {
    pub unique_id: String,
    pub name: Option<String>,
    pub url: String,
    pub found: bool,
    /// Nexus numarası biliniyorsa arayüz mod sayfasını uygulama içinde açar.
    pub nexus_id: Option<u64>,
}

/// Eksik bağımlılıklar için mod sayfasını bulur (SMAPI wiki uyumluluk listesinden).
pub async fn lookup(http: &Http, ids: Vec<String>, smapi_version: Option<String>) -> AppResult<Vec<LookupResult>> {
    let req = Req {
        mods: ids.iter().map(|id| ReqMod { id: id.clone(), update_keys: vec![], installed_version: None, is_broken: false }).collect(),
        api_version: smapi_version.unwrap_or_else(|| "4.0.0".into()),
        game_version: None,
        platform: "Windows",
        include_extended_metadata: true,
    };
    let resp = post(http, &req).await?;
    Ok(ids
        .into_iter()
        .map(|id| {
            let meta = resp.iter().find(|r| r.id.eq_ignore_ascii_case(&id)).and_then(|r| r.metadata.as_ref());
            let url = meta.and_then(|m| m.nexus_id.map(nexus_url).or(m.custom_url.clone()).or_else(|| m.main.as_ref().and_then(|v| v.url.clone())));
            LookupResult { name: meta.and_then(|m| m.name.clone()), found: url.is_some(), url: url.unwrap_or_else(|| nexus_search_url(&id)), nexus_id: meta.and_then(|m| m.nexus_id), unique_id: id }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_html() {
        assert_eq!(strip_html("<a href='x'>use latest</a> &amp; enjoy"), "use latest & enjoy");
        assert_eq!(strip_html("a < b"), "a");
    }

    #[test]
    fn parses_api_response() {
        let raw = r#"[{"id":"Pathoschild.ContentPatcher","suggestedUpdate":{"version":"2.9.1","url":"https://www.nexusmods.com/stardewvalley/mods/1915"},"metadata":{"id":["Pathoschild.ContentPatcher"],"name":"Content Patcher","nexusID":1915,"main":{"version":"2.9.1","url":"u"},"compatibilityStatus":"Ok","compatibilitySummary":"use latest version."},"errors":[]}]"#;
        let r: Vec<Resp> = serde_json::from_str(raw).unwrap();
        let e = to_entry(r.into_iter().next().unwrap(), Some("2.0.0".into()));
        assert!(e.has_update);
        assert_eq!(e.latest.as_deref(), Some("2.9.1"));
        assert_eq!(e.nexus_id, Some(1915));
        assert_eq!(e.compat_status.as_deref(), Some("Ok"));
    }

    #[test]
    fn search_url_escapes() {
        assert!(nexus_search_url("a b&c").ends_with("keyword=a+b%26c"));
    }
}
