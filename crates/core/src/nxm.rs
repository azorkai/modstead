//! `nxm://` protokol işleyicisi (Nexus'taki "Mod Manager Download" düğmesi).
//! Kayıt yalnızca kullanıcı isteyince yapılır; önceki işleyici (ör. Vortex) saklanır ve kayıt
//! kaldırılınca geri konur.

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NxmStatus {
    pub registered: bool,
    /// Şu anki işleyici başka bir uygulamaysa onun komutu.
    pub other_handler: Option<String>,
}

fn our_command() -> AppResult<String> {
    let exe = std::env::current_exe()?;
    Ok(format!("\"{}\" \"%1\"", exe.display()))
}

#[cfg(windows)]
mod imp {
    use super::*;
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER};
    use winreg::RegKey;

    const KEY: &str = "Software\\Classes\\nxm";

    fn current_command() -> Option<String> {
        RegKey::predef(HKEY_CLASSES_ROOT)
            .open_subkey("nxm\\shell\\open\\command")
            .ok()?
            .get_value::<String, _>("")
            .ok()
    }

    pub fn status() -> AppResult<NxmStatus> {
        let ours = our_command()?;
        let cur = current_command();
        let registered = cur.as_deref().is_some_and(|c| c.eq_ignore_ascii_case(&ours));
        Ok(NxmStatus { registered, other_handler: if registered { None } else { cur } })
    }

    /// Kaydeder ve önceki komutu döner (geri almak için saklanır).
    pub fn register() -> AppResult<Option<String>> {
        let previous = current_command();
        let ours = our_command()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (root, _) = hkcu.create_subkey(KEY).map_err(|e| AppError::msg(format!("{}: {e}", tr!("kayıt defteri", "registry"))))?;
        root.set_value("", &"URL:NXM Protocol").map_err(|e| AppError::msg(e.to_string()))?;
        root.set_value("URL Protocol", &"").map_err(|e| AppError::msg(e.to_string()))?;
        let exe = std::env::current_exe()?;
        let (icon, _) = root.create_subkey("DefaultIcon").map_err(|e| AppError::msg(e.to_string()))?;
        icon.set_value("", &format!("\"{}\",0", exe.display())).map_err(|e| AppError::msg(e.to_string()))?;
        let (cmd, _) = root.create_subkey("shell\\open\\command").map_err(|e| AppError::msg(e.to_string()))?;
        cmd.set_value("", &ours).map_err(|e| AppError::msg(e.to_string()))?;
        Ok(previous.filter(|p| !p.eq_ignore_ascii_case(&ours)))
    }

    pub fn unregister(previous: Option<&str>) -> AppResult<()> {
        let ours = our_command()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(cmd) = hkcu.open_subkey_with_flags(format!("{KEY}\\shell\\open\\command"), winreg::enums::KEY_ALL_ACCESS) else {
            return Ok(());
        };
        let cur: String = cmd.get_value("").unwrap_or_default();
        if !cur.eq_ignore_ascii_case(&ours) {
            return Ok(()); // Başkası devralmış; dokunma.
        }
        match previous {
            Some(prev) => cmd.set_value("", &prev).map_err(|e| AppError::msg(e.to_string()))?,
            None => {
                drop(cmd);
                hkcu.delete_subkey_all(KEY).map_err(|e| AppError::msg(e.to_string()))?;
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn status() -> AppResult<NxmStatus> {
        Ok(NxmStatus { registered: false, other_handler: None })
    }
    pub fn register() -> AppResult<Option<String>> {
        Err(AppError::msg("yalnızca Windows"))
    }
    pub fn unregister(_: Option<&str>) -> AppResult<()> {
        Ok(())
    }
}

pub use imp::{register, status, unregister};
