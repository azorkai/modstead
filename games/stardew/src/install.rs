//! Kurulum: her arşiv bir görevdir. Ortak kabul hattı (`intake`) indirir, doğrular, güvenle açar
//! ve tarar; burada açılan içerik incelenip plan çıkarılır (ne kurulacak, hangisi güncelleme,
//! hangi bağımlılıklar eksik) ve görev inceleme penceresine düşer. Kullanıcı onaylayınca
//! (`stardew_confirm_job`) Mods klasörüne taşınır: güncellemede eski sürüm çöp kutusuna gider,
//! config.json korunur, her şey günlüğe yazılır ve geri alınabilir.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use modstead_core::intake::{self, Intake, IntakeRequest, Origin};
use modstead_core::nexus::{NexusGame, NxmLink};
use modstead_core::prelude::*;
use modstead_core::security::SecurityReport;
use modstead_core::{fsx, version};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::ops::{self, Action, JournalEntry};
use crate::scan::{self, ModInfo};
use crate::util::move_path;
use crate::{ID, INFO, Stardew, bail, smapi};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StagedMod {
    pub key: String,
    pub folder_name: String,
    pub name: String,
    pub unique_id: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub kind: String,
    /// install | update | reinstall | downgrade
    pub action: String,
    pub existing_folder: Option<String>,
    pub existing_version: Option<String>,
    pub existing_enabled: Option<bool>,
    pub size: u64,
    pub file_count: u32,
    pub warnings: Vec<String>,
    pub missing_deps: Vec<String>,
    pub manifest_error: Option<String>,
    pub keeps_config: bool,
}

/// İnceleme penceresine giden plan (`GameModule.ReviewPlan` çizer).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    /// Plan türü: "mods" (SMAPI kurulumu "smapi" türünde ayrı plan verir).
    pub kind: &'static str,
    pub source_name: String,
    pub mods: Vec<StagedMod>,
    pub warnings: Vec<String>,
    pub total_size: u64,
    pub file_count: u32,
    /// Arşiv Mods klasörünün içindeyse kurulumdan sonra çöp kutusuna taşınabilir.
    pub source_in_mods: bool,
}

pub struct ModsStaged {
    pub intake: Intake,
    pub plan: InstallPlan,
    pub roots: HashMap<String, PathBuf>,
    /// Mods içindeki arşivin göreli yolu (kurulumdan sonra çöpe taşımak için).
    pub source_rel: Option<String>,
}

/// Görevde saklanan, onay bekleyen karantina verisi.
pub enum Staged {
    Mods(ModsStaged),
    Smapi(smapi::SmapiStaged),
}

impl Staged {
    fn intake(&self) -> &Intake {
        match self {
            Staged::Mods(m) => &m.intake,
            Staged::Smapi(s) => &s.intake,
        }
    }

    fn report(&self) -> &SecurityReport {
        &self.intake().report
    }

    fn cleanup(&self) {
        let _ = fsx::remove_dir(&self.intake().work_dir);
    }
}

/// Kurulum kaynağı.
pub enum Source {
    /// Kullanıcının bıraktığı ya da Mods içinde bulunan arşiv (`in_mods`: Mods'a göre yol).
    Local { path: PathBuf, in_mods: Option<String> },
    /// Nexus dosyası: `nxm` sitedeki "Mod Manager Download" düğmesinden gelir; yoksa (Premium)
    /// doğrudan indirilir. `name` görevin ilk başlığıdır (biliniyorsa mod adı).
    Nexus { game: NexusGame, mod_id: u64, file_id: u64, nxm: Option<NxmLink>, name: Option<String> },
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModsOptions {
    /// Kurulacak modların anahtarları; verilmezse hepsi.
    pub keys: Option<Vec<String>>,
    pub remove_source: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub installed: Vec<String>,
    pub journal: JournalEntry,
}

fn pick_existing<'a>(installed: &'a [ModInfo], id: &str) -> Option<&'a ModInfo> {
    let matches: Vec<&ModInfo> = installed.iter().filter(|m| m.unique_id.as_deref().is_some_and(|u| u.eq_ignore_ascii_case(id))).collect();
    matches.iter().find(|m| m.enabled).copied().or(matches.first().copied())
}

