//! Image Management Handlers
//!
//! CRUD operations for images with file upload support and ownership verification.

use actix_multipart::Multipart;
use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use futures::StreamExt;
use sqlx::PgPool;

use crate::domain::ApiResponse;
use crate::dto::{
    AnalysisHistoryItem, ConfirmUploadRequest, CursorPaginationInfo, CursorPaginationQuery,
    DeleteImageResponse, ImageDetailResponse, ImageListResponse, ImageListResponseV2,
    ImageMetadataResponse, ImageResponse, PaginationInfo, PaginationQuery, PresignedDownloadResponse,
    RenameImageRequest, RequestUploadRequest, RequestUploadResponse,
};
use crate::middleware::AuthenticatedUser;
use crate::repositories::{FolderRepository, ImageRepository};
use crate::services::ImageService;

// ============================================================================
// List Images (Paginated)
// ============================================================================

/// List images in a folder with pagination
#[utoipa::path(
    get,
    path = "/api/v1/folders/{folder_id}/images",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("folder_id" = i32, Path, description = "Folder ID"),
        PaginationQuery
    ),
    responses(
        (status = 200, description = "List of images", body = ApiResponse<ImageListResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    )
)]
pub async fn list_images(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<i32>,
    query: web::Query<PaginationQuery>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let folder_id = path.into_inner();

    // Verify folder ownership
    match FolderRepository::find_by_id(pool.get_ref(), folder_id, user.user_id).await {
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Folder not found"));
        }
        Err(e) => {
            tracing::error!("Failed to verify folder: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to verify folder"));
        }
        Ok(Some(_)) => {}
    }

    // Get total count for pagination
    let total = match ImageRepository::count_by_folder_id(pool.get_ref(), folder_id).await {
        Ok(count) => count,
        Err(e) => {
            tracing::error!("Failed to count images: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to count images"));
        }
    };

    // Fetch paginated images
    let images =
        match ImageRepository::find_by_folder_id(pool.get_ref(), folder_id, query.limit(), query.offset()).await {
            Ok(images) => images,
            Err(e) => {
                tracing::error!("Failed to list images: {:?}", e);
                return HttpResponse::InternalServerError()
                    .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to list images"));
            }
        };

    // Build response
    let mut image_responses = Vec::with_capacity(images.len());
    for image in images {
        let has_analysis = ImageRepository::has_analysis(pool.get_ref(), image.image_id)
            .await
            .unwrap_or(false);

        let metadata = image.metadata.as_ref().and_then(|m| {
            serde_json::from_value::<crate::models::ImageMetadata>(m.clone())
                .ok()
                .map(|meta| ImageMetadataResponse {
                    width: meta.width,
                    height: meta.height,
                })
        });

        image_responses.push(ImageResponse {
            image_id: image.image_id,
            folder_id: image.folder_id,
            original_filename: image.original_filename,
            file_size: image.file_size,
            mime_type: image.mime_type,
            metadata,
            has_analysis,
            uploaded_at: image
                .uploaded_at
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default(),
        });
    }

    HttpResponse::Ok().json(ApiResponse::success(ImageListResponse {
        images: image_responses,
        pagination: PaginationInfo::new(query.page(), query.limit(), total),
    }))
}

// ============================================================================
// Upload Image
// ============================================================================

