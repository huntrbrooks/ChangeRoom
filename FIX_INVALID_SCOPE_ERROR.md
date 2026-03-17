# Fix "Error 400: invalid_scope" for Google OAuth2

## The Problem
You're seeing: **Error 400: invalid_scope**

This happens when:
1. The Generative AI API is not enabled in your Google Cloud project
2. The scopes are not added to your OAuth consent screen
3. The scopes are not available for your OAuth client type

## Solution 1: Enable Generative AI API (Recommended)

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project

2. **Enable Generative AI API**
   - Go to: **APIs & Services** → **Library**
   - Search for: **"Generative Language API"** or **"Generative AI API"**
   - Click on it and click **"Enable"**
   - Wait for it to enable (usually takes 1-2 minutes)

3. **Add Scopes to OAuth Consent Screen**
   - Go to: **APIs & Services** → **OAuth consent screen**
   - Click **"Edit App"** or **"Configure Consent Screen"**
   - Scroll down to **"Scopes"** section
   - Click **"Add or Remove Scopes"**
   - In the filter/search box, search for:
     - `https://www.googleapis.com/auth/generative-language`
     - `https://www.googleapis.com/auth/cloud-platform`
   - Check both scopes and click **"Update"**
   - Click **"Save and Continue"** through the rest of the screens

4. **Try the script again**
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   python3 backend/get_oauth2_token.py
   ```

## Solution 2: Use Cloud Platform Scope Only (Simpler)

The script has been updated to use only `cloud-platform` scope first, which is broader and usually works without enabling specific APIs.

If you still get errors, try:

1. **Update the script** to use only cloud-platform scope (already done)
2. **Add cloud-platform scope** to OAuth consent screen:
   - Go to: **APIs & Services** → **OAuth consent screen**
   - Click **"Edit App"**
   - Under **"Scopes"**, click **"Add or Remove Scopes"**
   - Search for: `cloud-platform`
   - Check it and click **"Update"**
   - Save

## Solution 3: Use API Key Instead (Quick Workaround)

If OAuth2 continues to be problematic, you can use API key authentication for now:

1. **Get API Key**
   - Go to: **APIs & Services** → **Credentials**
   - Click **"Create Credentials"** → **"API Key"**
   - Copy the API key

2. **Set Environment Variable**
   ```env
   GOOGLE_API_KEY=your-api-key-here
   ```

3. **Note**: API keys work with the older `google-generativeai` SDK but may not work for image generation with the new SDK. OAuth2 is still recommended for full functionality.

## Quick Checklist

- [ ] Generative AI API is enabled in Google Cloud Console
- [ ] OAuth consent screen is configured
- [ ] Scopes are added to OAuth consent screen:
  - [ ] `https://www.googleapis.com/auth/cloud-platform`
  - [ ] `https://www.googleapis.com/auth/generative-language` (optional)
- [ ] Redirect URIs are added to OAuth client
- [ ] OAuth client is set up as "Desktop app" or "Web application"

## Visual Guide: Adding Scopes

In Google Cloud Console → OAuth consent screen → Scopes:

```
┌─────────────────────────────────────────┐
│ Scopes                                  │
├─────────────────────────────────────────┤
│ [Search box: "cloud-platform"]         │
│                                         │
│ ☑ https://www.googleapis.com/auth/     │
│   cloud-platform                        │
│                                         │
│ ☐ https://www.googleapis.com/auth/    │
│   generative-language                   │
│                                         │
│ [Update] [Cancel]                      │
└─────────────────────────────────────────┘
```

After adding scopes, make sure to:
1. Click **"Update"**
2. Click **"Save and Continue"** through all screens
3. Wait 1-2 minutes for changes to propagate

## Still Having Issues?

If you continue to get `invalid_scope` errors:

1. **Check OAuth Client Type**: Make sure your OAuth client is set up as "Desktop app" or "Web application" (not "iOS" or "Android")

2. **Verify Project**: Make sure you're using the OAuth client from the same Google Cloud project where you enabled the API

3. **Try Minimal Scope**: The script now uses only `cloud-platform` which should work. If it still fails, the API might not be enabled.

4. **Check API Status**: Go to **APIs & Services** → **Enabled APIs** and verify "Generative Language API" is listed