/// Açılmış arşivden kurulum planı çıkarır (saf: Mods klasörünü yalnızca okur).
pub fn build_plan(extract_dir: &Path, mods_dir: Option<&Path>, source_name: &str, source_in_mods: bool) -> AppResult<(InstallPlan, HashMap<String, PathBuf>)> {
    let roots = scan::find_mod_roots(extract_dir);
    if roots.is_empty() {
        bail!(
            "Bu arşivde manifest.json bulunamadı; bir SMAPI modu gibi görünmüyor. (XNB değiştiren eski modlar desteklenmez.)",
            "No manifest.json was found in this archive; it doesn't look like a SMAPI mod. (Old XNB replacement mods aren't supported.)"
        );
    }
    let installed = mods_dir.map(|d| scan::scan_mods(d).mods).unwrap_or_default();
    let source_stem = Path::new(source_name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Mod".into());

    let infos: Vec<(String, ModInfo, PathBuf)> =
        roots.iter().enumerate().map(|(i, root)| (i.to_string(), scan::scan_one(root.parent().unwrap_or(extract_dir), root), root.clone())).collect();
    let archive_ids: Vec<String> = infos.iter().filter_map(|(_, m, _)| m.unique_id.clone()).map(|s| s.to_lowercase()).collect();

    let mut warnings = Vec::new();
    let nested: Vec<String> = walkdir::WalkDir::new(extract_dir)
        .max_depth(4)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file())
        .filter(|e| e.path().extension().is_some_and(|x| ["zip", "7z", "rar"].contains(&x.to_string_lossy().to_ascii_lowercase().as_str())))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .take(5)
        .collect();
    if !nested.is_empty() {
        let list = nested.join(", ");
        warnings.push(tr!(format!("Arşivin içinde başka arşivler var ({list}). Bunlar ayrıca kurulmalı olabilir."), format!("The archive contains other archives ({list}). They may need to be installed separately.")));
    }

    let mut mods = Vec::new();
    let mut root_map = HashMap::new();
    let (mut total_size, mut file_count) = (0, 0);
    for (key, m, root) in infos {
        total_size += m.size;
        file_count += m.file_count;
        let folder_name = if root == extract_dir {
            fsx::sanitize_name(m.unique_id.as_ref().map(|_| m.name.as_str()).unwrap_or(&source_stem))
        } else {
            fsx::sanitize_name(&m.folder_name)
        };
        let existing = m.unique_id.as_deref().and_then(|id| pick_existing(&installed, id));
        let action = match existing {
            None => "install",
            Some(e) => match version::compare(m.version.as_deref().unwrap_or("0"), e.version.as_deref().unwrap_or("0")) {
                Some(std::cmp::Ordering::Greater) => "update",
                Some(std::cmp::Ordering::Less) => "downgrade",
                _ => "reinstall",
            },
        };
        let mut w = Vec::new();
        if !m.executables.is_empty() {
            let files = m.executables.join(", ");
            w.push(tr!(format!("Çalıştırılabilir dosya içeriyor: {files}"), format!("Contains executable files: {files}")));
        }
        w.extend(m.problems.iter().cloned());
        let mut reqs: Vec<String> = m.dependencies.iter().filter(|d| d.is_required).map(|d| d.unique_id.clone()).collect();
        if let Some(cp) = &m.content_pack_for {
            reqs.push(cp.unique_id.clone());
        }
        let missing_deps = reqs.into_iter().filter(|r| !archive_ids.contains(&r.to_lowercase()) && pick_existing(&installed, r).is_none()).collect();
        mods.push(StagedMod {
            key: key.clone(),
            folder_name,
            name: m.name.clone(),
            unique_id: m.unique_id.clone(),
            version: m.version.clone(),
            author: m.author.clone(),
            description: m.description.clone(),
            kind: m.kind.clone(),
            action: action.into(),
            existing_folder: existing.map(|e| e.folder.clone()),
            existing_version: existing.and_then(|e| e.version.clone()),
            existing_enabled: existing.map(|e| e.enabled),
            size: m.size,
            file_count: m.file_count,
            warnings: w,
            missing_deps,
            manifest_error: m.manifest_error.clone(),
            keeps_config: existing.is_some_and(|e| e.has_config),
        });
        root_map.insert(key, root);
    }
    Ok((InstallPlan { kind: "mods", source_name: source_name.to_string(), mods, warnings, total_size, file_count, source_in_mods }, root_map))
}

