//! Açılan arşivi inceler: hangi modüller var, nereye kurulacak, mevcut kurulumun yerine mi geçecek,
//! hangi DLL'ler geliyor ve eksik bağımlılık var mı.

use std::path::{Path, PathBuf};

use modstead_core::download::sha256_file;
use modstead_core::{fsx, tr};
use serde::Serialize;

use crate::modules::Catalog;
use crate::modules::submodule::{DepKind, Location, read_module_dir};
use crate::modules::version::AppVersion;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DllFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Existing {
    pub version: String,
    pub location: Location,
    pub path: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlannedModule {
    pub id: String,
    pub name: String,
    pub version: String,
    pub folder: String,
    /// Açılan klasöre göre modül kökü.
    pub rel_root: String,
    pub files: u64,
    pub size: u64,
    pub dlls: Vec<DllFile>,
    pub existing: Option<Existing>,
    /// "install" | "update" | "downgrade" | "reinstall"
    pub action: String,
    pub missing_deps: Vec<String>,
    /// Kurulmasına izin verilmeme nedeni.
    pub blocked: Option<String>,
}

const MAX_DEPTH: usize = 6;

/// `SubModule.xml` içeren klasörleri bulur; iç içe olanlarda en dıştakini alır.
fn find_module_roots(base: &Path) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = walkdir::WalkDir::new(base)
        .follow_links(false)
        .max_depth(MAX_DEPTH)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file() && e.file_name().to_string_lossy().eq_ignore_ascii_case("SubModule.xml"))
        .filter_map(|e| e.path().parent().map(|p| p.to_path_buf()))
        .filter(|p| !p.components().any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case("__MACOSX")))
        .collect();
    roots.sort_by_key(|p| p.components().count());
    let mut out: Vec<PathBuf> = Vec::new();
    for r in roots {
        if !out.iter().any(|o| r.starts_with(o)) {
            out.push(r);
        }
    }
    out
}

const OFFICIAL_IDS: &[&str] = &["native", "sandboxcore", "sandbox", "custombattle", "storymode", "birthanddeath", "multiplayer"];

