//! Authentication Middleware
//!
//! Implements authentication and authorization based on:
//! - OWASP ASVS V2 (Authentication Verification Requirements)
//! - OWASP ASVS V4 (Access Control Verification Requirements)
//! - RFC 6750 (Bearer Token Usage)
//! - RFC 9110 (HTTP Semantics)

use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    http::header::{HeaderName, HeaderValue, AUTHORIZATION},
    Error, HttpMessage, HttpResponse,
};
use futures::future::{ok, LocalBoxFuture, Ready};
use hkdf::Hkdf;
use rusty_paseto::prelude::*;
use secrecy::ExposeSecret;
use serde::Deserialize;
use sha2::Sha256;
use std::rc::Rc;
use uuid::Uuid;

use crate::config::settings::JwtConfig;
use crate::domain::ApiResponse;

// ============================================================================
// Authenticated User (injected into request extensions)
// ============================================================================

/// Authenticated user information extracted from PASETO token
/// Injected into request extensions for handlers to access
#[derive(Debug, Clone)]
pub struct AuthenticatedUser {
    pub user_id: Uuid,
    pub username: String,
}

// ============================================================================
// Token Claims
// ============================================================================

/// Claims extracted from PASETO token
#[derive(Debug, Deserialize)]
struct TokenClaims {
    /// Subject (user_id)
    sub: String,
    /// Username
    username: String,
    /// Token type (access/refresh)
    token_type: String,
    /// Expiration time (RFC 3339)
    exp: String,
}

// ============================================================================
// Authentication Middleware Errors
// ============================================================================

#[derive(Debug)]
pub enum AuthMiddlewareError {
    /// No Authorization header present
    MissingToken,
    /// Token format is invalid
    InvalidTokenFormat,
    /// Token validation failed
    InvalidToken,
    /// Token has expired
    TokenExpired,
    /// Token type is not 'access'
    InvalidTokenType,
    /// Configuration error
    /// Reserved for future config validation
    #[allow(dead_code)]
    ConfigError,
}

impl AuthMiddlewareError {
    /// Returns appropriate HTTP status code per RFC 9110
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            // RFC 9110 Section 15.5.2: 401 Unauthorized
            AuthMiddlewareError::MissingToken
            | AuthMiddlewareError::InvalidTokenFormat
            | AuthMiddlewareError::InvalidToken
            | AuthMiddlewareError::TokenExpired
            | AuthMiddlewareError::InvalidTokenType => {
                actix_web::http::StatusCode::UNAUTHORIZED
            }
            AuthMiddlewareError::ConfigError => {
                actix_web::http::StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    fn error_code(&self) -> &'static str {
        match self {
            AuthMiddlewareError::MissingToken => "MISSING_TOKEN",
            AuthMiddlewareError::InvalidTokenFormat => "INVALID_TOKEN_FORMAT",
            AuthMiddlewareError::InvalidToken => "INVALID_TOKEN",
            AuthMiddlewareError::TokenExpired => "TOKEN_EXPIRED",
            AuthMiddlewareError::InvalidTokenType => "INVALID_TOKEN_TYPE",
            AuthMiddlewareError::ConfigError => "CONFIG_ERROR",
        }
    }

