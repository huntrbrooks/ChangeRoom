# Code Review Report: Gemini API Key Approach Alignment

**Date:** Generated automatically  
**Scope:** Complete codebase review for Gemini API Key authentication consistency

---

## Executive Summary

The codebase has been partially migrated to use direct REST API calls with API key authentication, but several files still use the old SDK approach or contain dead code. This report identifies all inconsistencies and provides recommendations.

---

## ✅ What's Working Well

1. **`backend/services/vton.py`** - The main virtual try-on function (`_generate_with_gemini`) correctly uses direct REST API calls with `httpx` and API key authentication.

2. **API Key Support** - The code properly checks for both `GEMINI_API_KEY` and `GOOGLE_API_KEY` environment variables.

3. **Error Handling** - Good fallback model logic and error handling in the REST implementation.

---

## ❌ Critical Issues

### 1. **`backend/services/gemini.py` - Still Using Old SDK**

**Status:** 🔴 **CRITICAL - Needs Immediate Fix**

**Issue:** This file still uses `google.generativeai` SDK instead of direct REST API calls.

**Current Code:**
```python
import google.generativeai as genai
# ...
genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-flash')
response = model.generate_content([prompt, image])
```

**Problem:**
- Uses SDK which may have OAuth2 dependencies
- Not consistent with the new API key approach
- Could fail if SDK tries to use OAuth2 instead of API key

**Recommendation:**
- Convert to direct REST API calls using `httpx` (similar to `vton.py`)
- Use endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`
- Send images as base64 `inline_data` in the request

**Impact:** High - This is actively used by `/api/identify-products` endpoint

---

### 2. **`backend/services/vton.py` - Dead Code (OAuth2 Functions)**

**Status:** 🟡 **MEDIUM - Should Clean Up**

**Issue:** The file contains ~180 lines of unused OAuth2 authentication code that is never called.

**Dead Code Sections:**
- Lines 12-46: SDK imports and OAuth2 imports (unused)
- Lines 48-103: `_get_oauth2_credentials()` function (never called)
- Lines 105-227: `_get_genai_client()` function (never called)
- Lines 40-46: OAuth2 scopes definition (unused)

**Current State:**
- The actual implementation (`_generate_with_gemini`) correctly uses REST API calls
- All OAuth2 code is legacy and not referenced

**Recommendation:**
- Remove all OAuth2-related code
- Remove unused SDK imports
- Keep only the REST API implementation
- This will reduce file size by ~40% and eliminate confusion

**Impact:** Medium - Doesn't break functionality but adds maintenance burden

---

### 3. **Environment Variable Naming Inconsistency**

**Status:** 🟡 **MEDIUM - Should Standardize**

**Issue:** Mixed usage of `GEMINI_API_KEY` vs `GOOGLE_API_KEY`

**Current State:**
- `vton.py`: Checks `GEMINI_API_KEY` first, then `GOOGLE_API_KEY` ✅
- `gemini.py`: Only checks `GOOGLE_API_KEY` ❌
- `main.py`: Error messages reference `GOOGLE_API_KEY` only

**Recommendation:**
- Standardize on `GEMINI_API_KEY` as primary (more specific)
- Keep `GOOGLE_API_KEY` as fallback for backward compatibility
- Update all files to use the same pattern:
  ```python
  api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
  ```

**Impact:** Medium - Could cause confusion during deployment

---

### 4. **`backend/main.py` - Outdated Error Messages**

**Status:** 🟡 **MEDIUM - Should Update**

**Issue:** Error messages reference old SDK dependencies

**Current Code (line 174-177):**
```python
if "ImportError" in str(type(e)) or "google-genai" in error_detail:
    error_detail = f"Missing dependency: {error_detail}. Ensure google-genai is installed on Render."
elif "GOOGLE_API_KEY" in error_detail:
    error_detail = "Google API key not configured. Set GOOGLE_API_KEY environment variable."
```

**Problems:**
- References `google-genai` SDK which is no longer required
- Should mention `GEMINI_API_KEY` as primary
- Error message is misleading

**Recommendation:**
```python
if "GEMINI_API_KEY" in error_detail or "GOOGLE_API_KEY" in error_detail:
    error_detail = "Gemini API key not configured. Set GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable."
