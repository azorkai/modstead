//! Ortak kabul hattı: bir arşivi kuruluma hazır, taranmış ve raporlanmış hale getirir.
//!
//! 1. Kaynak çözülür (Nexus / GitHub / kullanıcının verdiği adres / yerel dosya)
//! 2. İzinli sunuculardan, boyut sınırıyla indirilir (yerel dosya karantinaya kopyalanır)
//! 3. Kaynağın yayımladığı özetle doğrulanır (GitHub SHA-256, Nexus MD5 kaydı)
//! 4. Karantina klasörüne güvenli biçimde açılır
//! 5. İçerik oyunun kuralına göre denetlenir, Microsoft Defender ile taranır, istenirse
//!    VirusTotal'a yalnızca özet sorulur
//! 6. Rapor ve karar üretilir
//!
//! Hat oyuna dokunmaz. Oyun `extract_dir` içeriğini inceler, planını çıkarır ve
//! `job.review(...)` ile kullanıcı onayına sunar; onaydan sonra kendi kurulumunu yapar.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::archive;
use crate::credentials;
use crate::download::{self, Downloaded};
use crate::error::{AppError, AppResult};
use crate::fsx;
use crate::github;
use crate::jobs::{JobHandle, Stage};
use crate::nexus::{self, NexusGame, NxmLink};
use crate::security::content::{self, ContentPolicy};
use crate::security::{self, ArchiveFacts, EngineResult, EngineStatus, SecurityReport, Verification, VerificationStatus, defender, virustotal};
use crate::services::Services;

pub enum Origin {
    Nexus { game: NexusGame, mod_id: u64, file_id: u64, nxm: Option<NxmLink> },
    Github { repo: String, release_id: Option<u64>, asset_id: u64 },
    /// Kullanıcının açıkça verdiği adres. İzinli bir sunucudaysa izinli istemciyle, değilse
    /// HTTPS zorunlu kullanıcı istemcisiyle indirilir ve kaynak güveni rapora yazılır.
    Url { url: String },
    Local { path: PathBuf },
}

/// Kurulan dosyanın nereden geldiği (oyunlar kurulum kaydında saklar; güncelleme takibi için).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum Provenance {
    #[serde(rename_all = "camelCase")]
    Nexus { domain: String, mod_id: u64, file_id: u64, file_name: String },
    #[serde(rename_all = "camelCase")]
    Github { repo: String, tag: String, asset: String },
    #[serde(rename_all = "camelCase")]
    Url { url: String, file_name: String },
    #[serde(rename_all = "camelCase")]
    Local { file_name: String },
}

pub struct IntakeRequest<'a> {
    pub origin: Origin,
    /// Bu görevin karantina klasörü (mümkünse hedefle aynı birimde). Hat içine `download/` ve `x/` açar.
    pub work_dir: PathBuf,
    pub content: ContentPolicy,
    pub trusted: &'a [(&'a str, &'a str)],
    pub known: &'a [(&'a str, &'a str)],
    /// Yerel dosya ve adreslerde dosyayı Nexus kayıtlarında tanımak için oyunun Nexus kimliği.
    pub nexus_lookup: Option<NexusGame>,
}

pub struct Intake {
    pub work_dir: PathBuf,
    pub archive_path: PathBuf,
    pub extract_dir: PathBuf,
    pub provenance: Provenance,
    pub source_label: String,
    pub source_url: Option<String>,
    pub sha256: String,
    pub md5: String,
    pub report: SecurityReport,
}

fn file_name_for(raw: &str, fallback: &str) -> String {
    let name = raw.rsplit(['/', '\\']).next().unwrap_or("").split('?').next().unwrap_or("").trim();
    let clean = fsx::sanitize_name(if name.is_empty() { fallback } else { name });
    let lower = clean.to_ascii_lowercase();
    if lower.ends_with(".zip") || lower.ends_with(".7z") || lower.ends_with(".rar") { clean } else { format!("{clean}.zip") }
}

