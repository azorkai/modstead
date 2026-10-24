//! Kütüphaneyi ve simülatörlerin Community klasörlerini tarar, her paketin her simdeki durumunu çıkarır.
//!
//! Model: modlar merkezi bir kütüphane klasöründe durur; bir simde etkinleştirmek, o simin Community
//! klasörüne kütüphanedeki pakete işaret eden bir junction koymaktır. Dosyalar hiç taşınmaz.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use modstead_core::fsx::norm_key;
use modstead_core::prelude::*;
use modstead_core::security::Verdict;
use serde::Serialize;

use crate::package::{PackageInfo, find_package_roots, is_package_dir, read_package};
use crate::sims::{SIM_2020, SIM_2024, SimInstall};
use crate::store::Db;
use crate::util::{is_link, is_within, link_target};

pub use crate::store::ModMeta;

/// Kütüphanenin içindeki çalışma klasörü (karantina). Nokta ile başladığı için taramada atlanır;
/// kütüphaneyle aynı birimde olduğundan kurulumun son adımı bir yeniden adlandırmadır.
pub const WORK_DIR: &str = ".modstead";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimState {
    /// enabled | disabled | physical | foreign | absent
    pub state: String,
    pub container: Option<String>,
    pub link_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModEntry {
    pub id: String,
    pub info: PackageInfo,
    /// library | community | external
    pub source: String,
    pub library_path: Option<PathBuf>,
    pub sims: BTreeMap<String, SimState>,
    pub meta: ModMeta,
    pub issues: Vec<Issue>,
    /// "Bu mod gerçekten yüklenip çalışacak mı?" denetimleri (readiness.rs).
    pub readiness: Vec<crate::readiness::ReadinessCheck>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    /// error | warning | info
    pub level: String,
    pub code: String,
    pub title: String,
    pub detail: String,
    pub sim: Option<String>,
    pub path: Option<PathBuf>,
    pub mod_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total: usize,
    pub library: usize,
    pub unmanaged: usize,
    pub external: usize,
    pub enabled: BTreeMap<String, usize>,
    pub total_size: u64,
    pub by_category: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub mods: Vec<ModEntry>,
    pub sims: Vec<SimInstall>,
    pub issues: Vec<Issue>,
    pub stats: Stats,
    pub library_path: Option<PathBuf>,
    pub library_free: Option<u64>,
    pub scanned_at: String,
}

impl ScanResult {
    /// Hata ve uyarı sayısı (ana sayfa kartı için).
    pub fn problem_count(&self) -> u32 {
        let global = self.issues.iter().filter(|i| i.level != "info").count();
        let per_mod: usize = self.mods.iter().map(|m| m.issues.iter().filter(|i| i.level != "info").count()).sum();
        (global + per_mod) as u32
    }
}

/// Paket okuma önbelleği: manifest/layout değişmediyse yeniden okunmaz.
#[derive(Default)]
pub struct ScanCache {
    entries: HashMap<String, (Option<SystemTime>, Option<SystemTime>, Arc<PackageInfo>)>,
    /// Content.xml / exe.xml ayrıştırma önbelleği.
    pub readiness: crate::readiness::FileCache,
}

impl ScanCache {
    fn get_or_read(&self, pkg: &Path) -> (String, Arc<PackageInfo>, bool) {
        let key = norm_key(pkg);
        let mt = |f: &str| fs::metadata(pkg.join(f)).and_then(|m| m.modified()).ok();
        let (m, l) = (mt("manifest.json"), mt("layout.json"));
        if let Some((cm, cl, info)) = self.entries.get(&key) {
            if *cm == m && *cl == l {
                return (key, info.clone(), false);
            }
        }
        (key, Arc::new(read_package(pkg)), true)
    }

    fn put(&mut self, pkg: &Path, info: Arc<PackageInfo>) {
        let mt = |f: &str| fs::metadata(pkg.join(f)).and_then(|m| m.modified()).ok();
        self.entries.insert(norm_key(pkg), (mt("manifest.json"), mt("layout.json"), info));
    }

    pub fn invalidate(&mut self, pkg: &Path) {
        self.entries.remove(&norm_key(pkg));
    }
}

/// Öğeleri birkaç iş parçacığında işler (sıra korunur). Büyük paketlerde layout.json okumak zaman alır.
pub fn parallel_map<T: Sync, R: Send>(items: &[T], f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    let workers = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(1, 8);
    if items.len() < 4 || workers == 1 {
        return items.iter().map(&f).collect();
    }
    let chunk = items.len().div_ceil(workers);
    std::thread::scope(|scope| {
        let handles: Vec<_> = items.chunks(chunk).map(|part| scope.spawn(|| part.iter().map(&f).collect::<Vec<R>>())).collect();
        handles.into_iter().flat_map(|h| h.join().unwrap_or_default()).collect()
    })
}

/// Kütüphane paketinin kimliği: kütüphaneye göre göreli yol (küçük harf, `/` ayraçlı).
/// Kökteki paket için klasör adıdır; sime özel sürümler `msfs2024/<klasör>` gibi alt klasörde durur.
pub fn library_id(library: &Path, pkg: &Path) -> String {
    pkg.strip_prefix(library)
        .map(|r| r.to_string_lossy().replace('\\', "/").to_lowercase())
        .unwrap_or_else(|_| pkg.file_name().map(|f| f.to_string_lossy().to_lowercase()).unwrap_or_default())
}

pub(crate) fn issue(level: &str, code: &str, title: impl Into<String>, detail: impl Into<String>) -> Issue {
    Issue { level: level.into(), code: code.into(), title: title.into(), detail: detail.into(), sim: None, path: None, mod_id: None }
}

/// Community klasöründeki tek bir girdinin türü.
enum CommunityItem {
    /// Kütüphanedeki pakete giden bizim bağlantımız.
    Managed { link: PathBuf, target: PathBuf },
    /// Başka bir araca ait bağlantı (ör. FSDreamTeam Addon Manager, Addons Linker).
    Foreign { link: PathBuf, target: PathBuf },
    Broken { link: PathBuf, target: Option<PathBuf> },
    Physical { path: PathBuf },
    /// manifest.json içermeyen klasör; içinde paket varsa iç içe kurulum hatası.
    NotPackage { path: PathBuf, nested: Vec<PathBuf> },
}

fn classify_community_entry(path: &Path, library: Option<&Path>) -> Option<CommunityItem> {
    if is_link(path) {
        let target = link_target(path);
        return Some(match target {
            Some(t) if t.is_dir() => {
                if library.map(|lib| is_within(&t, lib)).unwrap_or(false) {
                    CommunityItem::Managed { link: path.to_path_buf(), target: t }
                } else {
                    CommunityItem::Foreign { link: path.to_path_buf(), target: t }
                }
            }
            t => CommunityItem::Broken { link: path.to_path_buf(), target: t },
        });
    }
    if !path.is_dir() {
        return None;
    }
    if is_package_dir(path) {
        return Some(CommunityItem::Physical { path: path.to_path_buf() });
    }
    let nested = find_package_roots(path, 2);
    Some(CommunityItem::NotPackage { path: path.to_path_buf(), nested })
}

/// Resmi (Asobo/Microsoft) paketler bağımlılık olarak eksik sayılmaz.
fn is_official_dependency(name: &str) -> bool {
    ["fs-base", "asobo-", "fs20-", "fs24-", "microsoft-", "fs-devmode", "workingtitle-", "fs-"].iter().any(|p| name.starts_with(p))
}

pub fn scan(sims: Vec<SimInstall>, library: Option<PathBuf>, db: &Db, cache: &mut ScanCache) -> ScanResult {
    let mut issues: Vec<Issue> = Vec::new();

    // 1) Kütüphanedeki paketler (nokta ile başlayan çalışma klasörleri hariç).
    let mut lib_roots: Vec<PathBuf> = Vec::new();
    if let Some(lib) = &library {
        if lib.is_dir() {
            lib_roots = find_package_roots(lib, 3);
        } else {
            issues.push(issue("error", "library-missing", tr!("Kütüphane klasörü bulunamadı", "Library folder not found"), lib.display().to_string()));
        }
    } else {
        issues.push(issue(
            "info",
            "library-unset",
            tr!("Kütüphane klasörü seçilmedi", "No library folder chosen"),
            tr!("Ayarlar'dan bir kütüphane klasörü seçin.", "Choose a library folder in Settings."),
        ));
    }

    // 2) Community klasörleri: aynı klasörü okuyan simleri birleştir.
    let mut dirs: Vec<(PathBuf, Vec<(String, String)>)> = Vec::new(); // yol -> [(simId, etiket)]
    for sim in sims.iter().filter(|s| s.usable()) {
        for (label, dir) in sim.containers() {
            let key = norm_key(&dir);
            if let Some(entry) = dirs.iter_mut().find(|(d, _)| norm_key(d) == key) {
                entry.1.push((sim.id.clone(), label));
            } else {
                dirs.push((dir, vec![(sim.id.clone(), label)]));
            }
        }
        if !sim.community_path.as_ref().map(|c| c.is_dir()).unwrap_or(false) {
            let mut i = issue(
                "warning",
                "community-missing",
                tr!(format!("MSFS {} Community klasörü bulunamadı", sim.short), format!("MSFS {} Community folder not found", sim.short)),
                sim.community_path.as_ref().map(|p| p.display().to_string()).unwrap_or_default(),
            );
            i.sim = Some(sim.id.clone());
            issues.push(i);
        }
    }

    let mut community_items: Vec<(CommunityItem, Vec<(String, String)>)> = Vec::new();
    for (dir, readers) in &dirs {
        let Ok(rd) = fs::read_dir(dir) else { continue };
        for e in rd.flatten() {
            if let Some(item) = classify_community_entry(&e.path(), library.as_deref()) {
                community_items.push((item, readers.clone()));
            }
        }
    }

    // 3) Okunacak tüm paket klasörleri (kütüphane + fiziksel + harici hedefler), paralel ve önbellekli.
    let mut to_read: Vec<PathBuf> = lib_roots.clone();
    for (item, _) in &community_items {
        match item {
            CommunityItem::Physical { path } => to_read.push(path.clone()),
            CommunityItem::Foreign { target, .. } if is_package_dir(target) => to_read.push(target.clone()),
            _ => {}
        }
    }
    let cache_ref: &ScanCache = cache;
    let results = parallel_map(&to_read, |p| {
        let (k, info, fresh) = cache_ref.get_or_read(p);
        (p.clone(), k, info, fresh)
    });
    let mut infos: HashMap<String, Arc<PackageInfo>> = HashMap::new();
    for (p, k, info, fresh) in results {
        if fresh {
            cache.put(&p, info.clone());
        }
        infos.insert(k, info);
    }

    // 4) Mod girdilerini oluştur.
    let all_sim_ids: Vec<String> = sims.iter().filter(|s| s.usable()).map(|s| s.id.clone()).collect();
    let mut mods: BTreeMap<String, ModEntry> = BTreeMap::new();
    // Kütüphane paketinin tam yolu -> kimliği (bağlantı hedeflerini eşlemek için).
    let mut lib_index: HashMap<String, String> = HashMap::new();
    let new_entry = |id: String, info: Arc<PackageInfo>, source: &str, lib_path: Option<PathBuf>, db: &Db| {
        let mut sims_map = BTreeMap::new();
        for s in &all_sim_ids {
            let state = if source == "library" { "disabled" } else { "absent" };
            sims_map.insert(s.clone(), SimState { state: state.into(), container: None, link_path: None });
        }
        ModEntry {
            meta: db.mods.get(&id).cloned().unwrap_or_default(),
            id,
            info: (*info).clone(),
            source: source.into(),
            library_path: lib_path,
            sims: sims_map,
            issues: Vec::new(),
            readiness: Vec::new(),
        }
    };

    for root in &lib_roots {
        if let (Some(info), Some(lib)) = (infos.get(&norm_key(root)), &library) {
            let id = library_id(lib, root);
            lib_index.insert(norm_key(root), id.clone());
            mods.insert(id.clone(), new_entry(id, info.clone(), "library", Some(root.clone()), db));
        }
    }

    for (item, readers) in &community_items {
        match item {
            CommunityItem::Managed { link, target } => {
                let link_name = link.file_name().map(|f| f.to_string_lossy().to_lowercase()).unwrap_or_default();
                let found = lib_index.get(&norm_key(target)).cloned();
                match found.and_then(|id| mods.get_mut(&id)) {
                    Some(m) => {
                        let folder = m.info.folder.to_lowercase();
                        for (sim, label) in readers {
                            m.sims.insert(sim.clone(), SimState { state: "enabled".into(), container: Some(label.clone()), link_path: Some(link.clone()) });
                        }
                        if link_name != folder {
                            m.issues.push(issue(
                                "info",
                                "renamed-link",
                                tr!("Bağlantı adı paket adından farklı", "Link name differs from the package name"),
                                link.display().to_string(),
                            ));
                        }
                    }
                    None => {
                        let mut i = issue(
                            "warning",
                            "orphan-link",
                            tr!("Kütüphanede karşılığı olmayan bağlantı", "Link with no matching library package"),
                            link.display().to_string(),
                        );
                        i.path = Some(link.clone());
                        issues.push(i);
                    }
                }
            }
            CommunityItem::Foreign { link, target } => {
                let Some(info) = infos.get(&norm_key(target)).cloned() else {
                    // Hedef bir paket değilse (ör. bir kapsayıcı klasör) yalnızca bilgi ver.
                    let mut i = issue(
                        "info",
                        "foreign-nonpackage",
                        tr!("Paket olmayan harici bağlantı", "External link that is not a package"),
                        format!("{} → {}", link.display(), target.display()),
                    );
                    i.path = Some(link.clone());
                    issues.push(i);
                    continue;
                };
                let id = link.file_name().map(|f| f.to_string_lossy().to_lowercase()).unwrap_or_default();
                let m = mods.entry(id.clone()).or_insert_with(|| new_entry(id, info.clone(), "external", None, db));
                for (sim, label) in readers {
                    m.sims.insert(sim.clone(), SimState { state: "foreign".into(), container: Some(label.clone()), link_path: Some(link.clone()) });
                }
            }
            CommunityItem::Broken { link, target } => {
                for (sim, _) in readers {
                    let mut i = issue(
                        "error",
                        "broken-link",
                        tr!("Kırık bağlantı (hedef yok)", "Broken link (target missing)"),
                        format!("{} → {}", link.display(), target.as_ref().map(|t| t.display().to_string()).unwrap_or_else(|| "?".into())),
                    );
                    i.sim = Some(sim.clone());
                    i.path = Some(link.clone());
                    issues.push(i);
                }
            }
            CommunityItem::Physical { path } => {
                let Some(info) = infos.get(&norm_key(path)).cloned() else { continue };
                let id = info.folder.to_lowercase();
                if let Some(m) = mods.get_mut(&id) {
                    if m.source == "library" {
                        // Kütüphanede de var, Community'de de fiziksel kopyası var: çift yükleme.
                        let mut i = issue(
                            "warning",
                            "duplicate-physical",
                            tr!("Aynı paket hem kütüphanede hem Community'de", "Same package in both the library and Community"),
                            tr!(
                                format!("{} — Community kopyası kütüphanedekinden önce yüklenebilir.", path.display()),
                                format!("{} — the Community copy may load before the library one.", path.display())
                            ),
                        );
                        i.path = Some(path.clone());
                        m.issues.push(i);
                    }
                    for (sim, label) in readers {
                        m.sims.insert(sim.clone(), SimState { state: "physical".into(), container: Some(label.clone()), link_path: Some(path.clone()) });
                    }
                    continue;
                }
                let mut m = new_entry(id.clone(), info, "community", None, db);
                for (sim, label) in readers {
                    m.sims.insert(sim.clone(), SimState { state: "physical".into(), container: Some(label.clone()), link_path: Some(path.clone()) });
                }
                mods.insert(id, m);
            }
            CommunityItem::NotPackage { path, nested } => {
                let name = path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
                let sim_label = readers.iter().map(|(s, _)| s.as_str()).collect::<Vec<_>>().join(", ");
                let mut i = if nested.is_empty() {
                    issue(
                        "info",
                        "not-package",
                        tr!(format!("“{name}” bir MSFS paketi değil"), format!("“{name}” is not an MSFS package")),
                        tr!(format!("manifest.json yok ({sim_label})"), format!("no manifest.json ({sim_label})")),
                    )
                } else {
                    issue(
                        "error",
                        "nested-package",
                        tr!(format!("“{name}” iç içe kurulmuş — sim bu paketi görmez"), format!("“{name}” is nested — the sim will not see this package")),
                        format!(
                            "{}: {}",
                            tr!("manifest.json bir alt klasörde", "manifest.json is in a subfolder"),
                            nested.iter().map(|n| n.display().to_string()).collect::<Vec<_>>().join(", ")
                        ),
                    )
                };
                i.path = Some(path.clone());
                i.sim = readers.first().map(|(s, _)| s.clone());
                issues.push(i);
            }
        }
    }

    // 5) Mod düzeyinde akıllı kontroller.
    let known: HashSet<String> = mods.values().flat_map(|m| [m.id.clone(), m.info.folder.to_lowercase()]).collect();
    for m in mods.values_mut() {
        if m.info.built_for == "2024" {
            if let Some(s) = m.sims.get(SIM_2020) {
                if matches!(s.state.as_str(), "enabled" | "physical" | "foreign") {
                    let mut i = issue(
                        "error",
                        "built-for-2024-in-2020",
                        tr!("MSFS 2024 için derlenmiş paket 2020'de etkin", "Package built for MSFS 2024 is enabled in 2020"),
                        tr!("Bu paket MSFS 2024 araçlarıyla derlenmiş; 2020'de çökmeye yol açabilir.", "This package was built with the MSFS 2024 tools; it can crash 2020."),
                    );
                    i.sim = Some(SIM_2020.into());
                    m.issues.push(i);
                }
            }
        }
        if !m.info.manifest_ok {
            m.issues.push(issue("error", "bad-manifest", tr!("manifest.json okunamadı", "manifest.json could not be read"), tr!("Paket bozuk olabilir.", "The package may be corrupt.")));
        } else if !m.info.has_layout {
            m.issues.push(issue(
                "warning",
                "no-layout",
                tr!("layout.json yok", "No layout.json"),
                tr!(
                    "Sim paketi eksik yükleyebilir; MSFSLayoutGenerator ile yeniden oluşturulabilir.",
                    "The sim may load the package incompletely; it can be regenerated with MSFSLayoutGenerator."
                ),
            ));
        }
        let missing: Vec<String> = m
            .info
            .dependencies
            .iter()
            .filter(|d| {
                let n = d.name.to_lowercase();
                !is_official_dependency(&n) && !known.contains(&n)
            })
            .map(|d| d.name.clone())
            .collect();
        if !missing.is_empty() {
            m.issues.push(issue("warning", "missing-dependency", tr!("Eksik bağımlılık", "Missing dependency"), missing.join(", ")));
        }
        if let Some(rep) = &m.meta.report {
            if rep.verdict == Verdict::Danger {
                m.issues.push(issue(
                    "error",
                    "security-danger",
                    tr!("Güvenlik taraması: tehlikeli", "Security scan: dangerous"),
                    tr!("Ayrıntılar için güvenlik raporuna bakın.", "See the security report for details."),
                ));
            }
        }
        let mod_id = m.id.clone();
        for i in m.issues.iter_mut() {
            i.mod_id.get_or_insert(mod_id.clone());
        }
    }

    // 6) Hazırlık: sim paketi tanıyor mu, yardımcı programları başlatılıyor mu, yollar sınırda mı?
    // Content.xml ve exe.xml tarama başına bir kez (değişmediyse önbellekten) okunur.
    let mut ctxs = crate::readiness::contexts(&sims, &mut cache.readiness);
    crate::readiness::fill_active(&mut ctxs, mods.values());
    for m in mods.values_mut() {
        m.readiness = crate::readiness::evaluate(m, &ctxs);
        crate::readiness::promote_errors(m);
    }

    for s in sims.iter().filter(|s| s.running) {
        let mut i = issue(
            "info",
            "sim-running",
            tr!(format!("MSFS {} çalışıyor", s.short), format!("MSFS {} is running", s.short)),
            tr!(
                "Sim açıkken o simdeki mod değişiklikleri kilitlidir; değişiklikler bir sonraki açılışta geçerli olur.",
                "Mod changes for this sim are locked while it runs; changes apply on the next launch."
            ),
        );
        i.sim = Some(s.id.clone());
        issues.push(i);
    }

    let mut mods: Vec<ModEntry> = mods.into_values().collect();
    mods.sort_by(|a, b| a.info.title.to_lowercase().cmp(&b.info.title.to_lowercase()));

    let mut stats = Stats { total: mods.len(), ..Default::default() };
    for m in &mods {
        match m.source.as_str() {
            "library" => stats.library += 1,
            "community" => stats.unmanaged += 1,
            _ => stats.external += 1,
        }
        stats.total_size += m.info.size;
        *stats.by_category.entry(m.info.category.clone()).or_default() += 1;
        for (sim, st) in &m.sims {
            if matches!(st.state.as_str(), "enabled" | "physical" | "foreign") {
                *stats.enabled.entry(sim.clone()).or_default() += 1;
            }
        }
    }
    for s in [SIM_2020, SIM_2024] {
        stats.enabled.entry(s.into()).or_default();
    }

    let library_free = library.as_deref().and_then(modstead_core::platform::disk_free);
    if let Some(free) = library_free {
        if free < 10 * 1024 * 1024 * 1024 {
            issues.push(issue(
                "warning",
                "low-disk",
                tr!("Kütüphane diskinde az yer kaldı", "Library disk is running low on space"),
                tr!(
                    format!("{} boş. Büyük modlar indirilirken karantina için ek alan gerekir.", crate::util::gb(free)),
                    format!("{} free. Large mods need extra room in quarantine while downloading.", crate::util::gb(free))
                ),
            ));
        }
    }

    ScanResult { mods, sims, issues, stats, library_free, library_path: library, scanned_at: crate::store::now_iso() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parallel_map_keeps_order() {
        let items: Vec<u32> = (0..103).collect();
        assert_eq!(parallel_map(&items, |x| x * 2), items.iter().map(|x| x * 2).collect::<Vec<_>>());
        assert!(parallel_map(&Vec::<u32>::new(), |x| *x).is_empty());
    }

    /// Bu makinedeki gerçek sim klasörlerini SALT OKUNUR tarar:
    /// `cargo test -p game-msfs real_scan -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_scan() {
        let settings = crate::migrate::read_hangar_settings().unwrap_or_default();
        let sims = crate::sims::detect_sims(&settings);
        for s in &sims {
            println!(
                "{} {} detected={} running={} community={:?} c2024={:?} shares={}",
                s.id, s.edition, s.detected, s.running, s.community_path, s.community2024_path, s.shares_packages
            );
        }
        let mut cache = ScanCache::default();
        let t = std::time::Instant::now();
        let r = scan(sims, settings.library_path.clone(), &Db::default(), &mut cache);
        println!("tarama {:?}, {} mod", t.elapsed(), r.mods.len());
        for m in &r.mods {
            let states: Vec<String> = m.sims.iter().map(|(k, v)| format!("{k}={}", v.state)).collect();
            println!(
                "- [{}] {} | {} | v{} | {} | built={} | {} MB | thumb={} | {:?} | issues={:?}",
                m.source,
                m.info.folder,
                m.info.title,
                m.info.version,
                m.info.category,
                m.info.built_for,
                m.info.size / 1_048_576,
                m.info.thumbnail.is_some(),
                states,
                m.issues.iter().map(|i| i.code.clone()).collect::<Vec<_>>()
            );
        }
        for i in &r.issues {
            println!("! {} {} — {}", i.code, i.title, i.detail);
        }
        println!("{} çakışma", crate::conflicts::compute(&r).len());
        for e in crate::exexml::read(&r.sims) {
            println!("exe.xml {} {} {} exists={}", e.sim, e.name, e.path, e.exists);
        }
    }
}
