//! Analysis Handlers
//!
//! AI Analysis endpoints with RabbitMQ integration for asynchronous processing.

use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use sqlx::PgPool;

use crate::domain::ApiResponse;
use crate::dto::analysis::{
    AnalysisHistorySummary, AnalysisResultResponse, AnalyzeImageRequest, AnalyzeImageResponse,
    CellCounts, CellPercentages, ImageAnalysisHistoryResponse, JobStatusResponse,
    RawDetectionData,
};
use crate::middleware::AuthenticatedUser;
use crate::models::job::JobStatus;
use crate::repositories::{AnalysisResultRepository, ImageRepository, JobRepository};
use crate::services::{AnalysisJobMessage, RabbitmqService};

// ============================================================================
// Analyze Image (Submit for Analysis)
// ============================================================================

/// Submit an image for AI analysis via RabbitMQ
#[utoipa::path(
    post,
    path = "/api/v1/images/{image_id}/analyze",
    tag = "AI Analysis",
    security(("bearer_auth" = [])),
    params(
        ("image_id" = i64, Path, description = "Image ID")
    ),
    request_body = AnalyzeImageRequest,
    responses(
        (status = 202, description = "Analysis job created", body = ApiResponse<AnalyzeImageResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Image not found")
    )
)]
pub async fn analyze_image(
    pool: web::Data<PgPool>,
    rabbitmq: web::Data<RabbitmqService>,
    req: HttpRequest,
    path: web::Path<i64>,
    body: Option<web::Json<AnalyzeImageRequest>>,
) -> HttpResponse {
    let user = match req.extensions().get::<AuthenticatedUser>() {
        Some(u) => u.clone(),
        None => {
            return HttpResponse::Unauthorized()
                .json(ApiResponse::<()>::error("UNAUTHORIZED", "Authentication required"));
        }
    };

    let image_id = path.into_inner();
    let request = body.map(|b| b.into_inner()).unwrap_or_default();

    // Verify image ownership and get image details
    let image = match ImageRepository::find_by_id(pool.get_ref(), image_id, user.user_id).await {
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Image not found"));
        }
        Err(e) => {
            tracing::error!("Failed to verify image: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to verify image"));
        }
        Ok(Some(img)) => img,
    };

    // Create job
    let job = match JobRepository::create(pool.get_ref(), image_id, &request.model_version).await {
        Ok(job) => job,
        Err(e) => {
            tracing::error!("Failed to create job: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to create analysis job"));
        }
    };

    // Publish job to RabbitMQ for Python model worker to process
    let message = AnalysisJobMessage {
        job_id: job.job_id,
        image_id: job.image_id,
        s3_key: image.file_path.clone(),
        model_version: request.model_version.clone(),
        created_at: job
            .created_at
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    };

    if let Err(e) = rabbitmq.publish_analysis_job(message).await {
        tracing::error!("Failed to publish job to RabbitMQ: {:?}", e);
        // Mark job as failed since we couldn't queue it
        let _ = JobRepository::fail(pool.get_ref(), job.job_id, "Failed to queue analysis job").await;
        return HttpResponse::InternalServerError()
            .json(ApiResponse::<()>::error("QUEUE_ERROR", "Failed to submit analysis job"));
    }

    tracing::info!("Analysis job {} queued for image {}", job.job_id, image_id);

    HttpResponse::Accepted().json(ApiResponse::success(AnalyzeImageResponse {
        job_id: job.job_id,
        image_id: job.image_id,
        status: job.status.to_string(),
        ai_model_version: request.model_version,
        status_url: format!("/api/v1/jobs/{}", job.job_id),
        created_at: job
            .created_at
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    }))
}

// ============================================================================
// Check Job Status
// ============================================================================

/// Get the status of an analysis job
#[utoipa::path(
    get,
    path = "/api/v1/jobs/{job_id}",
    tag = "AI Analysis",
    security(("bearer_auth" = [])),
    params(
        ("job_id" = i64, Path, description = "Job ID")
    ),
    responses(
        (status = 200, description = "Job status", body = ApiResponse<JobStatusResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Job not found")
    )
)]
pub async fn get_job_status(
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

    let job_id = path.into_inner();

    let job = match JobRepository::find_by_id(pool.get_ref(), job_id, user.user_id).await {
        Ok(Some(job)) => job,
        Ok(None) => {
            return HttpResponse::NotFound()
                .json(ApiResponse::<()>::error("NOT_FOUND", "Job not found"));
        }
        Err(e) => {
            tracing::error!("Failed to get job: {:?}", e);
            return HttpResponse::InternalServerError()
                .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to get job status"));
        }
    };

    let result_url = if job.status == JobStatus::Completed {
        Some(format!("/api/v1/jobs/{}/result", job_id))
    } else {
        None
    };

    HttpResponse::Ok().json(ApiResponse::success(JobStatusResponse {
        job_id: job.job_id,
        image_id: job.image_id,
        status: job.status.to_string(),
        ai_model_version: job.ai_model_version,
        started_at: job.started_at.map(|dt| dt.to_rfc3339()),
        finished_at: job.finished_at.map(|dt| dt.to_rfc3339()),
        error_message: job.error_message,
        result_url,
    }))
}

