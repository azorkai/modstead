//! Mod klasörünü değiştiren işlemler. Her işlem bir günlük kaydı bırakır ve geri alınabilir;
//! hiçbir şey doğrudan silinmez, Modstead'in çöp kutusuna taşınır.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::{AppError, AppResult, fsx, tr};
use serde::{Deserialize, Serialize};

use crate::scan::{self, ModInfo};
use crate::util::{self, move_path};
use crate::{Stardew, bail};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    Rename { from: String, to: String },
    Trash { original: String, trashed: String },
    Added { path: String },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: String,
    pub time: u64,
    /// toggle | uninstall | install | update | restore | profile | smapi | launch | save-restore
    pub kind: String,
    pub title: String,
    pub details: Vec<String>,
    pub actions: Vec<Action>,
    pub undone: bool,
    /// Vadi'den aktarılan kayıt: geçmiş olarak gösterilir, geri alınamaz (eski dosyalara dokunulmaz).
    #[serde(default)]
    pub legacy: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TrashMeta {
    pub id: String,
    pub original: String,
    pub rel: String,
    pub name: String,
    pub unique_id: Option<String>,
    pub version: Option<String>,
    pub reason: String,
    pub time: u64,
    pub size: u64,
}

const JOURNAL_MAX: usize = 300;

fn journal_path(game: &Stardew) -> PathBuf {
    game.data_file("journal.json")
}

pub fn list_journal(game: &Stardew) -> Vec<JournalEntry> {
    fsx::read_json(&journal_path(game))
}

pub fn record(game: &Stardew, kind: &str, title: String, details: Vec<String>, actions: Vec<Action>) -> AppResult<JournalEntry> {
    let entry = JournalEntry { id: fsx::short_id(), time: util::now_ms(), kind: kind.into(), title, details, actions, undone: false, legacy: false };
    let mut all = list_journal(game);
    all.insert(0, entry.clone());
    all.truncate(JOURNAL_MAX);
    fsx::write_json(&journal_path(game), &all)?;
    Ok(entry)
}

/// İşlemi yürütür; yarıda hata olsa bile yapılan adımları günlüğe yazar ki geri alınabilsin.
pub fn journaled(game: &Stardew, kind: &str, title: String, run: impl FnOnce(&mut Vec<Action>, &mut Vec<String>) -> AppResult<()>) -> AppResult<JournalEntry> {
    let mut actions = Vec::new();
    let mut details = Vec::new();
    match run(&mut actions, &mut details) {
        Ok(()) => record(game, kind, title, details, actions),
        Err(e) => {
            if !actions.is_empty() {
                let _ = record(game, kind, format!("{title} {}", tr!("(yarım kaldı)", "(incomplete)")), details, actions);
            }
            Err(e)
        }
    }
}

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

/// Bir klasörü (ya da dosyayı) çöp kutusuna taşır; geri yüklenebilmesi için üst bilgisini yazar.
pub fn trash_put(game: &Stardew, abs: &Path, rel: &str, info: Option<&ModInfo>, reason: &str) -> AppResult<PathBuf> {
    let id = format!("{}-{}", util::stamp(), &fsx::short_id()[..8]);
    let item = game.trash_dir().join(&id);
    let payload = item.join("data");
    let size = if abs.is_dir() { fsx::dir_stats(abs).0 } else { fs::metadata(abs).map(|m| m.len()).unwrap_or(0) };
    let meta = TrashMeta {
        id,
        original: s(abs),
        rel: rel.to_string(),
        name: info.map(|m| m.name.clone()).unwrap_or_else(|| abs.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()),
        unique_id: info.and_then(|m| m.unique_id.clone()),
        version: info.and_then(|m| m.version.clone()),
        reason: reason.into(),
        time: util::now_ms(),
        size,
    };
    fs::create_dir_all(&item)?;
    fsx::write_json(&item.join("meta.json"), &meta)?;
    if let Err(e) = move_path(abs, &payload) {
        let _ = fsx::remove_dir(&item);
        return Err(e);
    }
    Ok(payload)
}

