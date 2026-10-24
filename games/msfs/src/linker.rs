//! Etkinleştirme / devre dışı bırakma (junction), içe aktarma ve kaldırma.
//!
//! Güvenlik kuralları:
//! - Yalnızca hedefi kütüphanenin içinde olan bağlantıları kaldırırız; başka araçların bağlantılarına dokunmayız.
//! - Bağlantı kaldırmak `remove_dir` iledir: hedef klasöre asla dokunmaz.
//! - Sim çalışırken o simin Community klasörü değiştirilmez.

use std::fs;
use std::path::{Path, PathBuf};

use modstead_core::fsx::{self, norm_key};
use modstead_core::prelude::*;

use crate::sims::{SIM_2024, SimInstall, is_running};
use crate::util::{create_junction, is_link, is_within, link_target};

fn sim<'a>(sims: &'a [SimInstall], id: &str) -> AppResult<&'a SimInstall> {
    match sims.iter().find(|s| s.id == id) {
        Some(s) if s.usable() => Ok(s),
        Some(s) => Err(AppError::msg(tr!(
            format!("MSFS {} bulunamadı ya da Community klasörü ayarlı değil.", s.short),
            format!("MSFS {} was not found or its Community folder is not set.", s.short)
        ))),
        None => Err(AppError::msg(tr!(format!("Bilinmeyen simülatör: {id}"), format!("Unknown simulator: {id}")))),
    }
}

pub fn ensure_not_running(s: &SimInstall) -> AppResult<()> {
    if is_running(&s.id) {
        return Err(AppError::GameRunning(format!("MSFS {}", s.short)));
    }
    Ok(())
}

/// Paketin bu simde bağlanacağı Community klasörü.
fn container_for(s: &SimInstall, built_for: &str) -> AppResult<PathBuf> {
    if s.id == SIM_2024 && s.shares_packages && built_for == "2024" {
        if let Some(c) = &s.community2024_path {
            fs::create_dir_all(c)?;
            return Ok(c.clone());
        }
    }
    match &s.community_path {
        Some(c) => {
            fs::create_dir_all(c)?;
            Ok(c.clone())
        }
        None => Err(AppError::msg(tr!("Community klasörü yok", "No Community folder"))),
    }
}

fn not_in_library() -> AppError {
    AppError::msg(tr!(
        "Bu paket kütüphanede değil. Yönetmek için önce kütüphaneye aktarın.",
        "This package is not in the library. Import it into the library first to manage it."
    ))
}

pub fn enable(sims: &[SimInstall], library: &Path, pkg_path: &Path, built_for: &str, sim_id: &str) -> AppResult<()> {
    let s = sim(sims, sim_id)?;
    ensure_not_running(s)?;
    if !is_within(pkg_path, library) || !pkg_path.is_dir() {
        return Err(AppError::msg(tr!("Yalnızca kütüphanedeki paketler etkinleştirilebilir.", "Only packages in the library can be enabled.")));
    }
    let folder = pkg_path.file_name().ok_or_else(|| AppError::msg(tr!("Geçersiz paket yolu", "Invalid package path")))?;

    // Zaten herhangi bir kapsayıcıda bağlıysa bir şey yapma.
    for (_, dir) in s.containers() {
        let p = dir.join(folder);
        if is_link(&p) && link_target(&p).is_some_and(|t| norm_key(&t) == norm_key(pkg_path)) {
            return Ok(());
        }
    }

    // Aynı adlı başka bir kütüphane paketi (ör. 2020 derlemesi) bu simde bağlıysa onu çıkar: sürüm değişimi.
    for (_, dir) in s.containers() {
        let p = dir.join(folder);
        if is_link(&p) {
            match link_target(&p) {
                Some(t) if is_within(&t, library) => fs::remove_dir(&p)?,
                Some(t) => {
                    return Err(AppError::msg(tr!(
                        format!("Community'de bu adda başka bir aracın bağlantısı var: {}", t.display()),
                        format!("Community already has another tool's link with this name: {}", t.display())
                    )));
                }
                None => return Err(AppError::msg(tr!("Community'de bu adda okunamayan bir bağlantı var.", "Community has an unreadable link with this name."))),
            }
        }
    }

    let dir = container_for(s, built_for)?;
    let link = dir.join(folder);
    if link.exists() {
        return Err(AppError::msg(tr!(
            "Community'de bu adda gerçek bir klasör var. Önce onu kütüphaneye aktarın.",
            "Community has a real folder with this name. Import it into the library first."
        )));
    }
    create_junction(pkg_path, &link)
}

/// Bu simde `pkg_path`e işaret eden bağlantılarımızı kaldırır. Zaten devre dışıysa bir şey yapmaz.
pub fn disable(sims: &[SimInstall], library: &Path, pkg_path: &Path, sim_id: &str) -> AppResult<()> {
    let s = sim(sims, sim_id)?;
    if !is_within(pkg_path, library) {
        return Err(not_in_library());
    }
    let key = norm_key(pkg_path);
    let mut links = Vec::new();
    for (_, dir) in s.containers() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if is_link(&p) && link_target(&p).is_some_and(|t| norm_key(&t) == key) {
                links.push(p);
            }
        }
    }
    if links.is_empty() {
        return Ok(());
    }
    ensure_not_running(s)?;
    for p in links {
        fs::remove_dir(&p)?;
    }
    Ok(())
}

