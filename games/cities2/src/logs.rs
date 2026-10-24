//! Oyunun günlükleri: `<kullanıcı>\Player.log` (Unity), `<kullanıcı>\Logs\*.log` (oyunun alt sistemleri:
//! Modding, PdxSdk, UI…; modlar da buraya `<ModAdı>.log` yazar). Son oturumun hataları özetlenir ve
//! mümkünse kurulu bir modla eşlenir (yığın izlerinde ad alanı ya da DLL adı geçer).

use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use modstead_core::{AppError, AppResult, fsx};
use serde::Serialize;

use crate::mods::ModEntry;

/// Her günlüğün yalnızca sonu okunur.
const TAIL_BYTES: u64 = 2 * 1024 * 1024;
const MAX_LINES: usize = 80;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogFile {
    /// `Player.log` ya da `Logs/<ad>.log`
    pub name: String,
    pub size: u64,
    pub modified: i64,
    pub errors: u32,
    pub warnings: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub file: String,
    /// "error" | "warn"
    pub level: &'static str,
    pub text: String,
    /// Eşleşen modun anahtarı (`pdx:…` / `local:…`).
    pub mod_key: Option<String>,
    pub count: u32,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogReport {
    pub dir: String,
    pub files: Vec<LogFile>,
    /// Benzersiz hata/uyarı satırları (tekrar sayısıyla), en çok tekrar eden önce.
    pub lines: Vec<LogLine>,
    pub game_version: Option<String>,
    pub modding_runtime: Option<String>,
    pub gpu: Option<String>,
    /// Son 7 günde çökme dökümü sayısı.
    pub crashes: u32,
    pub last_crash: Option<i64>,
}

fn mtime(path: &Path) -> i64 {
    fs::metadata(path).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Dosyanın son `max` baytı (UTF-8 kayıplı).
pub fn tail(path: &Path, max: u64) -> std::io::Result<String> {
    let mut f = fs::File::open(path)?;
    let len = f.metadata()?.len();
    if len > max {
        f.seek(SeekFrom::Start(len - max))?;
    }
    let mut buf = Vec::new();
    f.take(max).read_to_end(&mut buf)?;
    let text = String::from_utf8_lossy(&buf).into_owned();
    // Kesilen ilk satırı at.
    Ok(if len > max { text.split_once('\n').map(|(_, r)| r.to_string()).unwrap_or(text) } else { text })
}

pub fn log_files(user_dir: &Path) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = ["Player.log", "Player-prev.log"].iter().map(|f| user_dir.join(f)).filter(|p| p.is_file()).collect();
    let mut sub: Vec<PathBuf> = fs::read_dir(user_dir.join("Logs"))
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|x| x.eq_ignore_ascii_case("log")))
        .collect();
    sub.sort_by_key(|p| std::cmp::Reverse(mtime(p)));
    out.extend(sub);
    out
}

fn display_name(user_dir: &Path, path: &Path) -> String {
    path.strip_prefix(user_dir).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// Satırın düzeyi: oyunun `[ERROR]`/`[WARN]` biçimi ve Unity istisnaları.
fn level_of(line: &str) -> Option<&'static str> {
    let l = line.trim();
    if l.contains("[ERROR]") || l.contains("[CRITICAL]") || l.contains("[FATAL]") || (l.contains("Exception") && !l.starts_with("at ") && !l.starts_with("  at ")) {
        Some("error")
    } else if l.contains("[WARN]") {
        Some("warn")
    } else {
        None
    }
}

/// Satırdan zaman damgasını ve tekrar eden sayıları atarak tekrarları birleştirmek için anahtar.
fn normalize(line: &str) -> String {
    let l = line.trim();
    let l = if l.starts_with('[') && l.len() > 26 && l.as_bytes().get(24) == Some(&b']') { l[25..].trim_start() } else { l };
    l.chars().take(400).collect()
}

/// Bilinen gürültü (oyunun kendi zararsız uyarıları).
fn is_noise(text: &str) -> bool {
    const NOISE: &[&str] = &["Unsupported CSS property", "Custom CSS expressions are not supported", "Unable to parse declaration", "Transitioned property has been changed", "JobTempAlloc has allocations"];
    NOISE.iter().any(|n| text.contains(n))
}

/// Satırı bir moda bağlar: modun DLL adı (uzantısız) ya da adı satırda geçiyorsa.
fn match_mod(text: &str, mods: &[ModEntry]) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    mods.iter()
        .find(|m| {
            m.dlls.iter().filter(|d| !d.contains('/')).any(|d| {
                let stem = d.trim_end_matches(".dll").trim_end_matches(".DLL").to_ascii_lowercase();
                stem.len() >= 4 && lower.contains(&stem)
            })
        })
        .map(|m| m.key.clone())
}

