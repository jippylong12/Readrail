mod commands;
mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      if let Err(error) = commands::keychain::configure_keyring() {
        log::warn!("Keychain store initialization failed: {error}");
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::keychain::keychain_set_gemini_key,
      commands::keychain::keychain_has_gemini_key,
      commands::keychain::keychain_delete_gemini_key,
      commands::keychain::keychain_get_gemini_key_for_ocr,
      commands::files::file_pick_import,
      commands::export::export_progress
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
