//! Açılmış arşivin içerik denetimi. Hangi kod dosyalarının "olağan" olduğunu oyun söyler:
//! Bannerlord ve SMAPI modları DLL içerir; bir MSFS paketinde DLL ya da EXE olmamalıdır.
//! Oyuna özel ek denetimler (ör. MSFS layout.json) rapora oyun tarafından eklenir.

use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use super::{CodeFile, Finding, Severity};

/// Oyunun içerik kuralı.
#[derive(Clone, Copy, Debug)]
pub struct ContentPolicy {
    /// Bu oyunun modlarında olağan kod uzantıları (küçük harf, noktasız): ör. `&["dll"]`.
    pub expected_code: &'static [&'static str],
    /// Olağan sayılan ama bilgi olarak gösterilecek uzantılar (ör. MSFS için `wasm`).
    pub info_ext: &'static [&'static str],
}

impl ContentPolicy {
    pub const STRICT: ContentPolicy = ContentPolicy { expected_code: &[], info_ext: &[] };
}

const LIBRARY_EXT: &[&str] = &["dll", "ocx", "sys", "drv", "cpl"];
const EXECUTABLE_EXT: &[&str] = &["exe", "scr", "com", "pif", "jar", "gadget", "application"];
const SCRIPT_EXT: &[&str] = &["bat", "cmd", "ps1", "psm1", "vbs", "vbe", "jse", "wsf", "wsh", "hta"];
const INSTALLER_EXT: &[&str] = &["msi", "msp", "appx", "msix", "msixbundle", "appxbundle"];
const SHORTCUT_EXT: &[&str] = &["lnk", "url", "reg", "inf", "scf"];
const DOC_EXT: &[&str] = &["pdf", "txt", "md", "doc", "docx", "rtf", "jpg", "jpeg", "png", "gif", "html", "htm", "mp4", "mp3", "xml", "json"];
const ARCHIVE_EXT: &[&str] = &["zip", "7z", "rar"];

/// Kod dosyalarının özeti en fazla bu kadar dosya için hesaplanır (dev arşivlerde süre sınırı).
const MAX_HASHED: usize = 600;

pub struct ContentScan {
    pub findings: Vec<Finding>,
    pub code_files: Vec<CodeFile>,
    pub files: u64,
    pub size: u64,
}

fn ext_of(name: &str) -> String {
    Path::new(name).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

fn code_kind(ext: &str) -> Option<&'static str> {
    if LIBRARY_EXT.contains(&ext) {
        Some("library")
    } else if EXECUTABLE_EXT.contains(&ext) {
        Some("executable")
    } else if SCRIPT_EXT.contains(&ext) {
        Some("script")
    } else if INSTALLER_EXT.contains(&ext) {
        Some("installer")
    } else if SHORTCUT_EXT.contains(&ext) {
        Some("shortcut")
    } else {
        None
    }
}

/// Dosya gerçekten bir Windows PE (exe/dll) mi? Uzantıya bakmaz, baytlara bakar.
pub fn is_pe_file(path: &Path) -> bool {
    let Ok(mut f) = fs::File::open(path) else { return false };
    let mut mz = [0u8; 64];
    if f.read_exact(&mut mz).is_err() || &mz[..2] != b"MZ" {
        return false;
    }
    let e_lfanew = u32::from_le_bytes([mz[60], mz[61], mz[62], mz[63]]) as u64;
    if e_lfanew == 0 || e_lfanew > 16 * 1024 * 1024 {
        return false;
    }
    let mut sig = [0u8; 4];
    f.seek(SeekFrom::Start(e_lfanew)).is_ok() && f.read_exact(&mut sig).is_ok() && &sig == b"PE\0\0"
}

fn finding(severity: Severity, code: &str, title: String, detail: String, path: &str) -> Finding {
    Finding { severity, code: code.into(), title, detail, path: Some(path.to_string()) }
}

