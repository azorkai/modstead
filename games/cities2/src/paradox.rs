//! Paradox Mods: oyunun resmî mod platformunun açık katalog API'si (giriş gerekmez).
//!
//! - Arama: `POST https://api.paradox-interactive.com/mods?metadata=yes` (gövde: oyun, işletim sistemi,
//!   sıralama, etiketler, arama metni, sayfa).
//! - Mod sayfası: `GET …/mods?modId=<n>&os=Windows` (açıklama, ekran görüntüleri, bağımlılıklar, sürüm
//!   geçmişi, gereken oyun sürümü).
//!
//! Abonelik ve indirme bilerek yapılmaz: oyun, aboneliği Paradox hesabıyla eşitleyip kendisi indirir.
//! Kurulu modların meta verisi (ad, görsel, uyumluluk, bağımlılıklar) diskte önbelleklenir; çevrimdışıyken
//! kütüphane son bilinen bilgiyle çizilir.

use std::collections::HashMap;

use futures_util::stream::{self, StreamExt};
use modstead_core::http::Http;
use modstead_core::{AppError, AppResult, fsx, tr};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::detect::version_parts;

const API: &str = "https://api.paradox-interactive.com";
pub const GAME_NAME: &str = "cities_skylines_2";
const OS: &str = "Windows";
/// Önbellekteki meta veri bu süreden eskiyse yenilenir.
const META_TTL_SECS: i64 = 12 * 3600;
pub const PAGE_SIZE: u32 = 24;

/// Arayüzde gösterilen etiket süzgeçleri (Paradox Mods'taki adlarıyla).
pub const TAGS: &[&str] = &["Code Mod", "Map", "Savegame", "Prefab", "Building", "Prop", "Vehicle", "Attraction", "Park", "Theme", "Tree"];

pub fn mod_url(mod_id: &str) -> String {
    format!("https://mods.paradoxplaza.com/mods/{mod_id}/{OS}")
}

/// Mod numarası yalnızca rakamdır.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 12 && id.chars().all(|c| c.is_ascii_digit())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PdxRequirement {
    pub mod_id: String,
    pub name: String,
}