fn verified(method: &str, detail: String) -> Verification {
    Verification { status: VerificationStatus::Verified, method: method.into(), detail }
}

/// Hattı çalıştırır. Hata durumunda karantina klasörünü siler.
pub async fn run(services: &Services, job: &JobHandle, req: IntakeRequest<'_>) -> AppResult<Intake> {
    let work = req.work_dir.clone();
    match run_inner(services, job, req).await {
        Ok(i) => Ok(i),
        Err(e) => {
            let _ = fsx::remove_dir(&work);
            Err(e)
        }
    }
}

async fn run_inner(services: &Services, job: &JobHandle, req: IntakeRequest<'_>) -> AppResult<Intake> {
    let settings = services.settings();
    let http = &services.http;
    let work = req.work_dir.clone();
    std::fs::create_dir_all(&work)?;
    let dl_dir = work.join("download");
    let extract_dir = work.join("x");

    job.stage(Stage::Resolving, tr!("Kaynak doğrulanıyor", "Resolving source"));
    let mut nexus_scan = None;
    let mut source_url: Option<String> = None;
    let (downloaded, mut provenance, mut verification, mut source_label): (Downloaded, Provenance, Verification, String) = match req.origin {
        Origin::Nexus { game, mod_id, file_id, nxm } => {
            let key = credentials::get(credentials::NEXUS_KEY)?.ok_or_else(|| {
                AppError::Nexus(tr!("indirmek için Ayarlar'dan Nexus API anahtarınızı ekleyin", "add your Nexus API key in Settings to download").into())
            })?;
            let info = nexus::get_mod(http, game, mod_id).await?;
            let file = nexus::files(http, game, mod_id)
                .await?
                .into_iter()
                .find(|f| f.file_id == file_id)
                .ok_or_else(|| AppError::Nexus(tr!("dosya bulunamadı ya da kaldırılmış", "file not found or removed").into()))?;
            if nexus::scan_is_bad(&file.scan) {
                return Err(AppError::security(tr!(
                    format!("Nexus Mods bu dosyayı güvenli bulmamış ({})", file.scan),
                    format!("Nexus Mods did not find this file safe ({})", file.scan)
                )));
            }
            nexus_scan = Some(file.scan.clone()).filter(|s| !s.is_empty());
            job.set_title(format!("{} · {}", info.info.name, if file.version.is_empty() { &file.name } else { &file.version }));
            let url = nexus::download_link(http, &key, game, mod_id, file_id, nxm.as_ref()).await?;
            job.stage(Stage::Downloading, tr!("İndiriliyor", "Downloading"));
            let name = file_name_for(&file.file_name, &file.name);
            let d = download::download(http, url, &dl_dir.join(&name), Some(file.size).filter(|s| *s > 0), job).await?;

            job.stage(Stage::Verifying, tr!("Nexus kayıtlarıyla karşılaştırılıyor", "Checking against Nexus records"));
            let matches = nexus::verify_md5(http, &d.md5).await?;
            let verification = if matches.iter().any(|m| m.mod_id == mod_id && m.file_id == file_id && m.size.is_none_or(|s| s == d.size)) {
                verified(
                    "Nexus MD5",
                    tr!(
                        format!("Dosyanın MD5 özeti Nexus'taki #{mod_id}/{file_id} kaydıyla birebir aynı."),
                        format!("The file's MD5 hash exactly matches Nexus record #{mod_id}/{file_id}.")
                    ),
                )
            } else if !matches.is_empty() {
                return Err(AppError::security(tr!(
                    "indirilen dosya Nexus'ta başka bir dosyaya ait; indirme değiştirilmiş olabilir",
                    "the downloaded file belongs to a different file on Nexus; the download may have been tampered with"
                )));
            } else {
                Verification {
                    status: VerificationStatus::Unverified,
                    method: "Nexus MD5".into(),
                    detail: tr!("Nexus bu dosyanın özetini henüz listelemiyor (yeni yüklenmiş olabilir).", "Nexus does not list this file's hash yet (it may have been uploaded recently).")
                        .into(),
                }
            };
            source_url = Some(info.info.url.clone());
            (d, Provenance::Nexus { domain: game.domain.into(), mod_id, file_id, file_name: name }, verification, format!("Nexus Mods · {}", info.info.name))
        }
        Origin::Github { repo, release_id, asset_id } => {
            let info = github::repo(http, &repo).await?;
            // Son sürümler listesinde olmayan eski bir sürüm (ör. aynı depodaki başka bir dal) doğrudan istenir.
            let fetched = match release_id {
                Some(id) if !info.releases.iter().any(|r| r.id == id) => Some(github::release(http, &repo, id).await?),
                _ => None,
            };
            let release = match (release_id, &fetched) {
                (_, Some(r)) => Some(r),
                (Some(id), None) => info.releases.iter().find(|r| r.id == id),
                (None, None) => info.releases.iter().find(|r| !r.prerelease).or(info.releases.first()),
            }
            .ok_or_else(|| AppError::NotFound(tr!("GitHub sürümü", "GitHub release").into()))?;
            let asset = release.assets.iter().find(|a| a.id == asset_id).ok_or_else(|| AppError::NotFound(tr!("GitHub sürüm dosyası", "GitHub release asset").into()))?;
            job.set_title(format!("{} · {}", info.repo, release.tag));
            let url = http.ensure_allowed(&asset.download_url)?;
            job.stage(Stage::Downloading, tr!("İndiriliyor", "Downloading"));
            let name = file_name_for(&asset.name, "release.zip");
            let d = download::download(http, url, &dl_dir.join(&name), Some(asset.size).filter(|s| *s > 0), job).await?;

            job.stage(Stage::Verifying, tr!("SHA-256 doğrulanıyor", "Verifying SHA-256"));
            let verification = match &asset.sha256 {
                Some(expected) if expected.eq_ignore_ascii_case(&d.sha256) => verified(
                    "GitHub SHA-256",
                    tr!("Dosyanın SHA-256 özeti GitHub'ın yayımladığı özetle birebir aynı.", "The file's SHA-256 hash exactly matches the one published by GitHub.").into(),
                ),
                Some(_) => {
                    return Err(AppError::security(tr!(
                        "SHA-256 özeti GitHub'daki değerle uyuşmuyor; dosya değiştirilmiş olabilir",
                        "the SHA-256 hash does not match GitHub's; the file may have been tampered with"
                    )));
                }
                None => Verification {
                    status: VerificationStatus::Unverified,
                    method: "GitHub SHA-256".into(),
                    detail: tr!("GitHub bu eski sürüm için özet yayımlamamış.", "GitHub did not publish a hash for this older release.").into(),
                },
            };
            source_url = Some(release.url.clone());
            (
                d,
                Provenance::Github { repo: info.repo.clone(), tag: release.tag.clone(), asset: asset.name.clone() },
                verification,
                format!("GitHub · {}", info.repo),
            )
        }
        Origin::Url { url } => {
            let parsed = url::Url::parse(url.trim()).map_err(|_| AppError::security(format!("{}: {url}", tr!("geçersiz adres", "invalid address"))))?;
            let name = file_name_for(parsed.path(), "indirme.zip");
            job.set_title(name.clone());
            job.stage(Stage::Downloading, tr!("İndiriliyor", "Downloading"));
            let d = if http.allowed(&parsed) {
                download::download(http, parsed.clone(), &dl_dir.join(&name), None, job).await?
            } else {
                download::download_user_url(http, parsed.clone(), &dl_dir.join(&name), job).await?
            };
            source_url = Some(url.clone());
            let label = parsed.host_str().unwrap_or("?").trim_start_matches("www.").to_string();
            (
                d,
                Provenance::Url { url: url.clone(), file_name: name },
                Verification {
                    status: VerificationStatus::Unverified,
                    method: tr!("Kaynak özeti yok", "No source hash").into(),
                    detail: tr!("Bu site dosya özeti yayımlamıyor; dosya kaynağıyla karşılaştırılamadı.", "This site does not publish file hashes; the file could not be compared with its source.").into(),
                },
                label,
            )
        }
        Origin::Local { path } => {
            let fname = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
            job.set_title(fname.clone());
            job.stage(Stage::Downloading, tr!("Dosya karantinaya alınıyor", "Copying file into quarantine"));
            let name = file_name_for(&fname, "arsiv.zip");
            let d = download::import_local(&path, &dl_dir.join(&name), job).await?;
            (
                d,
                Provenance::Local { file_name: name },
                Verification {
                    status: VerificationStatus::Local,
                    method: tr!("Yerel dosya", "Local file").into(),
                    detail: tr!("Bu dosyayı siz seçtiniz; kaynağı doğrulanamadı.", "You chose this file; its source could not be verified.").into(),
                },
                tr!("Yerel dosya", "Local file").to_string(),
            )
        }
    };
    job.check()?;

    // Yerel dosya ya da adres Nexus'tan indirilmişse tanı: hem doğrulama hem güncelleme takibi sağlar.
    if let (Some(game), VerificationStatus::Local | VerificationStatus::Unverified) = (req.nexus_lookup, verification.status) {
        if matches!(provenance, Provenance::Local { .. } | Provenance::Url { .. }) {
            job.stage(Stage::Verifying, tr!("Nexus kayıtlarında aranıyor", "Looking up Nexus records"));
            if let Ok(matches) = nexus::verify_md5(http, &downloaded.md5).await {
                if let Some(m) = matches.first() {
                    verification = verified(
                        "Nexus MD5",
                        tr!(
                            format!("Bu dosya Nexus'ta mod #{} dosya #{} olarak tanındı.", m.mod_id, m.file_id),
                            format!("This file was recognised on Nexus as mod #{} file #{}.", m.mod_id, m.file_id)
                        ),
                    );
                    let file_name = downloaded.path.file_name().unwrap_or_default().to_string_lossy().into_owned();
                    provenance = Provenance::Nexus { domain: game.domain.into(), mod_id: m.mod_id, file_id: m.file_id, file_name };
                    source_url = Some(nexus::mod_url(game, m.mod_id));
                    source_label = format!("Nexus Mods · #{}", m.mod_id);
                }
            }
        }
    }

    job.stage(Stage::Extracting, tr!("Karantina klasörüne açılıyor", "Extracting into quarantine"));
    let kind = archive::detect(&downloaded.path)?;
    {
        let (p, x, j) = (downloaded.path.clone(), extract_dir.clone(), job.clone());
        tokio::task::spawn_blocking(move || archive::extract(&p, kind, &x, &j)).await??;
    }
    job.check()?;

    job.stage(Stage::Scanning, tr!("İçerik denetleniyor", "Inspecting contents"));
    let policy = req.content;
    let scan = {
        let x = extract_dir.clone();
        tokio::task::spawn_blocking(move || content::scan(&x, &policy)).await?
    };
    let defender_result = if settings.require_scan {
        job.stage(Stage::Scanning, tr!("Microsoft Defender ile taranıyor", "Scanning with Microsoft Defender"));
        defender::scan(&work).await
    } else {
        EngineResult::skipped("Microsoft Defender")
    };
    if defender_result.status == EngineStatus::Threat {
        return Err(AppError::security(format!(
            "{} {}",
            tr!("Microsoft Defender tehdit buldu, kurulum durduruldu ve dosyalar silindi.", "Microsoft Defender found a threat; installation stopped and the files were deleted."),
            defender_result.detail.replace('\n', " · ")
        )));
    }
    job.check()?;

    let vt = if settings.virustotal {
        match credentials::get(credentials::VIRUSTOTAL_KEY) {
            Ok(Some(key)) if !key.is_empty() => {
                job.stage(Stage::Scanning, tr!("VirusTotal'a özet soruluyor", "Asking VirusTotal about the hash"));
                Some(virustotal::lookup(http, &key, &downloaded.sha256).await)
            }
            _ => None,
        }
    } else {
        None
    };

    let source = security::source_info(source_url.as_deref().filter(|_| !matches!(provenance, Provenance::Local { .. })), None, req.trusted, req.known);
    let mut report = SecurityReport {
        verdict: security::Verdict::Safe,
        score: 0,
        source,
        verification,
        archive: Some(ArchiveFacts {
            name: downloaded.path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
            kind: kind.label().into(),
            size: downloaded.size,
            sha256: downloaded.sha256.clone(),
        }),
        defender: defender_result,
        virustotal: vt,
        nexus_scan,
        findings: scan.findings,
        code_files: scan.code_files,
        scanned_files: scan.files,
        total_size: scan.size,
        needs_override: None,
        blocked: None,
        scanned_at: fsx::now_ts(),
    };
    security::finalize(&mut report, &settings.security_policy());

    Ok(Intake {
        work_dir: work,
        archive_path: downloaded.path,
        extract_dir,
        provenance,
        source_label,
        source_url,
        sha256: downloaded.sha256,
        md5: downloaded.md5,
        report,
    })
}