fn find_mod<'a>(mods: &'a [ModInfo], rel: &str) -> Option<&'a ModInfo> {
    mods.iter().find(|m| m.folder.eq_ignore_ascii_case(rel))
}

pub fn set_enabled(game: &Stardew, folders: &[String], enabled: bool) -> AppResult<JournalEntry> {
    let _lock = game.ops_lock.lock().unwrap();
    game.ensure_game_closed()?;
    let mods_dir = game.mods_dir()?;
    let snapshot = scan::scan_mods(&mods_dir);
    let names: Vec<String> = folders.iter().filter_map(|f| find_mod(&snapshot.mods, f)).map(|m| m.name.clone()).collect();
    let n = names.len();
    let title = match (n, enabled) {
        (1, true) => tr!(format!("{} etkinleştirildi", names[0]), format!("{} enabled", names[0])),
        (1, false) => tr!(format!("{} devre dışı bırakıldı", names[0]), format!("{} disabled", names[0])),
        (_, true) => tr!(format!("{n} mod etkinleştirildi"), format!("{n} mods enabled")),
        (_, false) => tr!(format!("{n} mod devre dışı bırakıldı"), format!("{n} mods disabled")),
    };
    journaled(game, "toggle", title, |actions, details| {
        rename_toggle(&mods_dir, folders, enabled, actions)?;
        details.extend(names.iter().cloned());
        Ok(())
    })
}

fn rename_toggle(mods_dir: &Path, folders: &[String], enabled: bool, actions: &mut Vec<Action>) -> AppResult<()> {
    for rel in folders {
        let abs = fsx::resolve_under(mods_dir, rel)?;
        if !abs.is_dir() || fsx::is_link(&abs) {
            return Err(AppError::msg(format!("{}: {rel}", tr!("Mod klasörü bulunamadı", "Mod folder not found"))));
        }
        let name = abs.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let parent = abs.parent().unwrap_or(mods_dir).to_path_buf();
        let is_disabled = name.starts_with('.');
        if enabled {
            if let Some(comp) = Path::new(rel).parent().and_then(|p| p.components().find(|c| c.as_os_str().to_string_lossy().starts_with('.'))) {
                let group = comp.as_os_str().to_string_lossy().into_owned();
                return Err(AppError::msg(tr!(
                    format!("'{name}' devre dışı bir grup klasörünün ('{group}') içinde; önce o klasörü açın."),
                    format!("'{name}' is inside a disabled group folder ('{group}'); enable that folder first.")
                )));
            }
        }
        let target = match (enabled, is_disabled) {
            (true, true) => fsx::unique_child(&parent, name.trim_start_matches('.')),
            (false, false) => fsx::unique_child(&parent, &format!(".{name}")),
            _ => continue,
        };
        fs::rename(&abs, &target)?;
        actions.push(Action::Rename { from: s(&abs), to: s(&target) });
    }
    Ok(())
}

/// Birden fazla klasörü tek günlük kaydında açıp kapatır (profil uygulama için).
pub fn apply_toggles(game: &Stardew, enable: &[String], disable: &[String], title: String, details: Vec<String>) -> AppResult<JournalEntry> {
    let _lock = game.ops_lock.lock().unwrap();
    game.ensure_game_closed()?;
    let mods_dir = game.mods_dir()?;
    journaled(game, "profile", title, |actions, d| {
        rename_toggle(&mods_dir, disable, false, actions)?;
        rename_toggle(&mods_dir, enable, true, actions)?;
        d.extend(details);
        Ok(())
    })
}