    fn message(&self) -> &'static str {
        match self {
            AuthMiddlewareError::MissingToken => "Missing authentication token",
            AuthMiddlewareError::InvalidTokenFormat => "Invalid token format. Use 'Bearer <token>'",
            AuthMiddlewareError::InvalidToken => "Invalid or malformed token",
            AuthMiddlewareError::TokenExpired => "Token has expired",
            AuthMiddlewareError::InvalidTokenType => "Invalid token type. Access token required",
            AuthMiddlewareError::ConfigError => "Server configuration error",
        }
    }

    /// RFC 6750 Section 3: WWW-Authenticate header for 401 responses
    /// Includes error_description for more specific error messages
    fn www_authenticate_value(&self) -> &'static str {
        match self {
            AuthMiddlewareError::MissingToken => "Bearer",
            AuthMiddlewareError::TokenExpired => {
                "Bearer error=\"invalid_token\", error_description=\"The access token expired\""
            }
            AuthMiddlewareError::InvalidTokenFormat => {
                "Bearer error=\"invalid_token\", error_description=\"Invalid token format\""
            }
            AuthMiddlewareError::InvalidToken => {
                "Bearer error=\"invalid_token\", error_description=\"Token validation failed\""
            }
            AuthMiddlewareError::InvalidTokenType => {
                "Bearer error=\"invalid_token\", error_description=\"Access token required\""
            }
            _ => "Bearer",
        }
    }

    fn to_response(&self) -> HttpResponse {
        let mut response = HttpResponse::build(self.status_code());

        // RFC 6750: Add WWW-Authenticate header for 401 responses
        if self.status_code() == actix_web::http::StatusCode::UNAUTHORIZED {
            response.insert_header((
                HeaderName::from_static("www-authenticate"),
                HeaderValue::from_static(self.www_authenticate_value()),
            ));
        }

        response.json(ApiResponse::<()>::error(self.error_code(), self.message()))
    }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/// Authentication Middleware Factory
///
/// Validates PASETO tokens and injects AuthenticatedUser into request extensions.
/// Based on OWASP ASVS V2 and RFC 6750.
pub struct AuthenticationMiddleware {
    jwt_config: JwtConfig,
}

impl AuthenticationMiddleware {
    pub fn new(jwt_config: JwtConfig) -> Self {
        Self { jwt_config }
    }
}

impl<S, B> Transform<S, ServiceRequest> for AuthenticationMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<actix_web::body::EitherBody<B>>;
    type Error = Error;
    type Transform = AuthenticationMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(AuthenticationMiddlewareService {
            service: Rc::new(service),
            jwt_config: self.jwt_config.clone(),
        })
    }
}

pub struct AuthenticationMiddlewareService<S> {
    service: Rc<S>,
    jwt_config: JwtConfig,
}

impl<S, B> Service<ServiceRequest> for AuthenticationMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<actix_web::body::EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        let jwt_config = self.jwt_config.clone();

        Box::pin(async move {
            // Extract and validate token
            match validate_request(&req, &jwt_config) {
                Ok(user) => {
                    // Inject authenticated user into request extensions
                    req.extensions_mut().insert(user);

                    // Continue to handler
                    let res = service.call(req).await?;
                    Ok(res.map_into_left_body())
                }
                Err(error) => {
                    // Return error response
                    let response = error.to_response();
                    Ok(req.into_response(response).map_into_right_body())
                }
            }
        })
    }
}

/// Extract Bearer token from Authorization header (RFC 6750 Section 2.1)
fn extract_bearer_token(req: &ServiceRequest) -> Result<String, AuthMiddlewareError> {
    let auth_header = req
        .headers()
        .get(AUTHORIZATION)
        .ok_or(AuthMiddlewareError::MissingToken)?
        .to_str()
        .map_err(|_| AuthMiddlewareError::InvalidTokenFormat)?;

    // RFC 6750: Format is "Bearer <token>"
    if let Some(token) = auth_header.strip_prefix("Bearer ") {
        if token.is_empty() {
            return Err(AuthMiddlewareError::MissingToken);
        }
        Ok(token.to_string())
    } else {
        Err(AuthMiddlewareError::InvalidTokenFormat)
    }
}

