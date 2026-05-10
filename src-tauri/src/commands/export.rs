use serde::{Deserialize, Serialize};

use crate::models::OkResponse;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgressRequest {
    pub format: String,
    pub date_range: Option<DateRange>,
}

#[derive(Deserialize)]
pub struct DateRange {
    pub from: String,
    pub to: String,
}

#[derive(Serialize)]
pub struct ExportProgressResponse {
    pub ok: bool,
    pub path: String,
}

#[tauri::command]
pub fn export_progress(request: ExportProgressRequest) -> Result<ExportProgressResponse, String> {
    if request.format != "csv" && request.format != "json" {
        return Err("unsupported_export_format".to_string());
    }

    if let Some(range) = request.date_range {
        let _from = range.from;
        let _to = range.to;
    }

    Ok(ExportProgressResponse {
        ok: OkResponse { ok: true }.ok,
        path: String::new(),
    })
}
