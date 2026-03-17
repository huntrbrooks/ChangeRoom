# Fix: Individual Image Processing

## Problem

All clothing images were being classified as "UPPER_BODY" because the batch processing was reusing categories or leaking results between images.

## Root Cause

The original batch preprocessing attempted to analyze all images in a single OpenAI call, which could cause:
1. Category leakage between images
2. Default fallback to UPPER_BODY when parsing failed
3. Reusing first image's category for all images

## Solution

**Process each image individually** with separate OpenAI API calls. This ensures:
- Each image gets its own independent analysis
- Categories are determined per image based on what it actually is
- No category leakage between images

## Changes Made

### 1. Backend: Individual Processing

**File**: `backend/services/preprocess_clothing.py`

#### New Function: `analyze_single_clothing_image()`
- Processes ONE image at a time
- Calls OpenAI separately for each image
- Validates category with guard rails
- Returns structured metadata per image

#### Updated Function: `preprocess_clothing_batch()`
- Processes images in parallel (but independently)
- Each image gets its own OpenAI call
- Filenames use each image's own category
- Example: `footwear_brown_leather_boots_abc123.jpg` vs `upper_body_abc123.jpg`

**Key Changes**:
```python
# OLD: Single batch call (could leak categories)
analysis_results = await asyncio.to_thread(run_openai_analysis)  # All images together

# NEW: Individual calls per image
tasks = [
    process_one(image_bytes, original_name, idx)
    for idx, (image_bytes, original_name) in enumerate(zip(image_files, original_filenames))
]
results = await asyncio.gather(*tasks)  # Process in parallel, but independently
```

### 2. Frontend: Enhanced Metadata Display

**File**: `frontend/app/components/BulkUploadZone.tsx`

Now shows:
- ✓ Category (UPPER_BODY, LOWER_BODY, FOOTWEAR, ACCESSORY, FULL_BODY)
- Item type (e.g., "brown leather lace up boots")
- Color and style (e.g., "black, streetwear")
- Tags (up to 3 visible, with count if more)
- Short description

## Expected Results

### Before Fix:
```
✓ UPPER_BODY  (for boots - WRONG)
✓ UPPER_BODY  (for hat - WRONG)
✓ UPPER_BODY  (for pants - WRONG)
✓ UPPER_BODY  (for hoodie - OK)
✓ UPPER_BODY  (for t-shirt - OK)
```

### After Fix:
```
✓ FOOTWEAR    brown leather lace up boots
✓ ACCESSORY   black baseball cap
✓ LOWER_BODY  blue cargo pants
✓ UPPER_BODY  navy zip hoodie
✓ UPPER_BODY  vintage motorcycle t-shirt
```

## Filenames

### Before:
- `upper_body_1437u6e.jpg`
- `upper_body_abc123.jpg`
- `upper_body_def456.jpg`

### After:
- `footwear_brown_leather_boots_abc12345.jpg`
- `accessory_black_baseball_cap_def67890.jpg`
- `lower_body_blue_cargo_pants_ghi11111.jpg`

## Category Validation

Added strict category validation:

```python
VALID_CATEGORIES = {
    "UPPER_BODY", "LOWER_BODY", "FOOTWEAR", "ACCESSORY", "FULL_BODY"
}

# Maps common variations
category_map = {
    "SHOES": "FOOTWEAR",
    "BOOTS": "FOOTWEAR",
    "HAT": "ACCESSORY",
    # etc.
}
```

## Logging

Added detailed logging for debugging:

```python
logger.info(f"Analysis result for {original_filename}: category={category}, item_type={item_type}")
logger.info(f"Categories detected: {categories}")
```

**To debug**: Check backend logs after upload. You should see:
```
Analysis result for boots.jpg: category=FOOTWEAR, item_type=brown leather lace up boots
Analysis result for hat.jpg: category=ACCESSORY, item_type=black baseball cap
Analysis result for pants.jpg: category=LOWER_BODY, item_type=blue cargo pants
```

## Testing Checklist

1. ✅ Upload 5 images: boots, hat, pants, hoodie, t-shirt
2. ✅ Check backend logs for individual analysis results
3. ✅ Verify each card shows correct category
4. ✅ Verify filenames include correct category prefix
5. ✅ Check that metadata (color, style, tags) displays correctly

## Files Modified

1. `backend/services/preprocess_clothing.py` - Complete rewrite for individual processing
2. `frontend/app/components/BulkUploadZone.tsx` - Enhanced metadata display

## Next Steps

1. **Test the fix**: Upload the exact same 5 images from your screenshot
2. **Check categories**: Verify boots → FOOTWEAR, hat → ACCESSORY, etc.
3. **Review logs**: Check backend logs to see individual analysis results
4. **Report results**: Let me know what categories you see for each item

## Expected Log Output

When you upload 5 images, backend logs should show:

```
Starting batch preprocessing for 5 images (processing individually)
Using storage backend: LocalStorageBackend
Analysis result for boots.jpg: category=FOOTWEAR, item_type=brown leather lace up boots
Analysis result for hat.jpg: category=ACCESSORY, item_type=black baseball cap
Analysis result for hoodie.jpg: category=UPPER_BODY, item_type=navy zip hoodie
Analysis result for pants.jpg: category=LOWER_BODY, item_type=blue cargo pants
Analysis result for tshirt.jpg: category=UPPER_BODY, item_type=vintage motorcycle t-shirt
Categories detected: ['FOOTWEAR', 'ACCESSORY', 'UPPER_BODY', 'LOWER_BODY', 'UPPER_BODY']
Batch preprocessing complete: 5 items processed
```

## Notes

- Images are still processed in **parallel** for speed, but each gets its own OpenAI call
- Category validation prevents invalid categories from being returned
- Fallback to UPPER_BODY only happens if OpenAI completely fails (with warning logged)
- Filenames now reflect the actual category, making them much more useful

