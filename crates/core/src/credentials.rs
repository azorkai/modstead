//! Gizli değerler (Nexus API anahtarı, VirusTotal anahtarı, GitHub belirteci) Windows Kimlik
//! Bilgisi Yöneticisi'nde tutulur; diske düz metin olarak yazılmaz, arayüze geri gönderilmez,
//! günlüğe düşmez. Tüm oyunlar aynı anahtarları paylaşır (Nexus hesabı oyuna değil kişiye aittir).

use crate::error::{AppError, AppResult};

pub const NEXUS_KEY: &str = "Modstead/NexusMods/ApiKey";
pub const VIRUSTOTAL_KEY: &str = "Modstead/VirusTotal/ApiKey";
pub const GITHUB_TOKEN: &str = "Modstead/GitHub/Token";

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ptr::null_mut;
    use windows_sys::Win32::Security::Credentials::{CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredDeleteW, CredFree, CredReadW, CredWriteW};

    const ERROR_NOT_FOUND: i32 = 1168;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn set(target: &str, secret: &str) -> AppResult<()> {
        let target_w = wide(target);
        let user_w = wide("modstead");
        let blob = secret.as_bytes();
        let mut cred: CREDENTIALW = unsafe { std::mem::zeroed() };
        cred.Type = CRED_TYPE_GENERIC;
        cred.TargetName = target_w.as_ptr() as *mut u16;
        cred.UserName = user_w.as_ptr() as *mut u16;
        cred.CredentialBlobSize = blob.len() as u32;
        cred.CredentialBlob = blob.as_ptr() as *mut u8;
        cred.Persist = CRED_PERSIST_LOCAL_MACHINE;
        let ok = unsafe { CredWriteW(&cred, 0) };
        if ok == 0 {
            return Err(AppError::msg(format!(
                "{}: {}",
                tr!("anahtar Windows Kimlik Bilgisi Yöneticisi'ne yazılamadı", "could not write the key to Windows Credential Manager"),
                std::io::Error::last_os_error()
            )));
        }
        Ok(())
    }

    pub fn get(target: &str) -> AppResult<Option<String>> {
        let target_w = wide(target);
        let mut p: *mut CREDENTIALW = null_mut();
        let ok = unsafe { CredReadW(target_w.as_ptr(), CRED_TYPE_GENERIC, 0, &mut p) };
        if ok == 0 {
            let e = std::io::Error::last_os_error();
            if e.raw_os_error() == Some(ERROR_NOT_FOUND) {
                return Ok(None);
            }
            return Err(AppError::msg(format!("{}: {e}", tr!("kimlik bilgisi okunamadı", "could not read credential"))));
        }
        let value = unsafe {
            let c = &*p;
            let bytes = std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize);
            let v = String::from_utf8_lossy(bytes).into_owned();
            CredFree(p as *const _);
            v
        };
        Ok(Some(value))
    }

    pub fn delete(target: &str) -> AppResult<()> {
        let target_w = wide(target);
        let ok = unsafe { CredDeleteW(target_w.as_ptr(), CRED_TYPE_GENERIC, 0) };
        if ok == 0 {
            let e = std::io::Error::last_os_error();
            if e.raw_os_error() != Some(ERROR_NOT_FOUND) {
                return Err(AppError::msg(format!("{}: {e}", tr!("kimlik bilgisi silinemedi", "could not delete credential"))));
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn set(_: &str, _: &str) -> AppResult<()> {
        Err(AppError::msg(tr!("yalnızca Windows destekleniyor", "only Windows is supported")))
    }
    pub fn get(_: &str) -> AppResult<Option<String>> {
        Ok(None)
    }
    pub fn delete(_: &str) -> AppResult<()> {
        Ok(())
    }
}

pub use imp::{delete, get, set};

/// Anahtar kayıtlı mı? (değeri döndürmeden)
pub fn has(target: &str) -> bool {
    matches!(get(target), Ok(Some(v)) if !v.is_empty())
}
