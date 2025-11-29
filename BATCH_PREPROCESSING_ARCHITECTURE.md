# Batch Preprocessing Architecture

## Overview

This document describes the clean separation of concerns for clothing image preprocessing:

- **OpenAI**: Analyzes images and provides structured metadata + recommended filenames
- **Backend**: Saves files, handles storage, wires everything for Gemini

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend: BulkUploadZone                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. User uploads 1-5 clothing images                      │  │
│  │ 2. POST to /api/preprocess-clothing (multipart/form-data)│  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Backend: /api/preprocess-clothing                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Receives all images (max 5)                           │  │
│  │ 2. Reads all into memory                                 │  │
│  │ 3. Calls preprocess_clothing_batch()                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│    Service: preprocess_clothing.preprocess_clothing_batch()    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Converts all images to base64                         │  │
│  │ 2. Builds single OpenAI request with all images          │  │
│  │ 3. Calls OpenAI Chat Completions API (batch)             │  │
│  │    ├─ Model: gpt-4o-mini                                 │  │
│  │    ├─ Structured JSON output                             │  │
│  │    └─ Temperature: 0.0 (deterministic)                   │  │
│  │ 4. Receives structured metadata for all images           │  │
│  │ 5. For each result:                                      │  │
│  │    ├─ Cleans recommended_filename                        │  │
│  │    ├─ Saves file to disk                                 │  │
│  │    ├─ Saves metadata JSON                                │  │
│  │    └─ Generates public URL                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Response to Frontend                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ {                                                         │  │
│  │   "items": [                                              │  │
│  │     {                                                     │  │
│  │       "index": 0,                                         │  │
│  │       "category": "hoodie",                               │  │
│  │       "subcategory": "oversized",                         │  │
│  │       "color": "black",                                   │  │
│  │       "style": "streetwear",                              │  │
│  │       "material": "cotton",                               │  │
│  │       "description": "Black oversized hoodie...",         │  │
│  │       "tags": ["hoodie", "oversized", "black", ...],     │  │
│  │       "filename": "black-oversized-hoodie.jpg",          │  │
│  │       "url": "/uploads/black-oversized-hoodie.jpg",      │  │
│  │       "metadata": {...}                                   │  │
│  │     },                                                    │  │
│  │     ...                                                   │  │
│  │   ],                                                      │  │
│  │   "total": 3                                              │  │
│  │ }                                                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Benefits

### 1. Single Batch Call
- All images analyzed in **one OpenAI API call**
- More efficient than processing individually
- Lower latency
- Cost-effective (single request overhead)

### 2. Structured Output
- OpenAI returns **structured JSON** matching exact schema
- Consistent metadata format
- Easy to validate and process

### 3. Clean Separation
- **OpenAI**: Pure analysis and naming
- **Backend**: File operations and storage
- **Gemini**: Uses preprocessed files later

### 4. Better Filenames
- OpenAI suggests descriptive, clean filenames
- Backend validates and cleans them
- No more generic `upper_body_143.jpg` files

## API Endpoint

### POST `/api/preprocess-clothing`

**Request**:
- Content-Type: `multipart/form-data`
- Fields: Multiple `clothing_images` files (max 5)

**Response**:
```json
{
  "items": [
    {
      "index": 0,
      "category": "tshirt",
      "subcategory": "graphic tee",
      "color": "black",
      "style": "streetwear",
      "material": "cotton",
      "description": "Black oversized graphic tee with white chest print",
      "tags": ["tshirt", "oversized", "black", "streetwear", "graphic"],
      "recommended_filename": "black-oversized-graphic-tee-streetwear.jpg",
      "filename": "black-oversized-graphic-tee-streetwear.jpg",
      "url": "/uploads/black-oversized-graphic-tee-streetwear.jpg",
      "file_path": "uploads/black-oversized-graphic-tee-streetwear.jpg",
      "metadata": {
        "category": "tshirt",
        "subcategory": "graphic tee",
        "color": "black",
        "style": "streetwear",
        "material": "cotton",
        "description": "Black oversized graphic tee...",
        "tags": ["tshirt", "oversized", "black", "streetwear"],
        "original_filename": "IMG_1234.jpg"
      }
    }
  ],
  "total": 1
}
```

## File Storage

### Current Implementation: Local Filesystem

**Location**: `backend/uploads/`

**Structure**:
```
uploads/
  black-oversized-graphic-tee-streetwear.jpg
  black-oversized-graphic-tee-streetwear.json  # Metadata
  blue-cargo-pants-urban.jpg
  blue-cargo-pants-urban.json
```

