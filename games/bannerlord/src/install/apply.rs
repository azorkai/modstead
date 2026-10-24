//! Onaylanan planı uygular. Her modül için: karantinadan `Modules\.modstead-incoming-*` klasörüne
//! kopyala → eski sürümü kenara al → yeni klasörü yerine koy → eskiyi yedeğe taşı. Herhangi bir
//! adım başarısız olursa eski sürüm geri konur.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::security::motw;
use modstead_core::{AppError, AppResult, fsx, tr};

use super::analyze::PlannedModule;
use super::backups;
use super::{InstallRecord, InstallSource};
use crate::detect::{self, GameDirs};
use crate::modules::submodule::{Location, read_module_dir};

pub struct ApplyOptions {
    pub unblock: bool,
    pub keep_backups: usize,
}

/// Karantinadan gelen, kurulacak içerik.
pub struct Source<'a> {
    pub extract_dir: &'a Path,
    pub source: &'a InstallSource,
    pub sha256: &'a str,
}

fn game_running() -> AppError {
    AppError::GameRunning(crate::INFO.name.into())
}

pub fn install_modules(game: &GameDirs, backups_dirs: &[PathBuf], src: &Source, selected: &[PlannedModule], opts: &ApplyOptions) -> AppResult<Vec<InstallRecord>> {
    if detect::is_running() {
        return Err(game_running());
    }
    let modules_dir = PathBuf::from(&game.modules_dir);
    let mut records = Vec::new();
    for pm in selected {
        if !fsx::safe_component(&pm.folder) {
            return Err(AppError::security(format!("{}: {}", tr!("geçersiz klasör adı", "invalid folder name"), pm.folder)));
        }
        let from = if pm.rel_root.is_empty() {
            src.extract_dir.to_path_buf()
        } else {
            let rel = fsx::safe_relative_path(&pm.rel_root).ok_or_else(|| AppError::security(tr!("geçersiz modül yolu", "invalid module path")))?;
            src.extract_dir.join(rel)
        };
        // Karantinadaki içerik incelemeden sonra değişmiş mi? (ör. başka bir süreç)
        let check = read_module_dir(&from, Location::Modules).ok_or_else(|| AppError::security(tr!("karantinadaki modül kayboldu", "the quarantined module disappeared")))?;
        if !check.id.eq_ignore_ascii_case(&pm.id) || check.version != pm.version {
            return Err(AppError::security(tr!("karantinadaki modül incelemeden sonra değişmiş", "the quarantined module changed after review")));
        }

        let target = modules_dir.join(&pm.folder);
        if fsx::is_link(&target) {
            return Err(AppError::security(tr!(
                format!("Modules\\{} bir bağlantı (junction); dokunulmadı", pm.folder),
                format!("Modules\\{} is a junction; left untouched", pm.folder)
            )));
        }
        let tag = fsx::short_id();
        let incoming = modules_dir.join(format!(".modstead-incoming-{tag}"));
        // Adında klasör adı var: kurulum yarıda kesilirse açılışta geri konabilir.
        let old = modules_dir.join(format!(".modstead-old-{tag}~{}", pm.folder));

        if let Err(e) = fsx::copy_dir(&from, &incoming, |_| {}) {
            let _ = fsx::remove_dir(&incoming);
            return Err(e);
        }
        let had_old = target.exists();
        let previous = if had_old { read_module_dir(&target, Location::Modules) } else { None };
        if had_old {
            if let Err(e) = fs::rename(&target, &old) {
                let _ = fsx::remove_dir(&incoming);
                return Err(AppError::msg(tr!(
                    format!("Modules\\{} taşınamadı (bir dosya açık olabilir): {e}", pm.folder),
                    format!("could not move Modules\\{} (a file may be open): {e}", pm.folder)
                )));
            }
        }
        if let Err(e) = fs::rename(&incoming, &target) {
            if had_old {
                let _ = fs::rename(&old, &target);
            }
            let _ = fsx::remove_dir(&incoming);
            return Err(AppError::msg(format!("{}: {e}", tr!("yeni sürüm yerine konamadı", "could not put the new version in place"))));
        }
        if had_old {
            let (pid, pname, pver) = previous.map(|m| (m.id, m.name, m.version)).unwrap_or_else(|| (pm.id.clone(), pm.name.clone(), String::new()));
            match backups::store(&backups_dirs[0], &old, &pid, &pname, &pver, &pm.folder, "update") {
                Ok(_) => backups::prune(backups_dirs, &pid, opts.keep_backups),
                Err(e) => {
                    log::warn!("eski sürüm yedeklenemedi, siliniyor: {e}");
                    let _ = fsx::remove_dir(&old);
                }
            }
        }
        if opts.unblock {
            motw::unblock_tree(&target);
        }
        records.push(InstallRecord {
            module_id: pm.id.clone(),
            folder: pm.folder.clone(),
            version: pm.version.clone(),
            source: src.source.clone(),
            archive_sha256: src.sha256.to_string(),
            installed_at: fsx::now_ts(),
        });
    }
    Ok(records)
}

