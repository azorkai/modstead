//! İş ilanı panosu: her havalimanında, 4 saatlik pencerelerle değişen, tohumlu (aynı pencerede aynı ilanlar) işler.
//!
//! İlan sayısı ve türü havalimanının büyüklüğüne, pilotun lisanslarına ve itibarına bağlıdır. Hedefler gerçek
//! havalimanlarıdır (gömülü veritabanı; sim bağlıyken simde olmayanlar atlanır) ve sınıfın pist şartına uyar.
//! Teslim süreleri cömerttir (kısa oturumlar cezalandırılmasın); yalnızca acil işlerin dar süresi ve ek ücreti var.

use std::collections::HashSet;

use super::aircraft::{CLASSES, Class, ClassInfo, info};
use super::airports::{Airport, AirportDb, Size, Surface, distance_nm};
use super::conditions;
use super::economy::{self, Costs, care, care_multiplier, contract_quote, fuel_price_at, handling_fee, plan, route_charge, wage_pay};
use super::missions::{self, Objective};
use super::model::{Job, Mode, Pilot};
use super::paths;
use super::progression::{can_fly, flight_xp};

/// İlan penceresi (saniye).
pub const SLOT_SECS: i64 = 4 * 3600;

/// Küçük, bağımsız sözde rastgele üreteç (SplitMix64): tohum aynıysa ilanlar aynı.
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Rng(seed ^ 0x9E37_79B9_7F4A_7C15)
    }
    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    pub fn f(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + (hi - lo) * self.f()
    }
    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> Option<&'a T> {
        if items.is_empty() { None } else { items.get((self.next() % items.len() as u64) as usize) }
    }
    /// Ağırlıklı seçim.
    pub fn weighted<'a, T>(&mut self, items: &'a [(T, f64)]) -> Option<&'a T> {
        let total: f64 = items.iter().map(|(_, w)| w.max(0.0)).sum();
        if total <= 0.0 {
            return None;
        }
        let mut x = self.f() * total;
        for (it, w) in items {
            x -= w.max(0.0);
            if x <= 0.0 {
                return Some(it);
            }
        }
        items.last().map(|(it, _)| it)
    }
}

fn hash(s: &str) -> u64 {
    // FNV-1a: sürümler arasında kararlı (std'nin Hasher'ı değil).
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    h
}

pub struct BoardInput<'a> {
    pub db: &'a AirportDb,
    pub pilot: &'a Pilot,
    pub airport: &'a Airport,
    pub now: i64,
    /// Simdeki havalimanları (2024 bağlıyken öğrenilir); yoksa hepsi kabul.
    pub sim_airports: Option<&'a HashSet<String>>,
    /// Bu havalimanında duran kendi uçaklarının sınıfları.
    pub fleet_here: &'a [Class],
    pub taken: &'a [String],
}

/// Bu havalimanında hangi sınıflar kiralanabilir.
pub fn rentable(size: Size, c: Class) -> bool {
    match size {
        Size::Large => true,
        Size::Medium => !matches!(c, Class::Widebody),
        Size::Small | Size::Seaplane => matches!(c, Class::LightPiston | Class::PistonTwin | Class::TurbopropSingle | Class::Helicopter),
    }
}

/// Pilotun lisanslarına göre açık iş türleri ve ağırlıkları.
fn kinds(p: &Pilot) -> Vec<(&'static str, f64)> {
    if !p.has("ppl") {
        return vec![("training", 1.0)];
    }
    let mut v = vec![("cargo", 30.0), ("ferry", 12.0), ("bush", 14.0)];
    if p.has("cpl") {
        v.extend([("passenger", 26.0), ("charter", 14.0), ("medical", 8.0)]);
        // Hava işleri: panoramik tur, paraşüt atlayışı, hava fotoğrafı, arama-kurtarma.
        v.extend([("tour", 6.0), ("skydive", 4.0), ("survey", 5.0), ("sar", 3.0)]);
    } else {
        v.push(("training", 8.0));
    }
    if p.has("atpl") {
        v.push(("airline", 30.0));
    }
    v
}

