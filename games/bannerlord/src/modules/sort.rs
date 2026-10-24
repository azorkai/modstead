//! Yükleme sırası: bağımlılık kısıtlarına uyan, kullanıcının mevcut sırasına en yakın topolojik sıra.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};

use serde::{Deserialize, Serialize};

use super::submodule::{DepKind, DepOrder, ModuleInfo};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    pub id: String,
    pub enabled: bool,
}

pub struct SortOutcome {
    pub order: Vec<ModEntry>,
    pub changed: bool,
    /// Döngüye giren modüller (sıralanamadı, mevcut yerlerinde bırakıldı).
    pub cycle: Vec<String>,
}

/// Kahn algoritması; hazır düğümler arasından her zaman mevcut sırada en önde olanı seçer.
/// Kısıtlar yalnızca etkin modüller arasında uygulanır; kapalı modüller yerinde kalır.
pub fn sort(order: &[ModEntry], modules: &HashMap<String, &ModuleInfo>) -> SortOutcome {
    let n = order.len();
    let index_of: HashMap<String, usize> = order
        .iter()
        .enumerate()
        .map(|(i, e)| (e.id.to_lowercase(), i))
        .collect();

    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    let mut indeg = vec![0usize; n];
    {
        let mut add_edge = |a: usize, b: usize| {
            if a != b && !adj[a].contains(&b) {
                adj[a].push(b);
                indeg[b] += 1;
            }
        };
        for (i, entry) in order.iter().enumerate() {
            if !entry.enabled {
                continue;
            }
            let Some(m) = modules.get(&entry.id.to_lowercase()) else { continue };
            for d in &m.deps {
                if d.kind == DepKind::Incompatible {
                    continue;
                }
                let Some(&j) = index_of.get(&d.id.to_lowercase()) else { continue };
                if !order[j].enabled {
                    continue;
                }
                match d.order {
                    DepOrder::Before => add_edge(j, i),
                    DepOrder::After => add_edge(i, j),
                    DepOrder::Any => {}
                }
            }
        }
    }

    let mut heap: BinaryHeap<Reverse<usize>> =
        (0..n).filter(|&i| indeg[i] == 0).map(Reverse).collect();
    let mut placed = vec![false; n];
    let mut result: Vec<usize> = Vec::with_capacity(n);
    while let Some(Reverse(i)) = heap.pop() {
        placed[i] = true;
        result.push(i);
        for &j in &adj[i] {
            indeg[j] -= 1;
            if indeg[j] == 0 {
                heap.push(Reverse(j));
            }
        }
    }

    let mut cycle = Vec::new();
    if result.len() < n {
        for i in 0..n {
            if !placed[i] {
                cycle.push(order[i].id.clone());
                result.push(i);
            }
        }
    }

    let new_order: Vec<ModEntry> = result.iter().map(|&i| order[i].clone()).collect();
    let changed = new_order != order;
    SortOutcome { order: new_order, changed, cycle }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::submodule::{DepRef, Location};

    fn module(id: &str, deps: Vec<DepRef>) -> ModuleInfo {
        ModuleInfo {
            id: id.into(),
            name: id.into(),
            version: "v1.0.0".into(),
            folder: id.into(),
            path: String::new(),
            location: Location::Modules,
            workshop_id: None,
            is_official: false,
            module_type: "Community".into(),
            category: "Singleplayer".into(),
            deps,
            sub_modules: vec![],
            url: None,
            update_sources: vec![],
            dlls: vec![],
            parse_error: None,
            modified: 0,
        }
    }

    fn dep(id: &str, order: DepOrder) -> DepRef {
        DepRef { id: id.into(), kind: DepKind::Required, order, version: None }
    }

    fn e(id: &str) -> ModEntry {
        ModEntry { id: id.into(), enabled: true }
    }

    #[test]
    fn harmony_moves_before_native_and_dependents_follow() {
        let mods = vec![
            module("Native", vec![]),
            module("SandBoxCore", vec![dep("Native", DepOrder::Before)]),
            module("MyMod", vec![dep("Bannerlord.Harmony", DepOrder::Before)]),
            module("Bannerlord.Harmony", vec![dep("Native", DepOrder::After)]),
        ];
        let map: HashMap<String, &ModuleInfo> = mods.iter().map(|m| (m.key(), m)).collect();
        let order = vec![e("Native"), e("SandBoxCore"), e("MyMod"), e("Bannerlord.Harmony")];
        let out = sort(&order, &map);
        let ids: Vec<&str> = out.order.iter().map(|x| x.id.as_str()).collect();
        assert_eq!(ids, vec!["Bannerlord.Harmony", "Native", "SandBoxCore", "MyMod"]);
        assert!(out.changed);
        assert!(out.cycle.is_empty());
    }

    #[test]
    fn keeps_valid_order_unchanged() {
        let mods = vec![module("A", vec![]), module("B", vec![dep("A", DepOrder::Before)])];
        let map: HashMap<String, &ModuleInfo> = mods.iter().map(|m| (m.key(), m)).collect();
        let order = vec![e("A"), e("B")];
        let out = sort(&order, &map);
        assert!(!out.changed);
    }

    #[test]
    fn reports_cycles() {
        let mods = vec![
            module("A", vec![dep("B", DepOrder::Before)]),
            module("B", vec![dep("A", DepOrder::Before)]),
        ];
        let map: HashMap<String, &ModuleInfo> = mods.iter().map(|m| (m.key(), m)).collect();
        let out = sort(&[e("A"), e("B")], &map);
        assert_eq!(out.cycle.len(), 2);
    }

    #[test]
    fn disabled_modules_do_not_constrain() {
        let mods = vec![module("A", vec![dep("B", DepOrder::Before)]), module("B", vec![])];
        let map: HashMap<String, &ModuleInfo> = mods.iter().map(|m| (m.key(), m)).collect();
        let order = vec![e("A"), ModEntry { id: "B".into(), enabled: false }];
        assert!(!sort(&order, &map).changed);
    }
}
