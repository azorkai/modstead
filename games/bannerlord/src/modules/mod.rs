pub mod sort;
pub mod submodule;
pub mod validate;
pub mod version;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use crate::detect::GameDirs;
use crate::launcher::launcher_data::UserModData;
use sort::ModEntry;
use submodule::{read_module_dir, Location, ModuleInfo};

/// Taranan modüllerin tamamı. Oyun önce `Modules`, sonra Workshop klasörünü okur ve Id'yi
/// küçük harfe çevirerek ilk geleni tutar (ModuleHelper.GetModules ile aynı).
#[derive(Clone, Default)]
pub struct Catalog {
    /// Oyunun gerçekte yükleyeceği kopyalar (tekil Id).
    pub effective: Vec<ModuleInfo>,
    /// Aynı Id'ye sahip, gölgede kalan kopyalar.
    pub shadowed: Vec<ModuleInfo>,
}

impl Catalog {
    pub fn map(&self) -> HashMap<String, &ModuleInfo> {
        self.effective.iter().map(|m| (m.key(), m)).collect()
    }

    pub fn get(&self, id: &str) -> Option<&ModuleInfo> {
        let k = id.to_lowercase();
        self.effective.iter().find(|m| m.key() == k)
    }
}

fn scan_dir(dir: &Path, location: Location, out: &mut Vec<ModuleInfo>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut dirs: Vec<_> = rd
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| {
            let name = p.file_name().unwrap_or_default().to_string_lossy();
            !name.starts_with(".otag-") && !name.starts_with(".modstead-")
        })
        .collect();
    dirs.sort_by_key(|p| p.file_name().unwrap_or_default().to_string_lossy().to_lowercase());
    for d in dirs {
        if let Some(m) = read_module_dir(&d, location) {
            out.push(m);
        }
    }
}

pub fn scan(game: &GameDirs) -> Catalog {
    let mut all = Vec::new();
    scan_dir(Path::new(&game.modules_dir), Location::Modules, &mut all);
    if let Some(w) = &game.workshop_dir {
        scan_dir(Path::new(w), Location::Workshop, &mut all);
    }
    let mut seen = HashSet::new();
    let mut catalog = Catalog::default();
    for m in all.into_iter().filter(|m| m.is_singleplayer()) {
        if seen.insert(m.key()) {
            catalog.effective.push(m);
        } else {
            catalog.shadowed.push(m);
        }
    }
    catalog
}

/// Resmi modüllerin oyundaki varsayılan sırası.
const OFFICIAL_ORDER: &[&str] = &["native", "sandboxcore", "sandbox", "custombattle", "storymode", "birthanddeath"];

/// LauncherData.xml'deki sıradan başlayıp listede olmayan modülleri sona ekler.
pub fn initial_order(catalog: &Catalog, saved: &[UserModData]) -> Vec<ModEntry> {
    let map = catalog.map();
    let mut out: Vec<ModEntry> = Vec::new();
    let mut seen = HashSet::new();
    for s in saved {
        let key = s.id.to_lowercase();
        if let Some(m) = map.get(&key) {
            if seen.insert(key) {
                out.push(ModEntry { id: m.id.clone(), enabled: s.is_selected });
            }
        }
    }
    let mut missing: Vec<&ModuleInfo> = catalog
        .effective
        .iter()
        .filter(|m| !seen.contains(&m.key()))
        .collect();
    missing.sort_by_key(|m| {
        OFFICIAL_ORDER
            .iter()
            .position(|o| *o == m.key())
            .unwrap_or(OFFICIAL_ORDER.len())
    });
    for m in missing {
        let official_on = m.is_official && m.module_type == "Official";
        out.push(ModEntry { id: m.id.clone(), enabled: official_on });
    }
    out
}

/// Arayüzden gelen sırayı katalogla eşler: bilinmeyenleri atar, eksikleri ekler, Id yazımını düzeltir.
pub fn normalize_order(catalog: &Catalog, order: &[ModEntry]) -> Vec<ModEntry> {
    let map = catalog.map();
    let mut seen = HashSet::new();
    let mut out: Vec<ModEntry> = Vec::new();
    for e in order {
        let key = e.id.to_lowercase();
        if let Some(m) = map.get(&key) {
            if seen.insert(key) {
                out.push(ModEntry { id: m.id.clone(), enabled: e.enabled });
            }
        }
    }
    for m in &catalog.effective {
        if seen.insert(m.key()) {
            out.push(ModEntry { id: m.id.clone(), enabled: false });
        }
    }
    out
}
