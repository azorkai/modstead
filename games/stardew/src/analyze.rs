//! Mod kurulumunun "sağlık" analizi: eksik/devre dışı bağımlılıklar, yinelenen kimlikler,
//! SMAPI ve oyun sürümü gereksinimleri, uyumluluk listesi, yanlış yere atılmış arşivler…
//! Saf fonksiyondur; dosya sistemine dokunmaz, böylece kolayca test edilir.

use std::collections::HashMap;

use modstead_core::{tr, version};
use serde::Serialize;

use crate::scan::{ModInfo, ScanResult};
use crate::updates::{self, UpdateCache};
use crate::util::human_bytes;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Fix {
    /// enable | disable | open-folder | install-smapi | find-dependency | install-archive | open-url | view-updates | open-settings
    pub kind: String,
    pub label: String,
    pub folders: Vec<String>,
    pub target: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    /// error | warning | info
    pub severity: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub mods: Vec<String>,
    pub fix: Option<Fix>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub score: u8,
    pub errors: u32,
    pub warnings: u32,
    pub infos: u32,
    pub issues: Vec<Issue>,
}

pub struct DiskWarning {
    pub label: String,
    pub free: u64,
}

pub struct Input<'a> {
    pub scan: &'a ScanResult,
    pub game_found: bool,
    pub game_version: Option<&'a str>,
    pub smapi_installed: bool,
    pub smapi_version: Option<&'a str>,
    pub updates: Option<&'a UpdateCache>,
    pub low_disk: Vec<DiskWarning>,
}

fn fix(kind: &str, label: impl Into<String>, folders: Vec<String>, target: Option<String>) -> Option<Fix> {
    Some(Fix { kind: kind.into(), label: label.into(), folders, target })
}

fn open_folder(folder: &str) -> Option<Fix> {
    fix("open-folder", tr!("Klasörü aç", "Open folder"), vec![folder.to_string()], None)
}

struct Ctx<'a> {
    issues: Vec<Issue>,
    by_id: HashMap<String, Vec<&'a ModInfo>>,
}

impl<'a> Ctx<'a> {
    #[allow(clippy::too_many_arguments)]
    fn push(&mut self, severity: &str, kind: &str, key: &str, title: String, detail: String, mods: Vec<String>, fix: Option<Fix>) {
        self.issues.push(Issue { id: format!("{kind}:{key}"), severity: severity.into(), kind: kind.into(), title, detail, mods, fix });
    }

    fn installed(&self, id: &str) -> Option<&Vec<&'a ModInfo>> {
        self.by_id.get(&id.to_lowercase())
    }
}

fn display(m: &ModInfo) -> String {
    match &m.version {
        Some(v) => format!("{} {}", m.name, v),
        None => m.name.clone(),
    }
}