/// Bir modun katalogdaki özeti (arama kartı ve kurulu modların meta verisi).
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PdxMeta {
    pub mod_id: String,
    pub name: String,
    pub author: String,
    pub summary: String,
    pub thumbnail: Option<String>,
    /// Yazarın sürüm adı ("1.1.0").
    pub user_version: Option<String>,
    /// Paradox'un sürüm numarası (klasör adındaki sayı); yayımlanan son sürüm.
    pub latest_version: Option<u32>,
    /// Gereken oyun sürümü ("1.6.*").
    pub required_version: Option<String>,
    pub tags: Vec<String>,
    pub requirements: Vec<PdxRequirement>,
    pub rating: Option<f64>,
    pub ratings_total: u64,
    pub subscriptions: u64,
    pub size: Option<u64>,
    pub updated: Option<String>,
    pub url: String,
    pub fetched_at: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PdxSearchPage {
    pub total: u64,
    pub page: u32,
    pub mods: Vec<PdxMeta>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub image: String,
    pub thumbnail: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangelogEntry {
    pub version: String,
    pub released: String,
    pub details: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExternalLink {
    pub url: String,
    pub kind: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PdxModDetail {
    #[serde(flatten)]
    pub meta: PdxMeta,
    pub description: String,
    pub screenshots: Vec<Screenshot>,
    pub changelog: Vec<ChangelogEntry>,
    pub links: Vec<ExternalLink>,
    pub created: Option<String>,
}

fn s(v: &Value, key: &str) -> String {
    match v.get(key) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn opt(v: &Value, key: &str) -> Option<String> {
    Some(s(v, key)).filter(|x| !x.is_empty())
}

fn num(v: &Value, key: &str) -> Option<u64> {
    match v.get(key) {
        Some(Value::Number(n)) => n.as_u64(),
        Some(Value::String(s)) => s.trim().parse().ok(),
        _ => None,
    }
}

/// Görsel adresi yalnızca Paradox'un içerik sunucusundan kabul edilir (CSP de yalnızca onu açar).
fn image_url(raw: Option<String>) -> Option<String> {
    raw.filter(|u| u.starts_with("https://modscontent.paradox-interactive.com/") && u.len() < 600)
}

fn parse_meta(v: &Value) -> PdxMeta {
    let mod_id = s(v, "modId");
    let requirements = v
        .get("requirements")
        .and_then(|r| r.as_array())
        .map(|a| a.iter().filter(|r| s(r, "productType").is_empty() || s(r, "productType") == "MOD").map(|r| PdxRequirement { mod_id: s(r, "id"), name: s(r, "name") }).filter(|r| valid_id(&r.mod_id)).collect())
        .unwrap_or_default();
    PdxMeta {
        url: mod_url(&mod_id),
        name: s(v, "displayName").trim_matches(|c: char| c.is_whitespace()).to_string(),
        author: s(v, "author"),
        summary: s(v, "shortDescription"),
        thumbnail: image_url(opt(v, "displayImagePath")),
        user_version: opt(v, "userModVersion"),
        latest_version: num(v, "latestVersion").or_else(|| num(v, "modVersion")).map(|n| n as u32),
        required_version: opt(v, "requiredVersion"),
        tags: v.get("tags").and_then(|t| t.as_array()).map(|a| a.iter().filter_map(|t| t.as_str()).map(str::to_string).take(16).collect()).unwrap_or_default(),
        requirements,
        rating: v.get("rating").and_then(|r| r.as_f64()),
        ratings_total: num(v, "ratingsTotal").unwrap_or(0),
        subscriptions: num(v, "subscriptions").or_else(|| num(v, "installedCount")).unwrap_or(0),
        size: v.pointer("/metadata/size_in_memory").and_then(|x| x.as_str().and_then(|s| s.parse().ok()).or_else(|| x.as_u64())),
        updated: opt(v, "latestUpdate").or_else(|| opt(v, "updated")),
        fetched_at: fsx::now_ts(),
        mod_id,
    }
}

fn check(body: &Value) -> AppResult<()> {
    if body.get("result").and_then(|r| r.as_str()) == Some("OK") {
        return Ok(());
    }
    let msg = body.get("errorMessage").and_then(|m| m.as_str()).unwrap_or("?");
    Err(AppError::Network(format!("Paradox Mods: {msg}")))
}

async fn get_json(http: &Http, url: &str) -> AppResult<Value> {
    let url = http.ensure_allowed(url)?;
    let resp = http.client.get(url).header("accept", "application/json").send().await?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(tr!(format!("Paradox Mods {status} döndürdü"), format!("Paradox Mods returned {status}"))));
    }
    Ok(resp.json().await?)
}

#[derive(Clone, Debug)]
pub struct SearchOptions<'a> {
    pub query: &'a str,
    /// "best" | "popularity" | "updated" | "created" | "rating"
    pub sort: &'a str,
    pub tag: Option<&'a str>,
    pub page: u32,
}

pub async fn search(http: &Http, o: &SearchOptions<'_>) -> AppResult<PdxSearchPage> {
    let sort = match o.sort {
        "popularity" | "updated" | "created" | "rating" | "best" => o.sort,
        _ => "best",
    };
    let mut body = json!({ "gameName": GAME_NAME, "os": OS, "orderBy": "desc", "sortBy": sort, "page": o.page.min(400), "pageSize": PAGE_SIZE });
    // "best" son zamanların öne çıkanlarıdır (sitedeki varsayılan); diğer sıralamalar zaman almaz.
    if sort == "best" {
        body["time"] = json!("quarter");
    }
    let query: String = o.query.trim().chars().take(100).collect();
    if !query.is_empty() {
        body["searchQuery"] = json!(query);
    }
    if let Some(tag) = o.tag.filter(|t| TAGS.contains(t)) {
        body["tags"] = json!([tag]);
    }
    let url = http.ensure_allowed(&format!("{API}/mods?metadata=yes"))?;
    let resp = http.client.post(url).json(&body).send().await?;
    let status = resp.status();
    let v: Value = resp.json().await.map_err(|e| AppError::Network(format!("Paradox Mods {status}: {e}")))?;
    check(&v)?;
    let mods = v.get("mods").and_then(|m| m.as_array()).map(|a| a.iter().map(parse_meta).filter(|m| valid_id(&m.mod_id)).collect()).unwrap_or_default();
    Ok(PdxSearchPage { total: num(&v, "totalCount").unwrap_or(0), page: o.page, mods })
}

pub async fn detail(http: &Http, mod_id: &str) -> AppResult<PdxModDetail> {
    if !valid_id(mod_id) {
        return Err(AppError::msg(tr!("Geçersiz Paradox Mods numarası.", "Invalid Paradox Mods id.")));
    }
    let v = get_json(http, &format!("{API}/mods?modId={mod_id}&os={OS}")).await?;
    check(&v)?;
    let d = v.get("modDetail").ok_or_else(|| AppError::NotFound(format!("Paradox Mods #{mod_id}")))?;
    let meta = parse_meta(d);
    let screenshots = d
        .get("screenshots")
        .and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| {
                    let image = image_url(opt(x, "image"))?;
                    let thumbnail = image_url(opt(x, "thumbnail")).unwrap_or_else(|| image.clone());
                    Some(Screenshot { image, thumbnail })
                })
                .take(16)
                .collect()
        })
        .unwrap_or_default();
    let mut changelog: Vec<ChangelogEntry> = d
        .get("changelog")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().map(|c| ChangelogEntry { version: s(c, "userModVersion"), released: s(c, "released"), details: s(c, "details").chars().take(4000).collect() }).collect())
        .unwrap_or_default();
    changelog.reverse();
    changelog.truncate(12);
    let mut links: Vec<ExternalLink> = d
        .get("externalLinks")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().filter_map(|l| Some(ExternalLink { url: opt(l, "url").filter(|u| u.starts_with("https://"))?, kind: s(l, "type") })).collect())
        .unwrap_or_default();
    for f in d.get("forumLinks").and_then(|a| a.as_array()).into_iter().flatten().filter_map(|f| f.as_str()) {
        if f.starts_with("https://") {
            links.push(ExternalLink { url: f.to_string(), kind: "forum".into() });
        }
    }
    Ok(PdxModDetail { meta, description: s(d, "longDescription").chars().take(40_000).collect(), screenshots, changelog, links, created: opt(d, "creationDate") })
}

