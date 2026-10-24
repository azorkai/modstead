//! Uçtan uca akış testleri: sahte sim klasörleriyle (gerçek MSFS kurulumuna dokunmadan).

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use modstead_core::fsx::norm_key;
use modstead_core::security::Verdict;

use crate::linker;
use crate::package::find_package_roots;
use crate::scanner::{ScanCache, scan};
use crate::sims::{SIM_2020, SIM_2024, SimInstall};
use crate::store::Db;
use crate::util::{is_link, link_target};

fn fake_sim(id: &str, packages: &Path) -> SimInstall {
    let c = packages.join("Community");
    fs::create_dir_all(&c).unwrap();
    let c24 = (id == SIM_2024).then(|| {
        let p = packages.join("Community2024");
        fs::create_dir_all(&p).unwrap();
        p
    });
    SimInstall {
        id: id.into(),
        name: id.into(),
        short: id.trim_start_matches("msfs").into(),
        edition: "manual".into(),
        detected: true,
        config_dir: None,
        user_cfg: None,
        packages_path: Some(packages.to_path_buf()),
        community_path: Some(c),
        community2024_path: c24,
        exe_xml: None,
        content_xml: None,
        running: false,
        shares_packages: false,
        overridden: true,
        last_used: None,
    }
}

fn make_pkg(dir: &Path, title: &str, builder: Option<&str>, files: &[(&str, &[u8])]) {
    fs::create_dir_all(dir).unwrap();
    let builder = builder.map(|b| format!(r#","builder":"{b}""#)).unwrap_or_default();
    fs::write(
        dir.join("manifest.json"),
        format!(r#"{{"title":"{title}","creator":"Test","package_version":"1.0.0","content_type":"SCENERY"{builder}}}"#),
    )
    .unwrap();
    let mut content = Vec::new();
    for (rel, data) in files {
        let p = dir.join(rel.replace('/', "\\"));
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, data).unwrap();
        content.push(format!(r#"{{"path":"{rel}","size":{},"date":0}}"#, data.len()));
    }
    fs::write(dir.join("layout.json"), format!(r#"{{"content":[{}]}}"#, content.join(","))).unwrap();
}

fn root() -> PathBuf {
    let r = std::env::temp_dir().join(format!("msfs-flow-{}", modstead_core::fsx::short_id()));
    fs::create_dir_all(&r).unwrap();
    r
}

fn state_of(r: &crate::scanner::ScanResult, id: &str, sim: &str) -> String {
    r.mods.iter().find(|m| m.id == id).and_then(|m| m.sims.get(sim)).map(|s| s.state.clone()).unwrap_or_else(|| "?".into())
}

#[test]
fn library_link_lifecycle() {
    let root = root();
    let lib = root.join("lib");
    let sims = vec![fake_sim(SIM_2020, &root.join("p20")), fake_sim(SIM_2024, &root.join("p24"))];
    let c20 = sims[0].community_path.clone().unwrap();
    let c24 = sims[1].community_path.clone().unwrap();

    // Kütüphanede bir paket; 2020'de etkinleştir.
    make_pkg(&lib.join("pkg-a"), "Paket A (LTFM)", None, &[("scenery/a.bgl", b"x"), ("scenery/shared.bgl", b"y")]);
    linker::enable(&sims, &lib, &lib.join("pkg-a"), "2020", SIM_2020).unwrap();
    assert!(is_link(&c20.join("pkg-a")));
    assert_eq!(norm_key(&link_target(&c20.join("pkg-a")).unwrap()), norm_key(&lib.join("pkg-a")));

    let mut cache = ScanCache::default();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    assert_eq!(state_of(&r, "pkg-a", SIM_2020), "enabled");
    assert_eq!(state_of(&r, "pkg-a", SIM_2024), "disabled");
    let a = r.mods.iter().find(|m| m.id == "pkg-a").unwrap();
    assert_eq!(a.info.category, "airport");
    assert_eq!(a.info.icaos, vec!["LTFM"]);

    // Kapat: bağlantı gider, kütüphanedeki dosyalar kalır.
    linker::disable(&sims, &lib, &lib.join("pkg-a"), SIM_2020).unwrap();
    assert!(!c20.join("pkg-a").exists());
    assert!(lib.join("pkg-a").join("manifest.json").is_file());

    // Community'de fiziksel paket → içe aktar: kütüphaneye taşınır, yerine bağlantı konur.
    make_pkg(&c24.join("pkg-b"), "Paket B", Some("Microsoft Flight Simulator 2024"), &[("scenery/shared.bgl", b"z")]);
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    assert_eq!(r.mods.iter().find(|m| m.id == "pkg-b").unwrap().source, "community");
    assert_eq!(state_of(&r, "pkg-b", SIM_2024), "physical");
    let dest = linker::import(&sims, &lib, &c24.join("pkg-b")).unwrap();
    assert!(dest.join("manifest.json").is_file());
    assert!(is_link(&c24.join("pkg-b")));
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let b = r.mods.iter().find(|m| m.id == "pkg-b").unwrap();
    assert_eq!(b.source, "library");
    assert_eq!(b.info.built_for, "2024");
    assert_eq!(state_of(&r, "pkg-b", SIM_2024), "enabled");

    // Çakışma: A ve B aynı dosyayı sağlıyor; ikisi de 2024'te etkinse yakalanmalı.
    linker::enable(&sims, &lib, &lib.join("pkg-a"), "2020", SIM_2024).unwrap();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let conflicts = crate::conflicts::compute(&r);
    let c = conflicts.iter().find(|c| c.kind == "files").expect("dosya çakışması bulunmalı");
    assert_eq!(c.shared, 1);
    assert_eq!(c.samples, vec!["scenery/shared.bgl".to_string()]);

    // 2024 yapımı paket 2020'de etkinse uyarı.
    linker::enable(&sims, &lib, &lib.join("pkg-b"), "2024", SIM_2020).unwrap();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    assert!(r.mods.iter().find(|m| m.id == "pkg-b").unwrap().issues.iter().any(|i| i.code == "built-for-2024-in-2020"));
    linker::disable(&sims, &lib, &lib.join("pkg-b"), SIM_2020).unwrap();

    // Aynı adlı 2024 derlemesi: kütüphanede yan yana durur, etkinleştirince bağlantı yer değiştirir.
    make_pkg(&lib.join("msfs2024").join("pkg-a"), "Paket A 2024", Some("Microsoft Flight Simulator 2024"), &[("scenery/a.bgl", b"x2")]);
    linker::enable(&sims, &lib, &lib.join("msfs2024").join("pkg-a"), "2024", SIM_2024).unwrap();
    assert_eq!(norm_key(&link_target(&c24.join("pkg-a")).unwrap()), norm_key(&lib.join("msfs2024").join("pkg-a")));
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    assert_eq!(state_of(&r, "msfs2024/pkg-a", SIM_2024), "enabled");
    assert_eq!(state_of(&r, "pkg-a", SIM_2024), "disabled");

    // Başka bir aracın bağlantısı: harici olarak görünür, Hangar kaldırmaz.
    make_pkg(&root.join("elsewhere").join("foreign-x"), "Harici", None, &[("a.txt", b"1")]);
    junction::create(root.join("elsewhere").join("foreign-x"), c20.join("foreign-x")).unwrap();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let f = r.mods.iter().find(|m| m.id == "foreign-x").unwrap();
    assert_eq!(f.source, "external");
    assert_eq!(state_of(&r, "foreign-x", SIM_2020), "foreign");
    assert!(linker::disable(&sims, &lib, &root.join("elsewhere").join("foreign-x"), SIM_2020).is_err());
    assert!(is_link(&c20.join("foreign-x")));

    // İç içe kurulmuş paket: tespit et ve düzelt.
    make_pkg(&c20.join("indirilen-klasor").join("pkg-nested"), "İç içe", None, &[("a.txt", b"1")]);
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    assert!(r.issues.iter().any(|i| i.code == "nested-package"));
    linker::fix_nested(&sims, &c20.join("indirilen-klasor")).unwrap();
    assert!(c20.join("pkg-nested").join("manifest.json").is_file());

    // Kırık bağlantı: hedefi silinmiş junction.
    fs::create_dir_all(root.join("gone")).unwrap();
    junction::create(root.join("gone"), c20.join("broken")).unwrap();
    fs::remove_dir(root.join("gone")).unwrap();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    assert!(r.issues.iter().any(|i| i.code == "broken-link"));
    linker::remove_broken_link(&sims, &c20.join("broken")).unwrap();
    assert!(!c20.join("broken").exists() && !is_link(&c20.join("broken")));

    // Kaldır: tüm bağlantılar ve kütüphane klasörü gider; harici paket yerinde kalır.
    linker::uninstall(&sims, &lib, &lib.join("pkg-b")).unwrap();
    assert!(!lib.join("pkg-b").exists());
    assert!(!is_link(&c24.join("pkg-b")));
    assert!(root.join("elsewhere").join("foreign-x").join("manifest.json").is_file());

    // Kütüphane dışındaki bir yol asla silinmez.
    assert!(linker::uninstall(&sims, &lib, &root.join("elsewhere").join("foreign-x")).is_err());

    // Temizlik: önce bağlantılar (hedefe dokunmadan), sonra klasörler.
    for c in [&c20, &c24] {
        for e in fs::read_dir(c).unwrap().flatten() {
            if is_link(&e.path()) {
                fs::remove_dir(e.path()).unwrap();
            }
        }
    }
    fs::remove_dir_all(&root).unwrap();
}

/// Kötü niyetli arşiv ortak hattan geçer: kılık değiştirmiş PE, çift uzantı ve exe yakalanır, karar "tehlikeli".
#[tokio::test]
async fn malicious_archive_is_caught() {
    let root = root();
    let zip_path = root.join("evil.zip");
    let mut pe = vec![0u8; 256];
    pe[0] = b'M';
    pe[1] = b'Z';
    pe[60] = 128;
    pe[128..132].copy_from_slice(b"PE  ");
    write_zip(
        &zip_path,
        &[
            ("pkg/manifest.json", r#"{"title":"Kötü paket","package_version":"1.0"}"#.as_bytes()),
            ("pkg/layout.json", br#"{"content":[{"path":"texture/a.dds","size":256,"date":0}]}"#),
            ("pkg/texture/a.dds", &pe),
            ("pkg/tools/setup.exe", &pe),
            ("pkg/Readme.pdf.exe", b"x"),
        ],
    );
    let (extract_dir, report) = run_intake(&zip_path, &root.join("work")).await.unwrap();
    let codes: Vec<&str> = report.findings.iter().map(|f| f.code.as_str()).collect();
    assert!(codes.contains(&"disguised-pe"), "{codes:?}");
    assert!(codes.contains(&"double-extension"), "{codes:?}");
    assert!(codes.contains(&"executable"), "{codes:?}");
    assert_eq!(report.code_files.len(), 3);
    assert_eq!(report.verdict, Verdict::Danger);
    assert!(report.blocked.is_some(), "tehlikeli paket varsayılan ayarla engellenmeli");
    assert_eq!(find_package_roots(&extract_dir, 5).len(), 1);

    // Yol aşımı (zip-slip) içeren arşiv hiç açılmaz.
    let slip = root.join("slip.zip");
    write_zip(&slip, &[("pkg/manifest.json", b"{}"), ("../../kacak.txt", b"zip-slip")]);
    assert!(run_intake(&slip, &root.join("work2")).await.is_err());
    assert!(!root.join("kacak.txt").exists());
    fs::remove_dir_all(&root).unwrap();
}

/// Temiz, iki seviye içeride paketli arşiv: paket bulunur, karar "güvenli" ve MSFS bulgusu yok.
#[tokio::test]
async fn clean_archive_is_safe() {
    let root = root();
    let zip_path = root.join("ok.zip");
    write_zip(
        &zip_path,
        &[
            ("ust-klasor/liv-pkg/manifest.json", br#"{"title":"Boya","content_type":"LIVERY"}"#),
            ("ust-klasor/liv-pkg/layout.json", br#"{"content":[{"path":"SimObjects/Airplanes/x/texture.y/a.dds","size":3,"date":0}]}"#),
            ("ust-klasor/liv-pkg/SimObjects/Airplanes/x/texture.y/a.dds", b"DDS"),
        ],
    );
    let (extract_dir, report) = run_intake(&zip_path, &root.join("work")).await.unwrap();
    let roots = find_package_roots(&extract_dir, 5);
    assert_eq!(roots.len(), 1);
    assert_eq!(crate::package::read_package(&roots[0]).category, "livery");
    assert!(crate::install::package_findings(&extract_dir, &roots).is_empty());
    assert_eq!(report.verdict, Verdict::Safe, "{:?}", report.findings);
    fs::remove_dir_all(&root).unwrap();
}

fn write_zip(path: &Path, files: &[(&str, &[u8])]) {
    let mut zw = zip::ZipWriter::new(fs::File::create(path).unwrap());
    let opt = zip::write::SimpleFileOptions::default();
    for (name, data) in files {
        zw.start_file(*name, opt).unwrap();
        zw.write_all(data).unwrap();
    }
    zw.finish().unwrap();
}

/// Ortak kabul hattı (Defender ve VirusTotal kapalı; testler ağsız ve hızlı).
async fn run_intake(archive: &Path, work: &Path) -> modstead_core::AppResult<(PathBuf, modstead_core::security::SecurityReport)> {
    let services = modstead_core::Services::for_tests();
    services
        .update_settings(|s| {
            s.require_scan = false;
            s.virustotal = false;
        })
        .unwrap();
    let job = modstead_core::JobHandle::detached("t");
    let req = modstead_core::intake::IntakeRequest {
        origin: modstead_core::intake::Origin::Local { path: archive.to_path_buf() },
        work_dir: work.to_path_buf(),
        content: crate::INFO.content,
        trusted: crate::INFO.trusted_sources,
        known: crate::INFO.known_sources,
        nexus_lookup: None,
    };
    let i = modstead_core::intake::run(&services, &job, req).await?;
    Ok((i.extract_dir, i.report))
}

fn exe_xml_doc(entries: &[(&str, &str, &Path)]) -> String {
    let blocks: String = entries
        .iter()
        .map(|(n, d, p)| format!("  <Launch.Addon>\n    <Name>{n}</Name>\n    <Disabled>{d}</Disabled>\n    <Path>{}</Path>\n  </Launch.Addon>\n", p.display()))
        .collect();
    format!("\u{feff}<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<SimBase.Document Type=\"Launch\" version=\"1,0\">\n  <Descr>Launch</Descr>\n  <Disabled>False</Disabled>\n{blocks}</SimBase.Document>")
}

fn check<'a>(m: &'a crate::scanner::ModEntry, id: &str) -> &'a crate::readiness::ReadinessCheck {
    m.readiness.iter().find(|c| c.id == id).unwrap_or_else(|| panic!("{id} denetimi yok: {:#?}", m.readiness))
}

/// Hazırlık denetimi uçtan uca: sahte exe.xml / Content.xml ile. Düzeltmeler yalnızca bu sahte dosyalara uygulanır.
#[test]
fn readiness_end_to_end() {
    use crate::readiness::{apply_fix, verify, ReadinessFix};
    let root = root();
    let lib = root.join("lib");
    let mut sims = vec![fake_sim(SIM_2020, &root.join("p20")), fake_sim(SIM_2024, &root.join("p24"))];
    let (cfg20, cfg24) = (root.join("cfg20"), root.join("cfg24"));
    fs::create_dir_all(&cfg20).unwrap();
    fs::create_dir_all(cfg24.join("Oyuncu")).unwrap();
    let fenix = root.join("FenixSim A320").join("deps").join("FenixBootstrapper.exe");
    fs::create_dir_all(fenix.parent().unwrap()).unwrap();
    fs::write(&fenix, b"MZ").unwrap();
    // 2024: Fenix girdisi var ama kapatılmış; 2020: exe.xml'de Fenix yok.
    fs::write(cfg24.join("exe.xml"), exe_xml_doc(&[("FenixA320", "True", &fenix)])).unwrap();
    fs::write(cfg20.join("exe.xml"), exe_xml_doc(&[])).unwrap();
    let content24 = cfg24.join("Oyuncu").join("Content.xml");
    fs::write(
        &content24,
        "<Packages>\n\t<Package name=\"fs24-asobo-aircraft-c152\" active=\"Activated\"/>\n\t<Package name=\"communityfs24-fnx-aircraft-320\" active=\"UserDisabled\"/>\n</Packages>",
    )
    .unwrap();
    sims[0].config_dir = Some(cfg20.clone());
    sims[0].exe_xml = Some(cfg20.join("exe.xml"));
    sims[1].config_dir = Some(cfg24.clone());
    sims[1].exe_xml = Some(cfg24.join("exe.xml"));
    sims[1].content_xml = Some(content24.clone());

    let b24 = Some("Microsoft Flight Simulator 2024");
    make_pkg(&lib.join("fnx-aircraft-320"), "Fenix A320", b24, &[("SimObjects/Airplanes/FNX_320/aircraft.cfg", b"[GENERAL]"), ("html_ui/a.js", b"x")]);
    make_pkg(&lib.join("fnx-aircraft-320-liveries"), "Fenix boyalari", b24, &[("SimObjects/Airplanes/FNX_320_LIV/texture.x/a.dds", b"DDS")]);
    for (pkg, sim) in [("fnx-aircraft-320", SIM_2024), ("fnx-aircraft-320", SIM_2020), ("fnx-aircraft-320-liveries", SIM_2024)] {
        linker::enable(&sims, &lib, &lib.join(pkg), "2024", sim).unwrap();
    }

    let mut cache = ScanCache::default();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let m = r.mods.iter().find(|m| m.id == "fnx-aircraft-320").unwrap();
    // Sim paketi İçerik Yöneticisi'nde kapatmış: hata + düzeltme.
    let c = check(m, "content:msfs2024");
    assert_eq!((c.code.as_str(), c.status.as_str()), ("sim-user-disabled", "error"));
    let content_fix = c.fix.clone().unwrap();
    assert_eq!(content_fix, ReadinessFix::ActivateContentPackage { sim: SIM_2024.into(), package: "communityfs24-fnx-aircraft-320".into() });
    // 2024'te exe.xml girdisi kapalı, 2020'de hiç yok: her sim kendi exe.xml'ine göre denetlenir.
    let c = check(m, "req:fenix-system:msfs2024");
    assert_eq!((c.code.as_str(), c.status.as_str()), ("companion-disabled", "error"));
    let exe_fix = c.fix.clone().unwrap();
    assert_eq!(check(m, "req:fenix-system:msfs2020").code, "companion-not-registered");
    assert_eq!(check(m, "content:msfs2020").status, "ok");
    assert_eq!(check(m, "path:msfs2024").code, "path-ok");
    // Hata düzeyindekiler Sağlık sayfası için issues'a da düşer.
    for (code, sim) in [("sim-user-disabled", SIM_2024), ("companion-disabled", SIM_2024), ("companion-not-registered", SIM_2020)] {
        assert!(m.issues.iter().any(|i| i.code == code && i.sim.as_deref() == Some(sim) && i.level == "error"), "{code} issues'ta yok");
    }
    // Boya paketi uygulama gerektirmez; sim onu henüz görmedi (Content.xml bağlantıdan önce yazıldı).
    let liv = r.mods.iter().find(|m| m.id == "fnx-aircraft-320-liveries").unwrap();
    assert!(liv.readiness.iter().all(|c| c.group != "companion"));
    assert_eq!(check(liv, "content:msfs2024").code, "sim-not-seen");

    // Düzeltmeler: dosya önce yedeklenir, sonra yalnızca ilgili değer değişir.
    let before = fs::read_to_string(&content24).unwrap();
    let out = apply_fix(&sims, &content_fix).unwrap();
    assert_eq!(fs::read_to_string(&out.backup).unwrap(), before);
    let before_exe = fs::read_to_string(cfg24.join("exe.xml")).unwrap();
    let out = apply_fix(&sims, &exe_fix).unwrap();
    assert_eq!(fs::read_to_string(&out.backup).unwrap(), before_exe);
    assert!(fs::read_to_string(cfg24.join("exe.xml")).unwrap().starts_with('\u{feff}'));
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let m = r.mods.iter().find(|m| m.id == "fnx-aircraft-320").unwrap();
    assert_eq!(check(m, "content:msfs2024").code, "sim-active");
    assert_eq!(check(m, "req:fenix-system:msfs2024").code, "companion-ok");
    assert!(!m.issues.iter().any(|i| i.sim.as_deref() == Some(SIM_2024) && i.code.starts_with("companion")));
    // Aynı düzeltme ikinci kez uygulanamaz.
    assert!(apply_fix(&sims, &exe_fix).is_err());

    // Sim Content.xml'i paketten sonra yeniden yazdı ama boya paketini listelemedi: uyarı.
    let later = std::time::SystemTime::now() + std::time::Duration::from_secs(3600);
    fs::File::options().write(true).open(&content24).unwrap().set_modified(later).unwrap();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let liv = r.mods.iter().find(|m| m.id == "fnx-aircraft-320-liveries").unwrap();
    assert_eq!(check(liv, "content:msfs2024").code, "sim-not-registered");

    // Program kaldırıldı: girdi duruyor ama exe yok.
    fs::remove_file(&fenix).unwrap();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let m = r.mods.iter().find(|m| m.id == "fnx-aircraft-320").unwrap();
    assert_eq!(check(m, "req:fenix-system:msfs2024").code, "companion-exe-missing");

    // Derin doğrulama: diskte değişmiş ve layout'ta olmayan dosyalar.
    fs::write(lib.join("fnx-aircraft-320").join("html_ui").join("a.js"), b"degisti").unwrap();
    fs::write(lib.join("fnx-aircraft-320").join("fazla.js"), b"1").unwrap();
    let v = verify(m, &r);
    let codes: Vec<&str> = v.checks.iter().map(|c| c.code.as_str()).collect();
    assert!(codes.contains(&"layout-size-mismatch") && codes.contains(&"files-not-in-layout"), "{codes:?}");
    assert!(!codes.contains(&"layout-files-missing"), "{codes:?}");
    assert_eq!(v.status, "error");

    // Yol uzunluğu: layout.json'da Community yoluyla birlikte 259 karakteri aşan bir dosya.
    let long_rel = format!("SimObjects/Airplanes/{}/model/{}.gltf", "u".repeat(90), "m".repeat(120));
    let lp = lib.join("long-pkg");
    fs::create_dir_all(&lp).unwrap();
    fs::write(lp.join("manifest.json"), r#"{"title":"Uzun","content_type":"AIRCRAFT","package_version":"1.0.0","minimum_game_version":"1.0.0"}"#).unwrap();
    fs::write(lp.join("layout.json"), format!(r#"{{"content":[{{"path":"{long_rel}","size":1,"date":0}}]}}"#)).unwrap();
    linker::enable(&sims, &lib, &lp, "2020", SIM_2024).unwrap();
    let r = scan(sims.clone(), Some(lib.clone()), &Db::default(), &mut cache);
    let m = r.mods.iter().find(|m| m.id == "long-pkg").unwrap();
    assert_eq!(check(m, "manifest").code, "manifest-ok");
    let c = check(m, "path:msfs2024");
    assert_eq!((c.code.as_str(), c.status.as_str()), ("path-too-long", "error"), "{}", c.detail);
    assert!(m.issues.iter().any(|i| i.code == "path-too-long"));
    let v = verify(m, &r);
    let codes: Vec<&str> = v.checks.iter().map(|c| c.code.as_str()).collect();
    assert!(codes.contains(&"layout-files-missing") && codes.contains(&"path-too-long"), "{codes:?}");

    // Temizlik: önce bağlantılar (hedefe dokunmadan), sonra klasörler.
    for s in &sims {
        for (_, c) in s.containers() {
            for e in fs::read_dir(&c).unwrap().flatten() {
                if is_link(&e.path()) {
                    fs::remove_dir(e.path()).unwrap();
                }
            }
        }
    }
    fs::remove_dir_all(&root).unwrap();
}

/// Kurulum akışı uçtan uca: yerel arşiv → ortak kabul hattı → inceleme planı → onay → kütüphane + bağlantı.
/// Simlerin paket klasörü sahte geçici klasörlere yönlendirilir; gerçek Community'ye dokunulmaz.
#[tokio::test(flavor = "multi_thread")]
async fn install_flow_end_to_end() {
    use crate::install::{self, ConfirmOptions};
    use crate::settings::SimOverride;
    use modstead_core::Stage;

    let root = root();
    let services = modstead_core::Services::for_tests();
    services
        .update_settings(|s| {
            s.require_scan = false; // Defender testlerde çalışmaz
            s.virustotal = false;
        })
        .unwrap();
    let game = crate::Msfs::open(services.clone(), root.join("data"));
    let (p20, p24) = (root.join("p20"), root.join("p24"));
    for p in [&p20, &p24] {
        fs::create_dir_all(p.join("Community")).unwrap();
    }
    game.update_settings(|s| {
        s.library_path = Some(root.join("lib"));
        s.sim_overrides.insert(SIM_2020.into(), SimOverride { packages_path: Some(p20.clone()), disabled: false });
        s.sim_overrides.insert(SIM_2024.into(), SimOverride { packages_path: Some(p24.clone()), disabled: false });
    })
    .unwrap();

    let zip_path = root.join("boya.zip");
    write_zip(
        &zip_path,
        &[
            ("thy/a32nx-thy/manifest.json", br#"{"title":"THY A320neo","content_type":"LIVERY","package_version":"1.0.0","minimum_game_version":"1.0.0"}"#),
            ("thy/a32nx-thy/layout.json", br#"{"content":[{"path":"SimObjects/Airplanes/x/texture.thy/a.dds","size":3,"date":0}]}"#),
            ("thy/a32nx-thy/SimObjects/Airplanes/x/texture.thy/a.dds", b"DDS"),
        ],
    );
    let snap = install::start_path(&game, zip_path).unwrap();
    let job = services.jobs.get(&snap.id).unwrap();
    for _ in 0..200 {
        if job.snapshot().stage.is_final() || job.snapshot().stage == Stage::Review {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }
    let s = job.snapshot();
    assert_eq!(s.stage, Stage::Review, "{:?}", s.error);
    let plan: serde_json::Value = s.plan.clone().unwrap();
    assert_eq!(plan["packages"][0]["rel"], "thy/a32nx-thy");
    assert_eq!(plan["packages"][0]["category"], "livery");
    // Boya iki sime de önerilir.
    assert_eq!(plan["suggestedSims"].as_array().unwrap().len(), 2);
    // Karantina kütüphanenin içinde ve tarama onu görmez.
    assert!(root.join("lib").join(".modstead").join("staging").join(&s.id).is_dir());

    let done = install::confirm(&game, &s.id, false, ConfirmOptions { packages: vec!["thy/a32nx-thy".into()], sims: vec![SIM_2020.into()] }).await.unwrap();
    assert_eq!(done.stage, Stage::Done);
    assert!(root.join("lib").join("a32nx-thy").join("manifest.json").is_file());
    assert!(is_link(&p20.join("Community").join("a32nx-thy")));
    assert!(!p24.join("Community").join("a32nx-thy").exists());
    assert!(!root.join("lib").join(".modstead").join("staging").join(&s.id).exists(), "karantina temizlenmeli");
    let scan = game.snapshot();
    let m = scan.mods.iter().find(|m| m.id == "a32nx-thy").unwrap();
    assert_eq!(m.sims[SIM_2020].state, "enabled");
    assert_eq!(m.meta.report.as_ref().unwrap().verification.status, modstead_core::security::VerificationStatus::Local);
    // Aynı görev ikinci kez onaylanamaz.
    assert!(install::confirm(&game, &s.id, false, ConfirmOptions::default()).await.is_err());

    // Kaldır: bağlantı ve kütüphane klasörü gider.
    linker::uninstall(&game.sims(), &root.join("lib"), &root.join("lib").join("a32nx-thy")).unwrap();
    assert!(!is_link(&p20.join("Community").join("a32nx-thy")));
    fs::remove_dir_all(&root).unwrap();
}
