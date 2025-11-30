# Category Classification Fix - Complete Implementation

## Problem

AI was misclassifying items:
- Hoodie → LOWER_BODY (should be UPPER_BODY)
- T-shirt → SHOES (should be UPPER_BODY)
- All items defaulting to UPPER_BODY

## Solution: Two-Layer Approach

### Layer 1: Better OpenAI Prompt
- More explicit category definitions
- Clear examples of what NOT to classify as each category
- Uses `body_region` field for clarity
- Strict JSON schema

### Layer 2: Rule-Based Correction Layer
- Keyword-based validation that overrides model mistakes
- Uses item_type and description text to force correct classification
- Boots → always SHOES (never pants)
- T-shirts → always UPPER_BODY (never shoes)

## Changes Made

### 1. Backend: Improved Prompt

**File**: `backend/services/preprocess_clothing.py`

**New System Prompt**:
```
You are a fashion classifier for a virtual try-on app.
There is exactly ONE primary clothing item in each image.

Allowed body_region values:
  - UPPER_BODY  (t shirts, shirts, hoodies, jumpers, jackets, coats, tops)
  - LOWER_BODY  (jeans, trousers, pants, shorts, skirts, leggings)
  - SHOES       (shoes, boots, sneakers, heels, sandals, trainers, loafers)
  - ACCESSORIES (hats, caps, beanies, belts, scarves, bags, backpacks, ties)
  - FULL_BODY   (dresses, jumpsuits, overalls)

Never label shirts, t shirts, hoodies or jackets as LOWER_BODY or SHOES.
Never label jeans, pants, or skirts as SHOES.
Boots, sneakers and heels are always SHOES.
```

### 2. Backend: Rule-Based Correction

**New Function**: `normalize_clothing_classification()`

**How it works**:
1. Gets `body_region` from OpenAI response
2. Checks `item_type` and `short_description` for keywords
3. **Forces correct classification** if keywords found:
   - "boot", "shoe", "sneaker" → **SHOES** (overrides wrong category)
   - "jean", "pant", "trouser" → **LOWER_BODY** (overrides wrong category)
   - "t shirt", "hoodie", "shirt" → **UPPER_BODY** (overrides wrong category)
   - "hat", "cap", "bag" → **ACCESSORIES** (overrides wrong category)

**Example**:
- OpenAI says: `{"body_region": "LOWER_BODY", "item_type": "navy zip hoodie"}`
- Rule layer sees "hoodie" keyword → **Forces to UPPER_BODY**
- Result: Correct classification

### 3. Response Structure

**New fields**:
- `body_region`: Primary field (UPPER_BODY, LOWER_BODY, SHOES, ACCESSORIES, FULL_BODY)
- `category`: Alias for backward compatibility
- `item_type`: Specific type from OpenAI (e.g., "brown leather boots")

**Example Response**:
```json
{
  "body_region": "SHOES",
  "category": "SHOES",
  "item_type": "brown leather lace up boots",
  "color": "brown",
  "style": "casual workwear",
  "tags": ["boots", "leather", "lace-up"],
  "short_description": "Brown leather work boots with metal eyelets",
  "suggested_filename": "brown_leather_boots"
}
```

### 4. Frontend: Display Update

**File**: `frontend/app/components/BulkUploadZone.tsx`

**Display now shows**:
- ✓ Body region (SHOES, UPPER_BODY, etc.)
- Item type ("brown leather boots")
- Color and style
- Tags
- Short description

## How It Works

### Flow

1. **User uploads images** → Frontend sends to `/api/preprocess-clothing`

2. **Backend processes each image individually**:
   - Calls OpenAI with improved prompt
   - Gets response with `body_region` and `item_type`

3. **Rule-based correction**:
   - Checks keywords in `item_type` and `description`
   - **Overrides** `body_region` if keywords indicate wrong classification
   - Logs corrections for debugging

4. **Save and return**:
   - Filename: `{body_region}_{item_type}_{uuid}.jpg`
   - Example: `shoes_brown_leather_boots_abc12345.jpg`

