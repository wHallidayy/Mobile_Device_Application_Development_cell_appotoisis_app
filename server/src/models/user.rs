use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// User model matching the users table schema
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct User {
    pub user_id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub created_at: Option<DateTime<Utc>>,
}

/// User data without password hash (for API responses)
/// Reserved for future API endpoints
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct UserInfo {
    pub user_id: Uuid,
    pub username: String,
    pub created_at: Option<DateTime<Utc>>,
}

impl From<User> for UserInfo {
    fn from(user: User) -> Self {
        UserInfo {
            user_id: user.user_id,
            username: user.username,
            created_at: user.created_at,
        }
    }
}
