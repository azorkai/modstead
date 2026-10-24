//! Bannerlord kurulumu. İndirme, doğrulama, güvenli açma ve tarama çekirdeğin ortak hattında
//! (`modstead_core::intake`); burada yalnızca oyuna özel adımlar var:
//!
//! 1. Görev açılır, karantina `<oyun>\.modstead\staging\<görev>` olur (oyunla aynı sürücü → taşıma anlık)
//! 2. `intake::run` arşivi indirir/doğrular/açar/tarar ve güvenlik raporu üretir
//! 3. `analyze` açılan klasördeki modülleri bulur, kurulu sürümlerle karşılaştırır → plan
//! 4. Görev incelemeye alınır; kullanıcı onaylayınca `confirm` planı `apply` ile uygular

pub mod analyze;
pub mod apply;
pub mod backups;

use std::path::PathBuf;
use std::sync::Arc;

use modstead_core::intake::{self, IntakeRequest, Origin, Provenance};
use modstead_core::security::SecurityReport;
use modstead_core::{AppError, AppResult, JobHandle, JobSnapshot, Stage, fsx, tr};
use serde::{Deserialize, Serialize};
use serde_json::json;

pub use analyze::PlannedModule;

use crate::state::Bannerlord;
use crate::{ID, INFO, NEXUS};

/// Kurulan arşivin kaynağı. Otağ'ın `installs.json` biçimiyle aynıdır (veri aktarımı birebir kopya).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum InstallSource {
    #[serde(rename_all = "camelCase")]
    Nexus { mod_id: u64, file_id: u64, file_name: String },
    #[serde(rename_all = "camelCase")]
    Github { repo: String, tag: String, asset: String },
    #[serde(rename_all = "camelCase")]
    Url { url: String, file_name: String },
    #[serde(rename_all = "camelCase")]
    Local { file_name: String },
}

