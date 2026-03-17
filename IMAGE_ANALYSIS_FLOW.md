# Image Analysis Flow - Complete Investigation

This document traces the complete flow of image analysis from upload to final display with metadata.

## Overview

The image analysis flow involves:
1. **Frontend Upload** → User uploads images via BulkUploadZone
2. **Backend Analysis** → OpenAI GPT-4o-mini classifies and analyzes clothing
3. **File Processing** → Image is renamed and metadata is embedded
4. **Storage** → File saved to `/uploads` directory with metadata
5. **Display** → Frontend displays analyzed items with category labels

---

## 1. Frontend Upload Flow

### Entry Point: `BulkUploadZone.tsx`

**Location**: `frontend/app/components/BulkUploadZone.tsx`

**Flow**:
1. User drags/drops or selects 1-5 images (lines 268-279)
2. `handleBulkUpload` is triggered (line 37)
3. Files are limited to 5 max (line 41)
4. Creates FormData with all files (line 64-67)
5. Sends POST request to `/api/analyze-clothing` endpoint (line 70-74)

**Key Code**:
```typescript
const formData = new FormData();
selectedFiles.forEach((file) => {
  formData.append('clothing_images', file);
});

const response = await fetch(`${API_URL_FETCH}/api/analyze-clothing`, {
  method: 'POST',
  body: formData,
});
```

### Streaming Response Handling

The backend uses Server-Sent Events (SSE) for real-time progress:

**Lines 80-191 in BulkUploadZone.tsx**:
- Reads streaming response via `response.body.getReader()`
- Parses SSE data with format: `data: {json}\n\n`
- Updates UI with progress events:
  - `type: 'progress'` - Shows current progress percentage
  - `type: 'item_complete'` - Individual item completion
  - `type: 'complete'` - All items finished
  - `type: 'error'` - Error occurred

**Progress Events Structure**:
```javascript
{
  type: 'progress',
  progress: 50,  // percentage
  current: 2,    // current item number
  total: 5,      // total items
  message: 'Analyzing item 2/5...'
}
```

**Item Complete Event**:
```javascript
{
  type: 'item_complete',
  item: {
    index: 0,
    original_filename: 'boots.jpg',
    analysis: {
      category: 'shoes',
      item_type: 'boots',
      detailed_description: '...',
      suggested_filename: 'shoes_boots_brown_abc123.jpg',
      metadata: {...}
    },
    saved_filename: 'shoes_boots_brown_abc123.jpg',
    file_url: '/uploads/shoes_boots_brown_abc123.jpg',
    status: 'success'
  },
  progress: 20,
  current: 1,
  total: 5
}
```

---

## 2. Backend Analysis Endpoint

### Endpoint: `/api/analyze-clothing`

**Location**: `backend/main.py` (lines 264-291)

**Flow**:
1. Receives multiple `UploadFile` objects (line 266)
2. Validates max 5 items (line 277-278)
3. Calls `analyze_clothing_stream()` generator (line 280-281)
4. Returns streaming response with SSE format (line 280-288)

### Streaming Generator: `analyze_clothing_stream()`

**Location**: `backend/main.py` (lines 175-262)

**Flow for each item**:
1. Reads file contents: `contents = await clothing_image.read()` (line 188)
2. Gets original filename (line 189)
3. Sends progress update (lines 192-195)
4. Calls `analyze_and_save_clothing_item()` (lines 201-206)
5. Formats result with file URL (lines 214-222)
6. Sends item_complete event (line 237)
7. After all items, sends final complete event (line 258)

**File URL Generation** (line 212):
```python
file_url = f"/uploads/{saved_filename}" if saved_filename else ""
```

---

## 3. Clothing Analysis Service

### Main Function: `analyze_and_save_clothing_item()`

**Location**: `backend/services/analyze_clothing.py` (lines 642-677)

**Flow**:
1. Calls `analyze_clothing_item()` to get classification and metadata (line 661)
2. If `save_file=True`, calls `save_image_with_metadata()` (lines 665-669)
3. Merges analysis and save results (lines 673-675)
4. Returns combined result with `saved_filename` and `file_url`

