//! Steam Workshop. Steam, Workshop dosyalarını yalnızca kendi istemcisiyle (ve oyunun sahibi olan
//! hesapla) indirmeye izin verir; Modstead parola istemez. Meta veri anahtarsız Steam Web API'den
//! okunur, abonelik Steam istemcisinde açılır, indirilen öğe Workshop klasöründen algılanır.

use std::collections::HashMap;
use std::path::Path;

use modstead_core::http::Http;
use modstead_core::{AppError, AppResult, tr};
use serde::Serialize;
use serde_json::Value;

pub const APP_ID: u64 = crate::detect::STEAM_APP_ID as u64;
const DETAILS: &str = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const COLLECTION: &str = "https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/";

fn valid_id(s: &str) -> bool {
    (6..=20).contains(&s.len()) && s.chars().all(|c| c.is_ascii_digit())
}

/// `https://host/yol?sorgu` → (küçük harfli sunucu, yol, sorgu). Kullanıcı bilgisi ya da port içeren
/// adresler reddedilir (`https://steamcommunity.com@evil.com/` gibi hileler).
fn split_https(raw: &str) -> Option<(String, &str, &str)> {
    let rest = raw.trim().strip_prefix("https://")?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let host = &rest[..end];
    if host.is_empty() || host.contains(['@', ':', '\\']) {
        return None;
    }
    let tail = rest[end..].split('#').next().unwrap_or("");
    let (path, query) = tail.split_once('?').unwrap_or((tail, ""));
    Some((host.to_ascii_lowercase(), path, query))
}

/// Workshop öğe/koleksiyon bağlantısı ya da numarası → kimlik.
pub fn workshop_id_from_input(input: &str) -> Option<String> {
    let t = input.trim();
    if valid_id(t) {
        return Some(t.to_string());
    }
    let (host, path, query) = split_https(t)?;
    if host != "steamcommunity.com" && host != "www.steamcommunity.com" {
        return None;
    }
    let path = path.to_ascii_lowercase();
    if !(path.contains("/sharedfiles/filedetails") || path.contains("/workshop/filedetails")) {
        return None;
    }
    query.split('&').find_map(|kv| kv.strip_prefix("id=")).map(str::to_string).filter(|v| valid_id(v))
}

