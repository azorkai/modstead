//! exe.xml: sim açılırken otomatik başlatılan programlar. Kötü niyetli bir yükleyici buraya
//! kendini ekleyebileceği için bu liste Güvenlik sayfasında gösterilir. Hazırlık denetimi de
//! (readiness.rs) yardımcı programların (Fenix System, Couatl…) burada kayıtlı olup olmadığına bakar.

use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;

use modstead_core::prelude::*;
use crate::sims::SimInstall;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExeEntry {
    pub sim: String,
    pub name: String,
    pub path: String,
    pub command_line: String,
    pub disabled: bool,
    pub exists: bool,
    pub signed_hint: String,
}

/// exe.xml'deki tek bir `<Launch.Addon>` bloğu (dosya sistemine bakmadan).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchAddon {
    pub name: String,
    pub path: String,
    pub command_line: String,
    pub disabled: bool,
}

/// Ayrıştırılmış exe.xml.
#[derive(Debug, Clone, Default)]
pub struct ExeXml {
    pub addons: Vec<LaunchAddon>,
    /// Belge düzeyindeki `<Disabled>True</Disabled>`: sim hiçbir programı başlatmaz.
    pub document_disabled: bool,
    /// Kapanmamış blok ya da kök etiketi: sim dosyanın tamamını yok sayabilir.
    pub malformed: Option<String>,
}

static BLOCK_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<Launch\.Addon>(.*?)</Launch\.Addon>").unwrap());
static NAME_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<Name>(.*?)</Name>").unwrap());
static PATH_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<Path>(.*?)</Path>").unwrap());
static CMD_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<CommandLine>(.*?)</CommandLine>").unwrap());
static DISABLED_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?is)<Disabled>(.*?)</Disabled>").unwrap());
static OPEN_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)<Launch\.Addon\s*>").unwrap());
static CLOSE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)</Launch\.Addon\s*>").unwrap());

fn unescape(s: &str) -> String {
    s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").trim().to_string()
}

fn tag(re: &Regex, block: &str) -> String {
    re.captures(block).map(|c| unescape(&c[1])).unwrap_or_default()
}

pub fn parse(text: &str) -> ExeXml {
    let addons: Vec<LaunchAddon> = BLOCK_RE
        .captures_iter(text)
        .map(|c| {
            let b = &c[1];
            LaunchAddon {
                name: tag(&NAME_RE, b),
                path: tag(&PATH_RE, b),
                command_line: tag(&CMD_RE, b),
                disabled: tag(&DISABLED_RE, b).eq_ignore_ascii_case("true"),
            }
        })
        .collect();
    // Bloklar çıkarıldıktan sonra kalan `<Disabled>` belgenin kendisine aittir.
    let outside = BLOCK_RE.replace_all(text, "");
    let document_disabled = tag(&DISABLED_RE, &outside).eq_ignore_ascii_case("true");
    let opens = OPEN_RE.find_iter(text).count();
    let closes = CLOSE_RE.find_iter(text).count();
    let lower = text.to_lowercase();
    let malformed = if opens != closes {
        Some(tr!(format!("{opens} <Launch.Addon> açılışı, {closes} kapanış var"), format!("{opens} <Launch.Addon> openings, {closes} closings")))
    } else if !lower.contains("<simbase.document") || !lower.contains("</simbase.document>") {
        Some(tr!("<SimBase.Document> kök etiketi eksik ya da kapanmamış", "<SimBase.Document> root tag is missing or not closed").to_string())
    } else {
        None
    };
    ExeXml { addons, document_disabled, malformed }
}

pub fn read_file(path: &Path) -> Option<ExeXml> {
    let bytes = std::fs::read(path).ok()?;
    Some(parse(&String::from_utf8_lossy(&bytes)))
}

pub fn read(sims: &[SimInstall]) -> Vec<ExeEntry> {
    let mut out = Vec::new();
    for s in sims {
        let Some(p) = &s.exe_xml else { continue };
        let Some(doc) = read_file(p) else { continue };
        for a in doc.addons {
            let lower = a.path.to_lowercase();
            // Basit ipucu: Program Files altındaki programlar genelde kurulumla gelir; Temp/Downloads altındakiler şüphelidir.
            let hint = if lower.contains("\\temp\\") || lower.contains("\\downloads\\") || lower.contains("\\appdata\\local\\temp") {
                "suspicious"
            } else if lower.contains("program files") {
                "installed"
            } else {
                "other"
            };
            out.push(ExeEntry {
                sim: s.id.clone(),
                exists: !a.path.is_empty() && Path::new(&a.path).exists(),
                name: a.name,
                path: a.path,
                command_line: a.command_line,
                disabled: a.disabled,
                signed_hint: hint.into(),
            });
        }
    }
    out
}