/// Görevi oluşturur ve hattı arka planda başlatır.
pub fn start(game: &Stardew, source: Source) -> JobHandle {
    let (title, kind) = match &source {
        Source::Local { path, .. } => (path.file_name().unwrap_or_default().to_string_lossy().into_owned(), "local"),
        Source::Nexus { mod_id, name, .. } => (name.clone().filter(|n| !n.trim().is_empty()).unwrap_or_else(|| format!("Nexus Mods · #{mod_id}")), "nexus"),
    };
    let job = game.services.jobs.create(ID, "install", &title, kind);
    let ctx = PrepareCtx { services: game.services.clone(), staging: game.staging_root(), mods_dir: game.mods_dir().ok() };
    let j = job.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = prepare(&ctx, &j, source).await {
            j.fail(&e);
        }
    });
    job
}

pub(crate) struct PrepareCtx {
    pub services: Arc<Services>,
    pub staging: PathBuf,
    pub mods_dir: Option<PathBuf>,
}

pub(crate) async fn prepare(ctx: &PrepareCtx, job: &JobHandle, source: Source) -> AppResult<()> {
    let (origin, source_rel) = match source {
        Source::Local { path, in_mods } => (Origin::Local { path }, in_mods),
        Source::Nexus { game, mod_id, file_id, nxm, .. } => (Origin::Nexus { game, mod_id, file_id, nxm }, None),
    };
    let request = IntakeRequest {
        origin,
        work_dir: intake::work_dir_for(&ctx.staging, job),
        content: INFO.content,
        trusted: INFO.trusted_sources,
        known: INFO.known_sources,
        nexus_lookup: INFO.nexus.first().copied(),
    };
    let intake = intake::run(&ctx.services, job, request).await?;
    job.stage(Stage::Analyzing, tr!("Modlar inceleniyor", "Inspecting mods"));
    let (x, mods_dir, name, in_mods) = (intake.extract_dir.clone(), ctx.mods_dir.clone(), intake.archive_path.file_name().unwrap_or_default().to_string_lossy().into_owned(), source_rel.is_some());
    let planned = tokio::task::spawn_blocking(move || build_plan(&x, mods_dir.as_deref(), &name, in_mods)).await.map_err(AppError::from).and_then(|r| r);
    let (plan, roots) = match planned {
        Ok(p) => p,
        Err(e) => {
            let _ = fsx::remove_dir(&intake.work_dir);
            return Err(e);
        }
    };
    let n = plan.mods.len();
    let updates = plan.mods.iter().filter(|m| m.action != "install").count();
    let message = match (n, updates) {
        (1, 0) => tr!(format!("{} kurulmaya hazır", plan.mods[0].name), format!("{} is ready to install", plan.mods[0].name)),
        (1, _) => tr!(format!("{} güncellemeye hazır", plan.mods[0].name), format!("{} is ready to update", plan.mods[0].name)),
        _ => tr!(format!("{n} mod incelemeye hazır"), format!("{n} mods ready for review")),
    };
    if n == 1 {
        let m = &plan.mods[0];
        job.set_title(match &m.version {
            Some(v) => format!("{} · {v}", m.name),
            None => m.name.clone(),
        });
    }
    let report = intake.report.clone();
    let plan_json = serde_json::to_value(&plan)?;
    job.set_staged(Staged::Mods(ModsStaged { intake, plan, roots, source_rel }));
    job.review(message, Some(report), plan_json);
    Ok(())
}