impl From<&Provenance> for InstallSource {
    fn from(p: &Provenance) -> Self {
        match p {
            Provenance::Nexus { mod_id, file_id, file_name, .. } => InstallSource::Nexus { mod_id: *mod_id, file_id: *file_id, file_name: file_name.clone() },
            Provenance::Github { repo, tag, asset } => InstallSource::Github { repo: repo.clone(), tag: tag.clone(), asset: asset.clone() },
            Provenance::Url { url, file_name } => InstallSource::Url { url: url.clone(), file_name: file_name.clone() },
            Provenance::Local { file_name } => InstallSource::Local { file_name: file_name.clone() },
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallRecord {
    pub module_id: String,
    pub folder: String,
    pub version: String,
    pub source: InstallSource,
    pub archive_sha256: String,
    pub installed_at: i64,
}

/// İnceleme penceresinde güvenlik raporunun yanında gösterilen, oyuna özel plan.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub source_label: String,
    pub source_url: Option<String>,
    pub modules: Vec<PlannedModule>,
    pub notes: Vec<String>,
}

/// Onaya kadar görevde saklanan karantina verisi.
pub struct Staged {
    pub work_dir: PathBuf,
    pub extract_dir: PathBuf,
    pub source: InstallSource,
    pub sha256: String,
    pub report: SecurityReport,
    pub modules: Vec<PlannedModule>,
}

/// Arayüzün onay penceresinden gelen seçimler.
#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct ConfirmOptions {
    /// Kurulacak modüller; verilmezse engellenmemiş tümü (boş liste hiçbirini kurmaz).
    pub module_ids: Option<Vec<String>>,
}

/// Kurulum görevi açar ve arka planda hattı başlatır; sonuç `modstead://job` olaylarıyla gelir.
pub fn spawn(game: &Arc<Bannerlord>, title: &str, source: &str, origin: Origin) -> JobSnapshot {
    let job = game.services.jobs.create(ID, "install", title, source);
    let (g, j) = (game.clone(), job.clone());
    tauri::async_runtime::spawn(async move { run(&g, &j, origin).await });
    job.snapshot()
}

async fn run(game: &Bannerlord, job: &JobHandle, origin: Origin) {
    let snap = match game.current() {
        Ok(s) => s,
        Err(e) => return job.fail(&e),
    };
    let work = intake::work_dir_for(&Bannerlord::staging_dir(&snap.game), job);
    match run_inner(game, job, origin, work.clone()).await {
        Ok((staged, plan)) => {
            let count = plan.modules.iter().filter(|m| m.blocked.is_none()).count();
            let report = staged.report.clone();
            job.set_staged(staged);
            job.review(
                tr!(format!("{count} modül incelemeye hazır"), format!("{count} module(s) ready for review")),
                Some(report),
                serde_json::to_value(&plan).unwrap_or_default(),
            );
        }
        Err(e) => {
            job.fail(&e);
            let _ = fsx::remove_dir(&work);
        }
    }
}

async fn run_inner(game: &Bannerlord, job: &JobHandle, origin: Origin, work: PathBuf) -> AppResult<(Staged, InstallPlan)> {
    let intake = intake::run(
        &game.services,
        job,
        IntakeRequest {
            origin,
            work_dir: work.clone(),
            content: INFO.content,
            trusted: INFO.trusted_sources,
            known: INFO.known_sources,
            nexus_lookup: Some(NEXUS),
        },
    )
    .await?;

    job.stage(Stage::Analyzing, tr!("Modüller inceleniyor", "Analyzing modules"));
    let snap = game.refresh()?;
    let (modules, mut notes) = {
        let x = intake.extract_dir.clone();
        let catalog = snap.catalog.clone();
        tokio::task::spawn_blocking(move || analyze::analyze(&x, &catalog)).await?
    };
    if modules.is_empty() {
        return Err(AppError::msg(notes.join(" ")));
    }
    if matches!(intake.provenance, Provenance::Local { .. }) {
        notes.push(
            tr!(
                "Yerel dosyalar için kaynak doğrulaması yapılamaz; dosyayı güvendiğiniz bir yerden aldığınızdan emin olun.",
                "Local files cannot be verified against a source; make sure you got this file from a place you trust."
            )
            .into(),
        );
    }
    let plan = InstallPlan { source_label: intake.source_label.clone(), source_url: intake.source_url.clone(), modules: modules.clone(), notes };
    let staged = Staged {
        work_dir: work,
        extract_dir: intake.extract_dir,
        source: InstallSource::from(&intake.provenance),
        sha256: intake.sha256,
        report: intake.report,
        modules,
    };
    Ok((staged, plan))
}

/// Görev listeden kaldırıldı ya da iptal edildi: karantinayı sil.
pub fn discard(job: &JobHandle) {
    if let Some(staged) = job.take_staged::<Staged>() {
        let _ = fsx::remove_dir(&staged.work_dir);
    }
}

/// Kullanıcının onayından sonra kurulumu yapar.
pub async fn confirm(game: &Bannerlord, id: &str, accept_risk: bool, options: ConfirmOptions) -> AppResult<JobSnapshot> {
    let job = game.services.jobs.get(id).filter(|j| j.game() == ID).ok_or_else(|| AppError::NotFound(tr!("görev", "task").into()))?;
    if job.snapshot().stage != Stage::Review {
        return Err(AppError::msg(tr!("bu görev onay beklemiyor", "this task is not awaiting approval")));
    }
    let staged = job.take_staged::<Staged>().ok_or_else(|| AppError::msg(tr!("kurulum verisi bulunamadı", "installation data not found")))?;
    if let Some(reason) = staged.report.blocked.clone() {
        job.set_staged(staged);
        return Err(AppError::security(reason));
    }
    if let Some(reason) = staged.report.needs_override.clone() {
        if !accept_risk {
            job.set_staged(staged);
            return Err(AppError::security(format!("{}: {reason}", tr!("açık onayınız gerekiyor", "your explicit approval is required"))));
        }
    }
    let selected: Vec<PlannedModule> = staged
        .modules
        .iter()
        .filter(|m| m.blocked.is_none() && options.module_ids.as_ref().is_none_or(|ids| ids.iter().any(|x| x.eq_ignore_ascii_case(&m.id))))
        .cloned()
        .collect();
    if selected.is_empty() {
        job.set_staged(staged);
        return Err(AppError::msg(tr!("kurulacak modül seçilmedi", "no module selected to install")));
    }

    let _g = game.write_lock.lock().await;
    job.stage(Stage::Installing, tr!("Oyun klasörüne yerleştiriliyor", "Placing into the game folder"));
    let snap = game.current()?;
    let settings = game.settings();
    let opts = apply::ApplyOptions { unblock: settings.unblock_after_install, keep_backups: settings.backups_per_module as usize };
    let dirs = Bannerlord::backups_dirs(&snap.game);
    let result = {
        let g = snap.game.clone();
        tokio::task::spawn_blocking(move || {
            let src = apply::Source { extract_dir: &staged.extract_dir, source: &staged.source, sha256: &staged.sha256 };
            let r = apply::install_modules(&g, &dirs, &src, &selected, &opts);
            (r, staged.work_dir)
        })
        .await?
    };
    let (records, work_dir) = result;
    let _ = fsx::remove_dir(&work_dir);
    let records = match records {
        Ok(r) => r,
        Err(e) => {
            job.fail(&e);
            return Err(e);
        }
    };

    let mut installs = game.installs();
    for r in &records {
        installs.insert(r.module_id.to_lowercase(), r.clone());
    }
    game.save_installs(&installs)?;

    // Yeni modülleri yükleme listesine ekle (ayara göre etkinleştir ve sırala).
    if let Err(e) = game.place_new_modules(&records.iter().map(|r| r.module_id.clone()).collect::<Vec<_>>()) {
        log::warn!("yükleme listesi güncellenemedi: {e}");
    }

    let names: Vec<String> = records.iter().map(|r| format!("{} {}", r.module_id, r.version)).collect();
    job.done(format!("{}: {}", tr!("Kuruldu", "Installed"), names.join(", ")), Some(json!({ "modules": records.iter().map(|r| &r.module_id).collect::<Vec<_>>() })));
    game.services.game_changed(ID);
    Ok(job.snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_install_records_still_parse() {
        // Otağ'ın installs.json kaydı (veri aktarımında birebir kopyalanır).
        let raw = r#"{"bannerlord.harmony":{"moduleId":"Bannerlord.Harmony","folder":"Bannerlord.Harmony","version":"v2.4.2.248",
            "source":{"kind":"github","repo":"BUTR/Bannerlord.Harmony","tag":"v2.4.2.248","asset":"Bannerlord.Harmony.7z"},
            "archiveSha256":"ab","installedAt":1}}"#;
        let map: std::collections::HashMap<String, InstallRecord> = serde_json::from_str(raw).unwrap();
        assert!(matches!(map["bannerlord.harmony"].source, InstallSource::Github { .. }));
    }
}
