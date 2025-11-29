"""
Storage abstraction layer supporting both local filesystem and cloud storage (R2/S3).

This module provides a unified interface for file storage that works with:
- Local filesystem (for development)
- Cloudflare R2 (S3-compatible, recommended)
- AWS S3 (alternative)
"""

import os
import logging
from typing import Optional
from pathlib import Path
import io

logger = logging.getLogger(__name__)

# Storage backend type
STORAGE_TYPE = os.getenv("STORAGE_TYPE", "local").lower()  # 'local', 'r2', or 's3'

# R2/S3 configuration
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_BASE_URL = os.getenv("R2_PUBLIC_BASE_URL", "")

# AWS S3 configuration (fallback)
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")
AWS_S3_REGION = os.getenv("AWS_S3_REGION", "us-east-1")

# Try to import boto3 for cloud storage
try:
    import boto3
    from botocore.client import Config
    from botocore.exceptions import ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    logger.warning("boto3 not installed. Cloud storage will not be available. Install with: pip install boto3")


class StorageBackend:
    """Abstract base class for storage backends."""
    
    async def save_file(self, file_bytes: bytes, file_path: str, content_type: str = "image/jpeg") -> str:
        """
        Save a file and return the public URL.
        
        Args:
            file_bytes: File contents as bytes
            file_path: Desired file path/key (relative path for local, full key for cloud)
            content_type: MIME type of the file
            
        Returns:
            Public URL to access the file
        """
        raise NotImplementedError
    
    async def file_exists(self, file_path: str) -> bool:
        """Check if a file exists."""
        raise NotImplementedError
    
    async def get_file_url(self, file_path: str) -> str:
        """Get the public URL for a file."""
        raise NotImplementedError


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend."""
    
    def __init__(self, base_dir: str = "uploads"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Initialized local storage at: {self.base_dir}")
    
    async def save_file(self, file_bytes: bytes, file_path: str, content_type: str = "image/jpeg") -> str:
        """Save file to local filesystem."""
        # Ensure file_path is relative and clean
        file_path = file_path.lstrip("/")
        full_path = self.base_dir / file_path
        
        # Create parent directories if needed
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write file
        with open(full_path, 'wb') as f:
            f.write(file_bytes)
        
        logger.info(f"Saved file locally: {full_path}")
        
        # Return public URL (relative path for serving via FastAPI static files)
        return f"/uploads/{file_path}"
    
    async def file_exists(self, file_path: str) -> bool:
        """Check if file exists locally."""
        file_path = file_path.lstrip("/")
        full_path = self.base_dir / file_path
        return full_path.exists()
    
    async def get_file_url(self, file_path: str) -> str:
        """Get public URL for local file."""
        file_path = file_path.lstrip("/")
        return f"/uploads/{file_path}"


class R2StorageBackend(StorageBackend):
    """Cloudflare R2 storage backend (S3-compatible)."""
    
    def __init__(self):
        if not BOTO3_AVAILABLE:
            raise RuntimeError("boto3 is required for R2 storage. Install with: pip install boto3")
        
        if not R2_ACCESS_KEY_ID or not R2_SECRET_ACCESS_KEY:
            raise ValueError("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set for R2 storage")
        
        if not R2_BUCKET_NAME:
            raise ValueError("R2_BUCKET_NAME must be set for R2 storage")
        
        # Determine endpoint URL
        endpoint_url = R2_ENDPOINT_URL
        if not endpoint_url and R2_ACCOUNT_ID:
            endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
        
        if not endpoint_url:
            raise ValueError("Either R2_ENDPOINT_URL or R2_ACCOUNT_ID must be set for R2 storage")
        
        self.bucket_name = R2_BUCKET_NAME
        self.public_base_url = R2_PUBLIC_BASE_URL.rstrip("/")
        
        # Create S3 client configured for R2
        self.s3_client = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(signature_version='s3v4')
        )
        
        logger.info(f"Initialized R2 storage: bucket={self.bucket_name}, endpoint={endpoint_url}")
    
    async def save_file(self, file_bytes: bytes, file_path: str, content_type: str = "image/jpeg") -> str:
        """Upload file to R2 and return public URL."""
        # Ensure key doesn't start with /
        key = file_path.lstrip("/")
        
        # Upload to R2 (sync operation, but we're in async context)
        try:
            import asyncio
            # Run sync boto3 operation in thread pool
            await asyncio.to_thread(
                self.s3_client.upload_fileobj,
                io.BytesIO(file_bytes),
                self.bucket_name,
                key,
                ExtraArgs={'ContentType': content_type}
            )
            logger.info(f"Uploaded file to R2: {key}")
        except ClientError as e:
            logger.error(f"Failed to upload to R2: {e}")
            raise RuntimeError(f"Failed to upload file to R2: {str(e)}")
        
        # Return public URL
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        else:
            # Fallback: generate presigned URL (public URLs require R2 public access or custom domain)
            return self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=31536000  # 1 year
            )
    
    async def file_exists(self, file_path: str) -> bool:
        """Check if file exists in R2."""
        key = file_path.lstrip("/")
        try:
            import asyncio
            await asyncio.to_thread(
                self.s3_client.head_object,
                Bucket=self.bucket_name,
                Key=key
            )
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            raise
    
    async def get_file_url(self, file_path: str) -> str:
        """Get public URL for R2 file."""
        key = file_path.lstrip("/")
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        else:
            # Generate presigned URL (sync operation)
            import asyncio
            return await asyncio.to_thread(
                self.s3_client.generate_presigned_url,
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=31536000
            )


class S3StorageBackend(StorageBackend):
    """AWS S3 storage backend."""
    
    def __init__(self):
        if not BOTO3_AVAILABLE:
            raise RuntimeError("boto3 is required for S3 storage. Install with: pip install boto3")
        
        if not AWS_S3_BUCKET_NAME:
            raise ValueError("AWS_S3_BUCKET_NAME must be set for S3 storage")
        
        # Check for AWS credentials (from env or IAM role)
        aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
        aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        
        self.bucket_name = AWS_S3_BUCKET_NAME
        self.region = AWS_S3_REGION
        
        # Create S3 client
        if aws_access_key_id and aws_secret_access_key:
            self.s3_client = boto3.client(
                's3',
                region_name=self.region,
                aws_access_key_id=aws_access_key_id,
                aws_secret_access_key=aws_secret_access_key
            )
        else:
            # Use default credentials (IAM role, etc.)
            self.s3_client = boto3.client('s3', region_name=self.region)
        
        logger.info(f"Initialized S3 storage: bucket={self.bucket_name}, region={self.region}")
    
    async def save_file(self, file_bytes: bytes, file_path: str, content_type: str = "image/jpeg") -> str:
        """Upload file to S3 and return public URL."""
        key = file_path.lstrip("/")
        
        try:
            import asyncio
            # Run sync boto3 operation in thread pool
            await asyncio.to_thread(
                self.s3_client.upload_fileobj,
                io.BytesIO(file_bytes),
                self.bucket_name,
                key,
                ExtraArgs={'ContentType': content_type}
            )
            logger.info(f"Uploaded file to S3: {key}")
        except ClientError as e:
            logger.error(f"Failed to upload to S3: {e}")
            raise RuntimeError(f"Failed to upload file to S3: {str(e)}")
        
        # Return public URL
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"
    
    async def file_exists(self, file_path: str) -> bool:
        """Check if file exists in S3."""
        key = file_path.lstrip("/")
        try:
            import asyncio
            await asyncio.to_thread(
                self.s3_client.head_object,
                Bucket=self.bucket_name,
                Key=key
            )
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            raise
    
    async def get_file_url(self, file_path: str) -> str:
        """Get public URL for S3 file."""
        key = file_path.lstrip("/")
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"


def get_storage_backend(base_dir: str = "uploads") -> StorageBackend:
    """
    Get the appropriate storage backend based on configuration.
    
    Args:
        base_dir: Base directory for local storage (ignored for cloud storage)
        
    Returns:
        StorageBackend instance
    """
    storage_type = STORAGE_TYPE
    
    if storage_type == "r2":
        return R2StorageBackend()
    elif storage_type == "s3":
        return S3StorageBackend()
    else:
        # Default to local storage
        return LocalStorageBackend(base_dir=base_dir)

