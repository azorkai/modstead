//! Sağlık denetimi: modların oyunu bozabilecek ya da hiç yüklenmemesine yol açacak durumları.
//!
//! Her bulgu bir açıklama ve varsa tek tık çözüm taşır (`Fix`). Çözümler `cities2_fix` komutuyla
//! yürür; hepsi oyun kapalıyken ve geri alınabilir ya da yeniden indirilebilir şeyler üzerinde çalışır.

use std::collections::HashSet;

use modstead_core::tr;
use serde::Serialize;

use crate::detect::PdxAccount;
use crate::logs::LogReport;
use crate::mods::{self, ModEntry, ModScan};
use crate::paradox;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Fix {
    /// "clean-stale" | "remove-known-bad" | "remove-bepinex" | "disable-local"
    pub action: &'static str,
    pub label: String,
    /// `disable-local` için yerel klasör adları.
    pub folders: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    /// "danger" | "warn" | "info"
    pub severity: &'static str,
    pub title: String,
    pub detail: String,
    /// İlgili modların anahtarları.
    pub mods: Vec<String>,
    pub fix: Option<Fix>,
    /// Paradox Mods sayfası gibi yardımcı bağlantı.
    pub link: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub issues: Vec<Issue>,
    pub score: u32,
    pub checked_at: i64,
    pub game_version: Option<String>,
    pub logs: LogReport,
}

impl HealthReport {
    /// Ana sayfa kartındaki sayı: tehlike + uyarı.
    pub fn problem_count(&self) -> u32 {
        self.issues.iter().filter(|i| i.severity != "info").count() as u32
    }
}

pub struct Input<'a> {
    pub scan: &'a ModScan,
    pub game_version: Option<&'a str>,
    pub account: &'a PdxAccount,
    pub game_found: bool,
    pub bepinex: &'a [String],
    pub game_protected: bool,
    pub low_disks: Vec<(String, u64)>,
    pub logs: &'a LogReport,
}

fn mb(bytes: u64) -> String {
    if bytes >= 1 << 30 { format!("{:.1} GB", bytes as f64 / (1u64 << 30) as f64) } else { format!("{} MB", (bytes / (1 << 20)).max(1)) }
}

fn names(mods: &[&ModEntry]) -> String {
    let mut v: Vec<String> = mods.iter().map(|m| m.meta.as_ref().map(|x| x.name.clone()).filter(|n| !n.is_empty()).unwrap_or_else(|| m.name.clone())).collect();
    let more = v.len().saturating_sub(4);
    v.truncate(4);
    let list = v.join(", ");
    if more > 0 { tr!(format!("{list} ve {more} mod daha"), format!("{list} and {more} more")) } else { list }
}