/// Görsel adresi izinli bir görsel sunucusunda mı (HTTPS, varsayılan port)?
pub fn media_url_ok(http: &Http, raw: &str) -> bool {
    split_https(raw).is_some_and(|(host, _, _)| http.policy().media.allows_host(&host))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkshopItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub preview_url: Option<String>,
    pub file_size: u64,
    pub time_created: i64,
    pub time_updated: i64,
    pub subscriptions: u64,
    pub favorited: u64,
    pub tags: Vec<String>,
    pub url: String,
    pub installed: bool,
    pub installed_module_id: Option<String>,
    pub local_time_updated: Option<i64>,
    pub needs_update: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInfo {
    pub id: String,
    pub title: String,
    pub preview_url: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SteamLookup {
    pub collection: Option<CollectionInfo>,
    pub items: Vec<WorkshopItem>,
}

fn num(v: &Value) -> u64 {
    match v {
        Value::Number(n) => n.as_u64().unwrap_or(0),
        Value::String(s) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

/// Form gövdesi. Kimlikler yalnızca rakamdır (`valid_id`), köşeli parantezler kodlanır.
fn form(kind: &str, ids: &[String]) -> String {
    let mut parts = vec![format!("{kind}={}", ids.len())];
    for (i, id) in ids.iter().enumerate().filter(|(_, id)| id.chars().all(|c| c.is_ascii_digit())) {
        parts.push(format!("publishedfileids%5B{i}%5D={id}"));
    }
    parts.join("&")
}

async fn post(http: &Http, url: &str, body: String) -> AppResult<Value> {
    let resp = http
        .media
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("Steam {}", resp.status())));
    }
    Ok(resp.json().await?)
}

/// BBCode ve HTML etiketlerini atıp kısaltır.
fn plain(text: &str, max: usize) -> String {
    let mut out = String::with_capacity(text.len().min(max + 8));
    let mut depth = 0i32;
    for c in text.chars() {
        match c {
            '[' | '<' => depth += 1,
            ']' | '>' if depth > 0 => depth -= 1,
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    let collapsed: String = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() > max {
        format!("{}…", collapsed.chars().take(max).collect::<String>())
    } else {
        collapsed
    }
}

/// Ham ayrıntılar (en fazla 100 öğe). Bannerlord'a ait olmayan ya da silinmiş öğeler atlanır.
pub async fn details(http: &Http, ids: &[String]) -> AppResult<Vec<Value>> {
    let mut out = Vec::new();
    for chunk in ids.chunks(100) {
        let v = post(http, DETAILS, form("itemcount", chunk)).await?;
        if let Some(arr) = v["response"]["publishedfiledetails"].as_array() {
            out.extend(
                arr.iter()
                    .filter(|d| num(&d["result"]) == 1 && num(&d["consumer_app_id"]) == APP_ID)
                    .cloned(),
            );
        }
    }
    Ok(out)
}

/// Koleksiyonun çocukları; kimlik bir koleksiyon değilse `None`.
async fn collection_children(http: &Http, id: &str) -> AppResult<Option<Vec<String>>> {
    let v = post(http, COLLECTION, form("collectioncount", &[id.to_string()])).await?;
    let c = &v["response"]["collectiondetails"][0];
    if num(&c["result"]) != 1 {
        return Ok(None);
    }
    let children: Vec<String> = c["children"]
        .as_array()
        .map(|a| {
            let mut kids: Vec<(u64, String)> = a
                .iter()
                .filter(|x| num(&x["filetype"]) == 0)
                .filter_map(|x| x["publishedfileid"].as_str().map(|s| (num(&x["sortorder"]), s.to_string())))
                .filter(|(_, s)| valid_id(s))
                .collect();
            kids.sort_by_key(|(o, _)| *o);
            kids.into_iter().map(|(_, s)| s).take(300).collect()
        })
        .unwrap_or_default();
    Ok(if children.is_empty() { None } else { Some(children) })
}

/// Yerel Workshop durumu (`steamapps/workshop/appworkshop_261550.acf`): öğe → indirilen sürümün zamanı.
pub fn local_state(workshop_content_dir: Option<&str>) -> HashMap<String, i64> {
    let Some(dir) = workshop_content_dir else { return HashMap::new() };
    let Some(workshop) = Path::new(dir).parent().and_then(|p| p.parent()) else { return HashMap::new() };
    let Ok(text) = std::fs::read_to_string(workshop.join(format!("appworkshop_{APP_ID}.acf"))) else {
        return HashMap::new();
    };
    // Basit VDF okuyucu: "WorkshopItemsInstalled" { "<id>" { "timeupdated" "<t>" … } }
    let tokens: Vec<String> = tokenize(&text);
    let mut out = HashMap::new();
    let mut i = 0;
    while i < tokens.len() {
        if tokens[i] == "WorkshopItemsInstalled" {
            let mut depth = 0;
            let mut current: Option<String> = None;
            i += 1;
            while i < tokens.len() {
                match tokens[i].as_str() {
                    "{" => depth += 1,
                    "}" => {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                        if depth == 1 {
                            current = None;
                        }
                    }
                    t if depth == 1 && valid_id(t) => current = Some(t.to_string()),
                    "timeupdated" if depth == 2 => {
                        if let (Some(id), Some(v)) = (&current, tokens.get(i + 1)) {
                            out.insert(id.clone(), v.parse().unwrap_or(0));
                        }
                        i += 1;
                    }
                    _ => {}
                }
                i += 1;
            }
        }
        i += 1;
    }
    out
}

fn tokenize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                let mut s = String::new();
                while let Some(n) = chars.next() {
                    match n {
                        '\\' => {
                            if let Some(e) = chars.next() {
                                s.push(e);
                            }
                        }
                        '"' => break,
                        _ => s.push(n),
                    }
                }
                out.push(s);
            }
            '{' | '}' => out.push(c.to_string()),
            _ => {}
        }
    }
    out
}