/// Belirtilen `<Launch.Addon>` girdisindeki `<Disabled>True</Disabled>` değerini `False` yapar.
/// Girdi ad ve yolla eşleştirilir; dosyanın geri kalanına dokunulmaz. Önce yedek alınır.
/// Dönen değer yedeğin yoludur.
pub fn enable_entry(exe_xml: &Path, name: &str, path: &str) -> AppResult<PathBuf> {
    let bytes = std::fs::read(exe_xml)?;
    let Ok(text) = String::from_utf8(bytes) else {
        return Err(AppError::msg(tr!("exe.xml UTF-8 değil; bozmamak için değiştirilmedi.", "exe.xml is not UTF-8; it was left unchanged to avoid damaging it.")));
    };
    let mut target: Option<(usize, usize)> = None;
    for c in BLOCK_RE.captures_iter(&text) {
        let inner = c.get(1).unwrap();
        let b = inner.as_str();
        if tag(&NAME_RE, b).eq_ignore_ascii_case(name) && tag(&PATH_RE, b).eq_ignore_ascii_case(path) {
            target = Some((inner.start(), inner.end()));
            break;
        }
    }
    let Some((start, end)) = target else {
        return Err(AppError::msg(tr!(format!("exe.xml'de “{name}” girdisi bulunamadı."), format!("No “{name}” entry found in exe.xml."))));
    };
    let block = &text[start..end];
    let Some(m) = DISABLED_RE.captures(block) else {
        return Err(AppError::msg(tr!("Girdide <Disabled> etiketi yok; zaten etkin sayılır.", "The entry has no <Disabled> tag; it already counts as enabled.")));
    };
    if !unescape(&m[1]).eq_ignore_ascii_case("true") {
        return Err(AppError::msg(tr!("Girdi zaten etkin.", "The entry is already enabled.")));
    }
    let whole = m.get(0).unwrap();
    let new_text = format!("{}{}{}", &text[..start + whole.start()], "<Disabled>False</Disabled>", &text[start + whole.end()..]);
    let backup = crate::util::backup_file(exe_xml)?;
    crate::util::write_atomic(exe_xml, &new_text)?;
    Ok(backup)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\u{feff}<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<SimBase.Document Type=\"Launch\" version=\"1,0\">\n  <Descr>Launch</Descr>\n  <Filename>EXE.xml</Filename>\n  <Disabled>False</Disabled>\n  <Launch.ManualLoad>False</Launch.ManualLoad>\n  <Launch.Addon>\n    <Name>FenixA320</Name>\n    <Disabled>True</Disabled>\n    <Path>C:\\Program Files\\FenixSim A320\\deps\\FenixBootstrapper.exe</Path>\n  </Launch.Addon>\n  <Launch.Addon>\n    <Name>Couatl</Name>\n    <Disabled>False</Disabled>\n    <Path>C:\\Program Files (x86)\\Addon Manager\\couatl64\\couatl64_boot.exe</Path>\n  </Launch.Addon>\n</SimBase.Document>";

    #[test]
    fn parses_entries_and_document_flags() {
        let d = parse(SAMPLE);
        assert_eq!(d.addons.len(), 2);
        assert_eq!(d.addons[0].name, "FenixA320");
        assert!(d.addons[0].disabled);
        assert!(!d.addons[1].disabled);
        assert!(!d.document_disabled);
        assert!(d.malformed.is_none());

        let off = SAMPLE.replacen("<Disabled>False</Disabled>\n  <Launch.ManualLoad>", "<Disabled>True</Disabled>\n  <Launch.ManualLoad>", 1);
        assert!(parse(&off).document_disabled);

        let broken = SAMPLE.replacen("</Launch.Addon>", "", 1);
        assert!(parse(&broken).malformed.is_some());
    }

    #[test]
    fn enable_entry_only_touches_target_and_backs_up() {
        let dir = std::env::temp_dir().join(format!("msfs-exexml-{}", modstead_core::fsx::short_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("exe.xml");
        std::fs::write(&p, SAMPLE).unwrap();
        let backup = enable_entry(&p, "FenixA320", r"C:\Program Files\FenixSim A320\deps\FenixBootstrapper.exe").unwrap();
        assert_eq!(std::fs::read_to_string(&backup).unwrap(), SAMPLE);
        let after = std::fs::read_to_string(&p).unwrap();
        assert!(after.starts_with('\u{feff}'), "BOM korunmalı");
        let d = parse(&after);
        assert!(!d.addons[0].disabled);
        assert_eq!(d.addons[1], parse(SAMPLE).addons[1]);
        // Yalnızca tek bir değer değişti.
        assert_eq!(after.len(), SAMPLE.len() + 1);
        // Zaten etkinse ya da girdi yoksa hata verir, dosyaya dokunmaz.
        assert!(enable_entry(&p, "FenixA320", r"C:\Program Files\FenixSim A320\deps\FenixBootstrapper.exe").is_err());
        assert!(enable_entry(&p, "Yok", "x").is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