/// Upload a new image to a folder
#[utoipa::path(
    post,
    path = "/api/v1/folders/{folder_id}/images",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("folder_id" = i32, Path, description = "Folder ID")
    ),
    request_body(content = Vec<u8>, content_type = "multipart/form-data"),
    responses(
        (status = 201, description = "Image uploaded", body = ApiResponse<ImageResponse>),
        (status = 400, description = "Invalid file"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    )
)]
pub async fn upload_image(
    pool: web::Data<PgPool>,
    s3_storage: web::Data<crate::services::S3StorageService>,
    req: HttpRequest,
    path: web::Path<i32>,
    mut payload: Multipart,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let folder_id = path.into_inner();

    // Verify folder ownership
    match FolderRepository::find_by_id(pool.get_ref(), folder_id, user.user_id).await {
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Folder not found"));
        }
        Err(e) => {
            tracing::error!("Failed to verify folder: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to verify folder"));
        }
        Ok(Some(_)) => {}
    }

    // Process multipart form data
    let mut file_data: Option<(String, String, Vec<u8>)> = None; // (filename, content_type, bytes)

    while let Some(Ok(mut field)) = payload.next().await {
        // content_disposition() returns Option in newer versions
        let content_disposition = match field.content_disposition() {
            Some(cd) => cd,
            None => continue,
        };
        let field_name = content_disposition.get_name().unwrap_or("");

        if field_name == "file" {
            let filename = content_disposition
                .get_filename()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "unknown.jpg".to_string());

            let content_type = field.content_type()
                .map(|ct| ct.to_string())
                .unwrap_or_else(|| "application/octet-stream".to_string());

            let mut bytes = Vec::new();
            while let Some(Ok(chunk)) = field.next().await {
                bytes.extend_from_slice(&chunk);
            }

            file_data = Some((filename, content_type, bytes));
            break;
        }
    }

    let (original_filename, content_type, bytes) = match file_data {
        Some(data) => data,
        None => {
            return HttpResponse::BadRequest()
                .json(ApiResponse::<()>::error("VALIDATION_ERROR", "No file provided"));
        }
    };

    // Validate file
    if let Err(e) = ImageService::validate_file(&content_type, &bytes) {
        return HttpResponse::BadRequest()
            .json(ApiResponse::<()>::error("VALIDATION_ERROR", e.to_string()));
    }

    // Generate S3 object key
    let (s3_key, _filename) = crate::services::S3StorageService::generate_object_key(&original_filename);

    // Upload file to S3
    if let Err(e) = s3_storage.upload_file(&s3_key, &bytes, &content_type).await {
        tracing::error!("Failed to upload file to S3: {:?}", e);
        return HttpResponse::InternalServerError()
            .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to upload file to storage"));
    }

    // Extract metadata
    let metadata = ImageService::extract_metadata(&bytes).map(|(width, height)| {
        serde_json::json!({
            "width": width,
            "height": height
        })
    });

    // Create database record (store S3 key as file_path)
    let image = match ImageRepository::create(
        pool.get_ref(),
        folder_id,
        &s3_key,
        &original_filename,
        &content_type,
        bytes.len() as i32,
        metadata.clone(),
    )
    .await
    {
        Ok(image) => image,
        Err(e) => {
            tracing::error!("Failed to create image record: {:?}", e);
            // Try to clean up uploaded file from S3
            let _ = s3_storage.delete_file(&s3_key).await;
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to create image record"));
        }
    };

    let metadata_response = metadata.and_then(|m| {
        serde_json::from_value::<crate::models::ImageMetadata>(m)
            .ok()
            .map(|meta| ImageMetadataResponse {
                width: meta.width,
                height: meta.height,
            })
    });

    HttpResponse::Created().json(ApiResponse::success(ImageResponse {
        image_id: image.image_id,
        folder_id: image.folder_id,
        original_filename: image.original_filename,
        file_size: image.file_size,
        mime_type: image.mime_type,
        metadata: metadata_response,
        has_analysis: false,
        uploaded_at: image
            .uploaded_at
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    }))
}


// ============================================================================
// Get Image Details
// ============================================================================

