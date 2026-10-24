//! Mod klasörlerini değiştiren işlemler. Yerel modlar silinmez, Modstead'in çöp kutusuna taşınır
//! (geri yüklenebilir). Paradox önbelleğindeki eski sürüm ve yarım indirme klasörleri ise yeniden
//! indirilebilir önbellek olduğu için kalıcı silinir. Hepsi oyun kapalıyken yapılır.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::{AppError, AppResult, fsx, tr};
use serde::{Deserialize, Serialize};

use crate::{Cities2, bail, detect, mods};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TrashMeta {
    pub id: String,
    pub name: String,
    /// Taşınmadan önceki tam yol.
    pub original: String,
    /// "local-mod" | "bepinex"
    pub kind: String,
    pub time: i64,
    pub size: u64,
}

fn local_target(game: &Cities2, folder: &str) -> AppResult<PathBuf> {
    let path = fsx::resolve_under(&game.local_mods_dir(), folder)?;
    if folder.contains(['/', '\\']) || !path.is_dir() || fsx::is_link(&path) {
        return Err(AppError::NotFound(folder.to_string()));
    }
    Ok(path)
}

/// Yerel modları açar/kapatır: oyun başında nokta olan klasörü yüklemez (`Mods\.Ad`).
/// Dönüş: değişen klasör sayısı.
pub fn set_enabled(game: &Cities2, folders: &[String], enabled: bool) -> AppResult<u32> {
    game.ensure_game_closed()?;
    let _lock = game.ops_lock.lock().unwrap();
    let mut n = 0;
    for folder in folders {
        let src = local_target(game, folder)?;
        let clean = folder.trim_start_matches('.');
        let want = if enabled { clean.to_string() } else { format!(".{clean}") };
        if *folder == want {
            continue;
        }
        let dst = game.local_mods_dir().join(&want);
        if dst.exists() {
            bail!(
                format!("'{want}' adında bir klasör zaten var; önce onu kaldırın."),
                format!("A folder named '{want}' already exists; remove it first.")
            );
        }
        fs::rename(&src, &dst)?;
        n += 1;
    }
    Ok(n)
}

pub(crate) fn move_to_trash(game: &Cities2, src: &Path, name: &str, kind: &str) -> AppResult<TrashMeta> {
    let id = format!("{}-{}", chrono::Local::now().format("%Y%m%d-%H%M%S"), fsx::short_id());
    let dir = game.trash_dir().join(&id);
    fs::create_dir_all(&dir)?;
    let size = if src.is_dir() { fsx::dir_stats(src).0 } else { fs::metadata(src).map(|m| m.len()).unwrap_or(0) };
    let leaf = src.file_name().ok_or_else(|| AppError::msg(tr!("geçersiz yol", "invalid path")))?;
    let dst = dir.join(leaf);
    if src.is_dir() {
        fsx::move_dir(src, &dst)?;
    } else if fs::rename(src, &dst).is_err() {
        fs::copy(src, &dst)?;
        fs::remove_file(src)?;
    }
    let meta = TrashMeta { id, name: name.to_string(), original: src.to_string_lossy().into_owned(), kind: kind.into(), time: fsx::now_ts(), size };
    fsx::write_json(&dir.join("meta.json"), &meta)?;
    Ok(meta)
}

/// Yerel modları çöp kutusuna taşır.
pub fn uninstall(game: &Cities2, folders: &[String]) -> AppResult<Vec<TrashMeta>> {
    game.ensure_game_closed()?;
    let _lock = game.ops_lock.lock().unwrap();
    let mut out = Vec::new();
    for folder in folders {
        let src = local_target(game, folder)?;
        out.push(move_to_trash(game, &src, folder.trim_start_matches('.'), "local-mod")?);
    }
    Ok(out)
}

pub fn list_trash(game: &Cities2) -> Vec<TrashMeta> {
    let mut out: Vec<TrashMeta> = fs::read_dir(game.trash_dir()).into_iter().flatten().flatten().map(|e| fsx::read_json::<TrashMeta>(&e.path().join("meta.json"))).filter(|m| !m.id.is_empty()).collect();
    out.sort_by_key(|m| std::cmp::Reverse(m.time));
    out
}

