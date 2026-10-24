//! Kurulum: kaynak → ortak kabul hattı (`intake`: indir, doğrula, güvenli aç, içerik + Defender + VirusTotal)
//! → MSFS'e özel denetimler (paket yapısı, layout.json) → plan → kullanıcı onayı (`msfs_confirm_job`)
//! → kütüphaneye al → seçilen simlerde etkinleştir.
//!
//! Karantina kütüphanenin içinde (`<kütüphane>\.modstead\staging\<görev>`) durur; son taşıma aynı birimde bir
//! yeniden adlandırmadır ve sim bu klasörü görmez. Kurucular (.exe/.msi) asla çalıştırılmaz.

use std::path::{Path, PathBuf};

use modstead_core::fsx;
use modstead_core::intake::{self, IntakeRequest, Origin};
use modstead_core::nexus;
use modstead_core::prelude::*;
use modstead_core::security::content;
use modstead_core::security::{self, EngineResult, Finding, SecurityReport, Severity, Trust, Verification, VerificationStatus, defender};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::package::{find_package_roots, read_layout, read_package};
use crate::scanner::{WORK_DIR, library_id};
use crate::sims::{SIM_2020, SIM_2024};
use crate::store::{ModMeta, now_iso};
use crate::util::{is_link, link_target};
use crate::{ID, INFO, Msfs};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedPackage {
    /// Karantinadaki göreli yol (`/` ayraçlı); onayda seçim anahtarı.
    pub rel: String,
    pub folder: String,
    pub title: String,
    pub creator: String,
    pub version: String,
    pub category: String,
    pub built_for: String,
    pub size: u64,
    pub file_count: u32,
    /// Paketin içindeki çalıştırılabilir/kod dosyaları (ayıklanacaklar).
    pub executables: u32,
    pub existing_id: Option<String>,
    pub existing_version: Option<String>,
    pub existing_built_for: Option<String>,
    /// install | update | variant
    pub action: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSim {
    pub id: String,
    pub short: String,
    pub usable: bool,
    pub running: bool,
}

/// İnceleme penceresinde güvenlik raporunun yanında gösterilen MSFS planı (`JobSnapshot.plan`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub packages: Vec<DetectedPackage>,
    pub suggested_sims: Vec<String>,
    pub sims: Vec<PlanSim>,
    pub strip_executables: bool,
    /// Kurulumdan önce ayıklanacak dosyalar (arşiv köküne göre göreli).
    pub strip: Vec<String>,
    pub library: String,
    pub catalog_id: Option<String>,
    pub release_tag: Option<String>,
}

/// Onaya kadar görevde saklanan karantina verisi.
pub struct Staged {
    pub work_dir: PathBuf,
    pub extract_dir: PathBuf,
    pub plan: InstallPlan,
    pub report: SecurityReport,
    pub source_url: Option<String>,
    pub source_label: String,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct ConfirmOptions {
    /// Kurulacak paketlerin `rel` değerleri.
    pub packages: Vec<String>,
    /// Etkinleştirilecek simler (boşsa yalnızca kütüphaneye alınır).
    pub sims: Vec<String>,
}

/// Görevin kaynağı ve katalog bilgisi.
#[derive(Default, Clone)]
pub struct JobMeta {
    pub catalog_id: Option<String>,
    pub release_tag: Option<String>,
    pub preferred_sim: Option<String>,
    /// Biliniyorsa indirme boyutu (boş alan denetimi için).
    pub size: Option<u64>,
}

enum Source {
    Intake(Origin),
    Folder(PathBuf),
    /// Mod tarayıcısı penceresinin indirdiği dosya ve geldiği adres.
    Browser { path: PathBuf, url: String },
}

const INSTALLER_EXT: &[&str] = &["exe", "msi", "msix", "appx", "bat", "cmd", "ps1"];

pub fn staging_root(library: &Path) -> PathBuf {
    library.join(WORK_DIR).join("staging")
}

/// Uygulama açılırken önceki oturumdan kalan karantina klasörlerini siler (görevler oturumla biter).
pub fn clean_stale_staging(game: &Msfs) {
    if let Some(lib) = game.settings().library_path {
        let root = staging_root(&lib);
        std::thread::spawn(move || {
            if let Ok(rd) = std::fs::read_dir(&root) {
                for e in rd.flatten() {
                    let _ = fsx::remove_dir(&e.path());
                }
            }
        });
    }
}

/// Arşiv + açılmış hali için yaklaşık üç katı yer gerekir.
fn ensure_space(library: &Path, size: Option<u64>) -> AppResult<()> {
    if let (Some(size), Some(free)) = (size, modstead_core::platform::disk_free(library)) {
        let need = size.saturating_mul(3);
        if size > 0 && free < need {
            return Err(AppError::msg(tr!(
                format!("Kütüphane diskinde yeterli yer yok: {} gerekli, {} boş.", crate::util::gb(need), crate::util::gb(free)),
                format!("Not enough space on the library disk: {} needed, {} free.", crate::util::gb(need), crate::util::gb(free))
            )));
        }
    }
    Ok(())
}

fn start(game: &Msfs, source: Source, title: &str, kind_label: &str, meta: JobMeta) -> AppResult<JobSnapshot> {
    let library = game.library()?;
    ensure_space(&library, meta.size)?;
    let job = game.services.jobs.create(ID, "install", title, kind_label);
    let snap = job.snapshot();
    let me = game.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = prepare(&me, &job, source, &library, meta).await {
            job.fail(&e);
        }
    });
    Ok(snap)
}