/// `root` altını tarar. Bağları izlemez; bağ görürse bulgu üretir.
pub fn scan(root: &Path, policy: &ContentPolicy) -> ContentScan {
    let mut findings = Vec::new();
    let mut code_files = Vec::new();
    let mut files = 0u64;
    let mut size = 0u64;
    let mut expected_count = 0u32;
    let mut info_counts: Vec<(String, u32)> = Vec::new();
    let mut nested = 0u32;

    for e in walkdir::WalkDir::new(root).follow_links(false).into_iter().flatten() {
        let ft = e.file_type();
        let rel = e.path().strip_prefix(root).unwrap_or(e.path()).to_string_lossy().replace('\\', "/");
        if ft.is_symlink() || crate::fsx::is_link(e.path()) {
            findings.push(finding(
                Severity::High,
                "symlink",
                tr!("Bağlantı (symlink/junction)", "Link (symlink/junction)").into(),
                tr!("Arşivden bir bağlantı çıktı; izlenmedi.", "The archive produced a link; it was not followed.").into(),
                &rel,
            ));
            continue;
        }
        if !ft.is_file() {
            continue;
        }
        files += 1;
        let len = e.metadata().map(|m| m.len()).unwrap_or(0);
        size += len;
        let name = e.file_name().to_string_lossy().to_string();
        let ext = ext_of(&name);

        if let Some(kind) = code_kind(&ext) {
            let expected = policy.expected_code.contains(&ext.as_str());
            let sha256 = if code_files.len() < MAX_HASHED { crate::download::sha256_file(e.path()).unwrap_or_default() } else { String::new() };
            code_files.push(CodeFile { path: rel.clone(), size: len, sha256, kind: kind.into(), expected });
            let stem = Path::new(&name).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            let inner = ext_of(&stem);
            // Çift uzantı, çift tıklanarak çalıştırılan dosyalar için bir aldatmacadır. DLL'ler doğrudan
            // çalıştırılamaz ve adlarında nokta olağandır (Newtonsoft.Json.dll, System.Private.Xml.dll).
            if ext != "dll" && !inner.is_empty() && DOC_EXT.contains(&inner.as_str()) {
                findings.push(finding(
                    Severity::Critical,
                    "double-extension",
                    tr!("Çift uzantılı çalıştırılabilir dosya", "Executable with a double extension").into(),
                    tr!(format!("“{name}” belge gibi görünüyor ama çalıştırılabilir."), format!("“{name}” looks like a document but is executable.")),
                    &rel,
                ));
            } else if expected {
                expected_count += 1;
            } else {
                let (sev, code, title, detail) = match kind {
                    "installer" => (
                        Severity::High,
                        "installer",
                        tr!(format!("Kurulum paketi: .{ext}"), format!("Installer package: .{ext}")),
                        tr!("Kurucular asla çalıştırılmaz; içeriği ayrıca incelenmeli.", "Installers are never run; inspect their contents separately.").to_string(),
                    ),
                    "shortcut" => (
                        Severity::Medium,
                        "shortcut",
                        tr!(format!("Kısayol ya da sistem dosyası: .{ext}"), format!("Shortcut or system file: .{ext}")),
                        tr!("Mod dosyalarında beklenmez.", "Not expected in mod files.").to_string(),
                    ),
                    "script" => (
                        Severity::High,
                        "script",
                        tr!(format!("Komut dosyası: .{ext}"), format!("Script file: .{ext}")),
                        tr!("Çalıştırıldığında sisteminizde komut yürütebilir.", "If run, it can execute commands on your system.").to_string(),
                    ),
                    _ => (
                        Severity::High,
                        "executable",
                        tr!(format!("Çalıştırılabilir dosya: .{ext}"), format!("Executable file: .{ext}")),
                        tr!("Bu oyunun modlarında bu tür dosya beklenmez.", "This kind of file is not expected in this game's mods.").to_string(),
                    ),
                };
                findings.push(finding(sev, code, title, detail, &rel));
            }
            continue;
        }
        if policy.info_ext.contains(&ext.as_str()) {
            match info_counts.iter_mut().find(|(x, _)| *x == ext) {
                Some((_, n)) => *n += 1,
                None => info_counts.push((ext.clone(), 1)),
            }
        }
        if ARCHIVE_EXT.contains(&ext.as_str()) {
            nested += 1;
        }
        // Uzantısı zararsız görünen ama içi exe/dll olan dosya.
        if is_pe_file(e.path()) {
            let sha256 = crate::download::sha256_file(e.path()).unwrap_or_default();
            code_files.push(CodeFile { path: rel.clone(), size: len, sha256, kind: "executable".into(), expected: false });
            findings.push(finding(
                Severity::Critical,
                "disguised-pe",
                tr!("Kılık değiştirmiş çalıştırılabilir dosya", "Disguised executable").into(),
                tr!(format!("“{name}” uzantısına rağmen bir Windows programı (PE)."), format!("“{name}” is a Windows program (PE) despite its extension.")),
                &rel,
            ));
        }
    }

    if expected_count > 0 {
        findings.push(Finding {
            severity: Severity::Info,
            code: "expected-code".into(),
            title: tr!(format!("{expected_count} kod kitaplığı"), format!("{expected_count} code libraries")),
            detail: tr!(
                "Bu oyunun modları kod kitaplığı içerir; özetleri aşağıda, VirusTotal'da aranabilir.",
                "This game's mods contain code libraries; their hashes are listed below and can be looked up on VirusTotal."
            )
            .into(),
            path: None,
        });
    }
    for (ext, n) in info_counts {
        findings.push(Finding {
            severity: Severity::Info,
            code: format!("info-{ext}"),
            title: format!("{n} .{ext}"),
            detail: tr!("Bu oyun için olağan dosya türü.", "A normal file type for this game.").into(),
            path: None,
        });
    }
    if nested > 0 {
        findings.push(Finding {
            severity: Severity::Low,
            code: "nested-archive".into(),
            title: tr!(format!("İç içe {nested} arşiv"), format!("{nested} nested archive(s)")),
            detail: tr!("Arşivin içinde başka arşivler var; içerikleri taranmadı.", "The archive contains other archives; their contents were not scanned.").into(),
            path: None,
        });
    }
    ContentScan { findings, code_files, files, size }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("modstead-content-{}", crate::fsx::short_id()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn fake_pe() -> Vec<u8> {
        let mut bytes = vec![0u8; 256];
        bytes[0] = b'M';
        bytes[1] = b'Z';
        bytes[60] = 128;
        bytes[128..132].copy_from_slice(b"PE\0\0");
        bytes
    }

    #[test]
    fn strict_policy_flags_code() {
        let dir = temp();
        fs::write(dir.join("texture.dds"), fake_pe()).unwrap();
        fs::write(dir.join("readme.pdf.exe"), b"x").unwrap();
        fs::write(dir.join("helper.dll"), b"x").unwrap();
        fs::write(dir.join("ok.json"), b"{}").unwrap();
        let s = scan(&dir, &ContentPolicy::STRICT);
        assert!(s.findings.iter().any(|f| f.code == "disguised-pe" && f.severity == Severity::Critical));
        assert!(s.findings.iter().any(|f| f.code == "double-extension"));
        assert!(s.findings.iter().any(|f| f.code == "executable" && f.path.as_deref() == Some("helper.dll")));
        assert_eq!(s.code_files.len(), 3);
        assert_eq!(s.files, 4);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn dotted_library_names_are_not_double_extensions() {
        let dir = temp();
        fs::write(dir.join("Newtonsoft.Json.dll"), b"x").unwrap();
        fs::write(dir.join("System.Private.Xml.dll"), b"x").unwrap();
        fs::write(dir.join("notes.txt.scr"), b"x").unwrap();
        let s = scan(&dir, &ContentPolicy { expected_code: &["dll"], info_ext: &[] });
        let doubles: Vec<_> = s.findings.iter().filter(|f| f.code == "double-extension").filter_map(|f| f.path.as_deref()).collect();
        assert_eq!(doubles, vec!["notes.txt.scr"]);
    }

    #[test]
    fn expected_dlls_are_informational() {
        let dir = temp();
        fs::create_dir_all(dir.join("bin")).unwrap();
        fs::write(dir.join("bin").join("MyMod.dll"), fake_pe()).unwrap();
        let s = scan(&dir, &ContentPolicy { expected_code: &["dll"], info_ext: &[] });
        assert!(s.findings.iter().all(|f| f.severity == Severity::Info));
        assert_eq!(s.code_files.len(), 1);
        assert!(s.code_files[0].expected);
        assert_eq!(s.code_files[0].sha256.len(), 64);
        let _ = fs::remove_dir_all(&dir);
    }
}
