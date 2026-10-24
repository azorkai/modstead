//! Kayıtlar: `<kullanıcı>\Saves\<platform kimliği>\<ad>.cok` (+ `.cok.cid`).
//!
//! `.cok` sıkıştırmasız bir ZIP'tir: `<ad>.SaveGameMetadata` (JSON: şehir adı, nüfus, para, harita, tema,
//! oyun tarihi, açık modlar), `<ad>.Texture` (önizleme) ve `<ad>.SaveGameData`. Önizleme dokusu 18 baytlık
//! bir başlık (sürüm, genişlik, yükseklik…) ve ardından zstd ile sıkıştırılmış RGBA8 piksellerdir; burada
//! PNG'ye çevrilip diskte önbelleklenir. Kayıt dosyalarına yalnızca geri yüklemede ve oyun kapalıyken yazılır.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use modstead_core::{AppError, AppResult, fsx, platform, tr};
use serde::Serialize;

use crate::{Cities2, bail};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SimDate {
    pub year: i64,
    pub month: i64,
    pub hour: i64,
    pub minute: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveInfo {
    /// `Saves`'e göre yol (`<kimlik>/<ad>.cok`).
    pub id: String,
    pub file: String,
    pub name: String,
    pub city_name: Option<String>,
    pub population: Option<u64>,
    pub money: Option<i64>,
    pub xp: Option<u64>,
    pub map_name: Option<String>,
    pub theme: Option<String>,
    pub sim_date: Option<SimDate>,
    pub auto_save: bool,
    pub game_mode: Option<String>,
    /// Kaydedilirken açık olan modlar (oyunun yazdığı adlarla).
    pub mods_enabled: Vec<String>,
    /// Açık seçenekler: leftHandTraffic, unlimitedMoney, unlockAll, unlockMapTiles; doğal afetler kapalıysa noDisasters.
    pub options: Vec<String>,
    pub size: u64,
    pub modified: i64,
    pub has_preview: bool,
    pub backups: u32,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveBackup {
    /// Yedek klasörüne göre yol.
    pub id: String,
    /// Ait olduğu kaydın kimliği (`<kimlik>/<ad>.cok`).
    pub save_id: String,
    pub name: String,
    pub created: i64,
    pub size: u64,
    /// "manual" | "mod-change" | "before-restore" | …
    pub reason: String,
}

fn mtime(path: &Path) -> i64 {
    fs::metadata(path).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn rel_id(base: &Path, path: &Path) -> String {
    path.strip_prefix(base).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// Kayıt dosyaları (en yenisi önce). Alt klasör derinliği 2: `Saves\<kimlik>\*.cok` ve `Saves\*.cok`.
pub fn save_files(saves_dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = walkdir::WalkDir::new(saves_dir)
        .follow_links(false)
        .max_depth(2)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file() && e.file_name().to_string_lossy().to_ascii_lowercase().ends_with(".cok"))
        .map(|e| e.into_path())
        .collect();
    out.sort_by_key(|p| std::cmp::Reverse(mtime(p)));
    out
}

/// `.cok` içinden bir girdiyi (adı sonekle eşleşen; Türkçe adlar ZIP'te bozuk kodlanabildiği için sonek) okur.
fn read_entry(path: &Path, suffix: &str, max: u64) -> AppResult<Option<Vec<u8>>> {
    let f = fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| AppError::msg(format!("{}: {e}", tr!("kayıt dosyası okunamadı", "could not read the save file"))))?;
    let idx = (0..zip.len()).find(|&i| zip.name_for_index(i).and_then(|r| r.ok()).is_some_and(|n| n.to_ascii_lowercase().ends_with(suffix)));
    let Some(idx) = idx else { return Ok(None) };
    let entry = zip.by_index(idx).map_err(AppError::other)?;
    if entry.size() > max {
        bail!("Kayıt girdisi beklenenden büyük.", "The save entry is larger than expected.");
    }
    let mut buf = Vec::with_capacity(entry.size() as usize);
    entry.take(max).read_to_end(&mut buf)?;
    Ok(Some(buf))
}

fn mod_names(v: Option<&serde_json::Value>) -> Vec<String> {
    v.and_then(|m| m.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| match x {
                    serde_json::Value::String(s) => Some(s.clone()),
                    serde_json::Value::Object(o) => ["displayName", "name", "id"].iter().find_map(|k| o.get(*k).and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_u64().map(|n| n.to_string())))),
                    serde_json::Value::Number(n) => Some(n.to_string()),
                    _ => None,
                })
                .take(400)
                .collect()
        })
        .unwrap_or_default()
}

