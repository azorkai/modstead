//! GitHub Releases. Sürüm dosyalarının `digest` alanındaki SHA-256 ile indirme doğrulanır.

use serde::Serialize;
use serde_json::Value;
use url::Url;

use crate::error::{AppError, AppResult};
use crate::http::Http;

/// `BUTR/Bannerlord.Harmony`, `https://github.com/BUTR/Bannerlord.Harmony/releases` → `BUTR/Bannerlord.Harmony`
pub fn normalize_repo(input: &str) -> Option<String> {
    let t = input.trim().trim_end_matches('/');
    let path = if t.starts_with("https://") || t.starts_with("http://") {
        let u = Url::parse(t).ok()?;
        let host = u.host_str()?.to_ascii_lowercase();
        if host != "github.com" && host != "www.github.com" {
            return None;
        }
        u.path().trim_matches('/').to_string()
    } else {
        t.trim_start_matches("github.com/").to_string()
    };
    let mut segs = path.split('/').filter(|s| !s.is_empty());
    let owner = segs.next()?;
    let repo = segs.next()?.trim_end_matches(".git");
    let ok = |s: &str| {
        !s.is_empty()
            && s.len() <= 100
            && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            && s != "."
            && s != ".."
    };
    if ok(owner) && ok(repo) {
        Some(format!("{owner}/{repo}"))
    } else {
        None
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GhAsset {
    pub id: u64,
    pub name: String,
    pub size: u64,
    pub download_url: String,
    /// `sha256:…` biçiminde; eski sürümlerde boş olabilir.
    pub sha256: Option<String>,
    pub downloads: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GhRelease {
    pub id: u64,
    pub tag: String,
    pub name: String,
    pub published_at: String,
    pub prerelease: bool,
    pub notes: String,
    pub url: String,
    pub assets: Vec<GhAsset>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GhRepo {
    pub repo: String,
    pub description: String,
    pub stars: u64,
    pub url: String,
    pub releases: Vec<GhRelease>,
}

fn is_archive(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.ends_with(".zip") || n.ends_with(".7z") || n.ends_with(".rar")
}

async fn get(http: &Http, url: &str) -> AppResult<Value> {
    let mut req = http.client.get(url).header("Accept", "application/vnd.github+json").header("X-GitHub-Api-Version", "2022-11-28");
    // İsteğe bağlı kişisel belirteç: saatlik sınırı 60'tan 5000'e çıkarır. Kimlik Bilgisi Yöneticisi'nde durur.
    if let Ok(Some(token)) = crate::credentials::get(crate::credentials::GITHUB_TOKEN) {
        if !token.is_empty() {
            req = req.bearer_auth(token);
        }
    }
    let resp = req.send().await?;
    let status = resp.status();
    if status.as_u16() == 404 {
        return Err(AppError::NotFound(tr!("GitHub deposu ya da sürümü", "GitHub repository or release").into()));
    }
    if status.as_u16() == 403 || status.as_u16() == 429 {
        return Err(AppError::Network(tr!("GitHub istek sınırı doldu (saatte 60). Biraz sonra yeniden deneyin.", "GitHub rate limit reached (60 per hour). Try again later.").into()));
    }
    if !status.is_success() {
        return Err(AppError::Network(tr!(format!("GitHub {status} döndürdü"), format!("GitHub returned {status}"))));
    }
    Ok(resp.json().await?)
}

fn parse_release(r: &Value) -> GhRelease {
    let assets = r["assets"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter(|x| is_archive(x["name"].as_str().unwrap_or("")))
                .map(|x| GhAsset {
                    id: x["id"].as_u64().unwrap_or(0),
                    name: x["name"].as_str().unwrap_or("").to_string(),
                    size: x["size"].as_u64().unwrap_or(0),
                    download_url: x["browser_download_url"].as_str().unwrap_or("").to_string(),
                    sha256: x["digest"]
                        .as_str()
                        .and_then(|d| d.strip_prefix("sha256:"))
                        .filter(|d| d.len() == 64 && d.chars().all(|c| c.is_ascii_hexdigit()))
                        .map(|d| d.to_ascii_lowercase()),
                    downloads: x["download_count"].as_u64().unwrap_or(0),
                })
                .collect()
        })
        .unwrap_or_default();
    let notes: String = r["body"].as_str().unwrap_or("").chars().take(4000).collect();
    GhRelease {
        id: r["id"].as_u64().unwrap_or(0),
        tag: r["tag_name"].as_str().unwrap_or("").to_string(),
        name: r["name"].as_str().unwrap_or("").to_string(),
        published_at: r["published_at"].as_str().unwrap_or("").to_string(),
        prerelease: r["prerelease"].as_bool().unwrap_or(false),
        notes,
        url: r["html_url"].as_str().unwrap_or("").to_string(),
        assets,
    }
}

pub async fn repo(http: &Http, repo: &str) -> AppResult<GhRepo> {
    let repo = normalize_repo(repo).ok_or_else(|| AppError::msg(tr!("geçersiz GitHub deposu", "invalid GitHub repository")))?;
    let meta = get(http, &format!("https://api.github.com/repos/{repo}")).await?;
    let rels = get(http, &format!("https://api.github.com/repos/{repo}/releases?per_page=12")).await?;
    let releases = rels
        .as_array()
        .map(|a| {
            a.iter()
                .filter(|r| !r["draft"].as_bool().unwrap_or(false))
                .map(parse_release)
                .filter(|r| !r.assets.is_empty())
                .collect()
        })
        .unwrap_or_default();
    Ok(GhRepo {
        description: meta["description"].as_str().unwrap_or("").to_string(),
        stars: meta["stargazers_count"].as_u64().unwrap_or(0),
        url: format!("https://github.com/{repo}"),
        repo,
        releases,
    })
}

/// Kimliği bilinen tek bir sürüm (son sürümler listesinde olmayabilir; ör. aynı depoda 2020 ve 2024 dalları).
pub async fn release(http: &Http, repo: &str, id: u64) -> AppResult<GhRelease> {
    let repo = normalize_repo(repo).ok_or_else(|| AppError::msg(tr!("geçersiz GitHub deposu", "invalid GitHub repository")))?;
    let r = get(http, &format!("https://api.github.com/repos/{repo}/releases/{id}")).await?;
    if r["draft"].as_bool().unwrap_or(false) {
        return Err(AppError::NotFound(tr!("GitHub sürümü", "GitHub release").into()));
    }
    Ok(parse_release(&r))
}

/// Deponun son `count` sürümü (en çok 100; taslaklar ve arşiv dosyası olmayanlar hariç).
pub async fn releases(http: &Http, repo: &str, count: u8) -> AppResult<Vec<GhRelease>> {
    let repo = normalize_repo(repo).ok_or_else(|| AppError::msg(tr!("geçersiz GitHub deposu", "invalid GitHub repository")))?;
    let per_page = count.clamp(1, 100);
    let rels = get(http, &format!("https://api.github.com/repos/{repo}/releases?per_page={per_page}")).await?;
    Ok(rels
        .as_array()
        .map(|a| a.iter().filter(|r| !r["draft"].as_bool().unwrap_or(false)).map(parse_release).filter(|r| !r.assets.is_empty()).collect())
        .unwrap_or_default())
}

pub async fn latest(http: &Http, repo: &str) -> AppResult<Option<GhRelease>> {
    let repo = normalize_repo(repo).ok_or_else(|| AppError::msg(tr!("geçersiz GitHub deposu", "invalid GitHub repository")))?;
    let rels = get(http, &format!("https://api.github.com/repos/{repo}/releases?per_page=8")).await?;
    Ok(rels.as_array().and_then(|a| {
        a.iter()
            .filter(|r| !r["draft"].as_bool().unwrap_or(false) && !r["prerelease"].as_bool().unwrap_or(false))
            .map(parse_release)
            .find(|r| !r.assets.is_empty())
    }))
}

/// Bir modül için en uygun sürüm dosyası: adı modül kimliğini ya da depo adını içeren arşiv.
pub fn pick_asset<'a>(release: &'a GhRelease, module_id: &str, repo: &str) -> Option<&'a GhAsset> {
    let repo_name = repo.split('/').nth(1).unwrap_or("").to_ascii_lowercase();
    let id = module_id.to_ascii_lowercase();
    let score = |a: &GhAsset| {
        let n = a.name.to_ascii_lowercase();
        let mut s = 0;
        if n.contains(&id) {
            s += 4;
        }
        if n.contains(&repo_name) {
            s += 2;
        }
        if n.ends_with(".zip") {
            s += 1;
        }
        if n.contains("blse") && !id.contains("blse") {
            s -= 5;
        }
        if n.contains("source") || n.contains("symbols") || n.contains("pdb") {
            s -= 5;
        }
        s
    };
    release.assets.iter().max_by_key(|a| score(a))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repos() {
        assert_eq!(normalize_repo("BUTR/Bannerlord.Harmony").as_deref(), Some("BUTR/Bannerlord.Harmony"));
        assert_eq!(
            normalize_repo("https://github.com/BUTR/Bannerlord.ButterLib/releases/latest").as_deref(),
            Some("BUTR/Bannerlord.ButterLib")
        );
        assert_eq!(normalize_repo("https://gitlab.com/a/b"), None);
        assert_eq!(normalize_repo("a/../b"), None);
        assert_eq!(normalize_repo("onlyowner"), None);
    }
}