pub fn analyze(i: &Input) -> Vec<Issue> {
    let mut out = Vec::new();
    let mods = &i.scan.mods;
    let pdx: Vec<&ModEntry> = mods.iter().filter(|m| m.source == "paradox").collect();

    // Bilinen kötü amaçlı sürüm
    let bad: Vec<&ModEntry> = mods.iter().filter(|m| m.known_bad.is_some()).collect();
    if !bad.is_empty() {
        out.push(Issue {
            id: "known-bad".into(),
            severity: "danger",
            title: tr!("Kötü amaçlı olduğu bilinen bir mod sürümü var", "A mod version known to be malicious is present").into(),
            detail: tr!(
                format!("{} — bu sürüm 2024'te Paradox Mods'tan kaldırıldı ama önbellekte duruyor. Klasörü silin; oyun modun güncel sürümünü yeniden indirir. Ayrıca bilgisayarınızı Defender ile tam taramadan geçirin.", bad.iter().filter_map(|m| m.known_bad.clone()).collect::<Vec<_>>().join(", ")),
                format!("{} — this version was removed from Paradox Mods in 2024 but is still in the cache. Delete the folder; the game will download the current version. Also run a full Defender scan.", bad.iter().filter_map(|m| m.known_bad.clone()).collect::<Vec<_>>().join(", "))
            ),
            mods: bad.iter().map(|m| m.key.clone()).collect(),
            fix: Some(Fix { action: "remove-known-bad", label: tr!("Klasörü sil", "Delete the folder").into(), folders: vec![] }),
            link: None,
        });
    }

    // Oyun klasöründe BepInEx
    if !i.bepinex.is_empty() {
        out.push(Issue {
            id: "bepinex-game".into(),
            severity: "danger",
            title: tr!("Oyun klasöründe BepInEx kalıntısı var", "BepInEx leftovers in the game folder").into(),
            detail: tr!(
                format!("{} oyunun 1.1'den önceki gayriresmî mod yükleyicisine ait. Yerleşik mod sistemiyle çakışır; açılışta çökmeye ya da modların yüklenmemesine yol açar.", i.bepinex.join(", ")),
                format!("{} belong to the unofficial pre-1.1 mod loader. They conflict with the built-in mod system and cause crashes on start or mods not loading.", i.bepinex.join(", "))
            ),
            mods: vec![],
            fix: (!i.game_protected).then(|| Fix { action: "remove-bepinex", label: tr!("Çöpe taşı", "Move to trash").into(), folders: vec![] }),
            link: None,
        });
    }

    // Paradox hesabı
    if i.account.logged_in == Some(false) {
        let has = !pdx.is_empty();
        out.push(Issue {
            id: "pdx-login".into(),
            severity: if has { "warn" } else { "info" },
            title: tr!("Oyunda Paradox hesabına giriş yapılmamış", "Not signed in to a Paradox account in the game").into(),
            detail: if has {
                tr!(
                    "Paradox Mods abonelikleri yalnızca oyunda Paradox hesabıyla giriş yapıldığında indirilir, güncellenir ve yüklenir. Ana menüden Paradox hesabınızla giriş yapın.",
                    "Paradox Mods subscriptions are only downloaded, updated and loaded when signed in to a Paradox account in the game. Sign in from the main menu."
                )
                .into()
            } else {
                tr!(
                    "Paradox Mods'tan mod kullanmak için oyunun ana menüsünden Paradox hesabınızla giriş yapın. Yerel modlar girişsiz de yüklenir.",
                    "To use mods from Paradox Mods, sign in to your Paradox account from the game's main menu. Local mods load without signing in."
                )
                .into()
            },
            mods: vec![],
            fix: None,
            link: None,
        });
    }

    // Oyunun sürümüne uymayan kod modları
    let mut outdated = Vec::new();
    let mut newer = Vec::new();
    for m in &pdx {
        let Some(meta) = &m.meta else { continue };
        let is_code = m.kind == "code" || meta.tags.iter().any(|t| t == "Code Mod");
        if !is_code {
            continue;
        }
        match paradox::compat(meta.required_version.as_deref(), i.game_version) {
            "outdated" => outdated.push(*m),
            "newer" => newer.push(*m),
            _ => {}
        }
    }
    if !outdated.is_empty() {
        out.push(Issue {
            id: "outdated".into(),
            severity: "warn",
            title: tr!(format!("{} kod modu bu oyun sürümü için güncellenmemiş", outdated.len()), format!("{} code mods haven't been updated for this game version", outdated.len())).into(),
            detail: tr!(
                format!("{}. Oyun güncellemesinden sonra güncellenmemiş kod modları çökmeye ya da kayıtların bozulmasına yol açabilir. Güncelleme gelene kadar oyundaki oynatma listesinden kapatmayı düşünün.", names(&outdated)),
                format!("{}. Code mods not updated after a game patch can cause crashes or corrupt saves. Consider disabling them in the in-game playset until they are updated.", names(&outdated))
            ),
            mods: outdated.iter().map(|m| m.key.clone()).collect(),
            fix: None,
            link: None,
        });
    }
    if !newer.is_empty() {
        out.push(Issue {
            id: "needs-game-update".into(),
            severity: "warn",
            title: tr!("Bazı modlar oyunun daha yeni bir sürümünü istiyor", "Some mods require a newer game version").into(),
            detail: tr!(format!("{}. Oyunu güncelleyin.", names(&newer)), format!("{}. Update the game.", names(&newer))),
            mods: newer.iter().map(|m| m.key.clone()).collect(),
            fix: None,
            link: None,
        });
    }

    // Eksik bağımlılıklar (Paradox katalogundaki "requirements")
    let installed: HashSet<&str> = pdx.iter().filter_map(|m| m.mod_id.as_deref()).collect();
    let mut missing: Vec<(String, String, Vec<String>)> = Vec::new(); // (id, ad, isteyenler)
    for m in &pdx {
        let Some(meta) = &m.meta else { continue };
        for r in &meta.requirements {
            if installed.contains(r.mod_id.as_str()) {
                continue;
            }
            let who = meta.name.clone();
            match missing.iter_mut().find(|x| x.0 == r.mod_id) {
                Some(x) => x.2.push(who),
                None => missing.push((r.mod_id.clone(), r.name.clone(), vec![who])),
            }
        }
    }
    for (id, name, who) in missing.into_iter().take(10) {
        out.push(Issue {
            id: format!("missing-{id}"),
            severity: "warn",
            title: tr!(format!("Eksik bağımlılık: {name}"), format!("Missing dependency: {name}")).into(),
            detail: tr!(
                format!("{} bu moda ihtiyaç duyuyor ama indirilmiş değil. Paradox Mods'ta abone olun; oyun bir sonraki açılışta indirir.", who.join(", ")),
                format!("{} need this mod but it isn't downloaded. Subscribe on Paradox Mods; the game downloads it on next start.", who.join(", "))
            ),
            mods: vec![],
            fix: None,
            link: Some(paradox::mod_url(&id)),
        });
    }

    // Yerel ve Paradox kopyası birlikte
    let dups = mods::duplicates(mods);
    if !dups.is_empty() {
        let folders: Vec<String> = dups.iter().filter_map(|(l, _, _)| mods.iter().find(|m| &m.key == l).map(|m| m.folder.clone())).collect();
        let dlls: Vec<String> = dups.iter().map(|d| d.2.clone()).collect();
        out.push(Issue {
            id: "duplicate".into(),
            severity: "warn",
            title: tr!("Aynı mod hem yerel hem Paradox Mods'tan yükleniyor", "The same mod loads both locally and from Paradox Mods").into(),
            detail: tr!(
                format!("{}: iki kopya birlikte yüklenince çakışır ve oyun açılmayabilir. Yerel kopyayı kapatın.", dlls.join(", ")),
                format!("{}: two copies loading together conflict and the game may not start. Disable the local copy.", dlls.join(", "))
            ),
            mods: dups.iter().flat_map(|(l, p, _)| [l.clone(), p.clone()]).collect(),
            fix: Some(Fix { action: "disable-local", label: tr!("Yerel kopyayı kapat", "Disable the local copy").into(), folders }),
            link: None,
        });
    }

    // Yerel BepInEx eklentileri
    let bep: Vec<&ModEntry> = mods.iter().filter(|m| m.source == "local" && m.enabled && m.bepinex).collect();
    if !bep.is_empty() {
        out.push(Issue {
            id: "bepinex-mod".into(),
            severity: "warn",
            title: tr!("BepInEx için yazılmış yerel mod", "Local mod written for BepInEx").into(),
            detail: tr!(
                format!("{}: oyunun yerleşik mod sistemi BepInEx eklentilerini yüklemez; günlüğe hata yazar ve çökmeye yol açabilir. Paradox Mods'taki güncel sürümünü kullanın.", names(&bep)),
                format!("{}: the built-in mod system doesn't load BepInEx plugins; they log errors and can cause crashes. Use the current version from Paradox Mods.", names(&bep))
            ),
            mods: bep.iter().map(|m| m.key.clone()).collect(),
            fix: Some(Fix { action: "disable-local", label: tr!("Kapat", "Disable").into(), folders: bep.iter().map(|m| m.folder.clone()).collect() }),
            link: None,
        });
    }

    // Günlükte modlara bağlı hatalar
    let mut culprits: Vec<String> = i.logs.lines.iter().filter(|l| l.level == "error").filter_map(|l| l.mod_key.clone()).collect();
    culprits.sort();
    culprits.dedup();
    if !culprits.is_empty() {
        let found: Vec<&ModEntry> = culprits.iter().filter_map(|k| mods.iter().find(|m| &m.key == k)).collect();
        out.push(Issue {
            id: "log-errors".into(),
            severity: "warn",
            title: tr!("Son oturumun günlüğünde modlara bağlı hatalar var", "The last session's log has errors linked to mods").into(),
            detail: tr!(
                format!("{}. Ayrıntılar aşağıdaki günlük özetinde.", names(&found)),
                format!("{}. Details in the log summary below.", names(&found))
            ),
            mods: culprits,
            fix: None,
            link: None,
        });
    }
    if i.logs.crashes > 0 {
        let has_code = mods.iter().any(|m| m.kind == "code" && m.enabled);
        out.push(Issue {
            id: "crashes".into(),
            severity: "warn",
            title: tr!(format!("Son 7 günde {} çökme", i.logs.crashes), format!("{} crashes in the last 7 days", i.logs.crashes)).into(),
            detail: if has_code {
                tr!(
                    "Oyun çökme dökümü bıraktı. Çökmeler çoğunlukla güncellenmemiş kod modlarından gelir: uyumluluk bulgularına ve günlükteki hatalara bakın; şüpheli modu kapatıp deneyin.",
                    "The game left crash dumps. Crashes usually come from code mods that weren't updated: check the compatibility findings and log errors; disable the suspect mod and retry."
                )
                .into()
            } else {
                tr!(
                    "Oyun çökme dökümü bıraktı ve açık kod modu yok: sorun büyük olasılıkla oyun dosyalarında ya da sürücüde. Ekran kartı sürücüsünü güncelleyin ve oyun dosyalarını doğrulayın (Steam: Özellikler › Yüklü dosyalar; Xbox uygulaması: Yönet › Dosyalar › Doğrula ve onar).",
                    "The game left crash dumps and no code mod is enabled: the cause is most likely game files or drivers. Update the graphics driver and verify game files (Steam: Properties › Installed files; Xbox app: Manage › Files › Verify and repair)."
                )
                .into()
            },
            mods: vec![],
            fix: None,
            link: None,
        });
    }

    // Disk
    for (path, free) in &i.low_disks {
        out.push(Issue {
            id: format!("low-disk-{}", path.chars().take(2).collect::<String>()),
            severity: "warn",
            title: tr!(format!("Diskte az yer kaldı ({})", mb(*free)), format!("Low disk space ({})", mb(*free))).into(),
            detail: tr!(
                format!("{path}: kayıtlar (40–70 MB) ve mod indirmeleri yarıda kalabilir; oyun kaydı bozulabilir. Yer açın ya da yedek klasörünü başka sürücüye taşıyın."),
                format!("{path}: saves (40–70 MB) and mod downloads may fail halfway; a save can get corrupted. Free up space or move the backup folder to another drive.")
            ),
            mods: vec![],
            fix: None,
            link: None,
        });
    }

    // Eski sürümler ve yarım indirmeler
    let stale_bytes: u64 = pdx.iter().flat_map(|m| m.stale.iter()).map(|s| s.size).sum();
    let stale_n: usize = pdx.iter().map(|m| m.stale.len()).sum::<usize>() + i.scan.partial.len();
    if stale_n > 0 {
        out.push(Issue {
            id: "stale".into(),
            severity: "info",
            title: tr!(format!("{stale_n} eski mod sürümü yer kaplıyor ({})", mb(stale_bytes)), format!("{stale_n} old mod versions take up space ({})", mb(stale_bytes))).into(),
            detail: tr!(
                "Oyun bir modu güncelleyince eski sürüm klasörünü her zaman silmiyor. Bunlar kullanılmıyor; silmek güvenli (etkin sürümler kalır).",
                "The game doesn't always delete the old folder when it updates a mod. They aren't used; deleting them is safe (active versions stay)."
            )
            .into(),
            mods: pdx.iter().filter(|m| !m.stale.is_empty()).map(|m| m.key.clone()).collect(),
            fix: Some(Fix { action: "clean-stale", label: tr!("Temizle", "Clean up").into(), folders: vec![] }),
            link: None,
        });
    }

    if !i.game_found {
        out.push(Issue {
            id: "game-missing".into(),
            severity: "info",
            title: tr!("Oyun klasörü bulunamadı", "Game folder not found").into(),
            detail: tr!("Modlar ve kayıtlar yine de yönetilir; başlatma ve BepInEx denetimi için oyun klasörünü seçin.", "Mods and saves are still managed; choose the game folder for launching and the BepInEx check.").into(),
            mods: vec![],
            fix: None,
            link: None,
        });
    }
    out
}

