//! Yükleme listesini denetler ve her sorun için tek tıkla uygulanabilir bir çözüm önerir.

use std::collections::HashMap;

use serde::Serialize;

use super::sort::ModEntry;
use super::submodule::{DepKind, DepOrder, Location};
use super::version::AppVersion;
use super::Catalog;
use modstead_core::tr;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Fix {
    Enable {
        #[serde(rename = "moduleId")]
        module_id: String,
    },
    Disable {
        #[serde(rename = "moduleId")]
        module_id: String,
    },
    Sort,
    Unblock {
        #[serde(rename = "moduleId")]
        module_id: String,
    },
    Search {
        query: String,
    },
    RetireCopy {
        #[serde(rename = "moduleId")]
        module_id: String,
        path: String,
    },
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub id: String,
    pub severity: Severity,
    pub kind: &'static str,
    pub module_id: String,
    pub related_id: Option<String>,
    pub title: String,
    pub detail: String,
    pub fix: Option<Fix>,
}

/// "Modules klasöründe" / "in the Modules folder"
fn location_at(l: Location) -> &'static str {
    match l {
        Location::Modules => tr!("Modules klasöründe", "in the Modules folder"),
        Location::Workshop => tr!("Steam Workshop'ta", "on Steam Workshop"),
    }
}

/// "Modules klasöründeki" / "from the Modules folder"
fn location_of(l: Location) -> &'static str {
    match l {
        Location::Modules => tr!("Modules klasöründeki", "from the Modules folder"),
        Location::Workshop => tr!("Workshop'taki", "from Steam Workshop"),
    }
}