### Analysis Function: `analyze_clothing_item()`

**Location**: `backend/services/analyze_clothing.py` (lines 124-492)

**Flow**:
1. Validates OpenAI API availability (lines 144-169)
2. Converts image to base64 for API (lines 175-189)
3. Sends to OpenAI GPT-4o-mini with classification prompt (lines 282-303)
4. Parses JSON response (lines 314-323)
5. **Category Validation & Correction** (lines 333-421):
   - Validates category against keywords
   - Corrects misclassified items (e.g., boots labeled as "upper_body")
   - Uses keyword matching as fallback
6. Extracts specific item type (e.g., "boots", "pants", "hat") (line 424)
7. Generates suggested filename (lines 426-441)
8. Creates comprehensive metadata dict (lines 444-464)
9. Returns analysis result (lines 466-478)

**Critical Classification Logic** (lines 378-421):
```python
if category == "upper_body":
    # Check if it's actually shoes, pants, or accessories
    if any(keyword in description_lower for keyword in shoes_keywords):
        category = "shoes"
        corrected = True
    elif any(keyword in description_lower for keyword in lower_body_keywords):
        category = "lower_body"
        corrected = True
    elif any(keyword in description_lower for keyword in accessories_keywords):
        category = "accessories"
        corrected = True
```

**Keyword Sets** (lines 339-369):
- `shoes_keywords`: boot, shoe, sneaker, heel, sandal, footwear, sole, etc.
- `lower_body_keywords`: pant, jean, trouser, short, skirt, waistband, etc.
- `accessories_keywords`: hat, cap, bag, belt, scarf, etc.

### Filename Generation (lines 426-441)

**Format**: `{category}_{item_type}_{color}_{hash}.jpg`

**Example**: `shoes_boots_brown_abc12345.jpg`

**Process**:
1. Extracts color and style from analysis (lines 426-427)
2. Cleans special characters (lines 430-432)
3. Creates MD5 hash from original filename (line 435)
4. Builds filename with item type if available (lines 438-441)

---

## 4. File Saving with Metadata

### Save Function: `save_image_with_metadata()`

**Location**: `backend/services/analyze_clothing.py` (lines 576-639)

**Flow**:
1. Creates output directory if needed (line 596)
2. Uses `suggested_filename` from analysis or generates new one (lines 599-605)
3. Cleans filename (removes invalid chars) (line 608)
4. Ensures `.jpg` extension (lines 611-612)
5. Embeds metadata into image via `embed_metadata_in_image()` (line 615)
6. Saves image file (lines 618-620)
7. **Also saves separate JSON metadata file** (lines 623-625):
   - Filename: `{image_name}_metadata.json`
   - Contains full metadata dictionary

### Metadata Embedding: `embed_metadata_in_image()`

**Location**: `backend/services/analyze_clothing.py` (lines 495-573)

**Process**:
1. Opens image from bytes (line 508)
2. Converts metadata to JSON string (line 511)
3. For JPEG: Uses `piexif` to embed in EXIF:
   - ImageDescription tag (line 528)
   - UserComment tag (line 529)
   - Software tag with category (line 534)
4. For PNG: Stores in text chunks (lines 554-562)
5. Returns image bytes with embedded metadata (line 568)

**EXIF Embedding** (lines 518-551):
- Uses `piexif` library if available
- Stores full JSON in UserComment
- Falls back to basic save if embedding fails

---

## 5. Frontend Display

### Item Display: `BulkUploadZone.tsx`

**Location**: Lines 336-399

**Display Structure**:
```tsx
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
  {analyzedItems.map((item, idx) => (
    <div className="border-2 rounded-lg p-3">
      <img src={URL.createObjectURL(file)} />
      <p>{item.saved_filename || item.analysis?.suggested_filename}</p>
      <p className="text-green-700 font-bold">
        ✓ {item.analysis?.category?.replace(/_/g, ' ')}
      </p>
      {item.analysis?.item_type && (
        <p className="text-gray-600">{item.analysis.item_type}</p>
      )}
    </div>
  ))}
</div>
```

