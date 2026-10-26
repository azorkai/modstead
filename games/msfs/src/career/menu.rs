//! Ana menü kutusu: MSFS 2024'ün ana menüsüne "Modstead Kariyer" kutusu ekleyen Community paketi.
//!
//! MSFS 2024 simin kendi HTML dosyalarını (`html_ui/Global/mainUI.html` gibi) Community'den değiştirmeye izin vermez;
//! menünün "pişirilmiş" bileşenleri (`fs-base-ui/cookedcomps`) ise aynı göreli yola konarak değiştirilebilir. Menünün
//! kökü MasterPage bileşenidir (`{7DA60FBA-…}`: tek satır iç içe `<ui-resource-element>` ve bir `.json`). Bileşenler
//! betik çalıştırmadığı için kopyanın sonuna görünmez bir resim eklenir; resmin `onload`'u yalnızca ana menüde ve bir
//! kez yükleyiciyi (`/Modstead/ModsteadMenuLoader.js`) ekler. Kutunun ve kariyer penceresinin kodu Modstead'in yerel
//! sunucusundan gelir (`hud_server`); Modstead kapalıyken menüye bir şey eklenmez. Yöntem MIT lisanslı MSFS-UI
//! projesinin belgelediği yoldur (github.com/Proxi64/MSFS-UI).
//!
//! Bileşenin kopyası kurulumda kullanıcının simindeki dosyadan üretilir: depoda simin dosyası yoktur.
//!
//! Koruma (kullanıcının onayıyla): sim güncellenip bileşen değişirse paket eski kopyayla menüyü bozabilir. Kurulumda
//! bileşenin özeti pakete yazılır; Modstead sim kapalıyken bileşen değişmişse paketi yeni bileşenden yeniden üretir,
//! bileşenin yapısı artık tanınmıyorsa paketi kaldırır ve haber verir.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use modstead_core::prelude::*;
use serde::Serialize;

use super::hud::{HudStatus, SimPackage};
use crate::Msfs;

pub const MENU_VERSION: &str = "0.2.0";

/// Menünün kök bileşeni.
const MASTER_PAGE: &str = "{7DA60FBA-EF32-48F2-974D-F8BEA35337A4}";
/// Yükleyiciyi tetikleyen 1×1 saydam GIF.
const PIXEL: &[u8] = &[
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x21, 0xF9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3B,
];
/// Bileşene eklenen yükleyici: yalnızca `mainUi.html`'de, sayfa başına bir kez.
const LOADER: &str = "<img data-modstead=\"loader\" src=\"/Modstead/px.gif\" style=\"position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;\" onload=\"this.onload=null;if(/mainui\\.html/i.test(location.href)&&!window.__modsteadMenuBoot){window.__modsteadMenuBoot=1;var s=document.createElement('script');s.src='/Modstead/ModsteadMenuLoader.js';document.head.appendChild(s)}\">";
const OPEN: &str = "<ui-resource-element";
const CLOSE: &str = "</ui-resource-element>";

const FILES: &[(&str, &[u8])] = &[
    ("html_ui/Modstead/ModsteadMenuLoader.js", include_bytes!("../../hud/menu-package/html_ui/Modstead/ModsteadMenuLoader.js")),
    ("html_ui/Modstead/px.gif", PIXEL),
];

pub static MENU: SimPackage = SimPackage {
    folder: "modstead-career-menu",
    title: "Modstead Career Menu",
    version: MENU_VERSION,
    files: FILES,
    only_2024: true,
    queued: AtomicBool::new(false),
    label: ("ana menü kutusu", "main menu tile"),
    generate: Some(generate),
};

/// Paketin içindeki kayıt: hangi sim ve hangi bileşen için üretildi.
const STAMP: &str = "modstead-menu.json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuStatus {
    #[serde(flatten)]
    pub package: HudStatus,
    /// Şu an kurulu MSFS 2024 sürümü ("store:1.9.21.0", "steam:<buildid>").
    pub sim_version: Option<String>,
    /// Paketin üretildiği sim sürümü.
    pub installed_for: Option<String>,
    /// Simin menü bileşeni bulunamadı ya da tanınmadı: kurulamaz (neden).
    pub blocked: Option<String>,
}

