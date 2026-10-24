//! Oyunu SMAPI ile (ya da modsuz) başlatır, isteğe bağlı olarak kayıtları önce yedekler ve oyun
//! kapanınca arayüze `stardew://game-exited` olayıyla haber verir (arayüz SMAPI günlüğünün özetini gösterir).

use std::process::Command;

use modstead_core::{AppError, AppResult, tr};
use serde::Serialize;
use serde_json::json;

use crate::{ID, Stardew, bail, detect, ops, saves, util};

pub const EXITED_EVENT: &str = "stardew://game-exited";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub backed_up: u32,
    pub backup_error: Option<String>,
    pub vanilla: bool,
}

pub fn launch(game: &Stardew, vanilla: bool) -> AppResult<LaunchResult> {
    if game.is_running() {
        bail!("Oyun zaten çalışıyor.", "The game is already running.");
    }
    let dir = game.require_game_dir()?;
    let exe = if vanilla {
        ["Stardew Valley.exe", "StardewValley.exe"].iter().map(|n| dir.join(n)).find(|p| p.is_file())
    } else {
        Some(dir.join(detect::SMAPI_EXE)).filter(|p| p.is_file())
    };
    let Some(exe) = exe else {
        if vanilla {
            bail!("Oyunun çalıştırılabilir dosyası bulunamadı.", "The game's executable was not found.");
        }
        bail!("SMAPI kurulu değil. Önce SMAPI'yi kurun ya da modsuz başlatın.", "SMAPI is not installed. Install SMAPI first or launch without mods.");
    };

    let (backed_up, backup_error) = if game.settings().backup_saves_on_launch {
        match saves::backup_all(game, "oyun-oncesi") {
            Ok(n) => (n, None),
            Err(e) => (0, Some(e.to_string())),
        }
    } else {
        (0, None)
    };

    let mut child = Command::new(&exe).current_dir(&dir).spawn().map_err(|e| AppError::msg(format!("{}: {e}", tr!("Oyun başlatılamadı", "Could not start the game"))))?;
    let started = util::now_ms();
    *game.session.lock().unwrap() = Some(started);
    let _ = ops::record(game, "launch", if vanilla { tr!("Oyun modsuz başlatıldı", "Game launched without mods") } else { tr!("Oyun SMAPI ile başlatıldı", "Game launched with SMAPI") }.into(), vec![], vec![]);
    game.services.game_changed(ID);

    let (session, services) = (game.session.clone(), game.services.clone());
    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        *session.lock().unwrap() = None;
        services.emit(EXITED_EVENT, json!({ "code": code, "durationMs": util::now_ms().saturating_sub(started), "vanilla": vanilla }));
        services.game_changed(ID);
    });
    Ok(LaunchResult { backed_up, backup_error, vanilla })
}
