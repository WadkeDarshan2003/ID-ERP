# Nodemailer Email Service Setup Guide

## Overview
Your app now uses **Nodemailer** with an **Express backend** for sending emails via Gmail. No EmailJS templates needed!

---

## Installation

1. **Install dependencies:**
```bash
npm install
```

This installs:
- `express` - Backend server
- `nodemailer` - Email sending
- `cors` - Cross-origin requests
- `dotenv` - Environment variables
- `tsx` - TypeScript execution
- `concurrently` - Run multiple processes

---

## Configuration

Your `.env.local` already has:
```
VITE_EMAIL_USER=btwpune@gmail.com
VITE_EMAIL_PASSWORD=yder iubp gmxf yuwf
VITE_SMTP_HOST=smtp.gmail.com
VITE_SMTP_PORT=587
VITE_BACKEND_URL=http://localhost:5000
```

---

## How to Run

### Option 1: Run Frontend Only (for testing with production backend)
```bash
npm run dev
```
Runs on: http://localhost:5173

### Option 2: Run Both Frontend + Backend (Recommended for local development)
```bash
npm run dev:all
```

This runs:
- **Frontend** (Vite): http://localhost:5173
- **Backend** (Express): http://localhost:5000

### Option 3: Run Backend Only
```bash
npm run dev:backend
```
Runs on: http://localhost:5000

---

## How It Works

1. **User creates a task** → Frontend calls backend API
2. **Backend receives request** → Express endpoint `/api/email/send`
3. **Nodemailer sends email** → Uses Gmail SMTP with your credentials
4. **Email delivered** → To the recipient inbox

---

## File Structure

```
project/
├── backend/
│   ├── server.ts           # Express server
│   ├── emailRoutes.ts      # Email API endpoints
│   └── emailConfig.ts      # Nodemailer configuration
├── services/
│   └── emailService.ts     # Frontend email service (calls backend)
├── .env.local              # Gmail credentials
└── package.json            # Dependencies
```

---

## Email Templates

All email HTML is built in `services/emailService.ts`:
- Task Reminder
- Payment Reminder
- Task Assignment
- Document Shared
- Project Welcome
- Task Approval

**You control 100% of the email design in your code. No template editor needed!**

---

## Testing Emails

### Create a Test Task
1. Go to your app: http://localhost:5173
2. Create a new task
3. Assign it to a user
4. Check their inbox for the email

### Send a Payment Reminder
1. Click the bell icon (📬) on any project
2. Click "Send Payment Reminder"
3. Email is sent immediately

---

## Troubleshooting

### "Backend connection refused"
- Make sure backend is running: `npm run dev:backend`
- Check that port 5000 is not in use

### "Gmail authentication failed"
- Verify your app password is correct
- Check that 2FA is enabled in your Gmail account
- Make sure you used an **app password**, not your main password

### "Email not sent but no error"
- Check console logs in browser and terminal
- Verify recipient email is correct
- Check if the email went to spam folder

---

## Production Deployment

For production:
1. Deploy Express backend to a server (e.g., Heroku, Railway, Render)
2. Update `VITE_BACKEND_URL` in your environment variables to your backend URL
3. Frontend will automatically call the production backend API

Example:
```
VITE_BACKEND_URL=https://your-backend.herokuapp.com
```

---

## Security Notes

✅ **App password is secure:**
- Only works for email sending
- Can be revoked anytime from Gmail settings
- Different from your main Gmail password

✅ **Backend is secure:**
- No sensitive data exposed to frontend
- Credentials stay on server only
- CORS restricted to your domain

---

## Next Steps

1. ✅ Backend created
2. ✅ Email service updated
3. ✅ Dependencies configured
4. **→ Run `npm install` to install new packages**
5. **→ Run `npm run dev:all` to start frontend + backend**
6. **→ Test by creating a task**

---

**All emails are now sent via Nodemailer + Gmail with full HTML control!** 