/// MSFS 2024'ün kurulu sürümü: Store'da paket sürümü, Steam'de derleme numarası.
pub fn sim_version(game: &Msfs) -> Option<String> {
    let sim = game.sims().into_iter().find(|s| s.id == crate::sims::SIM_2024 && s.detected)?;
    match sim.edition.as_str() {
        "store" => modstead_core::stores::appx_versions("Microsoft.Limitless").pop().map(|v| format!("store:{v}")),
        "steam" => modstead_core::stores::steam_libraries().into_iter().find_map(|lib| {
            let acf = std::fs::read_to_string(lib.join("steamapps").join(format!("appmanifest_{}.acf", crate::sims::STEAM_APP_2024))).ok()?;
            acf.lines().find_map(|l| l.trim().strip_prefix("\"buildid\"").map(|v| format!("steam:{}", v.trim().trim_matches('"'))))
        }),
        _ => None,
    }
}

/// Simin temel arayüz paketi (`fs-base-ui`): Store'da `<sürücü>\XboxGames\<oyun>\Content\Packages`, Steam'de
/// `<kütüphane>\steamapps\common\<oyun>\Packages`. Adında "2024" geçen oyun klasörü önce denenir.
fn fs_base_ui() -> Option<PathBuf> {
    let mut roots: Vec<(PathBuf, &[&str])> = Vec::new();
    for lib in modstead_core::stores::steam_libraries() {
        roots.push((lib.join("steamapps").join("common"), &["Packages"]));
    }
    for d in b'C'..=b'Z' {
        roots.push((PathBuf::from(format!("{}:\\XboxGames", d as char)), &["Content", "Packages"]));
    }
    roots.into_iter().find_map(|(root, sub)| {
        let mut games: Vec<PathBuf> = std::fs::read_dir(&root).ok()?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
        games.sort_by_key(|g| !g.file_name().is_some_and(|n| n.to_string_lossy().contains("2024")));
        games.into_iter().find_map(|g| {
            let mut p = g;
            for s in sub {
                p = p.join(s);
            }
            let p = p.join("fs-base-ui");
            p.join("manifest.json").is_file().then_some(p)
        })
    })
}

