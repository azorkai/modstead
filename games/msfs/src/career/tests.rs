//! Kariyerin uçtan uca akışları (sim olmadan: takipçiye telemetri elle verilir).

use super::*;
use crate::career::airports::distance_nm;
use crate::career::tracker::Tracker;
use crate::career::model::Stage;
use crate::career::tracker::{Phase, Telemetry};

fn career() -> Arc<Career> {
    Career::open(Services::for_tests(), Arc::new(Vec::new))
}

fn create(c: &Career, start: &str) {
    c.create(CreateRequest { name: "Oyuncu".into(), callsign: "tc-mod".into(), home: "LTBA".into(), difficulty: Difficulty::Normal, start: start.into() }).unwrap();
}

/// Aktif işin takipçisine kalkış → seyir → iniş → park uçuşu oynatır.
fn fly_active(c: &Career, fpm_fps: f64) {
    let mut d = c.lock_data();
    let a = d.active.as_mut().unwrap();
    let (from, to) = (db().get(&a.job.from).unwrap().clone(), db().get(&a.job.to).unwrap().clone());
    let mut tr = Tracker::new(&a.job.id, tracker::Airfield { icao: from.icao.clone(), lat: from.lat, lon: from.lon }, tracker::Airfield { icao: to.icao.clone(), lat: to.lat, lon: to.lon }, a.aircraft.as_ref().and_then(|p| p.class), 0);
    let mut t = Telemetry { lat: from.lat, lon: from.lon, on_ground: true, parking_brake: true, fuel_lb: 300.0, total_lb: 2300.0, sim_rate: 1.0, g: 1.0, ..Default::default() };
    let mut abs = 100.0;
    let mut ms = 0i64;
    let mut step = |tr: &mut Tracker, t: &mut Telemetry, secs: f64| {
        abs += secs;
        ms += (secs * 1000.0) as i64;
        t.abs_time = abs;
        tr.update(t, ms);
    };
    step(&mut tr, &mut t, 1.0);
    t.engines_on = true;
    t.parking_brake = false;
    t.gs_kt = 10.0;
    for _ in 0..5 {
        step(&mut tr, &mut t, 1.0);
    }
    t.on_runway = true;
    t.gs_kt = 70.0;
    step(&mut tr, &mut t, 1.0);
    t.on_ground = false;
    t.agl_ft = 100.0;
    t.vs_fpm = 600.0;
    for _ in 0..4 {
        step(&mut tr, &mut t, 1.0);
    }
    let dist = distance_nm(from.lat, from.lon, to.lat, to.lon);
    let secs = dist / 110.0 * 3600.0;
    let n = 60;
    for i in 0..n {
        let f = (i + 1) as f64 / n as f64;
        t.lat = from.lat + (to.lat - from.lat) * f;
        t.lon = from.lon + (to.lon - from.lon) * f;
        t.gs_kt = 110.0;
        t.ias_kt = 105.0;
        t.alt_ft = 4500.0;
        t.agl_ft = 4500.0;
        t.vs_fpm = 0.0;
        t.fuel_lb -= 0.3;
        step(&mut tr, &mut t, secs / n as f64);
    }
    t.agl_ft = 0.0;
    t.on_ground = true;
    t.td_fps = fpm_fps;
    t.gs_kt = 50.0;
    step(&mut tr, &mut t, 1.0);
    t.gs_kt = 10.0;
    t.on_runway = false;
    for _ in 0..3 {
        step(&mut tr, &mut t, 2.0);
    }
    t.gs_kt = 0.0;
    t.parking_brake = true;
    t.engines_on = false;
    for _ in 0..5 {
        step(&mut tr, &mut t, 1.0);
    }
    assert_eq!(tr.phase, Phase::Parked);
    a.tracker = Some(tr);
    a.stage = Stage::Flying;
}

#[test]
fn student_career_from_zero_to_first_paid_flight() {
    let c = career();
    assert!(c.view().pilot.is_none());
    create(&c, "student");
    let v = c.view();
    let p = v.pilot.as_ref().unwrap();
    assert_eq!(p.pilot.location, "LTBA");
    assert_eq!(p.pilot.callsign, "TC-MOD");
    assert_eq!(p.level, 1);
    assert_eq!(p.pilot.licenses, vec!["spl".to_string()]);
    assert!(v.licenses.iter().any(|l| l.eligibility.id == "ppl" && !l.eligibility.ready));

    let jobs = c.board().unwrap();
    let job = jobs.iter().find(|j| j.kind == "training").unwrap().clone();
    c.accept(&job.id).unwrap();
    assert!(c.accept(&job.id).is_err(), "ikinci iş kabul edilmez");
    // Yanlış sınıf reddedilir.
    assert!(c.pick_aircraft("Boeing 787-10 Asobo", "", None).is_err());
    c.pick_aircraft("Cessna Skyhawk G1000 Asobo", "", None).unwrap();
    assert!(!c.board().unwrap().iter().any(|j| j.id == job.id), "kabul edilen ilan panodan kalkar");

    let money0 = c.view().pilot.unwrap().pilot.money;
    fly_active(&c, 2.0);
    let e = c.finish().unwrap();
    assert_eq!(e.result, "completed", "{:?}", e.summary);
    assert!(e.summary.score >= 90);
    assert!(e.xp > 0);
    assert_eq!(e.settlement.pay, job.pay);
    assert_eq!(e.settlement.rent, 0, "operatör adına masraf yok");
    let v = c.view();
    let p = v.pilot.unwrap();
    assert_eq!(p.pilot.money, money0 + job.pay);
    assert_eq!(p.pilot.location, job.to);
    assert_eq!(p.pilot.stats.flights, 1);
    assert!(p.pilot.stats.hours > 0.0);
    assert!(v.active.is_none());
    assert_eq!(c.logbook().len(), 1);
    let (entry, track) = c.flight(&e.id).unwrap();
    assert_eq!(entry.id, e.id);
    assert!(!track.is_empty());
}