// ============================================================================
// Get Analysis Result
// ============================================================================

/// Get the result of a completed analysis job
#[utoipa::path(
    get,
    path = "/api/v1/jobs/{job_id}/result",
    tag = "AI Analysis",
    security(("bearer_auth" = [])),
    params(
        ("job_id" = i64, Path, description = "Job ID")
    ),
    responses(
        (status = 200, description = "Analysis result", body = ApiResponse<AnalysisResultResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Result not found")
    )
)]
pub async fn get_job_result(
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

    let job_id = path.into_inner();

    let (result, image_id) =
        match AnalysisResultRepository::find_by_job_id(pool.get_ref(), job_id, user.user_id).await {
            Ok(Some(data)) => data,
            Ok(None) => {
                return HttpResponse::NotFound()
                    .json(ApiResponse::<()>::error("NOT_FOUND", "Analysis result not found"));
            }
            Err(e) => {
                tracing::error!("Failed to get result: {:?}", e);
                return HttpResponse::InternalServerError()
                    .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to get result"));
            }
        };

    let total_cells = result.count_viable + result.count_apoptosis + result.count_other;
    let total_f = total_cells as f64;

    let percentages = if total_cells > 0 {
        CellPercentages {
            viable: (result.count_viable as f64 / total_f) * 100.0,
            apoptosis: (result.count_apoptosis as f64 / total_f) * 100.0,
            other: (result.count_other as f64 / total_f) * 100.0,
        }
    } else {
        CellPercentages {
            viable: 0.0,
            apoptosis: 0.0,
            other: 0.0,
        }
    };

    let raw_data = result.raw_data.clone().and_then(|data| {
        match serde_json::from_value::<RawDetectionData>(data.clone()) {
            Ok(d) => Some(d),
            Err(e) => {
                tracing::error!("Failed to parse raw_data for result_id {}: {:?}. Data: {:?}", result.result_id, e, data);
                None
            }
        }
    });

    HttpResponse::Ok().json(ApiResponse::success(AnalysisResultResponse {
        result_id: result.result_id,
        job_id: result.job_id,
        image_id,
        counts: CellCounts {
            viable: result.count_viable,
            apoptosis: result.count_apoptosis,
            other: result.count_other,
        },
        total_cells,
        avg_confidence_score: result.avg_confidence_score.unwrap_or(0.0),
        percentages,
        raw_data,
        summary_data: result.summary_data,
        analyzed_at: result
            .analyzed_at
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default(),
    }))
}

// ============================================================================
// Get Image Analysis History
// ============================================================================

/// Get analysis history for an image
#[utoipa::path(
    get,
    path = "/api/v1/images/{image_id}/analysis-history",
    tag = "AI Analysis",
    security(("bearer_auth" = [])),
    params(
        ("image_id" = i64, Path, description = "Image ID")
    ),
    responses(
        (status = 200, description = "Analysis history", body = ApiResponse<ImageAnalysisHistoryResponse>),
        (status = 401, description = "Unauthorized"),
        (status = 404, description = "Image not found")
    )
)]
pub async fn get_analysis_history(
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

    // Verify image ownership
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

    let history =
        match JobRepository::get_history_by_image(pool.get_ref(), image_id, user.user_id).await {
            Ok(h) => h,
            Err(e) => {
                tracing::error!("Failed to get analysis history: {:?}", e);
                return HttpResponse::InternalServerError()
                    .json(ApiResponse::<()>::error("INTERNAL_ERROR", "Failed to get history"));
            }
        };

    let total = history.len() as i64;
    let analyses: Vec<AnalysisHistorySummary> = history
        .into_iter()
        .map(|(job, result)| {
            let counts = result.as_ref().map(|r| CellCounts {
                viable: r.count_viable,
                apoptosis: r.count_apoptosis,
                other: r.count_other,
            });
            let avg_confidence = result.as_ref().and_then(|r| r.avg_confidence_score);

            AnalysisHistorySummary {
                job_id: job.job_id,
                status: job.status.to_string(),
                ai_model_version: job.ai_model_version,
                counts,
                avg_confidence_score: avg_confidence,
                finished_at: job.finished_at.map(|dt| dt.to_rfc3339()),
            }
        })
        .collect();

    HttpResponse::Ok().json(ApiResponse::success(ImageAnalysisHistoryResponse {
        image_id,
        analyses,
        total,
    }))
}