/// FNV-1a: bileşenin değişip değişmediğini anlamak için yeterli.
fn digest(b: &[u8]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for x in b {
        h = (h ^ *x as u64).wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// Bileşenin beklenen biçimi: tek satır, iç içe dengeli `<ui-resource-element>`, betik ve yükleyici yok.
fn insert_loader(html: &str) -> Option<String> {
    let c = html.trim_start_matches('\u{feff}').trim();
    let opened = c.match_indices(OPEN).filter(|(i, _)| c[i + OPEN.len()..].starts_with([' ', '>'])).count();
    let ok = c.starts_with(OPEN)
        && c.ends_with(CLOSE)
        && !c.contains(['\r', '\n'])
        && opened > 0
        && opened == c.matches(CLOSE).count()
        && !c.to_ascii_lowercase().contains("<script")
        && !c.contains("data-modstead")
        && !c.contains("data-msfs-ui");
    if !ok {
        return None;
    }
    let at = c.rfind(CLOSE)?;
    Some(format!("{}{LOADER}{}", &c[..at], &c[at..]))
}

fn master_page(base: &Path) -> (PathBuf, PathBuf) {
    let dir = base.join("cookedcomps");
    (dir.join(format!("{MASTER_PAGE}.html")), dir.join(format!("{MASTER_PAGE}.json")))
}

/// Kurulumda üretilen dosyalar: bileşenin yükleyicili kopyası, `.json`'u ve kayıt.
fn generate(game: &Msfs) -> AppResult<Vec<(String, Vec<u8>)>> {
    let base = fs_base_ui().ok_or_else(|| AppError::msg(tr!("MSFS 2024'ün arayüz paketi (fs-base-ui) bulunamadı.", "MSFS 2024's interface package (fs-base-ui) was not found.")))?;
    let (html_path, json_path) = master_page(&base);
    let html = std::fs::read(&html_path).map_err(|_| AppError::msg(tr!("Simin ana menü bileşeni bulunamadı.", "The sim's main menu component was not found.")))?;
    let json = std::fs::read(&json_path)?;
    let patched = insert_loader(&String::from_utf8_lossy(&html)).ok_or_else(|| {
        AppError::msg(tr!(
            "Simin ana menü bileşeni beklenen biçimde değil (sim güncellenmiş olabilir); kutu kurulamıyor.",
            "The sim's main menu component is not in the expected shape (the sim may have been updated); the tile cannot be installed."
        ))
    })?;
    let fs_version = std::fs::read(base.join("manifest.json")).ok().and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok()).and_then(|m| m["package_version"].as_str().map(str::to_string));
    let stamp = serde_json::json!({ "sim": sim_version(game), "fsBaseUi": fs_version, "masterPage": digest(&html) });
    Ok(vec![
        (format!("cookedcomps/{MASTER_PAGE}.html"), patched.into_bytes()),
        (format!("cookedcomps/{MASTER_PAGE}.json"), json),
        (STAMP.to_string(), serde_json::to_vec_pretty(&stamp).unwrap_or_default()),
    ])
}

fn stamp(game: &Msfs) -> serde_json::Value {
    MENU.dir(game).and_then(|d| std::fs::read(d.join(STAMP)).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Bu makinede kurulamıyorsa nedeni (bileşen yok ya da tanınmıyor; başka bir mod aynı bileşeni değiştiriyor).
fn blocked(game: &Msfs) -> Option<String> {
    let base = match fs_base_ui() {
        Some(b) => b,
        None => return Some(tr!("MSFS 2024'ün arayüz paketi bulunamadı.", "MSFS 2024's interface package was not found.").into()),
    };
    let html = std::fs::read(master_page(&base).0).ok()?;
    if insert_loader(&String::from_utf8_lossy(&html)).is_none() {
        return Some(tr!("Simin ana menü bileşeni tanınmadı (sim güncellenmiş olabilir).", "The sim's main menu component was not recognised (the sim may have been updated).").into());
    }
    other_override(game).map(|name| tr!(format!("'{name}' adlı başka bir mod da ana menüyü değiştiriyor; ikisi birlikte çalışmaz."), format!("Another mod, '{name}', also changes the main menu; the two cannot work together.")))
}

/// Community'de aynı bileşeni değiştiren başka bir paket (ör. MSFS-UI).
fn other_override(game: &Msfs) -> Option<String> {
    let sim = game.sims().into_iter().find(|s| s.id == crate::sims::SIM_2024)?;
    sim.containers().into_iter().find_map(|(_, dir)| {
        std::fs::read_dir(dir).ok()?.flatten().find_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            (name != MENU.folder && e.path().join("cookedcomps").join(format!("{MASTER_PAGE}.html")).is_file()).then_some(name)
        })
    })
}

pub fn status(game: &Msfs) -> MenuStatus {
    let s = stamp(game);
    MenuStatus { package: MENU.status(game), sim_version: sim_version(game), installed_for: s["sim"].as_str().map(str::to_string), blocked: blocked(game) }
}

pub fn install(game: &Msfs) -> AppResult<MenuStatus> {
    if let Some(name) = other_override(game) {
        return Err(AppError::msg(tr!(
            format!("'{name}' adlı başka bir mod da ana menüyü değiştiriyor; Modstead kutusu onunla birlikte çalışmaz."),
            format!("Another mod, '{name}', also changes the main menu; the Modstead tile cannot work alongside it.")
        )));
    }
    MENU.install(game)?;
    Ok(status(game))
}

pub fn remove(game: &Msfs) -> AppResult<MenuStatus> {
    MENU.remove(game)?;
    Ok(status(game))
}

pub fn queue(game: &Msfs, on: bool) -> MenuStatus {
    MENU.queue(game, on);
    status(game)
}

/// Sim kapalıyken: bileşen değişmişse paketi yeni bileşenden yeniden üretir; üretilemiyorsa kaldırır. Eski (0.1.0,
/// `mainUI.html`'i değiştirmeye çalışan) paket de bu yolla yenisine geçer.
pub fn guard(game: &Msfs) {
    let st = MENU.status(game);
    if !st.installed || st.sims.iter().any(|s| s.running) {
        return;
    }
    let was = stamp(game)["masterPage"].as_str().map(str::to_string);
    let now = fs_base_ui().and_then(|b| std::fs::read(master_page(&b).0).ok()).map(|h| digest(&h));
    if was.is_some() && was == now && st.version.as_deref() == Some(MENU_VERSION) {
        return;
    }
    game.career().note("paket", format!("ana menü bileşeni ya da paket sürümü değişmiş ({was:?} → {now:?}, paket {:?}); paket yeniden üretiliyor", st.version));
    match MENU.install(game) {
        Ok(_) => game.career().note("paket", "ana menü kutusu yeni bileşenden yeniden üretildi"),
        Err(e) => {
            game.career().note("paket", format!("ana menü kutusu yeniden üretilemedi ({e}); güvenlik için kaldırılıyor"));
            match MENU.remove(game) {
                Ok(_) => game.services.notify(
                    Tone::Warn,
                    tr!("MSFS 2024 güncellendi: ana menü kutusu kaldırıldı", "MSFS 2024 updated: main menu tile removed").to_string(),
                    Some(
                        tr!(
                            "Simin menü bileşeni değişmiş; ana menü bozulmasın diye Modstead kutuyu kaldırdı. Modstead güncellenince Kariyer → Panel'den yeniden kurabilirsiniz.",
                            "The sim's menu component changed; Modstead removed the tile so the main menu keeps working. Reinstall it from Career → Panel once Modstead is updated."
                        )
                        .to_string(),
                    ),
                ),
                Err(e) => game.career().note("paket", format!("ana menü kutusu kaldırılamadı: {e}")),
            }
        }
    }
    game.rescan();
    game.changed();
}

/// Koruma döngüsü: uygulama açıkken 30 saniyede bir (sim güncellemesi sim kapalıyken iner).
pub fn start_guard(game: Msfs) {
    std::thread::Builder::new()
        .name("modstead-menu-guard".into())
        .spawn(move || loop {
            guard(&game);
            std::thread::sleep(Duration::from_secs(30));
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE: &str = "<ui-resource-element name=\"Root\" class=\"a\"><ui-resource-element name=\"Child\"></ui-resource-element></ui-resource-element>";

    #[test]
    fn loader_goes_before_the_last_closing_tag() {
        let out = insert_loader(&format!("\u{feff}{PAGE}\n")).unwrap();
        assert!(out.starts_with("<ui-resource-element name=\"Root\""));
        assert!(out.ends_with(&format!("{LOADER}</ui-resource-element>")));
        assert_eq!(out.matches(CLOSE).count(), 2);
        // Yükleyici yalnızca ana menüde ve bir kez çalışır; bizim yükleyiciyi ekler.
        assert!(LOADER.contains("mainui\\.html") && LOADER.contains("window.__modsteadMenuBoot") && LOADER.contains("/Modstead/ModsteadMenuLoader.js"));
        assert!(FILES.iter().any(|(p, _)| *p == "html_ui/Modstead/px.gif") && &PIXEL[..6] == b"GIF89a");
    }

    #[test]
    fn unexpected_shapes_are_refused() {
        for bad in [
            "",
            "<div></div>",
            "<ui-resource-element>\n</ui-resource-element>",
            "<ui-resource-element><ui-resource-element></ui-resource-element>",
            "<ui-resource-element><script>x</script></ui-resource-element>",
        ] {
            assert!(insert_loader(bad).is_none(), "{bad}");
        }
        // Zaten yükleyicili (ya da başka bir modun yükleyicisiyle) bir kopya yeniden işlenmez.
        let once = insert_loader(PAGE).unwrap();
        assert!(insert_loader(&once).is_none());
        assert!(insert_loader(&PAGE.replace("class=\"a\"", "data-msfs-ui=\"loader\"")).is_none());
        assert_eq!(MENU.folder, "modstead-career-menu");
        assert!(MENU.only_2024 && MENU.generate.is_some());
    }

    /// Gerçek simdeki bileşen (varsa) beklenen biçimde mi. Salt okunur.
    #[test]
    #[ignore]
    fn real_master_page_has_the_expected_shape() {
        let base = fs_base_ui().expect("fs-base-ui yok");
        let html = std::fs::read(master_page(&base).0).unwrap();
        assert!(insert_loader(&String::from_utf8_lossy(&html)).is_some());
    }
}
