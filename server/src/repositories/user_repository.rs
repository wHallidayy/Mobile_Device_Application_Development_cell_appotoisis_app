use sqlx::PgPool;
use uuid::Uuid;

use crate::models::User;

/// User repository for database operations
pub struct UserRepository;

impl UserRepository {
    /// Create a new user in the database
    pub async fn create(
        pool: &PgPool,
        username: &str,
        password_hash: &str,
    ) -> Result<User, sqlx::Error> {
        let user = sqlx::query_as::<_, User>(
            r#"
            INSERT INTO users (username, password_hash)
            VALUES ($1, $2)
            RETURNING user_id, username, password_hash, created_at
            "#,
        )
        .bind(username)
        .bind(password_hash)
        .fetch_one(pool)
        .await?;

        Ok(user)
    }

    /// Find a user by username
    pub async fn find_by_username(
        pool: &PgPool,
        username: &str,
    ) -> Result<Option<User>, sqlx::Error> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT user_id, username, password_hash, created_at
            FROM users
            WHERE username = $1
            "#,
        )
        .bind(username)
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    /// Find a user by ID
    /// Reserved for future profile/user management endpoints
    #[allow(dead_code)]
    pub async fn find_by_id(pool: &PgPool, user_id: Uuid) -> Result<Option<User>, sqlx::Error> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT user_id, username, password_hash, created_at
            FROM users
            WHERE user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(user)
    }

    /// Check if a username already exists
    pub async fn username_exists(pool: &PgPool, username: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)
            "#,
        )
        .bind(username)
        .fetch_one(pool)
        .await?;

        Ok(result)
    }
}