/// Yerel arşiv ya da klasör (sürükle-bırak, dosya seçici, mod tarayıcısı).
pub fn start_path(game: &Msfs, path: PathBuf) -> AppResult<JobSnapshot> {
    if !path.is_absolute() || !(path.is_file() || path.is_dir()) {
        return Err(AppError::msg(tr!(format!("Dosya bulunamadı: {}", path.display()), format!("File not found: {}", path.display()))));
    }
    let name = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if path.is_file() && INSTALLER_EXT.contains(&ext.as_str()) {
        return Err(AppError::security(tr!(
            format!("“{name}” bir kurulum programı. Modstead kurucuları asla çalıştırmaz; güvendiğiniz bir kaynaktan geldiyse kendiniz çalıştırın."),
            format!("“{name}” is an installer. Modstead never runs installers; if it came from a source you trust, run it yourself.")
        )));
    }
    if path.is_dir() {
        if is_link(&path) {
            return Err(AppError::security(tr!("Bağlantı (junction/symlink) klasörleri kurulmaz.", "Linked (junction/symlink) folders are not installed.")));
        }
        return start(game, Source::Folder(path), &name, "local", JobMeta::default());
    }
    let size = std::fs::metadata(&path).ok().map(|m| m.len());
    start(game, Source::Intake(Origin::Local { path }), &name, "local", JobMeta { size, ..Default::default() })
}

/// Kullanıcının verdiği adres (izinli değilse HTTPS zorunlu kullanıcı istemcisiyle; kaynak güveni rapora yazılır).
pub fn start_url(game: &Msfs, url: &str) -> AppResult<JobSnapshot> {
    let parsed = url::Url::parse(url.trim()).map_err(|_| AppError::msg(tr!("Geçersiz adres", "Invalid address")))?;
    if parsed.scheme() != "https" {
        return Err(AppError::security(tr!("Yalnızca https adresleri indirilebilir.", "Only https addresses can be downloaded.")));
    }
    let title = parsed
        .path_segments()
        .and_then(|mut s| s.next_back().map(str::to_string))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| parsed.host_str().unwrap_or("indirme").to_string());
    start(game, Source::Intake(Origin::Url { url: parsed.to_string() }), &title, "url", JobMeta::default())
}

/// Katalogdaki GitHub sürümü.
pub fn start_github(game: &Msfs, title: &str, repo: &str, release_id: u64, asset_id: u64, meta: JobMeta) -> AppResult<JobSnapshot> {
    start(game, Source::Intake(Origin::Github { repo: repo.to_string(), release_id: Some(release_id), asset_id }), title, "github", meta)
}

/// Nexus "Mod Manager Download" bağlantısı.
pub fn start_nxm(game: &Msfs, url: &str) -> AppResult<JobSnapshot> {
    let link = nexus::parse_nxm(url)?;
    let ng = INFO.nexus_game(&link.domain).ok_or_else(|| {
        AppError::msg(tr!(format!("Bu bağlantı MSFS'e ait değil ({}).", link.domain), format!("This link does not belong to MSFS ({}).", link.domain)))
    })?;
    let title = format!("Nexus #{}", link.mod_id);
    start(game, Source::Intake(Origin::Nexus { game: ng, mod_id: link.mod_id, file_id: link.file_id, nxm: Some(link) }), &title, "nexus", JobMeta::default())
}