pub fn uninstall(game: &Stardew, folders: &[String]) -> AppResult<JournalEntry> {
    let _lock = game.ops_lock.lock().unwrap();
    game.ensure_game_closed()?;
    let mods_dir = game.mods_dir()?;
    let snapshot = scan::scan_mods(&mods_dir);
    let names: Vec<String> = folders.iter().filter_map(|f| find_mod(&snapshot.mods, f)).map(|m| m.name.clone()).collect();
    let title = if names.len() == 1 { tr!(format!("{} kaldırıldı", names[0]), format!("{} removed", names[0])) } else { tr!(format!("{} mod kaldırıldı", names.len()), format!("{} mods removed", names.len())) };
    journaled(game, "uninstall", title, |actions, details| {
        for rel in folders {
            let abs = fsx::resolve_under(&mods_dir, rel)?;
            if !abs.exists() {
                continue;
            }
            let info = find_mod(&snapshot.mods, rel);
            let payload = trash_put(game, &abs, rel, info, tr!("Kaldırıldı", "Removed"))?;
            actions.push(Action::Trash { original: s(&abs), trashed: s(&payload) });
            details.push(info.map(|m| m.name.clone()).unwrap_or_else(|| rel.clone()));
        }
        Ok(())
    })
}

/// Günlükteki bir işlemi geri alır. Önce her adımın geri alınabilir olduğunu doğrular (yarım geri alma olmasın).
pub fn undo(game: &Stardew, id: &str) -> AppResult<JournalEntry> {
    let _lock = game.ops_lock.lock().unwrap();
    game.ensure_game_closed()?;
    let mut all = list_journal(game);
    let Some(idx) = all.iter().position(|e| e.id == id) else { bail!("Günlük kaydı bulunamadı.", "Journal entry not found.") };
    if all[idx].undone {
        bail!("Bu işlem zaten geri alınmış.", "This action has already been undone.");
    }
    if all[idx].legacy {
        bail!("Vadi'den aktarılan kayıtlar geri alınamaz.", "Entries imported from Vadi can't be undone.");
    }
    let entry = all[idx].clone();
    let trash_root = game.trash_dir();

    for a in entry.actions.iter().rev() {
        match a {
            Action::Rename { from, to } => {
                if !Path::new(to).exists() {
                    return Err(AppError::msg(tr!(format!("Geri alınamıyor: '{to}' artık yok."), format!("Can't undo: '{to}' no longer exists."))));
                }
                if Path::new(from).exists() {
                    return Err(AppError::msg(tr!(format!("Geri alınamıyor: '{from}' zaten var."), format!("Can't undo: '{from}' already exists."))));
                }
            }
            Action::Trash { trashed, .. } => {
                if !Path::new(trashed).exists() {
                    bail!("Geri alınamıyor: çöp kutusundaki kopya silinmiş.", "Can't undo: the copy in the trash was deleted.");
                }
            }
            Action::Added { .. } => {}
        }
    }

    for a in entry.actions.iter().rev() {
        match a {
            Action::Rename { from, to } => fs::rename(to, from)?,
            Action::Added { path } => {
                let p = Path::new(path);
                if p.exists() {
                    let rel = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    trash_put(game, p, &rel, None, tr!("Geri alınan kurulum", "Undone install"))?;
                }
            }
            Action::Trash { original, trashed } => {
                let target = Path::new(original);
                if target.exists() {
                    return Err(AppError::msg(tr!(format!("Geri alınamıyor: '{original}' dolu."), format!("Can't undo: '{original}' is occupied."))));
                }
                move_path(Path::new(trashed), target)?;
                if let Some(item) = Path::new(trashed).parent().filter(|i| i.starts_with(&trash_root)) {
                    let _ = fsx::remove_dir(item);
                }
            }
        }
    }
    all[idx].undone = true;
    fsx::write_json(&journal_path(game), &all)?;
    Ok(all[idx].clone())
}

pub fn list_trash(game: &Stardew) -> Vec<TrashMeta> {
    let mut out: Vec<TrashMeta> = fs::read_dir(game.trash_dir())
        .map(|rd| rd.flatten().filter_map(|e| serde_json::from_slice(&fs::read(e.path().join("meta.json")).ok()?).ok()).collect())
        .unwrap_or_default();
    out.sort_by(|a, b| b.time.cmp(&a.time));
    out
}

fn trash_item(game: &Stardew, id: &str) -> AppResult<PathBuf> {
    if id.is_empty() || id.contains(['/', '\\', '.', ':']) {
        bail!("Geçersiz çöp kutusu öğesi.", "Invalid trash item.");
    }
    let p = game.trash_dir().join(id);
    if !p.is_dir() {
        bail!("Çöp kutusu öğesi bulunamadı.", "Trash item not found.");
    }
    Ok(p)
}