5. **Frontend displays**:
   - Shows `body_region` as category
   - Shows `item_type` as description

## Keyword Rules

### SHOES (Strongest)
Keywords: boot, boots, shoe, shoes, sneaker, sneakers, trainer, trainers, heel, heels, sandal, sandals, loafer, loafers, footwear, lace-up, sole

**Forces**: Any item with these keywords → **SHOES** (even if model says something else)

### LOWER_BODY
Keywords: jean, jeans, trouser, trousers, pant, pants, chino, shorts, skirt, skirts, leggings, cargo, waistband

**Forces**: Any item with these keywords → **LOWER_BODY**

### UPPER_BODY
Keywords: t shirt, t-shirt, tshirt, tee, shirt, shirts, blouse, top, hoodie, hoodies, sweatshirt, jumper, sweater, jacket, jackets, coat, coats

**Forces**: Any item with these keywords → **UPPER_BODY**

### ACCESSORIES
Keywords: hat, hats, cap, caps, beanie, bag, bags, backpack, belt, belts, scarf, scarves, tie, ties

**Forces**: Any item with these keywords → **ACCESSORIES**

### FULL_BODY
Keywords: dress, dresses, jumpsuit, jumpsuits, playsuit, overall, overalls, romper

**Forces**: Any item with these keywords → **FULL_BODY**

## Expected Results

After fixes, test with same 5 images:

| Image | Expected body_region | Expected item_type |
|-------|---------------------|-------------------|
| Brown boots | **SHOES** | "brown leather boots" |
| Black baseball cap | **ACCESSORIES** | "black baseball cap" |
| Blue hoodie | **UPPER_BODY** | "blue hoodie" or "navy zip hoodie" |
| Black cargo pants | **LOWER_BODY** | "black cargo pants" |
| Beige t-shirt | **UPPER_BODY** | "beige t-shirt" or "vintage t-shirt" |

## Debugging

### Check Backend Logs

After upload, look for:

```
OpenAI analysis for boots.jpg: body_region=SHOES, item_type='brown leather boots'
Keyword correction: forced body_region to SHOES based on text: 'brown leather boots...'
Final analysis for boots.jpg: body_region=SHOES, item_type='brown leather boots'
Item 0 body_region: SHOES
```

**What to check**:
1. Does OpenAI return correct body_region?
2. Did keyword correction override anything?
3. What's the final body_region in the response?

### Test Cases

Upload these and verify:
1. **Boots** → Should show "✓ SHOES"
2. **Hat** → Should show "✓ ACCESSORIES"
3. **Hoodie** → Should show "✓ UPPER BODY"
4. **Pants** → Should show "✓ LOWER BODY"
5. **T-shirt** → Should show "✓ UPPER BODY"

## Files Modified

1. `backend/services/preprocess_clothing.py`
   - Added `normalize_clothing_classification()` function
   - Improved OpenAI prompt
   - Updated to use `body_region`
   - Added keyword-based correction

2. `backend/main.py`
   - Updated logging to show body_region

3. `frontend/app/components/BulkUploadZone.tsx`
   - Updated to use `body_region` in display
   - Added fallback to `category` for backward compatibility

## Key Improvements

### Before:
- Model could misclassify → No correction → Wrong category shown
- Hoodie → LOWER_BODY ❌
- T-shirt → SHOES ❌

### After:
- Model might misclassify → Rule layer corrects → Correct category shown
- Hoodie → Rule sees "hoodie" → **Forces UPPER_BODY** ✅
- T-shirt → Rule sees "t shirt" → **Forces UPPER_BODY** ✅
- Boots → Rule sees "boot" → **Forces SHOES** ✅

## Next Steps

1. **Test with the 5 images again**
2. **Check backend logs** for keyword corrections
3. **Verify categories** match expected values
4. **If still wrong**, check logs and share:
   - Raw OpenAI response (body_region and item_type)
   - What keyword correction did (if any)
   - Final body_region in response

The two-layer approach should now catch and correct misclassifications automatically!