/// Bir bağımlılığı (ya da içerik paketinin çerçevesini) denetler.
fn check_requirement(ctx: &mut Ctx, m: &ModInfo, dep_id: &str, min: Option<&str>, framework: bool) {
    let key = format!("{}>{}", m.folder, dep_id);
    let candidates = ctx.installed(dep_id).cloned();
    match candidates {
        None => {
            let need = min.map(|v| tr!(format!(" En az {v} sürümü gerekli."), format!(" Version {v} or newer is required."))).unwrap_or_default();
            ctx.push(
                "error",
                "missing-dependency",
                &key,
                tr!(format!("{} eksik bir modu gerektiriyor", m.name), format!("{} requires a missing mod", m.name)),
                if framework {
                    tr!(format!("'{dep_id}' çerçeve modunu gerektiriyor ama kurulu değil.{need}"), format!("It requires the framework mod '{dep_id}', which is not installed.{need}"))
                } else {
                    tr!(format!("'{dep_id}' bağımlılığını gerektiriyor ama kurulu değil.{need}"), format!("It requires '{dep_id}', which is not installed.{need}"))
                },
                vec![m.folder.clone()],
                fix("find-dependency", tr!("Modu bul", "Find mod"), vec![], Some(dep_id.to_string())),
            );
        }
        Some(list) => {
            let enabled: Vec<&&ModInfo> = list.iter().filter(|d| d.enabled).collect();
            if enabled.is_empty() {
                let dep = list[0];
                if dep.disabled_by_parent {
                    ctx.push(
                        "error",
                        "disabled-dependency",
                        &key,
                        tr!(format!("{} için gereken {} bir grup klasörüyle kapatılmış", m.name, dep.name), format!("{} needed by {} is disabled by a group folder", dep.name, m.name)),
                        tr!(
                            format!("'{}' modu, devre dışı bir üst klasörün içinde. Üst klasörün başındaki noktayı kaldırın.", dep.name),
                            format!("'{}' is inside a disabled parent folder. Remove the dot at the start of the parent folder's name.", dep.name)
                        ),
                        vec![m.folder.clone(), dep.folder.clone()],
                        open_folder(&dep.folder),
                    );
                } else {
                    ctx.push(
                        "error",
                        "disabled-dependency",
                        &key,
                        tr!(format!("{} için gereken {} devre dışı", m.name, dep.name), format!("{} needed by {} is disabled", dep.name, m.name)),
                        tr!(format!("'{}' etkinleştirilmezse SMAPI '{}' modunu yüklemez.", dep.name, m.name), format!("SMAPI won't load '{}' unless '{}' is enabled.", m.name, dep.name)),
                        vec![m.folder.clone(), dep.folder.clone()],
                        fix("enable", tr!(format!("{} modunu etkinleştir", dep.name), format!("Enable {}", dep.name)), vec![dep.folder.clone()], None),
                    );
                }
            } else if let Some(min) = min {
                let dep = enabled[0];
                if !version::satisfies(dep.version.as_deref(), Some(min)) {
                    let cur = dep.version.as_deref().unwrap_or("?");
                    ctx.push(
                        "error",
                        "outdated-dependency",
                        &key,
                        tr!(format!("{} için {} sürümü eski", m.name, dep.name), format!("{} is too old for {}", dep.name, m.name)),
                        tr!(format!("En az {min} gerekli, kurulu olan {cur}."), format!("{min} or newer is required; {cur} is installed.")),
                        vec![m.folder.clone(), dep.folder.clone()],
                        match dep.nexus_id.map(updates::nexus_url) {
                            Some(u) => fix("open-url", tr!("Güncellemeyi indir", "Get the update"), vec![], Some(u)),
                            None => fix("find-dependency", tr!("Modu bul", "Find mod"), vec![], Some(dep_id.to_string())),
                        },
                    );
                }
            }
        }
    }
}