/// Bir iş türüne uygun sınıflar.
fn classes_for(kind: &str) -> &'static [Class] {
    use Class::*;
    if missions::is_mission(kind) {
        return missions::classes(kind);
    }
    match kind {
        "training" => &[LightPiston],
        "bush" => &[LightPiston, TurbopropSingle, Helicopter],
        "medical" => &[Helicopter, TurbopropSingle, TurbopropTwin, Bizjet],
        "charter" => &[PistonTwin, TurbopropSingle, TurbopropTwin, Bizjet, Helicopter],
        "airline" => &[RegionalTurboprop, RegionalJet, Narrowbody, Widebody],
        "passenger" => &[LightPiston, PistonTwin, TurbopropSingle, TurbopropTwin, RegionalTurboprop, RegionalJet, Narrowbody, Helicopter],
        _ => &[LightPiston, PistonTwin, TurbopropSingle, TurbopropTwin, RegionalTurboprop, Bizjet, RegionalJet, Narrowbody, Widebody, Helicopter],
    }
}

/// Hedef havalimanının bu iş için ağırlığı (0 = uygun değil).
fn destination_weight(kind: &str, a: &Airport, c: &ClassInfo) -> f64 {
    if !a.suits(c) {
        return 0.0;
    }
    match kind {
        "airline" => match (a.size, a.scheduled) {
            (Size::Large, _) => 5.0,
            (Size::Medium, true) => 3.0,
            (Size::Medium, false) => 0.5,
            _ => 0.0,
        },
        "bush" => match (a.size, a.surface) {
            (Size::Small, Surface::Unpaved) => 6.0,
            (Size::Seaplane, _) if c.id != Class::Helicopter => 0.0,
            (Size::Small, _) if a.runway_ft < 3000 => 3.0,
            (Size::Small, _) => 1.0,
            _ => 0.1,
        },
        "medical" => match a.size {
            Size::Large | Size::Medium => 3.0,
            _ => 1.0,
        },
        "training" => match a.size {
            Size::Small | Size::Medium => 2.0,
            _ => 0.3,
        },
        _ => match a.size {
            Size::Large => {
                if c.cruise_kt < 200 {
                    0.3
                } else {
                    3.0
                }
            }
            Size::Medium => 2.5,
            Size::Small => {
                if c.seats > 20 {
                    0.0
                } else {
                    1.5
                }
            }
            Size::Seaplane => 0.0,
        },
    }
}

const CARGO_KINDS: &[&str] = &[
    "spare_parts",
    "mail",
    "medical_supplies",
    "electronics",
    "food",
    "machinery",
    "documents",
    "flowers",
    "luggage",
    "tools",
    "live_animals",
    "dangerous_goods",
    "seafood",
    "fragile_goods",
];
const BUSH_KINDS: &[&str] = &["camp_supplies", "fuel_drums", "survey_team", "fishing_party", "food"];
const CHARTER_KINDS: &[&str] = &["business_team", "family", "film_crew", "sports_team", "vip"];
const PAX_KINDS: &[&str] = &["tourists", "commuters", "students", "workers"];
const MEDICAL_KINDS: &[&str] = &["patient_transfer", "organ", "medical_team"];

const CLIENTS: &[&str] = &[
    "Bulut Kargo",
    "Atlas Lojistik",
    "Mavi Charter",
    "Kuzey Hava Taksi",
    "Ege Air Service",
    "Toros Aviation",
    "Skyline Freight",
    "Pinewood Air",
    "Harbor Mail",
    "Horizon Charter",
    "Vadi Havacılık",
    "Granite Mining Co.",
];
// İşin türüne uyan işletmeler (hepsi kurgusal): havayolu seferini bir kargo şirketi vermesin.
const AIRLINES: &[&str] = &["Lale Hava Yolları", "Meridyen Air", "Northwind Airways", "Boğaziçi Air", "Anatolian Regional"];
const CARGO_OPERATORS: &[&str] = &["Bulut Kargo", "Atlas Lojistik", "Skyline Freight", "Harbor Mail", "Kuzey Ekspres Kargo"];
const BUSH_OPERATORS: &[&str] = &["Pinewood Air", "Granite Mining Co.", "Toros Aviation", "Vadi Havacılık", "Tundra Supply"];
const MEDICAL_OPERATORS: &[&str] = &["Hayat Hava Ambulansı", "Lifewing Air Rescue", "Kuzey Kurtarma", "Mavi Işık Sağlık"];
const CHARTER_OPERATORS: &[&str] = &["Mavi Charter", "Horizon Charter", "Kuzey Hava Taksi", "Ege Air Service", "Altın Kanat Jet"];
const AERIAL_OPERATORS: &[&str] = &["Panorama Hava Turları", "Kartal Paraşüt Kulübü", "GeoHarita Ölçüm", "Skyview Tours"];

