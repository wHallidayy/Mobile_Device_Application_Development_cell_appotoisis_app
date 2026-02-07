//! RabbitMQ Service
//!
//! Service for publishing analysis jobs to RabbitMQ message queue.

use lapin::{
    options::{BasicPublishOptions, QueueDeclareOptions},
    types::FieldTable,
    BasicProperties, Channel, Connection, ConnectionProperties,
};
use secrecy::ExposeSecret;
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::settings::RabbitmqConfig;

/// Message published to RabbitMQ for analysis job
#[derive(Debug, Clone, Serialize)]
pub struct AnalysisJobMessage {
    pub job_id: i64,
    pub image_id: i64,
    pub s3_key: String,
    pub model_version: String,
    pub created_at: String,
}

/// RabbitMQ service for publishing messages
#[derive(Clone)]
pub struct RabbitmqService {
    channel: Arc<RwLock<Option<Channel>>>,
    queue_name: String,
}

impl RabbitmqService {
    /// Create a new RabbitMQ service from configuration
    pub async fn new(config: &RabbitmqConfig) -> Result<Self, RabbitmqError> {
        let uri = format!(
            "amqp://{}:{}@{}:{}",
            config.user,
            config.password.expose_secret(),
            config.host,
            config.port
        );

        let conn = Connection::connect(&uri, ConnectionProperties::default())
            .await
            .map_err(|e| RabbitmqError::Connection(e.to_string()))?;

        let channel = conn
            .create_channel()
            .await
            .map_err(|e| RabbitmqError::Channel(e.to_string()))?;

        // Declare queue as durable
        channel
            .queue_declare(
                &config.analysis_queue,
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await
            .map_err(|e| RabbitmqError::QueueDeclare(e.to_string()))?;

        tracing::info!(
            "RabbitMQ connected: queue '{}' ready",
            config.analysis_queue
        );

        Ok(Self {
            channel: Arc::new(RwLock::new(Some(channel))),
            queue_name: config.analysis_queue.clone(),
        })
    }

    /// Publish an analysis job message to the queue
    pub async fn publish_analysis_job(
        &self,
        message: AnalysisJobMessage,
    ) -> Result<(), RabbitmqError> {
        let payload =
            serde_json::to_vec(&message).map_err(|e| RabbitmqError::Serialize(e.to_string()))?;

        let channel_guard = self.channel.read().await;
        let channel = channel_guard
            .as_ref()
            .ok_or_else(|| RabbitmqError::NotConnected)?;

        channel
            .basic_publish(
                "",
                &self.queue_name,
                BasicPublishOptions::default(),
                &payload,
                BasicProperties::default().with_delivery_mode(2), // persistent
            )
            .await
            .map_err(|e| RabbitmqError::Publish(e.to_string()))?
            .await
            .map_err(|e| RabbitmqError::Publish(e.to_string()))?;

        tracing::debug!(
            "Published analysis job {} to queue '{}'",
            message.job_id,
            self.queue_name
        );

        Ok(())
    }
}

/// RabbitMQ error types
#[derive(Debug, thiserror::Error)]
pub enum RabbitmqError {
    #[error("Failed to connect to RabbitMQ: {0}")]
    Connection(String),

    #[error("Failed to create channel: {0}")]
    Channel(String),

    #[error("Failed to declare queue: {0}")]
    QueueDeclare(String),

    #[error("Not connected to RabbitMQ")]
    NotConnected,

    #[error("Failed to serialize message: {0}")]
    Serialize(String),

    #[error("Failed to publish message: {0}")]
    Publish(String),
}
