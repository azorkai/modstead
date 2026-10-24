//! Microsoft Defender komut satırı taraması (MpCmdRun). Kurulumdan önce arşivin açıldığı
//! karantina klasörü taranır. Temizleme yapmaz (`-DisableRemediation`); yalnızca rapor eder.

use std::path::{Path, PathBuf};
use std::time::Duration;

use super::{EngineResult, EngineStatus};

const ENGINE: &str = "Microsoft Defender";

fn version_key(name: &str) -> Vec<u64> {
    name.split(['.', '-']).map(|p| p.parse::<u64>().unwrap_or(0)).collect()
}

/// En güncel Defender platformundaki MpCmdRun.exe; yoksa Program Files altındaki.
pub fn find_mpcmdrun() -> Option<PathBuf> {
    if let Some(pd) = std::env::var_os("ProgramData") {
        let platform = PathBuf::from(pd).join("Microsoft").join("Windows Defender").join("Platform");
        if let Ok(rd) = std::fs::read_dir(&platform) {
            let mut dirs: Vec<PathBuf> = rd.flatten().map(|e| e.path()).filter(|p| p.join("MpCmdRun.exe").is_file()).collect();
            dirs.sort_by_key(|p| version_key(&p.file_name().unwrap_or_default().to_string_lossy()));
            if let Some(best) = dirs.pop() {
                return Some(best.join("MpCmdRun.exe"));
            }
        }
    }
    let pf = std::env::var_os("ProgramFiles").map(PathBuf::from)?;
    let p = pf.join("Windows Defender").join("MpCmdRun.exe");
    p.is_file().then_some(p)
}

pub fn available() -> bool {
    find_mpcmdrun().is_some()
}

pub async fn scan(target: &Path) -> EngineResult {
    let Some(exe) = find_mpcmdrun() else {
        return EngineResult {
            status: EngineStatus::Unavailable,
            engine: ENGINE.into(),
            detail: tr!("Microsoft Defender komut satırı aracı bulunamadı", "Microsoft Defender command-line tool not found").into(),
            ..Default::default()
        };
    };
    let mut cmd = crate::platform::hidden_command_async(&exe);
    cmd.arg("-Scan").arg("-ScanType").arg("3").arg("-File").arg(target).arg("-DisableRemediation").kill_on_drop(true);
    let output = match tokio::time::timeout(Duration::from_secs(15 * 60), cmd.output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return EngineResult {
                status: EngineStatus::Error,
                engine: ENGINE.into(),
                detail: format!("{}: {e}", tr!("Defender başlatılamadı", "could not start Defender")),
                ..Default::default()
            };
        }
        Err(_) => {
            return EngineResult {
                status: EngineStatus::Error,
                engine: ENGINE.into(),
                detail: tr!("Defender taraması zaman aşımına uğradı", "the Defender scan timed out").into(),
                ..Default::default()
            };
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    match output.status.code() {
        Some(0) => EngineResult { status: EngineStatus::Clean, engine: ENGINE.into(), detail: tr!("Tehdit bulunamadı.", "No threats found.").into(), ..Default::default() },
        Some(2) => {
            let details: Vec<String> = stdout
                .lines()
                .map(|l| l.trim())
                .filter(|l| l.starts_with("Threat") || l.contains("Threat ") || l.starts_with("Resources"))
                .map(|l| l.to_string())
                .take(20)
                .collect();
            EngineResult {
                status: EngineStatus::Threat,
                engine: ENGINE.into(),
                malicious: details.iter().filter(|d| d.starts_with("Threat")).count().max(1) as u32,
                detail: if details.is_empty() { tr!("Defender tehdit buldu.", "Defender found a threat.").into() } else { details.join("\n") },
                ..Default::default()
            }
        }
        code => {
            let last = stdout.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
            EngineResult {
                status: EngineStatus::Error,
                engine: ENGINE.into(),
                detail: format!(
                    "{} ({} {}). {}{}",
                    tr!("Defender taraması tamamlanamadı", "the Defender scan did not complete"),
                    tr!("çıkış kodu", "exit code"),
                    code.map(|c| format!("{c:#x}")).unwrap_or_else(|| "?".into()),
                    last,
                    if stdout.contains("0x800106ba") {
                        tr!(" Başka bir antivirüs Defender'ı devre dışı bırakmış olabilir.", " Another antivirus may have disabled Defender.")
                    } else {
                        ""
                    }
                ),
                ..Default::default()
            }
        }
    }
}
