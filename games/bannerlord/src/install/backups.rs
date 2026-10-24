//! Modül yedekleri. Güncelleme, kaldırma ve kopya temizliği öncesinde eski klasör buraya taşınır;
//! tek tıkla geri yüklenebilir. Yedekler oyunla aynı sürücüdedir (taşıma anlık olur).
//!
//! Yeni yedekler `<oyun>\.modstead\backups` altına yazılır; Otağ'ın `<oyun>\.otag\backups`
//! klasöründeki eski yedekler de listelenir ve geri yüklenebilir.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::{AppError, AppResult, fsx, tr};
use serde::{Deserialize, Serialize};

use crate::modules::submodule::{Location, read_module_dir};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupMeta {
    pub id: String,
    pub module_id: String,
    pub name: String,
    pub version: String,
    pub folder: String,
    /// "update" | "uninstall" | "duplicate" | "restore"
    pub reason: String,
    pub created: i64,
    pub size: u64,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

pub fn store(backups_dir: &Path, src: &Path, module_id: &str, name: &str, version: &str, folder: &str, reason: &str) -> AppResult<BackupMeta> {
    let id = format!("{}-{}", fsx::now_ms(), fsx::short_id());
    let dir = backups_dir.join(&id);
    fs::create_dir_all(&dir)?;
    let (size, _) = fsx::dir_stats(src);
    fsx::move_dir(src, &dir.join("module"))?;
    let meta = BackupMeta {
        id,
        module_id: module_id.into(),
        name: name.into(),
        version: version.into(),
        folder: folder.into(),
        reason: reason.into(),
        created: fsx::now_ts(),
        size,
    };
    fsx::write_json(&dir.join("backup.json"), &meta)?;
    Ok(meta)
}

fn list_one(backups_dir: &Path) -> Vec<BackupMeta> {
    let Ok(rd) = fs::read_dir(backups_dir) else { return Vec::new() };
    rd.flatten()
        .filter_map(|e| {
            let bytes = fs::read(e.path().join("backup.json")).ok()?;
            let meta: BackupMeta = serde_json::from_slice(&bytes).ok()?;
            (meta.id == e.file_name().to_string_lossy() && e.path().join("module").is_dir()).then_some(meta)
        })
        .collect()
}

/// Tüm yedek klasörlerindeki yedekler, en yeni önce.
pub fn list(dirs: &[PathBuf]) -> Vec<BackupMeta> {
    let mut out: Vec<BackupMeta> = dirs.iter().flat_map(|d| list_one(d)).collect();
    out.sort_by(|a, b| b.created.cmp(&a.created));
    out
}

/// Yedeğin bulunduğu klasör (`<yedekler>/<kimlik>`).
fn locate(dirs: &[PathBuf], id: &str) -> AppResult<PathBuf> {
    if !valid_id(id) {
        return Err(AppError::security(tr!("geçersiz yedek kimliği", "invalid backup id")));
    }
    dirs.iter()
        .map(|d| d.join(id))
        .find(|d| d.join("backup.json").is_file())
        .ok_or_else(|| AppError::NotFound(tr!("yedek", "backup").into()))
}

fn meta_of(dir: &Path) -> AppResult<BackupMeta> {
    Ok(serde_json::from_slice(&fs::read(dir.join("backup.json"))?)?)
}

/// Yedeği `Modules\<klasör>` konumuna geri koyar. Orada bir sürüm varsa önce o yedeklenir
/// (yeni yedek her zaman ilk klasöre, yani `.modstead\backups` altına yazılır).
pub fn restore(dirs: &[PathBuf], id: &str, modules_dir: &Path) -> AppResult<BackupMeta> {
    let dir = locate(dirs, id)?;
    let meta = meta_of(&dir)?;
    if !fsx::safe_component(&meta.folder) {
        return Err(AppError::security(tr!("yedekteki klasör adı geçersiz", "the folder name in the backup is invalid")));
    }
    let target = modules_dir.join(&meta.folder);
    if fsx::is_link(&target) {
        return Err(AppError::security(tr!("bağlantı (junction) olan klasörlere dokunulmaz", "junction folders are left untouched")));
    }
    if target.exists() {
        let current = read_module_dir(&target, Location::Modules);
        let (cid, cname, cver) = current.map(|m| (m.id, m.name, m.version)).unwrap_or_else(|| (meta.module_id.clone(), meta.name.clone(), String::new()));
        store(&dirs[0], &target, &cid, &cname, &cver, &meta.folder, "restore")?;
    }
    fsx::move_dir(&dir.join("module"), &target)?;
    fsx::remove_dir(&dir)?;
    Ok(meta)
}

pub fn delete(dirs: &[PathBuf], id: &str) -> AppResult<()> {
    fsx::remove_dir(&locate(dirs, id)?)
}

/// Bir modülün en yeni `keep` yedeği dışındakileri siler.
pub fn prune(dirs: &[PathBuf], module_id: &str, keep: usize) {
    let all = list(dirs);
    let mine: Vec<&BackupMeta> = all.iter().filter(|b| b.module_id.eq_ignore_ascii_case(module_id) && b.reason != "uninstall").collect();
    for b in mine.iter().skip(keep) {
        let _ = delete(dirs, &b.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_lists_and_restores_across_folders() {
        let root = std::env::temp_dir().join(format!("modstead-bk-{}", fsx::short_id()));
        let modules = root.join("Modules");
        let new_dir = root.join(".modstead").join("backups");
        let old_dir = root.join(".otag").join("backups");
        let module = modules.join("MyMod");
        fs::create_dir_all(&module).unwrap();
        fs::write(module.join("SubModule.xml"), r#"<Module><Id value="MyMod"/><Version value="v1.0.0"/></Module>"#).unwrap();
        // Otağ'dan kalan eski yedek.
        let old = store(&old_dir, &module, "MyMod", "My Mod", "v1.0.0", "MyMod", "update").unwrap();
        assert!(!module.exists());
        let dirs = vec![new_dir.clone(), old_dir.clone()];
        assert_eq!(list(&dirs).len(), 1);
        restore(&dirs, &old.id, &modules).unwrap();
        assert!(module.join("SubModule.xml").is_file());
        assert!(list(&dirs).is_empty());
        assert!(locate(&dirs, "../x").is_err());
        let _ = fs::remove_dir_all(&root);
    }
}
