# Step-by-Step: Setting Up Apple Sign In with Clerk

## Prerequisites

⚠️ **Important Requirements:**
1. **Apple Developer Account** - You need a paid Apple Developer Program membership ($99/year)
   - Sign up at: https://developer.apple.com/programs/
2. Apple Developer account access

## Overview

Apple Sign In requires:
1. Creating an App ID in Apple Developer Portal
2. Creating a Service ID for Sign in with Apple
3. Creating a Key for Sign in with Apple
4. Configuring domains and redirect URIs
5. Getting Client ID, Team ID, Key ID, and Private Key

## Step-by-Step Instructions

### Step 1: Access Apple Developer Portal

1. Go to: https://developer.apple.com/account/
2. Sign in with your Apple ID (the one associated with your Developer account)

### Step 2: Create an App ID (if you don't have one)

1. Navigate to: **Certificates, Identifiers & Profiles** → **Identifiers**
   - Direct link: https://developer.apple.com/account/resources/identifiers/list

2. Click the **+** button in the top left

3. Select **App IDs** and click **Continue**

4. Select **App** and click **Continue**

5. Fill in the details:
   - **Description**: `Change Room` (or your app name)
   - **Bundle ID**: Use Explicit Bundle ID
     - Format: `com.yourcompany.changeroom` or `com.igetdressed.changeroom`
     - Example: `com.igetdressed.changeroom`
   - **Capabilities**: 
     - ✅ Check **Sign in with Apple**
   - Click **Continue**

6. Review and click **Register**

### Step 3: Create a Service ID for Sign in with Apple

1. Still in **Identifiers**, click the **+** button again

2. Select **Services IDs** and click **Continue**

3. Fill in:
   - **Description**: `Change Room Web App` (or similar)
   - **Identifier**: Something like `com.igetdressed.changeroom.web`
   - Click **Continue**
   - Click **Register**

4. **Configure Sign in with Apple**:
   - Click on your newly created Service ID
   - Check the box next to **Sign in with Apple**
   - Click **Configure**

