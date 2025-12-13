# Clerk Google OAuth Configuration

## Problem

You're seeing this error when trying to sign in with Google:
```
Access blocked: Authorization Error
Missing required parameter: client_id
Error 400: invalid_request
```

This happens when Google OAuth is enabled in Clerk, but the Google OAuth credentials (client_id and client_secret) are not properly configured.

## Solution Options

You have two options:

### Option 1: Configure Google OAuth Properly (Recommended if you want Google sign-in)

#### Step 1: Create Google OAuth Credentials

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create or Select a Project**:
   - Click on the project dropdown at the top
   - Create a new project or select an existing one

3. **Enable Google+ API** (if not already enabled):
   - Go to: https://console.cloud.google.com/apis/library
   - Search for "Google+ API" or "Google Identity Services"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials" → "OAuth client ID"
   - If prompted, configure the OAuth consent screen first:
     - User Type: External (or Internal if you have a Google Workspace)
     - App name: Your app name (e.g., "Change Room")
     - User support email: Your email
     - Developer contact: Your email
     - Click "Save and Continue"
     - Scopes: Keep defaults, click "Save and Continue"
     - Test users: Add your email if needed, click "Save and Continue"
     - Summary: Click "Back to Dashboard"

5. **Create OAuth Client ID**:
   - Application type: **Web application**
   - Name: "Change Room - Clerk"
   - Authorized JavaScript origins:
     - `https://your-domain.com` (your production domain)
     - `http://localhost:3000` (for local development)
   - Authorized redirect URIs:
     - `https://your-clerk-domain.clerk.accounts.dev/v1/oauth_callback`
     - Get this from Clerk Dashboard → User & Authentication → Social Connections → Google → Redirect URL
   - Click "Create"
   - **Copy the Client ID and Client Secret** (you'll need these for Clerk)

#### Step 2: Configure Google OAuth in Clerk Dashboard

1. **Go to Clerk Dashboard**: https://dashboard.clerk.com
2. **Navigate to**: Your Application → User & Authentication → Social Connections
3. **Find Google**:
   - Click on "Google" to expand the configuration
   - You'll see two options:
     - **Option A: Use Clerk's OAuth App** (Easiest - no setup needed)
     - **Option B: Use your own OAuth app** (More control)

4. **If using Option B (Your Own OAuth App)**:
   - Toggle "Use your own OAuth app" to ON
   - Paste your Google OAuth Client ID
   - Paste your Google OAuth Client Secret
   - Click "Save"

5. **Verify Configuration**:
   - Make sure Google is enabled (toggle should be ON)
   - Check that the redirect URI in Google Cloud Console matches what Clerk shows

#### Step 3: Test

1. Clear browser cache/cookies
2. Go to your sign-in page
3. Click "Continue with Google"
4. You should be redirected to Google's consent screen

### Option 2: Disable Google OAuth (If you don't need it)

If you don't need Google sign-in, you can disable it:

1. **Go to Clerk Dashboard**: https://dashboard.clerk.com
2. **Navigate to**: Your Application → User & Authentication → Social Connections
3. **Find Google**:
   - Toggle it to **OFF**
   - Click "Save"

4. **Use Email/Password Instead**:
   - Ensure Email authentication is enabled
   - Go to: User & Authentication → Email, Phone, Username
   - Enable "Email address" as a required identifier
   - Enable "Email code" or "Email + Password"

## Quick Fix for Right Now

**To get sign-in working immediately:**

1. Go to Clerk Dashboard: https://dashboard.clerk.com
2. Navigate to: User & Authentication → Social Connections
3. **Disable Google OAuth** (toggle OFF)
4. **Enable Email authentication** if not already enabled:
   - Go to: User & Authentication → Email, Phone, Username
   - Enable "Email address"
   - Enable "Email + Password" or "Email code"
5. Save changes
6. Try signing in again - you should see email/password option

## Troubleshooting

### Error persists after configuration:
- Clear browser cache and cookies
- Make sure redirect URIs match exactly (including http vs https)
- Verify Client ID and Secret are correct (no extra spaces)
- Check that Google+ API is enabled in Google Cloud Console

### Redirect URI mismatch:
- Copy the exact redirect URI from Clerk Dashboard → Social Connections → Google
- Paste it exactly into Google Cloud Console → OAuth 2.0 Credentials → Authorized redirect URIs

### Still having issues:
- Check Clerk Dashboard → User & Authentication → Social Connections for any error messages
- Verify your Google Cloud project has billing enabled (required for OAuth)
- Make sure you're using the correct Google account that owns the OAuth credentials

## Environment Variables

No additional environment variables are needed for Google OAuth when using Clerk. Clerk handles the OAuth flow internally. You only need:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

These are already configured if your middleware is working.