// ───────────── Kurulu modların meta veri önbelleği ─────────────

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
pub struct MetaCache {
    pub items: HashMap<String, PdxMeta>,
}

/// Önbellekte olmayan ya da eskiyen modların meta verisini çeker (en fazla 4 istek aynı anda).
/// Dönüş: güncellenen kayıt sayısı. Tek tek hatalar yutulur (çevrimdışı mod ya da kaldırılmış mod).
pub async fn refresh(http: &Http, cache: &mut MetaCache, ids: &[String], force: bool) -> usize {
    let now = fsx::now_ts();
    let wanted: Vec<String> = ids
        .iter()
        .filter(|id| valid_id(id))
        .filter(|id| force || cache.items.get(*id).is_none_or(|m| now - m.fetched_at > META_TTL_SECS))
        .take(300)
        .cloned()
        .collect();
    let results: Vec<(String, AppResult<PdxModDetail>)> = stream::iter(wanted).map(|id| async move { let r = detail(http, &id).await; (id, r) }).buffer_unordered(4).collect().await;
    let mut n = 0;
    for (id, r) in results {
        match r {
            Ok(d) => {
                cache.items.insert(id, d.meta);
                n += 1;
            }
            Err(e) => log::info!("Paradox Mods #{id} okunamadı: {e}"),
        }
    }
    n
}