/// Mod tarayıcısında indirme başladı: görevi açar ve dosyanın ineceği yeri döndürür.
pub fn begin_browser(game: &Msfs, name: &str) -> AppResult<(JobHandle, PathBuf)> {
    let library = game.library()?;
    let job = game.services.jobs.create(ID, "install", name, "browser");
    let dir = library.join(WORK_DIR).join("downloads").join(job.id());
    std::fs::create_dir_all(&dir)?;
    let file = fsx::sanitize_name(name);
    job.stage(Stage::Downloading, tr!("Mod tarayıcısından indiriliyor", "Downloading from the mod browser"));
    Ok((job, dir.join(file)))
}

/// Mod tarayıcısındaki indirme bitti: dosyayı hattan geçirir.
pub fn finish_browser(game: &Msfs, job: JobHandle, path: PathBuf, url: String) {
    let me = game.clone();
    tauri::async_runtime::spawn(async move {
        let download_dir = path.parent().map(Path::to_path_buf);
        let result = async {
            job.check()?;
            let library = me.library()?;
            prepare(&me, &job, Source::Browser { path, url }, &library, JobMeta::default()).await
        }
        .await;
        if let Some(d) = download_dir {
            let _ = fsx::remove_dir(&d);
        }
        if let Err(e) = result {
            job.fail(&e);
        }
    });
}

/// Bir klasörü karantinaya kopyalayıp tarar (arşiv değil; hattın klasör karşılığı).
async fn intake_folder(game: &Msfs, job: &JobHandle, src: &Path, work_dir: &Path) -> AppResult<(PathBuf, SecurityReport)> {
    let settings = game.services.settings();
    let extract_dir = work_dir.join("x");
    let name = src.file_name().map(|f| f.to_os_string()).unwrap_or_default();
    job.stage(Stage::Extracting, tr!("Klasör karantinaya kopyalanıyor", "Copying the folder into quarantine"));
    {
        let (s, d, j) = (src.to_path_buf(), extract_dir.join(&name), job.clone());
        tokio::task::spawn_blocking(move || {
            let mut copied = 0u64;
            fsx::copy_dir(&s, &d, |n| {
                copied += n;
                j.progress(copied, None);
            })
        })
        .await??;
    }
    job.check()?;
    job.stage(Stage::Scanning, tr!("İçerik denetleniyor", "Inspecting contents"));
    let scan = {
        let x = extract_dir.clone();
        tokio::task::spawn_blocking(move || content::scan(&x, &INFO.content)).await?
    };
    let defender_result = if settings.require_scan {
        job.stage(Stage::Scanning, tr!("Microsoft Defender ile taranıyor", "Scanning with Microsoft Defender"));
        defender::scan(&extract_dir).await
    } else {
        EngineResult::skipped("Microsoft Defender")
    };
    if defender_result.status == security::EngineStatus::Threat {
        return Err(AppError::security(format!(
            "{} {}",
            tr!("Microsoft Defender tehdit buldu, kurulum durduruldu ve dosyalar silindi.", "Microsoft Defender found a threat; installation stopped and the files were deleted."),
            defender_result.detail.replace('\n', " · ")
        )));
    }
    let mut report = SecurityReport {
        verdict: security::Verdict::Safe,
        score: 0,
        source: security::source_info(None, Some(tr!("Yerel klasör", "Local folder")), &[], &[]),
        verification: Verification {
            status: VerificationStatus::Local,
            method: tr!("Yerel klasör", "Local folder").into(),
            detail: tr!("Bu klasörü siz seçtiniz; kaynağı doğrulanamadı.", "You chose this folder; its source could not be verified.").into(),
        },
        archive: None,
        defender: defender_result,
        virustotal: None,
        nexus_scan: None,
        findings: scan.findings,
        code_files: scan.code_files,
        scanned_files: scan.files,
        total_size: scan.size,
        needs_override: None,
        blocked: None,
        scanned_at: fsx::now_ts(),
    };
    security::finalize(&mut report, &settings.security_policy());
    Ok((extract_dir, report))
}

fn finding(severity: Severity, code: &str, title: String, detail: String, path: Option<String>) -> Finding {
    Finding { severity, code: code.into(), title, detail, path }
}