fn trash_entry(game: &Cities2, id: &str) -> AppResult<(PathBuf, TrashMeta)> {
    let dir = fsx::resolve_under(&game.trash_dir(), id)?;
    let meta: TrashMeta = fsx::read_json(&dir.join("meta.json"));
    if meta.id != id {
        return Err(AppError::NotFound(id.to_string()));
    }
    Ok((dir, meta))
}

/// Çöpten geri yükler: özgün yerine; orası doluysa yanına (` (2)`) ve kapalı olarak değil, olduğu gibi.
pub fn restore_trash(game: &Cities2, id: &str) -> AppResult<String> {
    game.ensure_game_closed()?;
    let _lock = game.ops_lock.lock().unwrap();
    let (dir, meta) = trash_entry(game, id)?;
    let original = PathBuf::from(&meta.original);
    // Yalnızca bilinen hedeflere geri yüklenir: yerel mod klasörü ya da oyun klasörü (BepInEx).
    let allowed = match meta.kind.as_str() {
        "local-mod" => original.parent().is_some_and(|p| fsx::norm_key(p) == fsx::norm_key(&game.local_mods_dir())),
        "bepinex" => game.game_dir().is_some_and(|g| original.parent().is_some_and(|p| fsx::norm_key(p) == fsx::norm_key(&g))),
        _ => false,
    };
    if !allowed {
        bail!("Bu öğenin özgün yeri artık geçerli değil.", "This item's original location is no longer valid.");
    }
    let leaf = original.file_name().ok_or_else(|| AppError::msg(tr!("geçersiz yol", "invalid path")))?;
    let src = dir.join(leaf);
    let parent = original.parent().unwrap_or(&original).to_path_buf();
    let dst = if original.exists() { fsx::unique_child(&parent, &leaf.to_string_lossy()) } else { original };
    if src.is_dir() {
        fsx::move_dir(&src, &dst)?;
    } else {
        fs::create_dir_all(&parent)?;
        fs::rename(&src, &dst).or_else(|_| fs::copy(&src, &dst).map(|_| ()))?;
    }
    fsx::remove_dir(&dir)?;
    Ok(dst.file_name().unwrap_or_default().to_string_lossy().into_owned())
}

/// Çöpten kalıcı siler (`id` yoksa hepsini). Dönüş: silinen öğe sayısı.
pub fn delete_trash(game: &Cities2, id: Option<&str>) -> AppResult<u32> {
    let _lock = game.ops_lock.lock().unwrap();
    match id {
        Some(id) => {
            let (dir, _) = trash_entry(game, id)?;
            fsx::remove_dir(&dir)?;
            Ok(1)
        }
        None => {
            let n = list_trash(game).len() as u32;
            fsx::remove_dir(&game.trash_dir())?;
            Ok(n)
        }
    }
}

/// Süresi dolan çöpleri siler (açılışta).
pub fn purge_trash(game: &Cities2, older_than_secs: i64) {
    let now = fsx::now_ts();
    for m in list_trash(game).into_iter().filter(|m| now - m.time > older_than_secs) {
        let _ = fsx::remove_dir(&game.trash_dir().join(&m.id));
    }
}

// ───────────── Paradox önbelleği ─────────────

/// Paradox önbellek kökündeki bir klasörü kalıcı siler (yalnızca `<id>_<sürüm>` ya da `.downloading`).
fn remove_cache_entry(game: &Cities2, name: &str) -> AppResult<u64> {
    if !(mods::parse_pdx_folder(name).is_some() || name.to_ascii_lowercase().contains(".downloading")) || name.contains(['/', '\\']) {
        bail!("Geçersiz önbellek klasörü.", "Invalid cache folder.");
    }
    for root in mods::pdx_roots(&game.user_dir()) {
        let path = fsx::resolve_under(&root, name)?;
        if path.exists() && !fsx::is_link(&path) {
            let size = if path.is_dir() { fsx::dir_stats(&path).0 } else { fs::metadata(&path).map(|m| m.len()).unwrap_or(0) };
            if path.is_dir() {
                fsx::remove_dir(&path)?;
            } else {
                fs::remove_file(&path)?;
            }
            return Ok(size);
        }
    }
    Err(AppError::NotFound(name.to_string()))
}

