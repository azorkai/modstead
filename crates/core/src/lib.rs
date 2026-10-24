//! Modstead ortak çekirdeği.
//!
//! Oyundan bağımsız her şey burada: güvenli indirme ve arşiv açma, güvenlik raporu, görev kuyruğu,
//! Nexus/GitHub istemcileri, mağaza tespiti, genel ayarlar ve oyun sözleşmesi (`game::Game`).
//! Çekirdek bilerek Tauri'ye bağlı değildir; arayüz olayları `events::EventSink` üzerinden gider.
//!
//! Kullanıcıya dönük her metin `tr!("Türkçe", "English")` ile yazılır.

#[macro_use]
pub mod i18n;

pub mod archive;
pub mod credentials;
pub mod download;
pub mod error;
pub mod events;
pub mod fsx;
pub mod game;
pub mod github;
pub mod http;
pub mod intake;
pub mod jobs;
pub mod nexus;
pub mod nxm;
pub mod paths;
pub mod platform;
pub mod security;
pub mod services;
pub mod settings;
pub mod stores;
pub mod version;

pub use error::{AppError, AppResult, ResultExt};
pub use game::{Game, GameInfo, GameRegistry, GameStatus, InstallCandidate, InstallSummary, StatusNote, Tone};
pub use jobs::{JobHandle, JobManager, JobSnapshot, Stage};
pub use services::Services;

/// Oyun paketlerinin sık kullandığı her şey tek satırda: `use modstead_core::prelude::*;`
pub mod prelude {
    pub use crate::error::{AppError, AppResult, ResultExt};
    pub use crate::game::{Game, GameInfo, GameStatus, InstallCandidate, InstallSummary, StatusNote, Tone};
    pub use crate::jobs::{JobHandle, JobSnapshot, Stage};
    pub use crate::services::Services;
    pub use crate::tr;
    pub use futures_util::future::BoxFuture;
}
