"""boto3 기반 S3/MinIO 파일 다운로드·업로드 (endpoint-aware)."""

import boto3
from botocore.config import Config
from loguru import logger

import config

_client = None


def get_client():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=config.S3_ENDPOINT,
            region_name=config.AWS_REGION,
            aws_access_key_id=config.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=config.AWS_SECRET_ACCESS_KEY,
            # MinIO는 path-style 필요
            config=Config(s3={"addressing_style": "path"} if config.S3_ENDPOINT else {}),
        )
    return _client


def download(s3_key: str, dest_path: str) -> None:
    logger.debug("S3 다운로드 {} -> {}", s3_key, dest_path)
    get_client().download_file(config.S3_BUCKET_NAME, s3_key, dest_path)


def upload(local_path: str, s3_key: str, content_type: str) -> str:
    logger.debug("S3 업로드 {} -> {}", local_path, s3_key)
    get_client().upload_file(
        local_path,
        config.S3_BUCKET_NAME,
        s3_key,
        ExtraArgs={"ContentType": content_type},
    )
    return config.public_url(s3_key)


def edited_key(user_id: str, job_id: str) -> str:
    return f"uploads/{user_id}/edited/{job_id}.mp4"


def thumbnail_key(user_id: str, job_id: str) -> str:
    return f"uploads/{user_id}/thumbnails/{job_id}.jpg"