/// MSFS'e özel içerik bulguları: paket yok, layout.json yok, layout.json ile disk uyuşmuyor.
pub fn package_findings(extract_dir: &Path, roots: &[PathBuf]) -> Vec<Finding> {
    let mut out = Vec::new();
    if roots.is_empty() {
        out.push(finding(
            Severity::Medium,
            "no-package",
            tr!("MSFS paketi bulunamadı", "No MSFS package found").into(),
            tr!(
                "Arşivde manifest.json içeren bir klasör yok. Bu bir kurucu, belge ya da başka bir sim için olabilir.",
                "The archive has no folder with a manifest.json. It may be an installer, documentation or for another sim."
            )
            .into(),
            None,
        ));
    }
    for pkg in roots {
        let rel = pkg.strip_prefix(extract_dir).unwrap_or(pkg).to_string_lossy().replace('\\', "/");
        let Some(layout) = read_layout(pkg) else {
            out.push(finding(
                Severity::Medium,
                "no-layout",
                tr!("layout.json yok", "No layout.json").into(),
                tr!("Paket sim tarafından eksik yüklenebilir.", "The sim may load the package incompletely.").into(),
                Some(rel),
            ));
            continue;
        };
        let missing: Vec<&String> = layout.paths.iter().filter(|p| !pkg.join(p.replace('/', "\\")).exists()).take(50).collect();
        if let Some(first) = missing.first() {
            out.push(finding(
                Severity::Medium,
                "missing-files",
                tr!("Pakette eksik dosyalar", "Files missing from the package").into(),
                tr!(
                    format!("layout.json'da listelenen {}+ dosya yok (ör. {first}).", missing.len()),
                    format!("{}+ files listed in layout.json are missing (e.g. {first}).", missing.len())
                ),
                Some(rel.clone()),
            ));
        }
        // Sim, layout.json'da olmayan dosyaları yüklemez; çoğunlukla zararsız artıktır.
        let listed: std::collections::HashSet<String> = layout.paths.iter().cloned().collect();
        let mut extra = 0usize;
        for e in walkdir::WalkDir::new(pkg).follow_links(false).into_iter().flatten().filter(|e| e.file_type().is_file()) {
            let r = e.path().strip_prefix(pkg).unwrap_or(e.path()).to_string_lossy().replace('\\', "/").to_lowercase();
            let doc = [".txt", ".md", ".pdf", ".url", ".bak"].iter().any(|x| r.ends_with(x));
            if r != "layout.json" && r != "manifest.json" && !doc && !listed.contains(&r) {
                extra += 1;
                if extra <= 3 {
                    out.push(finding(
                        Severity::Low,
                        "not-in-layout",
                        tr!("layout.json'da olmayan dosya", "File not listed in layout.json").into(),
                        tr!("Sim bu dosyayı yüklemez; paket eksik güncellenmiş olabilir.", "The sim will not load this file; the package may have been updated incompletely.").into(),
                        Some(format!("{rel}/{r}")),
                    ));
                }
            }
        }
    }
    out
}

/// Akıllı varsayılan: 2024 derlemesi yalnız 2024'e; sahne/boya/havalimanı iki sime (genelde sorunsuz geçer);
/// uçak ve araçlar 2020 derlemesiyse 2020'ye (2024'te sistemleri bozulabilir).
pub fn suggest_sims(usable: &[String], packages: &[DetectedPackage], preferred: Option<&str>) -> Vec<String> {
    if let Some(p) = preferred {
        if usable.iter().any(|u| u == p) {
            return vec![p.to_string()];
        }
    }
    let mut out = Vec::new();
    let any_2024 = packages.iter().any(|p| p.built_for == "2024");
    let all_simple = !packages.is_empty() && packages.iter().all(|p| matches!(p.category.as_str(), "scenery" | "airport" | "livery"));
    if any_2024 {
        out.push(SIM_2024.to_string());
    } else {
        out.push(SIM_2020.to_string());
        if all_simple {
            out.push(SIM_2024.to_string());
        }
    }
    let filtered: Vec<String> = out.into_iter().filter(|s| usable.contains(s)).collect();
    if filtered.is_empty() { usable.iter().take(1).cloned().collect() } else { filtered }
}

fn detect_packages(game: &Msfs, extract_dir: &Path, roots: &[PathBuf], report: &SecurityReport) -> Vec<DetectedPackage> {
    let snapshot = game.snapshot();
    let lib_mods: Vec<&crate::scanner::ModEntry> = snapshot.mods.iter().filter(|m| m.source == "library").collect();
    roots
        .iter()
        .map(|root| {
            let info = read_package(root);
            let rel = root.strip_prefix(extract_dir).unwrap_or(root).to_string_lossy().replace('\\', "/");
            let prefix = format!("{rel}/");
            let executables = report.code_files.iter().filter(|c| c.path.starts_with(&prefix)).count() as u32;
            let same_name: Vec<&&crate::scanner::ModEntry> = lib_mods.iter().filter(|m| m.info.folder.eq_ignore_ascii_case(&info.folder)).collect();
            let existing = same_name.iter().find(|m| m.info.built_for == info.built_for).or_else(|| same_name.first()).copied();
            let action = match existing {
                Some(m) if m.info.built_for == info.built_for => "update",
                Some(_) => "variant",
                None => "install",
            };
            DetectedPackage {
                rel,
                folder: info.folder.clone(),
                title: info.title.clone(),
                creator: info.creator.clone(),
                version: info.version.clone(),
                category: info.category.clone(),
                built_for: info.built_for.clone(),
                size: info.size,
                file_count: info.file_count,
                executables,
                existing_id: existing.map(|m| m.id.clone()),
                existing_version: existing.map(|m| m.info.version.clone()),
                existing_built_for: existing.map(|m| m.info.built_for.clone()),
                action: action.into(),
            }
        })
        .collect()
}

