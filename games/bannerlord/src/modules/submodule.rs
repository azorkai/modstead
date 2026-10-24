//! SubModule.xml okuyucu. Alan adları oyunun kendi okuyucusuyla aynıdır
//! (TaleWorlds.ModuleManager.ModuleInfo.LoadWithFullPath) ve
//! topluluk eklentileri (DependedModuleMetadatas, UpdateInfo, Url) de desteklenir.

use std::fs;
use std::path::Path;

use roxmltree::{Document, Node, ParsingOptions};
use serde::Serialize;

use modstead_core::security::motw;
use modstead_core::tr;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Location {
    Modules,
    Workshop,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DepKind {
    Required,
    Optional,
    Incompatible,
}

/// Bağımlılığın bu modüle göre yükleme yönü.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DepOrder {
    /// Bağımlılık bu modülden önce yüklenmeli.
    Before,
    /// Bağımlılık bu modülden sonra yüklenmeli.
    After,
    Any,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DepRef {
    pub id: String,
    pub kind: DepKind,
    pub order: DepOrder,
    pub version: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubModuleRef {
    pub name: String,
    pub dll: Option<String>,
    pub class_type: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DllRef {
    pub name: String,
    pub declared: bool,
    pub exists: bool,
    pub blocked: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSource {
    /// "nexus" | "github"
    pub provider: String,
    pub value: String,
    pub url: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub folder: String,
    pub path: String,
    pub location: Location,
    pub workshop_id: Option<String>,
    pub is_official: bool,
    pub module_type: String,
    pub category: String,
    pub deps: Vec<DepRef>,
    pub sub_modules: Vec<SubModuleRef>,
    pub url: Option<String>,
    pub update_sources: Vec<UpdateSource>,
    pub dlls: Vec<DllRef>,
    pub parse_error: Option<String>,
    pub modified: i64,
}

impl ModuleInfo {
    pub fn key(&self) -> String {
        self.id.to_lowercase()
    }

    pub fn is_singleplayer(&self) -> bool {
        !matches!(
            self.category.to_ascii_lowercase().as_str(),
            "multiplayer" | "multiplayeroptional" | "server"
        )
    }

    pub fn blocked_dll_count(&self) -> usize {
        self.dlls.iter().filter(|d| d.blocked).count()
    }
}

/// UTF-8 / UTF-16 (BOM'lu) XML dosyasını metne çevirir.
pub fn decode_xml(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    String::from_utf8_lossy(body).into_owned()
}

pub fn parse_xml(text: &str) -> Result<Document<'_>, String> {
    let opts = ParsingOptions {
        allow_dtd: false,
        nodes_limit: 200_000,
        ..ParsingOptions::default()
    };
    // Bazı modlar XML bildiriminde "utf-16" yazıp UTF-8 kaydediyor; metin zaten çözüldüğü için bildirimi atla.
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    let body = if trimmed.starts_with("<?xml") {
        match trimmed.find("?>") {
            Some(end) => &trimmed[end + 2..],
            None => trimmed,
        }
    } else {
        trimmed
    };
    Document::parse_with_options(body, opts).map_err(|e| e.to_string())
}

fn child<'a, 'i>(node: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    node.children().find(|c| c.is_element() && c.tag_name().name() == name)
}

fn children<'a, 'i>(node: Node<'a, 'i>, name: &'a str) -> impl Iterator<Item = Node<'a, 'i>> + 'a {
    node.children()
        .filter(move |c| c.is_element() && c.tag_name().name() == name)
}

fn value_attr(node: Node) -> Option<String> {
    node.attribute("value")
        .or_else(|| node.attribute("Value"))
        .map(|s| s.trim().to_string())
}

fn child_value(node: Node, name: &str) -> Option<String> {
    child(node, name).and_then(value_attr).filter(|s| !s.is_empty())
}

fn attr_ci<'a>(node: Node<'a, '_>, names: &[&str]) -> Option<&'a str> {
    for n in names {
        if let Some(v) = node.attribute(*n) {
            return Some(v);
        }
    }
    None
}

fn is_true(v: Option<&str>) -> bool {
    v.map(|s| s.trim().eq_ignore_ascii_case("true")).unwrap_or(false)
}

fn push_dep(deps: &mut Vec<DepRef>, dep: DepRef) {
    if dep.id.is_empty() {
        return;
    }
    if let Some(existing) = deps.iter_mut().find(|d| d.id.eq_ignore_ascii_case(&dep.id)) {
        // En güçlü tür kazanır: Uyumsuz > Gerekli > İsteğe bağlı.
        let rank = |k: DepKind| match k {
            DepKind::Incompatible => 3,
            DepKind::Required => 2,
            DepKind::Optional => 1,
        };
        if rank(dep.kind) > rank(existing.kind) {
            existing.kind = dep.kind;
        }
        if existing.order == DepOrder::Any {
            existing.order = dep.order;
        }
        if existing.version.is_none() {
            existing.version = dep.version;
        }
    } else {
        deps.push(dep);
    }
}

/// `NexusMods:2006;GitHub:BUTR/Bannerlord.Harmony` ve `<Url>` değerlerinden güncelleme kaynakları.
pub fn parse_update_sources(update_info: Option<&str>, url: Option<&str>) -> Vec<UpdateSource> {
    let mut out: Vec<UpdateSource> = Vec::new();
    let mut add = |s: UpdateSource| {
        if !out.contains(&s) {
            out.push(s);
        }
    };
    if let Some(info) = update_info {
        for part in info.split([';', ',']) {
            let Some((provider, value)) = part.split_once(':') else { continue };
            let value = value.trim();
            match provider.trim().to_ascii_lowercase().as_str() {
                "nexusmods" | "nexus" => {
                    if !value.is_empty() && value.chars().all(|c| c.is_ascii_digit()) {
                        add(UpdateSource {
                            provider: "nexus".into(),
                            value: value.into(),
                            url: modstead_core::nexus::mod_url(crate::NEXUS, value.parse().unwrap_or(0)),
                        });
                    }
                }
                "github" => {
                    if let Some(repo) = modstead_core::github::normalize_repo(value) {
                        add(UpdateSource {
                            provider: "github".into(),
                            url: format!("https://github.com/{repo}"),
                            value: repo,
                        });
                    }
                }
                _ => {}
            }
        }
    }
    if let Some(u) = url {
        if let Some(id) = modstead_core::nexus::mod_id_from_url(crate::NEXUS, u) {
            add(UpdateSource {
                provider: "nexus".into(),
                value: id.to_string(),
                url: modstead_core::nexus::mod_url(crate::NEXUS, id),
            });
        } else if let Some(repo) = modstead_core::github::normalize_repo(u) {
            add(UpdateSource {
                provider: "github".into(),
                url: format!("https://github.com/{repo}"),
                value: repo,
            });
        }
    }
    out
}

fn mtime(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Bir modül klasörünü okur. SubModule.xml yoksa `None`.
pub fn read_module_dir(dir: &Path, location: Location) -> Option<ModuleInfo> {
    let xml_path = dir.join("SubModule.xml");
    let bytes = fs::read(&xml_path).ok()?;
    let folder = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let workshop_id = match location {
        Location::Workshop => Some(folder.clone()),
        Location::Modules => None,
    };
    let mut info = ModuleInfo {
        id: folder.clone(),
        name: folder.clone(),
        version: String::new(),
        folder: folder.clone(),
        path: dir.to_string_lossy().into_owned(),
        location,
        workshop_id,
        is_official: false,
        module_type: "Community".into(),
        category: "Singleplayer".into(),
        deps: Vec::new(),
        sub_modules: Vec::new(),
        url: None,
        update_sources: Vec::new(),
        dlls: Vec::new(),
        parse_error: None,
        modified: mtime(&xml_path),
    };

    let text = decode_xml(&bytes);
    let doc = match parse_xml(&text) {
        Ok(d) => d,
        Err(e) => {
            info.parse_error = Some(format!("{}: {e}", tr!("SubModule.xml bozuk", "SubModule.xml is malformed")));
            return Some(info);
        }
    };
    let root = doc.root_element();
    if root.tag_name().name() != "Module" {
        info.parse_error = Some(tr!("SubModule.xml içinde <Module> kökü yok", "SubModule.xml has no <Module> root").into());
        return Some(info);
    }

    match child_value(root, "Id") {
        Some(id) => info.id = id,
        None => info.parse_error = Some(tr!("SubModule.xml içinde <Id> eksik", "SubModule.xml is missing <Id>").into()),
    }
    info.name = child_value(root, "Name").unwrap_or_else(|| info.id.clone());
    info.version = child_value(root, "Version").unwrap_or_default();
    info.module_type = child_value(root, "ModuleType").unwrap_or_else(|| "Community".into());
    info.category = child_value(root, "ModuleCategory").unwrap_or_else(|| "Singleplayer".into());
    info.is_official = info.module_type.starts_with("Official");

    if let Some(deps) = child(root, "DependedModules") {
        for d in children(deps, "DependedModule") {
            let id = d.attribute("Id").unwrap_or("").trim().to_string();
            push_dep(
                &mut info.deps,
                DepRef {
                    id,
                    kind: if is_true(d.attribute("Optional")) {
                        DepKind::Optional
                    } else {
                        DepKind::Required
                    },
                    order: DepOrder::Before,
                    version: d
                        .attribute("DependentVersion")
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty()),
                },
            );
        }
    }

    if let Some(meta) = child(root, "DependedModuleMetadatas") {
        for d in children(meta, "DependedModuleMetadata") {
            let id = attr_ci(d, &["id", "Id"]).unwrap_or("").trim().to_string();
            let order = match attr_ci(d, &["order", "Order"]).map(|s| s.trim()) {
                Some("LoadBeforeThis") => DepOrder::Before,
                Some("LoadAfterThis") => DepOrder::After,
                _ => DepOrder::Any,
            };
            let kind = if is_true(attr_ci(d, &["incompatible", "Incompatible"])) {
                DepKind::Incompatible
            } else if is_true(attr_ci(d, &["optional", "Optional"])) {
                DepKind::Optional
            } else {
                DepKind::Required
            };
            push_dep(
                &mut info.deps,
                DepRef {
                    id,
                    kind,
                    order: if kind == DepKind::Incompatible { DepOrder::Any } else { order },
                    version: attr_ci(d, &["version", "Version"])
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty()),
                },
            );
        }
    }

    if let Some(after) = child(root, "ModulesToLoadAfterThis") {
        for m in children(after, "Module") {
            let id = m.attribute("Id").unwrap_or("").trim().to_string();
            push_dep(
                &mut info.deps,
                DepRef { id, kind: DepKind::Optional, order: DepOrder::After, version: None },
            );
        }
    }

    if let Some(inc) = child(root, "IncompatibleModules") {
        for m in children(inc, "Module") {
            let id = m.attribute("Id").unwrap_or("").trim().to_string();
            push_dep(
                &mut info.deps,
                DepRef { id, kind: DepKind::Incompatible, order: DepOrder::Any, version: None },
            );
        }
    }

    if let Some(subs) = child(root, "SubModules") {
        for s in children(subs, "SubModule") {
            info.sub_modules.push(SubModuleRef {
                name: child_value(s, "Name").unwrap_or_default(),
                dll: child_value(s, "DLLName"),
                class_type: child_value(s, "SubModuleClassType"),
            });
        }
    }

    info.url = child_value(root, "Url");
    let update_info = child_value(root, "UpdateInfo");
    info.update_sources = parse_update_sources(update_info.as_deref(), info.url.as_deref());

    // Kendi kendine bağımlılığı yok say.
    let own = info.id.clone();
    info.deps.retain(|d| !d.id.eq_ignore_ascii_case(&own));

    if !info.is_official {
        info.dlls = collect_dlls(dir, &info.sub_modules);
    }
    Some(info)
}

/// Modülün `bin\Win64_Shipping_Client` klasöründeki DLL'ler: bildirilen var mı, Windows engellemiş mi?
fn collect_dlls(dir: &Path, subs: &[SubModuleRef]) -> Vec<DllRef> {
    let bin = dir.join("bin").join("Win64_Shipping_Client");
    let mut out: Vec<DllRef> = Vec::new();
    let declared: Vec<String> = subs
        .iter()
        .filter_map(|s| s.dll.clone())
        .filter(|d| !d.is_empty())
        .collect();

    if let Ok(rd) = fs::read_dir(&bin) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if !name.to_ascii_lowercase().ends_with(".dll") {
                continue;
            }
            let is_declared = declared.iter().any(|d| d.eq_ignore_ascii_case(&name));
            out.push(DllRef {
                blocked: motw::is_blocked(&e.path()),
                name,
                declared: is_declared,
                exists: true,
            });
        }
    }
    for d in &declared {
        if !out.iter().any(|x| x.name.eq_ignore_ascii_case(d)) {
            out.push(DllRef { name: d.clone(), declared: true, exists: false, blocked: false });
        }
    }
    out.sort_by(|a, b| b.declared.cmp(&a.declared).then_with(|| a.name.cmp(&b.name)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_update_info() {
        let s = parse_update_sources(
            Some("NexusMods:2018;GitHub:BUTR/Bannerlord.ButterLib"),
            Some("https://www.nexusmods.com/mountandblade2bannerlord/mods/2018"),
        );
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].provider, "nexus");
        assert_eq!(s[0].value, "2018");
        assert_eq!(s[1].value, "BUTR/Bannerlord.ButterLib");
    }

    #[test]
    fn parses_module_xml() {
        let dir = std::env::temp_dir().join(format!("otag-test-{}", modstead_core::fsx::short_id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("SubModule.xml"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<Module>
  <Id value="Bannerlord.ButterLib" />
  <Name value="ButterLib" />
  <Version value="v2.10.3" />
  <ModuleType value="Community"/>
  <UpdateInfo value="NexusMods:2018" />
  <DependedModules>
    <DependedModule Id="Bannerlord.Harmony" DependentVersion="v2.2.2" />
  </DependedModules>
  <ModulesToLoadAfterThis><Module Id="Native" /></ModulesToLoadAfterThis>
  <DependedModuleMetadatas>
    <DependedModuleMetadata id="Native" order="LoadAfterThis" version="v1.0.0.*" />
    <DependedModuleMetadata id="BetterExceptionWindow" order="LoadBeforeThis" optional="true" />
    <DependedModuleMetadata id="BadMod" incompatible="true" />
  </DependedModuleMetadatas>
  <SubModules><SubModule><Name value="ButterLib" /><DLLName value="Bannerlord.ButterLib.dll" /></SubModule></SubModules>
</Module>"#,
        )
        .unwrap();
        let m = read_module_dir(&dir, Location::Modules).unwrap();
        assert_eq!(m.id, "Bannerlord.ButterLib");
        assert!(m.parse_error.is_none());
        let harmony = m.deps.iter().find(|d| d.id == "Bannerlord.Harmony").unwrap();
        assert_eq!(harmony.kind, DepKind::Required);
        assert_eq!(harmony.order, DepOrder::Before);
        let native = m.deps.iter().find(|d| d.id == "Native").unwrap();
        assert_eq!(native.kind, DepKind::Required);
        assert_eq!(native.order, DepOrder::After);
        let bad = m.deps.iter().find(|d| d.id == "BadMod").unwrap();
        assert_eq!(bad.kind, DepKind::Incompatible);
        assert_eq!(m.dlls.len(), 1);
        assert!(!m.dlls[0].exists);
        let _ = fs::remove_dir_all(&dir);
    }
}
