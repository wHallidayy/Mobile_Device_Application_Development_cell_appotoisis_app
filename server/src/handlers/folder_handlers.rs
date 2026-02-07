//! Folder Management Handlers
//!
//! CRUD operations for folders with ownership verification.

use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use sqlx::PgPool;
use validator::Validate;

use crate::domain::ApiResponse;
use crate::dto::{
    CreateFolderRequest, DeleteFolderResponse, FolderListResponse, FolderResponse,
    UpdateFolderRequest,
};
use crate::middleware::AuthenticatedUser;
use crate::repositories::FolderRepository;

// ============================================================================
// List Folders
// ============================================================================

/// List all folders for the authenticated user
#[utoipa::path(
    get,
    path = "/api/v1/folders",
    tag = "Folder Management",
    security(("bearer_auth" = [])),
    responses(
        (status = 200, description = "List of folders", body = ApiResponse<FolderListResponse>),
        (status = 401, description = "Unauthorized")
    )
)]
pub async fn list_folders(
    pool: web::Data<PgPool>,
    req: HttpRequest,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    match FolderRepository::find_by_user_id(pool.get_ref(), user.user_id).await {
        Ok(folders) => {
            let folder_responses: Vec<FolderResponse> = folders
                .into_iter()
                .map(|(folder, image_count)| FolderResponse {
                    folder_id: folder.folder_id,
                    folder_name: folder.folder_name,
                    image_count,
                    created_at: folder
                        .created_at
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_default(),
                    deleted_at: folder.deleted_at.map(|dt| dt.to_rfc3339()),
                })
                .collect();

            let total = folder_responses.len() as i64;
            HttpResponse::Ok().json(ApiResponse::success(FolderListResponse {
                folders: folder_responses,
                total,
            }))
        }
        Err(e) => {
            tracing::error!("Failed to list folders: {:?}", e);
            HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to list folders"))
        }
    }
}

// ============================================================================
// Create Folder
// ============================================================================

/// Create a new folder
#[utoipa::path(
    post,
    path = "/api/v1/folders",
    tag = "Folder Management",
    security(("bearer_auth" = [])),
    request_body = CreateFolderRequest,
    responses(
        (status = 201, description = "Folder created", body = ApiResponse<FolderResponse>),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized")
    )
)]
pub async fn create_folder(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    body: web::Json<CreateFolderRequest>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    // Validate request
    if let Err(errors) = body.validate() {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "VALIDATION_ERROR",
            format!("Validation failed: {}", errors),
        ));
    }

    match FolderRepository::create(pool.get_ref(), user.user_id, &body.folder_name).await {
        Ok(folder) => HttpResponse::Created().json(ApiResponse::success(FolderResponse {
            folder_id: folder.folder_id,
            folder_name: folder.folder_name,
            image_count: 0,
            created_at: folder
                .created_at
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default(),
            deleted_at: None,
        })),
        Err(e) => {
            tracing::error!("Failed to create folder: {:?}", e);
            HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to create folder"))
        }
    }
}

// ============================================================================
// Rename Folder
// ============================================================================

/// Rename a folder
#[utoipa::path(
    patch,
    path = "/api/v1/folders/{folder_id}",
    tag = "Folder Management",
    security(("bearer_auth" = [])),
    params(
        ("folder_id" = i32, Path, description = "Folder ID")
    ),
    request_body = UpdateFolderRequest,
    responses(
        (status = 200, description = "Folder renamed", body = ApiResponse<FolderResponse>),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    )
)]
pub async fn rename_folder(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<i32>,
    body: web::Json<UpdateFolderRequest>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let folder_id = path.into_inner();

    // Validate request
    if let Err(errors) = body.validate() {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "VALIDATION_ERROR",
            format!("Validation failed: {}", errors),
        ));
    }

    match FolderRepository::update_name(pool.get_ref(), folder_id, user.user_id, &body.folder_name)
        .await
    {
        Ok(Some(folder)) => {
            // Get image count for response
            let image_count = FolderRepository::get_image_count(pool.get_ref(), folder_id)
                .await
                .unwrap_or(0);

            HttpResponse::Ok().json(ApiResponse::success(FolderResponse {
                folder_id: folder.folder_id,
                folder_name: folder.folder_name,
                image_count,
                created_at: folder
                    .created_at
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default(),
                deleted_at: folder.deleted_at.map(|dt| dt.to_rfc3339()),
            }))
        }
        Ok(None) => {
            HttpResponse::NotFound().json(ApiResponse::<()>::error("NOT_FOUND", "Folder not found"))
        }
        Err(e) => {
            tracing::error!("Failed to rename folder: {:?}", e);
            HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to rename folder"))
        }
    }
}

// ============================================================================
// Delete Folder
// ============================================================================

/// Delete a folder and all its images (cascade delete)
#[utoipa::path(
    delete,
    path = "/api/v1/folders/{folder_id}",
    tag = "Folder Management",
    security(("bearer_auth" = [])),
    params(
        ("folder_id" = i32, Path, description = "Folder ID")
    ),
    responses(
        (status = 200, description = "Folder deleted", body = ApiResponse<DeleteFolderResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    )
)]
pub async fn delete_folder(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<i32>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let folder_id = path.into_inner();

    match FolderRepository::delete(pool.get_ref(), folder_id, user.user_id).await {
        Ok(Some(deleted_images_count)) => {
            HttpResponse::Ok().json(ApiResponse::success(DeleteFolderResponse {
                message: "Folder deleted successfully".to_string(),
                deleted_images_count,
            }))
        }
        Ok(None) => {
            HttpResponse::NotFound().json(ApiResponse::<()>::error("NOT_FOUND", "Folder not found"))
        }
        Err(e) => {
            tracing::error!("Failed to delete folder: {:?}", e);
            HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to delete folder"))
        }
    }
}