async fn prepare(game: &Msfs, job: &JobHandle, source: Source, library: &Path, meta: JobMeta) -> AppResult<()> {
    let work_dir = intake::work_dir_for(&staging_root(library), job);
    let (extract_dir, mut report, source_url, source_label, sha256) = match source {
        Source::Intake(origin) => {
            let req = IntakeRequest {
                origin,
                work_dir: work_dir.clone(),
                content: INFO.content,
                trusted: INFO.trusted_sources,
                known: INFO.known_sources,
                nexus_lookup: None,
            };
            let i = intake::run(&game.services, job, req).await?;
            // Arşiv artık gerekmiyor; büyük modlarda yer kaplamasın.
            let _ = std::fs::remove_file(&i.archive_path);
            (i.extract_dir, i.report, i.source_url, i.source_label, Some(i.sha256))
        }
        Source::Browser { path, url } => {
            let req = IntakeRequest {
                origin: Origin::Local { path },
                work_dir: work_dir.clone(),
                content: INFO.content,
                trusted: INFO.trusted_sources,
                known: INFO.known_sources,
                nexus_lookup: None,
            };
            let mut i = intake::run(&game.services, job, req).await?;
            let _ = std::fs::remove_file(&i.archive_path);
            // Dosya kullanıcının seçtiği yerel bir dosya değil, tarayıcıda açılan siteden geldi: kaynak güveni o siteye göre.
            i.report.source = security::source_info(Some(&url), None, INFO.trusted_sources, INFO.known_sources);
            i.report.verification = Verification {
                status: VerificationStatus::Unverified,
                method: tr!("Kaynak özeti yok", "No source hash").into(),
                detail: tr!(
                    "Dosya mod tarayıcısından indirildi; site dosya özeti yayımlamıyor, kaynağıyla karşılaştırılamadı.",
                    "The file was downloaded in the mod browser; the site publishes no file hash, so it could not be compared with its source."
                )
                .into(),
            };
            security::finalize(&mut i.report, &game.services.security_policy());
            let label = i.report.source.label.clone();
            (i.extract_dir, i.report, Some(url), label, Some(i.sha256))
        }
        Source::Folder(src) => match intake_folder(game, job, &src, &work_dir).await {
            Ok((x, r)) => (x, r, None, tr!("Yerel klasör", "Local folder").to_string(), None),
            Err(e) => {
                let _ = fsx::remove_dir(&work_dir);
                return Err(e);
            }
        },
    };
    let result: AppResult<()> = async {
        job.stage(Stage::Analyzing, tr!("Paket yapısı inceleniyor", "Inspecting package structure"));
        let me = game.clone();
        let (x, rep) = (extract_dir.clone(), report.clone());
        let (packages, extra) = tokio::task::spawn_blocking(move || {
            let roots = find_package_roots(&x, 5);
            let extra = package_findings(&x, &roots);
            (detect_packages(&me, &x, &roots, &rep), extra)
        })
        .await?;
        if !extra.is_empty() {
            report.findings.extend(extra);
            security::finalize(&mut report, &game.services.security_policy());
        }
        let settings = game.settings();
        let sims = game.sims();
        let usable: Vec<String> = sims.iter().filter(|s| s.usable()).map(|s| s.id.clone()).collect();
        let strip: Vec<String> = if settings.strip_executables { report.code_files.iter().map(|c| c.path.clone()).collect() } else { Vec::new() };
        let plan = InstallPlan {
            suggested_sims: suggest_sims(&usable, &packages, meta.preferred_sim.as_deref()),
            packages,
            sims: sims.iter().map(|s| PlanSim { id: s.id.clone(), short: s.short.clone(), usable: s.usable(), running: s.running }).collect(),
            strip_executables: settings.strip_executables,
            strip,
            library: library.display().to_string(),
            catalog_id: meta.catalog_id.clone(),
            release_tag: meta.release_tag.clone(),
        };
        let message = if plan.packages.is_empty() {
            tr!("Arşivde MSFS paketi yok", "No MSFS package in the archive")
        } else {
            match report.verdict {
                security::Verdict::Danger => tr!("Tehlikeli bulgular var — kurulum önerilmez", "Dangerous findings — installation is not recommended"),
                security::Verdict::Caution => tr!("Dikkat gerektiren bulgular var — raporu inceleyin", "Findings need attention — review the report"),
                security::Verdict::Safe => tr!("Tarama temiz — kuruluma hazır", "Scan clean — ready to install"),
            }
        };
        let plan_json = json!(plan);
        job.set_staged(Staged { work_dir: work_dir.clone(), extract_dir: extract_dir.clone(), plan, report: report.clone(), source_url, source_label, sha256 });
        job.review(message, Some(report.clone()), plan_json);
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = fsx::remove_dir(&work_dir);
    }
    result
}

