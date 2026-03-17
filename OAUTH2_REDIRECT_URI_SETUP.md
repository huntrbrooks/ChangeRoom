# Fix OAuth2 Redirect URI Mismatch Error

## The Problem
You're seeing: **Error 400: redirect_uri_mismatch**

This happens when the redirect URI in your OAuth2 request doesn't match what's configured in Google Cloud Console.

## Solution: Add Redirect URIs to Google Cloud Console

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project

2. **Navigate to OAuth2 Credentials**
   - Go to: **APIs & Services** → **Credentials**
   - Find your OAuth 2.0 Client ID (the one ending in `.apps.googleusercontent.com`)
   - Click on it to edit

3. **Add Authorized Redirect URIs**
   Click **"Add URI"** and add these one by one:
   ```
   http://localhost:8080
   http://localhost:8080/
   http://127.0.0.1:8080
   http://127.0.0.1:8080/
   urn:ietf:wg:oauth:2.0:oob
   ```

4. **Save Changes**
   - Click **"Save"** at the bottom

5. **Wait a few minutes**
   - Google sometimes takes 1-2 minutes to propagate changes

6. **Run the script again**
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   python3 backend/get_oauth2_token.py
   ```

## Alternative: Use Out-of-Band (OOB) Flow

If you continue having issues, you can use the OOB flow which doesn't require a redirect URI:

1. In Google Cloud Console, add this redirect URI:
   ```
   urn:ietf:wg:oauth:2.0:oob
   ```

2. The script will display a URL in the terminal
3. Copy and paste it into your browser
4. Authorize the app
5. Copy the authorization code from the browser
6. Paste it back into the terminal

## Quick Visual Guide

In Google Cloud Console → Credentials → Your OAuth Client:

```
┌─────────────────────────────────────────┐
│ Authorized redirect URIs                │
├─────────────────────────────────────────┤
│ http://localhost:8080          [Remove] │
│ http://localhost:8080/          [Remove] │
│ http://127.0.0.1:8080           [Remove] │
│ http://127.0.0.1:8080/          [Remove] │
│ urn:ietf:wg:oauth:2.0:oob       [Remove] │
│                                         │
│ [+ ADD URI]                             │
└─────────────────────────────────────────┘
```

## After Getting the Refresh Token

Once you have the refresh token, add it to your environment variables:

**For local development (.env file):**
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=<your-refresh-token-here>
```

**For Render deployment:**
1. Go to Render Dashboard → Your Service → Environment
2. Add these environment variables:
   - `GOOGLE_CLIENT_ID` = `your-client-id.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET` = `your-client-secret`
   - `GOOGLE_REFRESH_TOKEN` = `<your-refresh-token-here>`
3. Save and redeploy

