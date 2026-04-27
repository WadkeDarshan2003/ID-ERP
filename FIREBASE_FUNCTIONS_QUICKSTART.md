# Firebase Cloud Functions - Quick Start

## ⚡ Quick Commands

### Local Development
```bash
# Install Firebase CLI (one time)
npm install -g firebase-tools

# Install function dependencies
cd functions && npm install && cd ..

# Start emulator in one terminal
firebase emulators:start --only functions

# Start frontend in another terminal
npm run dev
```

### Make sure `.env.local` has for local dev:
```
VITE_CLOUD_FUNCTION_URL=http://localhost:5001/btw-erp/us-central1/sendEmail
```

---

## 📦 Deployment

### 1. Set Environment Variables in Firebase Console
Go to: Firebase Console → btw-erp → Functions → Runtime environment variables

```
EMAIL_USER=btwpune@gmail.com
EMAIL_PASSWORD=yder iubp gmxf yuwf
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

### 2. Deploy Functions
```bash
firebase deploy --only functions
```

### 3. Build & Deploy Frontend
```bash
npm run build
# Deploy dist/ to Vercel or Netlify
```

### 4. Clean `.env.local` for Production
Remove:
```
VITE_CLOUD_FUNCTION_URL=http://localhost:5001/btw-erp/us-central1/sendEmail
```

The frontend will auto-detect: `https://us-central1-btw-erp.cloudfunctions.net/sendEmail`

---

## ✅ Test Flow

1. **Local:** Create task → Email sent via emulator
2. **Production:** Create task → Email sent via Firebase Cloud Function

---

## 📊 Status

| Component | Status | Notes |
|-----------|--------|-------|
| Frontend | ✅ Ready | `npm run dev` |
| Cloud Function Code | ✅ Ready | `functions/src/index.ts` |
| Environment Setup | ⏳ Needed | Set vars in Firebase Console |
| Local Testing | ⏳ Ready | After emulator starts |
| Production Deploy | ⏳ Ready | After env vars set |

---

## 🎯 Next Steps

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Set environment variables in Firebase Console
3. Deploy: `firebase deploy --only functions`
4. Test in production
5. Deploy frontend to Vercel/Netlify

---

**That's it! Your email system is now serverless.** 
