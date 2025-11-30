# Runtime Testing Guide

This guide provides step-by-step instructions for runtime testing of the Change Room application.

## Test Results Summary

### Automated Tests
- ✅ **Backend Tests:** 13/13 passing
- ✅ **Frontend Tests:** 8/8 passing

## Prerequisites

1. **Backend Environment Setup**
   ```bash
   cd backend
   source venv/bin/activate  # or venv\Scripts\activate on Windows
   # Ensure GEMINI_API_KEY is set in .env or environment
   ```

2. **Frontend Environment Setup**
   ```bash
   cd frontend
   npm install
   # Ensure all required env vars are set in .env.local
   ```

## Backend API Testing

### 1. Start Backend Server

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server should start at `http://localhost:8000`

### 2. Test Root Endpoint

```bash
curl http://localhost:8000/
```

**Expected:** `{"message": "Change Room API is running"}`

### 3. Test Try-On Endpoint

**Test with missing user image:**
```bash
curl -X POST http://localhost:8000/api/try-on
```

**Expected:** 422 validation error

**Test with valid images:**
```bash
curl -X POST http://localhost:8000/api/try-on \
  -F "user_image=@path/to/person.jpg" \
  -F "clothing_images=@path/to/clothing1.jpg" \
  -F "clothing_images=@path/to/clothing2.jpg"
```

**Expected:** 200 with `{"image_url": "..."}`

**Test file size validation:**
```bash
# Create a large file (>10MB) and try to upload
dd if=/dev/zero of=large.jpg bs=1M count=11
curl -X POST http://localhost:8000/api/try-on \
  -F "user_image=@large.jpg" \
  -F "clothing_images=@path/to/clothing.jpg"
```

**Expected:** 413 error with size limit message

**Test file type validation:**
```bash
curl -X POST http://localhost:8000/api/try-on \
  -F "user_image=@document.pdf" \
  -F "clothing_images=@path/to/clothing.jpg"
```

**Expected:** 400 error with invalid file type message

### 4. Test Analyze Clothing Endpoint

**Test with no files:**
```bash
curl -X POST http://localhost:8000/api/analyze-clothing
```

**Expected:** 422 validation error

**Test with valid files:**
```bash
curl -X POST http://localhost:8000/api/analyze-clothing \
  -F "clothing_images=@item1.jpg" \
  -F "clothing_images=@item2.jpg" \
  -F "save_files=true"
```

**Expected:** Streaming response with progress updates

**Test with too many files (>5):**
```bash
curl -X POST http://localhost:8000/api/analyze-clothing \
  -F "clothing_images=@item1.jpg" \
  -F "clothing_images=@item2.jpg" \
  -F "clothing_images=@item3.jpg" \
  -F "clothing_images=@item4.jpg" \
  -F "clothing_images=@item5.jpg" \
  -F "clothing_images=@item6.jpg"
```

**Expected:** 400 error with "Maximum 5 clothing items allowed"

### 5. Test Preprocess Clothing Endpoint

**Test with valid files:**
```bash
curl -X POST http://localhost:8000/api/preprocess-clothing \
  -F "clothing_images=@item1.jpg" \
  -F "clothing_images=@item2.jpg"
```

**Expected:** 200 with JSON response containing processed items

### 6. Test Identify Products Endpoint

```bash
curl -X POST http://localhost:8000/api/identify-products \
  -F "clothing_image=@clothing.jpg"
```

**Expected:** 200 with product identification data

### 7. Test Shop Endpoint

```bash
curl -X POST http://localhost:8000/api/shop \
  -F "query=blue jeans" \
  -F "budget=50.00"
```

**Expected:** 200 with search results

### 8. Test CORS Configuration

```bash
curl -X OPTIONS http://localhost:8000/api/try-on \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**Expected:** CORS headers in response

## Frontend Application Testing

### 1. Start Frontend Server

```bash
cd frontend
npm run dev
```

Server should start at `http://localhost:3000`

### 2. Test Authentication Flow

1. Navigate to `http://localhost:3000`
2. Should redirect to sign-in page if not authenticated
3. Complete sign-in flow
4. Should redirect back to home page

### 3. Test Person Image Upload

1. On home page, click "Upload Person Image"
2. Select a valid image file (JPEG, PNG, WebP)
3. Verify image preview appears
4. Check browser console for errors

### 4. Test Clothing Item Upload

**Single Upload:**
1. Click "Upload Clothing Item"
2. Select a valid image
3. Verify upload and analysis

