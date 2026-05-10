use keyring_core::{Entry, Error as KeyringError};

use crate::models::{HasKeyResponse, OkResponse};

const SERVICE: &str = "readrail";
const ACCOUNT: &str = "gemini_api_key";

#[tauri::command]
pub fn keychain_set_gemini_key(api_key: String) -> Result<OkResponse, String> {
    if !api_key.starts_with("AIza") || api_key.len() < 20 {
        return Err("invalid_key_shape".to_string());
    }

    entry()?
        .set_password(api_key.trim())
        .map_err(|_| "keychain_write_failed".to_string())?;

    Ok(OkResponse { ok: true })
}

#[tauri::command]
pub fn keychain_has_gemini_key() -> Result<HasKeyResponse, String> {
    match entry()?.get_password() {
        Ok(_) => Ok(HasKeyResponse { has_key: true }),
        Err(KeyringError::NoEntry) => Ok(HasKeyResponse { has_key: false }),
        Err(_) => Err("keychain_read_failed".to_string()),
    }
}

#[tauri::command]
pub fn keychain_delete_gemini_key() -> Result<OkResponse, String> {
    match entry()?.delete_credential() {
        Ok(_) | Err(KeyringError::NoEntry) => Ok(OkResponse { ok: true }),
        Err(_) => Err("keychain_delete_failed".to_string()),
    }
}

#[tauri::command]
pub fn keychain_get_gemini_key_for_ocr(reason: String) -> Result<String, String> {
    if reason != "ocr" {
        return Err("invalid_key_reason".to_string());
    }

    entry()?
        .get_password()
        .map_err(|_| "keychain_read_failed".to_string())
}

pub fn configure_keyring() -> Result<(), String> {
    keyring::use_native_store(false).map_err(|_| "keychain_store_unavailable".to_string())
}

fn entry() -> Result<Entry, String> {
    configure_keyring()?;
    Entry::new(SERVICE, ACCOUNT).map_err(|_| "keychain_entry_failed".to_string())
}
