# API Routes Setup Guide

This document describes the new Next.js API routes architecture for Change Room.

## Database Schema

Run the SQL schema in `database/schema.sql` on your Neon database to create the required tables:
- `clothing_items` - Stores uploaded clothing images with metadata
- `person_images` - Stores user base photos for try-on
- `tryon_sessions` - Tracks generated try-on results (optional)

## Environment Variables

Add these to your `.env.local` file:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Cloudflare R2
R2_BUCKET_NAME=your-bucket-name
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
# OR use R2_ACCOUNT_ID instead of R2_ENDPOINT_URL
R2_PUBLIC_BASE_URL=https://your-cdn-domain.com

# Neon Database
POSTGRES_URL=postgresql://user:password@host/database
POSTGRES_PRISMA_URL=postgresql://user:password@host/database
POSTGRES_URL_NON_POOLING=postgresql://user:password@host/database

# OpenAI
OPENAI_API_KEY=sk-...

# Gemini
GEMINI_API_KEY=your-gemini-api-key
```

## API Routes

### 1. `/api/upload-urls` (POST)
Get signed R2 URLs for direct client-side uploads.

**Request:**
```json
{
  "kind": "clothing" | "person",
  "files": [
    { "mimeType": "image/jpeg", "extension": "jpg" }
  ]
}
```

**Response:**
```json
{
  "uploads": [
    {
      "key": "clothing/user_xxx/uuid.jpg",
      "uploadUrl": "https://...",
      "publicUrl": "https://cdn.../clothing/...",
      "mimeType": "image/jpeg"
    }
  ]
}
```

### 2. `/api/preprocess-clothing` (POST)
Analyze clothing images with OpenAI and save to database.

**Request:**
```json
{
  "items": [
    {
      "storageKey": "clothing/user_xxx/uuid.jpg",
      "publicUrl": "https://cdn.../clothing/...",
      "mimeType": "image/jpeg",
      "originalFilename": "my-shirt.jpg"
    }
  ]
}
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "user_xxx",
      "category": "tshirt",
      "color": "black",
      "description": "...",
      ...
    }
  ]
}
```

### 3. `/api/save-person-image` (POST)
Save a person image to the database.

**Request:**
```json
{
  "storageKey": "person/user_xxx/uuid.jpg",
  "publicUrl": "https://cdn.../person/...",
  "mimeType": "image/jpeg",
  "originalFilename": "my-photo.jpg",
  "description": "Optional description"
}
```

### 4. `/api/try-on` (POST)
Generate a try-on image using Gemini.

**Request:**
```json
{
  "personImageId": "uuid",
  "clothingItemIds": ["uuid1", "uuid2"]
}
```

**Response:**
```json
{
  "imageBase64": "base64-encoded-image",
  "mimeType": "image/png"
}
```

### 5. `/api/wardrobe` (GET)
Fetch user's clothing items and person images.

**Response:**
```json
{
  "clothingItems": [...],
  "personImages": [...]
}
```

## Frontend Flow

1. **Upload Clothing:**
   - Call `/api/upload-urls` with `kind: "clothing"`
   - Upload files directly to R2 using signed URLs
   - Call `/api/preprocess-clothing` with storage keys

2. **Upload Person Image:**
   - Call `/api/upload-urls` with `kind: "person"`
   - Upload file directly to R2
   - Call `/api/save-person-image` with storage key

3. **Try On:**
   - User selects person image and clothing items
   - Call `/api/try-on` with IDs
   - Display base64 result

## Next Steps

1. Install dependencies: `npm install` in the frontend directory
2. Set up Clerk middleware (see Clerk docs)
3. Run database migrations
4. Configure R2 bucket and CDN
5. Update frontend components to use new API routes