/// İlanı veren işletme: türüne uyan listeden.
fn operators(kind: &str) -> &'static [&'static str] {
    match kind {
        "airline" => AIRLINES,
        "cargo" => CARGO_OPERATORS,
        "bush" => BUSH_OPERATORS,
        "medical" | "sar" => MEDICAL_OPERATORS,
        "charter" => CHARTER_OPERATORS,
        "tour" | "skydive" | "survey" => AERIAL_OPERATORS,
        _ => CLIENTS,
    }
}

/// Panodaki işler. Aynı pencerede aynı girdiyle aynı sonuç döner.
pub fn board(input: &BoardInput) -> Vec<Job> {
    let p = input.pilot;
    let dep = input.airport;
    let slot = input.now.div_euclid(SLOT_SECS);
    let mut rng = Rng::new(hash(&format!("{}|{}|{}", dep.icao, slot, p.created_at)));
    let count = match dep.size {
        Size::Large => 14,
        Size::Medium => 11,
        Size::Small | Size::Seaplane => 7,
    } + (p.reputation / 25.0) as usize;

    let flyable: Vec<Class> = CLASSES.iter().map(|c| c.id).filter(|c| can_fly(*c, &p.licenses) && dep.suits(info(*c))).collect();
    if flyable.is_empty() {
        return Vec::new();
    }
    // Kariyer yolu: yolun türleri panonun ≈ %60'ı (`paths::weigh_kinds`); yolun türü açık değilse pano değişmez.
    let base_kinds = kinds(p);
    let path_open = paths::open_on_board(p.path, &base_kinds);
    let path_rank = paths::rank_of(p, p.path);
    let kinds = paths::weigh_kinds(p.path, base_kinds);
    let contracts_open = p.has("cpl");
    // Aletli koşul senaryoları geçerli aletli yetki ister (Kolay'da yeterlilik aranmaz).
    let status = p.records.status(&p.licenses, p.difficulty, input.now);
    let ir_current = p.has("ir") && (status.ifr_current || !status.enforce_currency);
    // Uzun menzilli sınıflar için aday listesi pahalı: sınıf başına bir kez.
    let mut candidates: Vec<(Class, Vec<(&Airport, f64)>)> = Vec::new();
    let mut out = Vec::new();

    for i in 0..count * 2 {
        if out.len() >= count {
            break;
        }
        let Some(kind) = rng.weighted(&kinds).copied() else { break };
        let fit = paths::fit(p.path, path_rank, kind, path_open);
        let path_classes = paths::def(p.path).classes;
        let options: Vec<(Class, f64)> = classes_for(kind)
            .iter()
            .filter(|c| flyable.contains(c))
            // En yüksek sınıflar biraz daha sık: ilerleme hissedilsin. Yoldaki işte yolun uçakları daha sık.
            .map(|c| (*c, (1.0 + (*c as u8 as f64) * 0.15) * if fit.prefer_classes && path_classes.contains(c) { paths::CLASS_PREFERENCE } else { 1.0 }))
            .collect();
        let Some(class) = rng.weighted(&options).copied() else { continue };
        let ci = info(class);

        // Hava işleri hedef noktalarıyla üretilir (çoğu kalkışa döner); diğerleri bir varış havalimanına gider.
        let (dest, dist, objectives): (Airport, f64, Vec<Objective>) = if missions::is_mission(kind) {
            let Some(m) = missions::generate(kind, dep, input.db, class, input.sim_airports, &mut rng) else { continue };
            (m.to, m.route_nm, m.objectives)
        } else {
            let list = match candidates.iter().position(|(c, _)| *c == class) {
                Some(ix) => &candidates[ix].1,
                None => {
                    let near: Vec<(&Airport, f64)> = input
                        .db
                        .within(dep.lat, dep.lon, ci.max_leg_nm as f64)
                        .into_iter()
                        .filter(|(a, d)| *d >= ci.min_leg_nm as f64 && a.icao != dep.icao)
                        .filter(|(a, _)| input.sim_airports.is_none_or(|s| s.contains(&a.icao)))
                        .collect();
                    candidates.push((class, near));
                    &candidates.last().unwrap().1
                }
            };
            let (min_nm, max_nm) = match kind {
                "training" => (15.0, 70.0),
                "medical" => (ci.min_leg_nm as f64, (ci.max_leg_nm as f64).min(400.0)),
                _ => (ci.min_leg_nm as f64, ci.max_leg_nm as f64),
            };
            let weighted: Vec<(usize, f64)> = list
                .iter()
                .enumerate()
                .filter(|(_, (_, d))| *d >= min_nm && *d <= max_nm)
                .map(|(ix, (a, _))| (ix, destination_weight(kind, a, ci)))
                .filter(|(_, w)| *w > 0.0)
                .collect();
            let Some(&ix) = rng.weighted(&weighted) else { continue };
            let (dest, dist) = list[ix];
            (dest.clone(), dist, Vec::new())
        };

        let (pax, cargo_kg, mut cargo) = payload(kind, ci, &mut rng);
        // Tehlikeli madde taşımak ticari lisans ister.
        if cargo == "dangerous_goods" && !p.has("cpl") {
            cargo = "spare_parts";
        }
        // Sınıfın tipik değerleriyle uçulamayan iş (menzil ya da ağırlık) panoya çıkmaz.
        if !super::dispatch::feasible(class, dist, pax, cargo_kg) {
            continue;
        }
        let care = care(cargo);
        let pl = plan(class, dist, pax, cargo_kg);
        let urgent = matches!(kind, "medical" | "sar") || ((kind == "cargo" || kind == "charter") && rng.f() < 0.18);
        let pay_kind = if urgent && !matches!(kind, "medical" | "sar") { "urgent" } else { kind };
        let rentable_here = rentable(dep.size, class) || input.fleet_here.contains(&class);
        let mode = if contracts_open && rentable_here && !matches!(kind, "training" | "ferry") && rng.f() < 0.5 { Mode::Contract } else { Mode::Employee };
        let load = if ci.seats > 0 && pax > 0 { pax as f64 / ci.seats as f64 } else { cargo_kg as f64 / ci.cargo_kg.max(1) as f64 };
        let care_mult = care_multiplier(care);
        let (pay, quote) = match mode {
            // Yoldaki işin primi operatör ücretine eklenir (kendi hesabına işte aşağıda kâr kısmına).
            Mode::Employee => (round10(wage_pay(ci, &pl, pay_kind, p.reputation, p.difficulty) as f64 * care_mult * (1.0 + fit.pay_bonus as f64 / 100.0)), None),
            Mode::Contract => {
                let costs = Costs {
                    fuel_price_kg: fuel_price_at(ci.fuel, dep.lat, dep.lon, input.now),
                    nav: route_charge(class, (dep.lat, dep.lon), (dest.lat, dest.lon), dist, p.difficulty),
                    handling: handling_fee(dest.size, pax, cargo_kg, p.difficulty),
                };
                let mut q = contract_quote(ci, &pl, pay_kind, load, dest.size, p.reputation, p.difficulty, costs);
                // Özel yükün primi gelire eklenir (masraflar aynı).
                q.revenue = round10(q.revenue as f64 + (q.revenue - q.est_rent - q.est_fuel - q.est_fees) as f64 * (care_mult - 1.0) * 2.0);
                q.est_profit = q.revenue - q.est_rent - q.est_fuel - q.est_fees;
                // Kariyer yolunun primi kâr kısmına (masraflar aynı).
                if fit.pay_bonus > 0 {
                    q.revenue = round10(q.revenue as f64 + q.est_profit.max(0) as f64 * fit.pay_bonus as f64 / 100.0);
                    q.est_profit = q.revenue - q.est_rent - q.est_fuel - q.est_fees;
                }
                (q.revenue, Some(q))
            }
        };
        let block_h = pl.block_min / 60.0;
        let deadline_h = if urgent {
            (block_h * 1.6 + 1.0).ceil()
        } else if care == "perishable" {
            // Bozulabilir yük: dar teslim süresi.
            (block_h * 2.0 + 4.0).ceil()
        } else {
            (block_h * 3.0 + 24.0).ceil()
        };
        let id = format!("{}-{}-{}", dep.icao, slot, i);
        if input.taken.contains(&id) {
            continue;
        }
        // Hava ve zaman senaryosu: kendi tohumuyla (panonun geri kalanı değişmesin).
        let cond = conditions::generate(
            &conditions::Pick { ppl: p.has("ppl"), ir: ir_current, kind, class, from: dep, to: &dest, block_min: pl.block_min, day: slot * SLOT_SECS },
            &mut Rng::new(hash(&format!("{id}|{}|conditions", p.created_at))),
        );
        let (mut pay, mut quote, mut pl) = (pay, quote, pl);
        if cond.pay_bonus > 0 {
            pay = round10(pay as f64 * (1.0 + cond.pay_bonus as f64 / 100.0));
            if let Some(q) = quote.as_mut() {
                q.revenue = pay;
                q.est_profit = q.revenue - q.est_rent - q.est_fuel - q.est_fees;
            }
        }
        // Görerek uçuşta seyir tavanın altında kalır.
        let ifr = super::dispatch::is_ifr(class, cond.wx.as_ref().map(|w| w.category));
        if let Some(cap) = conditions::vfr_cruise_cap(&cond, ifr, dep, &dest) {
            pl.cruise_alt_ft = pl.cruise_alt_ft.min(cap);
        }
        let xp = flight_xp(90, block_h, dist, class, false) as f64 * (1.0 + cond.xp_bonus as f64 / 100.0) * (1.0 + fit.xp_bonus as f64 / 100.0);
        out.push(Job {
            id,
            kind: kind.to_string(),
            mode,
            from: dep.icao.clone(),
            to: dest.icao.clone(),
            distance_nm: (dist * 10.0).round() / 10.0,
            class: Some(class),
            pax,
            cargo_kg,
            cargo: cargo.to_string(),
            care: care.to_string(),
            client: if kind == "training" { "Modstead Flight School".into() } else { rng.pick(operators(kind)).copied().unwrap_or("Atlas Lojistik").to_string() },
            pay,
            quote,
            plan: pl,
            urgent,
            deadline_h,
            expires_at: (slot + 1) * SLOT_SECS,
            xp_estimate: xp.round() as u32,
            checkride: None,
            objectives,
            // Senaryo havasında uçuş kategorisi ön ayardan; canlı havada METAR'dan (`Career::board`).
            weather: cond.wx.as_ref().map(|w| w.category),
            conditions: cond,
            off_path: fit.off_path,
            path_pay_bonus: fit.pay_bonus,
            path_xp_bonus: fit.xp_bonus,
            ..Default::default()
        });
    }
    out.sort_by(|a, b| b.urgent.cmp(&a.urgent).then(a.distance_nm.total_cmp(&b.distance_nm)));
    out
}

