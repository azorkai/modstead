fn main() {
    // Tauri'ye bağlanan test ikilileri Common Controls v6 bildirimi olmadan Windows'ta açılmaz
    // (STATUS_ENTRYPOINT_NOT_FOUND). Uygulamanın bildirimi bu paketin test ikililerine de gömülür.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        let dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let manifest = std::path::Path::new(&dir).join("..").join("..").join("src-tauri").join("app.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
}
