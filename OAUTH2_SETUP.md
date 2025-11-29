# OAuth2 Setup Guide for Google GenAI API

This guide explains how to set up OAuth2 authentication for the Google GenAI API (for image generation).

## Prerequisites

You have already:
- ✅ Created OAuth2 credentials in Google Cloud Console
- ✅ Added the required scopes:
  - `https://www.googleapis.com/auth/generative-language`
  - `https://www.googleapis.com/auth/cloud-platform`
- ✅ Obtained your Client ID and Client Secret

## Step 1: Add Credentials to Environment Variables

Add the following to your `.env` file (or set them in your deployment environment like Render):

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
```

## Step 2: Get a Refresh Token

For server-to-server authentication, you need a **refresh token**. Run the helper script once:

```bash
cd backend
python get_oauth2_token.py
```

This will:
1. Open a browser window
2. Ask you to authorize the application
3. Display your refresh token

## Step 3: Add Refresh Token to Environment

Add the refresh token to your `.env` file:

```env
GOOGLE_REFRESH_TOKEN=<your-refresh-token-here>
```

Or set it in your deployment environment (Render dashboard → Environment Variables).

## Step 4: Deploy

The code will now automatically use OAuth2 authentication when:
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- `GOOGLE_REFRESH_TOKEN` is set

## Alternative: Service Account (Recommended for Production)

For production deployments, Google recommends using **Service Accounts** instead of OAuth2 client credentials:

1. Go to Google Cloud Console → IAM & Admin → Service Accounts
2. Create a new service account
3. Download the JSON key file
4. Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of the JSON file

The code will automatically detect and use service account credentials if `GOOGLE_APPLICATION_CREDENTIALS` is set.

## Troubleshooting

### Error: "OAuth2 requires either a refresh token or service account"

**Solution**: Run `get_oauth2_token.py` to get a refresh token, or set up a service account.

### Error: "401 UNAUTHENTICATED"

**Possible causes**:
1. Refresh token is invalid or expired
2. Scopes are not correctly configured in Google Cloud Console
3. Client ID/Secret are incorrect

**Solution**: 
- Verify all environment variables are set correctly
- Re-run `get_oauth2_token.py` to get a new refresh token
- Check that the scopes are added in Google Cloud Console

### Error: "google-auth packages not installed"

**Solution**: Install the required packages:
```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2
```

## Notes

- The refresh token is long-lived and can be reused
- Keep your client secret and refresh token secure - never commit them to git
- For production, prefer service accounts over OAuth2 client credentials
- The code falls back to API key authentication if OAuth2 is not available (though API keys may not work for image generation)

