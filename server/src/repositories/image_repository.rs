//! Image Repository
//!
//! Database operations for images with ownership verification.

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::Image;

/// Repository for image database operations
pub struct ImageRepository;

impl ImageRepository {
    /// Create a new image record
    /// Time complexity: O(log n) with index maintenance
    pub async fn create(
        pool: &PgPool,
        folder_id: i32,
        file_path: &str,
        original_filename: &str,
        mime_type: &str,
        file_size: i32,
        metadata: Option<serde_json::Value>,
    ) -> Result<Image, sqlx::Error> {
        sqlx::query_as::<_, Image>(
            r#"
            INSERT INTO images (folder_id, file_path, original_filename, mime_type, file_size, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING image_id, folder_id, file_path, original_filename, mime_type, file_size, metadata, uploaded_at, deleted_at
            "#,
        )
        .bind(folder_id)
        .bind(file_path)
        .bind(original_filename)
        .bind(mime_type)
        .bind(file_size)
        .bind(metadata)
        .fetch_one(pool)
        .await
    }

    /// Find images by folder ID with pagination (excludes soft-deleted)
    /// Time complexity: O(K + log N) where K = limit, N = total images in folder
    pub async fn find_by_folder_id(
        pool: &PgPool,
        folder_id: i32,
        limit: i32,
        offset: i64,
    ) -> Result<Vec<Image>, sqlx::Error> {
        sqlx::query_as::<_, Image>(
            r#"
            SELECT image_id, folder_id, file_path, original_filename, mime_type, file_size, metadata, uploaded_at, deleted_at
            FROM images
            WHERE folder_id = $1 AND deleted_at IS NULL
            ORDER BY uploaded_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(folder_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
    }

    /// Find images by folder ID with cursor-based pagination (excludes soft-deleted)
    /// Time complexity: O(K + log N) - more efficient than OFFSET for large datasets
    /// 
    /// # Arguments
    /// * `cursor` - If Some, fetches images uploaded before this timestamp
    /// * `limit` - Number of images to fetch (will fetch limit+1 to detect has_next)
    /// 
    /// # Returns
    /// * Vec of images (up to limit+1 to allow caller to detect if there are more)
    pub async fn find_by_folder_id_cursor(
        pool: &PgPool,
        folder_id: i32,
        cursor: Option<chrono::DateTime<chrono::Utc>>,
        limit: i32,
    ) -> Result<Vec<Image>, sqlx::Error> {
        match cursor {
            Some(cursor_time) => {
                sqlx::query_as::<_, Image>(
                    r#"
                    SELECT image_id, folder_id, file_path, original_filename, mime_type, file_size, metadata, uploaded_at, deleted_at
                    FROM images
                    WHERE folder_id = $1 AND deleted_at IS NULL AND uploaded_at < $2
                    ORDER BY uploaded_at DESC
                    LIMIT $3
                    "#,
                )
                .bind(folder_id)
                .bind(cursor_time)
                .bind(limit + 1) // Fetch one extra to detect has_next
                .fetch_all(pool)
                .await
            }
            None => {
                sqlx::query_as::<_, Image>(
                    r#"
                    SELECT image_id, folder_id, file_path, original_filename, mime_type, file_size, metadata, uploaded_at, deleted_at
                    FROM images
                    WHERE folder_id = $1 AND deleted_at IS NULL
                    ORDER BY uploaded_at DESC
                    LIMIT $2
                    "#,
                )
                .bind(folder_id)
                .bind(limit + 1) // Fetch one extra to detect has_next
                .fetch_all(pool)
                .await
            }
        }
    }

    /// Count images in folder (excludes soft-deleted)
    pub async fn count_by_folder_id(pool: &PgPool, folder_id: i32) -> Result<i64, sqlx::Error> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM images WHERE folder_id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(folder_id)
        .fetch_one(pool)
        .await?;

        Ok(count.0)
    }

    /// Find image by ID with ownership verification via folder
    /// Time complexity: O(log n) using primary key index
    pub async fn find_by_id(
        pool: &PgPool,
        image_id: i64,
        user_id: Uuid,
    ) -> Result<Option<Image>, sqlx::Error> {
        sqlx::query_as::<_, Image>(
            r#"
            SELECT i.image_id, i.folder_id, i.file_path, i.original_filename, i.mime_type, 
                   i.file_size, i.metadata, i.uploaded_at, i.deleted_at
            FROM images i
            INNER JOIN folders f ON i.folder_id = f.folder_id
            WHERE i.image_id = $1 AND f.user_id = $2 AND i.deleted_at IS NULL
            "#,
        )
        .bind(image_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    /// Soft delete an image (set deleted_at timestamp)
    /// Time complexity: O(log n)
    pub async fn soft_delete(
        pool: &PgPool,
        image_id: i64,
        user_id: Uuid,
    ) -> Result<Option<()>, sqlx::Error> {
        let result = sqlx::query(
            r#"
            UPDATE images i
            SET deleted_at = NOW()
            FROM folders f
            WHERE i.image_id = $1 
              AND i.folder_id = f.folder_id 
              AND f.user_id = $2 
              AND i.deleted_at IS NULL
            "#,
        )
        .bind(image_id)
        .bind(user_id)
        .execute(pool)
        .await?;

        if result.rows_affected() > 0 {
            Ok(Some(()))
        } else {
            Ok(None)
        }
    }

    /// Rename an image
    /// Time complexity: O(log n)
    pub async fn update_filename(
        pool: &PgPool,
        image_id: i64,
        user_id: Uuid,
        new_filename: &str,
    ) -> Result<Option<()>, sqlx::Error> {
        let result = sqlx::query(
            r#"
            UPDATE images i
            SET original_filename = $1
            FROM folders f
            WHERE i.image_id = $2
              AND i.folder_id = f.folder_id
              AND f.user_id = $3
              AND i.deleted_at IS NULL
            "#,
        )
        .bind(new_filename)
        .bind(image_id)
        .bind(user_id)
        .execute(pool)
        .await?;

        if result.rows_affected() > 0 {
            Ok(Some(()))
        } else {
            Ok(None)
        }
    }

    /// Check if image has any analysis jobs
    pub async fn has_analysis(pool: &PgPool, image_id: i64) -> Result<bool, sqlx::Error> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM jobs WHERE image_id = $1
            "#,
        )
        .bind(image_id)
        .fetch_one(pool)
        .await?;

        Ok(count.0 > 0)
    }

    /// Get analysis history for an image
    pub async fn get_analysis_history(
        pool: &PgPool,
        image_id: i64,
    ) -> Result<Vec<AnalysisJobRow>, sqlx::Error> {
        sqlx::query_as::<_, AnalysisJobRow>(
            r#"
            SELECT job_id, status::text, ai_model_version, finished_at
            FROM jobs
            WHERE image_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(image_id)
        .fetch_all(pool)
        .await
    }
}

/// Row struct for analysis job query
#[derive(Debug, sqlx::FromRow)]
pub struct AnalysisJobRow {
    pub job_id: i64,
    pub status: String,
    pub ai_model_version: Option<String>,
    pub finished_at: Option<chrono::DateTime<chrono::Utc>>,
}
