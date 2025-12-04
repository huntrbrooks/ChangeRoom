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

---

## YOLOv8 Demo Deployment (New)

The repository now ships with `my-yolov8-app/`, which should run as its own Render stack so detections can scale independently.

### Backend (`yolo-backend`)

1. In Render, create a new **Web Service** from the same repository.
2. Choose **Environment: Docker** and point the service at:
   - **Docker Context:** `my-yolov8-app/backend`
   - **Dockerfile Path:** `Dockerfile`
   - **Plan:** Starter (upgrade when you need more compute)
3. Add env vars (see `my-yolov8-app/backend/env.example` for the full list). Minimum production set:

| Key | Example |
| --- | --- |
| `YOLO_ALLOWED_ORIGINS` | `https://yolo-frontend.onrender.com` |
| `YOLO_MODEL_PATH` | `yolov8n.pt` |
| `YOLO_CONFIDENCE` | `0.25` |
| `YOLO_MAX_FILE_MB` | `15` |
| `YOLO_ENVIRONMENT` | `production` |
| `PORT` | `5000` |

4. Deploy and confirm `https://<service>/health` returns `{"status":"ok"}`.

### Frontend (Static Site)

1. Create a Render **Static Site** using context `my-yolov8-app/frontend`.
2. Build config:
   - **Build Command:** `npm ci && npm run build`
   - **Publish Directory:** `my-yolov8-app/frontend/build`
3. Add env var `REACT_APP_API_URL=https://<yolo-backend>.onrender.com`.
4. Deploy and validate uploads complete successfully.

> The `render.yaml` at the repo root already defines the `yolo-backend` service so you can manage it via Git infra-as-code.

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

