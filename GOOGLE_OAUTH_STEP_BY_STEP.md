# Step-by-Step: Getting Google OAuth Client ID and Secret

## What You Need to Fill In

In the Clerk dashboard, you need to fill in:
1. **Client ID** - From Google Cloud Console
2. **Client Secret** - From Google Cloud Console
3. **Authorized Redirect URI** - Already filled in (should be: `https://clerk.igetdressed.online/v1/oauth_callback`)

## Step-by-Step Instructions

### Step 1: Go to Google Cloud Console

1. Open: https://console.cloud.google.com/
2. Sign in with your Google account (gerard.grenville@gmail.com)

### Step 2: Create or Select a Project

1. Click the project dropdown at the top (it might say "Select a project" or show a project name)
2. If you don't have a project yet:
   - Click "New Project"
   - Project name: "Change Room" (or any name you like)
   - Click "Create"
   - Wait a few seconds for it to be created
3. Select your project from the dropdown

### Step 3: Configure OAuth Consent Screen

Before creating OAuth credentials, you need to configure the consent screen:

1. In the left sidebar, go to: **APIs & Services** → **OAuth consent screen**
   - Or go directly: https://console.cloud.google.com/apis/credentials/consent

2. Select user type:
   - Choose **External** (unless you have Google Workspace)
   - Click "Create"

3. Fill in the OAuth consent screen:
   - **App name**: `Change Room` (or your app name)
   - **User support email**: Select your email (gerard.grenville@gmail.com)
   - **App logo**: (optional, skip for now)
   - **Application home page**: `https://igetdressed.online` (or your domain)
   - **Application privacy policy link**: (optional, skip for now)
   - **Application terms of service link**: (optional, skip for now)
   - **Authorized domains**: (optional, skip for now)
   - **Developer contact information**: Your email (gerard.grenville@gmail.com)
   - Click **Save and Continue**

4. Scopes (Step 2):
   - You can keep the default scopes
   - Click **Save and Continue**

5. Test users (Step 3):
   - If you're in "Testing" mode, add test users:
     - Click "Add Users"
     - Add: `gerard.grenville@gmail.com`
     - Click "Add"
   - Click **Save and Continue**

6. Summary:
   - Review the information
   - Click **Back to Dashboard**

### Step 4: Enable Google+ API (if needed)

1. Go to: **APIs & Services** → **Library**
   - Or directly: https://console.cloud.google.com/apis/library

2. Search for: `Google+ API` or `Google Identity Services`

3. Click on it and click **Enable** (if not already enabled)

### Step 5: Create OAuth 2.0 Client ID

1. Go to: **APIs & Services** → **Credentials**
   - Or directly: https://console.cloud.google.com/apis/credentials

2. Click the **+ CREATE CREDENTIALS** button at the top

3. Select **OAuth client ID**

4. If you see "OAuth consent screen is not configured", click the link and complete Step 3 above first

5. Configure the OAuth client:
   - **Application type**: Select **Web application**
   - **Name**: `Change Room - Clerk` (or any descriptive name)

6. **Authorized JavaScript origins**:
   - Click **+ ADD URI**
   - Add: `https://igetdressed.online` (your production domain)
   - Click **+ ADD URI** again
   - Add: `http://localhost:3000` (for local development)
   
   Your authorized origins should look like:
   ```
   https://igetdressed.online
   http://localhost:3000
   ```

7. **Authorized redirect URIs**:
   - This is CRITICAL - it must match exactly what Clerk shows
   - Look at your Clerk dashboard - it shows: `https://clerk.igetdressed.online/v1/oauth_callback`
   - Click **+ ADD URI**
   - Add: `https://clerk.igetdressed.online/v1/oauth_callback`
   - Make sure it matches EXACTLY (including https, no trailing slash, etc.)
   
   Your authorized redirect URIs should look like:
   ```
   https://clerk.igetdressed.online/v1/oauth_callback
   ```

8. Click **CREATE**

### Step 6: Copy Your Credentials

After clicking CREATE, a popup will appear showing:

- **Your Client ID**: A long string starting with something like `123456789-abc...googleusercontent.com`
- **Your Client Secret**: A long string starting with something like `GOCSPX-abc...`

**IMPORTANT: Copy these now - you won't be able to see the secret again!**

1. Copy the **Client ID** - paste it somewhere safe temporarily
2. Copy the **Client Secret** - paste it somewhere safe temporarily

If you lose the secret, you can:
- Go back to Credentials
- Click the edit icon (pencil) next to your OAuth client
- Click "RESET SECRET" to generate a new one

### Step 7: Paste into Clerk Dashboard

1. Go back to your Clerk dashboard (the page you have open)

2. In the **Client ID** field:
   - Paste the Client ID you copied from Google Cloud Console

3. In the **Client Secret** field:
   - Paste the Client Secret you copied from Google Cloud Console

4. **Authorized Redirect URI** should already be filled in (verify it matches what you added in Google Cloud Console)

5. **Scopes** should already be set (don't change these unless you know what you're doing)

6. Click **Update connection** (the purple button at the bottom)

### Step 8: Test It

1. Go to your sign-in page
2. Click "Continue with Google"
3. You should be redirected to Google's sign-in page
4. After signing in, you should be redirected back to your app

## Troubleshooting

### "Redirect URI mismatch" error
- Make sure the redirect URI in Google Cloud Console matches EXACTLY what Clerk shows
- Check for:
  - `https` vs `http`
  - Trailing slashes
  - Typos

### "Invalid client" error
- Make sure you copied the Client ID correctly (no extra spaces)
- Make sure the Client Secret is correct

### Can't find OAuth client ID option
- Make sure you completed the OAuth consent screen configuration first
- Make sure you're in the correct Google Cloud project

### Still having issues?
1. Double-check that the redirect URI in Google Cloud Console matches Clerk exactly
2. Make sure you saved the credentials in Clerk dashboard
3. Clear your browser cache and try again

## Quick Reference

**Where to get credentials:**
- Google Cloud Console: https://console.cloud.google.com/apis/credentials

**What to copy:**
- Client ID: From the OAuth client popup
- Client Secret: From the OAuth client popup

**What to verify:**
- Redirect URI in Google Cloud Console: `https://clerk.igetdressed.online/v1/oauth_callback`
- Redirect URI in Clerk: Should match exactly
