/// Community'deki fiziksel paketi kütüphaneye taşır ve aynı simlerde bağlantıyla yeniden etkinleştirir.
pub fn import(sims: &[SimInstall], library: &Path, physical: &Path) -> AppResult<PathBuf> {
    if is_link(physical) || !physical.is_dir() {
        return Err(AppError::msg(tr!("Yalnızca gerçek paket klasörleri içe aktarılabilir.", "Only real package folders can be imported.")));
    }
    let folder = physical.file_name().ok_or_else(|| AppError::msg(tr!("Geçersiz yol", "Invalid path")))?.to_owned();
    // Bu klasörü okuyan simler: taşımadan önce hepsi kapalı olmalı.
    let parent = physical.parent().map(norm_key);
    let readers: Vec<&SimInstall> =
        sims.iter().filter(|s| s.usable() && s.containers().iter().any(|(_, d)| parent.as_deref() == Some(norm_key(d).as_str()))).collect();
    if readers.is_empty() {
        return Err(AppError::msg(tr!("Bu klasör bir Community klasöründe değil.", "This folder is not in a Community folder.")));
    }
    for s in &readers {
        ensure_not_running(s)?;
    }
    let dest = library.join(&folder);
    if dest.exists() || is_link(&dest) {
        return Err(AppError::msg(tr!(
            format!("Kütüphanede zaten “{}” adlı bir klasör var.", folder.to_string_lossy()),
            format!("The library already has a folder named “{}”.", folder.to_string_lossy())
        )));
    }
    fs::create_dir_all(library)?;
    fsx::move_dir(physical, &dest)?;
    // Aynı yere bağlantı koy: mod aynı simlerde etkin kalsın.
    if let Err(e) = create_junction(&dest, physical) {
        return Err(AppError::msg(tr!(
            format!("Paket kütüphaneye taşındı ama bağlantı kurulamadı: {e}"),
            format!("The package was moved into the library but the link could not be created: {e}")
        )));
    }
    Ok(dest)
}

/// Kütüphanedeki paketi tüm simlerden çıkarır ve siler.
pub fn uninstall(sims: &[SimInstall], library: &Path, pkg_path: &Path) -> AppResult<()> {
    if !is_within(pkg_path, library) || norm_key(pkg_path) == norm_key(library) {
        return Err(AppError::msg(tr!("Yalnızca kütüphanedeki paketler kaldırılabilir.", "Only packages in the library can be removed.")));
    }
    if is_link(pkg_path) {
        return Err(AppError::msg(tr!("Paket yolu bir bağlantı; güvenlik için silinmedi.", "The package path is a link; it was not deleted for safety.")));
    }
    // Bağlantı varsa simin kapalı olması gerekir; disable bunu kontrol eder.
    for s in sims.iter().filter(|s| s.usable()) {
        disable(sims, library, pkg_path, &s.id)?;
    }
    fsx::remove_dir(pkg_path)?;
    Ok(())
}

fn in_community(sims: &[SimInstall], path: &Path) -> bool {
    let parent = path.parent().map(norm_key);
    sims.iter().flat_map(|s| s.containers()).any(|(_, d)| parent.as_deref() == Some(norm_key(&d).as_str()))
}

/// Kırık bir bağlantıyı (hedefi olmayan junction/symlink) kaldırır.
pub fn remove_broken_link(sims: &[SimInstall], link: &Path) -> AppResult<()> {
    if !in_community(sims, link) {
        return Err(AppError::msg(tr!("Bu yol bir Community klasöründe değil.", "This path is not in a Community folder.")));
    }
    if !is_link(link) {
        return Err(AppError::msg(tr!("Bu bir bağlantı değil; silinmedi.", "This is not a link; it was not deleted.")));
    }
    if link_target(link).is_some_and(|t| t.exists()) {
        return Err(AppError::msg(tr!("Bağlantının hedefi hâlâ mevcut; kırık değil.", "The link's target still exists; it is not broken.")));
    }
    fs::remove_dir(link).or_else(|_| fs::remove_file(link))?;
    Ok(())
}

/// İç içe kurulmuş paketi düzeltir: içteki paketi Community köküne çıkarır.
pub fn fix_nested(sims: &[SimInstall], outer: &Path) -> AppResult<Vec<PathBuf>> {
    let community = outer.parent().ok_or_else(|| AppError::msg(tr!("Geçersiz yol", "Invalid path")))?;
    let readers: Vec<&SimInstall> = sims.iter().filter(|s| s.containers().iter().any(|(_, d)| norm_key(d) == norm_key(community))).collect();
    if readers.is_empty() || is_link(outer) {
        return Err(AppError::msg(tr!("Bu klasör bir Community klasöründe değil.", "This folder is not in a Community folder.")));
    }
    for s in &readers {
        ensure_not_running(s)?;
    }
    let inner = crate::package::find_package_roots(outer, 2);
    if inner.is_empty() {
        return Err(AppError::msg(tr!("İçeride paket bulunamadı.", "No package found inside.")));
    }
    let mut moved = Vec::new();
    for pkg in inner {
        let name = pkg.file_name().unwrap_or_default().to_owned();
        let dest = community.join(&name);
        if dest.exists() {
            return Err(AppError::msg(tr!(
                format!("Community'de zaten “{}” var.", name.to_string_lossy()),
                format!("Community already has “{}”.", name.to_string_lossy())
            )));
        }
        fs::rename(&pkg, &dest)?;
        moved.push(dest);
    }
    // Dış klasör artık boşsa (ya da yalnızca belge kaldıysa) olduğu gibi bırak; kullanıcı silebilir.
    Ok(moved)
}
