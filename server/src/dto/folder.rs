use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::Validate;

// ============================================================================
// Request DTOs
// ============================================================================

/// Create folder request
#[derive(Debug, Clone, Deserialize, Validate, ToSchema)]
pub struct CreateFolderRequest {
    #[validate(length(min = 1, max = 255, message = "Folder name must be between 1 and 255 characters"))]
    pub folder_name: String,
}

/// Update folder request (rename)
#[derive(Debug, Clone, Deserialize, Validate, ToSchema)]
pub struct UpdateFolderRequest {
    #[validate(length(min = 1, max = 255, message = "Folder name must be between 1 and 255 characters"))]
    pub folder_name: String,
}

// ============================================================================
// Response DTOs
// ============================================================================

/// Single folder response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FolderResponse {
    pub folder_id: i32,
    pub folder_name: String,
    pub image_count: i64,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

/// List folders response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct FolderListResponse {
    pub folders: Vec<FolderResponse>,
    pub total: i64,
}

/// Delete folder response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DeleteFolderResponse {
    pub message: String,
    pub deleted_images_count: i64,
}
