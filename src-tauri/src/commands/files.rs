use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePickImportRequest {
    pub allowed_kinds: Vec<String>,
}

#[derive(Serialize)]
pub struct ImportFileInfo {
    pub path: String,
    pub name: String,
    pub kind: String,
}

#[derive(Serialize)]
pub struct FilePickImportResponse {
    pub files: Vec<ImportFileInfo>,
}

#[tauri::command]
pub fn file_pick_import(request: FilePickImportRequest) -> Result<FilePickImportResponse, String> {
    let _allowed_kinds = request.allowed_kinds;
    Ok(FilePickImportResponse { files: vec![] })
}