/// Modules altındaki bir modülü yedeğe taşır (kaldırma ya da yinelenen kopyayı emekliye ayırma).
pub fn retire_module(game: &GameDirs, backups_dir: &Path, path: &str, reason: &str) -> AppResult<backups::BackupMeta> {
    if detect::is_running() {
        return Err(game_running());
    }
    let modules_dir = PathBuf::from(&game.modules_dir);
    let target = PathBuf::from(path);
    if target.parent().is_none_or(|p| fsx::norm_key(p) != fsx::norm_key(&modules_dir)) {
        return Err(AppError::security(tr!("yalnızca Modules klasöründeki modüller kaldırılabilir", "only modules in the Modules folder can be removed")));
    }
    fsx::ensure_within(&modules_dir, &target)?;
    if fsx::is_link(&target) {
        return Err(AppError::security(tr!("bağlantı (junction) olan klasörlere dokunulmaz", "junction folders are left untouched")));
    }
    let info = read_module_dir(&target, Location::Modules).ok_or_else(|| AppError::NotFound(tr!("modül", "module").into()))?;
    if info.is_official {
        return Err(AppError::security(tr!("resmi oyun modülleri kaldırılamaz", "official game modules cannot be removed")));
    }
    let folder = target.file_name().unwrap_or_default().to_string_lossy().into_owned();
    backups::store(backups_dir, &target, &info.id, &info.name, &info.version, &folder, reason)
}

/// Önceki oturumdan kalan yarım kurulumları toparlar (Otağ'ın `.otag-*` adları dahil):
/// gelen kopya silinir; kenara alınmış eski sürüm yerinde değilse geri konur, yerindeyse yedeğe alınır.
pub fn recover_leftovers(modules_dir: &Path, backups_dir: &Path) {
    let Ok(rd) = fs::read_dir(modules_dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with(".modstead-incoming-") || name.starts_with(".otag-incoming-") {
            let _ = fsx::remove_dir(&e.path());
            continue;
        }
        let Some((_, folder)) = name.strip_prefix(".modstead-old-").or_else(|| name.strip_prefix(".otag-old-")).and_then(|r| r.split_once('~')) else {
            continue;
        };
        if !fsx::safe_component(folder) {
            continue;
        }
        let target = modules_dir.join(folder);
        if !target.exists() {
            let _ = fs::rename(e.path(), &target);
        } else {
            let info = read_module_dir(&e.path(), Location::Modules);
            let (id, n, v) = info.map(|m| (m.id, m.name, m.version)).unwrap_or_else(|| (folder.to_string(), folder.to_string(), String::new()));
            let _ = backups::store(backups_dir, &e.path(), &id, &n, &v, folder, "update");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovers_interrupted_installs() {
        let root = std::env::temp_dir().join(format!("modstead-rec-{}", fsx::short_id()));
        let modules = root.join("Modules");
        fs::create_dir_all(modules.join(".otag-old-abc~Lost")).unwrap();
        fs::write(modules.join(".otag-old-abc~Lost").join("SubModule.xml"), r#"<Module><Id value="Lost"/></Module>"#).unwrap();
        fs::create_dir_all(modules.join(".modstead-incoming-xyz")).unwrap();
        recover_leftovers(&modules, &root.join("bk"));
        assert!(modules.join("Lost").join("SubModule.xml").is_file());
        assert!(!modules.join(".modstead-incoming-xyz").exists());
        let _ = fs::remove_dir_all(&root);
    }
}
