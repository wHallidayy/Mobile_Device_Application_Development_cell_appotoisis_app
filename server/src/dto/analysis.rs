//! Analysis DTOs
//!
//! Request and Response DTOs for AI Analysis endpoints.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

// ============================================================================
// Request DTOs
// ============================================================================

/// Request to analyze an image
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct AnalyzeImageRequest {
    /// AI model version to use (optional, defaults to latest)
    #[serde(default = "default_model_version")]
    pub model_version: String,
}

fn default_model_version() -> String {
    "v1.0.0".to_string()
}

impl Default for AnalyzeImageRequest {
    fn default() -> Self {
        Self {
            model_version: default_model_version(),
        }
    }
}

// ============================================================================
// Response DTOs
// ============================================================================

/// Response when submitting image for analysis
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AnalyzeImageResponse {
    pub job_id: i64,
    pub image_id: i64,
    pub status: String,
    pub ai_model_version: String,
    pub status_url: String,
    pub created_at: String,
}

/// Job status response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct JobStatusResponse {
    pub job_id: i64,
    pub image_id: i64,
    pub status: String,
    pub ai_model_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_url: Option<String>,
}

/// Cell counts in analysis result
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CellCounts {
    pub viable: i32,
    pub apoptosis: i32,
    pub other: i32,
}

/// Cell percentages in analysis result
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CellPercentages {
    pub viable: f64,
    pub apoptosis: f64,
    pub other: f64,
}

/// Bounding box for detected cell
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct BoundingBox {
    pub class: String,
    pub confidence: f64,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Raw detection data
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct RawDetectionData {
    pub bounding_boxes: Vec<BoundingBox>,
}

/// Analysis result response
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AnalysisResultResponse {
    pub result_id: i64,
    pub job_id: i64,
    pub image_id: i64,
    pub counts: CellCounts,
    pub total_cells: i32,
    pub avg_confidence_score: f64,
    pub percentages: CellPercentages,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_data: Option<RawDetectionData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_data: Option<String>,
    pub analyzed_at: String,
}

/// Analysis history response for an image
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImageAnalysisHistoryResponse {
    pub image_id: i64,
    pub analyses: Vec<AnalysisHistorySummary>,
    pub total: i64,
}

/// Summary of a single analysis in history
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct AnalysisHistorySummary {
    pub job_id: i64,
    pub status: String,
    pub ai_model_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub counts: Option<CellCounts>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_confidence_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
}