fn round10(v: f64) -> i64 {
    ((v / 10.0).round() * 10.0) as i64
}

fn payload(kind: &str, c: &ClassInfo, rng: &mut Rng) -> (u32, u32, &'static str) {
    let seats = c.seats.max(1) as f64;
    let cargo = c.cargo_kg as f64;
    match kind {
        "training" | "ferry" => (0, 0, if kind == "ferry" { "aircraft_delivery" } else { "training_flight" }),
        "tour" => (rng.range(1.0, seats.min(4.0)).round().max(1.0) as u32, 0, "sightseeing"),
        "skydive" => ((seats * rng.range(0.6, 1.0)).round().max(1.0) as u32, 0, "skydivers"),
        "survey" => (1, (cargo * 0.1).round() as u32, "survey_equipment"),
        "sar" => (0, 0, "rescue"),
        "passenger" | "airline" => ((seats * rng.range(0.45, 1.0)).round().max(1.0) as u32, 0, rng.pick(PAX_KINDS).copied().unwrap_or("tourists")),
        "charter" => ((rng.range(1.0, seats.min(8.0))).round() as u32, 0, rng.pick(CHARTER_KINDS).copied().unwrap_or("vip")),
        "medical" => (rng.range(1.0, 2.99) as u32, (cargo * rng.range(0.05, 0.2)).round() as u32, rng.pick(MEDICAL_KINDS).copied().unwrap_or("patient_transfer")),
        "bush" => (rng.range(0.0, seats.min(3.0)).round() as u32, (cargo * rng.range(0.3, 0.8)).round() as u32, rng.pick(BUSH_KINDS).copied().unwrap_or("camp_supplies")),
        _ => (0, (cargo * rng.range(0.3, 1.0) / 10.0).round() as u32 * 10, rng.pick(CARGO_KINDS).copied().unwrap_or("spare_parts")),
    }
}

