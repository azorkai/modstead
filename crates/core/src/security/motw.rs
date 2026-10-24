//! "Mark of the Web": İnternetten inen dosyalara Windows'un eklediği `Zone.Identifier` akışı.
//! .NET Framework bu işaretli DLL'leri yüklemez; Bannerlord'da "mod açılmıyor" hatalarının en
//! yaygın nedenidir. İşaret yalnızca tarama/doğrulama sonrasında ve kullanıcı isteğiyle kaldırılır.

use std::fs;
use std::path::{Path, PathBuf};

fn ads_path(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(":Zone.Identifier");
    s.into()
}

/// Dosya İnternet (3) ya da Güvenilmeyen (4) bölgesinden geldiği için engelli mi?
pub fn is_blocked(path: &Path) -> bool {
    match fs::read(ads_path(path)) {
        Ok(bytes) => {
            let text = String::from_utf8_lossy(&bytes);
            text.lines()
                .find_map(|l| l.trim().strip_prefix("ZoneId="))
                .and_then(|z| z.trim().parse::<u32>().ok())
                .map(|z| z >= 3)
                .unwrap_or(true)
        }
        Err(_) => false,
    }
}

pub fn unblock(path: &Path) -> bool {
    fs::remove_file(ads_path(path)).is_ok()
}

/// Klasördeki tüm dosyaların engelini kaldırır; kaldırılan dosya sayısını döner.
pub fn unblock_tree(root: &Path) -> usize {
    let mut n = 0;
    for entry in walkdir::WalkDir::new(root).follow_links(false).into_iter().flatten() {
        if entry.file_type().is_file() && is_blocked(entry.path()) && unblock(entry.path()) {
            n += 1;
        }
    }
    n
}
