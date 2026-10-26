use std::path::Path;

fn main() {
    let dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    // Tauri'ye bağlanan test ikilileri Common Controls v6 bildirimi olmadan Windows'ta açılmaz
    // (STATUS_ENTRYPOINT_NOT_FOUND). Uygulamanın bildirimi bu paketin test ikililerine de gömülür.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        let manifest = Path::new(&dir).join("..").join("..").join("src-tauri").join("app.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
    photos(&dir);
}

/// Uçak fotoğrafları (`ui/career/aircraft/photos/*.jpg`): Modstead'in yerel sunucusu bunları simin içindeki
/// menüye verir (bkz. `career::families`). Liste klasörden üretilir; fotoğraf eklenince elle güncellenmez.
fn photos(dir: &str) {
    let photos = Path::new(dir).join("ui").join("career").join("aircraft").join("photos");
    println!("cargo:rerun-if-changed={}", photos.display());
    let mut files: Vec<_> = std::fs::read_dir(&photos)
        .map(|r| r.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "jpg")).collect())
        .unwrap_or_default();
    files.sort();
    let mut code = String::from("pub static PHOTOS: &[(&str, &[u8])] = &[\n");
    for f in files {
        let id = f.file_stem().unwrap().to_string_lossy().into_owned();
        code.push_str(&format!("    ({id:?}, include_bytes!({:?})),\n", f.display().to_string()));
    }
    code.push_str("];\n");
    let out = Path::new(&std::env::var("OUT_DIR").unwrap()).join("photos.rs");
    std::fs::write(out, code).unwrap();
}
