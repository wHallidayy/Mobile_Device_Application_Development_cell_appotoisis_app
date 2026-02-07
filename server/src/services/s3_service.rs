//! S3 Storage Service
//!
//! Handles file upload, download, and deletion for S3-compatible storage (MinIO).

use s3::bucket::Bucket;
use s3::creds::Credentials;
use s3::region::Region;
use std::sync::Arc;
use thiserror::Error;

use crate::config::settings::StorageConfig;

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, Error)]
pub enum S3Error {
    #[error("Failed to create credentials: {0}")]
    CredentialsError(String),

    #[error("Failed to create bucket: {0}")]
    BucketError(String),

    #[error("Failed to upload file: {0}")]
    UploadError(String),

    #[error("Failed to download file: {0}")]
    DownloadError(String),

    #[error("Failed to delete file: {0}")]
    DeleteError(String),

    #[error("File not found: {0}")]
    NotFound(String),
}

// ============================================================================
// S3 Storage Service
// ============================================================================

/// S3-compatible storage service for file operations
#[derive(Clone)]
pub struct S3StorageService {
    bucket: Arc<Bucket>,
    presign_bucket: Arc<Bucket>,
    presign_expiry_secs: u64,
}

impl S3StorageService {
    /// Create a new S3 storage service from configuration
    pub fn new(config: &StorageConfig) -> Result<Self, S3Error> {
        // Create credentials from config
        use secrecy::ExposeSecret;
        
        let credentials = Credentials::new(
            Some(config.access_key.expose_secret()),
            Some(config.secret_key.expose_secret()),
            None,
            None,
            None,
        )
        .map_err(|e| S3Error::CredentialsError(e.to_string()))?;

        // Create custom region from config
        let region = Region::Custom {
            region: config.region.clone(),
            endpoint: config.endpoint.clone(),
        };

        // Create bucket with path-style addressing (required for MinIO)
        let bucket = Bucket::new(&config.bucket, region, credentials.clone())
            .map_err(|e| S3Error::BucketError(e.to_string()))?
            .with_path_style();

        // Create presign bucket logic
        let presign_bucket = if let Some(public_endpoint) = &config.public_endpoint {
            tracing::info!("Using public endpoint for presigned URLs: {}", public_endpoint);
            let public_region = Region::Custom {
                region: config.region.clone(),
                endpoint: public_endpoint.clone(),
            };
            *Bucket::new(&config.bucket, public_region, credentials)
                .map_err(|e| S3Error::BucketError(e.to_string()))?
                .with_path_style()
        } else {
            *bucket.clone()
        };

        Ok(Self {
            bucket: Arc::new(*bucket),
            presign_bucket: Arc::new(presign_bucket),
            presign_expiry_secs: config.presign_expiry_secs,
        })
    }

    /// Upload a file to S3
    ///
    /// # Arguments
    /// * `key` - The S3 object key (e.g., "images/uuid.jpg")
    /// * `bytes` - File content as bytes
    /// * `content_type` - MIME type of the file
    ///
    /// # Returns
    /// * `Ok(())` on success
    /// * `Err(S3Error)` on failure
    pub async fn upload_file(
        &self,
        key: &str,
        bytes: &[u8],
        content_type: &str,
    ) -> Result<(), S3Error> {
        self.bucket
            .put_object_with_content_type(key, bytes, content_type)
            .await
            .map_err(|e| S3Error::UploadError(e.to_string()))?;

        tracing::info!("Uploaded file to S3: {}", key);
        Ok(())
    }

    /// Download a file from S3
    ///
    /// # Arguments
    /// * `key` - The S3 object key
    ///
    /// # Returns
    /// * `Ok((bytes, content_type))` on success
    /// * `Err(S3Error)` on failure
    pub async fn get_file(&self, key: &str) -> Result<(Vec<u8>, String), S3Error> {
        let response = self
            .bucket
            .get_object(key)
            .await
            .map_err(|e| S3Error::DownloadError(e.to_string()))?;

        // Check if file exists (status code 200)
        if response.status_code() == 404 {
            return Err(S3Error::NotFound(key.to_string()));
        }

        let content_type = response
            .headers()
            .get("content-type")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        Ok((response.to_vec(), content_type))
    }