5. **Configure Sign in with Apple settings**:
   - **Primary App ID**: Select the App ID you created in Step 2
   - **Website URLs**:
     - **Domains and Subdomains**: 
       - `igetdressed.online` (your domain)
       - `clerk.igetdressed.online` (Clerk's domain)
     - **Return URLs**: 
       - You'll get this from Clerk - typically: `https://clerk.igetdressed.online/v1/oauth_callback`
       - Check Clerk dashboard → Social Connections → Apple for the exact URL
   - Click **Next**
   - Click **Done**
   - Click **Continue**
   - Click **Save**

### Step 4: Create a Key for Sign in with Apple

1. Navigate to: **Certificates, Identifiers & Profiles** → **Keys**
   - Direct link: https://developer.apple.com/account/resources/authkeys/list

2. Click the **+** button in the top left

3. Fill in:
   - **Key Name**: `Change Room - Sign in with Apple` (or similar)
   - ✅ Check **Sign in with Apple**
   - Click **Configure** next to "Sign in with Apple"
   - **Primary App ID**: Select your App ID from Step 2
   - Click **Save**
   - Click **Continue**
   - Click **Register**

4. **⚠️ IMPORTANT: Download the Key**
   - After creating, you'll see a download button
   - **Download the .p8 file NOW** - you can only download it once!
   - Save it somewhere safe (e.g., Downloads folder)
   - The filename will be something like: `AuthKey_XXXXXXXXXX.p8`
   - **Note the Key ID** shown on the page (you'll need this)

### Step 5: Get Your Team ID

1. Navigate to: **Membership** (in the top navigation)
   - Direct link: https://developer.apple.com/account/
   
2. Your **Team ID** is displayed at the top of the page
   - It's a 10-character string like: `ABCD123456`
   - **Copy this** - you'll need it

### Step 6: Get Your Service ID (Client ID)

1. Go back to: **Certificates, Identifiers & Profiles** → **Identifiers** → **Services IDs**
   - Direct link: https://developer.apple.com/account/resources/identifiers/list/serviceId

2. Click on the Service ID you created in Step 3

3. **Copy the Identifier** - this is your Client ID
   - It looks like: `com.igetdressed.changeroom.web`
   - This is what you'll paste into Clerk as "Client ID"

### Step 7: Get Your Key ID

1. Go to: **Certificates, Identifiers & Profiles** → **Keys**
   - Direct link: https://developer.apple.com/account/resources/authkeys/list

2. Click on the key you created in Step 4

3. **Copy the Key ID** - this is shown at the top
   - It's a 10-character string like: `ABC123DEFG`

### Step 8: Extract Private Key from .p8 File

1. Open the `.p8` file you downloaded in Step 4
   - You can open it in any text editor (TextEdit, VS Code, etc.)

2. The file contains something like:
   ```
   -----BEGIN PRIVATE KEY-----
   MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
   (more lines)
   -----END PRIVATE KEY-----
   ```

3. **Copy the ENTIRE contents** including:
   - `-----BEGIN PRIVATE KEY-----`
   - All the lines in between
   - `-----END PRIVATE KEY-----`

4. This is your Private Key - you'll paste this into Clerk

### Step 9: Configure in Clerk Dashboard

1. Go to Clerk Dashboard: https://dashboard.clerk.com
2. Navigate to: **User & Authentication** → **Social Connections**
3. Find **Apple** and click to expand

4. Fill in the fields:
   - **Client ID**: Paste your Service ID from Step 6
     - Example: `com.igetdressed.changeroom.web`
   
   - **Team ID**: Paste your Team ID from Step 5
     - Example: `ABCD123456`
   
   - **Key ID**: Paste your Key ID from Step 7
     - Example: `ABC123DEFG`
   
   - **Private Key**: Paste the entire contents of your .p8 file from Step 8
     - Include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
     - Keep all line breaks

5. **Scopes**: Usually already set (email, name)
   - Leave as default unless you need different scopes

6. Click **Update connection**

### Step 10: Enable Apple in Clerk

1. Make sure the **Apple** toggle is **ON** (enabled)
2. Save changes

### Step 11: Test

1. Go to your sign-in page
2. Click "Continue with Apple" (should appear if configured correctly)
3. You should see Apple's sign-in flow

## Important Notes

### Security
- ⚠️ **Never commit the .p8 file to git** - it's a private key
- Keep your Private Key secure
- If you lose it, you'll need to create a new key

### Common Issues

**"Invalid client" error:**
- Make sure Service ID (Client ID) matches exactly
- Verify the Service ID has "Sign in with Apple" enabled

**"Invalid redirect URI" error:**
- Make sure the Return URL in Apple Developer Portal matches exactly what Clerk shows
- Check for `https` vs `http`
- No trailing slashes

**"Invalid key" error:**
- Make sure you copied the ENTIRE private key including BEGIN/END lines
- Verify Key ID is correct
- Check that Team ID is correct

**Apple Sign In not showing:**
- Make sure Apple is enabled in Clerk dashboard
- Verify your Apple Developer account is active
- Check that all credentials are correct

## Quick Checklist

Before testing, make sure you have:
- ✅ Apple Developer Account (paid membership)
- ✅ App ID created with "Sign in with Apple" capability
- ✅ Service ID created and configured
- ✅ Key created and downloaded (.p8 file)
- ✅ Team ID copied
- ✅ Key ID copied
- ✅ Private Key copied from .p8 file
- ✅ All fields filled in Clerk dashboard
- ✅ Apple enabled in Clerk dashboard

## Alternative: Use Clerk's OAuth App

Clerk also offers to use their own OAuth app for Apple Sign In, which is simpler but gives you less control. To use this:

1. In Clerk Dashboard → Social Connections → Apple
2. Look for option to "Use Clerk's OAuth app"
3. Follow the instructions to link your Apple Developer account
4. This may require additional configuration in Apple Developer Portal

This method is easier but requires granting Clerk access to your Apple Developer account.

## Support Resources

- Apple Developer Documentation: https://developer.apple.com/sign-in-with-apple/
- Clerk Apple OAuth Docs: https://clerk.com/docs/authentication/social-connections/apple
- Apple Developer Support: https://developer.apple.com/support/







