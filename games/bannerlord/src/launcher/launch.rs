//! Oyunu, resmi başlatıcının kullandığı komut satırıyla açar:
//! `Bannerlord.exe /singleplayer _MODULES_*Native*SandBoxCore*…*_MODULES_ [/continuegame]`
//! (LauncherVM.GameTypeArgument / ModuleListCode / ContinueGameArgument ile aynı.)

use std::path::Path;
use std::process::Command;

use modstead_core::{AppError, AppResult, tr};
use serde::Deserialize;

use crate::detect::{self, GameDirs};

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOptions {
    #[serde(default)]
    pub continue_game: bool,
    #[serde(default)]
    pub use_blse: bool,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.contains("_MODULES_")
        && !id.chars().any(|c| c.is_control() || matches!(c, '*' | '"' | '\'' | '<' | '>' | '|' | '&' | '^' | '%'))
}

pub fn build_args(ids: &[String], continue_game: bool) -> AppResult<String> {
    if let Some(bad) = ids.iter().find(|i| !valid_id(i)) {
        return Err(AppError::security(format!("{}: {bad}", tr!("geçersiz modül kimliği", "invalid module id"))));
    }
    let mut args = format!("/singleplayer _MODULES_*{}*_MODULES_", ids.join("*"));
    if continue_game {
        args.push_str(" /continuegame");
    }
    Ok(args)
}

pub fn launch(game: &GameDirs, ids: &[String], opts: &LaunchOptions) -> AppResult<()> {
    if detect::is_running() {
        return Err(AppError::GameRunning(crate::INFO.name.into()));
    }
    if ids.is_empty() {
        return Err(AppError::msg(tr!("en az bir modül etkin olmalı", "at least one module must be enabled")));
    }
    let exe = if opts.use_blse {
        game.blse
            .clone()
            .ok_or_else(|| AppError::msg(tr!("BLSE kurulu değil", "BLSE is not installed")))?
    } else {
        game.exe.clone()
    };
    let exe_path = Path::new(&exe);
    if !exe_path.is_file() {
        return Err(AppError::NotFound(exe));
    }
    let args = build_args(ids, opts.continue_game)?;
    log::info!("oyun başlatılıyor: {} {}", exe_path.display(), args);
    let mut cmd = Command::new(exe_path);
    cmd.current_dir(&game.bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Başlatıcıyla birebir aynı: argüman dizesi tırnaklanmadan geçirilir, motor
        // `_MODULES_*` ve `*_MODULES_` işaretlerini tam komut satırında arar.
        cmd.raw_arg(&args);
    }
    #[cfg(not(windows))]
    {
        cmd.args(args.split(' '));
    }
    cmd.spawn()
        .map_err(|e| AppError::msg(format!("{}: {e}", tr!("oyun başlatılamadı", "could not start the game"))))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_launcher_compatible_args() {
        let ids = vec!["Bannerlord.Harmony".to_string(), "Native".to_string(), "swadian armoury".to_string()];
        assert_eq!(
            build_args(&ids, true).unwrap(),
            "/singleplayer _MODULES_*Bannerlord.Harmony*Native*swadian armoury*_MODULES_ /continuegame"
        );
        assert!(build_args(&["a\"b".to_string()], false).is_err());
        assert!(build_args(&["x*_MODULES_".to_string()], false).is_err());
    }
}