/// Validate PASETO token and extract claims
fn validate_token(token: &str, jwt_config: &JwtConfig) -> Result<TokenClaims, AuthMiddlewareError> {
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

    // Parse and decrypt PASETO token
    let value = PasetoParser::<V4, Local>::default()
        .parse(token, &key)
        .map_err(|_| AuthMiddlewareError::InvalidToken)?;

    // Extract claims
    let claims: TokenClaims = serde_json::from_value(value)
        .map_err(|_| AuthMiddlewareError::InvalidToken)?;

    // Validate token type (must be "access")
    if claims.token_type != "access" {
        return Err(AuthMiddlewareError::InvalidTokenType);
    }

    // Validate expiration (OWASP ASVS V2.1.5)
    let expiration = chrono::DateTime::parse_from_rfc3339(&claims.exp)
        .map_err(|_| AuthMiddlewareError::InvalidToken)?;

    if expiration < chrono::Utc::now() {
        return Err(AuthMiddlewareError::TokenExpired);
    }

    Ok(claims)
}

/// Validate request and return authenticated user
fn validate_request(
    req: &ServiceRequest,
    jwt_config: &JwtConfig,
) -> Result<AuthenticatedUser, AuthMiddlewareError> {
    let token = extract_bearer_token(req)?;
    let claims = validate_token(&token, jwt_config)?;

    // Parse user_id from subject claim
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AuthMiddlewareError::InvalidToken)?;

    Ok(AuthenticatedUser {
        user_id,
        username: claims.username,
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_status_codes() {
        // RFC 9110: 401 for authentication failures
        assert_eq!(
            AuthMiddlewareError::MissingToken.status_code(),
            actix_web::http::StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            AuthMiddlewareError::InvalidToken.status_code(),
            actix_web::http::StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            AuthMiddlewareError::TokenExpired.status_code(),
            actix_web::http::StatusCode::UNAUTHORIZED
        );
    }

    #[test]
    fn test_www_authenticate_values() {
        // RFC 6750: MissingToken should return plain Bearer
        assert_eq!(
            AuthMiddlewareError::MissingToken.www_authenticate_value(),
            "Bearer"
        );

        // RFC 6750: TokenExpired should include error_description
        assert!(AuthMiddlewareError::TokenExpired
            .www_authenticate_value()
            .contains("expired"));

        // RFC 6750: InvalidTokenFormat should include error_description
        assert!(AuthMiddlewareError::InvalidTokenFormat
            .www_authenticate_value()
            .contains("invalid_token"));

        // RFC 6750: InvalidToken should include error_description
        assert!(AuthMiddlewareError::InvalidToken
            .www_authenticate_value()
            .contains("validation failed"));

        // RFC 6750: InvalidTokenType should include error_description
        assert!(AuthMiddlewareError::InvalidTokenType
            .www_authenticate_value()
            .contains("Access token required"));
    }

    #[test]
    fn test_error_codes() {
        assert_eq!(AuthMiddlewareError::MissingToken.error_code(), "MISSING_TOKEN");
        assert_eq!(AuthMiddlewareError::InvalidTokenFormat.error_code(), "INVALID_TOKEN_FORMAT");
        assert_eq!(AuthMiddlewareError::InvalidToken.error_code(), "INVALID_TOKEN");
        assert_eq!(AuthMiddlewareError::TokenExpired.error_code(), "TOKEN_EXPIRED");
        assert_eq!(AuthMiddlewareError::InvalidTokenType.error_code(), "INVALID_TOKEN_TYPE");
    }

    #[test]
    fn test_error_messages() {
        assert_eq!(AuthMiddlewareError::MissingToken.message(), "Missing authentication token");
        assert_eq!(AuthMiddlewareError::InvalidTokenFormat.message(), "Invalid token format. Use 'Bearer <token>'");
        assert_eq!(AuthMiddlewareError::TokenExpired.message(), "Token has expired");
        assert_eq!(AuthMiddlewareError::InvalidTokenType.message(), "Invalid token type. Access token required");
    }

    #[test]
    fn test_authenticated_user_clone() {
        let user = AuthenticatedUser {
            user_id: Uuid::new_v4(),
            username: "test_user".to_string(),
        };
        let cloned = user.clone();

        assert_eq!(user.user_id, cloned.user_id);
        assert_eq!(user.username, cloned.username);
    }
}
