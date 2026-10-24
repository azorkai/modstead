//! Bu bilgisayardaki gerçek sistemle denemeler. Varsayılan test koşusunda çalışmaz:
//! `cargo test -p game-stardew smoke -- --ignored --nocapture`
//! Kullanıcının oyun klasörüne ve kayıtlarına YAZMAZ: yalnızca okur; SMAPI denemesi sahte bir oyun
//! klasörüne kurar.

use std::sync::Arc;

use modstead_core::prelude::*;
use modstead_core::{Services, fsx};

use crate::testkit::fixture;
use crate::{Stardew, analyze, detect, install, logs, saves, scan, smapi, updates};

/// Ağa çıkan denemeler için gerçek HTTP izin listesiyle servisler.
fn net_services() -> Arc<Services> {
    use modstead_core::http::{Http, HttpPolicy};
    let root = std::env::temp_dir().join(format!("modstead-smoke-{}", fsx::short_id()));
    let paths = modstead_core::paths::Paths { data: root.join("data"), local: root.join("local"), documents: root.join("docs") };
    let http = Http::new(HttpPolicy::core().with(&crate::INFO.hosts), "Modstead-smoke");
    let services = Arc::new(Services::new("0.0.0", paths, Arc::new(modstead_core::events::NoopSink), http));
    services.update_settings(|s| s.require_scan = false).unwrap();
    services
}

#[test]
#[ignore]
fn smoke_real_detect_scan_saves_and_log() {
    let candidates = detect::candidates();
    println!("kurulumlar: {candidates:?}");
    let Some((dir, store)) = candidates.into_iter().next() else {
        println!("Stardew Valley bulunamadı; deneme atlandı.");
        return;
    };
    println!("oyun: {} ({store}) sürüm {:?}, SMAPI {:?}", dir.display(), detect::game_version(&dir), detect::smapi_info(&dir));
    let scan = scan::scan_mods(&detect::mods_dir(&dir));
    println!("modlar: {} ({} kapalı), başıboş: {}", scan.mods.len(), scan.mods.iter().filter(|m| !m.enabled).count(), scan.strays.len());
    let smapi = detect::smapi_info(&dir);
    let version = detect::game_version(&dir);
    let health = analyze::analyze(&analyze::Input {
        scan: &scan,
        game_found: true,
        game_version: version.as_deref(),
        smapi_installed: smapi.installed,
        smapi_version: smapi.version.as_deref(),
        updates: None,
        low_disk: vec![],
    });
    println!("sağlık: {} puan, {} hata, {} uyarı", health.score, health.errors, health.warnings);
    for i in health.issues.iter().take(6) {
        println!("  [{}] {}", i.severity, i.title);
    }
    let f = fixture();
    match saves::list(&f.game) {
        Ok(list) => println!("kayıtlar: {:?}", list.iter().map(|s| (&s.folder, &s.farmer)).collect::<Vec<_>>()),
        Err(e) => println!("kayıtlar okunamadı: {e}"),
    }
    let log = logs::read_latest();
    println!("SMAPI günlüğü: var={} sürüm={:?} hata={}", log.exists, log.smapi_version, log.errors.len());
}

#[test]
#[ignore]
fn smoke_live_smapi_io() {
    let services = net_services();
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let found = updates::lookup(&services.http, vec!["spacechase0.SpaceCore".into()], Some("4.5.2".into())).await.unwrap();
        println!("{found:?}");
        assert!(found[0].found, "smapi.io SpaceCore'u tanımalı");
        assert_eq!(found[0].nexus_id, Some(1348), "SpaceCore'un Nexus numarası gelmeli");
    });
}

/// Keşfet sayfasının kullandığı açık Nexus sorguları (anahtar gerekmez).
#[test]
#[ignore]
fn smoke_live_nexus_discover() {
    use modstead_core::nexus::{self, SearchOptions};
    let services = net_services();
    let game = crate::INFO.nexus[0];
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let cats = nexus::category_counts(&services.http, game, false).await.unwrap();
        println!("kategoriler: {:?}", cats.iter().take(6).collect::<Vec<_>>());
        assert!(cats.iter().any(|c| c.name == "Portraits" && c.count > 100));
        let opts = SearchOptions { query: "", sort: "downloads", category: Some("Modding Tools"), offset: 0, count: 5, include_adult: false };
        let page = nexus::search_with(&services.http, game, &opts).await.unwrap();
        println!("Modding Tools: {} · {:?}", page.total, page.mods.iter().map(|m| &m.name).collect::<Vec<_>>());
        assert!(page.mods.iter().all(|m| m.category == "Modding Tools"));
        let found = nexus::search(&services.http, game, "content patcher", "downloads", 0, 5, false).await.unwrap();
        assert!(found.mods.iter().any(|m| m.mod_id == 1915), "Content Patcher aramada çıkmalı");
        let files = nexus::files(&services.http, game, 1915).await.unwrap();
        let main = crate::discover::pick_main_file(&files);
        println!("Content Patcher ana dosyası: {:?}", main.map(|f| (&f.name, &f.version)));
        assert!(main.is_some(), "Content Patcher'ın tek tıkla kurulacak ana dosyası olmalı");
    });
}

#[test]
#[ignore]
fn smoke_real_smapi_into_fake_game() {
    let f = fixture();
    // İnternet için gerçek izin listesi; oyun klasörü sahte (testkit), gerçek oyuna dokunulmaz.
    let services = net_services();
    let game = Stardew {
        services: services.clone(),
        settings: std::sync::RwLock::new(f.game.settings()),
        ops_lock: std::sync::Mutex::new(()),
        session: Arc::new(std::sync::Mutex::new(None)),
        last_issues: std::sync::Mutex::new(None),
    };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let job = rt.block_on(async {
        let job = smapi::start(&game).unwrap();
        for _ in 0..600 {
            let s = job.snapshot();
            if s.stage.is_final() || s.stage == Stage::Review {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
        job
    });
    let snap = job.snapshot();
    println!("aşama {:?}: {} · {:?}", snap.stage, snap.message, snap.error);
    assert_eq!(snap.stage, Stage::Review);
    let report = snap.security.unwrap();
    println!("karar {:?} puan {} doğrulama {:?}", report.verdict, report.score, report.verification.status);
    for x in &report.findings {
        println!("  {:?} {} {:?}", x.severity, x.title, x.path);
    }
    let out = install::confirm(&game, &job, true, serde_json::Value::Null).unwrap();
    println!("{out}");
    let dir = game.require_game_dir().unwrap();
    assert!(detect::smapi_info(&dir).installed);
    drop(f);
    let _ = fsx::remove_dir(services.paths.data.parent().unwrap());
}
