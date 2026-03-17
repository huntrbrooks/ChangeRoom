# How to Enable Generative AI API in Google Cloud Console

## Step-by-Step Instructions

### Step 1: Search for the Correct API

In the Google Cloud Console API Library:

1. **In the search box**, type exactly:
   ```
   Generative Language API
   ```
   OR
   ```
   generativelanguage
   ```

2. **Look for**: "Generative Language API" by Google
   - It should show: "The Generative Language API gives developers access to Google's large language models (LLMs) and generative AI features."

### Step 2: Enable the API

1. Click on **"Generative Language API"** from the search results
2. Click the big blue **"Enable"** button
3. Wait for it to enable (usually 10-30 seconds)

### Step 3: Verify It's Enabled

1. Go to: **APIs & Services** → **Enabled APIs**
2. You should see **"Generative Language API"** in the list
3. If you don't see it, go back and enable it again

### Step 4: Add Scopes to OAuth Consent Screen

1. Go to: **APIs & Services** → **OAuth consent screen**
2. Click **"Edit App"** (or "Configure Consent Screen" if first time)
3. Scroll down to the **"Scopes"** section
4. Click **"Add or Remove Scopes"**
5. In the search/filter box, type: `cloud-platform`
6. Check the box next to: `https://www.googleapis.com/auth/cloud-platform`
7. Click **"Update"**
8. Click **"Save and Continue"** through any remaining screens

### Step 5: Test the Script

After enabling the API and adding scopes, wait 1-2 minutes, then run:

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
python3 backend/get_oauth2_token.py
```

## Alternative: Direct API Link

If you can't find it in search, try this direct link (replace `YOUR_PROJECT_ID`):

```
https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=YOUR_PROJECT_ID
```

Or go to:
- **APIs & Services** → **Library**
- Filter by: **"Machine learning"** category
- Look for "Generative Language API"

## Troubleshooting

### If "Generative Language API" doesn't appear:

1. **Check your project**: Make sure you're in the correct Google Cloud project
2. **Check billing**: Some APIs require billing to be enabled (though Generative Language API has a free tier)
3. **Try alternative names**:
   - "Generative AI API"
   - "Gemini API"
   - "generativelanguage"

### If you still get invalid_scope error:

1. Make sure the API is actually enabled (check Enabled APIs list)
2. Make sure `cloud-platform` scope is added to OAuth consent screen
3. Wait 2-3 minutes after making changes
4. Try clearing browser cache and cookies for Google accounts

## Quick Checklist

- [ ] Found "Generative Language API" in API Library
- [ ] Clicked "Enable" button
- [ ] Verified it appears in "Enabled APIs" list
- [ ] Added `cloud-platform` scope to OAuth consent screen
- [ ] Saved all changes
- [ ] Waited 1-2 minutes for propagation
- [ ] Ran the token script again

