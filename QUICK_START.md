# Quick Start: Batch Preprocessing

## Setup

1. **Install dependencies**:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Set environment variable**:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

3. **Start server**:
   ```bash
   uvicorn main:app --reload
   ```

## Test the Endpoint

### Using curl

```bash
curl -X POST http://localhost:8000/api/preprocess-clothing \
  -F "clothing_images=@path/to/image1.jpg" \
  -F "clothing_images=@path/to/image2.jpg"
```

### Using Python

```python
import requests

files = [
    ('clothing_images', open('image1.jpg', 'rb')),
    ('clothing_images', open('image2.jpg', 'rb')),
]

response = requests.post(
    'http://localhost:8000/api/preprocess-clothing',
    files=files
)

print(response.json())
```

### Using JavaScript/Fetch

```javascript
const formData = new FormData();
formData.append('clothing_images', file1);
formData.append('clothing_images', file2);

const response = await fetch('http://localhost:8000/api/preprocess-clothing', {
  method: 'POST',
  body: formData
});

const { items } = await response.json();
console.log(items);
```

## Expected Response

```json
{
  "items": [
    {
      "index": 0,
      "category": "hoodie",
      "subcategory": "oversized",
      "color": "black",
      "style": "streetwear",
      "material": "cotton",
      "description": "Black oversized hoodie with front kangaroo pocket",
      "tags": ["hoodie", "oversized", "black", "streetwear"],
      "recommended_filename": "black-oversized-hoodie-streetwear.jpg",
      "filename": "black-oversized-hoodie-streetwear.jpg",
      "url": "/uploads/black-oversized-hoodie-streetwear.jpg",
      "file_path": "uploads/black-oversized-hoodie-streetwear.jpg",
      "metadata": {
        "category": "hoodie",
        "subcategory": "oversized",
        "color": "black",
        "style": "streetwear",
        "material": "cotton",
        "description": "Black oversized hoodie...",
        "tags": ["hoodie", "oversized", "black"],
        "original_filename": "IMG_1234.jpg"
      }
    }
  ],
  "total": 1
}
```

## Files Saved

After successful processing, check `backend/uploads/`:

```
uploads/
  black-oversized-hoodie-streetwear.jpg    # Image file
  black-oversized-hoodie-streetwear.json   # Metadata JSON
```

## Error Handling

Common errors:

1. **Missing API key**: Set `OPENAI_API_KEY` environment variable
2. **Too many images**: Maximum 5 images per request
3. **Invalid image format**: Ensure images are valid JPEG/PNG
4. **OpenAI API error**: Check API key and quota

All errors return HTTP status codes with error messages.

## Integration with Frontend

The new endpoint works alongside the existing `/api/analyze-clothing` endpoint. You can:

1. **Keep using old endpoint** - No changes needed
2. **Switch to new endpoint** - Update `BulkUploadZone.tsx`
3. **Use both** - Gradually migrate

## Next Steps

- Read `BATCH_PREPROCESSING_ARCHITECTURE.md` for full details
- Read `IMPLEMENTATION_SUMMARY.md` for overview
- Consider adding cloud storage (R2/S3) for production