/// Get details of a specific image
#[utoipa::path(
    get,
    path = "/api/v1/images/{image_id}",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("image_id" = i64, Path, description = "Image ID")
    ),
    responses(
        (status = 200, description = "Image details", body = ApiResponse<ImageDetailResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Image not found")
    )
)]
pub async fn get_image(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let image_id = path.into_inner();

    // Find image with ownership verification
    let image = match ImageRepository::find_by_id(pool.get_ref(), image_id, user.user_id).await {
        Ok(Some(img)) => img,
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"));
        }
        Err(e) => {
            tracing::error!("Failed to get image: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to get image"));
        }
    };

    // Get analysis history
    let history = match ImageRepository::get_analysis_history(pool.get_ref(), image_id).await {
        Ok(h) => h,
        Err(e) => {
            tracing::error!("Failed to get analysis history: {:?}", e);
            Vec::new()
        }
    };

    let analysis_history: Vec<AnalysisHistoryItem> = history
        .into_iter()
        .map(|row| AnalysisHistoryItem {
            job_id: row.job_id,
            status: row.status,
            ai_model_version: row.ai_model_version,
            finished_at: row.finished_at.map(|dt| dt.to_rfc3339()),
        })
        .collect();

    let metadata = image.metadata.as_ref().and_then(|m| {
        serde_json::from_value::<crate::models::ImageMetadata>(m.clone())
            .ok()
            .map(|meta| ImageMetadataResponse {
                width: meta.width,
                height: meta.height,
            })
    });

    HttpResponse::Ok().json(ApiResponse::success(ImageDetailResponse {
        image_id: image.image_id,
        folder_id: image.folder_id,
        original_filename: image.original_filename,
        file_url: format!("/api/v1/images/{}/file", image.image_id),
        file_size: image.file_size,
        mime_type: image.mime_type,
        metadata,
        analysis_history,
        uploaded_at: image
            .uploaded_at
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    }))
}

// ============================================================================
// Rename Image
// ============================================================================

/// Rename an image
#[utoipa::path(
    patch,
    path = "/api/v1/images/{image_id}",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("image_id" = i64, Path, description = "Image ID")
    ),
    request_body = RenameImageRequest,
    responses(
        (status = 200, description = "Image renamed", body = ApiResponse<ImageResponse>),
        (status = 400, description = "Invalid filename"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Image not found")
    )
)]
pub async fn rename_image(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<i64>,
    payload: web::Json<crate::dto::RenameImageRequest>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let image_id = path.into_inner();
    let new_filename = payload.new_filename.trim();

    if new_filename.is_empty() {
        return HttpResponse::BadRequest()
            .json(ApiResponse::<()>::error("VALIDATION_ERROR", "Filename cannot be empty"));
    }

    // Check if image exists and user has ownership
    match ImageRepository::find_by_id(pool.get_ref(), image_id, user.user_id).await {
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"));
        }
        Err(e) => {
            tracing::error!("Failed to verify image: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to verify image"));
        }
        Ok(Some(_)) => {}
    }

    // Update filename
    match ImageRepository::update_filename(pool.get_ref(), image_id, user.user_id, new_filename).await {
        Ok(Some(())) => {
            // Fetch updated image
            match ImageRepository::find_by_id(pool.get_ref(), image_id, user.user_id).await {
                Ok(Some(image)) => {
                     let metadata = image.metadata.as_ref().and_then(|m| {
                        serde_json::from_value::<crate::models::ImageMetadata>(m.clone())
                            .ok()
                            .map(|meta| ImageMetadataResponse {
                                width: meta.width,
                                height: meta.height,
                            })
                    });

                    // Check analysis status
                    let has_analysis = ImageRepository::has_analysis(pool.get_ref(), image.image_id)
                        .await
                        .unwrap_or(false);

                    HttpResponse::Ok().json(ApiResponse::success(ImageResponse {
                        image_id: image.image_id,
                        folder_id: image.folder_id,
                        original_filename: image.original_filename,
                        file_size: image.file_size,
                        mime_type: image.mime_type,
                        metadata,
                        has_analysis,
                        uploaded_at: image
                            .uploaded_at
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default(),
                    }))
                },
                 Err(e) => {
                    tracing::error!("Failed to fetch updated image: {:?}", e);
                    HttpResponse::InternalServerError()
                        .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to fetch updated image"))
                }
                Ok(None) => HttpResponse::NotFound().json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"))
            }
        },
        Ok(None) => {
             HttpResponse::NotFound().json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"))
        }
        Err(e) => {
            tracing::error!("Failed to rename image: {:?}", e);
            HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to rename image"))
        }
    }
}

