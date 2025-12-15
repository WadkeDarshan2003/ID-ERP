# Firebase Cloud Functions Email Setup

## Overview

Your app now uses **Firebase Cloud Functions** to send emails via Gmail/Nodemailer. No separate backend server needed!

---

## Architecture

```
React App (Frontend)
    ↓
sendEmail() function calls Cloud Function
    ↓
Firebase Cloud Function (Serverless)
    ↓
Nodemailer + Gmail SMTP
    ↓
Email delivered to recipient
```

---

## Local Development Setup

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Authenticate with Firebase
```bash
firebase login
```

### 3. Install Cloud Functions Dependencies
```bash
cd functions
npm install
cd ..
```

### 4. Start Firebase Emulator
```bash
firebase emulators:start --only functions
```

This starts:
- **Frontend**: http://localhost:5173 (`npm run dev` in another terminal)
- **Cloud Function Emulator**: http://localhost:5001

### 5. Update `.env.local` for Local Development
```
VITE_CLOUD_FUNCTION_URL=http://localhost:5001/btw-erp/us-central1/sendEmail
```

### 6. Run Frontend
In another terminal:
```bash
npm run dev
```

---

## Deployment to Firebase

### 1. Build Frontend
```bash
npm run build
```

### 2. Set Cloud Function Environment Variables

Go to **Firebase Console** → **Project Settings** → **Functions**:

```
EMAIL_USER = btwpune@gmail.com
EMAIL_PASSWORD = yder iubp gmxf yuwf
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
```

### 3. Deploy to Firebase
```bash
firebase deploy --only functions
```

This deploys to:
```
https://us-central1-btw-erp.cloudfunctions.net/sendEmail
```

### 4. Update Frontend Environment
Remove the local `VITE_CLOUD_FUNCTION_URL` from `.env.local`. The frontend will auto-detect the production URL from `VITE_FIREBASE_PROJECT_ID`.

### 5. Deploy Frontend to Vercel/Netlify
```bash
npm run build
# Deploy dist/ folder to Vercel/Netlify
```

---

## File Structure

```
project/
├── functions/
│   ├── src/
│   │   └── index.ts           # Cloud Function code
│   ├── package.json           # Cloud Function dependencies
│   ├── tsconfig.json          # TypeScript config
│   └── .env.example           # Environment variables template
├── services/
│   └── emailService.ts        # Frontend service (calls Cloud Function)
├── firebase.json              # Firebase config
└── .env.local                 # Local environment variables
```

---

## How It Works

### 1. User creates a task
Frontend calls `sendTaskCreationEmail()`

### 2. Task email sent
`sendEmail()` in `emailService.ts` calls Cloud Function

### 3. Cloud Function receives request
At `https://region-projectid.cloudfunctions.net/sendEmail`

### 4. Nodemailer sends via Gmail
Cloud Function uses Gmail SMTP to send email

### 5. Email delivered
Recipient receives professional HTML email

---

## Email Templates

All email HTML is built in your code (`services/emailService.ts`):

- ✅ Task Reminder
- ✅ Payment Reminder
- ✅ Task Assignment
- ✅ Document Shared
- ✅ Project Welcome
- ✅ Task Approval

You control 100% of the design—no template editor needed!

---

## Testing Locally

### Start Emulator
```bash
firebase emulators:start --only functions
```

### Start Frontend (in another terminal)
```bash
npm run dev
```

### Make sure `.env.local` has:
```
VITE_CLOUD_FUNCTION_URL=http://localhost:5001/btw-erp/us-central1/sendEmail
```

### Test Email
1. Create a task in your app
2. Check the assignee's inbox
3. Email should arrive in seconds

---

## Troubleshooting

### "Cannot find module 'firebase-functions'"
```bash
cd functions
npm install
cd ..
```

### "Cloud Function returning 404"
- Make sure emulator is running: `firebase emulators:start --only functions`
- Check `.env.local` has correct `VITE_CLOUD_FUNCTION_URL`

### "Gmail authentication failed"
- Verify app password is correct (16 characters)
- Check 2FA is enabled in Gmail account
- Make sure you used an app password, not your main password

### "Email not sending in production"
1. Go to Firebase Console → Functions
2. Check environment variables are set correctly
3. Check function logs for errors

---

## Security

✅ **App password is safe:**
- Only works for Gmail SMTP
- Can be revoked anytime
- Different from your main Gmail password

✅ **Cloud Functions secure:**
- Credentials stored in Firebase (not in code)
- CORS enabled for your domain only
- Google-managed infrastructure

---

## Pricing

**Firebase Cloud Functions Free Tier:**
- 2 million requests/month
- 400,000 GB-seconds/month

**Your usage estimate:**
- ~1000 emails/month
- ~5,000 requests (light usage)
- **Cost: FREE** ✅

---

## Production Checklist

- [ ] Install Firebase CLI globally
- [ ] Authenticate with Firebase
- [ ] Install functions dependencies
- [ ] Test locally with emulator
- [ ] Set environment variables in Firebase Console
- [ ] Deploy functions: `firebase deploy --only functions`
- [ ] Build and deploy frontend to Vercel/Netlify
- [ ] Test email delivery in production
- [ ] Monitor Cloud Function logs

---

## Support

For more info:
- [Firebase Cloud Functions Docs](https://firebase.google.com/docs/functions)
- [Nodemailer Docs](https://nodemailer.com/)
- [Gmail App Passwords](https://support.google.com/accounts/answer/185833)

---

**Your email system is now serverless, scalable, and managed by Google!** 🚀