/// Görev listeden kaldırıldı: karantinayı temizle.
pub fn discard(job: &JobHandle) {
    if let Some(s) = job.take_staged::<Staged>() {
        s.cleanup();
    }
}

/// Kullanıcı onayı: güvenlik kararını uygular ve kurulumu yapar.
pub fn confirm(game: &Stardew, job: &JobHandle, accept_risk: bool, options: serde_json::Value) -> AppResult<serde_json::Value> {
    // Oyun açıksa görevi bozmadan reddet: kullanıcı oyunu kapatıp yeniden deneyebilir.
    game.ensure_game_closed()?;
    let staged = job.take_staged::<Staged>().ok_or_else(|| AppError::msg(tr!("Bu görev artık onay beklemiyor; dosyayı yeniden bırakın.", "This task is no longer awaiting approval; drop the file again.")))?;
    let report = staged.report();
    if let Some(reason) = report.blocked.clone() {
        staged.cleanup();
        let e = AppError::security(reason);
        job.fail(&e);
        return Err(e);
    }
    if report.needs_override.is_some() && !accept_risk {
        job.set_staged(staged);
        bail!("Bu paket için açık onayınız gerekiyor.", "This package needs your explicit approval.");
    }
    let opts: ModsOptions = serde_json::from_value(options).unwrap_or_default();
    if matches!(staged, Staged::Mods(_)) && opts.keys.as_ref().is_some_and(|k| k.is_empty()) {
        job.set_staged(staged);
        bail!("Kurulacak mod seçilmedi.", "No mods were selected to install.");
    }
    job.stage(Stage::Installing, tr!("Kuruluyor", "Installing"));
    let result = match &staged {
        Staged::Mods(m) => {
            commit(game, m, &opts).map(|r| {
                let msg = r.journal.title.clone();
                (msg, json!(r))
            })
        }
        Staged::Smapi(s) => smapi::commit(game, s).map(|r| (tr!(format!("SMAPI {} kuruldu", r.version.as_deref().unwrap_or("")), format!("SMAPI {} installed", r.version.as_deref().unwrap_or(""))), json!(r))),
    };
    staged.cleanup();
    match result {
        Ok((message, value)) => {
            job.done(message, Some(value.clone()));
            game.services.game_changed(ID);
            Ok(value)
        }
        Err(e) => {
            job.fail(&e);
            game.services.game_changed(ID);
            Err(e)
        }
    }
}