// ============================================================================
// Delete Image (Soft Delete)
// ============================================================================

/// Delete an image (soft delete)
#[utoipa::path(
    delete,
    path = "/api/v1/images/{image_id}",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("image_id" = i64, Path, description = "Image ID")
    ),
    responses(
        (status = 200, description = "Image deleted", body = ApiResponse<DeleteImageResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Image not found")
    )
)]
pub async fn delete_image(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let image_id = path.into_inner();

    // Soft delete with ownership verification
    match ImageRepository::soft_delete(pool.get_ref(), image_id, user.user_id).await {
        Ok(Some(())) => HttpResponse::Ok().json(ApiResponse::success(DeleteImageResponse {
            message: "Image deleted successfully".to_string(),
        })),
        Ok(None) => {
            HttpResponse::NotFound().json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"))
        }
        Err(e) => {
            tracing::error!("Failed to delete image: {:?}", e);
            HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to delete image"))
        }
    }
}

// ============================================================================
// Get Image File (Serve from S3)
// ============================================================================

/// Get image file content from S3 storage
#[utoipa::path(
    get,
    path = "/api/v1/images/{image_id}/file",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("image_id" = i64, Path, description = "Image ID")
    ),
    responses(
        (status = 200, description = "Image file content", content_type = "image/*"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Image not found")
    )
)]
pub async fn get_image_file(
    pool: web::Data<PgPool>,
    s3_storage: web::Data<crate::services::S3StorageService>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let image_id = path.into_inner();

    // Find image with ownership verification
    let image = match ImageRepository::find_by_id(pool.get_ref(), image_id, user.user_id).await {
        Ok(Some(img)) => img,
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"));
        }
        Err(e) => {
            tracing::error!("Failed to get image: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to get image"));
        }
    };

    // Get file from S3
    let (bytes, content_type) = match s3_storage.get_file(&image.file_path).await {
        Ok(data) => data,
        Err(crate::services::S3Error::NotFound(_)) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Image file not found in storage"));
        }
        Err(e) => {
            tracing::error!("Failed to get file from S3: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to retrieve image file"));
        }
    };

    // Return file with appropriate headers
    HttpResponse::Ok()
        .content_type(content_type)
        .insert_header(("Cache-Control", "public, max-age=31536000"))
        .insert_header((
            "Content-Disposition",
            format!("inline; filename=\"{}\"", image.original_filename),
        ))
        .body(bytes)
}

// ============================================================================
// Request Presigned Upload URL
// ============================================================================

