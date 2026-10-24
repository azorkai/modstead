//! Oyuna özel küçük dosya yardımcıları. Ortak olanlar (`atomic_write`, `resolve_under`,
//! `copy_dir`, `remove_dir`…) çekirdeğin `fsx` modülündedir; burada yalnızca Vadi'den gelen,
//! milisaniye zaman damgası ve "hedef doluysa reddet" kuralıyla taşıma kalır.

use std::fs;
use std::path::Path;

use modstead_core::{AppError, AppResult, fsx, tr};

/// Unix milisaniyesi (Vadi'nin kayıtları milisaniye kullanır; aktarılan veriyle uyumlu).
pub fn now_ms() -> u64 {
    fsx::now_ms().max(0) as u64
}

pub fn mtime_ms(p: &Path) -> u64 {
    fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Dosya adlarında kullanılan yerel zaman damgası: `20261024-153012`.
pub fn stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

/// Klasör ya da dosyayı taşır. Hedef doluysa reddeder (üzerine yazmaz); farklı birimdeyse
/// kopyalayıp kaynağı siler, kopyalama yarıda kalırsa yarım hedefi temizler.
pub fn move_path(src: &Path, dst: &Path) -> AppResult<()> {
    if dst.exists() || fsx::is_link(dst) {
        return Err(AppError::msg(format!("{}: {}", tr!("Hedef zaten var", "Target already exists"), dst.display())));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if e.raw_os_error() == Some(17) || e.kind() == std::io::ErrorKind::CrossesDevices => {
            if src.is_dir() {
                if let Err(err) = fsx::copy_dir(src, dst, |_| {}) {
                    let _ = fsx::remove_dir(dst);
                    return Err(err);
                }
                fsx::remove_dir(src)?;
            } else {
                fs::copy(src, dst)?;
                fs::remove_file(src)?;
            }
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}

/// Dosya ya da klasörü siler (klasörse bağları izlemeden).
pub fn remove_path(p: &Path) -> AppResult<()> {
    if p.is_dir() && !fsx::is_link(p) { fsx::remove_dir(p) } else { fs::remove_file(p).map_err(Into::into) }
}

pub fn human_bytes(b: u64) -> String {
    let units = ["B", "KB", "MB", "GB", "TB"];
    let mut v = b as f64;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    if i == 0 { format!("{b} B") } else { format!("{v:.1} {}", units[i]) }
}

/// Testler için geçici klasör (biterken siler).
#[cfg(test)]
pub struct TempDir(pub std::path::PathBuf);

#[cfg(test)]
impl TempDir {
    pub fn new() -> Self {
        let p = std::env::temp_dir().join(format!("modstead-sdv-{}", fsx::short_id()));
        fs::create_dir_all(&p).unwrap();
        TempDir(p)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

#[cfg(test)]
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fsx::remove_dir(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn move_refuses_existing_target() {
        let d = TempDir::new();
        fs::create_dir_all(d.path().join("a")).unwrap();
        fs::create_dir_all(d.path().join("b")).unwrap();
        assert!(move_path(&d.path().join("a"), &d.path().join("b")).is_err());
        move_path(&d.path().join("a"), &d.path().join("c/a")).unwrap();
        assert!(d.path().join("c/a").is_dir());
    }

    #[test]
    fn formats_bytes() {
        assert_eq!(human_bytes(512), "512 B");
        assert_eq!(human_bytes(1536), "1.5 KB");
    }
}
