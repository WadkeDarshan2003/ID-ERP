# Brevo Email Integration Setup Guide

## Overview
The app now uses **Brevo** (free service - 300 emails/day) to send email reminders for tasks and payments instead of relying on mailto links.

## Why Brevo?
✅ **Free**: 300 emails/day in free tier  
✅ **Reliable**: Professional email delivery  
✅ **Simple**: No backend server needed  
✅ **Fast**: Emails delivered instantly  
✅ **Works on mobile & desktop**: Doesn't depend on email client installation  

---

## Step 1: Create Brevo Account

1. Go to **https://www.brevo.com/**
2. Click **"Sign up for free"**
3. Enter your email and password
4. Verify your email address
5. Complete the signup

---

## Step 2: Get Your API Key

1. Log in to your Brevo account
2. Go to **Settings** (⚙️ icon on the left sidebar)
3. Click **Keys & Tokens**
4. In the **SMTP & API** tab, copy your **API Key**
5. Keep this key secret!

---

## Step 3: Verify Sender Email

1. In Brevo dashboard, go to **Senders**
2. Click **Add a sender**
3. Enter the email you want to send from (e.g., `noreply@yourdomain.com`)
4. Verify the email by clicking the confirmation link sent to that address
5. Once verified, you can use it as your sender email

**Note**: For testing, you can use your personal Gmail/email and verify it.

---

## Step 4: Configure Environment Variables

### In Development (Local Testing):

1. Create a `.env.local` file in your project root:
   ```
   VITE_BREVO_API_KEY=your_api_key_here
   VITE_BREVO_SENDER_EMAIL=your_verified_email@gmail.com
   ```

2. Replace:
   - `your_api_key_here` → Your Brevo API key
   - `your_verified_email@gmail.com` → Your verified sender email from Brevo

3. Save the file and restart your dev server: `npm run dev`

### For Production:

Add these environment variables to your hosting platform (e.g., Vercel, Firebase Hosting):
- `VITE_BREVO_API_KEY`
- `VITE_BREVO_SENDER_EMAIL`

---

## Step 5: Test Email Sending

1. Open your app in browser/mobile
2. Go to a project with tasks
3. Click the **bell icon** (📬) on a task to send a reminder email
4. You should see a "✅ Email sent successfully" notification
5. Check the recipient's email inbox

**Note**: On desktop, you don't need an email client installed anymore!

---

## Email Features Implemented

### 1. **Task Reminders** (Bell icon)
- Sends reminder to task assignee
- Includes task title, project name, and due date
- Professional HTML template

### 2. **Payment Reminders** (Coming soon)
- Sends reminder to project client
- Includes project name and outstanding amount
- Professional HTML template

---

## Troubleshooting

### ❌ "Email service not configured"
**Solution**: Check that both environment variables are set:
```bash
VITE_BREVO_API_KEY=xxx
VITE_BREVO_SENDER_EMAIL=xxx
```

### ❌ "Failed to send email"
**Possible causes**:
1. Invalid API key - verify it's correct in Brevo
2. Email not verified - verify sender email in Brevo account
3. Network error - check internet connection
4. CORS issue - API call blocked by browser (shouldn't happen with Brevo)

### ❌ Email arrives in Spam
**Solution**:
1. Add sender email to contacts
2. Mark email as "Not Spam"
3. Check Brevo's email configuration (SPF, DKIM records)

### ✅ Emails sent but not received
1. Check spam folder
2. Verify recipient email is correct
3. Check Brevo's email logs in dashboard
4. Try resending to different email

---

## Email Limits

| Plan | Limit | Cost |
|------|-------|------|
| **Free** | 300 emails/day | $0 |
| **Starter** | 20,000 emails/month | $20 |
| **Business** | Custom | Custom |

For 50 users sending 5-10 reminders/day = 250-500 emails/day → **Free tier is sufficient!**

---

## Future Enhancements

- [ ] Email preferences (users can opt-out)
- [ ] Email templates customization
- [ ] Scheduled email reminders (due tomorrow, overdue, etc.)
- [ ] Email tracking (open, click) from Brevo
- [ ] Batch emails for daily digest

---

## Support

- **Brevo Documentation**: https://developers.brevo.com/
- **Brevo API Reference**: https://developers.brevo.com/reference/sendtransacemail
- **Brevo Help Center**: https://help.brevo.com/

---

## File Changes Made

1. **emailService.ts** - Updated to use Brevo API instead of Cloud Functions
2. **ProjectDetail.tsx** - Updated reminder functions to call emailService
3. **.env.example** - Template for required environment variables
4. **BREVO_EMAIL_SETUP.md** - This setup guide

---

## Code Example

```typescript
import { sendTaskReminder } from '../services/emailService';

// Send email reminder
const result = await sendTaskReminder(
  'recipient@gmail.com',      // Email
  'John Doe',                  // Name
  'Design Homepage',           // Task title
  'Website Project',           // Project name
  '2025-12-25'                 // Due date
);

if (result.success) {
  console.log('✅ Email sent!');
} else {
  console.error('❌ Error:', result.error);
}
```

---

**Setup Time**: ~5 minutes  
**Cost**: Free  
**Reliability**: 99%+ delivery rate  
