//! Ortak güvenlik raporu. Her indirme (ve yerel arşiv) kuruluma girmeden önce bu rapordan geçer:
//!
//! 1. Kaynak güveni (alan adı) ve özet doğrulaması (GitHub SHA-256, Nexus MD5 kaydı)
//! 2. Güvenli arşiv açma (`archive`: yol aşımı, sembolik bağ, sıkıştırma bombası, boyut)
//! 3. İçerik denetimi (`content`): oyunun kuralına göre kod dosyaları, kılık değiştirmiş PE,
//!    çift uzantı; kod dosyalarının SHA-256 özetleri
//! 4. Microsoft Defender (`defender`) ve isteğe bağlı VirusTotal özet sorgusu (`virustotal`)
//! 5. Karar: güvenli / dikkat / tehlikeli, risk puanı, açık onay gerekip gerekmediği
//!
//! Rapor arayüzde ortak `SecurityPanel` bileşeniyle gösterilir; oyun kendi planını yanına koyar.

pub mod content;
pub mod defender;
pub mod motw;
pub mod virustotal;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub severity: Severity,
    /// Kararlı kod (arayüz çevirisi ve testler için): "executable", "disguised-pe"…
    pub code: String,
    pub title: String,
    pub detail: String,
    /// Arşiv köküne göre göreli yol.
    pub path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum EngineStatus {
    Clean,
    Threat,
    Unavailable,
    #[default]
    Skipped,
    Error,
    /// Motor dosyayı daha önce görmemiş (VirusTotal).
    Unknown,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct EngineResult {
    pub status: EngineStatus,
    pub engine: String,
    pub detail: String,
    pub malicious: u32,
    pub suspicious: u32,
    pub link: Option<String>,
}

impl EngineResult {
    pub fn skipped(engine: &str) -> Self {
        EngineResult { status: EngineStatus::Skipped, engine: engine.into(), ..Default::default() }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum VerificationStatus {
    /// Kaynağın yayımladığı özetle birebir aynı.
    Verified,
    /// Kaynak özet yayımlamıyor.
    Unverified,
    /// Kullanıcının seçtiği yerel dosya; kaynağı bilinmiyor.
    Local,
    /// Özet uyuşmuyor: dosya değiştirilmiş olabilir. Kurulum her zaman engellenir.
    Mismatch,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub status: VerificationStatus,
    pub method: String,
    pub detail: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Trust {
    Trusted,
    Known,
    Unknown,
    Local,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub url: Option<String>,
    pub domain: Option<String>,
    pub trust: Trust,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Verdict {
    Safe,
    Caution,
    Danger,
}

/// Kod içeren bir dosya (DLL, EXE, betik…): inceleme ekranında özetiyle gösterilir.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodeFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    /// "library" | "executable" | "script" | "installer" | "shortcut"
    pub kind: String,
    /// Bu oyunun modlarında olağan mı (ör. Bannerlord'da DLL)?
    pub expected: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveFacts {
    pub name: String,
    pub kind: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SecurityReport {
    pub verdict: Verdict,
    /// 0–100 risk puanı.
    pub score: u32,
    pub source: SourceInfo,
    pub verification: Verification,
    pub archive: Option<ArchiveFacts>,
    pub defender: EngineResult,
    pub virustotal: Option<EngineResult>,
    /// Nexus'un kendi taraması (VERIFIED, UNSCANNED…).
    pub nexus_scan: Option<String>,
    pub findings: Vec<Finding>,
    pub code_files: Vec<CodeFile>,
    pub scanned_files: u64,
    pub total_size: u64,
    /// Doluysa kurulum için kullanıcıdan açık onay istenir (neden metni).
    pub needs_override: Option<String>,
    /// Doluysa kurulum yapılamaz (neden metni).
    pub blocked: Option<String>,
    pub scanned_at: i64,
}

/// Kullanıcının güvenlik ayarları (genel ayarlardan gelir).
#[derive(Clone, Copy, Debug)]
pub struct SecurityPolicy {
    /// Defender taraması yapılamazsa açık onay iste.
    pub require_scan: bool,
    /// Kaynak özet yayımlamıyorsa açık onay iste.
    pub require_verified: bool,
    /// "Tehlikeli" kararlı paketleri hiç kurma.
    pub block_dangerous: bool,
}

impl Default for SecurityPolicy {
    fn default() -> Self {
        SecurityPolicy { require_scan: true, require_verified: true, block_dangerous: true }
    }
}

/// Bulgulardan risk puanı, karar, açık onay ve engel nedenlerini üretir.
pub fn finalize(report: &mut SecurityReport, policy: &SecurityPolicy) {
    let mut score = 0u32;
    for f in &report.findings {
        score += match f.severity {
            Severity::Critical => 60,
            Severity::High => 25,
            Severity::Medium => 10,
            Severity::Low => 2,
            Severity::Info => 0,
        };
    }
    if report.defender.status == EngineStatus::Threat {
        score += 100;
    }
    let vt_malicious = report.virustotal.as_ref().map(|v| v.malicious).unwrap_or(0);
    score += match vt_malicious {
        0 => 0,
        1 => 25,
        _ => 100,
    };
    match report.verification.status {
        VerificationStatus::Mismatch => score += 100,
        VerificationStatus::Unverified => score += 5,
        _ => {}
    }
    if report.source.trust == Trust::Unknown {
        score += 10;
    }
    let critical = report.findings.iter().any(|f| f.severity == Severity::Critical)
        || report.defender.status == EngineStatus::Threat
        || vt_malicious >= 2
        || report.verification.status == VerificationStatus::Mismatch;
    let high = report.findings.iter().any(|f| f.severity == Severity::High) || vt_malicious == 1;
    report.verdict = if critical {
        Verdict::Danger
    } else if high || score >= 30 {
        Verdict::Caution
    } else {
        Verdict::Safe
    };
    report.score = score.min(100);

    report.blocked = if report.verification.status == VerificationStatus::Mismatch {
        Some(tr!("Dosyanın özeti kaynağın yayımladığıyla uyuşmuyor; dosya değiştirilmiş olabilir.", "The file's hash does not match the one published by the source; the file may have been tampered with.").into())
    } else if report.defender.status == EngineStatus::Threat {
        Some(tr!("Microsoft Defender tehdit buldu.", "Microsoft Defender found a threat.").into())
    } else if report.verdict == Verdict::Danger && policy.block_dangerous {
        Some(tr!("Paket tehlikeli bulundu; güvenlik ayarınız bu paketlerin kurulmasını engelliyor.", "The package was found dangerous; your security settings block installing such packages.").into())
    } else {
        None
    };

    let mut reasons: Vec<String> = Vec::new();
    if policy.require_scan && matches!(report.defender.status, EngineStatus::Unavailable | EngineStatus::Error) {
        reasons.push(format!("{}: {}", tr!("Virüs taraması yapılamadı", "Virus scan could not run"), report.defender.detail));
    }
    if policy.require_verified && report.verification.status == VerificationStatus::Unverified {
        reasons.push(format!("{}: {}", tr!("Kaynak doğrulanamadı", "Source could not be verified"), report.verification.detail));
    }
    if report.source.trust == Trust::Unknown {
        reasons.push(tr!("Dosya tanınmayan bir siteden geldi.", "The file came from an unrecognised site.").into());
    }
    if report.verdict == Verdict::Caution {
        let top: Vec<&str> = report.findings.iter().filter(|f| f.severity >= Severity::High).map(|f| f.title.as_str()).take(3).collect();
        if !top.is_empty() {
            reasons.push(format!("{}: {}", tr!("Dikkat gerektiren bulgular", "Findings that need attention"), top.join(", ")));
        }
    }
    report.needs_override = if reasons.is_empty() || report.blocked.is_some() { None } else { Some(reasons.join(" ")) };
}

/// Kaynak alan adının güveni. `trusted`/`known` listeleri çekirdek + oyunun eklediği sitelerdir.
pub fn source_info(url: Option<&str>, local_label: Option<&str>, trusted: &[(&str, &str)], known: &[(&str, &str)]) -> SourceInfo {
    let Some(u) = url else {
        return SourceInfo {
            url: None,
            domain: None,
            trust: Trust::Local,
            label: local_label.map(str::to_string).unwrap_or_else(|| tr!("Yerel dosya", "Local file").into()),
        };
    };
    let domain = url::Url::parse(u).ok().and_then(|p| p.host_str().map(|h| h.trim_start_matches("www.").to_lowercase()));
    let d = domain.clone().unwrap_or_default();
    let matches = |list: &[(&str, &str)]| {
        list.iter().find(|(dom, _)| d == *dom || d.ends_with(&format!(".{dom}"))).map(|(_, label)| label.to_string())
    };
    let (trust, label) = if let Some(l) = matches(CORE_TRUSTED).or_else(|| matches(trusted)) {
        (Trust::Trusted, l)
    } else if let Some(l) = matches(known) {
        (Trust::Known, l)
    } else {
        (Trust::Unknown, d.clone())
    };
    SourceInfo { url: Some(u.to_string()), domain, trust, label }
}

/// Her oyun için güvenilir sayılan kaynaklar.
pub const CORE_TRUSTED: &[(&str, &str)] = &[
    ("github.com", "GitHub"),
    ("objects.githubusercontent.com", "GitHub"),
    ("release-assets.githubusercontent.com", "GitHub"),
    ("nexusmods.com", "Nexus Mods"),
    ("nexus-cdn.com", "Nexus Mods"),
];

#[cfg(test)]
mod tests {
    use super::*;

    fn report() -> SecurityReport {
        SecurityReport {
            verdict: Verdict::Safe,
            score: 0,
            source: source_info(Some("https://github.com/x/y/releases/download/a.zip"), None, &[], &[]),
            verification: Verification { status: VerificationStatus::Verified, method: "GitHub SHA-256".into(), detail: String::new() },
            archive: None,
            defender: EngineResult { status: EngineStatus::Clean, engine: "Microsoft Defender".into(), ..Default::default() },
            virustotal: None,
            nexus_scan: None,
            findings: vec![],
            code_files: vec![],
            scanned_files: 1,
            total_size: 1,
            needs_override: None,
            blocked: None,
            scanned_at: 0,
        }
    }

    #[test]
    fn clean_verified_package_is_safe() {
        let mut r = report();
        finalize(&mut r, &SecurityPolicy::default());
        assert_eq!(r.verdict, Verdict::Safe);
        assert!(r.needs_override.is_none() && r.blocked.is_none());
    }

    #[test]
    fn hash_mismatch_always_blocks() {
        let mut r = report();
        r.verification.status = VerificationStatus::Mismatch;
        finalize(&mut r, &SecurityPolicy { block_dangerous: false, ..Default::default() });
        assert_eq!(r.verdict, Verdict::Danger);
        assert!(r.blocked.is_some());
    }

    #[test]
    fn missing_scan_needs_override() {
        let mut r = report();
        r.defender.status = EngineStatus::Unavailable;
        finalize(&mut r, &SecurityPolicy::default());
        assert!(r.needs_override.is_some());
        assert!(r.blocked.is_none());
    }

    #[test]
    fn high_finding_is_caution_and_needs_override() {
        let mut r = report();
        r.findings.push(Finding { severity: Severity::High, code: "executable".into(), title: "setup.exe".into(), detail: String::new(), path: None });
        finalize(&mut r, &SecurityPolicy::default());
        assert_eq!(r.verdict, Verdict::Caution);
        assert!(r.needs_override.is_some());
    }

    #[test]
    fn source_trust_levels() {
        let known = [("mediafire.com", "MediaFire")];
        let flightsim = [("flightsim.to", "Flightsim.to")];
        assert_eq!(source_info(Some("https://github.com/x/y/releases/download/a.zip"), None, &[], &[]).trust, Trust::Trusted);
        assert_eq!(source_info(Some("https://cdn.flightsim.to/a.zip"), None, &flightsim, &[]).trust, Trust::Trusted);
        assert_eq!(source_info(Some("https://www.mediafire.com/file/x"), None, &[], &known).trust, Trust::Known);
        assert_eq!(source_info(Some("https://evil.example/x.zip"), None, &[], &known).trust, Trust::Unknown);
        assert_eq!(source_info(None, None, &[], &[]).trust, Trust::Local);
    }
}
