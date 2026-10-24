//! İndirme/kurulum görevleri. Her değişiklik arayüze `modstead://job` olayıyla gönderilir.
//!
//! Görev oyundan bağımsızdır: hangi oyuna ait olduğunu (`game`) taşır, ortak güvenlik raporunu
//! (`security`) ve oyuna özel inceleme planını (`plan`, serbest JSON) arayüze iletir. Oyunun
//! onaydan sonra kullanacağı karantina verisi `set_staged` / `take_staged` ile görevde saklanır.

use std::any::Any;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::events::{EventSink, names};
use crate::fsx;
use crate::security::SecurityReport;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Stage {
    Queued,
    Resolving,
    Downloading,
    Verifying,
    Extracting,
    Scanning,
    Analyzing,
    Review,
    Installing,
    Done,
    Failed,
    Cancelled,
}

impl Stage {
    pub fn is_final(self) -> bool {
        matches!(self, Stage::Done | Stage::Failed | Stage::Cancelled)
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub id: String,
    /// Oyun kimliği ("msfs", "bannerlord", "stardew"); oyundan bağımsız işlerde boş.
    pub game: String,
    /// "install", "update", "smapi"… (oyun tanımlar).
    pub kind: String,
    pub title: String,
    /// "nexus" | "github" | "url" | "local" | oyuna özel.
    pub source: String,
    pub stage: Stage,
    pub progress: Option<f64>,
    pub bytes: u64,
    pub total: Option<u64>,
    pub message: String,
    pub error: Option<String>,
    pub security: Option<SecurityReport>,
    /// Oyuna özel inceleme planı (inceleme penceresini oyun çizer).
    pub plan: Option<Value>,
    /// İş bitince oyuna özel sonuç (ör. kurulan mod kimlikleri).
    pub result: Option<Value>,
    pub created: i64,
    pub updated: i64,
}

struct JobInner {
    sink: Option<Arc<dyn EventSink>>,
    snap: Mutex<JobSnapshot>,
    cancel: AtomicBool,
    last_emit: Mutex<Instant>,
    staged: Mutex<Option<Box<dyn Any + Send>>>,
}

#[derive(Clone)]
pub struct JobHandle(Arc<JobInner>);

fn new_snapshot(game: &str, kind: &str, title: &str, source: &str, message: String) -> JobSnapshot {
    let now = fsx::now_ts();
    JobSnapshot {
        id: uuid::Uuid::new_v4().to_string(),
        game: game.to_string(),
        kind: kind.to_string(),
        title: title.to_string(),
        source: source.to_string(),
        stage: Stage::Queued,
        progress: None,
        bytes: 0,
        total: None,
        message,
        error: None,
        security: None,
        plan: None,
        result: None,
        created: now,
        updated: now,
    }
}

impl JobHandle {
    /// Arayüze olay göndermeyen görev (testler ve arka plan denetimleri için).
    pub fn detached(title: &str) -> JobHandle {
        JobHandle(Arc::new(JobInner {
            sink: None,
            snap: Mutex::new(new_snapshot("", "test", title, "test", String::new())),
            cancel: AtomicBool::new(false),
            last_emit: Mutex::new(Instant::now()),
            staged: Mutex::new(None),
        }))
    }

    pub fn id(&self) -> String {
        self.0.snap.lock().unwrap().id.clone()
    }

    pub fn game(&self) -> String {
        self.0.snap.lock().unwrap().game.clone()
    }

    pub fn snapshot(&self) -> JobSnapshot {
        self.0.snap.lock().unwrap().clone()
    }

    fn emit(&self) {
        let snap = self.snapshot();
        *self.0.last_emit.lock().unwrap() = Instant::now();
        if let Some(sink) = &self.0.sink {
            if let Ok(v) = serde_json::to_value(&snap) {
                sink.emit(names::JOB, v);
            }
        }
    }

    pub fn update(&self, f: impl FnOnce(&mut JobSnapshot)) {
        {
            let mut s = self.0.snap.lock().unwrap();
            f(&mut s);
            s.updated = fsx::now_ts();
        }
        self.emit();
    }

    pub fn stage(&self, stage: Stage, message: impl Into<String>) {
        let message = message.into();
        self.update(|s| {
            s.stage = stage;
            s.message = message;
            s.progress = None;
        });
    }

    pub fn set_title(&self, title: impl Into<String>) {
        let title = title.into();
        self.update(|s| s.title = title);
    }