**Category Display** (line 376):
- Shows checkmark + category name
- Replaces underscores with spaces (e.g., "upper_body" → "upper body")
- **Issue**: All items showing "✓ upper_body" in the screenshot

### File Processing After Analysis (lines 194-249)

After analysis completes, frontend processes files:

1. **Fetches saved files from server** (lines 202-232):
   - Uses `file_url` from analysis
   - Fetches blob from server
   - Creates new File object with `saved_filename`
   - Attaches metadata to file object:
     ```typescript
     (newFile as any).metadata = analysis.metadata;
     (newFile as any).category = analysis.category;
     (newFile as any).item_type = analysis.item_type;
     (newFile as any).file_url = fileUrl;
     (newFile as any).saved_filename = savedFilename;
     ```

2. **Calls `onFilesUploaded` callback** (line 252):
   - Passes processed files and analyses to parent
   - Parent stores in `wardrobeItems` state

---

## 6. File Storage Structure

### Directory: `/backend/uploads/`

**Saved Files**:
- Image: `{category}_{item_type}_{color}_{hash}.jpg`
- Metadata JSON: `{category}_{item_type}_{color}_{hash}_metadata.json`

**Example Files**:
```
uploads/
  shoes_boots_brown_abc12345.jpg
  shoes_boots_brown_abc12345_metadata.json
  accessories_hat_black_def67890.jpg
  accessories_hat_black_def67890_metadata.json
```

### Static File Serving

**Location**: `backend/main.py` (lines 42-47)

```python
UPLOADS_DIR = Path("uploads")
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
```

Files are accessible via: `http://api-url/uploads/{filename}`

---

## 7. Metadata Structure

### Full Metadata Dictionary

**Location**: `backend/services/analyze_clothing.py` (lines 444-464)

```python
{
    "category": "shoes" | "upper_body" | "lower_body" | "accessories" | "outerwear" | "dresses",
    "item_type": "boots" | "pants" | "hat" | "shirt" | etc.,
    "color": "brown",
    "style": "casual",
    "material": "leather",
    "fit": "regular",
    "patterns": "solid",
    "brand": "unknown",
    "season": "all-season",
    "occasion": "casual",
    "pose": "on surface",
    "background": "white",
    "lighting": "natural",
    "angle": "front view",
    "texture": "distressed",
    "details": "lace-up, metal eyelets",
    "condition": "worn",
    "original_filename": "boots.jpg",
    "classification_corrected": true/false,  # Flag if category was corrected
    "detailed_description": "A very detailed description..."
}
```

### Analysis Result Returned to Frontend

```python
{
    "category": "shoes",
    "item_type": "boots",
    "detailed_description": "...",
    "color": "brown",
    "style": "casual",
    "material": "leather",
    "fit": "regular",
    "metadata": {...},  # Full metadata dict above
    "suggested_filename": "shoes_boots_brown_abc12345.jpg",
    "full_analysis": {...},  # Raw OpenAI response
    "classification_corrected": true
}
```

---

## 8. Identified Issues

### Issue 1: Misclassification Problem

**Evidence from Screenshot**:
- Brown leather boots → labeled as "✓ upper_body"
- Black baseball cap → labeled as "✓ upper_body"
- Blue hooded jacket → labeled as "✓ upper_body"
- Black cargo pants → labeled as "✓ upper_body"
- Beige t-shirt → labeled as "✓ upper_body" (this one is correct)

**Root Cause Analysis**:

1. **OpenAI Classification** (lines 191-303):
   - Prompt includes detailed classification rules
   - But model may still misclassify items

2. **Category Correction Logic** (lines 378-421):
   - Only corrects if category is already "upper_body"
   - If model returns wrong category directly, correction may not trigger
   - Keyword matching may not catch all cases

3. **Display Issue**:
   - All items show "✓ upper_body" label
   - Suggests either:
     a) Analysis is returning wrong categories
     b) Frontend is not properly reading category from analysis
     c) Category correction is not working

**Potential Fixes**:

1. **Improve Correction Logic**:
   - Always validate category against description keywords
   - Not just when category is "upper_body"
   - Add more comprehensive keyword matching