pub fn analyze(input: &Input) -> HealthReport {
    let mods = &input.scan.mods;
    let mut ctx = Ctx { issues: Vec::new(), by_id: HashMap::new() };
    for m in mods {
        if let Some(id) = &m.unique_id {
            ctx.by_id.entry(id.to_lowercase()).or_default().push(m);
        }
    }

    if !input.game_found {
        ctx.push(
            "error",
            "game-missing",
            "game",
            tr!("Oyun klasörü seçilmedi", "No game folder selected").into(),
            tr!("Stardew Valley'in kurulu olduğu klasörü seçin ya da otomatik bulmayı deneyin.", "Choose the folder where Stardew Valley is installed, or try automatic detection.").into(),
            vec![],
            fix("open-settings", tr!("Ayarları aç", "Open settings"), vec![], None),
        );
    } else if !input.smapi_installed {
        ctx.push(
            "error",
            "smapi-missing",
            "smapi",
            tr!("SMAPI kurulu değil", "SMAPI is not installed").into(),
            tr!(
                "Modların çalışması için SMAPI gerekir. Modstead en son sürümü indirip doğrulayarak kurabilir.",
                "Mods need SMAPI to run. Modstead can download, verify and install the latest version."
            )
            .into(),
            vec![],
            fix("install-smapi", tr!("SMAPI'yi kur", "Install SMAPI"), vec![], None),
        );
    } else if let Some(s) = input.updates.and_then(|u| u.smapi.as_ref()).filter(|s| s.has_update) {
        let latest = s.latest.as_deref().unwrap_or("?");
        let cur = input.smapi_version.unwrap_or("?");
        ctx.push(
            "warning",
            "smapi-outdated",
            "smapi",
            tr!(format!("SMAPI güncellemesi var ({latest})"), format!("SMAPI update available ({latest})")),
            tr!(format!("Kurulu sürüm {cur}. Yeni sürümler hata düzeltmeleri ve uyumluluk içerir."), format!("Installed version is {cur}. New versions bring fixes and compatibility.")),
            vec![],
            fix("install-smapi", tr!("SMAPI'yi güncelle", "Update SMAPI"), vec![], None),
        );
    }

    for w in &input.low_disk {
        let free = human_bytes(w.free);
        ctx.push(
            "warning",
            "low-disk",
            &w.label,
            tr!(format!("{} için disk alanı az", w.label), format!("Low disk space for {}", w.label)),
            tr!(format!("Yalnızca {free} boş alan kaldı. Yedekler ve kurulumlar başarısız olabilir."), format!("Only {free} free. Backups and installs may fail.")),
            vec![],
            fix("open-settings", tr!("Veri klasörünü değiştir", "Change data folder"), vec![], None),
        );
    }

    // Yinelenen kimlikler: SMAPI aynı kimliğe sahip etkin modların hepsini atlar.
    let mut dup_keys: Vec<_> = ctx.by_id.keys().cloned().collect();
    dup_keys.sort();
    for key in dup_keys {
        let list = ctx.by_id[&key].clone();
        let enabled: Vec<&ModInfo> = list.iter().copied().filter(|m| m.enabled).collect();
        if enabled.len() > 1 {
            let mut sorted = enabled.clone();
            sorted.sort_by(|a, b| version::compare(b.version.as_deref().unwrap_or("0"), a.version.as_deref().unwrap_or("0")).unwrap_or(std::cmp::Ordering::Equal));
            let keep = sorted[0];
            let others: Vec<String> = sorted[1..].iter().map(|m| m.folder.clone()).collect();
            let id = keep.unique_id.as_deref().unwrap_or(&key);
            let list = sorted.iter().map(|m| display(m)).collect::<Vec<_>>().join(", ");
            let n = enabled.len();
            ctx.push(
                "error",
                "duplicate-id",
                &key,
                tr!(format!("{} birden fazla kez kurulu", keep.name), format!("{} is installed more than once", keep.name)),
                tr!(
                    format!("Aynı kimliğe ({id}) sahip {n} etkin kopya var: {list}. SMAPI hiçbirini yüklemez."),
                    format!("There are {n} enabled copies with the same ID ({id}): {list}. SMAPI loads none of them.")
                ),
                sorted.iter().map(|m| m.folder.clone()).collect(),
                fix("disable", tr!("Eski kopyaları kapat", "Disable older copies"), others, None),
            );
        }
    }

    for m in mods.iter().filter(|m| m.enabled) {
        if let Some(err) = &m.manifest_error {
            ctx.push(
                "error",
                "manifest-error",
                &m.folder,
                tr!(format!("{} okunamıyor", m.folder_name), format!("{} can't be read", m.folder_name)),
                tr!(format!("manifest.json bozuk: {err}"), format!("manifest.json is broken: {err}")),
                vec![m.folder.clone()],
                open_folder(&m.folder),
            );
            continue;
        }
        if !m.problems.is_empty() {
            ctx.push(
                "warning",
                "manifest-problem",
                &m.folder,
                tr!(format!("{} manifest'inde eksikler var", m.name), format!("{}'s manifest is incomplete", m.name)),
                m.problems.join("; "),
                vec![m.folder.clone()],
                open_folder(&m.folder),
            );
        }
        if let Some(cp) = &m.content_pack_for {
            check_requirement(&mut ctx, m, &cp.unique_id, cp.minimum_version.as_deref(), true);
        }
        for d in m.dependencies.iter().filter(|d| d.is_required) {
            check_requirement(&mut ctx, m, &d.unique_id, d.minimum_version.as_deref(), false);
        }
        if input.smapi_installed {
            if let (Some(min), Some(cur)) = (m.minimum_api_version.as_deref(), input.smapi_version) {
                if !version::satisfies(Some(cur), Some(min)) {
                    ctx.push(
                        "error",
                        "api-too-old",
                        &m.folder,
                        tr!(format!("{} daha yeni bir SMAPI istiyor", m.name), format!("{} needs a newer SMAPI", m.name)),
                        tr!(format!("En az SMAPI {min} gerekli, kurulu olan {cur}."), format!("SMAPI {min} or newer is required; {cur} is installed.")),
                        vec![m.folder.clone()],
                        fix("install-smapi", tr!("SMAPI'yi güncelle", "Update SMAPI"), vec![], None),
                    );
                }
            }
        }
        if let (Some(min), Some(cur)) = (m.minimum_game_version.as_deref(), input.game_version) {
            if !version::satisfies(Some(cur), Some(min)) {
                ctx.push(
                    "error",
                    "game-too-old",
                    &m.folder,
                    tr!(format!("{} daha yeni bir oyun sürümü istiyor", m.name), format!("{} needs a newer game version", m.name)),
                    tr!(format!("En az Stardew Valley {min} gerekli, kurulu olan {cur}."), format!("Stardew Valley {min} or newer is required; {cur} is installed.")),
                    vec![m.folder.clone()],
                    None,
                );
            }
        }
        if !m.executables.is_empty() {
            let files = m.executables.join(", ");
            ctx.push(
                "warning",
                "executable",
                &m.folder,
                tr!(format!("{} çalıştırılabilir dosya içeriyor", m.name), format!("{} contains executable files", m.name)),
                tr!(
                    format!("Mod klasöründe beklenmeyen dosyalar var: {files}. SMAPI modları bunlara ihtiyaç duymaz; kaynağından emin değilseniz kaldırın."),
                    format!("The mod folder has unexpected files: {files}. SMAPI mods don't need these; remove them if you're unsure of the source.")
                ),
                vec![m.folder.clone()],
                fix("open-folder", tr!("Klasörü incele", "Inspect folder"), vec![m.folder.clone()], None),
            );
        }
        if let (Some(u), Some(id)) = (input.updates, m.unique_id.as_deref()) {
            if let Some(e) = u.find(id) {
                let status = e.compat_status.as_deref().unwrap_or("").to_ascii_lowercase();
                let summary = e.compat_summary.clone().unwrap_or_default();
                let disable = || fix("disable", tr!("Modu kapat", "Disable mod"), vec![m.folder.clone()], None);
                match status.as_str() {
                    "broken" if !e.has_update => ctx.push(
                        "error",
                        "broken",
                        &m.folder,
                        tr!(format!("{} bu oyun sürümünde bozuk", m.name), format!("{} is broken in this game version", m.name)),
                        tr!(format!("SMAPI uyumluluk listesine göre çalışmıyor. {summary}"), format!("It doesn't work according to SMAPI's compatibility list. {summary}")),
                        vec![m.folder.clone()],
                        disable(),
                    ),
                    "obsolete" => ctx.push(
                        "warning",
                        "obsolete",
                        &m.folder,
                        tr!(format!("{} artık gereksiz", m.name), format!("{} is obsolete", m.name)),
                        tr!(format!("Özellikleri oyuna ya da başka bir moda taşınmış. {summary}"), format!("Its features moved into the game or another mod. {summary}")),
                        vec![m.folder.clone()],
                        disable(),
                    ),
                    "abandoned" => ctx.push(
                        "info",
                        "abandoned",
                        &m.folder,
                        tr!(format!("{} artık geliştirilmiyor", m.name), format!("{} is no longer maintained", m.name)),
                        tr!(format!("Gelecekteki oyun güncellemelerinde bozulabilir. {summary}"), format!("It may break with future game updates. {summary}")),
                        vec![m.folder.clone()],
                        None,
                    ),
                    _ => {}
                }
            }
        }
    }

    if let Some(u) = input.updates {
        let updatable: Vec<String> = mods.iter().filter(|m| m.unique_id.as_deref().and_then(|id| u.find(id)).is_some_and(|e| e.has_update)).map(|m| m.folder.clone()).collect();
        if !updatable.is_empty() {
            let n = updatable.len();
            ctx.push(
                "info",
                "updates",
                "all",
                tr!(format!("{n} mod güncellenebilir"), format!("{n} mods can be updated")),
                tr!("Yeni sürümleri indirip Modstead'e sürükleyin; ayarlarınız korunarak güncellenir.", "Download the new versions and drop them on Modstead; your settings are kept.").into(),
                updatable,
                fix("view-updates", tr!("Güncellemeleri gör", "View updates"), vec![], None),
            );
        }
    }

    let no_keys: Vec<String> = mods.iter().filter(|m| m.enabled && !m.is_core && m.manifest_error.is_none() && m.update_keys.is_empty()).map(|m| m.folder.clone()).collect();
    if !no_keys.is_empty() {
        let n = no_keys.len();
        ctx.push(
            "info",
            "no-update-keys",
            "all",
            tr!(format!("{n} modun güncelleme anahtarı yok"), format!("{n} mods have no update keys")),
            tr!("Bu modların yeni sürümleri otomatik denetlenemez (manifest'te UpdateKeys yok).", "New versions of these mods can't be checked automatically (no UpdateKeys in the manifest).").into(),
            no_keys,
            None,
        );
    }

    for s in &input.scan.strays {
        match s.kind.as_str() {
            "archive" => ctx.push(
                "warning",
                "stray-archive",
                &s.path,
                tr!(format!("Mods klasöründe açılmamış arşiv: {}", s.path), format!("Unextracted archive in Mods: {}", s.path)),
                tr!("SMAPI arşivlerin içini okuyamaz. Modstead bunu güvenlik denetiminden geçirip kurabilir.", "SMAPI can't read inside archives. Modstead can run it through the security check and install it.").into(),
                vec![],
                fix("install-archive", tr!("Arşivi kur", "Install archive"), vec![], Some(s.path.clone())),
            ),
            "no-manifest" => ctx.push(
                "warning",
                "no-manifest",
                &s.path,
                tr!(format!("'{}' klasöründe manifest.json yok", s.path), format!("'{}' has no manifest.json", s.path)),
                tr!("SMAPI bu klasörü yükleyemez. Mod yanlış açılmış ya da iç içe bir klasörde olabilir.", "SMAPI can't load this folder. The mod may have been extracted wrongly or be nested in another folder.").into(),
                vec![],
                open_folder(&s.path),
            ),
            _ => {}
        }
    }

    let mut issues = ctx.issues;
    let rank = |s: &str| match s {
        "error" => 0,
        "warning" => 1,
        _ => 2,
    };
    issues.sort_by_key(|i| rank(&i.severity));
    let errors = issues.iter().filter(|i| i.severity == "error").count() as u32;
    let warnings = issues.iter().filter(|i| i.severity == "warning").count() as u32;
    let infos = issues.len() as u32 - errors - warnings;
    let penalty = errors * 12 + warnings * 4;
    let mut score = 100u32.saturating_sub(penalty).max(if errors > 0 { 0 } else { 40 });
    // Hata varken puan "iyi" aralığına çıkmaz; oyun ya da SMAPI yoksa hiçbir mod çalışmaz.
    if errors > 0 {
        score = score.min(79);
    }
    if issues.iter().any(|i| matches!(i.kind.as_str(), "game-missing" | "smapi-missing")) {
        score = score.min(40);
    }
    let score = score as u8;
    HealthReport { score, errors, warnings, infos, issues }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::manifest::{ContentPackFor, Dependency};

    pub fn m(folder: &str, id: &str, ver: &str, enabled: bool) -> ModInfo {
        ModInfo {
            folder: folder.into(),
            folder_name: folder.trim_start_matches('.').into(),
            group: None,
            enabled,
            disabled_by_parent: false,
            manifest_error: None,
            problems: vec![],
            unique_id: Some(id.into()),
            name: folder.trim_start_matches('.').into(),
            author: Some("a".into()),
            version: Some(ver.into()),
            description: None,
            kind: "smapi".into(),
            entry_dll: Some("x.dll".into()),
            content_pack_for: None,
            minimum_api_version: None,
            minimum_game_version: None,
            dependencies: vec![],
            update_keys: vec!["Nexus:1".into()],
            nexus_id: Some(1),
            size: 0,
            file_count: 1,
            modified: 0,
            has_config: false,
            executables: vec![],
            dlls: vec![],
            is_core: false,
        }
    }

    fn run(mods: Vec<ModInfo>) -> HealthReport {
        let scan = ScanResult { mods, exists: true, ..Default::default() };
        analyze(&Input { scan: &scan, game_found: true, game_version: Some("1.6.15"), smapi_installed: true, smapi_version: Some("4.5.2"), updates: None, low_disk: vec![] })
    }

    #[test]
    fn healthy_setup_scores_100() {
        let r = run(vec![m("ContentPatcher", "Pathoschild.ContentPatcher", "2.9.1", true)]);
        assert_eq!(r.errors, 0);
        assert_eq!(r.score, 100);
    }

    #[test]
    fn detects_missing_disabled_and_outdated_deps() {
        let mut pack = m("[CP] Pack", "a.pack", "1.0", true);
        pack.kind = "content".into();
        pack.content_pack_for = Some(ContentPackFor { unique_id: "Pathoschild.ContentPatcher".into(), minimum_version: Some("3.0".into()) });
        pack.dependencies = vec![
            Dependency { unique_id: "missing.mod".into(), minimum_version: None, is_required: true },
            Dependency { unique_id: "optional.mod".into(), minimum_version: None, is_required: false },
            Dependency { unique_id: "off.mod".into(), minimum_version: None, is_required: true },
        ];
        let cp = m("ContentPatcher", "Pathoschild.ContentPatcher", "2.9.1", true);
        let off = m(".Off", "off.mod", "1.0", false);
        let r = run(vec![pack, cp, off]);
        let kinds: Vec<&str> = r.issues.iter().map(|i| i.kind.as_str()).collect();
        assert!(kinds.contains(&"missing-dependency"));
        assert!(kinds.contains(&"disabled-dependency"));
        assert!(kinds.contains(&"outdated-dependency"));
        assert_eq!(r.issues.iter().filter(|i| i.kind == "missing-dependency").count(), 1, "isteğe bağlı bağımlılık sorun sayılmamalı");
        let enable = r.issues.iter().find(|i| i.kind == "disabled-dependency").unwrap().fix.as_ref().unwrap();
        assert_eq!(enable.kind, "enable");
        assert_eq!(enable.folders, vec![".Off".to_string()]);
    }

    #[test]
    fn detects_duplicates_and_keeps_newest() {
        let r = run(vec![m("A old", "x.dup", "1.0", true), m("A new", "x.dup", "1.2", true)]);
        let dup = r.issues.iter().find(|i| i.kind == "duplicate-id").unwrap();
        assert_eq!(dup.fix.as_ref().unwrap().folders, vec!["A old".to_string()]);
    }

    #[test]
    fn detects_api_and_game_requirements() {
        let mut a = m("A", "a.a", "1.0", true);
        a.minimum_api_version = Some("5.0.0".into());
        a.minimum_game_version = Some("1.7".into());
        let r = run(vec![a]);
        assert!(r.issues.iter().any(|i| i.kind == "api-too-old"));
        assert!(r.issues.iter().any(|i| i.kind == "game-too-old"));
    }

    #[test]
    fn missing_smapi_caps_the_score() {
        let scan = ScanResult { mods: vec![m("A", "a.a", "1.0", true)], exists: true, ..Default::default() };
        let r = analyze(&Input { scan: &scan, game_found: true, game_version: Some("1.6.15"), smapi_installed: false, smapi_version: None, updates: None, low_disk: vec![] });
        assert_eq!(r.issues[0].kind, "smapi-missing");
        assert!(r.score <= 40);
        let r = run(vec![m("A", "a.a", "1.0", true), m("B", "a.a", "1.1", true)]);
        assert!(r.errors > 0 && r.score < 80, "hata varken puan iyi aralıkta olmamalı");
    }

    #[test]
    fn disabled_mods_are_not_checked() {
        let mut a = m(".A", "a.a", "1.0", false);
        a.dependencies = vec![Dependency { unique_id: "missing".into(), minimum_version: None, is_required: true }];
        let r = run(vec![a]);
        assert_eq!(r.errors, 0);
    }
}
