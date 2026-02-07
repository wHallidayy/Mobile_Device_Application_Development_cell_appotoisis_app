"""
MinIO/S3 client for downloading images.
"""

import io
from urllib.parse import urlparse

from minio import Minio

from config import config


def get_minio_client() -> Minio:
    """Create and return a MinIO client instance."""
    parsed = urlparse(config.minio_endpoint)
    # Remove port from netloc for host
    host_with_port = parsed.netloc
    secure = parsed.scheme == "https"

    return Minio(
        host_with_port,
        access_key=config.minio_access_key,
        secret_key=config.minio_secret_key,
        secure=secure,
    )


def download_image(s3_key: str) -> bytes:
    """Download image from MinIO/S3 bucket.

    Args:
        s3_key: The object key in the bucket

    Returns:
        Image content as bytes
    """
    client = get_minio_client()
    response = client.get_object(config.minio_bucket, s3_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()
