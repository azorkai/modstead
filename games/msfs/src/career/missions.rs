//! Hava işleri (görevler): uygulamanın simden okunan konum, irtifa ve hızla kendi başına denetleyebildiği,
//! hedef noktaları olan işler. Ticari lisansla açılır.
//!
//! | Tür | Hedef | Koşul |
//! |---|---|---|
//! | `tour` (panoramik tur) | 1–2 şehrin üstü | 1,5 nm içinde, yerden 3.000 ft'in altında |
//! | `skydive` (paraşüt atlayışı) | kalkış meydanı üstü | 3 nm içinde, yerden 10.000 ft'in üstünde, ≤ 95 kt, 20 sn |
//! | `survey` (hava fotoğrafı ve ölçme) | 3 nokta, aynı irtifa | 1 nm içinde, hedef irtifa ± 300 ft, ≤ 140 kt |
//! | `sar` (arama ve kurtarma) | son bilinen konum | 3 nm içinde, yerden 2.000 ft'in altında, 3 dakika |
//!
//! Ücret yapılan hedeflerle orantılıdır (hedeflerin bir kısmı yapılırsa kısmi ücret). Turlar kısa tutulur:
//! hafif uçakla binlerce millik "tur" kullanıcıların en çok şikâyet ettiği tuhaflıklardandı.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::aircraft::{Class, info};
use super::airports::{Airport, AirportDb, Size, Surface, distance_nm, offset};
use super::jobs::Rng;

pub const KINDS: [&str; 4] = ["tour", "skydive", "survey", "sar"];

pub fn is_mission(kind: &str) -> bool {
    KINDS.contains(&kind)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Objective {
    /// "overfly" | "drop" | "line" | "search"
    pub kind: String,
    /// Şehir adı ya da "DZ", "P1"…
    pub name: String,
    pub lat: f64,
    pub lon: f64,
    pub radius_nm: f64,
    /// İrtifa bandı (ft); `agl` ise yerden yükseklik, değilse deniz seviyesinden.
    pub min_ft: Option<f64>,
    pub max_ft: Option<f64>,
    pub agl: bool,
    pub max_kt: Option<f64>,
    /// Koşullar bu kadar sürmeli (sim sn); 0 = bir kez yeter.
    pub hold_s: f64,
}

impl Objective {
    /// Telemetri bu hedefin koşullarını sağlıyor mu?
    pub fn satisfied(&self, lat: f64, lon: f64, alt_ft: f64, agl_ft: f64, ias_kt: f64) -> bool {
        if distance_nm(lat, lon, self.lat, self.lon) > self.radius_nm {
            return false;
        }
        let h = if self.agl { agl_ft } else { alt_ft };
        self.min_ft.is_none_or(|m| h >= m) && self.max_ft.is_none_or(|m| h <= m) && self.max_kt.is_none_or(|m| ias_kt <= m)
    }
}

/// Uygun sınıflar.
pub fn classes(kind: &str) -> &'static [Class] {
    use Class::*;
    match kind {
        "tour" => &[LightPiston, Helicopter, TurbopropSingle],
        "skydive" => &[LightPiston, TurbopropSingle],
        "survey" => &[LightPiston, PistonTwin, TurbopropSingle, TurbopropTwin],
        "sar" => &[Helicopter, TurbopropSingle, TurbopropTwin],
        _ => &[],
    }
}

/// Üretilen görev: hedefler, varış ve toplam rota (nm).
pub struct Mission {
    pub objectives: Vec<Objective>,
    pub to: Airport,
    pub route_nm: f64,
}