**⚠️ Important**: Render has an **ephemeral filesystem** - files are lost on:
- Deploy
- Restart
- Scaling events

### Storage Options

#### Option 1: Cloudflare R2 (Recommended for Production)

**Benefits**:
- S3-compatible API
- No egress fees
- CDN integration
- Persistent storage

**Implementation**:
1. Install `boto3` or `cloudflare` SDK
2. Update `preprocess_clothing.py` to upload to R2
3. Store R2 URLs instead of local paths

**Example**:
```python
import boto3
from botocore.client import Config

s3_client = boto3.client(
    's3',
    endpoint_url='https://<account-id>.r2.cloudflarestorage.com',
    aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
    config=Config(signature_version='s3v4')
)

# Upload file
s3_client.upload_fileobj(
    io.BytesIO(image_bytes),
    'clothing-bucket',
    filename
)
```

#### Option 2: AWS S3

Similar to R2, but with egress fees.

#### Option 3: Keep Local (Development Only)

Fine for local development, but **not for production** on Render.

## Integration with Gemini Try-On

Once files are preprocessed:

1. **Frontend** stores the returned items array
2. **User selects** which items to try on
3. **Try-on endpoint** receives:
   - User image
   - Selected clothing URLs (from preprocessed items)
   - Metadata (category, style, etc.)
4. **Gemini** generates try-on image

**Example Flow**:
```typescript
// 1. Preprocess clothing
const preprocessRes = await fetch('/api/preprocess-clothing', {
  method: 'POST',
  body: formData
});
const { items } = await preprocessRes.json();

// 2. User selects items
const selectedItems = items.filter(/* user selection */);

// 3. Try on
const tryOnFormData = new FormData();
tryOnFormData.append('user_image', userImage);
selectedItems.forEach(item => {
  tryOnFormData.append('clothing_urls', item.url);
  tryOnFormData.append('metadata', JSON.stringify(item.metadata));
});
const tryOnRes = await fetch('/api/try-on', {
  method: 'POST',
  body: tryOnFormData
});
```

## Comparison: Old vs New

### Old Architecture (`/api/analyze-clothing`)

- **Processing**: One-by-one in loop
- **API Calls**: N calls (one per image)
- **Progress**: Streaming SSE updates
- **Filename**: Generic `{category}_{hash}.jpg`
- **Metadata**: Embedded in EXIF

### New Architecture (`/api/preprocess-clothing`)

- **Processing**: Single batch call
- **API Calls**: 1 call for all images
- **Progress**: Single response (faster)
- **Filename**: Descriptive from OpenAI
- **Metadata**: JSON file + response

## Migration Path

### Phase 1: Add New Endpoint (Current)
- New `/api/preprocess-clothing` endpoint
- Old `/api/analyze-clothing` still works
- Both can coexist

### Phase 2: Update Frontend
- Switch `BulkUploadZone` to use new endpoint
- Update to handle new response format

### Phase 3: Storage Migration
- Add S3/R2 support
- Move existing files to cloud storage
- Update file URLs

### Phase 4: Deprecate Old Endpoint
- Remove `/api/analyze-clothing`
- Consolidate on new architecture

## Error Handling

The endpoint handles:
- Missing OpenAI API key
- Invalid image formats
- OpenAI API failures
- File save errors
- Filename conflicts (auto-increments)

All errors return proper HTTP status codes and error messages.

## Files Created/Modified

1. **New Service**: `backend/services/preprocess_clothing.py`
   - Batch preprocessing logic
   - OpenAI integration
   - File saving

2. **New Endpoint**: `backend/main.py`
   - `/api/preprocess-clothing` route
   - Request handling
   - Response formatting

3. **Updated**: `backend/requirements.txt`
   - Added `openai>=1.0.0` package

## Next Steps

1. **Test locally** with multiple images
2. **Verify OpenAI responses** match schema
3. **Update frontend** to use new endpoint (optional)
4. **Add cloud storage** for production (R2 recommended)
5. **Monitor costs** - batch processing is more efficient

## OpenAI Configuration

- **Model**: `gpt-4o-mini` (cost-effective, fast)
- **Temperature**: `0.0` (deterministic)
- **Max Tokens**: `4000` (enough for 5 items)
- **Response Format**: Structured JSON schema

## Cost Considerations

**Batch Processing** (New):
- 1 API call for 5 images
- ~$0.01-0.03 per batch (gpt-4o-mini)

**Individual Processing** (Old):
- 5 API calls for 5 images
- ~$0.05-0.15 total
- Higher overhead

**Savings**: ~70-80% cost reduction with batch processing

