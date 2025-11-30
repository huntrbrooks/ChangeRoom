# Current Try-On API Calls

This document shows the current API calls being made for virtual try-on generation.

## 1. Frontend API Route (Currently Active)

**Location**: `frontend/app/api/try-on/route.ts`

### Frontend → Gemini Direct Call

```typescript
// Function: generateTryOnWithGemini()
// Lines 93-109

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiConfig.apiKey}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: personImageBase64,      // Base64 encoded person image
                mimeType: personMimeType,      // e.g., "image/jpeg"
              },
            },
            // ... clothing images
            {
              inlineData: {
                data: clothing1Base64,
                mimeType: clothing1MimeType,
              },
            },
            {
              text: `
First image is the person. Following images are clothing items. Generate one photorealistic image of the same person wearing all the clothing items. Keep pose and identity consistent. Do not add extra logos or text beyond what is visible on the clothing.
              `.trim(),
            },
          ],
        },
      ],
    }),
  }
);
```

### Full Request Example

```http
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=YOUR_API_KEY
Content-Type: application/json

{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "data": "iVBORw0KGgoAAAANSUhEUgAA...",
            "mimeType": "image/jpeg"
          }
        },
        {
          "inlineData": {
            "data": "iVBORw0KGgoAAAANSUhEUgAA...",
            "mimeType": "image/jpeg"
          }
        },
        {
          "text": "First image is the person. Following images are clothing items. Generate one photorealistic image of the same person wearing all the clothing items. Keep pose and identity consistent. Do not add extra logos or text beyond what is visible on the clothing."
        }
      ]
    }
  ]
}
```

### Response Handling

```typescript
const data = await response.json();
const imagePart = data.candidates?.[0]?.content?.parts?.find(
  (p: any) => p.inlineData
);

return {
  base64: imagePart.inlineData.data,
  mimeType: imagePart.inlineData.mimeType || "image/png",
};
```

---

## 2. Backend API Route (Python/FastAPI)

**Location**: `backend/services/vton.py`

### Backend → Gemini Call

```python
# Function: _generate_with_gemini()
# Lines 304-317

endpoint = f"{base_url}/{model_name}:generateContent"
# base_url = "https://generativelanguage.googleapis.com/v1beta/models"
# model_name = "gemini-1.5-flash"

response = await client.post(
    f"{endpoint}?key={api_key}",
    headers={
        "Content-Type": "application/json",
    },
    json={
        "contents": [
            {
                "role": "user",
                "parts": parts,  # Array with images + text prompt
            }
        ],
    },
)
```

### Parts Array Structure (Python)

```python
parts = [
    {
        "inline_data": {
            "mime_type": "image/jpeg",
            "data": user_img_base64,  # Person image
        }
    },
    {
        "inline_data": {
            "mime_type": "image/jpeg",
            "data": garment1_base64,  # Clothing item 1
        }
    },
    # ... more clothing items
    {
        "text": "Very long system prompt with instructions..."
    }
]
```

### Full Python Request Example

```python
import httpx

async with httpx.AsyncClient(timeout=300.0) as client:
    response = await client.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_API_KEY",
        headers={
            "Content-Type": "application/json",
        },
        json={
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": "base64_encoded_person_image..."
                            }
                        },
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": "base64_encoded_clothing_image..."
                            }
                        },
                        {
                            "text": "System prompt with instructions..."
                        }
                    ]
                }
            ]
        }
    )
```

### Response Parsing (Python)

```python
data = response.json()

parts_out = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])

image_part = None
for part in parts_out:
    if "inline_data" in part:
        image_part = part["inline_data"]
        break

image_base64 = image_part.get("data")
mime_type = image_part.get("mime_type", "image/png")

return f"data:{mime_type};base64,{image_base64}"
```

---

## Key Differences

### Frontend (TypeScript)
- **Model**: `gemini-2.5-flash-image` (doesn't exist - 404 error)
- **Field names**: `inlineData` (camelCase)
- **Field names**: `mimeType` (camelCase)
- **Location**: Direct call from Next.js API route

### Backend (Python)
- **Model**: `gemini-1.5-flash` (exists but doesn't generate images)
- **Field names**: `inline_data` (snake_case)
- **Field names**: `mime_type` (snake_case)
- **Location**: FastAPI backend service

---

## Current Issues

1. **Frontend model doesn't exist**: `gemini-2.5-flash-image` returns 404
2. **Backend model doesn't generate images**: `gemini-1.5-flash` exists but standard Gemini models don't create images
3. **Inconsistent field naming**: Frontend uses camelCase, backend uses snake_case (both are valid in JSON)

---

## What Each Part Does

### Request Structure
```
contents[0]
  └── role: "user"
  └── parts: [
        ├── inlineData/inline_data: { person image }
        ├── inlineData/inline_data: { clothing item 1 }
        ├── inlineData/inline_data: { clothing item 2 }
        └── text: { instructions }
      ]
```

### Response Structure
```
candidates[0]
  └── content
      └── parts: [
            └── inlineData/inline_data: { generated image }
          ]
```

---

## API Endpoints Used

- **Frontend**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`
- **Backend**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`

Both use:
- **API Version**: `v1beta`
- **Method**: `generateContent`
- **Authentication**: API key as query parameter (`?key=...`)

