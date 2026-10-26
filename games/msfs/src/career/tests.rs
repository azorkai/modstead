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
    c.create(CreateRequest { name: "Oyuncu".into(), callsign: "tc-mod".into(), home: "LTBA".into(), difficulty: Difficulty::Normal, start: start.into(), birth_year: None }).unwrap();
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
    let st = &e.settlement;
    assert_eq!(st.net, st.pay + st.tip - st.rent - st.fuel - st.fees - st.nav_fees - st.handling - st.late_penalty - st.cargo_claim - st.damage - st.maintenance - st.insurance);
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
    assert!(v.fleet[0].aircraft.registration.starts_with("TC-"));
    assert_eq!(v.fleet[0].aircraft.location, "LTAI");
    assert!(c.buy(Class::Widebody, "Boeing 787").is_err(), "lisans yok");
    let id = v.fleet[0].aircraft.id.clone();
    let back = c.sell(&id).unwrap();
    assert!(back > 0 && back < v.fleet[0].aircraft.price_paid);
    assert!(c.view().fleet.is_empty());
    // Bakım ve sigorta: yeni uçak bakımlı; muayene ücretli; sigorta açılıp kapanır.
    c.lock_data().pilot.as_mut().unwrap().money += 100_000;
    c.buy(Class::LightPiston, "Cessna Skyhawk G1000 Asobo").unwrap();
    let f = c.view().fleet[0].clone();
    assert!(!f.due.grounded && f.due.inspection_left_h == 100.0 && f.premium_h > 0);
    c.insure(&f.aircraft.id, true).unwrap();
    assert!(c.view().fleet[0].aircraft.insured);
    let money = c.view().pilot.unwrap().pilot.money;
    let cost = c.maintain(&f.aircraft.id, false).unwrap();
    assert_eq!(c.view().pilot.unwrap().pilot.money, money - cost);
    c.lock_data().fleet[0].since_inspection_h = 130.0;
    assert!(c.view().fleet[0].due.grounded);
    c.sell(&f.aircraft.id).unwrap();
    c.lock_data().pilot.as_mut().unwrap().money -= 100_000;
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

#[test]
fn records_bonuses_appeal_and_achievements_after_a_flight() {
    let c = career();
    create(&c, "commercial");
    let p = c.view().pilot.unwrap();
    // Ticari başlangıç: sağlık sertifikası ve yeterlilik tam.
    assert!(p.status.medical_valid && p.status.passenger_current && p.status.ifr_current, "{:?}", p.status);
    // Panoda hafif uçakla yapılacak sıradan bir iş bulunana kadar başka havalimanlarına bak.
    let job = ["LTBA", "LTFJ", "LTBU", "LTBJ", "LTFE", "LTAI", "LTBS", "LTBR", "LTBQ", "LTAC"]
        .iter()
        .find_map(|icao| {
            c.lock_data().pilot.as_mut().unwrap().location = icao.to_string();
            c.board().unwrap().into_iter().find(|j| j.class == Some(Class::LightPiston) && j.objectives.is_empty())
        })
        .expect("hafif uçak işi");
    c.accept(&job.id).unwrap();
    c.pick_aircraft("Cessna Skyhawk G1000 Asobo", "", None).unwrap();
    // Uçuş kâğıdı: hafif uçak VFR, yakıt ve ağırlıklar hesaplı.
    let disp = c.view().active.unwrap().dispatch.expect("uçuş kâğıdı");
    assert!(disp.fuel.block_kg > disp.fuel.trip_kg && disp.weights.tow_kg > disp.weights.zfw_kg);
    fly_active(&c, 2.0);
    // Uçuşa bir kural kesintisi ekle (itiraz için).
    {
        let mut d = c.lock_data();
        let tr = d.active.as_mut().unwrap().tracker.as_mut().unwrap();
        tr.events.push(tracker::FlightEvent { code: "taxi_speed".into(), penalty: 2, severity: tracker::Severity::Minor, ..Default::default() });
    }
    let e = c.finish().unwrap();
    assert!(e.deductions.iter().any(|(k, _)| k == "taxi_speed"));
    let v = c.view();
    let st = &v.pilot.as_ref().unwrap().status;
    assert!(st.landings_90d >= 4, "uçuşun inişi sicile işlendi: {st:?}");
    assert!(st.on_duty && st.duty_sectors == 1);
    // İtiraz: kesinti kalkar, puan ve XP artar, para değişmez.
    let money = v.pilot.as_ref().unwrap().pilot.money;
    let xp = v.pilot.as_ref().unwrap().pilot.xp;
    let a = c.appeal(&e.id, "taxi_speed").unwrap_or_else(|err| panic!("{err} · {:?} · {:?}", e.summary.invalid, e.deductions));
    assert_eq!(a.summary.score, (e.summary.score + 2).min(100));
    assert!(a.appealed.contains(&"taxi_speed".to_string()));
    let v = c.view();
    assert_eq!(v.pilot.as_ref().unwrap().pilot.money, money);
    assert!(v.pilot.as_ref().unwrap().pilot.xp >= xp);
    assert!(c.appeal(&e.id, "taxi_speed").is_err(), "aynı kesintiye ikinci itiraz yok");
    // Başarımlar: ilk uçuş tamam.
    assert!(v.achievements.iter().any(|x| x.id == "first_flight" && x.done));
    // Dinlenme görevi bitirir; evden uzaktaysa otel ücreti.
    c.rest().unwrap();
    assert!(!c.view().pilot.unwrap().status.on_duty);
    // Sağlık muayenesi ücretlidir.
    let before = c.view().pilot.unwrap().pilot.money;
    let fee = c.renew_medical().unwrap();
    assert!(fee > 0 && c.view().pilot.unwrap().pilot.money == before - fee);
}