**Bulk Upload:**
1. Use bulk upload zone
2. Select 2-5 images
3. Verify all items are processed
4. Check progress indicators

**Test Limits:**
1. Try uploading 6+ items
2. Should show error or limit to 5

### 5. Test Virtual Try-On

1. Upload person image
2. Upload 1-5 clothing items
3. Click "Try On & Shop Look"
4. Verify:
   - Loading state appears
   - Try-on completes
   - Result image displays
   - Products appear (if search succeeds)

### 6. Test Error Handling

**No Credits:**
1. Use account with 0 credits
2. Attempt try-on
3. Should show paywall modal

**Invalid File Types:**
1. Try uploading PDF or other non-image
2. Should show error message

**Network Errors:**
1. Stop backend server
2. Attempt try-on
3. Should show appropriate error message

### 7. Test Billing Flow

1. Navigate to `/billing`
2. Verify current plan displays
3. Test subscription upgrade flow
4. Test credit pack purchase
5. Verify credits update after purchase

### 8. Test Responsive Design

1. Test on mobile viewport (< 768px)
2. Test on tablet viewport (768px - 1024px)
3. Test on desktop viewport (> 1024px)
4. Verify all features work on all sizes

## Integration Testing

### Full User Journey

1. **Sign In** → Verify authentication
2. **Upload Person Image** → Verify storage
3. **Upload Clothing Items** → Verify analysis and storage
4. **Generate Try-On** → Verify:
   - Credit deduction
   - Image generation
   - Result storage
   - Product search
5. **Save Result** → Verify result is saved
6. **View Wardrobe** → Verify items are listed
7. **Manage Billing** → Verify subscription management

### Database Operations

1. Verify credits are decremented correctly
2. Verify try-on sessions are recorded
3. Verify clothing items are stored with metadata
4. Verify person images are stored correctly

### Storage Operations

1. Verify files are uploaded to R2
2. Verify public URLs are generated
3. Verify files are accessible via public URLs
4. Verify file metadata is embedded

## Performance Testing

### Response Times

- **Try-On Generation:** Should complete within 2-5 minutes
- **Clothing Analysis:** Should complete within 30-60 seconds per item
- **Product Search:** Should complete within 5-10 seconds
- **Page Load:** Should load within 2-3 seconds

### Load Testing (Optional)

```bash
# Install Apache Bench or use similar tool
ab -n 100 -c 10 http://localhost:8000/
```

## Security Testing

### File Upload Security

1. **Size Limits:** Test with files > 10MB
2. **Type Validation:** Test with non-image files
3. **Path Traversal:** Test with malicious filenames
4. **Malicious Content:** Test with potentially harmful files

### Authentication Security

1. **Unauthorized Access:** Try accessing protected routes without auth
2. **User Scoping:** Verify users can't access other users' data
3. **Session Management:** Test session expiration

### CORS Testing

1. Test from allowed origin (should work)
2. Test from disallowed origin (should fail)
3. Verify credentials are handled correctly

## Checklist

### Backend API
- [ ] Root endpoint responds
- [ ] Try-on endpoint validates inputs
- [ ] Try-on endpoint processes valid requests
- [ ] File size validation works
- [ ] File type validation works
- [ ] Analyze clothing endpoint works
- [ ] Preprocess clothing endpoint works
- [ ] Identify products endpoint works
- [ ] Shop endpoint works
- [ ] CORS configuration works
- [ ] Error handling is appropriate

### Frontend Application
- [ ] Authentication flow works
- [ ] Person image upload works
- [ ] Clothing item upload works (single)
- [ ] Clothing item upload works (bulk)
- [ ] Virtual try-on works
- [ ] Error handling displays properly
- [ ] Billing flow works
- [ ] Responsive design works
- [ ] No console errors

### Integration
- [ ] Full user journey works
- [ ] Database operations work
- [ ] Storage operations work
- [ ] Credit system works
- [ ] Webhook processing works

## Troubleshooting

### Backend Won't Start
- Check Python version (3.10+)
- Check virtual environment is activated
- Check GEMINI_API_KEY is set
- Check port 8000 is available

### Frontend Won't Start
- Check Node.js version (18+)
- Run `npm install`
- Check all required env vars are set
- Check port 3000 is available

### API Errors
- Check backend is running
- Check CORS configuration
- Check API keys are valid
- Check network connectivity

### Test Failures
- Run `pytest -v` for detailed output
- Check test data files exist
- Verify environment setup

---

**Last Updated:** $(date)  
**Test Status:** Ready for execution

