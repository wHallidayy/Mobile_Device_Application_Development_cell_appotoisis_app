use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Folder model matching the `folders` table
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Folder {
    pub folder_id: i32,
    pub user_id: uuid::Uuid,
    pub folder_name: String,
    pub created_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
}
