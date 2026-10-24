//! `Documents\Mount and Blade II Bannerlord\Configs\LauncherData.xml`
//! Şema, başlatıcının UserData sınıfından alındı: GameType, SingleplayerData,
//! MultiplayerData ve DLLCheckData. Bilinmeyen DLLCheckData bölümü olduğu gibi korunur.

use std::fs;
use std::path::Path;

use roxmltree::Node;
use serde::Serialize;

use modstead_core::{AppError, AppResult, fsx, tr};

use crate::modules::submodule::{decode_xml, parse_xml};

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserModData {
    pub id: String,
    pub last_known_version: String,
    pub is_selected: bool,
}

#[derive(Clone, Debug, Default)]
pub struct LauncherData {
    pub game_type: String,
    pub singleplayer: Vec<UserModData>,
    pub multiplayer: Vec<UserModData>,
    /// `<DLLCheckData>…</DLLCheckData>` bölümünün ham metni.
    pub dll_check_raw: Option<String>,
}

fn text_of(node: Node, name: &str) -> String {
    node.children()
        .find(|c| c.is_element() && c.tag_name().name() == name)
        .and_then(|c| c.text())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn read_mod_datas(parent: Option<Node>) -> Vec<UserModData> {
    let Some(parent) = parent else { return Vec::new() };
    let Some(datas) = parent
        .children()
        .find(|c| c.is_element() && c.tag_name().name() == "ModDatas")
    else {
        return Vec::new();
    };
    datas
        .children()
        .filter(|c| c.is_element() && c.tag_name().name() == "UserModData")
        .map(|n| UserModData {
            id: text_of(n, "Id"),
            last_known_version: text_of(n, "LastKnownVersion"),
            is_selected: text_of(n, "IsSelected").eq_ignore_ascii_case("true"),
        })
        .filter(|m| !m.id.is_empty())
        .collect()
}

pub fn read(path: &Path) -> AppResult<LauncherData> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(LauncherData { game_type: "Singleplayer".into(), ..Default::default() })
        }
        Err(e) => return Err(e.into()),
    };
    let text = decode_xml(&bytes);
    let doc = parse_xml(&text).map_err(|e| AppError::msg(format!("{}: {e}", tr!("LauncherData.xml okunamadı", "could not read LauncherData.xml"))))?;
    let root = doc.root_element();
    let find = |name: &str| root.children().find(|c| c.is_element() && c.tag_name().name() == name);
    let game_type = find("GameType")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Singleplayer".into());
    let dll_check_raw = find("DLLCheckData").map(|n| doc.input_text()[n.range()].to_string());
    Ok(LauncherData {
        game_type,
        singleplayer: read_mod_datas(find("SingleplayerData")),
        multiplayer: read_mod_datas(find("MultiplayerData")),
        dll_check_raw,
    })
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn write_mod_datas(out: &mut String, tag: &str, mods: &[UserModData]) {
    out.push_str(&format!("  <{tag}>\n    <ModDatas>\n"));
    for m in mods {
        out.push_str("      <UserModData>\n");
        out.push_str(&format!("        <Id>{}</Id>\n", esc(&m.id)));
        out.push_str(&format!("        <LastKnownVersion>{}</LastKnownVersion>\n", esc(&m.last_known_version)));
        out.push_str(&format!("        <IsSelected>{}</IsSelected>\n", if m.is_selected { "true" } else { "false" }));
        out.push_str("      </UserModData>\n");
    }
    out.push_str(&format!("    </ModDatas>\n  </{tag}>\n"));
}

pub fn serialize(data: &LauncherData) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<UserData xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\n",
    );
    let gt = if data.game_type.is_empty() { "Singleplayer" } else { &data.game_type };
    out.push_str(&format!("  <GameType>{}</GameType>\n", esc(gt)));
    write_mod_datas(&mut out, "SingleplayerData", &data.singleplayer);
    write_mod_datas(&mut out, "MultiplayerData", &data.multiplayer);
    if let Some(raw) = &data.dll_check_raw {
        out.push_str("  ");
        out.push_str(raw.trim());
        out.push('\n');
    }
    out.push_str("</UserData>\n");
    out
}

/// Önce mevcut dosyanın yedeğini alır, sonra atomik olarak yazar. Yazılanı geri okuyup doğrular.
pub fn write(path: &Path, data: &LauncherData, backup_dir: &Path) -> AppResult<()> {
    if path.is_file() {
        fs::create_dir_all(backup_dir)?;
        // Milisaniye damgası sabit genişlikte: ad sırası = zaman sırası.
        fs::copy(path, backup_dir.join(format!("LauncherData-{}.xml", fsx::now_ms())))?;
        prune(backup_dir, 25);
    }
    let xml = serialize(data);
    parse_xml(&xml).map_err(|e| AppError::msg(format!("{}: {e}", tr!("üretilen LauncherData geçersiz", "generated LauncherData is invalid"))))?;
    fsx::atomic_write(path, xml.as_bytes())?;
    let check = read(path)?;
    if check.singleplayer != data.singleplayer {
        return Err(AppError::msg(tr!("LauncherData.xml yazıldıktan sonra doğrulanamadı", "LauncherData.xml could not be verified after writing")));
    }
    Ok(())
}

fn prune(dir: &Path, keep: usize) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut files: Vec<_> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().map(|n| n.to_string_lossy().starts_with("LauncherData-")).unwrap_or(false))
        .collect();
    files.sort();
    while files.len() > keep {
        let _ = fs::remove_file(files.remove(0));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_preserves_dll_check_data() {
        let src = r#"<?xml version="1.0" encoding="utf-8"?>
<UserData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <GameType>Singleplayer</GameType>
  <SingleplayerData>
    <ModDatas>
      <UserModData><Id>Native</Id><LastKnownVersion>v1.2.12.77991</LastKnownVersion><IsSelected>true</IsSelected></UserModData>
      <UserModData><Id>A &amp; B</Id><LastKnownVersion>v1</LastKnownVersion><IsSelected>false</IsSelected></UserModData>
    </ModDatas>
  </SingleplayerData>
  <MultiplayerData><ModDatas /></MultiplayerData>
  <DLLCheckData>
    <DLLData><DLLCheckData><DLLName>X.dll</DLLName><DLLVerifyInformation /><LatestSizeInBytes>0</LatestSizeInBytes><IsDangerous>true</IsDangerous></DLLCheckData></DLLData>
  </DLLCheckData>
</UserData>"#;
        let dir = std::env::temp_dir().join(format!("modstead-ld-{}", fsx::short_id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("LauncherData.xml");
        fs::write(&p, src).unwrap();
        let data = read(&p).unwrap();
        assert_eq!(data.singleplayer.len(), 2);
        assert_eq!(data.singleplayer[1].id, "A & B");
        assert!(data.dll_check_raw.as_ref().unwrap().contains("X.dll"));
        write(&p, &data, &dir.join("bak")).unwrap();
        let again = read(&p).unwrap();
        assert_eq!(again.singleplayer, data.singleplayer);
        assert_eq!(again.dll_check_raw.as_deref().map(str::trim), data.dll_check_raw.as_deref().map(str::trim));
        assert_eq!(fs::read_dir(dir.join("bak")).unwrap().count(), 1);
        let _ = fs::remove_dir_all(&dir);
    }
}
