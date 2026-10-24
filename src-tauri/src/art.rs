//! `art://<oyun>/<tür>` (Windows'ta `http://art.localhost/…`): oyunların gerçek görselleri.
//!
//! - `icon`: oyunun kendi .exe'sindeki resmî simge (en büyük boyut; Steam kurulum klasörü ya da oyunun
//!   bildirdiği kurulum klasörü), Xbox kurulumlarında mağaza kutucuğu logosu. Bulunamazsa Steam'in yerel
//!   önbelleğindeki küçük simge.
//! - `hero`, `logo`, `header`, `portrait`: önce Steam'in yerel kütüphane önbelleği, sonra Modstead'in disk
//!   önbelleği, en son Steam'in herkese açık mağaza deposu (indirilen görsel diske yazılır; izinli görsel
//!   sunucusu, boyut ve imza denetimiyle). Çok sürümlü oyunlarda (MSFS 2020/2024) en yeni sürüm önce gelir.
//!
//! Sonuçlar (yokluk dahil) oturum boyunca bellekte tutulur.

use std::path::PathBuf;
use std::sync::Arc;

use modstead_core::{Game, GameInfo, GameRegistry, Services, platform, stores};
use tauri::{AppHandle, Manager};

use crate::ShellState;

pub type Art = Option<(Vec<u8>, &'static str)>;

const MAX_BYTES: usize = 8 * 1024 * 1024;

pub async fn serve(app: &AppHandle, path: &str) -> Art {
    let (game_id, kind) = path.trim_start_matches('/').split_once('/')?;
    if !matches!(kind, "icon" | "hero" | "logo" | "header" | "portrait") {
        return None;
    }
    let game = app.try_state::<GameRegistry>()?.get(game_id)?;
    let shell = app.try_state::<ShellState>()?;
    let key = format!("{game_id}/{kind}");
    if let Some(hit) = shell.art.lock().unwrap().get(&key) {
        return hit.clone();
    }
    let result = if kind == "icon" {
        icon(&game).await
    } else {
        let services = app.try_state::<Arc<Services>>()?.inner().clone();
        image(&services, game.info(), kind).await
    };
    shell.art.lock().unwrap().insert(key, result.clone());
    result
}

async fn icon(game: &Arc<dyn Game>) -> Art {
    let info = game.info().clone();
    let installs: Vec<PathBuf> = game.status().await.installs.into_iter().map(|i| PathBuf::from(i.path)).collect();
    tokio::task::spawn_blocking(move || {
        let mut dirs: Vec<PathBuf> = info.steam_app_ids.iter().rev().filter_map(|id| stores::steam_install_dir(*id)).collect();
        dirs.extend(installs.into_iter().filter(|p| p.is_dir()));
        for dir in &dirs {
            if let Some(exe) = stores::find_game_exe(dir, info.name) {
                if let Some(found) = platform::exe_icon(&exe) {
                    return Some(found);
                }
            }
        }
        // Mağaza kutucuğu: önce oyunun bildirdiği kurulum (Xbox uygulaması oyunu kullanıcının seçtiği
        // klasöre de kurar, ör. `D:\Games\<oyun>\Content`), sonra `XboxGames` altında adı eşleşenler.
        let tile = dirs
            .iter()
            .find_map(|d| stores::xbox_tile_logo(d))
            .or_else(|| stores::xbox_game_dirs_like(info.name).iter().find_map(|d| stores::xbox_tile_logo(d)))
            .and_then(|p| std::fs::read(p).ok());
        if let Some(bytes) = tile.filter(|b| looks_like_image(b) && b.len() <= MAX_BYTES) {
            return Some((bytes, "image/png"));
        }
        info.steam_app_ids
            .iter()
            .find_map(|id| stores::steam_library_art(*id).icon)
            .filter(|p| stores::is_steam_art_path(p))
            .and_then(|p| std::fs::read(p).ok())
            .map(|b| (b, "image/jpeg"))
    })
    .await
    .ok()
    .flatten()
}

fn mime_for(file: &str) -> &'static str {
    if file.ends_with(".png") { "image/png" } else { "image/jpeg" }
}

fn looks_like_image(b: &[u8]) -> bool {
    b.starts_with(b"\x89PNG\r\n\x1a\n") || b.starts_with(&[0xFF, 0xD8, 0xFF])
}

async fn image(services: &Services, info: &GameInfo, kind: &str) -> Art {
    let file = stores::steam_art_file(kind)?;
    let ids: Vec<u32> = info.steam_app_ids.iter().rev().copied().collect();

    // 1) Steam'in yerel kütüphane önbelleği (kullanıcının kütüphanesindeki oyunlar).
    let local = {
        let (ids, kind) = (ids.clone(), kind.to_string());
        tokio::task::spawn_blocking(move || ids.iter().find_map(|id| stores::steam_library_art(*id).get(&kind).cloned())).await.ok().flatten()
    };
    if let Some(path) = local.filter(|p| stores::is_steam_art_path(p)) {
        if let Ok(bytes) = tokio::fs::read(&path).await {
            if bytes.len() <= MAX_BYTES {
                return Some((bytes, mime_for(file)));
            }
        }
    }

    // 2) Modstead'in disk önbelleği, 3) Steam'in herkese açık deposu.
    for id in ids {
        let cached = services.paths.cache().join("steam-art").join(id.to_string()).join(file);
        if let Ok(bytes) = tokio::fs::read(&cached).await {
            if looks_like_image(&bytes) {
                return Some((bytes, mime_for(file)));
            }
        }
        if let Some(bytes) = fetch(services, id, file).await {
            if let Some(dir) = cached.parent() {
                let _ = tokio::fs::create_dir_all(dir).await;
            }
            let _ = tokio::fs::write(&cached, &bytes).await;
            return Some((bytes, mime_for(file)));
        }
    }
    None
}

async fn fetch(services: &Services, app_id: u32, file: &str) -> Option<Vec<u8>> {
    let url = url::Url::parse(&stores::steam_cdn_url(app_id, file)).ok()?;
    if !services.http.media_allowed(&url) {
        return None;
    }
    let resp = services.http.media.get(url).send().await.ok()?;
    if !resp.status().is_success() || resp.content_length().is_some_and(|l| l as usize > MAX_BYTES) {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    (bytes.len() <= MAX_BYTES && looks_like_image(&bytes)).then(|| bytes.to_vec())
}
