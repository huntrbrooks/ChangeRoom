# Debugging Category Classification Issue

## Issues Fixed

### 1. **Overly Aggressive Default to UPPER_BODY**
- **Fixed**: Improved category validation to try keyword inference before defaulting
- **Fixed**: Better error handling with filename-based inference
- **Fixed**: Added comprehensive logging to track category decisions

### 2. **Empty Category Handling**
- **Fixed**: Handles empty categories from OpenAI by inferring from item_type/description
- **Fixed**: Falls back to filename analysis if OpenAI fails

### 3. **Category Mapping**
- **Fixed**: Expanded category mapping to handle more variations
- **Fixed**: Added case-insensitive matching

## Debugging Steps

### Step 1: Check Which Endpoint is Being Used

**Frontend**: Check browser Network tab when uploading images
- Should call: `/api/preprocess-clothing`
- If it's calling `/api/analyze-clothing` instead, that's the old endpoint

**To verify**: Open browser DevTools → Network → Upload images → Look for the API call

### Step 2: Check Backend Logs

After uploading, check backend logs for:

```
Starting batch preprocessing for X images (processing individually)
OpenAI raw response for boots.jpg: category='FOOTWEAR', item_type='brown leather lace up boots'
Final category for boots.jpg: FOOTWEAR, item_type=brown leather lace up boots
Item 0 category: FOOTWEAR
```

**What to look for**:
- ✅ Each image processed individually
- ✅ OpenAI returns a category for each image
- ✅ Final category matches expected value (FOOTWEAR, ACCESSORY, etc.)
- ❌ If all show "UPPER_BODY", check OpenAI responses

### Step 3: Check OpenAI Responses

The logs will show:
```
OpenAI raw response for boots.jpg: category='FOOTWEAR', item_type='brown leather lace up boots'
```

**If OpenAI is returning wrong categories**:
- Check the prompt in `analyze_single_clothing_image()`
- Verify OpenAI API key is set correctly
- Check OpenAI API quota/rate limits

### Step 4: Check Frontend Response Mapping

Frontend expects category in:
- `item.analysis?.category` OR
- `item.category`

Both are provided in the response, but check browser console for:
```javascript
console.log('Batch preprocessing complete. All items:', allAnalyses);
```

Look at each item's `analysis.category` value.

## Common Issues

### Issue 1: All Categories are UPPER_BODY

**Possible Causes**:
1. OpenAI is returning empty/invalid categories
   - **Check**: Backend logs show empty or invalid category
   - **Fix**: Improved inference logic should catch this now

2. Frontend is using old endpoint
   - **Check**: Network tab shows `/api/analyze-clothing` instead of `/api/preprocess-clothing`
   - **Fix**: Update BulkUploadZone to use correct endpoint

3. Response structure mismatch
   - **Check**: Frontend console shows category as undefined
   - **Fix**: Response structure now includes category in both places

### Issue 2: Categories Don't Match Expected

**Possible Causes**:
1. OpenAI misclassifying items
   - **Check**: Backend logs show OpenAI returned wrong category
   - **Fix**: Improved prompt and validation logic

2. Category validation too strict
   - **Check**: Logs show "Invalid category" warnings
   - **Fix**: Added keyword-based inference before defaulting

## Verification Checklist

After fixes, verify:

- [ ] Backend logs show individual processing for each image
- [ ] Backend logs show correct categories (FOOTWEAR, ACCESSORY, etc.)
- [ ] Frontend displays correct categories on cards
- [ ] Filenames include correct category prefix (e.g., `footwear_brown_leather_boots_*.jpg`)

## Test Images

Test with these known items:
1. **Boots** → Should be `FOOTWEAR`
2. **Baseball Cap** → Should be `ACCESSORY`
3. **Cargo Pants** → Should be `LOWER_BODY`
4. **Hoodie** → Should be `UPPER_BODY`
5. **T-shirt** → Should be `UPPER_BODY`

## Additional Logging

The code now includes:
- Raw OpenAI response logging
- Category inference logging
- Final category logging
- Per-item category logging in endpoint response

Check backend logs after upload to see the full flow.

