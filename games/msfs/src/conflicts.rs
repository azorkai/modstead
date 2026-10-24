//! Aynı simde etkin paketler arasındaki çakışmalar.
//!
//! - Dosya çakışması: iki paket sanal dosya sisteminde aynı göreli yolu sağlıyorsa biri diğerini ezer.
//! - Havalimanı çakışması: aynı ICAO için birden fazla sahne etkinse hangisinin görüneceği belirsizdir.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::scanner::{ModEntry, ScanResult};
use crate::package::fnv1a;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    pub sim: String,
    /// files | airport
    pub kind: String,
    pub a_id: String,
    pub a_title: String,
    pub b_id: String,
    pub b_title: String,
    pub shared: usize,
    pub samples: Vec<String>,
    pub icao: Option<String>,
}

fn active_in(m: &ModEntry, sim: &str) -> bool {
    m.sims.get(sim).map(|s| matches!(s.state.as_str(), "enabled" | "physical" | "foreign")).unwrap_or(false)
}

pub fn compute(scan: &ScanResult) -> Vec<Conflict> {
    let mut out = Vec::new();
    for sim in scan.sims.iter().filter(|s| s.usable()) {
        let active: Vec<&ModEntry> = scan.mods.iter().filter(|m| active_in(m, &sim.id)).collect();

        // Dosya çakışmaları
        let mut owners: HashMap<u64, Vec<u32>> = HashMap::new();
        for (i, m) in active.iter().enumerate() {
            for h in m.info.layout_hashes.iter() {
                owners.entry(*h).or_default().push(i as u32);
            }
        }
        let mut pairs: HashMap<(u32, u32), Vec<u64>> = HashMap::new();
        for (h, o) in owners.iter().filter(|(_, o)| o.len() > 1) {
            // Çok sayıda paketin paylaştığı yollar için çift sayısını sınırla.
            for a in 0..o.len().min(8) {
                for b in (a + 1)..o.len().min(8) {
                    pairs.entry((o[a], o[b])).or_default().push(*h);
                }
            }
        }
        for ((a, b), hashes) in pairs {
            let (ma, mb) = (active[a as usize], active[b as usize]);
            let set: HashSet<u64> = hashes.iter().copied().collect();
            let samples = crate::package::read_layout(&ma.info.path)
                .map(|l| l.paths.into_iter().filter(|p| set.contains(&fnv1a(p))).take(6).collect())
                .unwrap_or_default();
            out.push(Conflict {
                sim: sim.id.clone(),
                kind: "files".into(),
                a_id: ma.id.clone(),
                a_title: ma.info.title.clone(),
                b_id: mb.id.clone(),
                b_title: mb.info.title.clone(),
                shared: hashes.len(),
                samples,
                icao: None,
            });
        }

        // Havalimanı çakışmaları
        let mut by_icao: HashMap<&str, Vec<&ModEntry>> = HashMap::new();
        for m in active.iter().filter(|m| m.info.category == "airport") {
            for icao in &m.info.icaos {
                by_icao.entry(icao.as_str()).or_default().push(m);
            }
        }
        for (icao, ms) in by_icao.into_iter().filter(|(_, v)| v.len() > 1) {
            for i in 0..ms.len() {
                for j in (i + 1)..ms.len() {
                    out.push(Conflict {
                        sim: sim.id.clone(),
                        kind: "airport".into(),
                        a_id: ms[i].id.clone(),
                        a_title: ms[i].info.title.clone(),
                        b_id: ms[j].id.clone(),
                        b_title: ms[j].info.title.clone(),
                        shared: 0,
                        samples: Vec::new(),
                        icao: Some(icao.to_string()),
                    });
                }
            }
        }
    }
    out.sort_by(|a, b| b.shared.cmp(&a.shared).then(a.a_title.cmp(&b.a_title)));
    out
}