pub fn read_save(saves_dir: &Path, path: &Path, backups: u32) -> SaveInfo {
    let file = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    let name = file.strip_suffix(".cok").unwrap_or(&file).to_string();
    let mut info = SaveInfo {
        id: rel_id(saves_dir, path),
        file,
        name,
        city_name: None,
        population: None,
        money: None,
        xp: None,
        map_name: None,
        theme: None,
        sim_date: None,
        auto_save: false,
        game_mode: None,
        mods_enabled: Vec::new(),
        options: Vec::new(),
        size: fs::metadata(path).map(|m| m.len()).unwrap_or(0),
        modified: mtime(path),
        has_preview: false,
        backups,
        error: None,
    };
    match read_entry(path, ".savegamemetadata", 4 * 1024 * 1024) {
        Ok(Some(bytes)) => {
            let text = String::from_utf8_lossy(&bytes);
            match serde_json::from_str::<serde_json::Value>(text.trim_start_matches('\u{feff}')) {
                Ok(m) => {
                    let s = |k: &str| m.get(k).and_then(|v| v.as_str()).map(str::to_string).filter(|v| !v.is_empty());
                    info.city_name = s("cityName");
                    info.map_name = s("mapName");
                    info.theme = s("theme");
                    info.game_mode = s("gameMode");
                    info.population = m.get("population").and_then(|v| v.as_u64());
                    info.money = m.get("money").and_then(|v| v.as_i64());
                    info.xp = m.get("xp").and_then(|v| v.as_u64());
                    info.auto_save = m.get("autoSave").and_then(|v| v.as_bool()).unwrap_or(false);
                    info.mods_enabled = mod_names(m.get("modsEnabled"));
                    info.has_preview = s("preview").is_some();
                    if let Some(d) = m.get("simulationDate") {
                        let g = |k: &str| d.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
                        info.sim_date = Some(SimDate { year: g("year"), month: g("month"), hour: g("hour"), minute: g("minute") });
                    }
                    if let Some(o) = m.get("options") {
                        let on = |k: &str| o.get(k).and_then(|v| v.as_bool()).unwrap_or(false);
                        for k in ["leftHandTraffic", "unlimitedMoney", "unlockAll", "unlockMapTiles"] {
                            if on(k) {
                                info.options.push(k.into());
                            }
                        }
                        if o.get("naturalDisasters").and_then(|v| v.as_bool()) == Some(false) {
                            info.options.push("noDisasters".into());
                        }
                    }
                }
                Err(e) => info.error = Some(format!("{}: {e}", tr!("kayıt bilgisi okunamadı", "could not read save info"))),
            }
        }
        Ok(None) => info.error = Some(tr!("Kayıt bilgisi yok", "No save info").into()),
        Err(e) => info.error = Some(e.to_string()),
    }
    info
}

pub fn list(game: &Cities2) -> Vec<SaveInfo> {
    let saves_dir = game.saves_dir();
    let backups = list_backups(game);
    save_files(&saves_dir)
        .into_iter()
        .map(|p| {
            let id = rel_id(&saves_dir, &p);
            let n = backups.iter().filter(|b| b.save_id == id).count() as u32;
            read_save(&saves_dir, &p, n)
        })
        .collect()
}

pub fn resolve_save(game: &Cities2, id: &str) -> AppResult<PathBuf> {
    if !id.to_ascii_lowercase().ends_with(".cok") {
        bail!("Geçersiz kayıt.", "Invalid save.");
    }
    let path = fsx::resolve_under(&game.saves_dir(), id)?;
    if !path.is_file() || fsx::is_link(&path) {
        return Err(AppError::NotFound(id.to_string()));
    }
    Ok(path)
}

