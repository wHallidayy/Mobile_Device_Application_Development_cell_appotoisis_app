//! Image DTOs
//!
//! Request and Response Data Transfer Objects for image endpoints.

use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

// ============================================================================
// Request DTOs
// ============================================================================

/// Rename image request
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct RenameImageRequest {
    #[schema(example = "new_image_name.jpg")]
    pub new_filename: String,
}

/// Request presigned URL for direct S3 upload
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct RequestUploadRequest {
    /// Original filename
    #[schema(example = "photo.jpg")]
    pub filename: String,
    /// MIME type of the file
    #[schema(example = "image/jpeg")]
    pub content_type: String,
    /// File size in bytes
    #[schema(example = 1024000)]
    pub file_size: i64,
}

/// Response with presigned upload URL
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RequestUploadResponse {
    /// Token to use when confirming upload (contains S3 key)
    pub upload_token: String,
    /// Presigned URL for PUT upload
    pub presigned_url: String,
    /// URL expiration time (RFC3339)
    pub expires_at: String,
}

/// Confirm that upload to S3 is complete
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ConfirmUploadRequest {
    /// Token received from request-upload endpoint
    pub upload_token: String,
    /// Original filename
    #[schema(example = "photo.jpg")]
    pub filename: String,
    /// MIME type
    #[schema(example = "image/jpeg")]
    pub content_type: String,
    /// File size in bytes
    #[schema(example = 1024000)]
    pub file_size: i64,
}

/// Response with presigned download URL
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PresignedDownloadResponse {
    /// Presigned URL for GET download
    pub url: String,
    /// URL expiration time (RFC3339)
    pub expires_at: String,
}

// ============================================================================
// Query Parameters
// ============================================================================

/// Query parameters for paginated image listing
#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct PaginationQuery {
    /// Page number (1-indexed, default: 1)
    #[param(minimum = 1, default = 1)]
    pub page: Option<i32>,
    /// Items per page (default: 20, max: 100)
    #[param(minimum = 1, maximum = 100, default = 20)]
    pub limit: Option<i32>,
}

impl PaginationQuery {
    pub fn page(&self) -> i32 {
        self.page.unwrap_or(1).max(1)
    }

    pub fn limit(&self) -> i32 {
        self.limit.unwrap_or(20).clamp(1, 100)
    }

    pub fn offset(&self) -> i64 {
        ((self.page() - 1) * self.limit()) as i64
    }
}

/// Query parameters for cursor-based pagination (more efficient for large datasets)
#[derive(Debug, Clone, Deserialize, IntoParams)]
pub struct CursorPaginationQuery {
    /// Cursor for pagination (RFC3339 timestamp of last seen item)
    /// If not provided, returns from the beginning (most recent)
    pub cursor: Option<String>,
    /// Items per page (default: 20, max: 100)
    #[param(minimum = 1, maximum = 100, default = 20)]
    pub limit: Option<i32>,
}

impl CursorPaginationQuery {
    pub fn limit(&self) -> i32 {
        self.limit.unwrap_or(20).clamp(1, 100)
    }

    /// Parse cursor as DateTime, returns None if invalid or not provided
    pub fn cursor_datetime(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        self.cursor.as_ref().and_then(|c| chrono::DateTime::parse_from_rfc3339(c).ok().map(|dt| dt.with_timezone(&chrono::Utc)))
    }
}

// ============================================================================
// Response DTOs
// ============================================================================

/// Pagination information
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PaginationInfo {
    pub page: i32,
    pub limit: i32,
    pub total: i64,
    pub total_pages: i32,
}

impl PaginationInfo {
    pub fn new(page: i32, limit: i32, total: i64) -> Self {
        let total_pages = ((total as f64) / (limit as f64)).ceil() as i32;
        Self {
            page,
            limit,
            total,
            total_pages,
        }
    }
}

/// Image metadata
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImageMetadataResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

/// Single image response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImageResponse {
    pub image_id: i64,
    pub folder_id: i32,
    pub original_filename: String,
    pub file_size: i32,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<ImageMetadataResponse>,
    pub has_analysis: bool,
    pub uploaded_at: String,
}

/// List images response with pagination
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImageListResponse {
    pub images: Vec<ImageResponse>,
    pub pagination: PaginationInfo,
}

/// Cursor-based pagination information (efficient for large datasets)
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CursorPaginationInfo {
    /// Whether there are more items after this page
    pub has_next: bool,
    /// Cursor to use for the next page (RFC3339 timestamp)
    /// None if no more items
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
    /// Number of items in this response
    pub count: i32,
}

/// List images response with cursor-based pagination
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImageListResponseV2 {
    pub images: Vec<ImageResponse>,
    pub pagination: CursorPaginationInfo,
}

/// Image detail response (with analysis history)
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImageDetailResponse {
    pub image_id: i64,
    pub folder_id: i32,
    pub original_filename: String,
    pub file_url: String,
    pub file_size: i32,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<ImageMetadataResponse>,
    pub analysis_history: Vec<AnalysisHistoryItem>,
    pub uploaded_at: String,
}

/// Analysis history item for image detail
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AnalysisHistoryItem {
    pub job_id: i64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_model_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
}

/// Delete image response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct DeleteImageResponse {
    pub message: String,
}
