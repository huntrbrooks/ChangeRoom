# Cloud Storage Setup Guide

This guide explains how to configure cloud storage (R2/S3) for the Change Room backend preprocessing service.

## Storage Options

The preprocessing service supports three storage backends:

1. **Local Storage** (default) - Files saved to local filesystem
2. **Cloudflare R2** (recommended) - S3-compatible, no egress fees
3. **AWS S3** - Standard cloud storage

## Configuration

Storage backend is controlled by the `STORAGE_TYPE` environment variable:

- `STORAGE_TYPE=local` (default) - Uses local filesystem
- `STORAGE_TYPE=r2` - Uses Cloudflare R2
- `STORAGE_TYPE=s3` - Uses AWS S3

## Option 1: Local Storage (Default - Development)

No additional configuration needed. Files are saved to the `uploads/` directory.

```bash
# .env or environment variables
STORAGE_TYPE=local
```

**Note**: Local storage is fine for development, but files will be lost on Render/Heroku deployments with ephemeral filesystems.

## Option 2: Cloudflare R2 (Recommended for Production)

### Prerequisites

1. Create a Cloudflare account
2. Create an R2 bucket
3. Get your R2 credentials

### Environment Variables

Add these to your `.env` file or Render environment variables:

```bash
STORAGE_TYPE=r2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_BASE_URL=https://your-cdn-domain.com  # Optional: if you have a custom domain
```

Or use endpoint URL instead of account ID:

```bash
STORAGE_TYPE=r2
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_BASE_URL=https://your-cdn-domain.com  # Optional
```

### Getting R2 Credentials

1. Go to Cloudflare Dashboard → R2
2. Create a bucket (or use existing)
3. Go to "Manage R2 API Tokens"
4. Create API token with read/write permissions
5. Copy `Access Key ID` and `Secret Access Key`
6. Your Account ID is shown in the R2 overview page

### Setting Up Public Access (Optional)

To serve images directly from R2:

1. Go to your bucket settings
2. Configure a custom domain or use R2.dev subdomain
3. Set `R2_PUBLIC_BASE_URL` to your public URL

If not configured, the system will generate presigned URLs (valid for 1 year).

## Option 3: AWS S3

### Environment Variables

```bash
STORAGE_TYPE=s3
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_S3_REGION=us-east-1  # Your bucket region
AWS_ACCESS_KEY_ID=your-access-key-id  # Optional if using IAM role
AWS_SECRET_ACCESS_KEY=your-secret-access-key  # Optional if using IAM role
```

### Getting AWS Credentials

1. Go to AWS Console → IAM
2. Create a new user with S3 permissions
3. Create access keys for the user
4. Or use IAM role if deploying on EC2/Lambda

## File Organization

All storage backends organize files with this structure:

```
clothing/
  YYYY-MM-DD/
    black-oversized-graphic-tee.jpg
    blue-cargo-pants.jpg
    ...
```

Files are automatically organized by date to avoid conflicts and make cleanup easier.

## Testing Your Setup

### Test Local Storage

```bash
STORAGE_TYPE=local python -m pytest  # Or manually test the endpoint
```

### Test R2 Storage

1. Set all R2 environment variables
2. Upload an image via `/api/preprocess-clothing`
3. Check your R2 bucket for the uploaded file

### Verify Storage Backend

The backend logs will show which storage backend is initialized:

```
INFO - Using storage backend: LocalStorageBackend
INFO - Using storage backend: R2StorageBackend
INFO - Using storage backend: S3StorageBackend
```

## Troubleshooting

### "boto3 is required for R2/S3 storage"

Install boto3:
```bash
pip install boto3
```

Or it should be in `requirements.txt` already.

### "R2_ACCESS_KEY_ID must be set"

Make sure all required environment variables are set for your chosen storage type.

### Files not accessible publicly

- **R2**: Set up a custom domain or R2.dev subdomain, then set `R2_PUBLIC_BASE_URL`
- **S3**: Ensure your bucket has public read access configured
- **Local**: Files are served via FastAPI static files at `/uploads/`

### Permission Errors

Check that your credentials have the correct permissions:
- **R2**: Read and Write permissions
- **S3**: `s3:PutObject`, `s3:GetObject`, `s3:HeadObject` permissions

## Migration from Local to Cloud Storage

1. Set up cloud storage (R2 or S3) as described above
2. Set `STORAGE_TYPE` to `r2` or `s3`
3. New uploads will go to cloud storage
4. Existing local files remain in `uploads/` directory
5. (Optional) Migrate existing files using a script

## Render Deployment

On Render, add environment variables:

1. Go to your Render service → Environment
2. Add all required variables for your storage type
3. Redeploy the service

Example for R2:
```
STORAGE_TYPE=r2
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=change-room-clothing
R2_PUBLIC_BASE_URL=https://cdn.yourdomain.com
```

## Architecture

The storage system uses a unified interface:

```
preprocess_clothing.py
    ↓
storage.get_storage_backend()
    ↓
LocalStorageBackend | R2StorageBackend | S3StorageBackend
    ↓
Files saved with structure: clothing/YYYY-MM-DD/filename.jpg
```

This allows switching storage backends without changing the preprocessing code.





