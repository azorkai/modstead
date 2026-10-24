//! GitHub'da yayımlanan ücretsiz modlar için katalog: son sürümü bulur, kurulu sürümle karşılaştırır.
//! İndirme ortak kabul hattından (`intake::Origin::Github`) geçer; GitHub'ın yayımladığı SHA-256 (`digest`)
//! ile doğrulanır.

use std::collections::HashMap;

use modstead_core::github::{self, GhRelease};
use modstead_core::http::Http;
use modstead_core::tr;
use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub sim: String,
    pub label: String,
    #[serde(default)]
    pub label_en: Option<String>,
    #[serde(default)]
    pub tag_prefix: Option<String>,
    /// Sürüm dosyasının adına uyan düzenli ifade.
    pub asset: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogDef {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub name_en: Option<String>,
    pub author: String,
    pub category: String,
    pub description: String,
    #[serde(default)]
    pub description_en: Option<String>,
    pub homepage: String,
    pub repo: String,
    /// Kurulduğunda kütüphanede görünen paket klasörleri (kurulu sürümü bulmak için).
    pub folders: Vec<String>,
    pub variants: Vec<Variant>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAsset {
    pub release_id: u64,
    pub asset_id: u64,
    pub tag: String,
    pub published_at: String,
    pub name: String,
    pub size: u64,
    pub url: String,
    pub sha256: Option<String>,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantStatus {
    pub sim: String,
    pub label: String,
    pub label_en: Option<String>,
    pub latest: Option<ReleaseAsset>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    #[serde(flatten)]
    pub def: CatalogDef,
    pub variants_status: Vec<VariantStatus>,
    pub error: Option<String>,
}

pub fn defs() -> Vec<CatalogDef> {
    serde_json::from_str(include_str!("catalog.json")).expect("catalog.json geçersiz")
}

/// Varyanta uyan en yeni kararlı sürüm dosyası.
pub fn pick(releases: &[GhRelease], v: &Variant) -> Option<ReleaseAsset> {
    let re = Regex::new(&v.asset).ok()?;
    releases
        .iter()
        .filter(|r| !r.prerelease)
        .filter(|r| v.tag_prefix.as_ref().is_none_or(|p| r.tag.starts_with(p.as_str())))
        .find_map(|r| {
            r.assets.iter().find(|a| re.is_match(&a.name)).map(|a| ReleaseAsset {
                release_id: r.id,
                asset_id: a.id,
                tag: r.tag.clone(),
                published_at: r.published_at.clone(),
                name: a.name.clone(),
                size: a.size,
                url: a.download_url.clone(),
                sha256: a.sha256.clone(),
                notes: r.notes.clone(),
            })
        })
}

pub fn status_of(defs: Vec<CatalogDef>, by_repo: &HashMap<String, Result<Vec<GhRelease>, String>>) -> Vec<CatalogItem> {
    defs.into_iter()
        .map(|def| {
            let blank = |v: &Variant| VariantStatus { sim: v.sim.clone(), label: v.label.clone(), label_en: v.label_en.clone(), latest: None };
            let (variants_status, error) = match by_repo.get(&def.repo) {
                Some(Ok(rels)) => (def.variants.iter().map(|v| VariantStatus { latest: pick(rels, v), ..blank(v) }).collect(), None),
                Some(Err(e)) => (def.variants.iter().map(blank).collect(), Some(e.clone())),
                None => (Vec::new(), Some(tr!("Sürüm bilgisi alınamadı", "Could not get release information").to_string())),
            };
            CatalogItem { def, variants_status, error }
        })
        .collect()
}

pub async fn fetch(http: &Http) -> Vec<CatalogItem> {
    let defs = defs();
    let mut by_repo: HashMap<String, Result<Vec<GhRelease>, String>> = HashMap::new();
    for d in &defs {
        if !by_repo.contains_key(&d.repo) {
            // Aynı depoda 2020 ve 2024 dalları olabilir: yeterince geriye bak.
            let r = github::releases(http, &d.repo, 40).await.map_err(|e| e.to_string());
            by_repo.insert(d.repo.clone(), r);
        }
    }
    status_of(defs, &by_repo)
}

#[cfg(test)]
mod tests {
    use super::*;
    use modstead_core::github::GhAsset;

    fn rel(id: u64, tag: &str, assets: &[&str]) -> GhRelease {
        GhRelease {
            id,
            tag: tag.into(),
            name: tag.into(),
            published_at: String::new(),
            prerelease: false,
            notes: String::new(),
            url: String::new(),
            assets: assets
                .iter()
                .enumerate()
                .map(|(i, n)| GhAsset { id: id * 10 + i as u64, name: n.to_string(), size: 1, download_url: String::new(), sha256: None, downloads: 0 })
                .collect(),
        }
    }

    #[test]
    fn catalog_parses_and_patterns_compile() {
        let defs = defs();
        assert!(defs.len() >= 8);
        for d in &defs {
            assert!(d.description_en.is_some(), "{} İngilizce açıklamasız", d.id);
            for v in &d.variants {
                assert!(Regex::new(&v.asset).is_ok(), "{}: {}", d.id, v.asset);
                assert!(v.label_en.is_some());
            }
        }
    }

    #[test]
    fn picks_variant_by_tag_prefix() {
        let rels = vec![rel(3, "v2024.1.2", &["A32NX-stable.7z", "A380X-stable-4K.7z"]), rel(2, "v2020.9.0", &["A32NX-stable.7z"])];
        let def = defs().into_iter().find(|d| d.id == "fbw-a32nx").unwrap();
        let v24 = def.variants.iter().find(|v| v.sim == "msfs2024").unwrap();
        let v20 = def.variants.iter().find(|v| v.sim == "msfs2020").unwrap();
        assert_eq!(pick(&rels, v24).unwrap().tag, "v2024.1.2");
        let a20 = pick(&rels, v20).unwrap();
        assert_eq!((a20.tag.as_str(), a20.release_id, a20.asset_id), ("v2020.9.0", 2, 20));
    }
}