#[test]
fn checkride_grants_licence_only_when_passed() {
    let c = career();
    create(&c, "student");
    {
        let mut d = c.lock_data();
        let p = d.pilot.as_mut().unwrap();
        p.stats.hours = 4.0;
        p.xp = progression::xp_for_level(2);
    }
    let fee = c.view().licenses.iter().find(|l| l.eligibility.id == "ppl").unwrap().eligibility.fee;
    let money0 = c.view().pilot.unwrap().pilot.money;
    c.start_checkride("ppl").unwrap();
    assert_eq!(c.view().pilot.unwrap().pilot.money, money0 - fee);
    c.pick_aircraft("Cessna Skyhawk G1000 Asobo", "", None).unwrap();
    // Sert iniş: sınav geçilmez.
    fly_active(&c, 9.0);
    let e = c.finish().unwrap();
    assert_eq!(e.checkride_passed, Some(false));
    assert!(!c.view().pilot.unwrap().pilot.licenses.contains(&"ppl".to_string()));

    // Ücret yine ödenir, yumuşak inişle geçilir.
    c.start_checkride("ppl").unwrap();
    c.pick_aircraft("Cessna Skyhawk G1000 Asobo", "", None).unwrap();
    fly_active(&c, 2.0);
    let e = c.finish().unwrap();
    assert_eq!(e.checkride_passed, Some(true));
    let p = c.view().pilot.unwrap();
    assert!(p.pilot.licenses.contains(&"ppl".to_string()));
    assert_eq!(p.title, tr!("Özel pilot", "Private pilot"));
}

#[test]
fn contract_flight_pays_costs_and_rental() {
    let c = career();
    create(&c, "commercial");
    let job = (0..12)
        .find_map(|k| {
            // Panoda kendi hesabına bir iş bulunana kadar başka havalimanlarına bak.
            let icao = ["LTBA", "LTFJ", "LTFM", "LTBU", "LTBJ", "LTAI", "LTAC", "LTBS", "LTFE", "LTCG", "LTAF", "LTAN"][k];
            c.lock_data().pilot.as_mut().unwrap().location = icao.into();
            c.board().unwrap().into_iter().find(|j| j.mode == Mode::Contract && j.class == Some(Class::LightPiston))
        })
        .expect("kendi hesabına hafif uçak işi");
    c.accept(&job.id).unwrap();
    c.pick_aircraft("Cessna Skyhawk G1000 Asobo", "", None).unwrap();
    fly_active(&c, 2.0);
    let e = c.finish().unwrap();
    assert!(e.settlement.rent > 0 && e.settlement.fuel > 0, "{:?}", e.settlement);
    assert_eq!(e.settlement.net, e.settlement.pay - e.settlement.rent - e.settlement.fuel - e.settlement.fees - e.settlement.late_penalty - e.settlement.damage - e.settlement.maintenance);
}

#[test]
fn travel_fleet_and_reset() {
    let c = career();
    create(&c, "commercial");
    let money = c.view().pilot.unwrap().pilot.money;
    let cost = c.travel("LTAI").unwrap();
    assert!(cost > 0);
    let p = c.view().pilot.unwrap().pilot;
    assert_eq!((p.location.as_str(), p.money), ("LTAI", money - cost));

    assert!(c.buy(Class::LightPiston, "Cessna Skyhawk G1000 Asobo").is_err(), "para yetmez");
    let limit = c.view().pilot.unwrap().credit_limit;
    assert!(limit >= 100_000, "{limit}");
    assert!(c.borrow(limit).is_err(), "masrafla sınır aşılır");
    let owed = c.borrow(80_000).unwrap();
    assert!(owed > 80_000);
    c.buy(Class::LightPiston, "Cessna Skyhawk G1000 Asobo").unwrap();
    let v = c.view();
    assert_eq!(v.pilot.as_ref().unwrap().pilot.loan, owed);
    assert_eq!(v.fleet.len(), 1);
    assert!(v.fleet[0].registration.starts_with("TC-"));
    assert_eq!(v.fleet[0].location, "LTAI");
    assert!(c.buy(Class::Widebody, "Boeing 787").is_err(), "lisans yok");
    let id = v.fleet[0].id.clone();
    let back = c.sell(&id).unwrap();
    assert!(back > 0 && back < v.fleet[0].price_paid);
    assert!(c.view().fleet.is_empty());
    let paid = c.repay(10_000).unwrap();
    assert_eq!(c.view().pilot.unwrap().pilot.loan, owed - paid);

    c.set_class("Garip Uçak", Some(Class::Bizjet)).unwrap();
    c.reset();
    assert!(c.view().pilot.is_none());
    assert_eq!(c.lock_data().class_overrides.get("Garip Uçak"), Some(&Class::Bizjet), "öğrenilenler kalır");
}

#[test]
fn abandoning_before_start_is_a_cancel() {
    let c = career();
    create(&c, "student");
    let job = c.board().unwrap().remove(0);
    c.accept(&job.id).unwrap();
    assert!(c.abandon().unwrap().is_none());
    assert!(c.view().active.is_none());
}
