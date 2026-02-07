use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

/// Custom password validator following NIST SP 800-63B guidelines
/// Requires:
/// - At least 12 characters (NIST recommends 8+, 12 is more secure)
/// - At least 1 uppercase letter
/// - At least 1 lowercase letter
/// - At least 1 digit
/// - At least 1 special character
fn validate_strong_password(password: &str) -> Result<(), validator::ValidationError> {
    if password.len() < 12 {
        return Err(validator::ValidationError::new(
            "Password must be at least 12 characters",
        ));
    }

    if !password.chars().any(|c| c.is_uppercase()) {
        return Err(validator::ValidationError::new(
            "Password must contain at least one uppercase letter",
        ));
    }

    if !password.chars().any(|c| c.is_lowercase()) {
        return Err(validator::ValidationError::new(
            "Password must contain at least one lowercase letter",
        ));
    }

    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err(validator::ValidationError::new(
            "Password must contain at least one digit",
        ));
    }

    if !password.chars().any(|c| !c.is_alphanumeric()) {
        return Err(validator::ValidationError::new(
            "Password must contain at least one special character",
        ));
    }

    Ok(())
}

/// Register request DTO
#[derive(Debug, Clone, Deserialize, Validate, ToSchema)]
pub struct RegisterRequest {
    #[validate(length(min = 3, max = 255, message = "Username must be between 3 and 255 characters"))]
    pub username: String,

    #[validate(custom(function = "validate_strong_password", message = "Password must be at least 12 characters and contain uppercase, lowercase, digit, and special character"))]
    pub password: String,
}

/// Login request DTO
#[derive(Debug, Clone, Deserialize, Validate, ToSchema)]
pub struct LoginRequest {
    #[validate(length(min = 1, message = "Username is required"))]
    pub username: String,
    
    #[validate(length(min = 1, message = "Password is required"))]
    pub password: String,
}

/// User info for responses (without password hash)
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct UserResponse {
    #[schema(value_type = String, format = "uuid")]
    pub user_id: Uuid,
    pub username: String,
}

/// Register response DTO
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RegisterResponse {
    #[schema(value_type = String, format = "uuid")]
    pub user_id: Uuid,
    pub username: String,
    pub created_at: String,
}

/// Login response DTO
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
    pub user: UserResponse,
}

/// Logout response DTO
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LogoutResponse {
    pub message: String,
}
