//! Mod logoları. Kaynak sırası: Steam Workshop önizlemesi → Nexus küçük resmi → Nexus'ta birebir
//! ad eşleşmesi. Burada yalnızca görselin ADRESİ bulunur ve önbelleğe yazılır
//! (`<yerel>\games\bannerlord\images.json`); görseli arayüz, CSP'nin izin verdiği görsel
//! sunucularından (staticdelivery.nexusmods.com, images.steamusercontent.com…) kendisi yükler.
//! Otağ görselleri diske indirip `otagimg` protokolüyle veriyordu; Modstead'de kabuğa yeni bir
//! protokol eklememek için adres yeterli (görsel yüklenemezse arayüz baş harflere düşer).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use futures_util::stream::{self, StreamExt};
use modstead_core::http::Http;
use modstead_core::{fsx, nexus};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::install::{InstallRecord, InstallSource};
use crate::modules::Catalog;
use crate::modules::submodule::ModuleInfo;
use crate::{NEXUS, steam};

/// Görsel bulunamayan modlar bu süre boyunca yeniden aranmaz.
const RETRY_AFTER: i64 = 7 * 24 * 3600;
/// Bulunan adresler bu süreden sonra tazelenir (mod sayfası görselini değiştirmiş olabilir).
const REFRESH_AFTER: i64 = 30 * 24 * 3600;

#[derive(Serialize, Deserialize, Default)]
struct Index {
    entries: HashMap<String, Entry>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    url: Option<String>,
    checked: i64,
}

/// Steam önizlemesini avatar boyutunda iste (Steam görsel sunucusu yeniden boyutlandırır).
fn steam_thumb(preview: &str) -> String {
    let sep = if preview.contains('?') { '&' } else { '?' };
    format!("{preview}{sep}imw=256&imh=256&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false")
}

async fn nexus_thumbs(http: &Http, ids: &[u64]) -> HashMap<u64, String> {
    if ids.is_empty() {
        return HashMap::new();
    }
    let list: Vec<_> = ids.iter().map(|id| json!({ "gameDomain": NEXUS.domain, "modId": id })).collect();
    let body = json!({
        "query": "query($ids: [CompositeDomainWithIdInput!]!) { legacyModsByDomain(ids: $ids, count: 100) { nodes { modId thumbnailUrl } } }",
        "variables": { "ids": list }
    });
    let Ok(resp) = http.media.post("https://api.nexusmods.com/v2/graphql").json(&body).send().await else {
        return HashMap::new();
    };
    let Ok(v) = resp.json::<serde_json::Value>().await else { return HashMap::new() };
    v["data"]["legacyModsByDomain"]["nodes"]
        .as_array()
        .map(|a| a.iter().filter_map(|n| Some((n["modId"].as_u64()?, n["thumbnailUrl"].as_str()?.to_string()))).collect())
        .unwrap_or_default()
}

/// Nexus'ta adı birebir aynı olan en popüler mod (yanlış logo göstermemek için yalnızca tam eşleşme).
async fn nexus_by_name(http: &Http, name: &str) -> Option<String> {
    let page = nexus::search(http, NEXUS, name, "downloads", 0, 6, false).await.ok()?;
    let want = name.trim().to_lowercase();
    page.mods.into_iter().find(|m| m.name.trim().to_lowercase() == want).and_then(|m| m.thumbnail_url)
}

pub struct ImageCache {
    index: PathBuf,
    lock: tokio::sync::Mutex<()>,
}

impl ImageCache {
    pub fn new(local_dir: &Path) -> Self {
        ImageCache { index: local_dir.join("images.json"), lock: tokio::sync::Mutex::new(()) }
    }

