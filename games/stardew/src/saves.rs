//! Oyun kayıtlarını listeler, zip olarak yedekler ve geri yükler. Geri yüklemeden önce mevcut
//! kayıt da yedeklenir; yani geri yükleme de geri alınabilir. Yedekler güvenli arşiv açıcıyla
//! (çekirdeğin `archive` modülü) açılır.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use modstead_core::{AppError, AppResult, JobHandle, archive, fsx, tr};
use serde::Serialize;

use crate::{Stardew, bail, detect, util};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveBackup {
    pub file: String,
    pub created: u64,
    pub size: u64,
    /// elle | oyun-oncesi | geri-yukleme-oncesi (dosya adından)
    pub reason: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveInfo {
    pub folder: String,
    pub farmer: Option<String>,
    pub farm: Option<String>,
    pub money: Option<i64>,
    pub day: Option<u32>,
    pub season: Option<u32>,
    pub year: Option<u32>,
    pub played_ms: Option<u64>,
    pub modified: u64,
    pub size: u64,
    pub backups: Vec<SaveBackup>,
}

pub fn saves_dir() -> AppResult<PathBuf> {
    detect::appdata_dir().map(|d| d.join("Saves")).ok_or_else(|| AppError::msg(tr!("Kayıt klasörü bulunamadı (%APPDATA%).", "Saves folder not found (%APPDATA%).")))
}

/// Belgenin ilk düzeyindeki `<ad>değer</ad>` etiketini okur (envanterdeki iç içe `name` etiketlerine takılmaz,
/// çünkü SaveGameInfo'da çiftçinin adı ilk sırada gelir).
fn tag(xml: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find('<')? + start;
    let v = xml[start..end].trim();
    (!v.is_empty()).then(|| v.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&apos;", "'").replace("&quot;", "\""))
}

struct Summary {
    farmer: Option<String>,
    farm: Option<String>,
    money: Option<i64>,
    day: Option<u32>,
    season: Option<u32>,
    year: Option<u32>,
    played_ms: Option<u64>,
}

fn read_info(dir: &Path) -> Option<Summary> {
    let bytes = fs::read(dir.join("SaveGameInfo")).ok()?;
    let xml = String::from_utf8_lossy(&bytes);
    Some(Summary {
        farmer: tag(&xml, "name"),
        farm: tag(&xml, "farmName"),
        money: tag(&xml, "money").and_then(|v| v.parse().ok()),
        day: tag(&xml, "dayOfMonthForSaveGame").and_then(|v| v.parse().ok()),
        season: tag(&xml, "seasonForSaveGame").and_then(|v| v.parse().ok()),
        year: tag(&xml, "yearForSaveGame").and_then(|v| v.parse().ok()),
        played_ms: tag(&xml, "millisecondsPlayed").and_then(|v| v.parse().ok()),
    })
}

fn backup_dir(game: &Stardew, folder: &str) -> PathBuf {
    game.save_backups_dir().join(fsx::sanitize_name(folder))
}

fn list_backups(game: &Stardew, folder: &str) -> Vec<SaveBackup> {
    let mut out: Vec<SaveBackup> = fs::read_dir(backup_dir(game, folder))
        .map(|rd| {
            rd.flatten()
                .filter(|e| e.path().extension().is_some_and(|x| x == "zip"))
                .map(|e| {
                    let file = e.file_name().to_string_lossy().into_owned();
                    let reason = file.trim_end_matches(".zip").split_once("__").map(|(_, r)| r.to_string()).unwrap_or_else(|| "elle".into());
                    SaveBackup { created: util::mtime_ms(&e.path()), size: e.metadata().map(|m| m.len()).unwrap_or(0), file, reason }
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| b.created.cmp(&a.created));
    out
}

pub fn list(game: &Stardew) -> AppResult<Vec<SaveInfo>> {
    list_in(game, &saves_dir()?)
}

fn list_in(game: &Stardew, dir: &Path) -> AppResult<Vec<SaveInfo>> {
    let Ok(rd) = fs::read_dir(dir) else { return Ok(Vec::new()) };
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if !p.is_dir() || fsx::is_link(&p) || !p.join("SaveGameInfo").is_file() {
            continue;
        }
        let folder = e.file_name().to_string_lossy().into_owned();
        let s = read_info(&p).unwrap_or(Summary { farmer: None, farm: None, money: None, day: None, season: None, year: None, played_ms: None });
        out.push(SaveInfo {
            backups: list_backups(game, &folder),
            modified: util::mtime_ms(&p.join("SaveGameInfo")),
            size: fsx::dir_stats(&p).0,
            folder,
            farmer: s.farmer,
            farm: s.farm,
            money: s.money,
            day: s.day,
            season: s.season,
            year: s.year,
            played_ms: s.played_ms,
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

fn zip_dir(src: &Path, dest: &Path) -> AppResult<()> {
    use zip::write::SimpleFileOptions;
    let tmp = dest.with_extension("zip.tmp");
    let result = (|| -> AppResult<()> {
        let mut z = zip::ZipWriter::new(fs::File::create(&tmp)?);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for e in walkdir::WalkDir::new(src).min_depth(1).follow_links(false).into_iter().flatten() {
            let rel = e.path().strip_prefix(src).unwrap_or(e.path()).to_string_lossy().replace('\\', "/");
            if e.file_type().is_dir() {
                z.add_directory(rel, opts).map_err(AppError::other)?;
            } else if e.file_type().is_file() {
                z.start_file(rel, opts).map_err(AppError::other)?;
                z.write_all(&fs::read(e.path())?)?;
            }
        }
        z.finish().map_err(AppError::other)?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    fs::rename(&tmp, dest)?;
    Ok(())
}

pub fn backup(game: &Stardew, folder: &str, reason: &str) -> AppResult<SaveBackup> {
    backup_in(game, &saves_dir()?, folder, reason)
}

fn backup_in(game: &Stardew, saves: &Path, folder: &str, reason: &str) -> AppResult<SaveBackup> {
    let src = fsx::resolve_under(saves, folder)?;
    if !src.join("SaveGameInfo").is_file() {
        return Err(AppError::msg(format!("{}: {folder}", tr!("Kayıt bulunamadı", "Save not found"))));
    }
    let dir = backup_dir(game, folder);
    fs::create_dir_all(&dir)?;
    let dest = fsx::unique_child(&dir, &format!("{}__{reason}.zip", util::stamp()));
    zip_dir(&src, &dest)?;
    let keep = game.settings().save_backups_keep.max(1) as usize;
    for old in list_backups(game, folder).into_iter().skip(keep) {
        let _ = fs::remove_file(dir.join(old.file));
    }
    Ok(SaveBackup { file: dest.file_name().unwrap_or_default().to_string_lossy().into_owned(), created: util::now_ms(), size: fs::metadata(&dest).map(|m| m.len()).unwrap_or(0), reason: reason.into() })
}

pub fn backup_all(game: &Stardew, reason: &str) -> AppResult<u32> {
    let saves = saves_dir()?;
    let mut n = 0;
    for s in list_in(game, &saves)? {
        backup_in(game, &saves, &s.folder, reason)?;
        n += 1;
    }
    Ok(n)
}

fn backup_file(game: &Stardew, folder: &str, file: &str) -> AppResult<PathBuf> {
    if file.contains(['/', '\\', ':']) || !file.ends_with(".zip") || file.starts_with('.') {
        bail!("Geçersiz yedek dosyası.", "Invalid backup file.");
    }
    let p = backup_dir(game, folder).join(file);
    if !p.is_file() {
        bail!("Yedek bulunamadı.", "Backup not found.");
    }
    Ok(p)
}

pub fn restore(game: &Stardew, folder: &str, file: &str) -> AppResult<()> {
    restore_in(game, &saves_dir()?, folder, file)?;
    let _ = crate::ops::record(game, "save-restore", tr!(format!("{folder} kaydı geri yüklendi"), format!("Restored save {folder}")), vec![file.to_string()], vec![]);
    Ok(())
}

fn restore_in(game: &Stardew, saves: &Path, folder: &str, file: &str) -> AppResult<()> {
    if game.is_running() {
        return Err(AppError::GameRunning(crate::INFO.name.into()));
    }
    let zip_path = backup_file(game, folder, file)?;
    let target = fsx::resolve_under(saves, folder)?;
    if target.join("SaveGameInfo").is_file() {
        backup_in(game, saves, folder, "geri-yukleme-oncesi")?;
    }
    let tmp = saves.join(format!(".modstead-restore-{}", fsx::short_id()));
    let result = (|| -> AppResult<()> {
        let kind = archive::detect(&zip_path)?;
        archive::extract(&zip_path, kind, &tmp, &JobHandle::detached("save-restore"))?;
        if !tmp.join("SaveGameInfo").is_file() {
            bail!("Yedek dosyası bozuk görünüyor (SaveGameInfo yok).", "The backup looks corrupt (no SaveGameInfo).");
        }
        let old = saves.join(format!(".modstead-old-{}", fsx::short_id()));
        if target.exists() {
            fs::rename(&target, &old)?;
        }
        if let Err(e) = fs::rename(&tmp, &target) {
            let _ = fs::rename(&old, &target);
            return Err(e.into());
        }
        let _ = fsx::remove_dir(&old);
        Ok(())
    })();
    let _ = fsx::remove_dir(&tmp);
    result
}

pub fn delete_backup(game: &Stardew, folder: &str, file: &str) -> AppResult<()> {
    fs::remove_file(backup_file(game, folder, file)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::fixture;

    #[test]
    fn reads_first_level_tags() {
        let xml = "<?xml?><Farmer><name>Deniz</name><items><Item><name>Galaxy Sword</name></Item></items><farmName>Lovely &amp; Co</farmName><money>234262</money></Farmer>";
        assert_eq!(tag(xml, "name").as_deref(), Some("Deniz"));
        assert_eq!(tag(xml, "farmName").as_deref(), Some("Lovely & Co"));
        assert_eq!(tag(xml, "money").as_deref(), Some("234262"));
        assert_eq!(tag(xml, "missing"), None);
    }

    #[test]
    fn backup_restore_roundtrip_backs_up_current_first() {
        let f = fixture();
        let saves = f.root.join("Saves");
        let save = saves.join("Farm_123");
        fs::create_dir_all(&save).unwrap();
        fs::write(save.join("SaveGameInfo"), "<Farmer><name>Eda</name><money>500</money></Farmer>").unwrap();
        fs::write(save.join("Farm_123"), "gün 1").unwrap();

        let listed = list_in(&f.game, &saves).unwrap();
        assert_eq!(listed[0].farmer.as_deref(), Some("Eda"));
        let b = backup_in(&f.game, &saves, "Farm_123", "elle").unwrap();
        fs::write(save.join("Farm_123"), "gün 2").unwrap();

        restore_in(&f.game, &saves, "Farm_123", &b.file).unwrap();
        assert_eq!(fs::read_to_string(save.join("Farm_123")).unwrap(), "gün 1");
        let backups = list_backups(&f.game, "Farm_123");
        assert_eq!(backups.len(), 2, "geri yüklemeden önce mevcut kayıt yedeklenmeli");
        assert!(backups.iter().any(|b| b.reason == "geri-yukleme-oncesi"));
        assert!(restore_in(&f.game, &saves, "Farm_123", "..\\x.zip").is_err());
        assert!(backup_in(&f.game, &saves, "../Farm_123", "elle").is_err());
    }
}
