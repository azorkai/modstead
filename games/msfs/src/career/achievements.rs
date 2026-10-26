//! Başarımlar: kariyer verisinden hesaplanır (ayrıca saklanmaz). Ad ve açıklamalar arayüz sözlüğündedir.

use std::collections::HashSet;

use serde::Serialize;

use super::airports::db;
use super::model::{CareerData, LogEntry};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: &'static str,
    /// "flying" | "skill" | "career" | "world"
    pub group: &'static str,
    pub progress: f64,
    pub target: f64,
    pub done: bool,
}

fn ok(e: &LogEntry) -> bool {
    matches!(e.result.as_str(), "completed" | "late" | "partial")
}

pub fn list(d: &CareerData, log: &[LogEntry]) -> Vec<Achievement> {
    let Some(p) = &d.pilot else { return Vec::new() };
    let s = &p.stats;
    let done_kind = |k: &str| log.iter().filter(|e| e.job.kind == k && ok(e)).count() as f64;
    let countries: HashSet<String> = log.iter().filter(|e| ok(e)).filter_map(|e| db().get(&e.arrived).map(|a| a.country.clone())).collect();
    let max_cross = log.iter().filter(|e| ok(e)).filter_map(|e| e.landing.as_ref().map(|l| l.crosswind_kt)).fold(0.0, f64::max);
    let perfect = log.iter().filter(|e| ok(e) && e.summary.score == 100).count() as f64;
    let longest = log.iter().filter(|e| ok(e)).map(|e| e.job.distance_nm).fold(0.0, f64::max);
    let has = |id: &str| if p.has(id) { 1.0 } else { 0.0 };
    let rows: Vec<(&'static str, &'static str, f64, f64)> = vec![
        ("first_flight", "flying", s.flights as f64, 1.0),
        ("landings_100", "flying", s.landings as f64, 100.0),
        ("landings_500", "flying", s.landings as f64, 500.0),
        ("hours_10", "flying", s.hours, 10.0),
        ("hours_100", "flying", s.hours, 100.0),
        ("hours_1000", "flying", s.hours, 1000.0),
        ("distance_10k", "flying", s.distance_nm, 10_000.0),
        ("long_haul", "flying", longest, 3000.0),
        ("butter_10", "skill", s.butter_landings as f64, 10.0),
        ("perfect", "skill", perfect, 1.0),
        ("stable_50", "skill", s.stable_approaches as f64, 50.0),
        ("night_25", "skill", s.night_landings as f64, 25.0),
        ("ifr_50", "skill", s.instrument_hours, 50.0),
        ("crosswind", "skill", max_cross, 20.0),
        ("ppl", "career", has("ppl"), 1.0),
        ("cpl", "career", has("cpl"), 1.0),
        ("atpl", "career", has("atpl"), 1.0),
        ("widebody", "career", has("wide"), 1.0),
        ("fleet_5", "career", d.fleet.len() as f64, 5.0),
        ("millionaire", "career", s.earned as f64, 1_000_000.0),
        ("tours", "world", done_kind("tour"), 5.0),
        ("skydive", "world", done_kind("skydive"), 5.0),
        ("rescue", "world", done_kind("sar"), 3.0),
        ("countries_10", "world", countries.len() as f64, 10.0),
    ];
    rows.into_iter()
        .map(|(id, group, progress, target)| Achievement { id, group, progress: (progress * 10.0).round() / 10.0, target, done: progress >= target })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::career::model::{Job, Pilot, Stats};

    #[test]
    fn achievements_follow_the_data() {
        let mut d = CareerData { pilot: Some(Pilot { licenses: vec!["spl".into(), "ppl".into()], stats: Stats { flights: 3, landings: 120, hours: 12.0, ..Default::default() }, ..Default::default() }), ..Default::default() };
        let e = |kind: &str, to: &str| LogEntry { result: "completed".into(), arrived: to.into(), job: Job { kind: kind.into(), ..Default::default() }, ..Default::default() };
        let log = vec![e("tour", "LTBA"), e("cargo", "EGLL"), e("cargo", "KSEA")];
        let a = list(&d, &log);
        let get = |id: &str| a.iter().find(|x| x.id == id).unwrap().clone();
        assert!(get("first_flight").done && get("landings_100").done && get("hours_10").done && get("ppl").done);
        assert!(!get("cpl").done && !get("hours_100").done);
        assert_eq!(get("tours").progress, 1.0);
        assert_eq!(get("countries_10").progress, 3.0);
        d.pilot = None;
        assert!(list(&d, &log).is_empty());
    }
}
