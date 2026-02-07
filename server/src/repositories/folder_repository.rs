use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::models::Folder;

/// Row struct for folder with image count query
#[derive(Debug, FromRow)]
struct FolderWithCount {
    folder_id: i32,
    user_id: Uuid,
    folder_name: String,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    deleted_at: Option<chrono::DateTime<chrono::Utc>>,
    image_count: i64,
}

/// Repository for folder database operations
pub struct FolderRepository;

impl FolderRepository {
    /// Create a new folder for a user
    /// Time complexity: O(log n) with index maintenance
    pub async fn create(
        pool: &PgPool,
        user_id: Uuid,
        folder_name: &str,
    ) -> Result<Folder, sqlx::Error> {
        sqlx::query_as::<_, Folder>(
            r#"
            INSERT INTO folders (user_id, folder_name)
            VALUES ($1, $2)
            RETURNING folder_id, user_id, folder_name, created_at, deleted_at
            "#,
        )
        .bind(user_id)
        .bind(folder_name)
        .fetch_one(pool)
        .await
    }

    /// Find all folders for a user with image count
    /// Time complexity: O(n) where n = number of user's folders
    pub async fn find_by_user_id(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<(Folder, i64)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, FolderWithCount>(
            r#"
            SELECT f.folder_id, f.user_id, f.folder_name, f.created_at, f.deleted_at,
                   COALESCE(COUNT(i.image_id), 0)::bigint as image_count
            FROM folders f
            LEFT JOIN images i ON f.folder_id = i.folder_id
            WHERE f.user_id = $1 AND f.deleted_at IS NULL
            GROUP BY f.folder_id
            ORDER BY f.created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                (
                    Folder {
                        folder_id: row.folder_id,
                        user_id: row.user_id,
                        folder_name: row.folder_name,
                        created_at: row.created_at,
                        deleted_at: row.deleted_at,
                    },
                    row.image_count,
                )
            })
            .collect())
    }

    /// Find a folder by ID (with ownership check)
    /// Time complexity: O(log n) using primary key index
    pub async fn find_by_id(
        pool: &PgPool,
        folder_id: i32,
        user_id: Uuid,
    ) -> Result<Option<Folder>, sqlx::Error> {
        sqlx::query_as::<_, Folder>(
            r#"
            SELECT folder_id, user_id, folder_name, created_at, deleted_at
            FROM folders
            WHERE folder_id = $1 AND user_id = $2 AND deleted_at IS NULL
            "#,
        )
        .bind(folder_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    /// Update folder name
    /// Time complexity: O(log n)
    pub async fn update_name(
        pool: &PgPool,
        folder_id: i32,
        user_id: Uuid,
        new_name: &str,
    ) -> Result<Option<Folder>, sqlx::Error> {
        sqlx::query_as::<_, Folder>(
            r#"
            UPDATE folders
            SET folder_name = $3
            WHERE folder_id = $1 AND user_id = $2 AND deleted_at IS NULL
            RETURNING folder_id, user_id, folder_name, created_at, deleted_at
            "#,
        )
        .bind(folder_id)
        .bind(user_id)
        .bind(new_name)
        .fetch_optional(pool)
        .await
    }

    /// Soft delete folder by setting deleted_at timestamp
    /// Time complexity: O(log n)
    pub async fn delete(
        pool: &PgPool,
        folder_id: i32,
        user_id: Uuid,
    ) -> Result<Option<i64>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // 1. Update folder status
        let result = sqlx::query(
            r#"
            UPDATE folders
            SET deleted_at = NOW()
            WHERE folder_id = $1 AND user_id = $2 AND deleted_at IS NULL
            RETURNING folder_id
            "#,
        )
        .bind(folder_id)
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await?;

        if result.is_none() {
            tx.rollback().await?;
            return Ok(None);
        }

        // 2. Soft delete valid images in the folder
        let image_result = sqlx::query(
            r#"
            UPDATE images
            SET deleted_at = NOW()
            WHERE folder_id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(folder_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        // Return number of images that were deleted
        Ok(Some(image_result.rows_affected() as i64))
    }

    /// Restore a soft-deleted folder and its images
    /// Time complexity: O(log n)
    pub async fn restore(
        pool: &PgPool,
        folder_id: i32,
        user_id: Uuid,
    ) -> Result<Option<Folder>, sqlx::Error> {
        let mut tx = pool.begin().await?;

        // 1. Restore folder
        let folder = sqlx::query_as::<_, Folder>(
            r#"
            UPDATE folders
            SET deleted_at = NULL
            WHERE folder_id = $1 AND user_id = $2 AND deleted_at IS NOT NULL
            RETURNING folder_id, user_id, folder_name, created_at, deleted_at
            "#,
        )
        .bind(folder_id)
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(restored_folder) = folder {
            // 2. Restore images
            sqlx::query(
                r#"
                UPDATE images
                SET deleted_at = NULL
                WHERE folder_id = $1 AND deleted_at IS NOT NULL
                "#,
            )
            .bind(folder_id)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;
            Ok(Some(restored_folder))
        } else {
            tx.rollback().await?;
            Ok(None)
        }
    }

    /// Permanently delete a folder (hard delete)
    /// Time complexity: O(m) where m = number of images in folder
    pub async fn hard_delete(
        pool: &PgPool,
        folder_id: i32,
        user_id: Uuid,
    ) -> Result<Option<i64>, sqlx::Error> {
        // First count images that will be deleted
        let image_count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM images
            WHERE folder_id = $1
            AND folder_id IN (SELECT folder_id FROM folders WHERE user_id = $2)
            "#,
        )
        .bind(folder_id)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        // Hard delete folder (cascade will delete images)
        let result = sqlx::query(
            r#"
            DELETE FROM folders
            WHERE folder_id = $1 AND user_id = $2
            "#,
        )
        .bind(folder_id)
        .bind(user_id)
        .execute(pool)
        .await?;

        if result.rows_affected() > 0 {
            Ok(Some(image_count.0))
        } else {
            Ok(None)
        }
    }

    /// Find all soft-deleted folders for a user (trash)
    /// Time complexity: O(n) where n = number of user's deleted folders
    pub async fn find_deleted_by_user_id(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<(Folder, i64)>, sqlx::Error> {
        let rows = sqlx::query_as::<_, FolderWithCount>(
            r#"
            SELECT f.folder_id, f.user_id, f.folder_name, f.created_at, f.deleted_at,
                   COALESCE(COUNT(i.image_id), 0)::bigint as image_count
            FROM folders f
            LEFT JOIN images i ON f.folder_id = i.folder_id
            WHERE f.user_id = $1 AND f.deleted_at IS NOT NULL
            GROUP BY f.folder_id
            ORDER BY f.deleted_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| {
                (
                    Folder {
                        folder_id: row.folder_id,
                        user_id: row.user_id,
                        folder_name: row.folder_name,
                        created_at: row.created_at,
                        deleted_at: row.deleted_at,
                    },
                    row.image_count,
                )
            })
            .collect())
    }

    /// Get image count for a folder
    pub async fn get_image_count(pool: &PgPool, folder_id: i32) -> Result<i64, sqlx::Error> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM images WHERE folder_id = $1
            "#,
        )
        .bind(folder_id)
        .fetch_one(pool)
        .await?;

        Ok(count.0)
    }
}