    /// Delete a file from S3
    ///
    /// # Arguments
    /// * `key` - The S3 object key
    ///
    /// # Returns
    /// * `Ok(())` on success
    /// * `Err(S3Error)` on failure
    pub async fn delete_file(&self, key: &str) -> Result<(), S3Error> {
        self.bucket
            .delete_object(key)
            .await
            .map_err(|e| S3Error::DeleteError(e.to_string()))?;

        tracing::info!("Deleted file from S3: {}", key);
        Ok(())
    }

    /// Generate an S3 object key for a new file
    ///
    /// # Arguments
    /// * `original_filename` - Original filename from upload
    ///
    /// # Returns
    /// * Tuple of (s3_key, filename) - e.g., ("images/uuid.jpg", "uuid.jpg")
    pub fn generate_object_key(original_filename: &str) -> (String, String) {
        let uuid = uuid::Uuid::new_v4();
        let extension = std::path::Path::new(original_filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("jpg")
            .to_lowercase();

        let filename = format!("{}.{}", uuid, extension);
        let key = format!("images/{}", filename);

        (key, filename)
    }

    /// Generate a presigned PUT URL for direct client upload
    ///
    /// # Arguments
    /// * `key` - The S3 object key
    /// * `content_type` - MIME type of the file to be uploaded
    ///
    /// # Returns
    /// * `Ok(url)` - Presigned URL valid for configured expiry time
    /// * `Err(S3Error)` - On failure
    pub async fn presign_put(&self, key: &str, _content_type: &str) -> Result<String, S3Error> {
        // Note: Content-Type is set by the client when uploading to the presigned URL
        // Passing None for headers since actix_web and rust-s3 use different http crate versions
        let url = self
            .presign_bucket
            .presign_put(key, self.presign_expiry_secs as u32, None, None)
            .await
            .map_err(|e| S3Error::UploadError(format!("Failed to generate presigned PUT URL: {}", e)))?;

        tracing::info!("Generated presigned PUT URL for key: {}", key);
        Ok(url)
    }

    /// Generate a presigned GET URL for direct client download
    ///
    /// # Arguments
    /// * `key` - The S3 object key
    ///
    /// # Returns
    /// * `Ok(url)` - Presigned URL valid for configured expiry time
    /// * `Err(S3Error)` - On failure
    pub async fn presign_get(&self, key: &str) -> Result<String, S3Error> {
        let url = self
            .presign_bucket
            .presign_get(key, self.presign_expiry_secs as u32, None)
            .await
            .map_err(|e| S3Error::DownloadError(format!("Failed to generate presigned GET URL: {}", e)))?;

        tracing::info!("Generated presigned GET URL for key: {}", key);
        Ok(url)
    }

    /// Get the configured presign expiry in seconds
    pub fn presign_expiry_secs(&self) -> u64 {
        self.presign_expiry_secs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_object_key() {
        let (key, filename) = S3StorageService::generate_object_key("test.jpg");
        assert!(key.starts_with("images/"));
        assert!(filename.ends_with(".jpg"));
    }

    #[test]
    fn test_generate_object_key_png() {
        let (key, filename) = S3StorageService::generate_object_key("photo.PNG");
        assert!(key.starts_with("images/"));
        assert!(filename.ends_with(".png"));
    }

    #[test]
    fn test_generate_object_key_no_extension() {
        let (key, filename) = S3StorageService::generate_object_key("file_without_ext");
        assert!(key.starts_with("images/"));
        assert!(filename.ends_with(".jpg")); // defaults to jpg
    }
}