/// Görev kaldırıldı ya da iptal edildi: karantinayı sil.
pub fn discard(job: &JobHandle) {
    if let Some(staged) = job.take_staged::<Staged>() {
        let _ = fsx::remove_dir(&staged.work_dir);
    }
}

/// Kullanıcı onayından sonra paketleri kütüphaneye alır ve seçilen simlerde etkinleştirir.
pub async fn confirm(game: &Msfs, id: &str, accept_risk: bool, opts: ConfirmOptions) -> AppResult<JobSnapshot> {
    let job = game.services.jobs.get(id).ok_or_else(|| AppError::NotFound(tr!("görev", "job").into()))?;
    if job.game() != ID || job.snapshot().stage != Stage::Review {
        return Err(AppError::msg(tr!("Bu görev onay beklemiyor.", "This job is not awaiting confirmation.")));
    }
    let staged = job.take_staged::<Staged>().ok_or_else(|| AppError::msg(tr!("Bu görev onay beklemiyor.", "This job is not awaiting confirmation.")))?;
    let refuse = |staged: Staged, e: AppError| {
        job.set_staged(staged);
        Err(e)
    };
    if let Some(reason) = &staged.report.blocked {
        let reason = reason.clone();
        return refuse(staged, AppError::security(reason));
    }
    if staged.report.needs_override.is_some() && !accept_risk {
        return refuse(staged, AppError::security(tr!("Kurulum için riski açıkça kabul etmeniz gerekiyor.", "You need to explicitly accept the risk to install.")));
    }
    if opts.packages.is_empty() || !opts.packages.iter().all(|r| staged.plan.packages.iter().any(|p| &p.rel == r)) {
        return refuse(staged, AppError::msg(tr!("Kurulacak paket seçilmedi.", "No package selected to install.")));
    }
    job.stage(Stage::Installing, tr!("Kütüphaneye alınıyor", "Moving into the library"));
    let me = game.clone();
    let work_dir = staged.work_dir.clone();
    let result = tokio::task::spawn_blocking(move || install_blocking(&me, &staged, &opts)).await;
    let _ = fsx::remove_dir(&work_dir);
    let me = game.clone();
    let _ = tokio::task::spawn_blocking(move || me.rescan()).await;
    game.changed();
    match result {
        Ok(Ok((installed, warnings))) => {
            let msg = if warnings.is_empty() {
                tr!(format!("{} paket kuruldu", installed.len()), format!("{} package(s) installed", installed.len()))
            } else {
                tr!(
                    format!("{} paket kuruldu. Uyarılar: {}", installed.len(), warnings.join(" · ")),
                    format!("{} package(s) installed. Warnings: {}", installed.len(), warnings.join(" · "))
                )
            };
            job.done(msg, Some(json!({ "installed": installed, "warnings": warnings })));
            Ok(job.snapshot())
        }
        Ok(Err(e)) => {
            job.fail(&e);
            Err(e)
        }
        Err(e) => {
            let e = AppError::from(e);
            job.fail(&e);
            Err(e)
        }
    }
}

