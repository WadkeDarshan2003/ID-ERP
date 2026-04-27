# reCAPTCHA Setup for OTP Authentication

## Error You're Getting
```
Uncaught (in promise) Error: Invalid site key or not loaded in api.js: 6LdLWiwsAAAAAKfl8WKH51vxQALtn2LUenkRzy2V
```

This means reCAPTCHA is not properly configured in your Firebase project.

---

## Step 1: Enable Phone Authentication in Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project **BTW ERP**
3. Navigate to **Authentication** → **Sign-in method**
4. Find **Phone** and click on it
5. Toggle **Enable** to turn on phone authentication
6. Click **Save**

---

## Step 2: Enable reCAPTCHA (Enterprise or Standard)

### Option A: Use Firebase's Built-in reCAPTCHA (Recommended)

1. In **Authentication** → **Settings** tab
2. Scroll down to **reCAPTCHA configuration**
3. Click **Create reCAPTCHA Enterprise key** (or use existing)
4. Select your existing **reCAPTCHA Enterprise key** if available
5. Save and refresh

### Option B: Manual Setup via Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **API Key** (or find existing)
5. Restrict the key to **reCAPTCHA Enterprise** API
6. Add authorized domains:
   - `localhost:3000` (development)
   - `localhost:5173` (if using Vite)
   - `btw-erp.web.app` (production)
   - `your-domain.com` (if you have custom domain)

---

## Step 3: Add Authorized Domains in Firebase

1. **Authentication** → **Settings**
2. Scroll to **Authorized domains**
3. Add these domains:
   - `localhost:3000`
   - `localhost:5173`
   - `btw-erp.web.app`
   - Any other domains where your app will run

---

## Step 4: Test Locally with Test Phone Numbers (Development Only)

1. **Authentication** → **Phone** sign-in method
2. Scroll down to **Phone numbers for testing**
3. Click **Add phone number for testing**
4. Add test entries:
   - Phone: `+91 9999999999` → OTP: `123456`
   - Phone: `+1 5555555555` → OTP: `123456`
5. Use these during development without SMS costs

---

## Step 5: Verify HTML reCAPTCHA Container

Ensure your login page has the reCAPTCHA container:

```html
<div id="recaptcha-container"></div>
```

This is already in your `Login.tsx` file.

---

## Step 6: Test the Login

1. Start your app (`npm run dev`)
2. Go to login page
3. Click **Phone** tab
4. Use test phone number (from Step 4)
5. Click **Send OTP**
6. You should see reCAPTCHA challenge or it will pass silently
7. Enter test OTP (e.g., `123456`)
8. Click **Verify OTP**

---

## Troubleshooting

### Still Getting "Invalid site key" Error?

**Solution 1: Clear Browser Cache**
- Open DevTools → Application → Clear All
- Refresh the page

**Solution 2: Check Firebase Project Link**
- Ensure your Firebase config is pointing to the correct project
- Verify `firebaseConfig.ts`:
  ```typescript
  const firebaseConfig = {
    projectId: "btw-erp", // ← Make sure this is correct
    // ... other config
  };
  ```

**Solution 3: Restart Dev Server**
```bash
npm run dev
```

**Solution 4: Regenerate reCAPTCHA Key**
- Delete existing key in Google Cloud
- Create new key in Firebase Console
- Let Firebase manage it automatically

### OTP Not Being Sent?

1. Check SMS costs - Firebase charges per SMS
2. Make sure phone number includes country code (e.g., `+91`, `+1`)
3. Use test phone numbers first (they don't charge)

### reCAPTCHA Appears But Always Fails?

1. Check authorized domains - make sure `localhost:3000` is added
2. Ensure reCAPTCHA Enterprise API is enabled in Google Cloud
3. Check that the reCAPTCHA key is linked to your Firebase project

---

## Production Checklist

Before deploying to production:

- [ ] Enable real phone authentication (not test mode)
- [ ] Add production domain to authorized domains
- [ ] Set up billing to allow SMS delivery
- [ ] Test with real phone numbers
- [ ] Disable test phone numbers before going live

---

## References

- [Firebase Phone Authentication Docs](https://firebase.google.com/docs/auth/web/phone-auth)
- [reCAPTCHA Enterprise Setup](https://firebase.google.com/docs/auth/web/recaptcha)
- [Google Cloud reCAPTCHA](https://cloud.google.com/recaptcha-enterprise/docs)