// ───────────── Uyumluluk ─────────────

/// Modun istediği oyun sürümü ile kurulu sürüm: "ok" | "outdated" (mod eski oyun sürümü için) |
/// "newer" (mod daha yeni oyun sürümü istiyor) | "unknown".
pub fn compat(required: Option<&str>, game: Option<&str>) -> &'static str {
    let (Some(req), Some(game)) = (required, game) else { return "unknown" };
    let want = version_parts(req.trim());
    let have = version_parts(game);
    if want.is_empty() || have.is_empty() {
        return "unknown";
    }
    // "1.6.*" → [1, 6] öneki; "1.*" → [1].
    let n = want.len().min(have.len());
    match want[..n].cmp(&have[..n]) {
        std::cmp::Ordering::Equal => "ok",
        std::cmp::Ordering::Less => "outdated",
        std::cmp::Ordering::Greater => "newer",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_required_versions() {
        assert_eq!(compat(Some("1.6.*"), Some("1.6.2f1")), "ok");
        assert_eq!(compat(Some("1.*"), Some("1.6.2f1")), "ok");
        assert_eq!(compat(Some("1.5.*"), Some("1.6.2f1")), "outdated");
        assert_eq!(compat(Some("1.1.*"), Some("1.6.2f1")), "outdated");
        assert_eq!(compat(Some("1.7.*"), Some("1.6.2f1")), "newer");
        assert_eq!(compat(None, Some("1.6.2f1")), "unknown");
        assert_eq!(compat(Some("*"), Some("1.6.2f1")), "unknown");
    }

    #[test]
    fn parses_catalog_entries() {
        let v: Value = serde_json::from_str(
            r#"{"author":"Torbi","displayName":"Parking Lot Tool","installedCount":55514,"modId":"161156","modVersion":"14","rating":5,"ratingsTotal":906,
            "requiredVersion":"1.6.*","shortDescription":"Draw a shape","tags":["Code Mod"],"updated":"2026-10-21T20:05:32.000Z",
            "displayImagePath":"https://modscontent.paradox-interactive.com/cities_skylines_2/x/content/cover.jpg","userModVersion":"1.1.0",
            "metadata":{"size_in_memory":"1356618"},
            "requirements":[{"productType":"MOD","id":"74417","name":"Unified Icon Library"},{"productType":"DLC","id":"x","name":"Bridges"}]}"#,
        )
        .unwrap();
        let m = parse_meta(&v);
        assert_eq!(m.mod_id, "161156");
        assert_eq!(m.latest_version, Some(14));
        assert_eq!(m.subscriptions, 55514);
        assert_eq!(m.size, Some(1356618));
        assert_eq!(m.requirements.len(), 1, "DLC bağımlılığı mod değildir");
        assert_eq!(m.url, "https://mods.paradoxplaza.com/mods/161156/Windows");
        let evil: Value = serde_json::from_str(r#"{"modId":"1","displayImagePath":"https://evil.example/x.jpg"}"#).unwrap();
        assert_eq!(parse_meta(&evil).thumbnail, None, "görsel yalnızca Paradox içerik sunucusundan");
    }

    /// Gerçek API ile salt okunur deneme: `cargo test -p game-cities2 real_pdx -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_pdx() {
        let http = Http::new(modstead_core::http::HttpPolicy::core().with(&crate::INFO.hosts), "Modstead-test");
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let page = search(&http, &SearchOptions { query: "", sort: "popularity", tag: Some("Code Mod"), page: 0 }).await.unwrap();
            println!("{} kod modu; ilk: {:?}", page.total, page.mods.iter().take(3).map(|m| &m.name).collect::<Vec<_>>());
            let d = detail(&http, "161156").await.unwrap();
            println!("{} · {:?} · bağımlılıklar {:?}", d.meta.name, d.meta.required_version, d.meta.requirements.iter().map(|r| &r.name).collect::<Vec<_>>());
        });
    }
}