#[test]
fn medical_and_currency_block_jobs() {
    let c = career();
    create(&c, "commercial");
    // Sağlık sertifikası dolmuş: iş alınamaz.
    c.lock_data().pilot.as_mut().unwrap().records.medical_until = 1;
    let job = c.board().unwrap().into_iter().next().unwrap();
    let err = c.accept(&job.id).unwrap_err().to_string();
    assert!(err.contains("ağlık") || err.contains("edical"), "{err}");
    c.renew_medical().unwrap();
    // Yolcu yeterliliği yok: yolculu iş alınamaz, yolcusuz iş alınır.
    c.lock_data().pilot.as_mut().unwrap().records.landings.clear();
    let board = c.board().unwrap();
    if let Some(pj) = board.iter().find(|j| carries_passengers(j)) {
        assert!(c.accept(&pj.id).is_err());
    }
    if let Some(cj) = board.iter().find(|j| !carries_passengers(j)) {
        c.accept(&cj.id).unwrap();
    }
}

// ---------- Kariyer yolları ----------

fn create_in(c: &Career, path: paths::CareerPath, start: &str, home: &str) {
    c.create_in(CreateRequest { name: "Oyuncu".into(), callsign: String::new(), home: home.into(), difficulty: Difficulty::Normal, start: start.into(), birth_year: None }, path).unwrap();
}

