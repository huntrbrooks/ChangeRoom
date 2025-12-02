# Imagen 4 Integration for Virtual Try-On

## Overview

The application now uses **Imagen 4** via the Gemini API for virtual try-on image generation. Imagen 4 is Google's advanced image generation model that can create photorealistic images based on text prompts and image inputs.

## Changes Made

### Frontend (`frontend/app/api/try-on/route.ts`)

- Updated `generateTryOnWithImagen4()` function to use Imagen 4 models
- Uses REST API calls to Gemini API endpoint with Imagen 4 models
- Models tried (in order):
  - `imagen-4.0-generate-001` - Standard Imagen 4 (high quality)
  - `imagen-4.0-fast-generate-001` - Fast variant (faster generation)
- Includes `responseModalities: ["IMAGE"]` in request config
- Handles fallback between models if one fails

### Backend (`backend/services/vton.py`)

- Updated `_generate_with_gemini()` function to use Imagen 4 models
- Changed from Gemini text models (which don't generate images) to Imagen 4 models
- Added `generationConfig` with `responseModalities: ["IMAGE"]`
- Updated error messages to reference Imagen 4 instead of Gemini models
- Improved logging to indicate Imagen 4 usage

## API Endpoint

**Base URL**: `https://generativelanguage.googleapis.com/v1beta/models`

**Model Names**:
- `imagen-4.0-generate-001`
- `imagen-4.0-fast-generate-001`

**Endpoint Format**: `{base_url}/{model_name}:generateContent?key={api_key}`

## Request Format

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "data": "base64_person_image...",
            "mimeType": "image/jpeg"
          }
        },
        {
          "inlineData": {
            "data": "base64_clothing_image...",
            "mimeType": "image/jpeg"
          }
        },
        {
          "text": "Generate a photorealistic image of the person wearing all the clothing items..."
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE"]
  }
}
```

## Response Format

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "data": "base64_generated_image...",
              "mimeType": "image/png"
            }
          }
        ]
      }
    }
  ]
}
```

## Requirements

### API Key Setup

1. **Get Gemini API Key**: https://aistudio.google.com/apikey
2. **Enable APIs in Google Cloud Console**:
   - Generative AI API: https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
   - Imagen API (if separate): https://console.cloud.google.com/apis/library/imagen.googleapis.com

### Environment Variables

- **Frontend**: `GEMINI_API_KEY` (in Vercel environment variables)
- **Backend**: `GEMINI_API_KEY` (in Render/backend environment variables)

## Features

### Virtual Try-On Generation

- Accepts person image + multiple clothing item images
- Generates photorealistic image of person wearing clothing
- Preserves person's identity, pose, and appearance
- Handles multiple clothing items (up to 5)
- Supports metadata for styling (background, pose, etc.)

### Error Handling

- Fallback between Imagen 4 model variants
- Clear error messages if models aren't available
- Logging for debugging model selection

## Limitations & Notes

1. **Model Availability**: Imagen 4 models may not be available in all regions. Check Google Cloud Console for availability.

2. **API Quotas**: Imagen 4 may have different pricing/quotas than standard Gemini models. Check Google Cloud pricing.

3. **Image-to-Image**: Imagen 4 is primarily designed for text-to-image generation. Virtual try-on requires careful prompting to work with image inputs.

4. **Processing Time**: Image generation can take 30-60 seconds depending on model and image complexity.

## Troubleshooting

### "Model not found" Error

- Ensure Imagen API is enabled in Google Cloud Console
- Verify API key has access to Imagen models
- Check that model names are correct (they may change)

### "No image in response" Error

- Verify `responseModalities: ["IMAGE"]` is included in request
- Check that the prompt is appropriate for image generation
- Ensure API key has image generation permissions

### Slow Generation

- Try `imagen-4.0-fast-generate-001` for faster results
- Reduce number of input images
- Simplify the prompt

## Next Steps

1. Test with actual try-on requests
2. Monitor API usage and costs
3. Adjust prompts for better results
4. Consider caching generated images
5. Add progress indicators for long-running requests

## References

- [Imagen 4 Announcement](https://developers.googleblog.com/en/imagen-4-now-available-in-the-gemini-api-and-google-ai-studio/)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Imagen Documentation](https://cloud.google.com/vertex-ai/docs/generative-ai/image/overview)




