//! MSFS'e özel küçük dosya yardımcıları (bağlantı hedefi, yol karşılaştırma, yedekli metin yazma).
//! Genel olanlar çekirdekte: `modstead_core::fsx`.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::fsx::{self, norm_key};
use modstead_core::prelude::*;

pub fn strip_verbatim(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(r) = s.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{r}"));
    }
    PathBuf::from(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
}

/// `child`, `parent`in içinde mi (aynı yol dahil)? Yolların var olması gerekmez; metin olarak karşılaştırılır.
pub fn is_within(child: &Path, parent: &Path) -> bool {
    let c = norm_key(child);
    let p = norm_key(parent);
    c == p || c.starts_with(&(p + "\\"))
}

/// Sembolik bağ ya da junction mı?
pub fn is_link(p: &Path) -> bool {
    fsx::is_link(p)
}

/// Bağlantının hedefini döndürür (junction ya da symlink). Göreli hedefleri bağın klasörüne göre çözer.
pub fn link_target(p: &Path) -> Option<PathBuf> {
    let t = fs::read_link(p).ok()?;
    let t = strip_verbatim(&t);
    if t.is_absolute() { Some(t) } else { p.parent().map(|par| par.join(t)) }
}

/// Junction oluşturur (yönetici izni gerekmez). Hedef mutlak bir klasör olmalı.
pub fn create_junction(target: &Path, link: &Path) -> AppResult<()> {
    junction::create(target, link).map_err(|e| {
        AppError::msg(tr!(format!("Bağlantı oluşturulamadı ({}): {e}", link.display()), format!("Could not create the link ({}): {e}", link.display())))
    })
}

/// Sim yapılandırma dosyasını değiştirmeden önce yanına zaman damgalı bir yedek koyar.
pub fn backup_file(path: &Path) -> AppResult<PathBuf> {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "dosya".into());
    let ext = path.extension().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "xml".into());
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    // Aynı saniyede ikinci bir düzeltme ilk yedeği (asıl dosyayı) ezmesin.
    let mut backup = path.with_file_name(format!("{stem}.modstead-yedek-{stamp}.{ext}"));
    let mut n = 2;
    while backup.exists() {
        backup = path.with_file_name(format!("{stem}.modstead-yedek-{stamp}-{n}.{ext}"));
        n += 1;
    }
    fs::copy(path, &backup)?;
    Ok(backup)
}

/// Metni atomik olarak yazar (geçici dosya + yeniden adlandırma).
pub fn write_atomic(path: &Path, text: &str) -> AppResult<()> {
    fsx::atomic_write(path, text.as_bytes())
}

pub fn gb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / 1024f64.powi(3))
}

/// Sabit disklerin kök yolları ve boş alanları.
pub fn drives() -> Vec<(PathBuf, u64)> {
    ('C'..='Z')
        .map(|c| PathBuf::from(format!("{c}:\\")))
        .filter(|p| p.is_dir())
        .filter_map(|p| modstead_core::platform::disk_free(&p).map(|f| (p, f)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn within_is_textual_and_inclusive() {
        assert!(is_within(Path::new(r"E:\MSFS Mods\a"), Path::new(r"e:\msfs mods\")));
        assert!(is_within(Path::new(r"E:\MSFS Mods"), Path::new(r"E:\MSFS Mods")));
        assert!(!is_within(Path::new(r"E:\MSFS Mods2\a"), Path::new(r"E:\MSFS Mods")));
    }

    #[test]
    fn junction_round_trip() {
        let root = std::env::temp_dir().join(format!("msfs-junction-{}", fsx::short_id()));
        fs::create_dir_all(root.join("target")).unwrap();
        fs::write(root.join("target").join("a.txt"), b"1").unwrap();
        create_junction(&root.join("target"), &root.join("link")).unwrap();
        assert!(is_link(&root.join("link")));
        assert_eq!(norm_key(&link_target(&root.join("link")).unwrap()), norm_key(&root.join("target")));
        assert_eq!(fs::read(root.join("link").join("a.txt")).unwrap(), b"1");
        // Bağı kaldırmak hedefe dokunmaz.
        fs::remove_dir(root.join("link")).unwrap();
        assert!(root.join("target").join("a.txt").is_file());
        fs::remove_dir_all(&root).unwrap();
    }
}
