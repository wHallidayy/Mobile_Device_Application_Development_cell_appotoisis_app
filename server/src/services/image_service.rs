//! Image Service
//!
//! Business logic for image file handling, validation, and storage.

use std::io::Read;
use std::path::PathBuf;
use thiserror::Error;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

// ============================================================================
// Constants
// ============================================================================

/// Allowed MIME types for image uploads
pub const ALLOWED_MIME_TYPES: &[&str] = &["image/jpeg", "image/png", "image/tiff"];

/// Maximum file size in bytes (50 MB)
pub const MAX_FILE_SIZE: usize = 50 * 1024 * 1024;

/// Base storage path for uploaded images
pub const STORAGE_PATH: &str = "./uploads";

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, Error)]
pub enum ImageServiceError {
    #[error("Invalid file type. Allowed: JPEG, PNG, TIFF")]
    InvalidFileType,

    #[error("Invalid magic bytes. File content does not match declared type")]
    InvalidMagicBytes,

    #[error("File too large. Maximum size: 50MB")]
    FileTooLarge,

    /// Reserved for future S3 storage integration
    #[allow(dead_code)]
    #[error("Failed to save file: {0}")]
    SaveError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

// ============================================================================
// Image Service
// ============================================================================

pub struct ImageService;

impl ImageService {
    /// Validate file type by checking MIME type and magic bytes
    pub fn validate_file(
        content_type: &str,
        bytes: &[u8],
    ) -> Result<(), ImageServiceError> {
        // 1. Check MIME type from Content-Type header
        if !ALLOWED_MIME_TYPES.contains(&content_type) {
            return Err(ImageServiceError::InvalidFileType);
        }

        // 2. Check file size
        if bytes.len() > MAX_FILE_SIZE {
            return Err(ImageServiceError::FileTooLarge);
        }

        // 3. Verify magic bytes (first few bytes of file)
        if bytes.len() < 4 {
            return Err(ImageServiceError::InvalidMagicBytes);
        }

        let magic = &bytes[0..4];
        let valid = matches!(
            magic,
            [0xFF, 0xD8, 0xFF, _]         // JPEG
            | [0x89, 0x50, 0x4E, 0x47]     // PNG
            | [0x49, 0x49, 0x2A, 0x00]     // TIFF (little-endian)
            | [0x4D, 0x4D, 0x00, 0x2A]     // TIFF (big-endian)
        );

        if !valid {
            return Err(ImageServiceError::InvalidMagicBytes);
        }

        Ok(())
    }

    /// Generate a unique storage path for an image
    pub fn generate_storage_path(original_filename: &str) -> (String, String) {
        let uuid = Uuid::new_v4();
        let extension = std::path::Path::new(original_filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("jpg")
            .to_lowercase();

        let filename = format!("{}.{}", uuid, extension);
        let file_path = format!("{}/{}", STORAGE_PATH, filename);

        (file_path, filename)
    }

    /// Save image bytes to disk
    pub async fn save_file(
        bytes: &[u8],
        file_path: &str,
    ) -> Result<(), ImageServiceError> {
        // Ensure storage directory exists
        let path = PathBuf::from(file_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Write file
        let mut file = fs::File::create(&path).await?;
        file.write_all(bytes).await?;
        file.flush().await?;

        Ok(())
    }

    /// Get extension from MIME type
    /// Reserved for future S3 storage integration
    #[allow(dead_code)]
    pub fn get_extension_from_mime(mime_type: &str) -> &'static str {
        match mime_type {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/tiff" => "tiff",
            _ => "bin",
        }
    }

    /// Extract basic metadata from image bytes (width, height)
    /// Note: This is a simplified version that reads headers only
    pub fn extract_metadata(bytes: &[u8]) -> Option<(u32, u32)> {
        if bytes.len() < 24 {
            return None;
        }

        // Try to detect format and extract dimensions
        let magic = &bytes[0..4];

        if magic[0..3] == [0xFF, 0xD8, 0xFF] {
            // JPEG - need to parse SOF0/SOF2 markers
            Self::extract_jpeg_dimensions(bytes)
        } else if magic == [0x89, 0x50, 0x4E, 0x47] {
            // PNG - dimensions in IHDR chunk
            Self::extract_png_dimensions(bytes)
        } else {
            None
        }
    }

    /// Extract dimensions from JPEG SOF marker
    fn extract_jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
        let mut cursor = std::io::Cursor::new(bytes);
        let mut buf = [0u8; 2];

        // Skip SOI marker
        cursor.set_position(2);

        loop {
            // Read marker
            if cursor.read_exact(&mut buf).is_err() {
                return None;
            }

            if buf[0] != 0xFF {
                return None;
            }

            let marker = buf[1];

            // SOF0 or SOF2 marker
            if marker == 0xC0 || marker == 0xC2 {
                // Skip length (2 bytes)
                cursor.set_position(cursor.position() + 2);
                // Skip precision (1 byte)
                cursor.set_position(cursor.position() + 1);

                // Read height (2 bytes, big-endian)
                if cursor.read_exact(&mut buf).is_err() {
                    return None;
                }
                let height = u16::from_be_bytes(buf) as u32;

                // Read width (2 bytes, big-endian)
                if cursor.read_exact(&mut buf).is_err() {
                    return None;
                }
                let width = u16::from_be_bytes(buf) as u32;

                return Some((width, height));
            }

            // Skip other markers
            if cursor.read_exact(&mut buf).is_err() {
                return None;
            }
            let length = u16::from_be_bytes(buf) as u64;
            cursor.set_position(cursor.position() + length - 2);

            if cursor.position() >= bytes.len() as u64 {
                return None;
            }
        }
    }

    /// Extract dimensions from PNG IHDR chunk
    fn extract_png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
        // PNG header is 8 bytes, then IHDR chunk
        // IHDR: 4 bytes length, 4 bytes type, then 4 bytes width, 4 bytes height
        if bytes.len() < 24 {
            return None;
        }

        // Check IHDR chunk type at position 12
        if &bytes[12..16] != b"IHDR" {
            return None;
        }

        let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);

        Some((width, height))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_jpeg_magic() {
        let jpeg_bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        assert!(ImageService::validate_file("image/jpeg", &jpeg_bytes).is_ok());
    }

    #[test]
    fn test_validate_png_magic() {
        let png_bytes = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A];
        assert!(ImageService::validate_file("image/png", &png_bytes).is_ok());
    }

    #[test]
    fn test_invalid_mime_type() {
        let bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
        assert!(matches!(
            ImageService::validate_file("application/pdf", &bytes),
            Err(ImageServiceError::InvalidFileType)
        ));
    }

    #[test]
    fn test_invalid_magic_bytes() {
        let bytes = vec![0x00, 0x00, 0x00, 0x00];
        assert!(matches!(
            ImageService::validate_file("image/jpeg", &bytes),
            Err(ImageServiceError::InvalidMagicBytes)
        ));
    }

    #[test]
    fn test_generate_storage_path() {
        let (path, filename) = ImageService::generate_storage_path("test.jpg");
        assert!(path.starts_with(STORAGE_PATH));
        assert!(filename.ends_with(".jpg"));
    }
}
