use actix_governor::{Governor, GovernorConfigBuilder};
use actix_web::{web, HttpResponse};
use utoipa::OpenApi;

use crate::config::settings::JwtConfig;
use crate::domain::{ApiError, ApiResponse};
use crate::dto::{
    AnalysisHistoryItem, AnalysisHistorySummary, AnalysisResultResponse, AnalyzeImageRequest,
    AnalyzeImageResponse, BoundingBox, CellCounts, CellPercentages, ConfirmUploadRequest,
    CreateFolderRequest, CursorPaginationInfo, DeleteFolderResponse, DeleteImageResponse,
    FolderListResponse, FolderResponse, ImageAnalysisHistoryResponse, ImageDetailResponse,
    ImageListResponse, ImageListResponseV2, ImageMetadataResponse, ImageResponse, JobStatusResponse,
    LoginRequest, LoginResponse, LogoutResponse, PaginationInfo, PresignedDownloadResponse,
    RawDetectionData, RegisterRequest, RegisterResponse, RenameImageRequest, RequestUploadRequest,
    RequestUploadResponse, UpdateFolderRequest,
};
use crate::handlers;
use crate::middleware::AuthenticationMiddleware;

#[derive(OpenApi)]
#[openapi(
    paths(
        health_check,
        handlers::auth_handlers::register,
        handlers::auth_handlers::login,
        handlers::auth_handlers::logout,
        handlers::folder_handlers::list_folders,
        handlers::folder_handlers::create_folder,
        handlers::folder_handlers::rename_folder,
        handlers::folder_handlers::delete_folder,
        handlers::image_handlers::list_images,
        handlers::image_handlers::list_images_v2,
        handlers::image_handlers::upload_image,
        handlers::image_handlers::request_upload,
        handlers::image_handlers::confirm_upload,
        handlers::image_handlers::get_image,
        handlers::image_handlers::rename_image,
        handlers::image_handlers::delete_image,
        handlers::image_handlers::get_image_file,
        handlers::image_handlers::get_image_download_url,
        handlers::analysis_handlers::analyze_image,
        handlers::analysis_handlers::get_job_status,
        handlers::analysis_handlers::get_job_result,
        handlers::analysis_handlers::get_analysis_history,
    ),
    components(
        schemas(
            RegisterRequest,
            RegisterResponse,
            LoginRequest,
            LoginResponse,
            LogoutResponse,
            CreateFolderRequest,
            UpdateFolderRequest,
            FolderResponse,
            FolderListResponse,
            DeleteFolderResponse,
            ImageResponse,
            ImageListResponse,
            ImageListResponseV2,
            ImageDetailResponse,
            ImageMetadataResponse,
            RenameImageRequest,
            DeleteImageResponse,
            PaginationInfo,
            CursorPaginationInfo,
            RequestUploadRequest,
            RequestUploadResponse,
            ConfirmUploadRequest,
            PresignedDownloadResponse,
            AnalysisHistoryItem,
            AnalyzeImageRequest,
            AnalyzeImageResponse,
            JobStatusResponse,
            AnalysisResultResponse,
            CellCounts,
            CellPercentages,
            BoundingBox,
            RawDetectionData,
            ImageAnalysisHistoryResponse,
            AnalysisHistorySummary,
            ApiResponse<RegisterResponse>,
            ApiResponse<LoginResponse>,
            ApiResponse<LogoutResponse>,
            ApiResponse<FolderResponse>,
            ApiResponse<FolderListResponse>,
            ApiResponse<DeleteFolderResponse>,
            ApiResponse<ImageResponse>,
            ApiResponse<ImageListResponse>,
            ApiResponse<ImageListResponseV2>,
            ApiResponse<ImageDetailResponse>,
            ApiResponse<DeleteImageResponse>,
            ApiResponse<RequestUploadResponse>,
            ApiResponse<PresignedDownloadResponse>,
            ApiResponse<AnalyzeImageResponse>,
            ApiResponse<JobStatusResponse>,
            ApiResponse<AnalysisResultResponse>,
            ApiResponse<ImageAnalysisHistoryResponse>,
            ApiError,
        )
    ),
    modifiers(&SecurityAddon),
    tags(
        (name = "Health", description = "Health check endpoints"),
        (name = "Authentication", description = "User authentication endpoints"),
        (name = "Folder Management", description = "Folder CRUD operations"),
        (name = "Image Management", description = "Image upload, listing, and deletion"),
        (name = "AI Analysis", description = "AI-powered cell analysis endpoints")
    )
)]
pub struct ApiDoc;

