//! Domain Error Types and API Response Wrapper
//!
//! Centralized error handling and standard API response format.

use serde::Serialize;
use utoipa::ToSchema;

/// Standard API response wrapper
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(code: impl Into<String>, message: impl Into<String>) -> Self {
        ApiResponse {
            success: false,
            data: None,
            error: Some(ApiError {
                code: code.into(),
                message: message.into(),
            }),
        }
    }
}

/// API error structure
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ApiError {
    pub code: String,
    pub message: String,
}
