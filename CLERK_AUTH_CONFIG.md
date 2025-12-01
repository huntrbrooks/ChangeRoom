# Clerk Authentication Configuration

## Problem

Users from Australia (and possibly other countries) are seeing the error:
> "Phone numbers from this country (Australia) are currently not supported. For more information, please contact support."

This happens because Clerk's phone authentication doesn't support all countries.

## Solution

Configure Clerk to use **Email/Password** authentication instead of (or in addition to) phone authentication.

### Steps to Fix in Clerk Dashboard

1. **Go to Clerk Dashboard**: https://dashboard.clerk.com
2. **Navigate to**: Your Application → User & Authentication → Email, Phone, Username
3. **Configure Email**:
   - ✅ Enable "Email address" as a required identifier
   - ✅ Enable "Email code" or "Email link" or "Email + Password"
   - Choose your preferred email verification method

4. **Configure Phone (Optional)**:
   - ❌ **Disable** phone authentication if you don't need it
   - OR keep it enabled but users can choose email instead

5. **Authentication Options**:
   - Under "First factor methods", prioritize:
     1. Email address + Password (recommended)
     2. Email address + Code
   - Phone can be secondary or disabled

### Alternative: OAuth Providers

You can also enable OAuth providers that work globally:
- Google (see `CLERK_GOOGLE_OAUTH_SETUP.md` or `GOOGLE_OAUTH_STEP_BY_STEP.md` for setup instructions)
- Apple (see `CLERK_APPLE_OAUTH_SETUP.md` for setup instructions - requires paid Apple Developer account)
- GitHub
- Microsoft

These don't have country restrictions.

**Notes:**
- **Google OAuth:** If you see "Missing required parameter: client_id" when trying to sign in with Google, see `CLERK_GOOGLE_OAUTH_SETUP.md` or `GOOGLE_OAUTH_STEP_BY_STEP.md` for detailed setup instructions or disable Google OAuth in the Clerk dashboard if you don't need it.
- **Apple Sign In:** Requires a paid Apple Developer Program membership ($99/year). See `CLERK_APPLE_OAUTH_SETUP.md` for complete setup instructions.

## Code Configuration

The app is already configured to prefer email authentication. The sign-in page will automatically show available methods based on your Clerk dashboard settings.

### Current Configuration

- Sign-in page: `/app/sign-in/[[...sign-in]]/page.tsx`
- Sign-in component uses Clerk's default behavior (shows all enabled methods)
- Email/password should be the default if configured in dashboard

## Testing

After updating Clerk dashboard settings:
1. Clear browser cache/cookies
2. Try signing in again
3. You should see email/password option as primary method

## Support

If issues persist:
- Check Clerk Dashboard → User & Authentication settings
- Ensure email authentication is enabled and set as primary
- Contact Clerk support if phone restrictions are blocking your use case


