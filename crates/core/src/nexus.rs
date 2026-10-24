//! Nexus Mods: arama ve dosya bilgisi için açık GraphQL (v2), indirme bağlantısı için kişisel
//! API anahtarıyla v1. Ücretsiz üyelerde indirme, sitedeki "Mod Manager Download" düğmesinin
//! ürettiği `nxm://` bağlantısıyla yapılır (Nexus'un izin verdiği yol).
//!
//! Tüm oyunlar tek anahtarı paylaşır; oyun `NexusGame` (alan adı + sayısal kimlik) ile seçilir.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use url::Url;

use crate::error::{AppError, AppResult};
use crate::http::Http;

const V1: &str = "https://api.nexusmods.com/v1";
const GQL: &str = "https://api.nexusmods.com/v2/graphql";
const APP_NAME: &str = "Modstead";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Nexus'taki oyun: `domain` adreslerde, `id` GraphQL sorgularında kullanılır.
#[derive(Clone, Copy, Debug, Serialize)]
pub struct NexusGame {
    pub domain: &'static str,
    pub id: u32,
}

/// `https://www.nexusmods.com/<domain>/mods/2006?tab=files` → 2006
pub fn mod_id_from_url(game: NexusGame, input: &str) -> Option<u64> {
    let url = Url::parse(input.trim()).ok()?;
    let host = url.host_str()?.to_ascii_lowercase();
    if host != "www.nexusmods.com" && host != "nexusmods.com" {
        return None;
    }
    let segs: Vec<&str> = url.path_segments()?.filter(|s| !s.is_empty()).collect();
    match segs.as_slice() {
        [domain, "mods", id, ..] if domain.eq_ignore_ascii_case(game.domain) => id.parse().ok(),
        _ => None,
    }
}