pub fn commit(game: &Stardew, staged: &ModsStaged, opts: &ModsOptions) -> AppResult<InstallResult> {
    let _lock = game.ops_lock.lock().unwrap();
    game.ensure_game_closed()?;
    let mods_dir = game.ensure_mods_dir()?;
    let installed = scan::scan_mods(&mods_dir).mods;
    let chosen: Vec<&StagedMod> = staged.plan.mods.iter().filter(|m| opts.keys.as_ref().is_none_or(|k| k.contains(&m.key))).collect();
    if chosen.is_empty() {
        bail!("Kurulacak mod seçilmedi.", "No mods were selected to install.");
    }
    let updates = chosen.iter().filter(|m| m.action != "install").count();
    let n = chosen.len();
    let first = chosen[0];
    let title = match (n, updates) {
        (1, 0) => tr!(format!("{} kuruldu", first.name), format!("{} installed", first.name)),
        (1, _) => {
            let v = first.version.as_deref().unwrap_or("?");
            tr!(format!("{} güncellendi ({v})", first.name), format!("{} updated ({v})", first.name))
        }
        (_, 0) => tr!(format!("{n} mod kuruldu"), format!("{n} mods installed")),
        (_, u) => tr!(format!("{n} mod kuruldu/güncellendi ({u} güncelleme)"), format!("{n} mods installed/updated ({u} updates)")),
    };
    let kind = if updates > 0 { "update" } else { "install" };
    let mut installed_names = Vec::new();
    let journal = ops::journaled(game, kind, title, |actions, details| {
        for sm in &chosen {
            let root = staged.roots.get(&sm.key).cloned().ok_or_else(|| AppError::msg(tr!("Karantina kaydı eksik.", "Quarantine record is missing.")))?;
            match sm.unique_id.as_deref().and_then(|uid| pick_existing(&installed, uid)) {
                Some(e) => {
                    let existing_abs = mods_dir.join(&e.folder);
                    let cfg = existing_abs.join("config.json");
                    if cfg.is_file() {
                        std::fs::copy(&cfg, root.join("config.json"))?;
                    }
                    let payload = ops::trash_put(game, &existing_abs, &e.folder, Some(e), tr!("Güncelleme öncesi yedek", "Backup before update"))?;
                    actions.push(Action::Trash { original: existing_abs.to_string_lossy().into_owned(), trashed: payload.to_string_lossy().into_owned() });
                    move_path(&root, &existing_abs)?;
                    actions.push(Action::Added { path: existing_abs.to_string_lossy().into_owned() });
                    details.push(format!("{}: {} → {}", sm.name, e.version.as_deref().unwrap_or("?"), sm.version.as_deref().unwrap_or("?")));
                }
                None => {
                    let target = fsx::unique_child(&mods_dir, &sm.folder_name);
                    move_path(&root, &target)?;
                    actions.push(Action::Added { path: target.to_string_lossy().into_owned() });
                    details.push(format!("{} {}", sm.name, sm.version.as_deref().unwrap_or("")).trim().to_string());
                }
            }
            installed_names.push(sm.name.clone());
        }
        if opts.remove_source {
            if let Some(rel) = &staged.source_rel {
                let src = fsx::resolve_under(&mods_dir, rel)?;
                if src.is_file() {
                    let payload = ops::trash_put(game, &src, rel, None, tr!("Kurulan arşiv", "Installed archive"))?;
                    actions.push(Action::Trash { original: src.to_string_lossy().into_owned(), trashed: payload.to_string_lossy().into_owned() });
                }
            }
        }
        Ok(())
    })?;
    Ok(InstallResult { installed: installed_names, journal })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::fixture;
    use std::fs;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    fn zip_mod(path: &Path, folder: &str, id: &str, version: &str) {
        let mut z = zip::ZipWriter::new(fs::File::create(path).unwrap());
        z.start_file(format!("{folder}/manifest.json"), SimpleFileOptions::default()).unwrap();
        write!(z, r#"{{"Name":"{folder}","Author":"a","Version":"{version}","UniqueID":"{id}","EntryDll":"x.dll","Dependencies":[{{"UniqueID":"needs.this"}}]}}"#).unwrap();
        z.start_file(format!("{folder}/config.json"), SimpleFileOptions::default()).unwrap();
        write!(z, r#"{{"default":true}}"#).unwrap();
        z.start_file(format!("{folder}/x.dll"), SimpleFileOptions::default()).unwrap();
        write!(z, "not really a dll").unwrap();
        z.finish().unwrap();
    }

    async fn stage(f: &crate::testkit::Fixture, archive: &Path, in_mods: Option<String>) -> JobHandle {
        let job = f.game.services.jobs.create(ID, "install", "t", "local");
        let ctx = PrepareCtx { services: f.game.services.clone(), staging: f.game.staging_root(), mods_dir: f.game.mods_dir().ok() };
        prepare(&ctx, &job, Source::Local { path: archive.to_path_buf(), in_mods }).await.unwrap();
        assert_eq!(job.snapshot().stage, Stage::Review);
        job
    }

    #[tokio::test]
    async fn install_then_update_preserves_config_and_is_undoable() {
        let f = fixture();
        let v1 = f.root.join("v1.zip");
        zip_mod(&v1, "Cool Mod", "a.cool", "1.0.0");
        let job = stage(&f, &v1, None).await;
        let plan = job.snapshot().plan.unwrap();
        assert_eq!(plan["kind"], "mods");
        assert_eq!(plan["mods"][0]["action"], "install");
        assert_eq!(plan["mods"][0]["missingDeps"][0], "needs.this");
        let report = job.snapshot().security.unwrap();
        assert!(report.code_files.iter().all(|c| c.expected), "SMAPI modlarında DLL olağandır");
        confirm(&f.game, &job, false, serde_json::Value::Null).unwrap();
        assert_eq!(job.snapshot().stage, Stage::Done);

        let mod_dir = f.mods().join("Cool Mod");
        fs::write(mod_dir.join("config.json"), r#"{"user":"choice"}"#).unwrap();

        let v2 = f.root.join("v2.zip");
        zip_mod(&v2, "Cool Mod", "a.cool", "1.1.0");
        let job = stage(&f, &v2, None).await;
        let plan = job.snapshot().plan.unwrap();
        assert_eq!(plan["mods"][0]["action"], "update");
        assert_eq!(plan["mods"][0]["keepsConfig"], true);
        assert!(confirm(&f.game, &job, false, json!({ "keys": [] })).is_err(), "boş seçim reddedilmeli");
        assert_eq!(job.snapshot().stage, Stage::Review, "boş seçim görevi bozmamalı");
        let res = confirm(&f.game, &job, false, json!({ "keys": ["0"] })).unwrap();

        assert!(fs::read_to_string(mod_dir.join("manifest.json")).unwrap().contains("1.1.0"));
        assert_eq!(fs::read_to_string(mod_dir.join("config.json")).unwrap(), r#"{"user":"choice"}"#);
        assert_eq!(ops::list_trash(&f.game).len(), 1);

        ops::undo(&f.game, res["journal"]["id"].as_str().unwrap()).unwrap();
        assert!(fs::read_to_string(mod_dir.join("manifest.json")).unwrap().contains("1.0.0"), "geri alma eski sürümü geri getirmeli");
        assert_eq!(f.game.staging_root().read_dir().map(|r| r.count()).unwrap_or(0), 0, "karantina temizlenmeli");
    }

    #[tokio::test]
    async fn stray_archive_in_mods_can_be_trashed_after_install() {
        let f = fixture();
        let inside = f.mods().join("Downloaded.zip");
        zip_mod(&inside, "Inner Mod", "a.inner", "1.0.0");
        let job = stage(&f, &inside, Some("Downloaded.zip".into())).await;
        assert_eq!(job.snapshot().plan.unwrap()["sourceInMods"], true);
        confirm(&f.game, &job, false, json!({ "removeSource": true })).unwrap();
        assert!(f.mods().join("Inner Mod/manifest.json").is_file());
        assert!(!inside.exists(), "kurulan arşiv çöp kutusuna gitmeli");
    }

    #[tokio::test]
    async fn rejects_archives_without_manifest_and_cleans_up() {
        let f = fixture();
        let p = f.root.join("bad.zip");
        let mut z = zip::ZipWriter::new(fs::File::create(&p).unwrap());
        z.start_file("readme.txt", SimpleFileOptions::default()).unwrap();
        z.finish().unwrap();
        let job = f.game.services.jobs.create(ID, "install", "t", "local");
        let ctx = PrepareCtx { services: f.game.services.clone(), staging: f.game.staging_root(), mods_dir: f.game.mods_dir().ok() };
        assert!(prepare(&ctx, &job, Source::Local { path: p, in_mods: None }).await.is_err());
        assert_eq!(f.game.staging_root().read_dir().map(|r| r.count()).unwrap_or(0), 0);
    }

    #[tokio::test]
    async fn discard_removes_quarantine() {
        let f = fixture();
        let v1 = f.root.join("v1.zip");
        zip_mod(&v1, "Cool Mod", "a.cool", "1.0.0");
        let job = stage(&f, &v1, None).await;
        discard(&job);
        assert_eq!(f.game.staging_root().read_dir().map(|r| r.count()).unwrap_or(0), 0);
        assert!(confirm(&f.game, &job, true, serde_json::Value::Null).is_err());
    }
}
