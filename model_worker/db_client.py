"""
Database client for PostgreSQL operations.

Updates job status and saves analysis results.
"""

import json
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import Json

from config import config


def parse_database_url(url: str) -> dict:
    """Parse DATABASE_URL into connection parameters."""
    parsed = urlparse(url)
    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 5432,
        "database": parsed.path.lstrip("/") or "cell_analysis",
        "user": parsed.username or "postgres",
        "password": parsed.password or "postgres",
    }


def get_connection():
    """Get a new database connection."""
    params = parse_database_url(config.database_url)
    return psycopg2.connect(**params)


def start_processing(job_id: int) -> None:
    """Mark job as processing with current timestamp.

    Args:
        job_id: The job ID to update
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status='processing', started_at=NOW() WHERE job_id=%s",
                (job_id,),
            )
        conn.commit()


def save_result(
    job_id: int,
    count_viable: int,
    count_apoptosis: int,
    count_other: int,
    avg_confidence: float,
    raw_data: dict,
    summary: str,
) -> None:
    """Save analysis result and mark job as completed.

    Args:
        job_id: The job ID
        count_viable: Number of viable cells detected
        count_apoptosis: Number of apoptotic cells detected
        count_other: Number of other cells detected
        avg_confidence: Average confidence score
        raw_data: Raw detection data (bounding boxes)
        summary: Human-readable summary
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Insert analysis result
            cur.execute(
                """
                INSERT INTO analysis_results 
                  (job_id, count_viable, count_apoptosis, count_other,
                   avg_confidence_score, raw_data, summary_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    job_id,
                    count_viable,
                    count_apoptosis,
                    count_other,
                    avg_confidence,
                    Json(raw_data),
                    summary,
                ),
            )
            # Mark job as completed
            cur.execute(
                "UPDATE jobs SET status='completed', finished_at=NOW() WHERE job_id=%s",
                (job_id,),
            )
        conn.commit()


def fail_job(job_id: int, error_message: str) -> None:
    """Mark job as failed with error message.

    Args:
        job_id: The job ID
        error_message: Description of the failure
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status='failed', finished_at=NOW(), error_message=%s WHERE job_id=%s",
                (error_message, job_id),
            )
        conn.commit()
