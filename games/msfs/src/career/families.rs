//! Uçak aileleri ve gerçek fotoğrafları: simdeki başlıktan gerçek uçak tipine. Liste arayüzle ortaktır
//! (`ui/career/aircraft/families.json`); fotoğraflar derlemede gömülür (`build.rs`). Yerel sunucu bunları simin
//! içindeki menüye verir.

use std::sync::OnceLock;

use regex::{Regex, RegexBuilder};
use serde::Deserialize;

include!(concat!(env!("OUT_DIR"), "/photos.rs"));

const LIST: &str = include_str!("../../ui/career/aircraft/families.json");

#[derive(Deserialize)]
struct Raw {
    id: String,
    name: String,
    #[serde(rename = "match")]
    pattern: String,
}

pub struct Family {
    pub id: String,
    /// Gerçek tip adı (üretici + model).
    pub name: String,
    re: Regex,
}

fn all() -> &'static [Family] {
    static F: OnceLock<Vec<Family>> = OnceLock::new();
    F.get_or_init(|| {
        let raw: Vec<Raw> = serde_json::from_str(LIST).unwrap_or_default();
        raw.into_iter()
            .filter_map(|r| RegexBuilder::new(&r.pattern).case_insensitive(true).build().ok().map(|re| Family { id: r.id, name: r.name, re }))
            .collect()
    })
}

/// Başlığın ailesi (listede ilk eşleşen; özel olanlar genelden önce gelir).
pub fn family_of(title: &str) -> Option<&'static Family> {
    all().iter().find(|f| f.re.is_match(title))
}

/// Ailenin fotoğrafı (640×360 JPEG).
pub fn photo(id: &str) -> Option<&'static [u8]> {
    PHOTOS.iter().find(|(i, _)| *i == id).map(|(_, b)| *b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_pattern_compiles_and_photos_belong_to_families() {
        let raw: Vec<Raw> = serde_json::from_str(LIST).unwrap();
        assert_eq!(all().len(), raw.len(), "Rust'ın regex'iyle derlenmeyen desen var");
        assert!(PHOTOS.len() > 60);
        for (id, bytes) in PHOTOS {
            assert!(all().iter().any(|f| f.id == *id), "{id} fotoğrafının ailesi yok");
            assert_eq!(&bytes[..2], &[0xFF, 0xD8], "{id} JPEG değil");
        }
    }

    #[test]
    fn titles_map_to_the_right_family() {
        let id = |t: &str| family_of(t).map(|f| f.id.as_str());
        assert_eq!(id("C172SP G1000 Passengers"), Some("c172"));
        assert_eq!(id("Hercules H-4"), Some("h4"));
        assert_eq!(id("Grumman Goose G21A"), Some("goose"));
        assert_eq!(id("A330-BelugaXL"), Some("a330-beluga"));
        assert_eq!(id("Beechcraft King Air"), Some("kingair"));
        assert_eq!(id("Beechcraft King Air 350i"), Some("kingair"));
        assert_eq!(id("King Air C90 GTx"), None);
        assert_eq!(id("747-8F"), Some("b747"));
        assert!(photo("c172").is_some() && photo("../c172").is_none());
    }
}