/// Eski sürüm klasörlerini siler (oyun her açılışta etkin sürümü kullanır; eskiler yer kaplar).
/// Dönüş: (silinen klasör, boşalan bayt).
pub fn clean_stale(game: &Cities2) -> AppResult<(u32, u64)> {
    game.ensure_game_closed()?;
    let _lock = game.ops_lock.lock().unwrap();
    let scan = mods::scan(&game.user_dir());
    let (mut n, mut bytes) = (0, 0);
    for m in &scan.mods {
        for s in &m.stale {
            bytes += remove_cache_entry(game, &s.folder)?;
            n += 1;
        }
    }
    for p in &scan.partial {
        bytes += remove_cache_entry(game, p).unwrap_or(0);
        n += 1;
    }
    Ok((n, bytes))
}

/// Bilinen kötü amaçlı sürümün önbellek klasörünü siler; oyun modun güncel sürümünü yeniden indirir.
pub fn remove_known_bad(game: &Cities2) -> AppResult<u32> {
    game.ensure_game_closed()?;
    let _lock = game.ops_lock.lock().unwrap();
    let mut n = 0;
    for (id, ver, _, _) in mods::KNOWN_BAD {
        let name = format!("{id}_{ver}");
        if remove_cache_entry(game, &name).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}

/// Oyun klasöründeki BepInEx kalıntılarını çöpe taşır (paket kurulumunda yazılamaz).
pub fn remove_bepinex(game: &Cities2) -> AppResult<u32> {
    game.ensure_game_closed()?;
    let dir = game.game_dir().ok_or_else(|| AppError::GameNotFound(crate::INFO.name.into()))?;
    if detect::is_protected_dir(&dir) {
        bail!("Bu kurulumun klasörü korumalı; BepInEx dosyaları elle kaldırılmalı.", "This installation's folder is protected; remove the BepInEx files manually.");
    }
    let _lock = game.ops_lock.lock().unwrap();
    let mut n = 0;
    for f in detect::bepinex_leftovers(&dir) {
        let path = dir.join(&f);
        if fsx::is_link(&path) {
            continue;
        }
        move_to_trash(game, &path, &f, "bepinex")?;
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::fixture;

    #[test]
    fn toggles_uninstalls_and_restores() {
        let fx = fixture();
        fx.add_local("MyTool", "MyTool.dll", b"MZ");
        assert_eq!(set_enabled(&fx.game, &["MyTool".into()], false).unwrap(), 1);
        assert!(fx.game.local_mods_dir().join(".MyTool").is_dir());
        assert_eq!(set_enabled(&fx.game, &[".MyTool".into()], true).unwrap(), 1);
        assert!(fx.game.local_mods_dir().join("MyTool").is_dir());
        assert!(set_enabled(&fx.game, &["../x".into()], true).is_err());

        let trashed = uninstall(&fx.game, &["MyTool".into()]).unwrap();
        assert!(!fx.game.local_mods_dir().join("MyTool").exists());
        assert_eq!(list_trash(&fx.game).len(), 1);
        assert_eq!(restore_trash(&fx.game, &trashed[0].id).unwrap(), "MyTool");
        assert!(fx.game.local_mods_dir().join("MyTool").join("MyTool.dll").is_file());
        assert!(list_trash(&fx.game).is_empty());
    }

    #[test]
    fn cleans_stale_versions_only() {
        let fx = fixture();
        fx.add_pdx(74417, 13, "UIL.dll");
        let active = fx.add_pdx(74417, 14, "UIL.dll");
        let (n, bytes) = clean_stale(&fx.game).unwrap();
        assert_eq!(n, 1);
        assert!(bytes > 0);
        assert!(active.is_dir(), "etkin sürüm kalmalı");
        assert!(!fx.game.mods_cache_dir().join("pdx_mods").join("74417_13").exists());
        assert!(remove_cache_entry(&fx.game, "..").is_err());
    }
}
