# Clerk Self-Hosted Configuration

## Environment Variables

For self-hosted Clerk instances, configure the following environment variables in your Vercel project:

### Required

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuaWdldGRyZXNzZWQub25saW5lJA
```

### Optional (for self-hosted Clerk)

If you're using a self-hosted Clerk instance, set these:

```bash
# Frontend API URL (without https://)
NEXT_PUBLIC_CLERK_FRONTEND_API=clerk.igetdressed.online

# Domain (optional, will be derived from frontend API if not set)
NEXT_PUBLIC_CLERK_DOMAIN=igetdressed.online
```

## Current Configuration

Based on your setup:
- **Frontend API URL**: `https://clerk.igetdressed.online`
- **Backend API URL**: `https://api.clerk.com`
- **JWKS URL**: `https://clerk.igetdressed.online/.well-known/jwks.json`
- **Publishable Key**: `pk_live_Y2xlcmsuaWdldGRyZXNzZWQub25saW5lJA`

## Vercel Environment Variables Setup

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_live_Y2xlcmsuaWdldGRyZXNzZWQub25saW5lJA
   NEXT_PUBLIC_CLERK_FRONTEND_API = clerk.igetdressed.online
   ```

4. Make sure to:
   - **Remove any quotes** around the values
   - Set them for **Production**, **Preview**, and **Development** environments
   - Click **Save** and redeploy

## Important Notes

- The publishable key should **NOT** have quotes or trailing spaces
- The frontend API should be the domain only (without `https://`)
- ClerkProvider will automatically read these environment variables
- After setting these, redeploy your application

## Verification

After setting the environment variables and redeploying:
1. Check that the build completes successfully
2. Verify authentication works on the deployed site
3. Check browser console for any Clerk-related errors