pub fn score(issues: &[Issue]) -> u32 {
    let penalty: u32 = issues.iter().map(|i| match i.severity {
        "danger" => 35,
        "warn" => 12,
        _ => 0,
    }).sum();
    100u32.saturating_sub(penalty)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paradox::{PdxMeta, PdxRequirement};
    use crate::testkit::fixture;

    #[test]
    fn finds_compat_dependency_and_duplicate_problems() {
        let fx = fixture();
        fx.add_pdx(74417, 13, "UnifiedIconLibrary.dll");
        fx.add_pdx(74417, 14, "UnifiedIconLibrary.dll");
        fx.add_pdx(161156, 14, "ParkingLotTool.dll");
        fx.add_pdx(90000, 3, "OldMod.dll");
        fx.add_local("Dup", "UnifiedIconLibrary.dll", b"MZ");
        let mut scan = mods::scan(&fx.user());
        for m in scan.mods.iter_mut() {
            match m.mod_id.as_deref() {
                Some("161156") => {
                    m.meta = Some(PdxMeta {
                        name: "Parking Lot Tool".into(),
                        required_version: Some("1.6.*".into()),
                        tags: vec!["Code Mod".into()],
                        requirements: vec![PdxRequirement { mod_id: "74417".into(), name: "Unified Icon Library".into() }, PdxRequirement { mod_id: "77240".into(), name: "Find It".into() }],
                        ..Default::default()
                    })
                }
                Some("90000") => m.meta = Some(PdxMeta { name: "Old Mod".into(), required_version: Some("1.1.*".into()), ..Default::default() }),
                _ => {}
            }
        }
        let account = PdxAccount { logged_in: Some(false), ..Default::default() };
        let logs = LogReport::default();
        let issues = analyze(&Input { scan: &scan, game_version: Some("1.6.2f1"), account: &account, game_found: true, bepinex: &[], game_protected: false, low_disks: vec![], logs: &logs });
        let ids: Vec<&str> = issues.iter().map(|i| i.id.as_str()).collect();
        assert!(ids.contains(&"pdx-login"));
        assert!(ids.contains(&"outdated"), "{ids:?}");
        assert!(ids.contains(&"missing-77240"), "{ids:?}");
        assert!(!ids.contains(&"missing-74417"), "kurulu bağımlılık eksik sayılmamalı");
        assert!(ids.contains(&"duplicate"));
        assert!(ids.contains(&"stale"));
        let dup = issues.iter().find(|i| i.id == "duplicate").unwrap();
        assert_eq!(dup.fix.as_ref().unwrap().folders, vec!["Dup".to_string()]);
        assert!(score(&issues) < 100);
    }
}