/// Security addon for OpenAPI to add bearer auth
struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
                utoipa::openapi::security::SecurityScheme::Http(
                    utoipa::openapi::security::Http::new(
                        utoipa::openapi::security::HttpAuthScheme::Bearer,
                    ),
                ),
            )
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/health",
    tag = "Health",
    responses(
        (status = 200, description = "Service is healthy")
    )
)]
async fn health_check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

pub fn configure_routes(cfg: &mut web::ServiceConfig, jwt_config: JwtConfig) {
    // Rate limiter for login: 5 requests per 60 seconds (burst of 2)
    // Protects against brute-force password attacks
    let login_governor_conf = GovernorConfigBuilder::default()
        .per_second(12) // 1 request per 12 seconds = 5 per minute
        .burst_size(2)
        .finish()
        .expect("Failed to create login rate limiter");

    // Rate limiter for register: 3 requests per 60 seconds (burst of 1)
    // Protects against account enumeration and spam registration
    let register_governor_conf = GovernorConfigBuilder::default()
        .per_second(20) // 1 request per 20 seconds = 3 per minute
        .burst_size(1)
        .finish()
        .expect("Failed to create register rate limiter");

    cfg.service(
        web::scope("/api/v1")
            .route("/health", web::get().to(health_check))
            .service(
                web::scope("/auth")
                    // Register with rate limiting
                    .service(
                        web::resource("/register")
                            .wrap(Governor::new(&register_governor_conf))
                            .route(web::post().to(handlers::register))
                    )
                    // Login with rate limiting
                    .service(
                        web::resource("/login")
                            .wrap(Governor::new(&login_governor_conf))
                            .route(web::post().to(handlers::login))
                    )
                    .service(
                        web::scope("")
                            .wrap(AuthenticationMiddleware::new(jwt_config.clone()))
                            .route("/logout", web::post().to(handlers::logout)),
                    ),
            )
            .service(
                web::scope("/folders")
                    .wrap(AuthenticationMiddleware::new(jwt_config.clone()))
                    .route("", web::get().to(handlers::list_folders))
                    .route("", web::post().to(handlers::create_folder))
                    .route("/{folder_id}", web::patch().to(handlers::rename_folder))
                    .route("/{folder_id}", web::delete().to(handlers::delete_folder))
                    // Image routes nested under folder
                    .route("/{folder_id}/images", web::get().to(handlers::list_images))
                    .route("/{folder_id}/images", web::post().to(handlers::upload_image))
                    // Presigned URL upload routes
                    .route("/{folder_id}/images/request-upload", web::post().to(handlers::request_upload))
                    .route("/{folder_id}/images/confirm-upload", web::post().to(handlers::confirm_upload)),
            )
            .service(
                web::scope("/images")
                    .wrap(AuthenticationMiddleware::new(jwt_config.clone()))
                    .route("/{image_id}", web::get().to(handlers::get_image))
                    .route("/{image_id}", web::patch().to(handlers::rename_image))
                    .route("/{image_id}", web::delete().to(handlers::delete_image))
                    .route("/{image_id}/file", web::get().to(handlers::get_image_file))
                    // Presigned download URL route
                    .route("/{image_id}/download-url", web::get().to(handlers::get_image_download_url))
                    // Analysis routes under image
                    .route("/{image_id}/analyze", web::post().to(handlers::analyze_image))
                    .route("/{image_id}/analysis-history", web::get().to(handlers::get_analysis_history)),
            )
            .service(
                web::scope("/jobs")
                    .wrap(AuthenticationMiddleware::new(jwt_config.clone()))
                    .route("/{job_id}", web::get().to(handlers::get_job_status))
                    .route("/{job_id}/result", web::get().to(handlers::get_job_result)),
            ),
    );

    // V2 API with cursor-based pagination
    cfg.service(
        web::scope("/api/v2")
            .service(
                web::scope("/folders")
                    .wrap(AuthenticationMiddleware::new(jwt_config.clone()))
                    .route("/{folder_id}/images", web::get().to(handlers::list_images_v2)),
            ),
    );
}