#[test]
fn fast_start_in_every_path_can_take_its_own_work_at_once() {
    use paths::CareerPath::*;
    for path in [Airline, Cargo, Bush, Medical, Charter, Aerial] {
        let c = career();
        let home = paths::def(path).homes[0];
        create_in(&c, path, "fast", home);
        let v = c.view();
        let p = v.pilot.as_ref().unwrap();
        assert_eq!(p.pilot.path, path);
        assert_eq!(p.pilot.start, "fast");
        assert_eq!(p.path_status.rank, 1, "{path:?}: ilk basamakta başlar");
        let rank = &paths::def(path).ranks[0];
        assert_eq!(p.title, tr!(rank.name_tr, rank.name_en), "{path:?}: unvan rütbedir");
        // Sahip olunan lisansların saat şartı uçuş geçmişiyle çelişmiyor.
        for l in v.licenses.iter().filter(|l| l.eligibility.held) {
            assert!(p.pilot.stats.hours + 1e-6 >= l.eligibility.hours_needed, "{path:?}: {}", l.eligibility.id);
        }
        // Pano yolun işleriyle dolu (birkaç tohuma bakılır); yolun işleri primli, yol dışı olanlar işaretli.
        let kinds = paths::def(path).kinds;
        let (mut on, mut off, mut total) = (0, 0, 0);
        for k in 0..8 {
            c.lock_data().pilot.as_mut().unwrap().created_at = format!("2026-10-{:02}T00:00:00Z", k + 1);
            for j in c.board().unwrap() {
                total += 1;
                if kinds.contains(&j.kind.as_str()) {
                    on += 1;
                    assert!(!j.off_path && j.path_pay_bonus == paths::PAY_BONUS[1] && j.path_xp_bonus == paths::XP_BONUS, "{path:?} {j:?}");
                } else if j.kind != "training" {
                    off += 1;
                    assert!(j.off_path && j.path_pay_bonus == 0, "{path:?} {}", j.kind);
                }
            }
        }
        assert!(total > 0 && on as f64 / total as f64 >= 0.4, "{path:?}: yolun işleri {on}/{total}");
        assert!(off > 0, "{path:?}: çeşitlilik kalır");
        // Yolun bir işi hemen kabul edilebiliyor (sicil engel değil).
        let job = c.board().unwrap().into_iter().find(|j| kinds.contains(&j.kind.as_str()) && !j.ir_required).expect("yolun işi");
        c.accept(&job.id).unwrap_or_else(|e| panic!("{path:?}: {e}"));
    }
}

#[test]
fn path_flight_counts_toward_rank_and_pays_xp_bonus() {
    let c = career();
    create_in(&c, paths::CareerPath::Cargo, "fast", "LTBA");
    let job = ["LTBA", "LTFJ", "LTBU", "LTBJ", "LTFE", "LTAI", "LTBS", "LTBR", "LTBQ", "LTAC", "LTFM", "LTCG"]
        .iter()
        .find_map(|icao| {
            c.lock_data().pilot.as_mut().unwrap().location = icao.to_string();
            c.board().unwrap().into_iter().find(|j| j.kind == "cargo" && j.class == Some(Class::LightPiston) && j.mode == Mode::Employee)
        })
        .expect("hafif uçakla kargo işi");
    assert_eq!((job.path_pay_bonus, job.path_xp_bonus), (4, 10));
    c.accept(&job.id).unwrap();
    c.pick_aircraft("Cessna Skyhawk G1000 Asobo", "", None).unwrap();
    fly_active(&c, 2.0);
    let e = c.finish().unwrap();
    assert_eq!(e.result, "completed", "{:?}", e.summary);
    let p = c.view().pilot.unwrap();
    let h = p.pilot.stats.kind_hours.get("cargo").copied().unwrap_or(0.0);
    assert!(h > 0.0 && (h - e.credited_hours).abs() < 0.01, "{h} {}", e.credited_hours);
    assert!((p.path_status.hours - (h * 10.0).round() / 10.0).abs() < 0.051);
    // XP primi uçuş sonunda uygulanır.
    let base = progression::flight_xp(e.summary.score, e.summary.block_s / 3600.0, job.distance_nm.min(e.summary.flown_nm.max(job.distance_nm * 0.5)), Class::LightPiston, false) as f64
        * (1.0 + e.summary.bonus_pct as f64 / 100.0)
        * (1.0 + job.conditions.xp_bonus as f64 / 100.0);
    assert_eq!(e.xp, (base * 1.1).round() as u32);
}

