# Current Try-On API Calls

**Status**: The active try-on pipeline is the FastAPI backend (`/api/try-on` on Render). The homepage posts multipart form data directly to that backend via `NEXT_PUBLIC_API_URL`.

## 1. Frontend To Backend

**Location**: `frontend/app/page.tsx`

The homepage sends:

- `user_images`: up to 5 person reference images
- `user_image`: first person image for backward compatibility
- `clothing_images`: up to 5 wardrobe items
- `main_index`: main person reference index
- `category`: inferred garment category
- `garment_metadata`: JSON metadata and wearing-style directives
- `requestId`: correlation id for logs/billing holds

```typescript
const tryOnFormData = new FormData();
userImages.forEach((img) => tryOnFormData.append("user_images", img));
tryOnFormData.append("user_image", userImages[0]);
activeWardrobeItems.forEach((item) => {
  tryOnFormData.append("clothing_images", item.file);
});
tryOnFormData.append("main_index", "0");
tryOnFormData.append("category", inferredCategory);
tryOnFormData.append("garment_metadata", JSON.stringify(metadata));

await httpClient.post(`${API_URL}/api/try-on`, tryOnFormData, {
  headers: { "Content-Type": "multipart/form-data" },
  timeout: 600000,
});
```

## 2. Backend To OpenAI

**Location**: `backend/services/vton.py`

The backend normalizes uploaded images, compresses them, and calls OpenAI image edits:

- Endpoint: `POST https://api.openai.com/v1/images/edits`
- Model: `OPENAI_TRYON_IMAGE_MODEL`, default `gpt-image-2`
- Required key: `OPENAI_API_KEY`
- Default size: `1024x1536`
- Default quality: `high`
- Default output format: `jpeg`

```python
response = await client.post(
    "https://api.openai.com/v1/images/edits",
    headers={"Authorization": f"Bearer {api_key}"},
    data={
        "model": model_name,
        "prompt": prompt,
        "size": image_size,
        "quality": image_quality,
        "output_format": output_format,
        "moderation": image_moderation,
    },
    files=[
        ("image[]", ("user_reference_1.jpg", user_bytes, "image/jpeg")),
        ("image[]", ("garment_1.jpg", garment_bytes, "image/jpeg")),
    ],
)
```

The response is parsed from `data[0].b64_json` and returned to the frontend as a `data:image/...;base64,...` URL.

## Retry And Safety Helpers

The backend keeps the existing modesty/safety retry pipeline:

- Detects high-risk garment metadata.
- Optionally uses Gemini vision/text helpers when `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set.
- Falls back to local heuristic prompt rewriting when Gemini helpers are unavailable.
- Optionally falls back to OpenRouter after OpenAI content-safety blocks only when `OPENROUTER_TRYON_CONTENT_FALLBACK_ENABLED=1`, preserving a general-audience safety contract.
- Retries up to 4 image generation attempts before returning a user-facing error.

## Required Environment Variables

- Backend: `OPENAI_API_KEY`
- Frontend: `NEXT_PUBLIC_API_URL`

Optional backend controls:

- `OPENAI_TRYON_IMAGE_MODEL=gpt-image-2`
- `OPENAI_TRYON_IMAGE_SIZE=1024x1536`
- `OPENAI_TRYON_QUALITY=high`
- `OPENAI_TRYON_OUTPUT_FORMAT=jpeg`
- `OPENAI_TRYON_MODERATION=auto`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` for rewrite/safety helper paths
- `OPENROUTER_API_KEY` plus `OPENROUTER_TRYON_CONTENT_FALLBACK_ENABLED=1` for the opt-in OpenRouter safety-rewrite fallback