// ───────────── Önizleme ─────────────

/// Önizleme dokusu → (genişlik, yükseklik, RGB8 satırları üstten alta).
pub fn decode_texture(bytes: &[u8]) -> Option<(u32, u32, Vec<u8>)> {
    const MAGIC: [u8; 4] = [0x28, 0xB5, 0x2F, 0xFD];
    if bytes.len() < 22 {
        return None;
    }
    let w = u16::from_le_bytes([bytes[2], bytes[3]]) as usize;
    let h = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
    if w == 0 || h == 0 || w > 4096 || h > 4096 {
        return None;
    }
    let pos = bytes.windows(4).take(256).position(|win| win == MAGIC)?;
    let raw = zstd::bulk::decompress(&bytes[pos..], w * h * 4).ok()?;
    let channels = if raw.len() == w * h * 4 {
        4
    } else if raw.len() == w * h * 3 {
        3
    } else {
        return None;
    };
    // Unity dokuları alttan üste saklanır: satırları ters çevirerek RGB'ye dönüştür.
    let mut rgb = Vec::with_capacity(w * h * 3);
    for y in (0..h).rev() {
        let row = &raw[y * w * channels..(y + 1) * w * channels];
        for px in row.chunks_exact(channels) {
            rgb.extend_from_slice(&px[..3]);
        }
    }
    Some((w as u32, h as u32, rgb))
}

/// 2×2 kutu süzgeciyle yarıya küçültür.
fn half(w: u32, h: u32, rgb: &[u8]) -> (u32, u32, Vec<u8>) {
    let (nw, nh) = ((w / 2).max(1), (h / 2).max(1));
    let mut out = Vec::with_capacity((nw * nh * 3) as usize);
    for y in 0..nh {
        for x in 0..nw {
            for c in 0..3 {
                let mut sum = 0u32;
                for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                    let (sx, sy) = ((x * 2 + dx).min(w - 1), (y * 2 + dy).min(h - 1));
                    sum += rgb[((sy * w + sx) * 3 + c) as usize] as u32;
                }
                out.push((sum / 4) as u8);
            }
        }
    }
    (nw, nh, out)
}

fn encode_png(w: u32, h: u32, rgb: &[u8]) -> AppResult<Vec<u8>> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        let mut writer = enc.write_header().map_err(AppError::other)?;
        writer.write_image_data(rgb).map_err(AppError::other)?;
    }
    Ok(out)
}

