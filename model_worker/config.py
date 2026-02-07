"""
Configuration module for Model Worker.

Loads settings from environment variables with sensible defaults.
"""

import os
from dataclasses import dataclass


@dataclass
class Config:
    """Configuration settings loaded from environment variables."""

    # RabbitMQ
    rabbitmq_host: str = os.getenv("RABBITMQ__HOST", "localhost")
    rabbitmq_port: int = int(os.getenv("RABBITMQ__PORT", "5672"))
    rabbitmq_user: str = os.getenv("RABBITMQ__USER", "rabbitmq")
    rabbitmq_password: str = os.getenv("RABBITMQ__PASSWORD", "rabbitmq")
    analysis_queue: str = os.getenv("RABBITMQ__ANALYSIS_QUEUE", "analysis_jobs")

    # MinIO/S3
    minio_endpoint: str = os.getenv("STORAGE__ENDPOINT", "http://localhost:9000")
    minio_bucket: str = os.getenv("STORAGE__BUCKET", "mybucket")
    minio_access_key: str = os.getenv("STORAGE__ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("STORAGE__SECRET_KEY", "minioadmin")

    # PostgreSQL
    database_url: str = os.getenv(
        "DATABASE__URL", "postgres://postgres:postgres@localhost:5432/cell_analysis"
    )

    # Model
    model_path: str = os.getenv("MODEL_PATH", "models/best.pt")


# Global config instance
config = Config()
