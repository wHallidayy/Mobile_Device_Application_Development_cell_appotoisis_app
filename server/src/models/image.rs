//! Image Model
//!
//! Represents images stored in the system matching the `images` table.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Image model matching the `images` table
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Image {
    pub image_id: i64,
    pub folder_id: i32,
    pub file_path: String,
    pub original_filename: String,
    pub mime_type: String,
    pub file_size: i32,
    #[sqlx(default)]
    pub metadata: Option<serde_json::Value>,
    pub uploaded_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}

/// Image metadata extracted from file headers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captured_at: Option<DateTime<Utc>>,
}

impl Default for ImageMetadata {
    fn default() -> Self {
        Self {
            width: None,
            height: None,
            captured_at: None,
        }
    }
}
