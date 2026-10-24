//! Mod bulma: Nexus'ta arama, kategoriler ve mod sayfası (açık GraphQL, anahtar gerekmez),
//! Premium üyelerde uygulama içinden doğrudan indirme. Ücretsiz üyeler sitedeki "Mod Manager
//! Download" düğmesini kullanır; gelen `nxm` bağlantısı `Game::handle_nxm` ile aynı hatta girer.
//!
//! SMAPI'nin Nexus sayfası (2400) bir kurucu dağıtır, mod değil: oradan gelen istekler
//! doğrulanmış GitHub kurulumuna (`smapi::start`) yönlendirilir.

use std::sync::Arc;

use modstead_core::nexus::{self, CategoryCount, NexusFile, NexusModDetail, SearchOptions, SearchPage};
use modstead_core::prelude::*;
use serde::Serialize;
use tauri::State;

use crate::install::{self, Source};
use crate::{INFO, Stardew, bail, smapi};

/// SMAPI'nin Nexus numarası.
pub const SMAPI_NEXUS_ID: u64 = 2400;

const PAGE_SIZE: u32 = 24;

type Game<'a> = State<'a, Arc<Stardew>>;

fn nexus_game() -> nexus::NexusGame {
    INFO.nexus[0]
}

/// Uygulama içinden tek tıkla kurulacak dosya: tek ana dosya ya da yazarın "birincil" işaretlediği.
/// Birden çok seçenek varsa (ör. farklı portre stilleri) `None`: kullanıcı mod sayfasından seçer.
pub fn pick_main_file(files: &[NexusFile]) -> Option<&NexusFile> {
    let main: Vec<&NexusFile> = files.iter().filter(|f| f.category == "MAIN").collect();
    match main.as_slice() {
        [] => None,
        [one] => Some(one),
        many => many.iter().find(|f| f.primary).copied(),
    }
}

#[tauri::command]
pub async fn stardew_nexus_search(game: Game<'_>, query: String, sort: String, category: Option<String>, offset: u32) -> AppResult<SearchPage> {
    let query: String = query.chars().take(100).collect();
    let category = category.map(|c| c.chars().take(80).collect::<String>()).filter(|c| !c.trim().is_empty());
    let opts = SearchOptions {
        query: &query,
        sort: &sort,
        category: category.as_deref(),
        offset: offset.min(10_000),
        count: PAGE_SIZE,
        include_adult: game.services.settings().show_adult,
    };
    nexus::search_with(&game.services.http, nexus_game(), &opts).await
}

/// Kategoriler ve mod sayıları (Nexus'un arama yüzeyinden; çoktan aza).
#[tauri::command]
pub async fn stardew_nexus_categories(game: Game<'_>) -> AppResult<Vec<CategoryCount>> {
    nexus::category_counts(&game.services.http, nexus_game(), game.services.settings().show_adult).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusModPage {
    #[serde(flatten)]
    pub detail: NexusModDetail,
    pub files: Vec<NexusFile>,
    /// Tek tıkla kurulacak ana dosya (seçenekler belirsizse yok).
    pub main_file_id: Option<u64>,
}

#[tauri::command]
pub async fn stardew_nexus_mod(game: Game<'_>, mod_id: u64) -> AppResult<NexusModPage> {
    let http = &game.services.http;
    let (detail, files) = tokio::join!(nexus::get_mod(http, nexus_game(), mod_id), nexus::files(http, nexus_game(), mod_id));
    let files = files?;
    let main_file_id = pick_main_file(&files).map(|f| f.file_id);
    Ok(NexusModPage { detail: detail?, files, main_file_id })
}

/// Nexus'tan doğrudan kurulum (Premium). `file_id` verilmezse ana dosya seçilir; seçim belirsizse
/// hata döner ve arayüz mod sayfasını açar.
#[tauri::command]
pub async fn stardew_install_nexus(game: Game<'_>, mod_id: u64, file_id: Option<u64>, name: Option<String>) -> AppResult<JobSnapshot> {
    if mod_id == SMAPI_NEXUS_ID {
        return Ok(smapi::start(&game)?.snapshot());
    }
    let file_id = match file_id {
        Some(f) => f,
        None => {
            let files = nexus::files(&game.services.http, nexus_game(), mod_id).await?;
            match pick_main_file(&files) {
                Some(f) => f.file_id,
                None if files.is_empty() => bail!("Bu modun indirilebilir dosyası yok.", "This mod has no downloadable files."),
                None => bail!("Bu modun birden çok ana dosyası var; mod sayfasından birini seçin.", "This mod has several main files; pick one on the mod page."),
            }
        }
    };
    let name = name.map(|n| n.chars().take(120).collect());
    Ok(install::start(&game, Source::Nexus { game: nexus_game(), mod_id, file_id, nxm: None, name }).snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(id: u64, category: &str, primary: bool) -> NexusFile {
        NexusFile {
            file_id: id,
            name: format!("f{id}"),
            version: "1.0".into(),
            category: category.into(),
            size: 1,
            file_name: format!("f{id}.zip"),
            date: id as i64,
            primary,
            scan: "VERIFIED".into(),
            description: String::new(),
        }
    }

    #[test]
    fn picks_single_or_primary_main_file() {
        assert_eq!(pick_main_file(&[file(1, "OPTIONAL", false), file(2, "MAIN", false)]).map(|f| f.file_id), Some(2));
        assert_eq!(pick_main_file(&[file(1, "MAIN", false), file(2, "MAIN", true)]).map(|f| f.file_id), Some(2));
        assert!(pick_main_file(&[file(1, "MAIN", false), file(2, "MAIN", false)]).is_none(), "belirsiz seçim kullanıcıya kalmalı");
        assert!(pick_main_file(&[file(1, "OPTIONAL", true)]).is_none());
    }
}
