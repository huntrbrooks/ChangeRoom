# Deploy OAuth2 Credentials to Render

## Your Refresh Token
✅ Successfully obtained! Copy your refresh token from the terminal output above.

## Step 1: Add Environment Variables to Render

1. **Go to Render Dashboard**
   - Visit: https://dashboard.render.com/
   - Sign in to your account

2. **Navigate to Your Service**
   - Click on your backend service (likely named "change-room-backend")

3. **Go to Environment Tab**
   - Click on **"Environment"** in the left sidebar

4. **Add Environment Variables**
   Click **"Add Environment Variable"** and add these three variables:

   **Variable 1:**
   - Key: `GOOGLE_CLIENT_ID`
   - Value: `your-client-id.apps.googleusercontent.com`
   - Click **"Save Changes"**

   **Variable 2:**
   - Key: `GOOGLE_CLIENT_SECRET`
   - Value: `your-client-secret`
   - Click **"Save Changes"**

   **Variable 3:**
   - Key: `GOOGLE_REFRESH_TOKEN`
   - Value: `your-refresh-token-from-terminal-output`
   - Click **"Save Changes"**

## Step 2: Redeploy

After adding all three environment variables:

1. Render will automatically detect the changes
2. You can manually trigger a redeploy by clicking **"Manual Deploy"** → **"Deploy latest commit"**
3. Wait for the deployment to complete

## Step 3: Verify

Once deployed, your backend should now use OAuth2 authentication for Google GenAI API image generation!

## Local Development

The refresh token has also been added to your local `.env` file, so you can test locally:

```bash
cd backend
python3 -m uvicorn main:app --reload
```

## Security Notes

- ✅ The refresh token is stored securely in Render's environment variables
- ✅ Never commit the refresh token to git (it's already in `.gitignore`)
- ✅ The refresh token is long-lived and can be reused
- ✅ If you need to revoke it, go to Google Account → Security → Third-party apps

## Troubleshooting

If you get authentication errors after deployment:

1. **Check environment variables** are set correctly in Render
2. **Verify the refresh token** is correct (no extra spaces)
3. **Check logs** in Render dashboard for specific error messages
4. **Wait a few minutes** after adding variables before testing