/// Request a presigned URL for direct S3 upload
#[utoipa::path(
    post,
    path = "/api/v1/folders/{folder_id}/images/request-upload",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("folder_id" = i32, Path, description = "Folder ID")
    ),
    request_body = RequestUploadRequest,
    responses(
        (status = 200, description = "Presigned upload URL generated", body = ApiResponse<RequestUploadResponse>),
        (status = 400, description = "Invalid request"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    )
)]
pub async fn request_upload(
    pool: web::Data<PgPool>,
    s3_storage: web::Data<crate::services::S3StorageService>,
    req: HttpRequest,
    path: web::Path<i32>,
    body: web::Json<RequestUploadRequest>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let folder_id = path.into_inner();

    // Verify folder ownership
    match FolderRepository::find_by_id(pool.get_ref(), folder_id, user.user_id).await {
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Folder not found"));
        }
        Err(e) => {
            tracing::error!("Failed to verify folder: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to verify folder"));
        }
        Ok(Some(_)) => {}
    }

    // Validate content type
    let allowed_types = ["image/jpeg", "image/png", "image/tiff"];
    if !allowed_types.contains(&body.content_type.as_str()) {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "VALIDATION_ERROR",
            "Invalid content type. Allowed: image/jpeg, image/png, image/tiff",
        ));
    }

    // Validate file size (50MB max)
    if body.file_size > 50 * 1024 * 1024 {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "VALIDATION_ERROR",
            "File too large. Maximum size: 50MB",
        ));
    }

    // Generate S3 key
    let (s3_key, _filename) = crate::services::S3StorageService::generate_object_key(&body.filename);

    // Generate presigned PUT URL
    let presigned_url = match s3_storage.presign_put(&s3_key, &body.content_type).await {
        Ok(url) => url,
        Err(e) => {
            tracing::error!("Failed to generate presigned URL: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to generate upload URL"));
        }
    };

    // Calculate expiry time
    let expires_at = chrono::Utc::now() + chrono::Duration::seconds(s3_storage.presign_expiry_secs() as i64);

    HttpResponse::Ok().json(ApiResponse::success(RequestUploadResponse {
        upload_token: s3_key, // The S3 key serves as the token
        presigned_url,
        expires_at: expires_at.to_rfc3339(),
    }))
}

// ============================================================================
// Confirm Upload
// ============================================================================

/// Confirm that upload to S3 is complete and register in database
#[utoipa::path(
    post,
    path = "/api/v1/folders/{folder_id}/images/confirm-upload",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("folder_id" = i32, Path, description = "Folder ID")
    ),
    request_body = ConfirmUploadRequest,
    responses(
        (status = 201, description = "Image registered", body = ApiResponse<ImageResponse>),
        (status = 400, description = "Invalid request or file not found in storage"),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    )
)]
pub async fn confirm_upload(
    pool: web::Data<PgPool>,
    s3_storage: web::Data<crate::services::S3StorageService>,
    req: HttpRequest,
    path: web::Path<i32>,
    body: web::Json<ConfirmUploadRequest>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let folder_id = path.into_inner();

    // Verify folder ownership
    match FolderRepository::find_by_id(pool.get_ref(), folder_id, user.user_id).await {
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Folder not found"));
        }
        Err(e) => {
            tracing::error!("Failed to verify folder: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to verify folder"));
        }
        Ok(Some(_)) => {}
    }

    // Verify the upload token looks like a valid S3 key
    if !body.upload_token.starts_with("images/") {
        return HttpResponse::BadRequest().json(ApiResponse::<()>::error(
            "VALIDATION_ERROR",
            "Invalid upload token",
        ));
    }

    // Optional: Verify file exists in S3 (HEAD request)
    // For now, we trust the client and proceed

    // Create database record
    let image = match ImageRepository::create(
        pool.get_ref(),
        folder_id,
        &body.upload_token, // S3 key as file_path
        &body.filename,
        &body.content_type,
        body.file_size as i32,
        None, // No metadata extracted for presigned uploads
    )
    .await
    {
        Ok(image) => image,
        Err(e) => {
            tracing::error!("Failed to create image record: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to create image record"));
        }
    };

    HttpResponse::Created().json(ApiResponse::success(ImageResponse {
        image_id: image.image_id,
        folder_id: image.folder_id,
        original_filename: image.original_filename,
        file_size: image.file_size,
        mime_type: image.mime_type,
        metadata: None,
        has_analysis: false,
        uploaded_at: image
            .uploaded_at
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    }))
}

// ============================================================================
// Get Presigned Download URL
// ============================================================================