/// Oyunun kendi karantina kökünde, görev için klasör (`<kök>/<görev kimliği>`).
pub fn work_dir_for(staging_root: &Path, job: &JobHandle) -> PathBuf {
    staging_root.join(job.id())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;

    fn make_zip(path: &Path) {
        let mut w = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
        let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        w.start_file("MyMod/manifest.json", opts).unwrap();
        w.write_all(b"{\"Name\":\"My Mod\"}").unwrap();
        w.start_file("MyMod/MyMod.dll", opts).unwrap();
        w.write_all(b"not really a dll").unwrap();
        w.finish().unwrap();
    }

    #[test]
    fn names_downloads_safely() {
        assert_eq!(file_name_for("https://x/y/My%20Mod-1.2.zip?token=1", "a.zip"), "My_20Mod-1.2.zip");
        assert_eq!(file_name_for("", "fallback"), "fallback.zip");
        assert_eq!(file_name_for("../../evil.7z", "a.zip"), "evil.7z");
    }

    #[tokio::test]
    async fn local_archive_goes_through_the_pipeline() {
        let services = Services::for_tests();
        services.update_settings(|s| {
            s.require_scan = false; // Defender testlerde çalışmaz
            s.virustotal = false;
        }).unwrap();
        let root = services.paths.local.join("t");
        std::fs::create_dir_all(&root).unwrap();
        let zip_path = root.join("mod.zip");
        make_zip(&zip_path);
        let job = JobHandle::detached("t");
        let intake = run(
            &services,
            &job,
            IntakeRequest {
                origin: Origin::Local { path: zip_path },
                work_dir: root.join("work"),
                content: ContentPolicy { expected_code: &["dll"], info_ext: &[] },
                trusted: &[],
                known: &[],
                nexus_lookup: None,
            },
        )
        .await
        .unwrap();
        assert!(intake.extract_dir.join("MyMod").join("manifest.json").is_file());
        assert_eq!(intake.report.verification.status, VerificationStatus::Local);
        assert_eq!(intake.report.code_files.len(), 1);
        assert!(intake.report.code_files[0].expected);
        assert_eq!(intake.report.verdict, security::Verdict::Safe);
        assert!(matches!(intake.provenance, Provenance::Local { .. }));
        let _ = std::fs::remove_dir_all(services.paths.local.parent().unwrap());
    }
}
