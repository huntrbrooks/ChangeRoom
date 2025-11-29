# Fix "Error 403: access_denied" - Add Test Users

## The Problem
You're seeing: **Error 403: access_denied**

This happens when your OAuth consent screen is in "Testing" mode and you haven't added yourself as a test user.

## Solution: Add Yourself as a Test User

### Step 1: Go to OAuth Consent Screen

1. Go to: https://console.cloud.google.com/
2. Select your project
3. Navigate to: **APIs & Services** → **OAuth consent screen**

### Step 2: Add Test Users

1. Scroll down to the **"Test users"** section
2. Click **"+ ADD USERS"**
3. Enter your email address: `gerard.grenville@gmail.com`
4. Click **"Add"**
5. You can add multiple test users if needed

### Step 3: Save Changes

1. Make sure to click **"Save"** at the bottom of the page
2. Wait 1-2 minutes for changes to propagate

### Step 4: Try the Script Again

After adding yourself as a test user, run:

```bash
export GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GOOGLE_CLIENT_SECRET="your-client-secret"
python3 backend/get_oauth2_token.py
```

## Alternative: Publish the App (For Production)

If you want to allow any user to access the app (not just test users):

1. Go to: **APIs & Services** → **OAuth consent screen**
2. Click **"PUBLISH APP"** button at the top
3. Note: For sensitive scopes, Google may require verification
4. For now, adding test users is the quickest solution

## Visual Guide

In Google Cloud Console → OAuth consent screen → Test users:

```
┌─────────────────────────────────────────┐
│ Test users                              │
├─────────────────────────────────────────┤
│ Publishing status: Testing               │
│                                         │
│ Test users (1)                          │
│ ┌─────────────────────────────────────┐ │
│ │ gerard.grenville@gmail.com  [Remove]│ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [+ ADD USERS]                           │
└─────────────────────────────────────────┘
```

## Quick Checklist

- [ ] Went to OAuth consent screen
- [ ] Found "Test users" section
- [ ] Added `gerard.grenville@gmail.com` as test user
- [ ] Clicked "Save"
- [ ] Waited 1-2 minutes
- [ ] Ran the token script again

## Notes

- **Testing mode**: Only approved test users can access the app
- **Published mode**: Any user can access (may require verification for sensitive scopes)
- **For development**: Testing mode with test users is perfect
- **For production**: You'll need to publish and potentially verify the app