/// Get a presigned URL for direct S3 download
#[utoipa::path(
    get,
    path = "/api/v1/images/{image_id}/download-url",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("image_id" = i64, Path, description = "Image ID")
    ),
    responses(
        (status = 200, description = "Presigned download URL", body = ApiResponse<PresignedDownloadResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Image not found")
    )
)]
pub async fn get_image_download_url(
    pool: web::Data<PgPool>,
    s3_storage: web::Data<crate::services::S3StorageService>,
    req: HttpRequest,
    path: web::Path<i64>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let image_id = path.into_inner();

    // Find image with ownership verification
    let image = match ImageRepository::find_by_id(pool.get_ref(), image_id, user.user_id).await {
        Ok(Some(img)) => img,
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"));
        }
        Err(e) => {
            tracing::error!("Failed to get image: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to get image"));
        }
    };

    // Generate presigned GET URL
    let presigned_url = match s3_storage.presign_get(&image.file_path).await {
        Ok(url) => url,
        Err(e) => {
            tracing::error!("Failed to generate presigned download URL: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to generate download URL"));
        }
    };

    // Calculate expiry time
    let expires_at = chrono::Utc::now() + chrono::Duration::seconds(s3_storage.presign_expiry_secs() as i64);

    HttpResponse::Ok().json(ApiResponse::success(PresignedDownloadResponse {
        url: presigned_url,
        expires_at: expires_at.to_rfc3339(),
    }))
}

// ============================================================================
// List Images V2 (Cursor-based Pagination)
// ============================================================================

/// List images in a folder with cursor-based pagination (more efficient for large datasets)
#[utoipa::path(
    get,
    path = "/api/v2/folders/{folder_id}/images",
    tag = "Image Management",
    security(("bearer_auth" = [])),
    params(
        ("folder_id" = i32, Path, description = "Folder ID"),
        CursorPaginationQuery
    ),
    responses(
        (status = 200, description = "List of images with cursor pagination", body = ApiResponse<ImageListResponseV2>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Folder not found")
    )
)]
pub async fn list_images_v2(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<i32>,
    query: web::Query<CursorPaginationQuery>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let folder_id = path.into_inner();

    // Verify folder ownership
    match FolderRepository::find_by_id(pool.get_ref(), folder_id, user.user_id).await {
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Folder not found"));
        }
        Err(e) => {
            tracing::error!("Failed to verify folder: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to verify folder"));
        }
        Ok(Some(_)) => {}
    }

    let limit = query.limit();
    let cursor = query.cursor_datetime();

    // Fetch images with cursor (repository fetches limit+1 to detect has_next)
    let mut images = match ImageRepository::find_by_folder_id_cursor(
        pool.get_ref(),
        folder_id,
        cursor,
        limit,
    )
    .await
    {
        Ok(images) => images,
        Err(e) => {
            tracing::error!("Failed to list images: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to list images"));
        }
    };

    // Check if there are more items
    let has_next = images.len() > limit as usize;
    if has_next {
        images.pop(); // Remove the extra item used for detection
    }

    // Determine next cursor
    let next_cursor = if has_next {
        images.last().and_then(|img| img.uploaded_at.map(|dt| dt.to_rfc3339()))
    } else {
        None
    };

    // Build response
    let mut image_responses = Vec::with_capacity(images.len());
    for image in images {
        let has_analysis = ImageRepository::has_analysis(pool.get_ref(), image.image_id)
            .await
            .unwrap_or(false);

        let metadata = image.metadata.as_ref().and_then(|m| {
            serde_json::from_value::<crate::models::ImageMetadata>(m.clone())
                .ok()
                .map(|meta| ImageMetadataResponse {
                    width: meta.width,
                    height: meta.height,
                })
        });

        image_responses.push(ImageResponse {
            image_id: image.image_id,
            folder_id: image.folder_id,
            original_filename: image.original_filename,
            file_size: image.file_size,
            mime_type: image.mime_type,
            metadata,
            has_analysis,
            uploaded_at: image
                .uploaded_at
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default(),
        });
    }

    HttpResponse::Ok().json(ApiResponse::success(ImageListResponseV2 {
        images: image_responses.clone(),
        pagination: CursorPaginationInfo {
            has_next,
            next_cursor,
            count: image_responses.len() as i32,
        },
    }))
}
