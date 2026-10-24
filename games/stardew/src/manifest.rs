//! manifest.json okuyucu. SMAPI dosyaları Newtonsoft.Json ile okuduğu için yorum satırlarını,
//! sondaki virgülleri ve büyük/küçük harf farkını tolere eder; biz de aynısını yapıyoruz.
//! Hoşgörülü okuma bağımlılıksızdır (Vadi `json5` kullanıyordu): önce katı JSON denenir,
//! olmazsa yorumlar ve sondaki virgüller dizeler dışında temizlenip yeniden denenir.

use std::path::Path;

use modstead_core::{tr, version};
use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub unique_id: Option<String>,
    pub name: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub entry_dll: Option<String>,
    pub content_pack_for: Option<ContentPackFor>,
    pub minimum_api_version: Option<String>,
    pub minimum_game_version: Option<String>,
    pub dependencies: Vec<Dependency>,
    pub update_keys: Vec<String>,
    /// Zorunlu alanlardaki eksikler (SMAPI bu modu yüklemeyi reddedebilir).
    pub problems: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContentPackFor {
    pub unique_id: String,
    pub minimum_version: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub unique_id: String,
    pub minimum_version: Option<String>,
    pub is_required: bool,
}

fn get<'a>(obj: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    obj.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v)
}

fn text(v: Option<&Value>) -> Option<String> {
    let s = match v? {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        _ => return None,
    };
    if s.is_empty() { None } else { Some(s) }
}

/// Dizelerin dışındaki `//` ve `/* */` yorumlarını kaldırır.
fn strip_comments(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let mut in_str = false;
    while i < c.len() {
        if in_str {
            out.push(c[i]);
            if c[i] == '\\' && i + 1 < c.len() {
                out.push(c[i + 1]);
                i += 2;
                continue;
            }
            if c[i] == '"' {
                in_str = false;
            }
            i += 1;
            continue;
        }
        match (c[i], c.get(i + 1)) {
            ('"', _) => {
                in_str = true;
                out.push('"');
                i += 1;
            }
            ('/', Some('/')) => {
                while i < c.len() && c[i] != '\n' {
                    i += 1;
                }
            }
            ('/', Some('*')) => {
                i += 2;
                while i < c.len() && !(c[i] == '*' && c.get(i + 1) == Some(&'/')) {
                    i += 1;
                }
                i += 2;
                out.push(' ');
            }
            (ch, _) => {
                out.push(ch);
                i += 1;
            }
        }
    }
    out
}

/// Dizelerin dışında, ardından (boşluktan sonra) `}` ya da `]` gelen virgülleri kaldırır.
fn strip_trailing_commas(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut in_str = false;
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        if in_str {
            out.push(ch);
            if ch == '\\' && i + 1 < c.len() {
                out.push(c[i + 1]);
                i += 2;
                continue;
            }
            if ch == '"' {
                in_str = false;
            }
        } else if ch == '"' {
            in_str = true;
            out.push(ch);
        } else if ch == ',' {
            let next = c[i + 1..].iter().find(|x| !x.is_whitespace());
            if !matches!(next, Some('}') | Some(']')) {
                out.push(ch);
            }
        } else {
            out.push(ch);
        }
        i += 1;
    }
    out
}

/// Newtonsoft'un kabul ettiği gevşek JSON'u okur (yorum, sondaki virgül, BOM).
pub fn parse_lenient(raw: &str) -> Result<Value, String> {
    let raw = raw.trim_start_matches('\u{feff}');
    match serde_json::from_str::<Value>(raw) {
        Ok(v) => Ok(v),
        Err(strict) => serde_json::from_str::<Value>(&strip_trailing_commas(&strip_comments(raw)))
            .map_err(|_| format!("{}: {strict}", tr!("Geçersiz JSON", "Invalid JSON"))),
    }
}