    /// Modül anahtarı (küçük harfli Id) → görsel adresi.
    pub async fn resolve(&self, http: &Http, catalog: &Catalog, installs: &HashMap<String, InstallRecord>, refresh: bool) -> HashMap<String, String> {
        // Aynı anda iki sayfa isterse ağ isteklerini ikinci kez yapma.
        let _g = self.lock.lock().await;
        let mut index: Index = fsx::read_json(&self.index);
        let now = fsx::now_ts();
        let mut result = HashMap::new();

        // Workshop kimliği: kendi kopyası ya da gölgede kalan Workshop kopyası.
        let mut workshop: HashMap<String, String> = HashMap::new();
        for m in catalog.effective.iter().chain(catalog.shadowed.iter()) {
            if let Some(w) = &m.workshop_id {
                workshop.entry(m.key()).or_insert_with(|| w.clone());
            }
        }

        let mut pending: Vec<&ModuleInfo> = Vec::new();
        for m in catalog.effective.iter().filter(|m| !m.is_official) {
            let key = m.key();
            match index.entries.get(&key) {
                Some(Entry { url: Some(u), checked }) if !refresh && now - checked < REFRESH_AFTER && steam::media_url_ok(http, u) => {
                    result.insert(key, u.clone());
                }
                Some(Entry { url: None, checked }) if !refresh && now - checked < RETRY_AFTER => {}
                _ => pending.push(m),
            }
        }
        if pending.is_empty() {
            return result;
        }

        // 1) Steam önizlemeleri (tek istek).
        let ws_ids: Vec<String> = pending.iter().filter_map(|m| workshop.get(&m.key()).cloned()).collect();
        let mut steam_preview: HashMap<String, String> = HashMap::new();
        if !ws_ids.is_empty() {
            if let Ok(details) = steam::details(http, &ws_ids).await {
                for d in details {
                    if let (Some(id), Some(p)) = (d["publishedfileid"].as_str(), d["preview_url"].as_str()) {
                        steam_preview.insert(id.to_string(), p.to_string());
                    }
                }
            }
        }

        // 2) Nexus küçük resimleri (tek istek).
        let nexus_id_of = |m: &ModuleInfo| -> Option<u64> {
            if let Some(InstallSource::Nexus { mod_id, .. }) = installs.get(&m.key()).map(|r| &r.source) {
                return Some(*mod_id);
            }
            m.update_sources.iter().find(|s| s.provider == "nexus").and_then(|s| s.value.parse().ok())
        };
        let nexus_ids: Vec<u64> = pending
            .iter()
            .filter(|m| workshop.get(&m.key()).and_then(|w| steam_preview.get(w)).is_none())
            .filter_map(|m| nexus_id_of(m))
            .collect::<HashSet<_>>()
            .into_iter()
            .collect();
        let nexus_map = nexus_thumbs(http, &nexus_ids).await;

        let mut found: Vec<(String, Option<String>)> = Vec::new();
        let mut by_name: Vec<(String, String)> = Vec::new();
        for m in &pending {
            let key = m.key();
            if let Some(p) = workshop.get(&key).and_then(|w| steam_preview.get(w)) {
                found.push((key, Some(steam_thumb(p))));
            } else if let Some(t) = nexus_id_of(m).and_then(|id| nexus_map.get(&id)) {
                found.push((key, Some(t.clone())));
            } else {
                by_name.push((key, m.name.clone()));
            }
        }

        // 3) Kaynağı bilinmeyenler: Nexus'ta birebir ad.
        let named: Vec<(String, Option<String>)> =
            stream::iter(by_name).map(|(key, name)| async move { (key, nexus_by_name(http, &name).await) }).buffer_unordered(3).collect().await;
        found.extend(named);

        for (key, url) in found {
            let url = url.filter(|u| steam::media_url_ok(http, u));
            if let Some(u) = &url {
                result.insert(key.clone(), u.clone());
            }
            index.entries.insert(key, Entry { url, checked: now });
        }
        let _ = fsx::write_json(&self.index, &index);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steam_thumbs_keep_query() {
        assert!(steam_thumb("https://images.steamusercontent.com/ugc/1/2/").ends_with("/?imw=256&imh=256&ima=fit&impolicy=Letterbox&imcolor=%23000000&letterbox=false"));
        assert!(steam_thumb("https://x/y?a=1").starts_with("https://x/y?a=1&imw=256"));
    }
}
