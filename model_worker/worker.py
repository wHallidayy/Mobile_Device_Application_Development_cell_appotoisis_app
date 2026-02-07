"""
Model Worker - Main Entry Point

Consumes analysis jobs from RabbitMQ and processes them using YOLO model.
"""

import json
import logging
import time

import pika

from config import config
from db_client import fail_job, save_result, start_processing
from inference import run_inference
from minio_client import download_image

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def process_message(ch, method, properties, body):
    """Process a single analysis job message.

    Args:
        ch: Channel
        method: Method frame
        properties: Message properties
        body: Message body bytes
    """
    job_id = None
    try:
        # Parse message
        message = json.loads(body)
        job_id = message["job_id"]
        s3_key = message["s3_key"]

        logger.info(f"Processing job {job_id}, image: {s3_key}")

        # Mark job as processing
        start_processing(job_id)

        # Download image from MinIO
        logger.info(f"Downloading image from {s3_key}")
        image_bytes = download_image(s3_key)
        logger.info(f"Downloaded {len(image_bytes)} bytes")

        # Run YOLO inference
        logger.info("Running model inference...")
        result = run_inference(image_bytes)

        # Save results to database
        logger.info("Saving results to database...")
        save_result(
            job_id=job_id,
            count_viable=result["counts"]["viable"],
            count_apoptosis=result["counts"]["apoptosis"],
            count_other=result["counts"]["other"],
            avg_confidence=result["avg_confidence"],
            raw_data={"bounding_boxes": result["bounding_boxes"]},
            summary=result["summary"],
        )

        logger.info(
            f"Job {job_id} completed: {result['counts']}, "
            f"total={sum(result['counts'].values())} cells"
        )

        # Acknowledge message
        ch.basic_ack(delivery_tag=method.delivery_tag)

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        if job_id is not None:
            try:
                fail_job(job_id, str(e)[:500])  # Limit error message length
            except Exception as db_err:
                logger.error(f"Failed to update job status: {db_err}")
        # Reject message without requeue (send to dead letter if configured)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def connect_with_retry(max_retries: int = 30, retry_delay: float = 2.0):
    """Connect to RabbitMQ with retry logic.

    Args:
        max_retries: Maximum number of connection attempts
        retry_delay: Seconds to wait between retries

    Returns:
        pika.BlockingConnection
    """
    for attempt in range(max_retries):
        try:
            credentials = pika.PlainCredentials(
                config.rabbitmq_user, config.rabbitmq_password
            )
            parameters = pika.ConnectionParameters(
                host=config.rabbitmq_host,
                port=config.rabbitmq_port,
                credentials=credentials,
                heartbeat=600,
                blocked_connection_timeout=300,
            )
            connection = pika.BlockingConnection(parameters)
            logger.info(f"Connected to RabbitMQ at {config.rabbitmq_host}:{config.rabbitmq_port}")
            return connection
        except pika.exceptions.AMQPConnectionError as e:
            logger.warning(
                f"Connection attempt {attempt + 1}/{max_retries} failed: {e}"
            )
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
            else:
                raise


def main():
    """Main entry point."""
    logger.info("Starting Model Worker...")
    logger.info(f"RabbitMQ: {config.rabbitmq_host}:{config.rabbitmq_port}")
    logger.info(f"Queue: {config.analysis_queue}")
    logger.info(f"MinIO: {config.minio_endpoint}")
    logger.info(f"Model: {config.model_path}")

    # Connect to RabbitMQ with retry
    connection = connect_with_retry()
    channel = connection.channel()

    # Declare queue (idempotent - creates if not exists)
    channel.queue_declare(queue=config.analysis_queue, durable=True)

    # Fair dispatch - only process 1 message at a time
    channel.basic_qos(prefetch_count=1)

    # Start consuming
    channel.basic_consume(
        queue=config.analysis_queue, on_message_callback=process_message
    )

    logger.info(f"Worker ready. Waiting for messages on '{config.analysis_queue}'...")

    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        logger.info("Worker shutting down...")
        channel.stop_consuming()
    finally:
        connection.close()
        logger.info("Connection closed")


if __name__ == "__main__":
    main()
