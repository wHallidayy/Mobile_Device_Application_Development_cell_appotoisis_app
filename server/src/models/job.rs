//! Job and Analysis Result Models
//!
//! Models for AI analysis jobs and results matching the database schema.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Job status enum matching database enum
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "job_status", rename_all = "lowercase")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

impl std::fmt::Display for JobStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobStatus::Pending => write!(f, "pending"),
            JobStatus::Processing => write!(f, "processing"),
            JobStatus::Completed => write!(f, "completed"),
            JobStatus::Failed => write!(f, "failed"),
        }
    }
}

/// Job model matching the `jobs` table
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct Job {
    pub job_id: i64,
    pub image_id: i64,
    pub status: JobStatus,
    pub ai_model_version: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub created_at: Option<DateTime<Utc>>,
}

/// Analysis Result model matching the `analysis_results` table
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub result_id: i64,
    pub job_id: i64,
    pub count_viable: i32,
    pub count_apoptosis: i32,
    pub count_other: i32,
    pub avg_confidence_score: Option<f64>,
    pub raw_data: Option<serde_json::Value>,
    pub summary_data: Option<String>,
    pub analyzed_at: Option<DateTime<Utc>>,
}
