use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Duration, Utc};
use hkdf::Hkdf;
use rusty_paseto::prelude::*;
use secrecy::ExposeSecret;
use sha2::Sha256;
use sqlx::PgPool;
use thiserror::Error;

use crate::config::settings::JwtConfig;
use crate::dto::{LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, UserResponse};
use crate::models::User;
use crate::repositories::UserRepository;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("Username already exists")]
    UsernameExists,

    #[error("Invalid credentials")]
    InvalidCredentials,

    #[error("Password hashing failed: {0}")]
    HashingError(String),

    #[error("Token generation failed: {0}")]
    TokenError(String),

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    /// Reserved for future input validation
    #[allow(dead_code)]
    #[error("Validation error: {0}")]
    ValidationError(String),
}

/// Auth service for authentication operations
pub struct AuthService;

impl AuthService {
    /// Register a new user
    pub async fn register(
        pool: &PgPool,
        request: RegisterRequest,
    ) -> Result<RegisterResponse, AuthError> {
        // Check if username already exists
        if UserRepository::username_exists(pool, &request.username).await? {
            return Err(AuthError::UsernameExists);
        }

        // Hash the password using Argon2 with spawn_blocking
        // Argon2 is CPU-intensive and should not block the async runtime
        let password = request.password.clone();
        let password_hash = tokio::task::spawn_blocking(move || Self::hash_password(&password))
            .await
            .map_err(|e| AuthError::HashingError(e.to_string()))??;

        // Create the user
        let user = UserRepository::create(pool, &request.username, &password_hash).await?;

        Ok(RegisterResponse {
            user_id: user.user_id,
            username: user.username,
            created_at: user
                .created_at
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default(),
        })
    }

    /// Login a user
    pub async fn login(
        pool: &PgPool,
        jwt_config: &JwtConfig,
        request: LoginRequest,
    ) -> Result<LoginResponse, AuthError> {
        // Find user by username
        let user = UserRepository::find_by_username(pool, &request.username)
            .await?
            .ok_or(AuthError::InvalidCredentials)?;

        // Verify password with spawn_blocking
        // Argon2 is CPU-intensive and should not block the async runtime
        let password = request.password.clone();
        let hash = user.password_hash.clone();
        let is_valid = tokio::task::spawn_blocking(move || Self::verify_password(&password, &hash))
            .await
            .map_err(|e| AuthError::HashingError(e.to_string()))??;

        if !is_valid {
            return Err(AuthError::InvalidCredentials);
        }

        // Generate tokens
        let (access_token, refresh_token) = Self::generate_tokens(&user, jwt_config)?;

        Ok(LoginResponse {
            access_token,
            refresh_token,
            expires_in: jwt_config.expiration_hours * 3600,
            user: UserResponse {
                user_id: user.user_id,
                username: user.username,
            },
        })
    }

    /// Hash a password using Argon2
    fn hash_password(password: &str) -> Result<String, AuthError> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();

        let password_hash = argon2
            .hash_password(password.as_bytes(), &salt)
            .map_err(|e| AuthError::HashingError(e.to_string()))?
            .to_string();

        Ok(password_hash)
    }

    /// Verify a password against a hash
    fn verify_password(password: &str, hash: &str) -> Result<bool, AuthError> {
        let parsed_hash =
            PasswordHash::new(hash).map_err(|e| AuthError::HashingError(e.to_string()))?;

        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }

    /// Generate access and refresh tokens using PASETO
    fn generate_tokens(user: &User, jwt_config: &JwtConfig) -> Result<(String, String), AuthError> {
        // Derive 32-byte key using HKDF-SHA256 (RFC 5869)
        // This ensures proper key derivation regardless of secret length
        let secret = jwt_config.secret.expose_secret();
        let hk = Hkdf::<Sha256>::new(None, secret.as_bytes());
        let mut key_bytes = [0u8; 32];
        // Use domain-specific info for key separation
        hk.expand(b"paseto-v4-local-key", &mut key_bytes)
            .expect("HKDF expand failed - output length is valid");

        let secret_key = Key::<32>::from(key_bytes);
        let key = PasetoSymmetricKey::<V4, Local>::from(secret_key);

        // Prepare claim values as bindings to avoid temporary value issues
        let user_id_str = user.user_id.to_string();
        let access_expiration = Utc::now() + Duration::hours(jwt_config.expiration_hours);
        let access_exp_str = access_expiration.to_rfc3339();

        // Access token (shorter expiration) - removed role claim
        let access_token = PasetoBuilder::<V4, Local>::default()
            .set_claim(ExpirationClaim::try_from(access_exp_str.as_str()).unwrap())
            .set_claim(SubjectClaim::from(user_id_str.as_str()))
            .set_claim(CustomClaim::try_from(("username", user.username.as_str())).unwrap())
            .set_claim(CustomClaim::try_from(("token_type", "access")).unwrap())
            .build(&key)
            .map_err(|e| AuthError::TokenError(e.to_string()))?;

        // Refresh token (longer expiration - configurable via JWT__REFRESH_EXPIRATION_DAYS)
        let refresh_expiration = Utc::now() + Duration::days(jwt_config.refresh_expiration_days);
        let refresh_exp_str = refresh_expiration.to_rfc3339();

        let refresh_token = PasetoBuilder::<V4, Local>::default()
            .set_claim(ExpirationClaim::try_from(refresh_exp_str.as_str()).unwrap())
            .set_claim(SubjectClaim::from(user_id_str.as_str()))
            .set_claim(CustomClaim::try_from(("token_type", "refresh")).unwrap())
            .build(&key)
            .map_err(|e| AuthError::TokenError(e.to_string()))?;

        Ok((access_token, refresh_token))
    }
}