```

**Impact:** Low - Only affects error messages, not functionality

---

### 5. **`backend/requirements.txt` - Unnecessary Dependencies**

**Status:** 🟡 **MEDIUM - Should Clean Up**

**Issue:** Contains OAuth2 dependencies that are no longer needed

**Current Dependencies:**
```
google-generativeai  # Used by gemini.py (should be removed after migration)
google-genai         # Not used anywhere (dead dependency)
google-auth          # OAuth2 - not needed
google-auth-oauthlib # OAuth2 - not needed
google-auth-httplib2 # OAuth2 - not needed
```

**Recommendation:**
- Keep `google-generativeai` temporarily until `gemini.py` is migrated
- Remove `google-genai` (not used)
- Remove all OAuth2 packages after cleaning up `vton.py`
- Add comment explaining why `google-generativeai` is kept temporarily

**Impact:** Low - Increases deployment size but doesn't break functionality

---

## 📋 Detailed File-by-File Analysis

### `backend/services/vton.py`

**Status:** ✅ **GOOD** (with cleanup needed)

**What's Good:**
- `_generate_with_gemini()` correctly uses REST API with `httpx`
- Proper API key authentication via query parameter
- Good error handling and model fallbacks
- Supports multiple images correctly

**What Needs Fix:**
- Remove lines 12-227 (all OAuth2 and SDK code)
- Remove unused imports
- Add comment explaining REST API approach

**Lines to Keep:**
- Lines 1-11: Core imports (keep `httpx`, remove SDK imports)
- Lines 229-549: Main implementation (all good)

---

### `backend/services/gemini.py`

**Status:** 🔴 **NEEDS MIGRATION**

**Current Approach:** SDK-based (`google.generativeai`)

**Required Changes:**
1. Replace SDK with `httpx` REST calls
2. Convert image to base64 `inline_data`
3. Use endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`
4. Update environment variable check to match `vton.py`

**Example Migration Pattern:**
```python
# OLD (SDK):
genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-flash')
response = model.generate_content([prompt, image])

# NEW (REST):
async with httpx.AsyncClient(timeout=60.0) as client:
    response = await client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}",
        headers={"Content-Type": "application/json"},
        json={
            "contents": [{
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": image_base64
                        }
                    }
                ]
            }]
        }
    )
```

---

### `backend/main.py`

**Status:** ✅ **GOOD** (minor improvements needed)

**What's Good:**
- Correctly calls async functions
- Good error handling structure

**What Needs Fix:**
- Update error messages (line 174-177)
- Consider adding `GEMINI_API_KEY` to error message

---

### `backend/requirements.txt`

**Status:** 🟡 **NEEDS CLEANUP**

**Action Items:**
1. Remove `google-genai` (unused)
2. Keep `google-generativeai` temporarily (used by `gemini.py`)
3. Remove OAuth2 packages after `vton.py` cleanup
4. Ensure `httpx` is present (already added ✅)

---

## 🔧 Recommended Action Plan

### Phase 1: Critical Fixes (Do First)
1. ✅ **Migrate `gemini.py` to REST API** - High priority, actively used
2. ✅ **Update environment variable checks** - Standardize on `GEMINI_API_KEY`

### Phase 2: Cleanup (Do After Phase 1)
3. ✅ **Remove dead code from `vton.py`** - Remove OAuth2 functions
4. ✅ **Update error messages in `main.py`** - Better user experience
5. ✅ **Clean up `requirements.txt`** - Remove unused dependencies

### Phase 3: Documentation (Optional)
6. ✅ **Update README** - Document API key setup
7. ✅ **Add inline comments** - Explain REST API approach

---

## 📊 Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| Files Using REST API | 1 | ✅ `vton.py` |
| Files Using Old SDK | 1 | 🔴 `gemini.py` |
| Files with Dead Code | 1 | 🟡 `vton.py` |
| Environment Variables | 2 | 🟡 Mixed usage |
| Unused Dependencies | 5 | 🟡 OAuth2 packages |

---

## ✅ Verification Checklist

After implementing fixes, verify:

- [ ] `gemini.py` uses `httpx` for REST calls
- [ ] All files check `GEMINI_API_KEY` first
- [ ] `vton.py` has no OAuth2 code
- [ ] `requirements.txt` has no OAuth2 packages
- [ ] Error messages mention `GEMINI_API_KEY`
- [ ] All tests pass with API key only
- [ ] No SDK imports in production code paths

---

## 🎯 Expected Outcome

After all fixes:
- ✅ 100% REST API approach (no SDKs)
- ✅ Consistent environment variable usage
- ✅ Cleaner, more maintainable codebase
- ✅ Smaller deployment size (fewer dependencies)
- ✅ No OAuth2 complexity

---

## 📝 Notes

- The `get_oauth2_token.py` file can be removed or archived - it's no longer needed
- Consider adding a `.env.example` file documenting `GEMINI_API_KEY`
- The `backend/backend/main.py` file appears to be a duplicate - should be reviewed

---

**Report Generated:** Automatically  
**Next Steps:** Implement Phase 1 fixes, then proceed with cleanup phases