/// Lisans sınavı: kalkıştan 25–90 nm uzaktaki uygun bir havalimanına tek bacak.
pub fn checkride(db: &AirportDb, dep: &Airport, license: &str, class: Class, now: i64, sim_airports: Option<&HashSet<String>>) -> Option<Job> {
    let ci = info(class);
    let mut rng = Rng::new(hash(&format!("{}|{}|{}", dep.icao, license, now / 3600)));
    let options: Vec<(&Airport, f64)> = db
        .within(dep.lat, dep.lon, 90.0)
        .into_iter()
        .filter(|(a, d)| *d >= 25.0 && a.icao != dep.icao && a.suits(ci) && a.surface != Surface::Water)
        .filter(|(a, _)| sim_airports.is_none_or(|s| s.contains(&a.icao)))
        .collect();
    let (dest, dist) = *rng.pick(&options)?;
    let pl = plan(class, dist, 0, 0);
    Some(Job {
        id: format!("checkride-{license}-{}", now),
        kind: "checkride".into(),
        mode: Mode::Employee,
        from: dep.icao.clone(),
        to: dest.icao.clone(),
        distance_nm: (dist * 10.0).round() / 10.0,
        class: Some(class),
        cargo: "examiner".into(),
        client: "Civil Aviation Authority".into(),
        pay: 0,
        plan: pl.clone(),
        deadline_h: 24.0,
        expires_at: now + 24 * 3600,
        xp_estimate: flight_xp(90, pl.block_min / 60.0, dist, class, true),
        checkride: Some(license.to_string()),
        ..Default::default()
    })
}