pub fn restore_trash(game: &Stardew, id: &str) -> AppResult<JournalEntry> {
    let _lock = game.ops_lock.lock().unwrap();
    game.ensure_game_closed()?;
    let item = trash_item(game, id)?;
    let meta: TrashMeta = serde_json::from_slice(&fs::read(item.join("meta.json"))?)?;
    let mods_dir = game.ensure_mods_dir()?;
    let wanted = fsx::resolve_under(&mods_dir, &meta.rel).unwrap_or_else(|_| mods_dir.join(fsx::sanitize_name(&meta.name)));
    let target = if wanted.exists() {
        let name = wanted.file_name().unwrap_or_default().to_string_lossy().into_owned();
        fsx::unique_child(wanted.parent().unwrap_or(&mods_dir), &format!("{name} {}", tr!("(geri yüklendi)", "(restored)")))
    } else {
        wanted
    };
    move_path(&item.join("data"), &target)?;
    let _ = fsx::remove_dir(&item);
    record(game, "restore", tr!(format!("{} geri yüklendi", meta.name), format!("{} restored", meta.name)), vec![s(&target)], vec![Action::Added { path: s(&target) }])
}

pub fn delete_trash(game: &Stardew, id: Option<&str>) -> AppResult<u32> {
    let _lock = game.ops_lock.lock().unwrap();
    let ids: Vec<String> = match id {
        Some(i) => vec![i.to_string()],
        None => list_trash(game).into_iter().map(|m| m.id).collect(),
    };
    let mut n = 0;
    for i in ids {
        fsx::remove_dir(&trash_item(game, &i)?)?;
        n += 1;
    }
    Ok(n)
}

pub fn purge_trash(game: &Stardew, older_than_ms: u64) {
    let now = util::now_ms();
    for m in list_trash(game) {
        if now.saturating_sub(m.time) > older_than_ms {
            let _ = fsx::remove_dir(&game.trash_dir().join(&m.id));
        }
    }
}

/// Mod klasöründeki DLL ve çalıştırılabilir dosyaların SHA-256 özetleri (VirusTotal araması için).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHash {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

pub fn hash_mod_files(game: &Stardew, folder: &str) -> AppResult<Vec<FileHash>> {
    let dir = fsx::resolve_under(&game.mods_dir()?, folder)?;
    let mut out = Vec::new();
    for e in walkdir::WalkDir::new(&dir).follow_links(false).into_iter().flatten() {
        if !e.file_type().is_file() {
            continue;
        }
        let ext = e.path().extension().map(|x| x.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        if !["dll", "exe", "bat", "cmd", "ps1", "vbs", "js", "scr", "msi"].contains(&ext.as_str()) {
            continue;
        }
        out.push(FileHash {
            path: e.path().strip_prefix(&dir).unwrap_or(e.path()).to_string_lossy().into_owned(),
            size: e.metadata().map(|m| m.len()).unwrap_or(0),
            sha256: modstead_core::download::sha256_file(e.path())?,
        });
        if out.len() >= 400 {
            break;
        }
    }
    Ok(out)
}

pub fn read_config(game: &Stardew, folder: &str) -> AppResult<Option<String>> {
    let p = fsx::resolve_under(&game.mods_dir()?, folder)?.join("config.json");
    if !p.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&p)?;
    Ok(Some(String::from_utf8_lossy(&bytes).trim_start_matches('\u{feff}').to_string()))
}

