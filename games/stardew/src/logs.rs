//! SMAPI günlüğünü (SMAPI-latest.txt ya da SMAPI-crash.txt) çözümler: hangi modlar atlandı ve
//! neden, hangi mod hata üretti, SMAPI hangi sürümle çalıştı. Bağımlılıksız (düzenli ifade yok).

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Serialize;

use crate::{detect, util};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub time: String,
    pub level: String,
    pub source: String,
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkippedMod {
    pub name: String,
    pub reason: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SourceStats {
    pub errors: u32,
    pub warnings: u32,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogReport {
    pub exists: bool,
    pub path: Option<String>,
    pub modified: u64,
    pub smapi_version: Option<String>,
    pub game_version: Option<String>,
    pub os: Option<String>,
    pub mods_loaded: Option<u32>,
    pub content_packs_loaded: Option<u32>,
    pub skipped: Vec<SkippedMod>,
    pub errors: Vec<LogEntry>,
    pub warnings: Vec<LogEntry>,
    pub by_source: BTreeMap<String, SourceStats>,
    pub crashed: bool,
    pub total_lines: u32,
}

pub fn log_dir() -> Option<PathBuf> {
    detect::appdata_dir().map(|d| d.join("ErrorLogs"))
}

pub fn read_latest() -> LogReport {
    let Some(dir) = log_dir() else { return LogReport::default() };
    let latest = dir.join("SMAPI-latest.txt");
    let crash = dir.join("SMAPI-crash.txt");
    let (path, crashed) = if crash.is_file() && util::mtime_ms(&crash) >= util::mtime_ms(&latest) { (crash, true) } else { (latest, false) };
    // Çok büyük günlüklerin yalnızca son 8 MB'ı okunur.
    let Ok(bytes) = read_tail(&path, 8 * 1024 * 1024) else { return LogReport::default() };
    let mut report = parse(&String::from_utf8_lossy(&bytes));
    report.exists = true;
    report.crashed = crashed;
    report.modified = util::mtime_ms(&path);
    report.path = Some(path.to_string_lossy().into_owned());
    report
}

fn read_tail(path: &std::path::Path, max: u64) -> std::io::Result<Vec<u8>> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(path)?;
    let len = f.metadata()?.len();
    if len > max {
        f.seek(SeekFrom::Start(len - max))?;
    }
    let mut buf = Vec::with_capacity(len.min(max) as usize);
    f.read_to_end(&mut buf)?;
    Ok(buf)
}

const MAX_ENTRIES: usize = 400;
const MAX_MESSAGE: usize = 6000;
const LEVELS: &[&str] = &["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "ALERT"];

/// `[12:00:01 INFO  SMAPI] mesaj` satırını çözer.
fn parse_line(raw: &str) -> Option<LogEntry> {
    let rest = raw.strip_prefix('[')?;
    let (head, message) = rest.split_once(']')?;
    let time = head.get(..8)?;
    let tb = time.as_bytes();
    if !(tb[2] == b':' && tb[5] == b':' && time.bytes().enumerate().all(|(i, b)| i == 2 || i == 5 || b.is_ascii_digit())) {
        return None;
    }
    let after = head.get(8..)?.strip_prefix(' ')?;
    let (level, source) = after.split_once(char::is_whitespace)?;
    if !LEVELS.contains(&level) {
        return None;
    }
    let source = source.trim();
    if source.is_empty() {
        return None;
    }
    Some(LogEntry { time: time.into(), level: level.into(), source: source.into(), message: message.strip_prefix(' ').unwrap_or(message).into() })
}

/// "SMAPI 4.5.2 with Stardew Valley 1.6.15 build 24356 on Microsoft Windows 11" → (smapi, oyun, işletim sistemi)
fn parse_header(msg: &str) -> Option<(String, String, String)> {
    let rest = msg.strip_prefix("SMAPI ")?;
    let (smapi, rest) = rest.split_once(" with Stardew Valley ")?;
    let (game, os) = rest.split_once(" on ")?;
    let game = game.split_once(" build ").map(|(g, _)| g).unwrap_or(game);
    (!smapi.contains(' ') && !game.contains(' ')).then(|| (smapi.into(), game.into(), os.trim().into()))
}

/// "Loaded 12 mods:" → 12
fn loaded_count(msg: &str, what: &str) -> Option<u32> {
    let rest = msg.strip_prefix("Loaded ")?;
    let (n, tail) = rest.split_once(' ')?;
    tail.starts_with(what).then(|| n.parse().ok()).flatten()
}

/// "   - Cool Pack 1.0.0 because it requires…" → ad ve neden
fn parse_skipped(line: &str) -> Option<SkippedMod> {
    let rest = line.trim_start().strip_prefix("- ")?;
    let (name, reason) = rest.split_once(" because ")?;
    Some(SkippedMod { name: name.trim().into(), reason: reason.trim().trim_end_matches('.').into() })
}

pub fn parse(text: &str) -> LogReport {
    let mut entries: Vec<LogEntry> = Vec::new();
    let mut total = 0u32;
    for raw in text.lines() {
        total += 1;
        if let Some(e) = parse_line(raw) {
            entries.push(e);
        } else if let Some(last) = entries.last_mut() {
            if last.message.len() < MAX_MESSAGE {
                last.message.push('\n');
                last.message.push_str(raw);
            }
        }
    }

    let mut r = LogReport { total_lines: total, ..Default::default() };
    let mut in_skipped = false;
    for e in &entries {
        let msg = e.message.trim();
        if e.source == "SMAPI" {
            if let Some((smapi, game, os)) = parse_header(msg) {
                r.smapi_version = Some(smapi);
                r.game_version = Some(game);
                r.os = Some(os);
            }
            if let Some(n) = loaded_count(msg, "mods") {
                r.mods_loaded = Some(n);
            }
            if let Some(n) = loaded_count(msg, "content packs") {
                r.content_packs_loaded = Some(n);
            }
            if msg.starts_with("Skipped mods") || msg.starts_with("Skipped ") {
                in_skipped = true;
                r.skipped.extend(e.message.lines().skip(1).filter_map(parse_skipped));
                continue;
            }
        }
        if in_skipped && e.source == "SMAPI" && e.level == "ERROR" {
            if let Some(s) = parse_skipped(&e.message) {
                r.skipped.push(s);
            }
            continue;
        }
        in_skipped = false;
        match e.level.as_str() {
            "ERROR" | "ALERT" => {
                r.by_source.entry(e.source.clone()).or_default().errors += 1;
                if r.errors.len() < MAX_ENTRIES {
                    r.errors.push(e.clone());
                }
            }
            "WARN" => {
                r.by_source.entry(e.source.clone()).or_default().warnings += 1;
                if r.warnings.len() < MAX_ENTRIES {
                    r.warnings.push(e.clone());
                }
            }
            _ => {}
        }
    }
    r
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "[12:00:01 INFO  SMAPI] SMAPI 4.5.2 with Stardew Valley 1.6.15 build 24356 on Microsoft Windows 11 Pro
[12:00:02 INFO  SMAPI] Loaded 12 mods:
[12:00:02 INFO  SMAPI] Loaded 30 content packs:
[12:00:02 ERROR SMAPI] Skipped mods
[12:00:02 ERROR SMAPI] --------------------------------------------------
[12:00:02 ERROR SMAPI]       These mods could not be added to your game.
[12:00:02 ERROR SMAPI]
[12:00:02 ERROR SMAPI]    - Cool Pack 1.0.0 because it requires mods which aren't installed (Pathoschild.ContentPatcher).
[12:00:02 ERROR SMAPI]    - Old Mod 0.9 because it's no longer compatible.
[12:00:03 INFO  SMAPI] Launching mods...
[12:01:10 ERROR Lookup Anything] Failed to look up something.
System.NullReferenceException: Object reference not set
   at LookupAnything.Foo()
[12:01:11 WARN  Automate] Machine config looks odd.
[not a time] ignored continuation
";

    #[test]
    fn parses_header_skipped_and_errors() {
        let r = parse(SAMPLE);
        assert_eq!(r.smapi_version.as_deref(), Some("4.5.2"));
        assert_eq!(r.game_version.as_deref(), Some("1.6.15"));
        assert_eq!(r.os.as_deref(), Some("Microsoft Windows 11 Pro"));
        assert_eq!(r.mods_loaded, Some(12));
        assert_eq!(r.content_packs_loaded, Some(30));
        assert_eq!(r.skipped.len(), 2);
        assert_eq!(r.skipped[0].name, "Cool Pack 1.0.0");
        assert!(r.skipped[0].reason.contains("aren't installed"));
        assert_eq!(r.errors.len(), 1);
        assert_eq!(r.errors[0].source, "Lookup Anything");
        assert!(r.errors[0].message.contains("NullReferenceException"));
        assert_eq!(r.by_source["Automate"].warnings, 1);
        assert!(r.warnings[0].message.contains("ignored continuation"));
    }

    #[test]
    fn line_parser_is_strict() {
        assert!(parse_line("[12:00:01 INFO  SMAPI] ok").is_some());
        assert!(parse_line("[12:00:01 NOPE  SMAPI] x").is_none());
        assert!(parse_line("[1a:00:01 INFO  SMAPI] x").is_none());
        assert!(parse_line("no bracket").is_none());
    }
}