pub fn parse_manifest(raw: &str) -> Result<Manifest, String> {
    let value = parse_lenient(raw)?;
    let obj = value.as_object().ok_or_else(|| tr!("manifest.json bir JSON nesnesi değil", "manifest.json is not a JSON object").to_string())?;

    let mut m = Manifest {
        unique_id: text(get(obj, "UniqueID")),
        name: text(get(obj, "Name")),
        author: text(get(obj, "Author")),
        version: text(get(obj, "Version")),
        description: text(get(obj, "Description")),
        entry_dll: text(get(obj, "EntryDll")),
        minimum_api_version: text(get(obj, "MinimumApiVersion")),
        minimum_game_version: text(get(obj, "MinimumGameVersion")),
        ..Default::default()
    };

    if let Some(Value::Object(cp)) = get(obj, "ContentPackFor") {
        if let Some(id) = text(get(cp, "UniqueID")) {
            m.content_pack_for = Some(ContentPackFor { unique_id: id, minimum_version: text(get(cp, "MinimumVersion")) });
        }
    }

    if let Some(Value::Array(deps)) = get(obj, "Dependencies") {
        for d in deps.iter().filter_map(Value::as_object) {
            if let Some(id) = text(get(d, "UniqueID")) {
                let is_required = match get(d, "IsRequired") {
                    Some(Value::Bool(b)) => *b,
                    Some(Value::String(s)) => !s.eq_ignore_ascii_case("false"),
                    _ => true,
                };
                m.dependencies.push(Dependency { unique_id: id, minimum_version: text(get(d, "MinimumVersion")), is_required });
            }
        }
    }

    match get(obj, "UpdateKeys") {
        Some(Value::Array(keys)) => m.update_keys = keys.iter().filter_map(|k| text(Some(k))).collect(),
        Some(v @ Value::String(_)) => m.update_keys = text(Some(v)).into_iter().collect(),
        _ => {}
    }

    for (field, missing) in [("Name", m.name.is_none()), ("Author", m.author.is_none()), ("Version", m.version.is_none()), ("UniqueID", m.unique_id.is_none())] {
        if missing {
            m.problems.push(tr!(format!("'{field}' alanı eksik"), format!("'{field}' field is missing")));
        }
    }
    if let Some(v) = &m.version {
        if version::Version::parse(v).is_none() {
            m.problems.push(tr!(format!("Sürüm '{v}' geçerli bir sürüm biçimi değil"), format!("Version '{v}' is not a valid version format")));
        }
    }
    if m.entry_dll.is_none() && m.content_pack_for.is_none() {
        m.problems.push(tr!("Ne 'EntryDll' ne de 'ContentPackFor' tanımlı", "Neither 'EntryDll' nor 'ContentPackFor' is set").into());
    }
    Ok(m)
}

pub fn read_manifest(path: &Path) -> Result<Manifest, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", tr!("Okunamadı", "Could not read")))?;
    parse_manifest(&String::from_utf8_lossy(&bytes))
}

/// "Nexus:1915", "nexus: 1915@main" gibi anahtarlardan Nexus kimliğini çıkarır.
pub fn nexus_id(keys: &[String]) -> Option<u64> {
    keys.iter().find_map(|k| {
        let (site, rest) = k.split_once(':')?;
        if !site.trim().eq_ignore_ascii_case("nexus") {
            return None;
        }
        let id: String = rest.trim().chars().take_while(|c| c.is_ascii_digit()).collect();
        id.parse().ok().filter(|n| *n > 0)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tolerates_comments_trailing_commas_and_case() {
        let raw = "\u{feff}{
            // yorum, \"tırnaklı\" da olsa
            \"name\": \"Test // Mod\",
            \"AUTHOR\": \"Biri\", /* blok yorum */
            \"Version\": \"1.2.0\",
            \"uniqueId\": \"biri.test\",
            \"EntryDll\": \"Test.dll\",
            \"Dependencies\": [
                { \"UniqueID\": \"Pathoschild.ContentPatcher\", \"MinimumVersion\": \"2.0\" },
                { \"UniqueID\": \"spacechase0.GenericModConfigMenu\", \"IsRequired\": false },
            ],
            \"UpdateKeys\": [\"Nexus:1915\"],
        }";
        let m = parse_manifest(raw).unwrap();
        assert_eq!(m.name.as_deref(), Some("Test // Mod"));
        assert_eq!(m.author.as_deref(), Some("Biri"));
        assert_eq!(m.unique_id.as_deref(), Some("biri.test"));
        assert_eq!(m.dependencies.len(), 2);
        assert!(m.dependencies[0].is_required);
        assert!(!m.dependencies[1].is_required);
        assert_eq!(nexus_id(&m.update_keys), Some(1915));
        assert!(m.problems.is_empty());
    }

    #[test]
    fn keeps_commas_and_slashes_inside_strings() {
        let v = parse_lenient(r#"{"a": "x, }", "b": "http://y", "c": [1,2,],}"#).unwrap();
        assert_eq!(v["a"], "x, }");
        assert_eq!(v["b"], "http://y");
        assert_eq!(v["c"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn content_pack_and_problems() {
        let m = parse_manifest(r#"{"Name":"[CP] X","Version":"1.0","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#).unwrap();
        assert_eq!(m.content_pack_for.unwrap().unique_id, "Pathoschild.ContentPatcher");
        assert!(m.problems.iter().any(|p| p.contains("Author")));
        assert!(m.problems.iter().any(|p| p.contains("UniqueID")));
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_manifest("not json at all").is_err());
        assert!(parse_manifest("[1,2]").is_err());
        assert!(parse_manifest("{ nope").is_err());
    }

    #[test]
    fn nexus_key_variants() {
        assert_eq!(nexus_id(&["GitHub:a/b".into(), "nexus: 42@opt".into()]), Some(42));
        assert_eq!(nexus_id(&["Nexus:???".into()]), None);
    }
}
