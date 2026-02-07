use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use validator::Validate;

use crate::config::settings::JwtConfig;
use crate::domain::ApiResponse;
use crate::dto::{LoginRequest, LoginResponse, RegisterRequest, RegisterResponse};
use crate::services::{AuthError, AuthService};

/// Register a new user
///
/// Creates a new user account with the provided credentials
#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    tag = "Authentication",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "User registered successfully", body = ApiResponse<RegisterResponse>),
        (status = 400, description = "Invalid request data"),
        (status = 409, description = "Username already exists")
    )
)]
pub async fn register(
    pool: web::Data<PgPool>,
    body: web::Json<RegisterRequest>,
) -> HttpResponse {
    // Validate request
    if let Err(errors) = body.validate() {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "VALIDATION_ERROR",
            format!("Validation failed: {}", errors),
        ));
    }

    match AuthService::register(pool.get_ref(), body.into_inner()).await {
        Ok(response) => HttpResponse::Created().json(ApiResponse::success(response)),
        Err(AuthError::UsernameExists) => HttpResponse::Conflict().json(ApiResponse::<()>::error(
            "USERNAME_EXISTS",
            "Username already exists",
        )),
        Err(AuthError::ValidationError(msg)) => {
            HttpResponse::BadRequest().json(ApiResponse::<()>::error("VALIDATION_ERROR", msg))
        }
        Err(e) => {
            tracing::error!("Registration error: {:?}", e);
            HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "INTERNAL_ERROR",
                "An error occurred during registration",
            ))
        }
    }
}

/// Login user
///
/// Authenticates a user and returns access and refresh tokens
#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    tag = "Authentication",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Login successful", body = ApiResponse<LoginResponse>),
        (status = 400, description = "Invalid request data"),
        (status = 401, description = "Invalid credentials")
    )
)]
pub async fn login(
    pool: web::Data<PgPool>,
    jwt_config: web::Data<JwtConfig>,
    body: web::Json<LoginRequest>,
) -> HttpResponse {
    // Validate request
    if let Err(errors) = body.validate() {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "VALIDATION_ERROR",
            format!("Validation failed: {}", errors),
        ));
    }

    match AuthService::login(pool.get_ref(), jwt_config.get_ref(), body.into_inner()).await {
        Ok(response) => HttpResponse::Ok().json(ApiResponse::success(response)),
        Err(AuthError::InvalidCredentials) => {
            HttpResponse::Unauthorized().json(ApiResponse::<()>::error(
                "INVALID_CREDENTIALS",
                "Invalid username or password",
            ))
        }
        Err(e) => {
            tracing::error!("Login error: {:?}", e);
            HttpResponse::InternalServerError().json(ApiResponse::<()>::error(
                "INTERNAL_ERROR",
                "An error occurred during login",
            ))
        }
    }
}

/// Logout user
///
/// Stateless logout - instructs client to discard tokens.
/// The server does not maintain session state, so the client is responsible
/// for removing the tokens from storage.
#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    tag = "Authentication",
    security(
        ("bearer_auth" = [])
    ),
    responses(
        (status = 200, description = "Logout successful", body = ApiResponse<crate::dto::LogoutResponse>),
        (status = 401, description = "Unauthorized - Invalid or missing token")
    )
)]
pub async fn logout() -> HttpResponse {
    HttpResponse::Ok().json(ApiResponse::success(crate::dto::LogoutResponse {
        message: "Logged out successfully. Please discard your tokens.".to_string(),
    }))
}