#[test]
fn changing_path_keeps_licences_hours_and_money() {
    let c = career();
    create_in(&c, paths::CareerPath::Airline, "fast", "LTFM");
    let before = c.view().pilot.unwrap();
    assert_eq!(before.pilot.money, 10_000);
    assert_eq!(before.title, tr!("İkinci pilot", "First officer"));
    // Havayolu saati birikmiş, itibar yüksek: kaptanlık.
    {
        let mut d = c.lock_data();
        let p = d.pilot.as_mut().unwrap();
        p.stats.kind_hours.insert("airline".into(), 70.0);
        p.reputation = 65.0;
        paths::promote(p);
    }
    assert_eq!(c.view().pilot.unwrap().path_status.rank_id, Some("captain"));
    c.set_path(paths::CareerPath::Cargo).unwrap();
    let after = c.view().pilot.unwrap();
    assert_eq!(after.pilot.path, paths::CareerPath::Cargo);
    assert_eq!(after.pilot.licenses, before.pilot.licenses);
    assert_eq!((after.pilot.money, after.pilot.stats.hours, after.pilot.xp, after.pilot.reputation), (before.pilot.money, before.pilot.stats.hours, before.pilot.xp, 65.0));
    // Kargoda saat yok: ATPL'li pilot besleme pilotu (kargo ikinci pilotu 30 saat kargo ister).
    assert_eq!(after.path_status.rank_id, Some("feeder_pilot"));
    assert_eq!(after.path_status.hours, 0.0);
    // Geri dönünce kaptanlık kalır (kalıcı rütbe).
    c.set_path(paths::CareerPath::Airline).unwrap();
    assert_eq!(c.view().pilot.unwrap().path_status.rank_id, Some("captain"));
    // Elde iş varken yol değişmez.
    let job = c.board().unwrap().into_iter().find(|j| !j.ir_required).unwrap();
    c.accept(&job.id).unwrap();
    assert!(c.set_path(paths::CareerPath::Bush).is_err());
    // Genel yol: unvan en yüksek lisanstan (TR-N), prim yok, yol dışı iş yok.
    c.cancel().unwrap();
    c.set_path(paths::CareerPath::General).unwrap();
    let g = c.view().pilot.unwrap();
    assert_eq!(g.title, tr!("Kaptan", "Captain"));
    assert_eq!((g.path_status.pay_bonus, g.path_status.xp_bonus), (0, 0));
    assert!(c.board().unwrap().iter().all(|j| !j.off_path && j.path_pay_bonus == 0));
}

#[test]
fn scratch_start_and_legacy_starts() {
    let c = career();
    create_in(&c, paths::CareerPath::Medical, "student", "LOWI");
    let p = c.view().pilot.unwrap();
    assert_eq!(p.pilot.licenses, vec!["spl".to_string()]);
    assert_eq!((p.pilot.money, p.path_status.rank), (paths::SCRATCH_MONEY, 0));
    assert_eq!(p.path_status.next_license, Some("ppl"));
    assert_eq!(p.title, tr!("Öğrenci pilot", "Student pilot"));
    // Öğrencinin panosu eğitim uçuşları; hiçbiri yol dışı değil.
    assert!(c.board().unwrap().iter().all(|j| j.kind == "training" && !j.off_path));
    // Eski "airline" başlangıcı havayolu yolunun deneyimli paketidir; "commercial" genel yolun.
    create(&c, "airline");
    let p = c.view().pilot.unwrap();
    assert_eq!((p.pilot.path, p.path_status.rank_id), (paths::CareerPath::Airline, Some("first_officer")));
    assert!(p.pilot.has("narrow"));
    create(&c, "commercial");
    let p = c.view().pilot.unwrap();
    assert_eq!(p.pilot.path, paths::CareerPath::General);
    assert!(p.pilot.has("cpl") && p.pilot.has("ir") && p.pilot.has("me"));
}

#[test]
fn old_career_files_open_in_the_general_path() {
    // Yol alanları olmayan eski bir kayıt.
    let json = r#"{"version":1,"pilot":{"name":"Eski","home":"LTBA","location":"LTBA","licenses":["spl","ppl"],"reputation":55,"money":900,"stats":{"hours":4.2}}}"#;
    let d: CareerData = serde_json::from_str(json).unwrap();
    let p = d.pilot.unwrap();
    assert_eq!(p.path, paths::CareerPath::General);
    assert!(p.stats.kind_hours.is_empty() && p.path_ranks.is_empty());
    let j: Job = serde_json::from_str(r#"{"id":"x","kind":"cargo"}"#).unwrap();
    assert!(!j.off_path && j.path_xp_bonus == 0);
}