/// config.json'u doğrulayıp yazar; eskisini yedekler.
pub fn write_config(game: &Stardew, folder: &str, text: &str) -> AppResult<()> {
    let _lock = game.ops_lock.lock().unwrap();
    if text.len() > 4 * 1024 * 1024 {
        bail!("config.json çok büyük.", "config.json is too large.");
    }
    let parsed: serde_json::Value = serde_json::from_str(text).map_err(|e| {
        AppError::msg(tr!(format!("Geçersiz JSON (satır {}, sütun {}): {e}", e.line(), e.column()), format!("Invalid JSON (line {}, column {}): {e}", e.line(), e.column())))
    })?;
    if !parsed.is_object() {
        bail!("config.json bir JSON nesnesi olmalı.", "config.json must be a JSON object.");
    }
    let dir = fsx::resolve_under(&game.mods_dir()?, folder)?;
    if !dir.is_dir() {
        return Err(AppError::msg(format!("{}: {folder}", tr!("Mod klasörü bulunamadı", "Mod folder not found"))));
    }
    let p = dir.join("config.json");
    if p.is_file() {
        let name = fsx::sanitize_name(&folder.replace(['\\', '/'], "_"));
        let backups = game.config_backups_dir();
        fs::create_dir_all(&backups)?;
        fs::copy(&p, backups.join(format!("{name}-{}.json", util::stamp())))?;
    }
    fsx::atomic_write(&p, text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::fixture;

    #[test]
    fn toggle_and_undo_roundtrip() {
        let f = fixture();
        f.add_mod("Alpha", "a.alpha");
        let e = set_enabled(&f.game, &["Alpha".into()], false).unwrap();
        assert!(f.mods().join(".Alpha").is_dir());
        assert!(!f.mods().join("Alpha").exists());
        undo(&f.game, &e.id).unwrap();
        assert!(f.mods().join("Alpha").is_dir());
        assert!(undo(&f.game, &e.id).is_err(), "aynı kayıt iki kez geri alınmamalı");
    }

    #[test]
    fn enabling_inside_disabled_group_is_refused() {
        let f = fixture();
        f.add_mod(".Group/Inner", "a.inner");
        fs::rename(f.mods().join(".Group/Inner"), f.mods().join(".Group/.Inner")).unwrap();
        assert!(set_enabled(&f.game, &[".Group\\.Inner".into()], true).is_err());
    }

    #[test]
    fn uninstall_goes_to_trash_and_restores() {
        let f = fixture();
        f.add_mod("Beta", "b.beta");
        let e = uninstall(&f.game, &["Beta".into()]).unwrap();
        assert!(!f.mods().join("Beta").exists());
        let trash = list_trash(&f.game);
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].unique_id.as_deref(), Some("b.beta"));
        undo(&f.game, &e.id).unwrap();
        assert!(f.mods().join("Beta").is_dir());
        assert!(list_trash(&f.game).is_empty());
    }

    #[test]
    fn trash_restore_and_delete() {
        let f = fixture();
        f.add_mod("Delta", "d.delta");
        uninstall(&f.game, &["Delta".into()]).unwrap();
        let id = list_trash(&f.game)[0].id.clone();
        assert!(restore_trash(&f.game, "../x").is_err());
        restore_trash(&f.game, &id).unwrap();
        assert!(f.mods().join("Delta").is_dir());
        uninstall(&f.game, &["Delta".into()]).unwrap();
        assert_eq!(delete_trash(&f.game, None).unwrap(), 1);
    }

    #[test]
    fn rejects_paths_outside_mods() {
        let f = fixture();
        assert!(set_enabled(&f.game, &["..\\..\\Windows".into()], false).is_err());
        assert!(uninstall(&f.game, &["C:\\Windows".into()]).is_err());
        assert!(read_config(&f.game, "../x").is_err());
    }

    #[test]
    fn config_write_validates_and_backs_up() {
        let f = fixture();
        f.add_mod("Gamma", "g.gamma");
        fs::write(f.mods().join("Gamma/config.json"), r#"{"a":1}"#).unwrap();
        assert!(write_config(&f.game, "Gamma", "{ broken").is_err());
        assert!(write_config(&f.game, "Gamma", "[1]").is_err());
        write_config(&f.game, "Gamma", r#"{"a":2}"#).unwrap();
        assert_eq!(read_config(&f.game, "Gamma").unwrap().unwrap(), r#"{"a":2}"#);
        assert_eq!(fs::read_dir(f.game.config_backups_dir()).unwrap().count(), 1);
    }
}
