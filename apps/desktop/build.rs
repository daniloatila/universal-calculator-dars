fn main() {
    let permissions = tauri_build::AppManifest::new()
        .commands(&["dars_native_capabilities", "dars_intelligence"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(permissions))
        .expect("DARS desktop permissions failed to build");
}
