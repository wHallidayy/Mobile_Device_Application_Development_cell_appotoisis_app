use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use validator::{Validate, ValidationError};

// ============================================================================
// Request DTOs
// ============================================================================

/// Create folder request
#[derive(Debug, Clone, Deserialize, Validate, ToSchema)]
pub struct CreateFolderRequest {
    #[validate(custom(function = "validate_folder_name"))]
    pub folder_name: String,
}

/// Update folder request (rename)
#[derive(Debug, Clone, Deserialize, Validate, ToSchema)]
pub struct UpdateFolderRequest {
    #[validate(custom(function = "validate_folder_name"))]
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

// ============================================================================
// Validators
// ============================================================================

fn validate_folder_name(name: &str) -> Result<(), ValidationError> {
    let trimmed = name.trim();
    
    // 1. Check if empty after trim
    if trimmed.is_empty() {
        return Err(ValidationError::new("Folder name cannot be empty or whitespace only"));
    }

    // 2. Check max length (255 characters)
    if name.chars().count() > 255 {
        return Err(ValidationError::new("Folder name must not exceed 255 characters"));
    }

    // 3. Check for Null byte
    if name.contains('\0') {
        return Err(ValidationError::new("Folder name cannot contain null bytes"));
    }

    // 4. Check for Path Traversal
    // Blocking "../" and "./"
    if name.contains("../") || name.contains("./") {
        return Err(ValidationError::new("Folder name cannot contain path traversal patterns"));
    }

    // 5. Check for Emojis
    if name.chars().any(is_emoji) {
        return Err(ValidationError::new("Folder name cannot contain emojis"));
    }

    Ok(())
}

fn is_emoji(c: char) -> bool {
    matches!(c,
        '\u{1F600}'..='\u{1F64F}' | // Emoticons
        '\u{1F300}'..='\u{1F5FF}' | // Misc Symbols and Pictographs
        '\u{1F680}'..='\u{1F6FF}' | // Transport and Map
        '\u{1F1E0}'..='\u{1F1FF}' | // Regional indicator symbols
        '\u{2600}'..='\u{26FF}'   | // Misc symbols
        '\u{2700}'..='\u{27BF}'   | // Dingbats
        '\u{FE00}'..='\u{FE0F}'   | // Variation Selectors
        '\u{1F900}'..='\u{1F9FF}' | // Supplemental Symbols and Pictographs
        '\u{1F018}'..='\u{1F27F}'   // Miscellaneous Symbols and Arrows etc
    )
}