/// Bir görevi kalkış havalimanının çevresinde üretir. Simde olmayan havalimanları atlanır.
pub fn generate(kind: &str, dep: &Airport, db: &AirportDb, class: Class, sim: Option<&HashSet<String>>, rng: &mut Rng) -> Option<Mission> {
    let ci = info(class);
    let in_sim = |a: &Airport| sim.is_none_or(|s| s.contains(&a.icao));
    match kind {
        "tour" => {
            // Çevredeki (10–35 nm) farklı şehirlerden 1–2 tanesi; tur kalkışa döner.
            let mut cities: Vec<(&Airport, f64)> = db
                .within(dep.lat, dep.lon, 35.0)
                .into_iter()
                .filter(|(a, d)| *d >= 10.0 && !a.city.is_empty() && a.city != dep.city)
                .collect();
            cities.dedup_by(|a, b| a.0.city == b.0.city);
            if cities.is_empty() {
                return None;
            }
            let n = if cities.len() > 1 && rng.f() < 0.5 { 2 } else { 1 };
            let mut picks: Vec<(&Airport, f64)> = Vec::new();
            for _ in 0..n * 3 {
                if picks.len() >= n {
                    break;
                }
                if let Some(c) = rng.pick(&cities) {
                    if !picks.iter().any(|p| p.0.city == c.0.city) {
                        picks.push(*c);
                    }
                }
            }
            let mut route = 0.0;
            let mut prev = (dep.lat, dep.lon);
            let objectives: Vec<Objective> = picks
                .iter()
                .map(|(a, _)| {
                    route += distance_nm(prev.0, prev.1, a.lat, a.lon);
                    prev = (a.lat, a.lon);
                    Objective { kind: "overfly".into(), name: a.city.clone(), lat: a.lat, lon: a.lon, radius_nm: 1.5, max_ft: Some(3000.0), agl: true, ..Default::default() }
                })
                .collect();
            route += distance_nm(prev.0, prev.1, dep.lat, dep.lon);
            Some(Mission { objectives, to: dep.clone(), route_nm: route })
        }
        "skydive" => {
            // Atlayış bölgesi kalkış meydanının üstü; 10.000 ft (yerden) çıkış, atlayış koşusunda yavaş.
            let o = Objective {
                kind: "drop".into(),
                name: "DZ".into(),
                lat: dep.lat,
                lon: dep.lon,
                radius_nm: 3.0,
                min_ft: Some(10_000.0),
                agl: true,
                max_kt: Some(95.0),
                hold_s: 20.0,
                ..Default::default()
            };
            let climb_nm = if class == Class::TurbopropSingle { 30.0 } else { 45.0 };
            Some(Mission { objectives: vec![o], to: dep.clone(), route_nm: climb_nm })
        }
        "survey" => {
            // Bir hat üstünde 5 nm aralıklı 3 nokta, kalkıştan 12–30 nm ötede; sabit irtifa.
            let brg = rng.range(0.0, 360.0).to_radians();
            let dist = rng.range(12.0, 30.0) * 1852.0;
            let (slat, slon) = offset(dep.lat, dep.lon, dist * brg.sin(), dist * brg.cos());
            let line = rng.range(0.0, 360.0).to_radians();
            let alt = ((dep.elevation_ft as f64 + 3500.0) / 500.0).round() * 500.0;
            let max_kt = if matches!(class, Class::TurbopropTwin) { 170.0 } else { 140.0 };
            let objectives: Vec<Objective> = (0..3)
                .map(|i| {
                    let m = i as f64 * 5.0 * 1852.0;
                    let (lat, lon) = offset(slat, slon, m * line.sin(), m * line.cos());
                    Objective { kind: "line".into(), name: format!("P{}", i + 1), lat, lon, radius_nm: 1.0, min_ft: Some(alt - 300.0), max_ft: Some(alt + 300.0), max_kt: Some(max_kt), ..Default::default() }
                })
                .collect();
            let first = &objectives[0];
            let last = &objectives[2];
            let route = distance_nm(dep.lat, dep.lon, first.lat, first.lon) + 10.0 + distance_nm(last.lat, last.lon, dep.lat, dep.lon);
            Some(Mission { objectives, to: dep.clone(), route_nm: route })
        }
        "sar" => {
            // Son bilinen konum 15–50 nm ötede; bulunan kişi en yakın orta/büyük havalimanına (hastaneye yakın) götürülür.
            let brg = rng.range(0.0, 360.0).to_radians();
            let dist = rng.range(15.0, 50.0) * 1852.0;
            let (lat, lon) = offset(dep.lat, dep.lon, dist * brg.sin(), dist * brg.cos());
            let to = db
                .within(lat, lon, 80.0)
                .into_iter()
                .filter(|(a, _)| matches!(a.size, Size::Medium | Size::Large) && a.suits(ci) && a.surface != Surface::Water && in_sim(a))
                .map(|(a, _)| a.clone())
                .next()
                .unwrap_or_else(|| dep.clone());
            let o = Objective { kind: "search".into(), name: "LKP".into(), lat, lon, radius_nm: 3.0, max_ft: Some(2000.0), agl: true, hold_s: 180.0, ..Default::default() };
            let route = distance_nm(dep.lat, dep.lon, lat, lon) + 8.0 + distance_nm(lat, lon, to.lat, to.lon);
            Some(Mission { objectives: vec![o], to, route_nm: route })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::airports::db;

    #[test]
    fn generates_every_kind_near_istanbul() {
        let dep = db().get("LTBA").unwrap();
        for (k, kind) in KINDS.iter().enumerate() {
            let class = classes(kind)[0];
            let mut rng = Rng::new(42 + k as u64);
            let m = generate(kind, dep, db(), class, None, &mut rng).unwrap_or_else(|| panic!("{kind}"));
            assert!(!m.objectives.is_empty(), "{kind}");
            assert!(m.route_nm > 5.0 && m.route_nm < 160.0, "{kind} {}", m.route_nm);
            for o in &m.objectives {
                assert!(distance_nm(dep.lat, dep.lon, o.lat, o.lon) < 60.0, "{kind} {o:?}");
            }
            if *kind != "sar" {
                assert_eq!(m.to.icao, "LTBA", "{kind} kalkışa döner");
            }
        }
    }

    #[test]
    fn objective_conditions() {
        let o = Objective { kind: "drop".into(), lat: 41.0, lon: 29.0, radius_nm: 3.0, min_ft: Some(10_000.0), agl: true, max_kt: Some(95.0), hold_s: 20.0, ..Default::default() };
        assert!(o.satisfied(41.01, 29.0, 10_500.0, 10_400.0, 90.0));
        assert!(!o.satisfied(41.01, 29.0, 10_500.0, 9_000.0, 90.0), "alçak");
        assert!(!o.satisfied(41.01, 29.0, 10_500.0, 10_400.0, 120.0), "hızlı");
        assert!(!o.satisfied(41.2, 29.0, 10_500.0, 10_400.0, 90.0), "uzak");
        let s = Objective { lat: 41.0, lon: 29.0, radius_nm: 1.0, min_ft: Some(3_200.0), max_ft: Some(3_800.0), ..Default::default() };
        assert!(s.satisfied(41.0, 29.0, 3_500.0, 3_000.0, 200.0), "MSL bandı; hız sınırı yok");
        assert!(!s.satisfied(41.0, 29.0, 4_000.0, 3_000.0, 100.0));
    }
}