2. **Better Prompt Engineering**:
   - Strengthen classification examples in prompt
   - Add negative examples (what NOT to classify as upper_body)

3. **Frontend Validation**:
   - Log actual category values from analysis
   - Verify category is being read correctly from response

---

## 9. Flow Summary Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND: BulkUploadZone                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. User uploads 1-5 images                               │  │
│  │ 2. Creates FormData with files                           │  │
│  │ 3. POST to /api/analyze-clothing                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND: /api/analyze-clothing                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Receives UploadFile[]                                 │  │
│  │ 2. Validates max 5 items                                 │  │
│  │ 3. Calls analyze_clothing_stream()                       │  │
│  │ 4. Returns StreamingResponse (SSE)                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│         BACKEND: analyze_clothing_stream() Generator            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ For each file:                                           │  │
│  │   1. Read file bytes                                     │  │
│  │   2. Send progress event                                 │  │
│  │   3. Call analyze_and_save_clothing_item()               │  │
│  │   4. Send item_complete event with analysis              │  │
│  │ After all: Send complete event with all items            │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│     BACKEND: analyze_and_save_clothing_item()                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. analyze_clothing_item() → OpenAI GPT-4o-mini          │  │
│  │    ├─ Classify category (shoes/upper_body/etc.)          │  │
│  │    ├─ Extract metadata (color, style, material, etc.)    │  │
│  │    ├─ Validate/correct category                          │  │
│  │    └─ Generate suggested_filename                        │  │
│  │ 2. save_image_with_metadata()                            │  │
│  │    ├─ Embed metadata in EXIF/PNG chunks                  │  │
│  │    ├─ Save image as {category}_{item_type}_{color}_{hash}.jpg │
│  │    └─ Save metadata JSON file                            │  │
│  │ 3. Return result with saved_filename & file_url          │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FILE SYSTEM: /uploads/                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ shoes_boots_brown_abc12345.jpg                           │  │
│  │ shoes_boots_brown_abc12345_metadata.json                 │  │
│  │ accessories_hat_black_def67890.jpg                       │  │
│  │ accessories_hat_black_def67890_metadata.json             │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND: Processing SSE Stream                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Parse SSE events (progress, item_complete, complete)  │  │
│  │ 2. Update UI with progress bar                           │  │
│  │ 3. For each completed item:                              │  │
│  │    ├─ Fetch saved file from /uploads/{filename}          │  │
│  │    ├─ Create File object with saved_filename             │  │
│  │    └─ Attach metadata (category, item_type, etc.)        │  │
│  │ 4. Display items in grid with category labels            │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              FRONTEND: BulkUploadZone Display                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ [Image] [Image] [Image] [Image] [Image]                  │  │
│  │ filename  filename  filename  filename  filename          │  │
│  │ ✓ category ✓ category ✓ category ✓ category ✓ category   │  │
│  │ item_type  item_type  item_type  item_type  item_type     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Key Files Reference

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/app/components/BulkUploadZone.tsx` | Upload UI & SSE handling | `handleBulkUpload()`, SSE parsing |
| `backend/main.py` | API endpoints | `/api/analyze-clothing`, `analyze_clothing_stream()` |
| `backend/services/analyze_clothing.py` | Analysis & saving logic | `analyze_clothing_item()`, `analyze_and_save_clothing_item()`, `save_image_with_metadata()` |
| `backend/services/gemini.py` | Product identification | `analyze_garment()` (separate from classification) |

---

## Next Steps for Investigation

1. **Check OpenAI Response**: Log actual category values returned by OpenAI
2. **Test Category Correction**: Verify keyword matching is working
3. **Frontend Logging**: Add console logs to see what category values are received
4. **Validation**: Test with known items (boots, pants, hats) and verify classification

---

## 11. Critical Issues Found

### Issue: Misclassification Logic Flaw

**Problem**: The category correction logic has a critical flaw that prevents proper correction.

**Location**: `backend/services/analyze_clothing.py` lines 376-421

**Current Logic Flow**:
1. Line 378: Only checks for correction if `category == "upper_body"`
2. Lines 380-391: Corrects to shoes/pants/accessories if keywords match
3. Line 394: Runs keyword matching again if `category not in valid_categories or corrected`

**The Problem**:
- If OpenAI returns "upper_body" for boots, the correction should happen on line 380
- BUT if the `description_lower` doesn't contain keywords like "boot" or "shoe" (maybe the description says "brown leather footwear"), the correction won't happen
- The keyword matching on line 394 might override corrections or not run at all if category is already valid

**Example Failure Case**:
- Image: Brown leather boots
- OpenAI returns: `{"category": "upper_body", "detailed_description": "A pair of brown leather lace-up footwear with metal eyelets..."}`
- `description_lower` contains "footwear" but correction logic checks for "boot" or "shoe" keywords
- Line 380 won't match because "footwear" might not be in the keywords list exactly
- Result: Stays as "upper_body"

**Root Cause Analysis**:
1. **Keyword Matching Too Restrictive**: The correction only checks if description contains exact keywords
2. **No Proactive Validation**: Only validates when category is "upper_body", not all categories
3. **Description Keywords**: The keywords might not match how OpenAI describes items

**Recommended Fix**:
1. **Always validate category** against description, regardless of initial category
2. **Improve keyword matching** to include more variations and synonyms
3. **Add fuzzy matching** for keywords (e.g., "footwear" → "shoe", "headwear" → "hat")
4. **Prioritize keyword matching**: Run keyword validation FIRST, then use OpenAI category as fallback
5. **Better logging**: Add detailed logs showing what keywords matched/didn't match

### Issue: Frontend Category Display

**Location**: `frontend/app/components/BulkUploadZone.tsx` line 376

**Current Code**:
```typescript
<p className="text-green-700 font-bold text-xs uppercase">
  ✓ {item.analysis?.category?.replace(/_/g, ' ') || 'Analyzed'}
