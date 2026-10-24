//! Dosya sistemi yardımcıları. Hepsi sembolik bağları ve kavşakları (junction) izlemeden çalışır.

use std::fs;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Unix saniyesi.
pub fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

/// Unix milisaniyesi.
pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn short_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..10].to_string()
}

/// Geçici dosyaya yazıp yerine taşır; yarım kalmış dosya bırakmaz.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path.parent().ok_or_else(|| AppError::msg(tr!("geçersiz hedef yol", "invalid target path")))?;
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!(".{}.{}.tmp", path.file_name().and_then(|n| n.to_str()).unwrap_or("dosya"), short_id()));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// JSON okur. Dosya yoksa varsayılanı döner; bozuksa yanına `<ad>.bozuk-<zaman>.json` olarak
/// yedekleyip varsayılanla devam eder (kullanıcı verisi sessizce kaybolmasın).
pub fn read_json<T: serde::de::DeserializeOwned + Default>(path: &Path) -> T {
    match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(v) => v,
            Err(e) => {
                log::warn!("{} okunamadı, varsayılan kullanılıyor: {e}", path.display());
                let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("veri");
                let backup = path.with_file_name(format!("{stem}.bozuk-{}.json", now_ts()));
                let _ = fs::copy(path, backup);
                T::default()
            }
        },
        Err(_) => T::default(),
    }
}

pub fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(value)?;
    atomic_write(path, &bytes)
}

pub fn is_link(path: &Path) -> bool {
    fs::symlink_metadata(path).map(|m| m.file_type().is_symlink() || is_reparse_point(&m)).unwrap_or(false)
}

#[cfg(windows)]
fn is_reparse_point(m: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(_: &fs::Metadata) -> bool {
    false
}

/// `canonicalize` Windows'ta `\\?\` öneki ekler; kullanıcıya gösterilecek yollar için soyar.
pub fn dunce(p: &Path) -> PathBuf {
    match p.canonicalize() {
        Ok(c) => {
            let s = c.to_string_lossy();
            match s.strip_prefix(r"\\?\") {
                Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
                _ => c,
            }
        }
        Err(_) => p.to_path_buf(),
    }
}

/// Karşılaştırma anahtarı: `\\?\` önekisiz, ters bölüyle, küçük harfle.
pub fn norm_key(p: &Path) -> String {
    let s = p.to_string_lossy().replace('/', "\\");
    let s = s.strip_prefix(r"\\?\").unwrap_or(&s);
    s.trim_end_matches('\\').to_lowercase()
}

/// `path`, `root` içinde mi (kökün kendisi hariç)? İkisi de var olmalı; kanonik yollar karşılaştırılır.
pub fn is_within(root: &Path, path: &Path) -> bool {
    match (fs::canonicalize(root), fs::canonicalize(path)) {
        (Ok(r), Ok(p)) => p.starts_with(&r) && p != r,
        _ => false,
    }
}

pub fn ensure_within(root: &Path, path: &Path) -> AppResult<()> {
    if is_within(root, path) {
        Ok(())
    } else {
        Err(AppError::security(format!("{} {}", path.display(), tr!("izin verilen klasörün dışında", "is outside the allowed folder"))))
    }
}

/// Arayüzden gelen göreli yolu `base` altına kilitler: mutlak yol, sürücü, `..` reddedilir.
/// Hedefin var olması gerekmez.
pub fn resolve_under(base: &Path, rel: &str) -> AppResult<PathBuf> {
    let rel_path = Path::new(rel);
    let mut out = base.to_path_buf();
    for comp in rel_path.components() {
        match comp {
            Component::Normal(c) => {
                let s = c.to_string_lossy();
                if !safe_component(&s) {
                    return Err(AppError::security(format!("{}: {rel}", tr!("güvensiz yol", "unsafe path"))));
                }
                out.push(c);
            }
            Component::CurDir => {}
            _ => return Err(AppError::security(format!("{}: {rel}", tr!("güvensiz yol", "unsafe path")))),
        }
    }
    if out == base {
        return Err(AppError::security(tr!("boş yol", "empty path")));
    }
    Ok(out)
}

/// Klasör boyutu ve dosya sayısı (bağları izlemez).
pub fn dir_stats(path: &Path) -> (u64, u64) {
    let mut size = 0u64;
    let mut files = 0u64;
    for entry in walkdir::WalkDir::new(path).follow_links(false).into_iter().flatten() {
        if entry.file_type().is_file() {
            files += 1;
            size += entry.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    (size, files)
}

/// Klasörü kopyalar; bağ (symlink/junction) görürse durur.
pub fn copy_dir(src: &Path, dst: &Path, mut on_file: impl FnMut(u64)) -> AppResult<()> {
    fs::create_dir_all(dst)?;
    for entry in walkdir::WalkDir::new(src).follow_links(false) {
        let entry = entry.map_err(|e| AppError::msg(format!("{}: {e}", tr!("klasör okunamadı", "could not read folder"))))?;
        let rel = entry
            .path()
            .strip_prefix(src)
            .map_err(|_| AppError::msg(tr!("göreli yol hesaplanamadı", "could not compute relative path")))?;
        if rel.as_os_str().is_empty() {
            continue;
        }
        let target = dst.join(rel);
        let ft = entry.file_type();
        if ft.is_symlink() || is_link(entry.path()) {
            return Err(AppError::security(format!("{}: {}", tr!("sembolik bağ kopyalanmaz", "symbolic links are not copied"), rel.display())));
        }
        if ft.is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(p) = target.parent() {
                fs::create_dir_all(p)?;
            }
            let n = fs::copy(entry.path(), &target)?;
            on_file(n);
        }
    }
    Ok(())
}

/// Önce yeniden adlandırmayı dener, farklı sürücüdeyse kopyalayıp siler.
pub fn move_dir(src: &Path, dst: &Path) -> AppResult<()> {
    if let Some(p) = dst.parent() {
        fs::create_dir_all(p)?;
    }
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if e.raw_os_error() == Some(17) || e.kind() == io::ErrorKind::CrossesDevices => {
            copy_dir(src, dst, |_| {})?;
            remove_dir(src)?;
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}

/// Klasörü siler; kendisi bir bağsa yalnızca bağı kaldırır, hedefine dokunmaz.
pub fn remove_dir(path: &Path) -> AppResult<()> {
    if !path.exists() && !is_link(path) {
        return Ok(());
    }
    if is_link(path) {
        fs::remove_dir(path).or_else(|_| fs::remove_file(path))?;
        return Ok(());
    }
    clear_readonly(path);
    fs::remove_dir_all(path)?;
    Ok(())
}

fn clear_readonly(path: &Path) {
    for entry in walkdir::WalkDir::new(path).follow_links(false).into_iter().flatten() {
        if let Ok(meta) = entry.metadata() {
            let mut perm = meta.permissions();
            if perm.readonly() {
                #[allow(clippy::permissions_set_readonly_false)]
                perm.set_readonly(false);
                let _ = fs::set_permissions(entry.path(), perm);
            }
        }
    }
}

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4",
    "LPT5", "LPT6", "LPT7", "LPT8", "LPT9", "CONIN$", "CONOUT$",
];

/// Tek bir yol parçası Windows'ta güvenli mi? (`..`, sürücü harfi, ADS, aygıt adı, sondaki nokta yok)
pub fn safe_component(comp: &str) -> bool {
    if comp.is_empty() || comp == "." || comp == ".." || comp.len() > 255 {
        return false;
    }
    if comp.chars().any(|c| (c as u32) < 0x20 || matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*' | '/' | '\\')) {
        return false;
    }
    if comp.ends_with('.') || comp.ends_with(' ') {
        return false;
    }
    let stem = comp.split('.').next().unwrap_or("").trim().to_ascii_uppercase();
    !RESERVED.contains(&stem.as_str())
}

/// Arşivdeki bir girdinin adını, hedef klasörün dışına çıkamayan göreli bir yola çevirir.
pub fn safe_relative_path(name: &str) -> Option<PathBuf> {
    if name.contains('\0') {
        return None;
    }
    let normalized = name.replace('\\', "/");
    if normalized.starts_with('/') {
        return None;
    }
    let mut out = PathBuf::new();
    for comp in normalized.split('/') {
        if comp.is_empty() || comp == "." {
            continue;
        }
        if !safe_component(comp) {
            return None;
        }
        out.push(comp);
    }
    if out.as_os_str().is_empty() { None } else { Some(out) }
}

/// Klasör ya da dosya adı için temizlenmiş ad.
pub fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '.' | '_' | '-' | '(' | ')' | '+' | '\'' | '&') { c } else { '_' })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches('.').trim().to_string();
    if trimmed.is_empty() || !safe_component(&trimmed) {
        format!("mod_{}", short_id())
    } else {
        trimmed.chars().take(96).collect()
    }
}