    /// İlerleme olayları en fazla saniyede ~8 kez gönderilir.
    pub fn progress(&self, bytes: u64, total: Option<u64>) {
        {
            let mut s = self.0.snap.lock().unwrap();
            s.bytes = bytes;
            s.total = total;
            s.progress = total.filter(|t| *t > 0).map(|t| (bytes as f64 / t as f64).min(1.0));
        }
        let due = self.0.last_emit.lock().unwrap().elapsed() > Duration::from_millis(120);
        if due || total.is_some_and(|t| bytes >= t) {
            self.update(|_| {});
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.cancel.load(Ordering::Relaxed)
    }

    pub fn check(&self) -> AppResult<()> {
        if self.is_cancelled() { Err(AppError::Cancelled) } else { Ok(()) }
    }

    pub fn cancel(&self) {
        self.0.cancel.store(true, Ordering::Relaxed);
    }

    pub fn fail(&self, e: &AppError) {
        let cancelled = matches!(e, AppError::Cancelled);
        let msg = e.to_string();
        self.update(|s| {
            s.stage = if cancelled { Stage::Cancelled } else { Stage::Failed };
            s.error = if cancelled { None } else { Some(msg.clone()) };
            s.message = if cancelled { tr!("İptal edildi", "Cancelled").into() } else { msg };
            s.progress = None;
        });
    }

    /// Görevi incelemeye alır: arayüz güvenlik raporunu ve oyunun planını gösterir, onay bekler.
    pub fn review(&self, message: impl Into<String>, security: Option<SecurityReport>, plan: Value) {
        let message = message.into();
        self.update(|s| {
            s.stage = Stage::Review;
            s.progress = None;
            s.message = message;
            s.security = security;
            s.plan = Some(plan);
        });
    }

    pub fn done(&self, message: impl Into<String>, result: Option<Value>) {
        let message = message.into();
        self.update(|s| {
            s.stage = Stage::Done;
            s.progress = Some(1.0);
            s.message = message;
            s.result = result;
            s.error = None;
        });
    }

    /// Onaydan sonra kullanılacak oyuna özel karantina verisini saklar.
    pub fn set_staged<T: Any + Send>(&self, staged: T) {
        *self.0.staged.lock().unwrap() = Some(Box::new(staged));
    }

    /// Saklanan veriyi alır (tür uyuşmazsa geri koyar ve `None` döner).
    pub fn take_staged<T: Any + Send>(&self) -> Option<T> {
        let mut slot = self.0.staged.lock().unwrap();
        let boxed = slot.take()?;
        match boxed.downcast::<T>() {
            Ok(v) => Some(*v),
            Err(other) => {
                *slot = Some(other);
                None
            }
        }
    }

    /// Saklanan veriyi almadan okur.
    pub fn with_staged<T: Any + Send, R>(&self, f: impl FnOnce(&T) -> R) -> Option<R> {
        let slot = self.0.staged.lock().unwrap();
        slot.as_ref().and_then(|b| b.downcast_ref::<T>()).map(f)
    }
}

pub struct JobManager {
    sink: Arc<dyn EventSink>,
    jobs: Mutex<Vec<JobHandle>>,
}

impl JobManager {
    pub fn new(sink: Arc<dyn EventSink>) -> Self {
        JobManager { sink, jobs: Mutex::new(Vec::new()) }
    }

    pub fn create(&self, game: &str, kind: &str, title: &str, source: &str) -> JobHandle {
        let job = JobHandle(Arc::new(JobInner {
            sink: Some(self.sink.clone()),
            snap: Mutex::new(new_snapshot(game, kind, title, source, tr!("Sırada", "Queued").into())),
            cancel: AtomicBool::new(false),
            last_emit: Mutex::new(Instant::now() - Duration::from_secs(1)),
            staged: Mutex::new(None),
        }));
        let mut jobs = self.jobs.lock().unwrap();
        jobs.push(job.clone());
        // Bitmiş eski görevleri buda.
        while jobs.len() > 60 {
            if let Some(pos) = jobs.iter().position(|j| j.snapshot().stage.is_final()) {
                jobs.remove(pos);
            } else {
                break;
            }
        }
        drop(jobs);
        job.emit();
        job
    }

    pub fn get(&self, id: &str) -> Option<JobHandle> {
        self.jobs.lock().unwrap().iter().find(|j| j.id() == id).cloned()
    }

    pub fn list(&self) -> Vec<JobSnapshot> {
        self.jobs.lock().unwrap().iter().map(|j| j.snapshot()).collect()
    }

    pub fn active_count(&self, game: Option<&str>) -> usize {
        self.jobs
            .lock()
            .unwrap()
            .iter()
            .map(|j| j.snapshot())
            .filter(|s| !s.stage.is_final() && game.is_none_or(|g| s.game == g))
            .count()
    }

    /// Görevi listeden kaldırır; bitmemişse önce iptal eder. Karantina temizliği oyunun işidir.
    pub fn dismiss(&self, id: &str) -> Option<JobHandle> {
        let mut jobs = self.jobs.lock().unwrap();
        let pos = jobs.iter().position(|j| j.id() == id)?;
        let job = jobs.remove(pos);
        job.cancel();
        Some(job)
    }

    pub fn clear_finished(&self) -> Vec<JobHandle> {
        let mut jobs = self.jobs.lock().unwrap();
        let (done, keep): (Vec<_>, Vec<_>) = jobs.drain(..).partition(|j| j.snapshot().stage.is_final());
        *jobs = keep;
        done
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::NoopSink;

    #[test]
    fn staged_data_round_trips_by_type() {
        let job = JobHandle::detached("t");
        job.set_staged(42u32);
        assert_eq!(job.with_staged::<u32, _>(|v| *v), Some(42));
        assert!(job.take_staged::<String>().is_none());
        assert_eq!(job.take_staged::<u32>(), Some(42));
        assert!(job.take_staged::<u32>().is_none());
    }

    #[test]
    fn manager_tracks_active_jobs_per_game() {
        let m = JobManager::new(Arc::new(NoopSink));
        let a = m.create("stardew", "install", "A", "local");
        let _b = m.create("msfs", "install", "B", "url");
        assert_eq!(m.active_count(None), 2);
        assert_eq!(m.active_count(Some("stardew")), 1);
        a.done("ok", None);
        assert_eq!(m.active_count(Some("stardew")), 0);
        assert_eq!(m.clear_finished().len(), 1);
        assert_eq!(m.list().len(), 1);
    }

    #[test]
    fn cancel_is_observed() {
        let job = JobHandle::detached("t");
        assert!(job.check().is_ok());
        job.cancel();
        assert!(matches!(job.check(), Err(AppError::Cancelled)));
        job.fail(&AppError::Cancelled);
        assert_eq!(job.snapshot().stage, Stage::Cancelled);
    }
}