pub fn validate(order: &[ModEntry], catalog: &Catalog, game_version: Option<&str>) -> Vec<Issue> {
    let map = catalog.map();
    let pos: HashMap<String, usize> = order
        .iter()
        .enumerate()
        .map(|(i, e)| (e.id.to_lowercase(), i))
        .collect();
    let enabled: HashMap<String, bool> = order
        .iter()
        .map(|e| (e.id.to_lowercase(), e.enabled))
        .collect();
    let game_v = game_version.and_then(AppVersion::parse);
    let mut issues: Vec<Issue> = Vec::new();
    let mut push = |severity, kind: &'static str, module: &str, related: Option<&str>, title: String, detail: String, fix: Option<Fix>| {
        let id = format!("{kind}:{}:{}", module.to_lowercase(), related.unwrap_or("").to_lowercase());
        if issues.iter().any(|i: &Issue| i.id == id) {
            return;
        }
        issues.push(Issue {
            id,
            severity,
            kind,
            module_id: module.to_string(),
            related_id: related.map(|s| s.to_string()),
            title,
            detail,
            fix,
        });
    };

    for entry in order.iter().filter(|e| e.enabled) {
        let Some(m) = map.get(&entry.id.to_lowercase()).copied() else {
            continue;
        };
        let my_pos = pos[&m.key()];

        if let Some(err) = &m.parse_error {
            push(
                Severity::Error,
                "parse",
                &m.id,
                None,
                tr!(format!("{} okunamıyor", m.name), format!("{} cannot be read", m.name)),
                tr!(
                    format!("{err}. Oyun bu modülü yüklemez; modu yeniden kurun."),
                    format!("{err}. The game will not load this module; reinstall the mod.")
                ),
                Some(Fix::Disable { module_id: m.id.clone() }),
            );
            continue;
        }

        for d in &m.deps {
            let key = d.id.to_lowercase();
            let target = map.get(&key).copied();
            let target_on = enabled.get(&key).copied().unwrap_or(false);
            match d.kind {
                DepKind::Incompatible => {
                    if let Some(t) = target {
                        if target_on {
                            push(
                                Severity::Error,
                                "incompatible",
                                &m.id,
                                Some(&t.id),
                                tr!(
                                    format!("{} ile {} birlikte çalışmaz", m.name, t.name),
                                    format!("{} and {} do not work together", m.name, t.name)
                                ),
                                tr!(
                                    format!("{} kendini {} ile uyumsuz olarak işaretlemiş. Birini kapatın.", m.name, t.name),
                                    format!("{} declares itself incompatible with {}. Disable one of them.", m.name, t.name)
                                ),
                                Some(Fix::Disable { module_id: m.id.clone() }),
                            );
                        }
                    }
                }
                DepKind::Required | DepKind::Optional => {
                    let required = d.kind == DepKind::Required;
                    let Some(t) = target else {
                        if required {
                            push(
                                Severity::Error,
                                "missing",
                                &m.id,
                                Some(&d.id),
                                tr!(format!("{} için {} gerekli", m.name, d.id), format!("{} requires {}", m.name, d.id)),
                                tr!(
                                    format!("{} kurulu değil. Bu olmadan {} açılışta çökebilir.", d.id, m.name),
                                    format!("{} is not installed. Without it, {} may crash on startup.", d.id, m.name)
                                ),
                                Some(Fix::Search { query: d.id.clone() }),
                            );
                        }
                        continue;
                    };
                    if !target_on {
                        if required {
                            push(
                                Severity::Error,
                                "disabled",
                                &m.id,
                                Some(&t.id),
                                tr!(
                                    format!("{} kapalı ama {} buna bağlı", t.name, m.name),
                                    format!("{} is disabled but {} depends on it", t.name, m.name)
                                ),
                                tr!(format!("{} etkinleştirilmeli.", t.name), format!("{} must be enabled.", t.name)),
                                Some(Fix::Enable { module_id: t.id.clone() }),
                            );
                        }
                        continue;
                    }
                    let t_pos = pos[&t.key()];
                    let violated = match d.order {
                        DepOrder::Before => t_pos > my_pos,
                        DepOrder::After => t_pos < my_pos,
                        DepOrder::Any => false,
                    };
                    if violated {
                        let (first, second) = if d.order == DepOrder::Before { (t, m) } else { (m, t) };
                        push(
                            if required { Severity::Error } else { Severity::Warning },
                            "order",
                            &m.id,
                            Some(&t.id),
                            tr!(
                                format!("{} → {} sırası yanlış", first.name, second.name),
                                format!("{} → {} are in the wrong order", first.name, second.name)
                            ),
                            tr!(
                                format!("{}, {} modülünden önce yüklenmeli.", first.name, second.name),
                                format!("{} must load before {}.", first.name, second.name)
                            ),
                            Some(Fix::Sort),
                        );
                    }
                    if let (Some(req), Some(have)) = (
                        d.version.as_deref().and_then(AppVersion::parse),
                        AppVersion::parse(&t.version),
                    ) {
                        if !AppVersion::satisfies(&have, &req) {
                            let req_text = d.version.clone().unwrap_or_default();
                            if t.is_official {
                                if required {
                                    let game = game_version.unwrap_or(&t.version);
                                    push(
                                        Severity::Warning,
                                        "game-version",
                                        &m.id,
                                        Some(&t.id),
                                        tr!(
                                            format!("{} farklı bir oyun sürümü bekliyor", m.name),
                                            format!("{} expects a different game version", m.name)
                                        ),
                                        tr!(
                                            format!("Mod {req_text} için hazırlanmış, oyununuz {game}. Çökme olursa önce bu modu kapatın."),
                                            format!("The mod targets {req_text}, your game is {game}. If the game crashes, disable this mod first.")
                                        ),
                                        None,
                                    );
                                }
                            } else {
                                push(
                                    if required { Severity::Warning } else { Severity::Info },
                                    "version",
                                    &m.id,
                                    Some(&t.id),
                                    tr!(
                                        format!("{} için {} {} gerekli", m.name, t.name, req_text),
                                        format!("{} requires {} {}", m.name, t.name, req_text)
                                    ),
                                    tr!(
                                        format!("Kurulu sürüm {}. Güncellemeler sekmesinden yenisini alabilirsiniz.", t.version),
                                        format!("Installed version is {}. You can get a newer one from the Updates tab.", t.version)
                                    ),
                                    Some(Fix::Search { query: t.id.clone() }),
                                );
                            }
                        } else if t.is_official && required && t.id.eq_ignore_ascii_case("Native") {
                            if let Some(g) = &game_v {
                                if !req.wildcard && req.major_minor() < g.major_minor() && req.part_count() >= 2 {
                                    let target_v = d.version.clone().unwrap_or_default();
                                    let game = game_version.unwrap_or("");
                                    push(
                                        Severity::Info,
                                        "old-build",
                                        &m.id,
                                        Some(&t.id),
                                        tr!(
                                            format!("{} eski bir oyun sürümü için yapılmış", m.name),
                                            format!("{} was built for an older game version", m.name)
                                        ),
                                        tr!(
                                            format!("Mod {target_v} hedefliyor, oyununuz {game}. Çoğu zaman çalışır ama sorun çıkarsa güncel sürümünü arayın."),
                                            format!("The mod targets {target_v}, your game is {game}. It usually works, but look for an updated version if you run into problems.")
                                        ),
                                        None,
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        let blocked = m.blocked_dll_count();
        if blocked > 0 {
            push(
                Severity::Error,
                "blocked",
                &m.id,
                None,
                tr!(
                    format!("{}: Windows {} DLL'yi engellemiş", m.name, blocked),
                    format!("{}: Windows has blocked {} DLL(s)", m.name, blocked)
                ),
                tr!(
                    "İnternetten indirilen DLL'ler işaretlenir ve oyun bunları yükleyemez. Engeli kaldırmak dosyaları değiştirmez.",
                    "DLLs downloaded from the internet are marked and the game cannot load them. Unblocking does not modify the files."
                )
                .into(),
                Some(Fix::Unblock { module_id: m.id.clone() }),
            );
        }
        let missing: Vec<&str> = m
            .dlls
            .iter()
            .filter(|d| d.declared && !d.exists)
            .map(|d| d.name.as_str())
            .collect();
        if !missing.is_empty() {
            let list = missing.join(", ");
            push(
                Severity::Error,
                "missing-dll",
                &m.id,
                None,
                tr!(format!("{}: DLL dosyası eksik", m.name), format!("{}: DLL file missing", m.name)),
                tr!(
                    format!("Bulunamadı: {list}. Mod eksik kurulmuş; yeniden kurun."),
                    format!("Not found: {list}. The mod is incompletely installed; reinstall it.")
                ),
                None,
            );
        }
    }

    if let Some(native) = order.iter().find(|e| e.id.eq_ignore_ascii_case("Native")) {
        if !native.enabled {
            push(
                Severity::Error,
                "native-off",
                "Native",
                None,
                tr!("Native kapalı", "Native is disabled").into(),
                tr!(
                    "Native oyunun çekirdeğidir; kapalıyken oyun açılmaz.",
                    "Native is the core of the game; the game will not start without it."
                )
                .into(),
                Some(Fix::Enable { module_id: "Native".into() }),
            );
        }
    }

    for s in &catalog.shadowed {
        let Some(e) = map.get(&s.key()).copied() else { continue };
        let newer_hidden = super::version::is_newer(&s.version, &e.version);
        let detail = tr!(
            format!(
                "{} sürümü {}, {} sürümü {}. Oyun yalnızca {} kopyayı yükler{}",
                e.version,
                location_at(e.location),
                s.version,
                location_at(s.location),
                location_of(e.location),
                if newer_hidden { "; daha yeni olan kullanılmıyor." } else { "." }
            ),
            format!(
                "Version {} is {}, version {} is {}. The game only loads the copy {}{}",
                e.version,
                location_at(e.location),
                s.version,
                location_at(s.location),
                location_of(e.location),
                if newer_hidden { "; the newer one is not used." } else { "." }
            )
        );
        let fix = if newer_hidden && e.location == Location::Modules {
            Some(Fix::RetireCopy { module_id: e.id.clone(), path: e.path.clone() })
        } else {
            None
        };
        push(
            if newer_hidden { Severity::Warning } else { Severity::Info },
            "duplicate",
            &e.id,
            Some(&s.path),
            tr!(format!("{} iki kez kurulu", e.name), format!("{} is installed twice", e.name)),
            detail,
            fix,
        );
    }

    issues.sort_by(|a, b| a.severity.cmp(&b.severity));
    issues
}

impl AppVersion {
    pub fn part_count(&self) -> usize {
        self.parts.len()
    }
}

/// Sıralama döngüsünü sorun listesine ekler.
pub fn cycle_issue(cycle: &[String]) -> Option<Issue> {
    if cycle.is_empty() {
        return None;
    }
    let list = cycle.join(" ↔ ");
    Some(Issue {
        id: format!("cycle:{}", cycle.join(",").to_lowercase()),
        severity: Severity::Error,
        kind: "cycle",
        module_id: cycle[0].clone(),
        related_id: None,
        title: tr!("Döngüsel bağımlılık", "Circular dependency").into(),
        detail: tr!(
            format!("Bu modüller birbirini bekliyor: {list}. Birini kapatmadan sıralanamaz."),
            format!("These modules wait on each other: {list}. They cannot be sorted until one is disabled.")
        ),
        fix: None,
    })
}
