//! Mod tarayıcısı: flightsim.to gibi sitelerin herkese açık indirme API'si yoktur. Site uygulama içinde ayrı bir
//! pencerede açılır; kullanıcı "Download"a basınca indirme yakalanır, kütüphanenin karantinasına iner ve ortak
//! kabul hattından geçip inceleme penceresine düşer.
//!
//! Güvenlik: pencere hiçbir yetenek (capability) dosyasında listelenmez ve uzak içerik yükler; Tauri bu yüzden
//! oradan gelen hiçbir komut çağrısını kabul etmez. Yalnızca https adresleri açılır.

use std::path::PathBuf;

use modstead_core::prelude::*;
use tauri::Manager;
use tauri::webview::DownloadEvent;

use crate::{Msfs, install};

pub const LABEL: &str = "msfs-browser";

pub fn open(app: &tauri::AppHandle, url: &str) -> AppResult<()> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| AppError::msg(tr!("Geçersiz adres", "Invalid address")))?;
    if parsed.scheme() != "https" {
        return Err(AppError::security(tr!("Mod tarayıcısı yalnızca https adreslerini açar.", "The mod browser only opens https addresses.")));
    }
    if let Some(w) = app.get_webview_window(LABEL) {
        w.navigate(parsed).app_err()?;
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }
    let handle = app.clone();
    tauri::WebviewWindowBuilder::new(app, LABEL, tauri::WebviewUrl::External(parsed))
        .title(tr!("Modstead · Mod tarayıcısı — indirmeler karantinaya alınır", "Modstead · Mod browser — downloads go to quarantine"))
        .inner_size(1280.0, 860.0)
        .min_inner_size(800.0, 560.0)
        .on_download(move |_webview, event| on_download(&handle, event))
        .build()
        .app_err()?;
    Ok(())
}

fn on_download(app: &tauri::AppHandle, event: DownloadEvent<'_>) -> bool {
    let Some(game) = app.try_state::<Msfs>() else { return false };
    match event {
        DownloadEvent::Requested { url, destination } => {
            let suggested = destination
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .filter(|s| !s.is_empty())
                .or_else(|| url.path_segments().and_then(|mut s| s.next_back().map(str::to_string)))
                .unwrap_or_else(|| "indirme.zip".into());
            match install::begin_browser(&game, &suggested) {
                Ok((job, target)) => {
                    *destination = target;
                    game.inner.browser_downloads.lock().unwrap().insert(url.to_string(), job.id());
                    game.services.notify(Tone::Info, tr!(format!("“{suggested}” karantinaya indiriliyor"), format!("Downloading “{suggested}” into quarantine")), None);
                    true
                }
                Err(e) => {
                    game.services.notify(Tone::Danger, tr!("İndirme başlatılamadı", "Could not start the download"), Some(e.to_string()));
                    false
                }
            }
        }
        DownloadEvent::Finished { url, path, success } => {
            let id = game.inner.browser_downloads.lock().unwrap().remove(url.as_str()).or_else(|| {
                // Adres yönlendirmeyle değişmiş olabilir: indirme süren tek tarayıcı görevini al.
                game.services.jobs.list().into_iter().find(|j| j.game == crate::ID && j.source == "browser" && j.stage == Stage::Downloading).map(|j| j.id)
            });
            let Some(job) = id.and_then(|id| game.services.jobs.get(&id)) else { return true };
            match (success, path) {
                (true, Some(p)) => install::finish_browser(&game, job, PathBuf::from(p), url.to_string()),
                _ => job.fail(&AppError::msg(tr!("İndirme tamamlanamadı", "The download did not complete"))),
            }
            true
        }
        _ => true,
    }
}
