fn main() {
    // Uygulama bildirimi (Common Controls v6) Tauri'nin kaynak dosyası yerine bağlayıcıyla gömülür;
    // böylece birim testi ikilileri de aynı bildirimi alır. Aksi halde Windows eski comctl32'yi
    // yükler ve test ikilisi STATUS_ENTRYPOINT_NOT_FOUND ile açılmaz.
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows)).expect("tauri-build başarısız");

    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("app.manifest");
        println!("cargo:rerun-if-changed=app.manifest");
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
}
