# Image Metadata Enhancement Documentation

## Overview

The image analysis process has been enhanced to extract comprehensive metadata, embed it into image files, and rename files with descriptive names based on their content.

## Key Enhancements

### 1. Enhanced Metadata Extraction

The analysis now extracts the following comprehensive metadata fields:

- **Basic Information:**
  - `category`: Accurate clothing category (shoes, lower_body, upper_body, outerwear, dresses, accessories)
  - `color`: Specific color description (e.g., "navy blue", "charcoal gray")
  - `style`: Style description (casual, formal, sporty, vintage, etc.)
  - `material`: Fabric/material type (leather, cotton, denim, etc.)
  - `fit`: Fit type (slim, loose, regular, oversized, etc.)
  - `patterns`: Patterns or prints (solid, striped, floral, graphic, etc.)
  - `brand`: Brand name if visible
  - `season`: Appropriate season (spring, summer, fall, winter, all-season)
  - `occasion`: Suitable occasions (casual, formal, party, work, etc.)

- **Visual Characteristics:**
  - `pose`: How the item is displayed (laid flat, on hanger, on model, etc.)
  - `background`: Background description (white, textured, outdoor, studio, etc.)
  - `lighting`: Lighting conditions (natural, studio, soft, harsh, etc.)
  - `angle`: Camera angle (front view, side view, top down, etc.)
  - `texture`: Visible texture details (smooth, rough, distressed, shiny, etc.)
  - `details`: Notable details (buttons, zippers, pockets, seams, logos, etc.)
  - `condition`: Item condition (new, worn, vintage, distressed, etc.)

### 2. Metadata Embedding

Metadata is embedded directly into image files using:

- **JPEG Images:** EXIF data using `piexif` library
  - Metadata stored in EXIF UserComment and ImageDescription tags
  - Category stored in Software tag for quick identification

- **PNG Images:** Text chunks
  - Metadata stored as `clothing_metadata` text chunk
  - Individual fields also stored as separate text chunks for compatibility

- **Metadata JSON Files:** Separate JSON files are also created alongside images for easy retrieval
  - Format: `{filename}_metadata.json`

### 3. Intelligent File Renaming

Files are renamed using a descriptive naming convention:

```
{category}_{color}_{style}_{timestamp}_{hash}.jpg
```

Example: `shoes_brown_leather_boots_20241215_143022_a1b2c3d4.jpg`

The naming convention ensures:
- Easy identification of clothing type
- Color and style information in filename
- Unique filenames to prevent conflicts
- Sortable by timestamp

### 4. New API Endpoints

#### `/api/analyze-and-save-clothing` (POST)

Analyzes clothing items, embeds metadata, and saves them with proper naming.

**Parameters:**
- `clothing_images`: List of image files (max 5)
- `save_files`: Boolean (default: true) - whether to save files to disk
- `output_dir`: String (default: "uploads") - directory to save images

**Response:**
```json
{
  "items": [
    {
      "index": 0,
      "original_filename": "IMG_1234.jpg",
      "analysis": {
        "category": "shoes",
        "detailed_description": "...",
        "metadata": {...},
        "suggested_filename": "shoes_brown_leather_20241215_abc123.jpg",
        "saved_file": "uploads/shoes_brown_leather_20241215_abc123.jpg",
        "saved_filename": "shoes_brown_leather_20241215_abc123.jpg",
        "metadata_file": "uploads/shoes_brown_leather_20241215_abc123_metadata.json"
      },
      "status": "success"
    }
  ],
  "total": 1
}
```

#### `/api/read-image-metadata` (GET)

Reads embedded metadata from a saved image file.

**Parameters:**
- `image_path`: Path to the image file (relative to uploads directory or absolute)

**Response:**
```json
{
  "metadata": {
    "category": "shoes",
    "color": "brown",
    "style": "casual",
    ...
  },
  "image_path": "uploads/shoes_brown_leather_20241215_abc123.jpg"
}
```

## Usage Examples

### Python Code

```python
from services import analyze_clothing

# Analyze and save with metadata
result = await analyze_clothing.analyze_and_save_clothing_item(
    image_bytes,
    original_filename="my_shoe.jpg",
    output_dir="uploads",
    save_file=True
)

# Read metadata from saved image
metadata = analyze_clothing.read_metadata_from_image("uploads/shoes_brown_leather_20241215_abc123.jpg")
```

### API Usage

```bash
# Analyze and save images
curl -X POST "http://localhost:8000/api/analyze-and-save-clothing" \
  -F "clothing_images=@shoe1.jpg" \
  -F "clothing_images=@shirt1.jpg" \
  -F "save_files=true" \
  -F "output_dir=uploads"

# Read metadata from image
curl "http://localhost:8000/api/read-image-metadata?image_path=shoes_brown_leather_20241215_abc123.jpg"
```

## Dependencies

New dependency added:
- `piexif`: Enhanced EXIF metadata support for JPEG images

Install with:
```bash
pip install -r requirements.txt
```

## File Structure

After processing, images are saved with the following structure:

```
uploads/
├── shoes_brown_leather_20241215_abc123.jpg          # Image with embedded metadata
├── shoes_brown_leather_20241215_abc123_metadata.json # Separate metadata file
├── upper_body_blue_casual_20241215_def456.jpg
└── upper_body_blue_casual_20241215_def456_metadata.json
```

## Benefits

1. **Accurate Categorization:** Images are correctly labeled beyond generic "upper_body" tags
2. **Rich Metadata:** Comprehensive metadata enables better search and filtering
3. **Persistent Metadata:** Metadata embedded in images survives file transfers
4. **Descriptive Filenames:** Easy identification without opening files
5. **Searchable:** Metadata can be indexed for fast retrieval
6. **AI-Ready:** Detailed descriptions optimized for AI image generation

## Backward Compatibility

The existing `/api/analyze-clothing` endpoint continues to work as before, returning analysis results without saving files. The new `/api/analyze-and-save-clothing` endpoint provides the enhanced functionality with file saving and metadata embedding.

