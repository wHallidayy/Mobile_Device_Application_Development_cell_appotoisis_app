//! Job Repository
//!
//! Database operations for jobs and analysis results.

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::job::{AnalysisResult, Job};

/// Repository for job database operations
pub struct JobRepository;

impl JobRepository {
    /// Create a new job for an image
    pub async fn create(
        pool: &PgPool,
        image_id: i64,
        model_version: &str,
    ) -> Result<Job, sqlx::Error> {
        sqlx::query_as::<_, Job>(
            r#"
            INSERT INTO jobs (image_id, status, ai_model_version)
            VALUES ($1, 'pending', $2)
            RETURNING job_id, image_id, status, ai_model_version, started_at, finished_at, error_message, created_at
            "#,
        )
        .bind(image_id)
        .bind(model_version)
        .fetch_one(pool)
        .await
    }

    /// Find job by ID with ownership verification
    pub async fn find_by_id(
        pool: &PgPool,
        job_id: i64,
        user_id: Uuid,
    ) -> Result<Option<Job>, sqlx::Error> {
        sqlx::query_as::<_, Job>(
            r#"
            SELECT j.job_id, j.image_id, j.status, j.ai_model_version, 
                   j.started_at, j.finished_at, j.error_message, j.created_at
            FROM jobs j
            INNER JOIN images i ON j.image_id = i.image_id
            INNER JOIN folders f ON i.folder_id = f.folder_id
            WHERE j.job_id = $1 AND f.user_id = $2
            "#,
        )
        .bind(job_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    /// Update job status to processing
    pub async fn start_processing(pool: &PgPool, job_id: i64) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE jobs SET status = 'processing', started_at = NOW()
            WHERE job_id = $1
            "#,
        )
        .bind(job_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Complete job with success
    pub async fn complete(pool: &PgPool, job_id: i64) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE jobs SET status = 'completed', finished_at = NOW()
            WHERE job_id = $1
            "#,
        )
        .bind(job_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Fail job with error message
    pub async fn fail(pool: &PgPool, job_id: i64, error_message: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE jobs SET status = 'failed', finished_at = NOW(), error_message = $2
            WHERE job_id = $1
            "#,
        )
        .bind(job_id)
        .bind(error_message)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Get analysis history for an image
    pub async fn get_history_by_image(
        pool: &PgPool,
        image_id: i64,
        user_id: Uuid,
    ) -> Result<Vec<(Job, Option<AnalysisResult>)>, sqlx::Error> {
        // First verify ownership
        let jobs = sqlx::query_as::<_, Job>(
            r#"
            SELECT j.job_id, j.image_id, j.status, j.ai_model_version, 
                   j.started_at, j.finished_at, j.error_message, j.created_at
            FROM jobs j
            INNER JOIN images i ON j.image_id = i.image_id
            INNER JOIN folders f ON i.folder_id = f.folder_id
            WHERE j.image_id = $1 AND f.user_id = $2
            ORDER BY j.created_at DESC
            "#,
        )
        .bind(image_id)
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        let mut results = Vec::with_capacity(jobs.len());
        for job in jobs {
            let result = sqlx::query_as::<_, AnalysisResult>(
                r#"
                SELECT result_id, job_id, count_viable, count_apoptosis, count_other,
                       avg_confidence_score, raw_data, summary_data, analyzed_at
                FROM analysis_results
                WHERE job_id = $1
                "#,
            )
            .bind(job.job_id)
            .fetch_optional(pool)
            .await?;
            results.push((job, result));
        }

        Ok(results)
    }
}

/// Repository for analysis results
pub struct AnalysisResultRepository;

impl AnalysisResultRepository {
    /// Create analysis result
    pub async fn create(
        pool: &PgPool,
        job_id: i64,
        count_viable: i32,
        count_apoptosis: i32,
        count_other: i32,
        avg_confidence_score: f64,
        raw_data: Option<serde_json::Value>,
        summary_data: Option<String>,
    ) -> Result<AnalysisResult, sqlx::Error> {
        sqlx::query_as::<_, AnalysisResult>(
            r#"
            INSERT INTO analysis_results 
                (job_id, count_viable, count_apoptosis, count_other, avg_confidence_score, raw_data, summary_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING result_id, job_id, count_viable, count_apoptosis, count_other, 
                      avg_confidence_score, raw_data, summary_data, analyzed_at
            "#,
        )
        .bind(job_id)
        .bind(count_viable)
        .bind(count_apoptosis)
        .bind(count_other)
        .bind(avg_confidence_score)
        .bind(raw_data)
        .bind(summary_data)
        .fetch_one(pool)
        .await
    }

    /// Find result by job ID with ownership verification
    pub async fn find_by_job_id(
        pool: &PgPool,
        job_id: i64,
        user_id: Uuid,
    ) -> Result<Option<(AnalysisResult, i64)>, sqlx::Error> {
        // Use a helper struct to query result with image_id
        #[derive(sqlx::FromRow)]
        struct ResultWithImageId {
            result_id: i64,
            job_id: i64,
            count_viable: i32,
            count_apoptosis: i32,
            count_other: i32,
            avg_confidence_score: Option<f64>,
            raw_data: Option<serde_json::Value>,
            summary_data: Option<String>,
            analyzed_at: Option<chrono::DateTime<chrono::Utc>>,
            image_id: i64,
        }

        let result = sqlx::query_as::<_, ResultWithImageId>(
            r#"
            SELECT ar.result_id, ar.job_id, ar.count_viable, ar.count_apoptosis, ar.count_other,
                   ar.avg_confidence_score, ar.raw_data, ar.summary_data, ar.analyzed_at,
                   j.image_id
            FROM analysis_results ar
            INNER JOIN jobs j ON ar.job_id = j.job_id
            INNER JOIN images i ON j.image_id = i.image_id
            INNER JOIN folders f ON i.folder_id = f.folder_id
            WHERE ar.job_id = $1 AND f.user_id = $2
            "#,
        )
        .bind(job_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(result.map(|r| {
            (
                AnalysisResult {
                    result_id: r.result_id,
                    job_id: r.job_id,
                    count_viable: r.count_viable,
                    count_apoptosis: r.count_apoptosis,
                    count_other: r.count_other,
                    avg_confidence_score: r.avg_confidence_score,
                    raw_data: r.raw_data,
                    summary_data: r.summary_data,
                    analyzed_at: r.analyzed_at,
                },
                r.image_id,
            )
        }))
    }
}