fn to_item(http: &Http, d: &Value, local: &HashMap<String, i64>, installed_modules: &HashMap<String, String>) -> WorkshopItem {
    let id = d["publishedfileid"].as_str().unwrap_or("").to_string();
    let time_updated = num(&d["time_updated"]) as i64;
    let local_time = local.get(&id).copied();
    let installed = installed_modules.contains_key(&id) || local_time.is_some();
    WorkshopItem {
        title: d["title"].as_str().unwrap_or("").to_string(),
        description: plain(d["description"].as_str().unwrap_or(""), 600),
        preview_url: d["preview_url"].as_str().filter(|u| media_url_ok(http, u)).map(|s| s.to_string()),
        file_size: num(&d["file_size"]),
        time_created: num(&d["time_created"]) as i64,
        time_updated,
        subscriptions: num(&d["lifetime_subscriptions"]).max(num(&d["subscriptions"])),
        favorited: num(&d["lifetime_favorited"]).max(num(&d["favorited"])),
        tags: d["tags"]
            .as_array()
            .map(|a| a.iter().filter_map(|t| t["tag"].as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default(),
        url: format!("https://steamcommunity.com/sharedfiles/filedetails/?id={id}"),
        installed,
        installed_module_id: installed_modules.get(&id).cloned(),
        local_time_updated: local_time,
        needs_update: local_time.is_some_and(|t| time_updated > t),
        id,
    }
}

/// Bağlantı/numara için öğe ya da koleksiyon bilgisi.
pub async fn lookup(
    http: &Http,
    input: &str,
    workshop_dir: Option<&str>,
    installed_modules: &HashMap<String, String>,
) -> AppResult<SteamLookup> {
    let id = workshop_id_from_input(input).ok_or_else(|| {
        AppError::msg(tr!(
            "bu bir Steam Workshop bağlantısı ya da numarası değil",
            "this is not a Steam Workshop link or id"
        ))
    })?;
    let local = local_state(workshop_dir);
    if let Some(children) = collection_children(http, &id).await? {
        let head = details(http, std::slice::from_ref(&id)).await?;
        let raw = details(http, &children).await?;
        let collection = head.first().map(|d| CollectionInfo {
            id: id.clone(),
            title: d["title"].as_str().unwrap_or("").to_string(),
            preview_url: d["preview_url"].as_str().filter(|u| media_url_ok(http, u)).map(|s| s.to_string()),
        });
        return Ok(SteamLookup {
            collection: collection.or(Some(CollectionInfo { id, title: String::new(), preview_url: None })),
            items: raw.iter().map(|d| to_item(http, d, &local, installed_modules)).collect(),
        });
    }
    let raw = details(http, std::slice::from_ref(&id)).await?;
    if raw.is_empty() {
        return Err(AppError::NotFound(tr!(
            "Bannerlord için böyle bir Workshop öğesi yok (silinmiş, gizli ya da başka bir oyuna ait olabilir)",
            "no such Bannerlord Workshop item (it may be deleted, private or for another game)"
        )
        .into()));
    }
    Ok(SteamLookup { collection: None, items: raw.iter().map(|d| to_item(http, d, &local, installed_modules)).collect() })
}

/// Steam istemcisinde açılacak adres. Yalnızca bu üç biçim üretilir.
pub fn client_url(target: &str, id: Option<&str>) -> AppResult<String> {
    match target {
        "item" => {
            let id = id.filter(|i| valid_id(i)).ok_or_else(|| AppError::security(tr!("geçersiz Workshop numarası", "invalid Workshop id")))?;
            Ok(format!("steam://url/CommunityFilePage/{id}"))
        }
        "workshop" => Ok(format!("steam://url/SteamWorkshopPage/{APP_ID}")),
        "downloads" => Ok("steam://open/downloads".to_string()),
        _ => Err(AppError::msg(tr!("bilinmeyen Steam hedefi", "unknown Steam target"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_inputs() {
        assert_eq!(workshop_id_from_input("2859188632").as_deref(), Some("2859188632"));
        assert_eq!(
            workshop_id_from_input("https://steamcommunity.com/sharedfiles/filedetails/?id=2859188632&searchtext=").as_deref(),
            Some("2859188632")
        );
        assert_eq!(
            workshop_id_from_input("https://steamcommunity.com/workshop/filedetails/?id=123456789").as_deref(),
            Some("123456789")
        );
        assert_eq!(workshop_id_from_input("https://evil.com/sharedfiles/filedetails/?id=123456789"), None);
        assert_eq!(workshop_id_from_input("https://steamcommunity.com@evil.com/sharedfiles/filedetails/?id=123456789"), None);
        assert_eq!(form("itemcount", &["123456".into(), "1&x=2".into()]), "itemcount=2&publishedfileids%5B0%5D=123456");
        assert_eq!(workshop_id_from_input("12345"), None);
        assert!(client_url("item", Some("2859188632;calc")).is_err());
        assert_eq!(client_url("item", Some("2859188632")).unwrap(), "steam://url/CommunityFilePage/2859188632");
    }

    #[test]
    fn reads_acf() {
        let dir = std::env::temp_dir().join(format!("modstead-acf-{}", modstead_core::fsx::short_id()));
        let content = dir.join("workshop").join("content").join("261550");
        std::fs::create_dir_all(&content).unwrap();
        std::fs::write(
            dir.join("workshop").join("appworkshop_261550.acf"),
            "\"AppWorkshop\"\n{\n\t\"WorkshopItemsInstalled\"\n\t{\n\t\t\"2859188632\"\n\t\t{\n\t\t\t\"size\"\t\t\"5447879\"\n\t\t\t\"timeupdated\"\t\t\"1784662507\"\n\t\t}\n\t}\n\t\"WorkshopItemDetails\"\n\t{\n\t\t\"2859188632\"\n\t\t{\n\t\t\t\"timeupdated\"\t\t\"1\"\n\t\t}\n\t}\n}\n",
        )
        .unwrap();
        let s = local_state(Some(&content.to_string_lossy()));
        assert_eq!(s.get("2859188632"), Some(&1784662507));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