pub fn mod_url(game: NexusGame, mod_id: u64) -> String {
    format!("https://www.nexusmods.com/{}/mods/{mod_id}", game.domain)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NexusUser {
    pub name: String,
    pub is_premium: bool,
    pub is_supporter: bool,
    pub profile_url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RateLimit {
    pub hourly_remaining: Option<u32>,
    pub daily_remaining: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NexusMod {
    pub mod_id: u64,
    pub name: String,
    pub summary: String,
    pub version: String,
    pub author: String,
    pub picture_url: Option<String>,
    pub thumbnail_url: Option<String>,
    pub endorsements: u64,
    pub downloads: u64,
    pub updated_at: String,
    pub adult: bool,
    pub status: String,
    pub url: String,
    /// Nexus kategorisinin adı (ör. "Gameplay Mechanics"); bilinmiyorsa boş.
    pub category: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Requirement {
    pub mod_id: Option<u64>,
    pub name: String,
    pub external: bool,
    pub url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NexusModDetail {
    #[serde(flatten)]
    pub info: NexusMod,
    pub requirements: Vec<Requirement>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NexusFile {
    pub file_id: u64,
    pub name: String,
    pub version: String,
    pub category: String,
    pub size: u64,
    pub file_name: String,
    pub date: i64,
    pub primary: bool,
    /// Nexus'un kendi virüs taraması: VERIFIED, UNSCANNED, SUSPICIOUS…
    pub scan: String,
    pub description: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub total: u64,
    pub mods: Vec<NexusMod>,
}

#[derive(Clone, Debug)]
pub struct HashMatch {
    pub mod_id: u64,
    pub file_id: u64,
    pub size: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NxmLink {
    /// Oyunun Nexus alan adı (bağlantının hangi oyuna ait olduğunu söyler).
    pub domain: String,
    pub mod_id: u64,
    pub file_id: u64,
    #[serde(skip)]
    pub key: String,
    pub expires: u64,
}

/// Nexus'un dosya taraması kötü sonuç verdiyse.
pub fn scan_is_bad(scan: &str) -> bool {
    let s = scan.to_ascii_uppercase();
    ["INFECT", "MALIC", "SUSPIC", "QUARANT", "VIRUS", "THREAT"].iter().any(|k| s.contains(k))
}

fn num(v: &Value) -> u64 {
    match v {
        Value::Number(n) => n.as_u64().unwrap_or(0),
        Value::String(s) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

fn s(v: &Value) -> String {
    v.as_str().unwrap_or("").to_string()
}

fn opt_s(v: &Value) -> Option<String> {
    v.as_str().filter(|x| !x.is_empty()).map(|x| x.to_string())
}

const MOD_FIELDS: &str = "modId name summary version author pictureUrl thumbnailUrl endorsements downloads updatedAt adultContent status category uploader { name }";

fn parse_mod(game: NexusGame, v: &Value) -> NexusMod {
    let mod_id = num(&v["modId"]);
    let author = opt_s(&v["author"]).or_else(|| opt_s(&v["uploader"]["name"])).unwrap_or_default();
    NexusMod {
        mod_id,
        name: s(&v["name"]),
        summary: s(&v["summary"]),
        version: s(&v["version"]),
        author,
        picture_url: opt_s(&v["pictureUrl"]),
        thumbnail_url: opt_s(&v["thumbnailUrl"]),
        endorsements: num(&v["endorsements"]),
        downloads: num(&v["downloads"]),
        updated_at: s(&v["updatedAt"]),
        adult: v["adultContent"].as_bool().unwrap_or(false),
        status: s(&v["status"]),
        url: mod_url(game, mod_id),
        category: s(&v["category"]),
    }
}

async fn gql(http: &Http, query: &str, variables: Value) -> AppResult<Value> {
    let resp = http
        .client
        .post(GQL)
        .header("Application-Name", APP_NAME)
        .header("Application-Version", APP_VERSION)
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await?;
    let status = resp.status();
    let body: Value = resp.json().await?;
    if let Some(errs) = body["errors"].as_array() {
        if !errs.is_empty() {
            let msg = errs.iter().filter_map(|e| e["message"].as_str()).collect::<Vec<_>>().join("; ");
            return Err(AppError::Nexus(msg));
        }
    }
    if !status.is_success() {
        return Err(AppError::Nexus(tr!(format!("sunucu {status} döndürdü"), format!("server returned {status}"))));
    }
    Ok(body["data"].clone())
}

pub async fn search(http: &Http, game: NexusGame, query: &str, sort: &str, offset: u32, count: u32, include_adult: bool) -> AppResult<SearchPage> {
    search_with(http, game, &SearchOptions { query, sort, category: None, offset, count, include_adult }).await
}

/// `search`'ün seçenekli hali: kategori (Nexus'taki adıyla, ör. "Portraits") ile daraltılabilir.
#[derive(Clone, Copy, Debug)]
pub struct SearchOptions<'a> {
    pub query: &'a str,
    /// downloads (varsayılan) | updated | endorsements | new
    pub sort: &'a str,
    pub category: Option<&'a str>,
    pub offset: u32,
    pub count: u32,
    pub include_adult: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCount {
    pub name: String,
    pub count: u64,
}

fn game_filter(game: NexusGame, include_adult: bool) -> Value {
    let mut filter = json!({ "gameDomainName": [{ "value": game.domain, "op": "EQUALS" }] });
    if !include_adult {
        filter["adultContent"] = json!([{ "value": false, "op": "EQUALS" }]);
    }
    filter
}

/// Oyunun mod kategorileri ve her birindeki mod sayısı (çoktan aza).
pub async fn category_counts(http: &Http, game: NexusGame, include_adult: bool) -> AppResult<Vec<CategoryCount>> {
    let query_text = "query($f: ModsFilter) { mods(filter: $f, facets: { categoryName: [] }, count: 1) { facetsData } }";
    let data = gql(http, query_text, json!({ "f": game_filter(game, include_adult) })).await?;
    let mut out: Vec<CategoryCount> = data["mods"]["facetsData"]["categoryName"]
        .as_object()
        .map(|o| o.iter().map(|(name, n)| CategoryCount { name: name.clone(), count: num(n) }).filter(|c| !c.name.is_empty()).collect())
        .unwrap_or_default();
    out.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));
    Ok(out)
}

pub async fn search_with(http: &Http, game: NexusGame, opts: &SearchOptions<'_>) -> AppResult<SearchPage> {
    let SearchOptions { query, sort, category, offset, count, include_adult } = *opts;
    let mut filter = game_filter(game, include_adult);
    if let Some(c) = category.map(str::trim).filter(|c| !c.is_empty()) {
        filter["categoryName"] = json!([{ "value": c, "op": "EQUALS" }]);
    }
    let q = query.trim();
    if !q.is_empty() {
        // Tam metin (kök) eşleşmesi VEYA ad öneki: "harmony" asıl Harmony'yi, "diplo" Diplomacy'yi bulur.
        filter["filter"] = json!([{
            "op": "OR",
            "nameStemmed": [{ "value": q, "op": "MATCHES" }],
            "name": [{ "value": q, "op": "WILDCARD" }]
        }]);
    }
    // Nexus'un "relevance" sıralaması çevirileri öne çıkarıyor; indirme sayısı asıl modları öne alır.
    let sort_field = match sort {
        "updated" => "updatedAt",
        "endorsements" => "endorsements",
        "new" => "createdAt",
        _ => "downloads",
    };
    let sort_val = json!([{ sort_field: { "direction": "DESC" } }]);
    let query_text = format!(
        "query($f: ModsFilter, $s: [ModsSort!], $o: Int, $c: Int) {{ mods(filter: $f, sort: $s, offset: $o, count: $c) {{ totalCount nodes {{ {MOD_FIELDS} }} }} }}"
    );
    let data = gql(http, &query_text, json!({ "f": filter, "s": sort_val, "o": offset, "c": count.clamp(1, 50) })).await?;
    let mods = data["mods"]["nodes"].as_array().map(|a| a.iter().map(|m| parse_mod(game, m)).collect()).unwrap_or_default();
    Ok(SearchPage { total: num(&data["mods"]["totalCount"]), mods })
}

pub async fn get_mod(http: &Http, game: NexusGame, mod_id: u64) -> AppResult<NexusModDetail> {
    let query_text = format!(
        "query($m: ID!, $g: ID!) {{ mod(modId: $m, gameId: $g) {{ {MOD_FIELDS} modRequirements {{ nexusRequirements {{ nodes {{ modId modName externalRequirement url gameId }} }} }} }} }}"
    );
    let data = gql(http, &query_text, json!({ "m": mod_id.to_string(), "g": game.id.to_string() })).await?;
    let m = &data["mod"];
    if m.is_null() {
        return Err(AppError::NotFound(format!("Nexus mod #{mod_id}")));
    }
    let requirements = m["modRequirements"]["nexusRequirements"]["nodes"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|r| {
                    let same_game = num(&r["gameId"]) == game.id as u64 || r["gameId"].is_null();
                    Requirement {
                        mod_id: if same_game { Some(num(&r["modId"])).filter(|x| *x > 0) } else { None },
                        name: s(&r["modName"]),
                        external: r["externalRequirement"].as_bool().unwrap_or(false),
                        url: opt_s(&r["url"]),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(NexusModDetail { info: parse_mod(game, m), requirements })
}

pub async fn files(http: &Http, game: NexusGame, mod_id: u64) -> AppResult<Vec<NexusFile>> {
    let query_text = "query($m: ID!, $g: ID!) { modFiles(modId: $m, gameId: $g) { fileId name version category sizeInBytes uri date primary scannedV2 description } }";
    let data = gql(http, query_text, json!({ "m": mod_id.to_string(), "g": game.id.to_string() })).await?;
    let mut out: Vec<NexusFile> = data["modFiles"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|f| NexusFile {
                    file_id: num(&f["fileId"]),
                    name: s(&f["name"]),
                    version: s(&f["version"]),
                    category: s(&f["category"]),
                    size: num(&f["sizeInBytes"]),
                    file_name: s(&f["uri"]),
                    date: num(&f["date"]) as i64,
                    primary: num(&f["primary"]) == 1 || f["primary"].as_bool().unwrap_or(false),
                    scan: s(&f["scannedV2"]),
                    description: s(&f["description"]),
                })
                .filter(|f| !matches!(f.category.as_str(), "REMOVED" | "ARCHIVED"))
                .collect()
        })
        .unwrap_or_default();
    let rank = |c: &str| match c {
        "MAIN" => 0,
        "UPDATE" => 1,
        "OPTIONAL" => 2,
        "MISCELLANEOUS" => 3,
        _ => 4,
    };
    out.sort_by(|a, b| rank(&a.category).cmp(&rank(&b.category)).then(b.date.cmp(&a.date)));
    Ok(out)
}

/// İndirilen dosyanın MD5'ini Nexus'un kayıtlarıyla eşler.
/// Not: sonuçlar oyuna göre ayrılmaz; Nexus indirmelerinde beklenen mod/dosya kimliğiyle karşılaştırılır.
pub async fn verify_md5(http: &Http, md5: &str) -> AppResult<Vec<HashMatch>> {
    let query_text = "query($h: [String!]!) { fileHashes(md5s: $h) { md5 fileSize modFile { fileId modId } } }";
    let data = gql(http, query_text, json!({ "h": [md5] })).await?;
    Ok(data["fileHashes"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(|h| HashMatch {
                    mod_id: num(&h["modFile"]["modId"]),
                    file_id: num(&h["modFile"]["fileId"]),
                    size: h["fileSize"].as_u64().or_else(|| h["fileSize"].as_str().and_then(|x| x.parse().ok())),
                })
                .collect()
        })
        .unwrap_or_default())
}

fn rate_limit(resp: &reqwest::Response) -> RateLimit {
    let h = |name: &str| resp.headers().get(name).and_then(|v| v.to_str().ok()).and_then(|v| v.parse().ok());
    RateLimit { hourly_remaining: h("x-rl-hourly-remaining"), daily_remaining: h("x-rl-daily-remaining") }
}

async fn v1_get(http: &Http, key: &str, url: &str) -> AppResult<(Value, RateLimit)> {
    let resp = http
        .client
        .get(url)
        .header("apikey", key)
        .header("Application-Name", APP_NAME)
        .header("Application-Version", APP_VERSION)
        .header("Accept", "application/json")
        .send()
        .await?;
    let rl = rate_limit(&resp);
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    if status.is_success() {
        return Ok((body, rl));
    }
    let message = body["message"].as_str().unwrap_or("").to_string();
    Err(match status.as_u16() {
        401 => AppError::Nexus(tr!("API anahtarı geçersiz ya da iptal edilmiş", "the API key is invalid or revoked").into()),
        403 => AppError::Nexus(if message.is_empty() {
            tr!(
                "bu işlem için Nexus Premium gerekiyor; sitedeki \"Mod Manager Download\" düğmesini kullanın",
                "this requires Nexus Premium; use the \"Mod Manager Download\" button on the site"
            )
            .into()
        } else {
            format!("{}: {message}", tr!("erişim reddedildi", "access denied"))
        }),
        404 => AppError::Nexus(tr!("dosya bulunamadı ya da kaldırılmış", "file not found or removed").into()),
        410 => AppError::Nexus(tr!("indirme bağlantısının süresi dolmuş; Nexus'ta düğmeye yeniden basın", "the download link has expired; press the button on Nexus again").into()),
        429 => AppError::Nexus(tr!("Nexus istek sınırı doldu; biraz sonra yeniden deneyin", "Nexus rate limit reached; try again later").into()),
        _ => AppError::Nexus(format!("{status}: {message}")),
    })
}

pub async fn validate_key(http: &Http, key: &str) -> AppResult<(NexusUser, RateLimit)> {
    let (v, rl) = v1_get(http, key, &format!("{V1}/users/validate.json")).await?;
    Ok((
        NexusUser {
            name: s(&v["name"]),
            is_premium: v["is_premium"].as_bool().unwrap_or(false),
            is_supporter: v["is_supporter"].as_bool().unwrap_or(false),
            profile_url: opt_s(&v["profile_url"]),
        },
        rl,
    ))
}

/// Dosyanın CDN bağlantısı. Premium değilse `nxm` anahtarı gerekir.
pub async fn download_link(http: &Http, key: &str, game: NexusGame, mod_id: u64, file_id: u64, nxm: Option<&NxmLink>) -> AppResult<Url> {
    let mut url = format!("{V1}/games/{}/mods/{mod_id}/files/{file_id}/download_link.json", game.domain);
    if let Some(n) = nxm {
        url.push_str(&format!("?key={}&expires={}", n.key, n.expires));
    }
    let (v, _) = v1_get(http, key, &url).await?;
    let first = v
        .as_array()
        .and_then(|a| a.first())
        .and_then(|x| x["URI"].as_str())
        .ok_or_else(|| AppError::Nexus(tr!("indirme bağlantısı alınamadı", "could not get a download link").into()))?;
    http.ensure_allowed(first)
}

/// `nxm://<domain>/mods/2006/files/12345?key=…&expires=…&user_id=…`
/// Alan adı doğrulanmaz; bağlantıyı hangi oyunun karşılayacağına çağıran karar verir.
pub fn parse_nxm(raw: &str) -> AppResult<NxmLink> {
    let url = Url::parse(raw.trim()).map_err(|_| AppError::security(tr!("geçersiz nxm bağlantısı", "invalid nxm link")))?;
    if url.scheme() != "nxm" {
        return Err(AppError::security(tr!("nxm bağlantısı bekleniyordu", "expected an nxm link")));
    }
    let domain = url
        .host_str()
        .map(|h| h.to_ascii_lowercase())
        .filter(|h| !h.is_empty() && h.len() <= 64 && h.chars().all(|c| c.is_ascii_alphanumeric()))
        .ok_or_else(|| AppError::security(tr!("nxm bağlantısında oyun yok", "the nxm link has no game")))?;
    let segs: Vec<&str> = url.path_segments().map(|s| s.filter(|x| !x.is_empty()).collect()).unwrap_or_default();
    let (mod_id, file_id) = match segs.as_slice() {
        ["mods", m, "files", f] => (
            m.parse::<u64>().map_err(|_| AppError::security(tr!("geçersiz mod numarası", "invalid mod id")))?,
            f.parse::<u64>().map_err(|_| AppError::security(tr!("geçersiz dosya numarası", "invalid file id")))?,
        ),
        _ => {
            return Err(AppError::msg(tr!(
                "desteklenmeyen nxm bağlantısı (koleksiyonlar desteklenmiyor)",
                "unsupported nxm link (collections are not supported)"
            )));
        }
    };
    let mut key = None;
    let mut expires = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "key" => key = Some(v.into_owned()),
            "expires" => expires = v.parse::<u64>().ok(),
            _ => {}
        }
    }
    let key = key
        .filter(|k| !k.is_empty() && k.len() <= 128 && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
        .ok_or_else(|| AppError::security(tr!("nxm anahtarı eksik ya da geçersiz", "nxm key missing or invalid")))?;
    let expires = expires.ok_or_else(|| AppError::security(tr!("nxm süresi eksik", "nxm expiry missing")))?;
    if (expires as i64) < chrono::Utc::now().timestamp() {
        return Err(AppError::Nexus(tr!("indirme bağlantısının süresi dolmuş; Nexus'ta düğmeye yeniden basın", "the download link has expired; press the button on Nexus again").into()));
    }
    Ok(NxmLink { domain, mod_id, file_id, key, expires })
}

/// nxm bağlantısının alan adı (geçerlilik denetimi yapmadan; yönlendirme için).
pub fn nxm_domain(raw: &str) -> Option<String> {
    let url = Url::parse(raw.trim()).ok()?;
    (url.scheme() == "nxm").then(|| url.host_str().map(|h| h.to_ascii_lowercase())).flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BANNERLORD: NexusGame = NexusGame { domain: "mountandblade2bannerlord", id: 3174 };

    #[test]
    fn mod_urls() {
        assert_eq!(mod_id_from_url(BANNERLORD, "https://www.nexusmods.com/mountandblade2bannerlord/mods/2006?tab=files"), Some(2006));
        assert_eq!(mod_id_from_url(BANNERLORD, "https://nexusmods.com/mountandblade2bannerlord/mods/612"), Some(612));
        assert_eq!(mod_id_from_url(BANNERLORD, "https://www.nexusmods.com/skyrimspecialedition/mods/1"), None);
        assert_eq!(mod_id_from_url(BANNERLORD, "https://evil.com/mountandblade2bannerlord/mods/1"), None);
    }

    #[test]
    fn nxm_links() {
        let future = chrono::Utc::now().timestamp() + 3600;
        let l = parse_nxm(&format!("nxm://mountandblade2bannerlord/mods/2006/files/123?key=abc_DEF-1&expires={future}&user_id=9")).unwrap();
        assert_eq!((l.domain.as_str(), l.mod_id, l.file_id), ("mountandblade2bannerlord", 2006, 123));
        let s = parse_nxm(&format!("nxm://stardewvalley/mods/1/files/2?key=a&expires={future}")).unwrap();
        assert_eq!(s.domain, "stardewvalley");
        assert!(parse_nxm("nxm://mountandblade2bannerlord/mods/1/files/2?key=a&expires=1").is_err());
        assert!(parse_nxm(&format!("nxm://mountandblade2bannerlord/mods/1/files/2?key=a%26x&expires={future}")).is_err());
        assert!(parse_nxm(&format!("nxm://bad.domain/mods/1/files/2?key=a&expires={future}")).is_err());
        assert_eq!(nxm_domain("nxm://StardewValley/mods/1/files/2").as_deref(), Some("stardewvalley"));
    }

    #[test]
    fn nexus_scan_status() {
        assert!(scan_is_bad("SUSPICIOUS"));
        assert!(!scan_is_bad("VERIFIED"));
    }
}
