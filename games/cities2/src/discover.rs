//! Mod bulma: Paradox Mods kataloğu (oyunun resmî platformu; abonelik oyunda/sitede) ve Nexus Mods
//! (indirilir, ortak güvenlik hattından geçer ve yerel mod olarak kurulur).
//!
//! Nexus'ta indirme yolu Stardew ile aynıdır: Premium üyelerde uygulama içinden doğrudan, ücretsiz
//! üyelerde sitedeki "Mod Manager Download" düğmesi; gelen `nxm` bağlantısı `Game::handle_nxm` ile aynı hatta girer.

use std::sync::Arc;

use modstead_core::nexus::{self, CategoryCount, NexusFile, NexusModDetail, SearchOptions, SearchPage};
use modstead_core::prelude::*;
use modstead_core::fsx;
use serde::Serialize;
use tauri::State;

use crate::commands::meta_cache;
use crate::install::{self, Source};
use crate::paradox::{self, PdxModDetail, PdxSearchPage};
use crate::{Cities2, ID, INFO, bail, mods};

const NEXUS_PAGE: u32 = 24;

type Game<'a> = State<'a, Arc<Cities2>>;

fn nexus_game() -> nexus::NexusGame {
    INFO.nexus[0]
}

// ───────────── Paradox Mods ─────────────

#[tauri::command]
pub async fn cities2_pdx_search(game: Game<'_>, query: String, sort: String, tag: Option<String>, page: u32) -> AppResult<PdxSearchPage> {
    let query: String = query.chars().take(100).collect();
    let tag = tag.filter(|t| paradox::TAGS.contains(&t.as_str()));
    paradox::search(&game.services.http, &paradox::SearchOptions { query: &query, sort: &sort, tag: tag.as_deref(), page }).await
}

#[tauri::command]
pub async fn cities2_pdx_mod(game: Game<'_>, mod_id: String) -> AppResult<PdxModDetail> {
    paradox::detail(&game.services.http, mod_id.trim()).await
}

/// Kurulu Paradox modlarının katalog bilgisini (ad, görsel, uyumluluk, bağımlılıklar) yeniler.
/// `force` değilse yalnızca eksik ya da 12 saatten eski olanlar çekilir. Dönüş: güncellenen kayıt sayısı.
#[tauri::command]
pub async fn cities2_pdx_refresh(game: Game<'_>, force: Option<bool>) -> AppResult<u32> {
    let g = game.inner().clone();
    let (mut cache, ids) = tokio::task::spawn_blocking(move || {
        let scan = mods::scan(&g.user_dir());
        let ids: Vec<String> = scan.mods.iter().filter_map(|m| m.mod_id.clone()).collect();
        (meta_cache(&g), ids)
    })
    .await?;
    if ids.is_empty() {
        return Ok(0);
    }
    let n = paradox::refresh(&game.services.http, &mut cache, &ids, force.unwrap_or(false)).await;
    if n > 0 {
        fsx::write_json(&game.cache_path("pdx-meta.json"), &cache)?;
        game.services.game_changed(ID);
    }
    Ok(n as u32)
}

// ───────────── Nexus Mods ─────────────

/// Uygulama içinden tek tıkla kurulacak dosya: tek ana dosya ya da yazarın "birincil" işaretlediği.
pub fn pick_main_file(files: &[NexusFile]) -> Option<&NexusFile> {
    let main: Vec<&NexusFile> = files.iter().filter(|f| f.category == "MAIN").collect();
    match main.as_slice() {
        [] => None,
        [one] => Some(one),
        many => many.iter().find(|f| f.primary).copied(),
    }
}

#[tauri::command]
pub async fn cities2_nexus_search(game: Game<'_>, query: String, sort: String, category: Option<String>, offset: u32) -> AppResult<SearchPage> {
    let query: String = query.chars().take(100).collect();
    let category = category.map(|c| c.chars().take(80).collect::<String>()).filter(|c| !c.trim().is_empty());
    let opts = SearchOptions { query: &query, sort: &sort, category: category.as_deref(), offset: offset.min(10_000), count: NEXUS_PAGE, include_adult: game.services.settings().show_adult };
    nexus::search_with(&game.services.http, nexus_game(), &opts).await
}

#[tauri::command]
pub async fn cities2_nexus_categories(game: Game<'_>) -> AppResult<Vec<CategoryCount>> {
    nexus::category_counts(&game.services.http, nexus_game(), game.services.settings().show_adult).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusModPage {
    #[serde(flatten)]
    pub detail: NexusModDetail,
    pub files: Vec<NexusFile>,
    pub main_file_id: Option<u64>,
}

#[tauri::command]
pub async fn cities2_nexus_mod(game: Game<'_>, mod_id: u64) -> AppResult<NexusModPage> {
    let http = &game.services.http;
    let (detail, files) = tokio::join!(nexus::get_mod(http, nexus_game(), mod_id), nexus::files(http, nexus_game(), mod_id));
    let files = files?;
    let main_file_id = pick_main_file(&files).map(|f| f.file_id);
    Ok(NexusModPage { detail: detail?, files, main_file_id })
}

/// Nexus'tan doğrudan kurulum (Premium). `file_id` verilmezse ana dosya seçilir.
#[tauri::command]
pub async fn cities2_install_nexus(game: Game<'_>, mod_id: u64, file_id: Option<u64>, name: Option<String>) -> AppResult<JobSnapshot> {
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