pub fn report(user_dir: &Path, mods: &[ModEntry]) -> LogReport {
    let mut rep = LogReport { dir: user_dir.join("Logs").to_string_lossy().into_owned(), ..Default::default() };
    let mut lines: Vec<LogLine> = Vec::new();
    for path in log_files(user_dir) {
        let name = display_name(user_dir, &path);
        let Ok(text) = tail(&path, TAIL_BYTES) else { continue };
        let (mut errors, mut warnings) = (0, 0);
        // Önceki oturum günlüğü yalnızca listelenir; hatalar son oturumdan.
        let current = name != "Player-prev.log";
        let all: Vec<&str> = text.lines().collect();
        for (i, line) in all.iter().enumerate() {
            let line = *line;
            if name == "Player.log" {
                if let Some(v) = line.strip_prefix("Game version:") {
                    rep.game_version = v.split_whitespace().next().map(str::to_string);
                } else if let Some(v) = line.strip_prefix("Modding runtime:") {
                    rep.modding_runtime = Some(v.trim().to_string());
                } else if let Some(v) = line.strip_prefix("Graphics device:") {
                    rep.gpu = Some(v.split(" (").next().unwrap_or(v).trim().to_string());
                }
            }
            let Some(level) = level_of(line) else { continue };
            if is_noise(line) {
                continue;
            }
            if level == "error" {
                errors += 1;
            } else {
                warnings += 1;
            }
            if !current {
                continue;
            }
            let key = normalize(line);
            if let Some(existing) = lines.iter_mut().find(|l| l.text == key && l.file == name) {
                existing.count += 1;
            } else if lines.len() < 500 {
                // İstisna satırında mod adı geçmiyorsa ardından gelen yığın izine bak.
                let frames: String = all.iter().skip(i + 1).take(6).take_while(|l| l.trim_start().starts_with("at ")).copied().collect::<Vec<_>>().join("
");
                let mod_key = match_mod(&key, mods).or_else(|| match_mod(&frames, mods));
                lines.push(LogLine { file: name.clone(), level, mod_key, text: key, count: 1 });
            }
        }
        rep.files.push(LogFile { name, size: fs::metadata(&path).map(|m| m.len()).unwrap_or(0), modified: mtime(&path), errors, warnings });
    }
    lines.sort_by(|a, b| (b.level == "error").cmp(&(a.level == "error")).then(b.mod_key.is_some().cmp(&a.mod_key.is_some())).then(b.count.cmp(&a.count)));
    lines.truncate(MAX_LINES);
    rep.lines = lines;

    // Çökme dökümleri: Unity'nin crashpad'i (`.cache\backtrace\crashpad`) ve `Crashes` klasörü.
    let week = fsx::now_ts() - 7 * 24 * 3600;
    for root in [user_dir.join(".cache").join("backtrace"), user_dir.join("Crashes")] {
        for e in walkdir::WalkDir::new(root).follow_links(false).max_depth(4).into_iter().flatten() {
            let ext = e.path().extension().map(|x| x.to_string_lossy().to_ascii_lowercase());
            if e.file_type().is_file() && ext.as_deref() == Some("dmp") {
                let t = mtime(e.path());
                if t >= week {
                    rep.crashes += 1;
                }
                rep.last_crash = rep.last_crash.max(Some(t));
            }
        }
    }
    rep
}

/// Görüntüleyici için günlüğün sonu (en çok 512 KB). Ad `Player.log` ya da `Logs/<ad>.log` olmalı.
pub fn read(user_dir: &Path, name: &str) -> AppResult<String> {
    let ok = matches!(name, "Player.log" | "Player-prev.log") || name.strip_prefix("Logs/").is_some_and(|f| !f.contains(['/', '\\']) && f.to_ascii_lowercase().ends_with(".log"));
    if !ok {
        return Err(AppError::security(format!("{name}")));
    }
    let path = fsx::resolve_under(user_dir, name)?;
    Ok(tail(&path, 512 * 1024)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::fixture;

    #[test]
    fn summarizes_errors_and_links_mods() {
        let fx = fixture();
        fx.add_local("RoadBuilder", "RoadBuilder.dll", b"MZ");
        let user = fx.user();
        fs::create_dir_all(user.join("Logs")).unwrap();
        fs::write(
            user.join("Player.log"),
            "Game version: 1.6.2f1 (768.21d1) [6300.27778]\nModding runtime: Builtin\nGraphics device: NVIDIA GeForce RTX 3060 Ti (Version: Direct3D 11.0)\n\
             NullReferenceException: Object reference not set\n  at RoadBuilder.Systems.RoadGenerationSystem.OnUpdate () [0x00000]\n\
             NullReferenceException: Object reference not set\n",
        )
        .unwrap();
        fs::write(user.join("Logs").join("Modding.log"), "[2026-10-24 21:13:56,073] [ERROR] Failed to load RoadBuilder.dll\n[2026-10-24 21:13:57,000] [WARN]  Custom CSS expressions are not supported\n").unwrap();
        let mods = crate::mods::scan(&user).mods;
        let rep = report(&user, &mods);
        assert_eq!(rep.game_version.as_deref(), Some("1.6.2f1"));
        assert_eq!(rep.gpu.as_deref(), Some("NVIDIA GeForce RTX 3060 Ti"));
        let modding = rep.lines.iter().find(|l| l.file == "Logs/Modding.log").unwrap();
        assert_eq!(modding.mod_key.as_deref(), Some("local:RoadBuilder"));
        assert!(modding.text.starts_with("[ERROR]"), "zaman damgası atılmalı: {}", modding.text);
        let npe = rep.lines.iter().find(|l| l.file == "Player.log").unwrap();
        assert_eq!(npe.count, 2, "tekrarlar birleşmeli");
        assert_eq!(npe.mod_key.as_deref(), Some("local:RoadBuilder"), "yığın izinden mod bulunmalı");
        assert!(rep.lines.iter().all(|l| !l.text.contains("CSS")), "gürültü atılmalı");
        assert!(read(&user, "../secret.log").is_err());
        assert!(read(&user, "Logs/Modding.log").unwrap().contains("Failed"));
    }
}