/// `dir` altında `name` boşsa onu, doluysa `name (2)`, `name (3)`… döner.
pub fn unique_child(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() && !is_link(&first) {
        return first;
    }
    for i in 2..10_000 {
        let candidate = dir.join(format!("{name} ({i})"));
        if !candidate.exists() && !is_link(&candidate) {
            return candidate;
        }
    }
    dir.join(format!("{name}-{}", short_id()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_devices() {
        assert!(safe_relative_path("../evil.dll").is_none());
        assert!(safe_relative_path("a/../../evil").is_none());
        assert!(safe_relative_path("/abs/path").is_none());
        assert!(safe_relative_path("C:/Windows/x.dll").is_none());
        assert!(safe_relative_path("a/b.dll:Zone.Identifier").is_none());
        assert!(safe_relative_path("a/CON.txt").is_none());
        assert!(safe_relative_path("a/nul").is_none());
        assert!(safe_relative_path("a/trailing. ").is_none());
        assert!(safe_relative_path("\\\\server\\share\\x").is_none());
    }

    #[test]
    fn accepts_normal_paths() {
        assert_eq!(
            safe_relative_path("Modules\\MyMod/SubModule.xml").unwrap(),
            PathBuf::from("Modules").join("MyMod").join("SubModule.xml")
        );
        assert_eq!(
            safe_relative_path("./MyMod/bin/Win64_Shipping_Client/My.Mod.dll").unwrap(),
            PathBuf::from("MyMod/bin/Win64_Shipping_Client/My.Mod.dll")
        );
    }

    #[test]
    fn resolve_under_locks_paths() {
        let base = Path::new(r"C:\Games\Mods");
        assert_eq!(resolve_under(base, "Foo/config.json").unwrap(), base.join("Foo").join("config.json"));
        assert!(resolve_under(base, "../x").is_err());
        assert!(resolve_under(base, r"C:\Windows").is_err());
        assert!(resolve_under(base, "").is_err());
        assert!(resolve_under(base, "a/CON").is_err());
    }

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_name("Bannerlord.Harmony"), "Bannerlord.Harmony");
        assert_eq!(sanitize_name("bad/name"), "bad_name");
        assert!(sanitize_name("CON").starts_with("mod_"));
    }

    #[test]
    fn norm_keys_compare_paths() {
        assert_eq!(norm_key(Path::new(r"\\?\C:\Games\X\")), norm_key(Path::new("c:/games/x")));
    }
}