</p>
```

**Potential Problems**:
1. If `item.analysis` is undefined or `category` is missing, it shows "Analyzed"
2. No validation that category is correct before display
3. Category might not be properly passed from SSE stream

**Investigation Needed**:
- Check if `item.analysis.category` actually contains the corrected category
- Add console logging to verify category value at display time
- Verify SSE stream is properly parsing category from backend response

### Issue: Description Aggregation

**Location**: `backend/services/analyze_clothing.py` lines 329-331

**Current Code**:
```python
description_lower = analysis.get("detailed_description", "").lower()
description_lower += " " + analysis.get("material", "").lower()
description_lower += " " + analysis.get("style", "").lower()
```

**Problem**: This only aggregates 3 fields. Missing:
- `item_type` field (if OpenAI returns it)
- `details` field (which might contain "lace-up", "zipper", etc.)
- Other descriptive fields

**Recommendation**: Aggregate ALL text fields from analysis for better keyword matching.

---

## 12. Debugging Recommendations

### Backend Logging

Add detailed logging to track classification:

```python
logger.info(f"Original OpenAI category: {category}")
logger.info(f"Description contains: {description_lower[:200]}")
logger.info(f"Shoes keywords found: {[k for k in shoes_keywords if k in description_lower]}")
logger.info(f"Lower body keywords found: {[k for k in lower_body_keywords if k in description_lower]}")
logger.info(f"Accessories keywords found: {[k for k in accessories_keywords if k in description_lower]}")
logger.info(f"Final category: {category}, Corrected: {corrected}")
```

### Frontend Logging

Add logging in `BulkUploadZone.tsx`:

```typescript
console.log('Item analysis received:', {
  index: item.index,
  category: item.analysis?.category,
  item_type: item.analysis?.item_type,
  description: item.analysis?.detailed_description?.substring(0, 100)
});
```

### Test Cases

Create test cases with known items:
1. **Boots image** → Should be "shoes", not "upper_body"
2. **Baseball cap image** → Should be "accessories", not "upper_body"  
3. **Cargo pants image** → Should be "lower_body", not "upper_body"
4. **Hoodie image** → Should be "outerwear" or "upper_body" (contextual)
5. **T-shirt image** → Should be "upper_body" (correct)

Verify:
- OpenAI initial classification
- Keyword matching results
- Final category after correction
- Frontend display value

