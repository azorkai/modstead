//! Arka uçtan arayüze olaylar. Çekirdek Tauri'ye bağlı değildir; uygulama kabuğu bu arayüzü
//! `AppHandle::emit` ile uygular. Testler `NoopSink` kullanır.

use serde_json::Value;

/// Ortak olay adları. Oyunlara özel olaylar `<oyun>://<ad>` biçiminde adlandırılır
/// (ör. `stardew://smapi-progress`).
pub mod names {
    /// Görev değişti (yük: `JobSnapshot`).
    pub const JOB: &str = "modstead://job";
    /// Bir oyunun durumu değişti; ana sayfa ve kenar çubuğu yenilenir (yük: `{ game }`).
    pub const GAME_CHANGED: &str = "modstead://game-changed";
    /// Dışarıdan bir nxm bağlantısı geldi (yük: `{ url, game }`).
    pub const NXM: &str = "modstead://nxm";
    /// Uygulamaya dosya bırakıldı ya da ikinci örnekten dosya geldi (yük: `{ paths }`).
    pub const FILES: &str = "modstead://files";
    /// Kullanıcıya kısa bildirim (yük: `{ tone, title, detail? }`).
    pub const NOTIFY: &str = "modstead://notify";
}

pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
}

/// Hiçbir yere göndermeyen olay hattı (testler ve arayüzsüz çalışma için).
pub struct NoopSink;

impl EventSink for NoopSink {
    fn emit(&self, _event: &str, _payload: Value) {}
}