fn install_blocking(game: &Msfs, staged: &Staged, opts: &ConfirmOptions) -> AppResult<(Vec<String>, Vec<String>)> {
    let _guard = game.inner.fs_lock.lock().unwrap();
    let library = game.library()?;
    let sims = game.sims();
    let report = &staged.report;
    let mut installed = Vec::new();
    let mut warnings = Vec::new();

    for pkg in staged.plan.packages.iter().filter(|p| opts.packages.contains(&p.rel)) {
        let src = fsx::resolve_under(&staged.extract_dir, &pkg.rel)?;
        if !src.is_dir() {
            warnings.push(tr!(format!("{} bulunamadı", pkg.folder), format!("{} not found", pkg.folder)));
            continue;
        }
        // Çalıştırılabilir dosyaları ayıkla: sim bunlara ihtiyaç duymaz.
        let mut stripped = Vec::new();
        if staged.plan.strip_executables {
            let prefix = format!("{}/", pkg.rel);
            for rel in staged.plan.strip.iter().filter(|e| e.starts_with(&prefix)) {
                if let Ok(p) = fsx::resolve_under(&staged.extract_dir, rel) {
                    if std::fs::remove_file(&p).is_ok() {
                        stripped.push(rel.clone());
                    }
                }
            }
        }

        let dest = match pkg.action.as_str() {
            "update" => pkg
                .existing_id
                .as_deref()
                .and_then(|id| game.find_mod(id).ok())
                .and_then(|m| m.library_path)
                .unwrap_or_else(|| library.join(&pkg.folder)),
            "variant" => library.join(format!("msfs{}", pkg.built_for)).join(&pkg.folder),
            _ => library.join(&pkg.folder),
        };
        if !crate::util::is_within(&dest, &library) {
            return Err(AppError::security(tr!("Hedef kütüphanenin dışında.", "The target is outside the library.")));
        }

        if dest.exists() {
            // Güncelleme: eski sürümün etkin olduğu simler kapalı olmalı.
            for s in sims.iter().filter(|s| s.running) {
                let linked = s.containers().iter().any(|(_, d)| link_target(&d.join(&pkg.folder)).is_some_and(|t| fsx::norm_key(&t) == fsx::norm_key(&dest)));
                if linked {
                    return Err(AppError::GameRunning(format!("MSFS {}", s.short)));
                }
            }
            // Eskisini önce yana al, yenisi yerleşince sil: yarıda kalırsa geri dönülebilir.
            let backup = staged.work_dir.join(format!("eski-{}", pkg.folder));
            std::fs::rename(&dest, &backup)?;
            if let Err(e) = fsx::move_dir(&src, &dest) {
                let _ = std::fs::rename(&backup, &dest);
                return Err(AppError::msg(tr!(format!("{} yerleştirilemedi: {e}", pkg.folder), format!("{} could not be put in place: {e}", pkg.folder))));
            }
            let _ = fsx::remove_dir(&backup);
        } else {
            fsx::move_dir(&src, &dest)?;
        }

        let mod_id = library_id(&library, &dest);
        {
            let mut db = game.inner.db.lock().unwrap();
            let prev = db.mods.get(&mod_id).cloned().unwrap_or_default();
            db.mods.insert(
                mod_id.clone(),
                ModMeta {
                    source_url: staged.source_url.clone().or(prev.source_url),
                    source_label: Some(staged.source_label.clone()),
                    catalog_id: staged.plan.catalog_id.clone().or(prev.catalog_id),
                    release_tag: staged.plan.release_tag.clone(),
                    installed_at: Some(now_iso()),
                    archive_sha256: staged.sha256.clone(),
                    report: Some(report.clone()),
                    stripped,
                    favorite: prev.favorite,
                    tags: prev.tags,
                    notes: prev.notes,
                },
            );
        }
        game.save_db();
        game.inner.cache.lock().unwrap().invalidate(&dest);

        for sim_id in &opts.sims {
            if let Err(e) = crate::linker::enable(&sims, &library, &dest, &pkg.built_for, sim_id) {
                warnings.push(format!("{} ({}): {e}", pkg.folder, sim_id));
            }
        }
        installed.push(mod_id);
    }
    Ok((installed, warnings))
}