/// FNV-1a (önbellek anahtarı için; güvenlik amacı yok).
fn fnv(text: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in text.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

/// Kaydın önizlemesi (PNG). Önbellek anahtarı yol + boyut + değişiklik zamanıdır; kayıt değişince yenisi üretilir.
pub fn preview_png(game: &Cities2, id: &str, large: bool) -> AppResult<Option<Vec<u8>>> {
    let path = resolve_save(game, id)?;
    let meta = fs::metadata(&path)?;
    let key = fnv(&format!("{}|{}|{}|{large}", fsx::norm_key(&path), meta.len(), mtime(&path)));
    let cached = game.cache_path("previews").join(format!("{key}.png"));
    if let Ok(bytes) = fs::read(&cached) {
        return Ok(Some(bytes));
    }
    let Some(tex) = read_entry(&path, ".texture", 32 * 1024 * 1024)? else { return Ok(None) };
    let Some((w, h, rgb)) = decode_texture(&tex) else { return Ok(None) };
    let (w, h, rgb) = if large { (w, h, rgb) } else { half(w, h, &rgb) };
    let png = encode_png(w, h, &rgb)?;
    let _ = fsx::atomic_write(&cached, &png);
    Ok(Some(png))
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

// ───────────── Yedekler ─────────────

/// Yedek adı: `<YYYYMMDD-HHMMSS>__<neden>.cok`, kaydın kimliğiyle aynı klasör yapısında.
pub fn list_backups(game: &Cities2) -> Vec<SaveBackup> {
    let root = game.save_backups_dir();
    let mut out: Vec<SaveBackup> = walkdir::WalkDir::new(&root)
        .follow_links(false)
        .max_depth(4)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file() && e.file_name().to_string_lossy().ends_with(".cok"))
        .filter_map(|e| {
            let path = e.path();
            let file = e.file_name().to_string_lossy().into_owned();
            let stem = file.strip_suffix(".cok")?;
            let (stamp, reason) = stem.split_once("__").unwrap_or((stem, "manual"));
            let reason = reason.split(' ').next().unwrap_or(reason).trim_end_matches(|c: char| c.is_ascii_digit() || c == '-');
            // <kök>/<kayıt kimliği klasörü>/<ad>.cok/<yedek>.cok → kayıt kimliği = aradaki yol
            let save_dir = path.parent()?;
            let save_id = rel_id(&root, save_dir);
            Some(SaveBackup {
                id: rel_id(&root, path),
                name: save_dir.file_name()?.to_string_lossy().trim_end_matches(".cok").to_string(),
                save_id,
                // Windows'ta kopya, kaynağın değişiklik zamanını korur: yedeğin zamanı adından okunur.
                created: stamp_time(stamp).unwrap_or_else(|| mtime(path)),
                size: e.metadata().map(|m| m.len()).unwrap_or(0),
                reason: reason.to_string(),
            })
        })
        .collect();
    out.sort_by(|a, b| b.created.cmp(&a.created).then_with(|| b.id.cmp(&a.id)));
    out
}

fn stamp_time(stamp: &str) -> Option<i64> {
    use chrono::TimeZone;
    let naive = chrono::NaiveDateTime::parse_from_str(stamp, "%Y%m%d-%H%M%S").ok()?;
    chrono::Local.from_local_datetime(&naive).earliest().map(|t| t.timestamp())
}

/// `dir` altında `<ad>.cok` boşsa onu, doluysa `<ad>-2.cok`, `<ad>-3.cok`…
fn unique_cok(dir: &Path, stem: &str) -> PathBuf {
    (1..1000).map(|i| if i == 1 { dir.join(format!("{stem}.cok")) } else { dir.join(format!("{stem}-{i}.cok")) }).find(|p| !p.exists()).unwrap_or_else(|| dir.join(format!("{stem}-{}.cok", fsx::short_id())))
}

fn ensure_space(target_dir: &Path, need: u64) -> AppResult<()> {
    let probe = target_dir.ancestors().find(|a| a.exists()).unwrap_or(target_dir);
    if let Some(free) = platform::disk_free(probe) {
        if free < need + 256 * 1024 * 1024 {
            bail!(
                format!("Yedek için yeterli boş alan yok ({} MB gerekli). Ayarlar'dan yedek klasörünü başka bir sürücüye taşıyın.", need / 1_048_576 + 256),
                format!("Not enough free space for the backup ({} MB needed). Move the backup folder to another drive in Settings.", need / 1_048_576 + 256)
            );
        }
    }
    Ok(())
}

fn sidecar(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(".cid");
    PathBuf::from(s)
}

pub fn backup(game: &Cities2, id: &str, reason: &str) -> AppResult<SaveBackup> {
    let src = resolve_save(game, id)?;
    let dir = fsx::resolve_under(&game.save_backups_dir(), id)?;
    let size = fs::metadata(&src)?.len();
    ensure_space(&dir, size)?;
    fs::create_dir_all(&dir)?;
    let reason: String = reason.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(24).collect();
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let target = unique_cok(&dir, &format!("{stamp}__{}", if reason.is_empty() { "manual" } else { &reason }));
    let tmp = target.with_extension("cok.part");
    fs::copy(&src, &tmp)?;
    fs::rename(&tmp, &target)?;
    if sidecar(&src).is_file() {
        let _ = fs::copy(sidecar(&src), sidecar(&target));
    }
    prune(game, id, &target);
    list_backups(game).into_iter().find(|b| game.save_backups_dir().join(&b.id) == target).ok_or_else(|| AppError::msg(tr!("Yedek oluşturulamadı.", "The backup could not be created.")))
}

/// Kayıt başına en fazla `save_backups_keep` yedek kalır (0 = sınırsız); az önce alınan yedek hiç silinmez.
fn prune(game: &Cities2, id: &str, newest: &Path) {
    let keep = game.settings().save_backups_keep as usize;
    if keep == 0 {
        return;
    }
    let root = game.save_backups_dir();
    let others = list_backups(game).into_iter().filter(|b| b.save_id == id && root.join(&b.id) != newest);
    for b in others.skip(keep - 1) {
        let p = root.join(&b.id);
        let _ = fs::remove_file(sidecar(&p));
        let _ = fs::remove_file(p);
    }
}

/// Mod değişikliğinden önce en son kaydı yedekler (ayar açıksa). Hata kurulumu durdurmaz.
pub fn backup_latest(game: &Cities2, reason: &str) -> Option<String> {
    if !game.settings().backup_before_changes {
        return None;
    }
    let saves_dir = game.saves_dir();
    let latest = save_files(&saves_dir).into_iter().next()?;
    let id = rel_id(&saves_dir, &latest);
    match backup(game, &id, reason) {
        Ok(_) => Some(id),
        Err(e) => {
            log::warn!("kayıt yedeklenemedi ({id}): {e}");
            None
        }
    }
}

pub fn restore(game: &Cities2, save_id: &str, backup_id: &str) -> AppResult<()> {
    game.ensure_game_closed()?;
    let src = fsx::resolve_under(&game.save_backups_dir(), backup_id)?;
    if !src.is_file() || fsx::is_link(&src) || !backup_id.starts_with(&format!("{}/", save_id.trim_end_matches('/'))) {
        return Err(AppError::NotFound(backup_id.to_string()));
    }
    let target = fsx::resolve_under(&game.saves_dir(), save_id)?;
    if target.is_file() {
        backup(game, save_id, "before-restore")?;
    }
    if let Some(dir) = target.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = target.with_extension("cok.modstead-tmp");
    fs::copy(&src, &tmp)?;
    if target.exists() {
        fs::remove_file(&target)?;
    }
    fs::rename(&tmp, &target)?;
    if sidecar(&src).is_file() {
        let _ = fs::copy(sidecar(&src), sidecar(&target));
    }
    Ok(())
}

pub fn delete_backup(game: &Cities2, backup_id: &str) -> AppResult<()> {
    let path = fsx::resolve_under(&game.save_backups_dir(), backup_id)?;
    if !backup_id.ends_with(".cok") || !path.is_file() {
        return Err(AppError::NotFound(backup_id.to_string()));
    }
    let _ = fs::remove_file(sidecar(&path));
    fs::remove_file(path)?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests_support {
    use super::*;
    use std::io::Write;

    /// Gerçek biçimde küçük bir kayıt: sıkıştırmasız ZIP, BOM'lu meta veri, zstd'li 4×2 doku.
    pub fn write_cok(path: &Path, city: &str) {
        let f = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(f);
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file(format!("{city}.SaveGameMetadata"), opts).unwrap();
        let meta = format!(
            "\u{feff}{{\"preview\":\"ab\",\"theme\":\"European\",\"cityName\":\"{city}\",\"population\":18944,\"money\":370555,\"xp\":5,\
            \"simulationDate\":{{\"year\":2027,\"month\":3,\"hour\":4,\"minute\":31}},\"options\":{{\"leftHandTraffic\":true,\"naturalDisasters\":false}},\
            \"mapName\":\"Barrier Island\",\"modsEnabled\":[\"Traffic\",{{\"name\":\"Move It\"}}],\"autoSave\":false,\"gameMode\":\"NormalMode\"}}"
        );
        zip.write_all(meta.as_bytes()).unwrap();
        zip.start_file(format!("{city}.Texture"), opts).unwrap();
        let (w, h) = (4u16, 2u16);
        // alt satır kırmızı, üst satır mavi (Unity alttan üste saklar)
        let mut px = Vec::new();
        for _ in 0..w {
            px.extend_from_slice(&[255, 0, 0, 255]);
        }
        for _ in 0..w {
            px.extend_from_slice(&[0, 0, 255, 255]);
        }
        let packed = zstd::bulk::compress(&px, 3).unwrap();
        let mut tex = vec![5, 0];
        tex.extend_from_slice(&w.to_le_bytes());
        tex.extend_from_slice(&h.to_le_bytes());
        tex.extend_from_slice(&[1, 0, 1, 8, 2, 2, 1, 16]);
        tex.extend_from_slice(&(packed.len() as u32).to_le_bytes());
        tex.extend_from_slice(&packed);
        zip.write_all(&tex).unwrap();
        zip.start_file(format!("{city}.SaveGameData"), opts).unwrap();
        zip.write_all(b"data").unwrap();
        zip.finish().unwrap();
        fs::write(sidecar(path), "cid").unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::tests_support::write_cok;
    use crate::testkit::fixture;

    #[test]
    fn reads_metadata_and_preview() {
        let fx = fixture();
        let dir = fx.game.saves_dir().join("2533274879948927");
        fs::create_dir_all(&dir).unwrap();
        write_cok(&dir.join("Düzce.cok"), "Düzce");
        let saves = list(&fx.game);
        assert_eq!(saves.len(), 1);
        let s = &saves[0];
        assert_eq!(s.id, "2533274879948927/Düzce.cok");
        assert_eq!(s.city_name.as_deref(), Some("Düzce"));
        assert_eq!(s.population, Some(18944));
        assert_eq!(s.mods_enabled, vec!["Traffic".to_string(), "Move It".to_string()]);
        assert_eq!(s.options, vec!["leftHandTraffic".to_string(), "noDisasters".to_string()]);
        assert!(s.has_preview);

        let tex = read_entry(&dir.join("Düzce.cok"), ".texture", 1 << 20).unwrap().unwrap();
        let (w, h, rgb) = decode_texture(&tex).unwrap();
        assert_eq!((w, h), (4, 2));
        assert_eq!(&rgb[..3], &[0, 0, 255], "üst satır mavi olmalı (satırlar çevrildi)");
        let png = preview_png(&fx.game, &s.id, true).unwrap().unwrap();
        assert!(png.starts_with(b"\x89PNG"));
        assert!(preview_png(&fx.game, "../x.cok", true).is_err());
    }

    #[test]
    fn backs_up_restores_and_prunes() {
        let fx = fixture();
        fx.game.update_settings(|s| s.save_backups_keep = 2).unwrap();
        let dir = fx.game.saves_dir().join("123");
        fs::create_dir_all(&dir).unwrap();
        write_cok(&dir.join("Babaeski.cok"), "Babaeski");
        let id = "123/Babaeski.cok";
        let b1 = backup(&fx.game, id, "manual").unwrap();
        assert_eq!(b1.save_id, id);
        assert!(sidecar(&fx.game.save_backups_dir().join(&b1.id)).is_file(), ".cid yan dosyası da yedeklenmeli");
        backup(&fx.game, id, "mod-change").unwrap();
        backup(&fx.game, id, "manual").unwrap();
        assert_eq!(list_backups(&fx.game).len(), 2, "en fazla 2 yedek kalmalı");

        fs::write(dir.join("Babaeski.cok"), b"bozuk").unwrap();
        let last = list_backups(&fx.game).into_iter().next().unwrap();
        restore(&fx.game, id, &last.id).unwrap();
        assert!(read_save(&fx.game.saves_dir(), &dir.join("Babaeski.cok"), 0).city_name.is_some(), "geri yüklenen kayıt okunmalı");
        assert!(restore(&fx.game, "123/Other.cok", &last.id).is_err(), "yedek başka kayda yüklenemez");
        delete_backup(&fx.game, &last.id).unwrap();
    }

    #[test]
    fn encodes_base64() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }
}