pub fn analyze(extract_dir: &Path, catalog: &Catalog) -> (Vec<PlannedModule>, Vec<String>) {
    let mut notes = Vec::new();
    let roots = find_module_roots(extract_dir);
    if roots.is_empty() {
        let has_game_bin = extract_dir.join("bin").join("Win64_Shipping_Client").is_dir();
        notes.push(if has_game_bin {
            tr!(
                "Bu arşiv oyun klasörüne kurulan bir araç (ör. BLSE) gibi görünüyor. Modstead yalnızca Modules altına modül kurar.",
                "This archive looks like a tool installed into the game folder (e.g. BLSE). Modstead only installs modules under Modules."
            )
            .into()
        } else {
            tr!(
                "Arşivde Bannerlord modülü (SubModule.xml) bulunamadı.",
                "No Bannerlord module (SubModule.xml) found in the archive."
            )
            .into()
        });
        return (Vec::new(), notes);
    }

    let mut planned: Vec<PlannedModule> = Vec::new();
    for root in &roots {
        let Some(info) = read_module_dir(root, Location::Modules) else { continue };
        let rel_root = root
            .strip_prefix(extract_dir)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let folder = if root == extract_dir {
            fsx::sanitize_name(&info.id)
        } else {
            fsx::sanitize_name(&root.file_name().unwrap_or_default().to_string_lossy())
        };
        let (size, files) = fsx::dir_stats(root);
        let mut dlls: Vec<DllFile> = walkdir::WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                let n = e.file_name().to_string_lossy().to_ascii_lowercase();
                n.ends_with(".dll") || n.ends_with(".exe")
            })
            .take(400)
            .map(|e| DllFile {
                path: e.path().strip_prefix(root).unwrap_or(e.path()).to_string_lossy().replace('\\', "/"),
                size: e.metadata().map(|m| m.len()).unwrap_or(0),
                sha256: sha256_file(e.path()).unwrap_or_default(),
            })
            .collect();
        dlls.sort_by(|a, b| a.path.cmp(&b.path));

        let existing = catalog.get(&info.id).map(|m| Existing {
            version: m.version.clone(),
            location: m.location,
            path: m.path.clone(),
        });
        let action = match &existing {
            None => "install",
            Some(e) => match (AppVersion::parse(&info.version), AppVersion::parse(&e.version)) {
                (Some(a), Some(b)) => match a.cmp_numbers(&b) {
                    std::cmp::Ordering::Greater => "update",
                    std::cmp::Ordering::Less => "downgrade",
                    std::cmp::Ordering::Equal => "reinstall",
                },
                _ => "reinstall",
            },
        }
        .to_string();

        let mut blocked = None;
        if let Some(err) = &info.parse_error {
            blocked = Some(err.clone());
        } else if OFFICIAL_IDS.contains(&info.id.to_lowercase().as_str()) || info.is_official {
            blocked = Some(tr!("Resmi oyun modüllerinin üzerine yazılamaz.", "Official game modules cannot be overwritten.").into());
        } else if planned.iter().any(|p| p.id.eq_ignore_ascii_case(&info.id)) {
            blocked = Some(tr!("Arşivde bu modülün birden fazla kopyası var.", "The archive contains more than one copy of this module.").into());
        } else if planned.iter().any(|p| p.folder.eq_ignore_ascii_case(&folder)) {
            blocked = Some(tr!("Arşivdeki iki modül aynı klasör adını kullanıyor.", "Two modules in the archive use the same folder name.").into());
        } else if let Some(e) = &existing {
            if e.location == Location::Workshop {
                notes.push(tr!(
                    format!(
                        "{} şu anda Steam Workshop'tan geliyor. Modules klasörüne kurulan kopya önceliği alır; Workshop aboneliğini sonra kaldırabilirsiniz.",
                        info.name
                    ),
                    format!(
                        "{} currently comes from Steam Workshop. The copy installed into Modules takes priority; you can unsubscribe on the Workshop later.",
                        info.name
                    )
                ));
            }
        }
        if blocked.is_none() {
            // Hedef klasörde başka bir modül varsa üzerine yazma.
            let modules_dir_has_other = catalog
                .effective
                .iter()
                .chain(catalog.shadowed.iter())
                .any(|m| {
                    m.location == Location::Modules
                        && m.folder.eq_ignore_ascii_case(&folder)
                        && !m.id.eq_ignore_ascii_case(&info.id)
                });
            if modules_dir_has_other {
                blocked = Some(tr!(format!("Modules\\{folder} klasöründe başka bir modül kurulu."), format!("Another module is installed in Modules\\{folder}.")));
            }
        }

        let in_archive = |id: &str| roots.iter().any(|r| {
            read_module_dir(r, Location::Modules).is_some_and(|m| m.id.eq_ignore_ascii_case(id))
        });
        let missing_deps: Vec<String> = info
            .deps
            .iter()
            .filter(|d| d.kind == DepKind::Required)
            .filter(|d| catalog.get(&d.id).is_none() && !in_archive(&d.id))
            .map(|d| d.id.clone())
            .collect();

        planned.push(PlannedModule {
            id: info.id.clone(),
            name: info.name.clone(),
            version: info.version.clone(),
            folder,
            rel_root,
            files,
            size,
            dlls,
            existing,
            action,
            missing_deps,
            blocked,
        });
    }

    let loose: Vec<String> = std::fs::read_dir(extract_dir)
        .map(|rd| {
            rd.flatten()
                .map(|e| e.path())
                .filter(|p| !roots.iter().any(|r| r.starts_with(p) || p.starts_with(r)))
                .map(|p| p.file_name().unwrap_or_default().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    if !loose.is_empty() {
        notes.push(format!(
            "{}: {}",
            tr!("Modül dışındaki dosyalar kurulmayacak", "Files outside modules will not be installed"),
            loose.iter().take(8).cloned().collect::<Vec<_>>().join(", ")
        ));
    }
    (planned, notes)
}