/// Kurulu bir modu yeniden tarar (içerik + Defender); kaynağı ve doğrulaması kayıttan gelir.
pub async fn rescan_security(game: &Msfs, id: &str) -> AppResult<SecurityReport> {
    let m = tokio::task::spawn_blocking({
        let me = game.clone();
        let id = id.to_string();
        move || me.find_mod(&id)
    })
    .await??;
    let path = m.info.path.clone();
    let scan = {
        let p = path.clone();
        tokio::task::spawn_blocking(move || content::scan(&p, &INFO.content)).await?
    };
    let settings = game.services.settings();
    let defender_result = if settings.require_scan { defender::scan(&path).await } else { EngineResult::skipped("Microsoft Defender") };
    let prev = m.meta.report.clone();
    let mut report = SecurityReport {
        verdict: security::Verdict::Safe,
        score: 0,
        source: prev.as_ref().map(|r| r.source.clone()).unwrap_or_else(|| {
            security::source_info(m.meta.source_url.as_deref(), m.meta.source_label.as_deref(), INFO.trusted_sources, INFO.known_sources)
        }),
        verification: prev.as_ref().map(|r| r.verification.clone()).unwrap_or(Verification {
            status: VerificationStatus::Local,
            method: tr!("Kurulu paket", "Installed package").into(),
            detail: tr!("Paket diskte yeniden tarandı; kaynağı kayıtlı değil.", "The package was rescanned on disk; its source is not recorded.").into(),
        }),
        archive: prev.as_ref().and_then(|r| r.archive.clone()),
        defender: defender_result,
        virustotal: prev.as_ref().and_then(|r| r.virustotal.clone()),
        nexus_scan: prev.as_ref().and_then(|r| r.nexus_scan.clone()),
        findings: scan.findings,
        code_files: scan.code_files,
        scanned_files: scan.files,
        total_size: scan.size,
        needs_override: None,
        blocked: None,
        scanned_at: fsx::now_ts(),
    };
    // Kurulu paketin kaynağı bilinmiyorsa "tanınmayan site" sayılmasın.
    if report.source.trust == Trust::Unknown && m.meta.source_url.is_none() {
        report.source.trust = Trust::Local;
    }
    security::finalize(&mut report, &settings.security_policy());
    {
        let mut db = game.inner.db.lock().unwrap();
        db.mods.entry(id.to_string()).or_default().report = Some(report.clone());
    }
    game.save_db();
    let me = game.clone();
    tokio::task::spawn_blocking(move || me.rescan()).await?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pkg(category: &str, built_for: &str) -> DetectedPackage {
        DetectedPackage {
            rel: "x".into(),
            folder: "x".into(),
            title: "X".into(),
            creator: String::new(),
            version: String::new(),
            category: category.into(),
            built_for: built_for.into(),
            size: 0,
            file_count: 0,
            executables: 0,
            existing_id: None,
            existing_version: None,
            existing_built_for: None,
            action: "install".into(),
        }
    }

    #[test]
    fn suggests_sims_by_build_and_category() {
        let both = vec![SIM_2020.to_string(), SIM_2024.to_string()];
        assert_eq!(suggest_sims(&both, &[pkg("aircraft", "2024")], None), vec![SIM_2024]);
        assert_eq!(suggest_sims(&both, &[pkg("aircraft", "2020")], None), vec![SIM_2020]);
        assert_eq!(suggest_sims(&both, &[pkg("livery", "2020"), pkg("airport", "2020")], None), vec![SIM_2020, SIM_2024]);
        assert_eq!(suggest_sims(&both, &[pkg("aircraft", "2020")], Some(SIM_2024)), vec![SIM_2024]);
        // Yalnızca 2024 kuruluysa 2020 önerilmez.
        assert_eq!(suggest_sims(&[SIM_2024.to_string()], &[pkg("aircraft", "2020")], None), vec![SIM_2024]);
        assert!(suggest_sims(&[], &[pkg("aircraft", "2020")], None).is_empty());
    }

    #[test]
    fn package_findings_detect_layout_problems() {
        let root = std::env::temp_dir().join(format!("msfs-findings-{}", fsx::short_id()));
        let a = root.join("a-pkg");
        std::fs::create_dir_all(a.join("scenery")).unwrap();
        std::fs::write(a.join("manifest.json"), r#"{"title":"A"}"#).unwrap();
        std::fs::write(a.join("layout.json"), r#"{"content":[{"path":"scenery/a.bgl","size":1},{"path":"scenery/gone.bgl","size":1}]}"#).unwrap();
        std::fs::write(a.join("scenery").join("a.bgl"), b"x").unwrap();
        std::fs::write(a.join("scenery").join("stray.bgl"), b"x").unwrap();
        let b = root.join("b-pkg");
        std::fs::create_dir_all(&b).unwrap();
        std::fs::write(b.join("manifest.json"), r#"{"title":"B"}"#).unwrap();
        let roots = find_package_roots(&root, 3);
        let f = package_findings(&root, &roots);
        let codes: Vec<&str> = f.iter().map(|x| x.code.as_str()).collect();
        assert!(codes.contains(&"missing-files"));
        assert!(codes.contains(&"not-in-layout"));
        assert!(codes.contains(&"no-layout"));
        assert!(package_findings(&root, &[]).iter().any(|x| x.code == "no-package"));
        std::fs::remove_dir_all(&root).unwrap();
    }
}