/// Yolcu olarak başka bir havalimanına geçiş ücreti.
pub fn travel_cost(from: &Airport, to: &Airport, p: &Pilot) -> i64 {
    economy::ticket_price(distance_nm(from.lat, from.lon, to.lat, to.lon), p.difficulty)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::airports::db;
    use crate::career::progression::Difficulty;

    fn pilot(licenses: &[&str]) -> Pilot {
        Pilot {
            name: "Oyuncu".into(),
            licenses: licenses.iter().map(|s| s.to_string()).collect(),
            reputation: 50.0,
            difficulty: Difficulty::Normal,
            created_at: "2026-10-25T00:00:00Z".into(),
            ..Default::default()
        }
    }

    fn input<'a>(p: &'a Pilot, icao: &str, now: i64) -> BoardInput<'a> {
        BoardInput { db: db(), pilot: p, airport: db().get(icao).unwrap(), now, sim_airports: None, fleet_here: &[], taken: &[] }
    }

    #[test]
    fn student_gets_only_training_nearby() {
        let p = pilot(&["spl"]);
        let jobs = board(&input(&p, "LTBA", 1_800_000_000));
        assert!(!jobs.is_empty());
        for j in &jobs {
            assert_eq!(j.kind, "training");
            assert_eq!(j.class, Some(Class::LightPiston));
            assert!(j.distance_nm >= 15.0 && j.distance_nm <= 70.0, "{}", j.distance_nm);
            assert!(j.pay > 0);
            assert_eq!(j.mode, Mode::Employee);
        }
    }

    #[test]
    fn board_is_stable_within_a_slot_and_changes_after() {
        let p = pilot(&["spl", "ppl", "cpl", "me", "ir"]);
        let now = 1_800_000_000;
        let a = board(&input(&p, "LTFM", now));
        let b = board(&input(&p, "LTFM", now + 60));
        assert_eq!(a, b);
        let c = board(&input(&p, "LTFM", now + SLOT_SECS));
        assert_ne!(a.iter().map(|j| &j.id).collect::<Vec<_>>(), c.iter().map(|j| &j.id).collect::<Vec<_>>());
    }

    #[test]
    fn jobs_respect_licenses_runways_and_ranges() {
        let p = pilot(&["spl", "ppl", "cpl", "me", "ir", "atpl", "jet", "narrow"]);
        for icao in ["LTFM", "EGLL", "KSEA", "LTFE"] {
            for j in board(&input(&p, icao, 1_800_000_000)) {
                let c = j.class.unwrap();
                assert!(can_fly(c, &p.licenses), "{icao} {:?}", c);
                let ci = info(c);
                let dest = db().get(&j.to).unwrap();
                assert!(dest.suits(ci), "{icao}→{} {:?}", j.to, c);
                assert!(j.distance_nm <= ci.max_leg_nm as f64 + 0.1);
                assert!(j.deadline_h >= 1.0);
                if j.mode == Mode::Contract {
                    assert!(j.quote.as_ref().unwrap().est_profit > 0);
                }
            }
        }
    }

    #[test]
    fn taken_jobs_disappear() {
        let p = pilot(&["spl", "ppl"]);
        let now = 1_800_000_000;
        let jobs = board(&input(&p, "LTBA", now));
        let taken = vec![jobs[0].id.clone()];
        let mut inp = input(&p, "LTBA", now);
        inp.taken = &taken;
        assert!(!board(&inp).iter().any(|j| j.id == taken[0]));
    }

    #[test]
    fn board_mixes_conditions_by_licence() {
        use crate::career::conditions::{TimeOfDay, WeatherPreset};
        use crate::career::env::FlightCategory;
        // Öğrenci: gerçek saat ya da gündüz, yalnızca görerek uçuş koşulları.
        let p = pilot(&["spl"]);
        for k in 0..30 {
            for j in board(&input(&p, "LTBA", 1_800_000_000 + k * SLOT_SECS)) {
                assert!(matches!(j.conditions.time, TimeOfDay::Now | TimeOfDay::Day), "{:?}", j.conditions);
                assert!(j.conditions.wx.as_ref().is_none_or(|w| w.category == FlightCategory::Vfr));
            }
        }
        // Aletli yetkili havayolu pilotu, kışın Stockholm: gece, alacakaranlık ve kar senaryoları da çıkar.
        let now = 1_799_000_000; // Ocak 2027
        let lic = ["spl", "ppl", "cpl", "me", "ir", "atpl", "jet", "narrow"];
        let mut p = pilot(&lic);
        p.records = crate::career::records::Records::new_pilot(&p.licenses, true, 0, now);
        let (mut times, mut skies, mut live) = (HashSet::new(), HashSet::new(), 0);
        for k in 0..30 {
            for j in board(&input(&p, "ESSA", now + k * SLOT_SECS)) {
                let c = &j.conditions;
                times.insert(c.time);
                skies.insert(c.weather);
                live += usize::from(c.is_live());
                assert_eq!(j.weather, c.wx.as_ref().map(|w| w.category));
                if c.time != TimeOfDay::Now {
                    assert!(c.utc > 0 && (c.utc - now).abs() < 400 * 86400, "{c:?}");
                }
                if c.needs_ir {
                    assert!(!j.ir_required, "yetkili pilota IFR senaryosu engel değil");
                }
            }
        }
        assert!(times.contains(&TimeOfDay::Night) && times.contains(&TimeOfDay::Dusk), "{times:?}");
        assert!(skies.contains(&WeatherPreset::Snow) && skies.contains(&WeatherPreset::Clear), "{skies:?}");
        assert!(live > 0, "canlı işler de kalır");
        // Aletli yeterliliği düşmüş pilota (Normal zorluk) IFR senaryosu çıkmaz.
        let p = pilot(&lic);
        for k in 0..30 {
            for j in board(&input(&p, "ESSA", now + k * SLOT_SECS)) {
                assert!(!j.conditions.needs_ir, "{:?}", j.conditions);
            }
        }
    }

    #[test]
    fn checkride_goes_somewhere_suitable() {
        let dep = db().get("LTBA").unwrap();
        let j = checkride(db(), dep, "ppl", Class::LightPiston, 1_800_000_000, None).unwrap();
        assert_eq!(j.kind, "checkride");
        assert!(j.distance_nm >= 25.0 && j.distance_nm <= 90.0);
        assert_eq!(j.checkride.as_deref(), Some("ppl"));
    }
}
