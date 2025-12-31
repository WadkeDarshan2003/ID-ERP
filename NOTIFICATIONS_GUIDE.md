# 📬 Push Notifications & Email Guide

Complete documentation of all notifications implemented in the ID ERP system.

---

## 🎯 Overview

The system sends **both email and push notifications** for important project events. All notifications are:
- ✅ **Tenant-isolated** - Only admins from the same organization receive notifications
- ✅ **Real-time** - Push notifications appear instantly on desktop and mobile
- ✅ **Context-rich** - Include project name, task/document details, and deep links
- ✅ **Multi-channel** - Email + Browser push notifications

---

## 📋 Complete Notification List

### 1. Task Notifications

#### 1.1 New Task Assigned
**Trigger:** When a task is created and assigned to a user

**Recipients:**
- Task assignee

**Content:**
- Task title
- Project name
- Task description
- Due date
- Direct link to task

**Channels:** Email + Push

---

#### 1.2 Task Due Reminder
**Trigger:** 24 hours before task due date

**Recipients:**
- Task assignee

**Content:**
- Task title
- Project name
- Due date (tomorrow)
- Direct link to task

**Channels:** Email + Push

---

#### 1.3 Task Assignment Change
**Trigger:** When a task is reassigned to a different user

**Recipients:**
- New assignee

**Content:**
- Task title
- Project name
- Task details
- Direct link to task

**Channels:** Email + Push

---

#### 1.4 Task Start Approval Required
**Trigger:** When a task requires approval to start work

**Recipients:**
- Tenant admins (same organization)
- Task assignee

**Content:**
- Task title
- Project name
- Task category
- Approval status needed
- Direct link to task

**Channels:** Email + Push

---

#### 1.5 Task Completion Approval Required
**Trigger:** When a task is marked as done and requires approval

**Recipients:**
- Tenant admins (same organization)
- Task assignee

**Content:**
- Task title
- Project name
- Task category
- Completion approval needed
- Direct link to task

**Channels:** Email + Push

---

#### 1.6 Task Comment Added
**Trigger:** When someone comments on a task

**Recipients:**
- Tenant admins (same organization, except commenter)
- Task assignee (if not the commenter)
- Project lead designer
- Project client

**Content:**
- Task title
- Project name
- Commenter name
- Comment text (80 chars preview)
- Task status and category
- Direct link to task

**Channels:** Email + Push

---

### 2. Document Notifications

#### 2.1 Document Uploaded
**Trigger:** When a new document is uploaded to the project

**Recipients:**
- Tenant admins (same organization, except uploader)
- Users in "Share With" list

**Content:**
- Document name
- Document type
- Project name
- Uploader name
- Direct link to documents tab

**Channels:** Email + Push

---

#### 2.2 Document Shared
**Trigger:** When a document is explicitly shared with users

**Recipients:**
- Users in share list

**Content:**
- Document name
- Project name
- Sharer name
- Direct link to document

**Channels:** Email + Push

---

#### 2.3 Document Comment Added
**Trigger:** When someone comments on a document

**Recipients:**
- Tenant admins (same organization, except commenter)
- Project lead designer
- Project client
- Users in "Share With" list

**Content:**
- Document name
- Project name
- Commenter name
- Comment text
- Direct link to document

**Channels:** Email + Push

---

#### 2.4 Document Admin Approval
**Trigger:** When admin approves/rejects a document

**Recipients:**
- Tenant admins (same organization)
- Document uploader
- Users in "Share With" list
- Project client (if document shared with them)

**Content:**
- Document name
- Project name
- Approver name
- Approval status (approved/rejected)
- Direct link to document

**Channels:** Email + Push

---

#### 2.5 Document Client Approval
**Trigger:** When client approves/rejects a document

**Recipients:**
- Tenant admins (same organization)
- Document uploader
- Users in "Share With" list

**Content:**
- Document name
- Project name
- Client name
- Approval status (approved/rejected)
- Direct link to document

**Channels:** Email + Push

---

### 3. Meeting Notifications

#### 3.1 Meeting Scheduled
**Trigger:** When a new meeting is created

**Recipients:**
- All meeting attendees

**Content:**
- Meeting title
- Meeting type
- Project name
- Date & time
- Meeting notes
- List of attendees
- Direct link to meeting

**Channels:** Email + Push

---

#### 3.2 Meeting Updated
**Trigger:** When meeting details are modified

**Recipients:**
- All meeting attendees

**Content:**
- Meeting title
- Meeting type
- Project name
- Updated date & time
- Updated notes
- List of attendees
- Direct link to meeting

**Channels:** Email + Push

---

#### 3.3 Meeting Comment Added
**Trigger:** When someone comments on a meeting

**Recipients:**
- Tenant admins (same organization, except commenter)
- All meeting attendees (except commenter)

**Content:**
- Meeting title
- Project name
- Commenter name
- Comment text (100 chars preview)
- Direct link to meeting

**Channels:** Email + Push

---

### 4. Project Notifications

#### 4.1 Project Welcome
**Trigger:** When a user is added to a project

**Recipients:**
- Newly added team member

**Content:**
- Project name
- Project type
- Welcome message
- Project details
- Direct link to project

**Channels:** Email + Push

---

### 5. Financial Notifications

#### 5.1 Additional Budget Approval
**Trigger:** When additional budget request is approved/rejected

**Recipients:**
- Tenant admins (same organization)
- Project lead designer
- Project client

**Content:**
- Amount requested
- Project name
- Approver name (Admin/Client)
- Approval status
- New total budget (if both approved)
- Direct link to financials

**Channels:** Email + Push

---

#### 5.2 Payment Confirmation
**Trigger:** When received payment is confirmed/disputed

**Recipients:**
- Tenant admins (same organization)
- Project lead designer
- Project client

**Content:**
- Payment amount
- Payment description
- Project name
- Approver name (Admin/Client)
- Status (confirmed/disputed)
- Direct link to financials

**Channels:** Email + Push

---

#### 5.3 Expense Approval
**Trigger:** When expense is approved/rejected

**Recipients:**
- Tenant admins (same organization)
- Project lead designer
- Project client

**Content:**
- Expense amount
- Expense description
- Project name
- Approver name (Admin/Client)
- Approval status
- Direct link to financials

**Channels:** Email + Push

---

## 🔐 Tenant Isolation

All notifications respect **tenant boundaries**:

```typescript
// Admin notifications are filtered by tenantId
users.filter(u => u.role === Role.ADMIN && u.tenantId === user.tenantId)
```

This ensures:
- ✅ Admins only receive notifications for their organization
- ✅ Multi-tenant data privacy is maintained
- ✅ No cross-organization notification leaks

---

## 📱 Push Notification Setup

### For End Users:

1. **Login to the system**
2. **Allow notifications** when browser prompts
3. **Or click "Enable" on the blue banner** at the top
4. **Test notification** will appear immediately upon enabling

### Browser Requirements:
- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)
- ✅ Safari (Desktop & Mobile iOS 16.4+)

### Device Requirements:
- ✅ Each device needs separate permission
- ✅ FCM token saved per browser/device
- ✅ Works in foreground and background

---

## 🛠️ Technical Implementation

### Architecture:

```
User Action → Firebase Firestore Update → Real-time Listener
                                              ↓
                                    Email Service (Nodemailer)
                                              ↓
                                    Push Service (FCM)
                                              ↓
                          Cloud Function (sendPushNotification)
                                              ↓
                                   User's Device (Notification)
```

### Key Components:

1. **`emailTriggerService.ts`** - All notification logic
2. **`pushNotificationService.ts`** - FCM token management
3. **Cloud Function** - `sendPushNotification` sends to multiple devices
4. **Service Worker** - `sw.js` handles background notifications

### Email Provider:
- **Nodemailer** with Gmail SMTP
- Email: btwpune@gmail.com

### Push Provider:
- **Firebase Cloud Messaging (FCM)**
- VAPID Key configured in `.env`

---

## 📊 Notification Count Summary

| Category | Total Notifications |
|----------|---------------------|
| Tasks | 6 |
| Documents | 5 |
| Meetings | 3 |
| Projects | 1 |
| Financials | 3 |
| **TOTAL** | **18** |

---

## 🎨 Notification Format

### Push Notification:
```
Title: [Event Type] - [Project Name]
Body: [Actor] [action] "[item]": [preview/details]
Icon: /icons/icon-192x192.png
Action: Click to open relevant page
```

### Email:
- **HTML formatted** with brand colors
- **Responsive design** for mobile
- **Clear call-to-action** button
- **Full event details** included
- **Deep links** to specific items

---

## 🔔 User Settings

Currently, notifications are:
- ✅ **Always enabled** for relevant events
- ✅ **Filtered by role** (admins, assignees, etc.)
- ✅ **Tenant-scoped** automatically

**Future Enhancement:** User-level notification preferences (per event type)

---

## 📝 Adding New Notifications

To add a new notification type:

1. **Create email template** in `emailTriggerService.ts`:
```typescript
export const sendMyNotificationEmail = async (
  item: MyType,
  recipients: User[],
  projectName: string,
  projectId: string
): Promise<void> => {
  // Email HTML content
  // Send to each recipient
  // Include sendPushNotification() call
};
```

2. **Call from component** when event occurs:
```typescript
const relevantUsers = users.filter(u => {
  // Filter logic
  if (u.role === Role.ADMIN && u.tenantId === user.tenantId) return true;
  return false;
});

await sendMyNotificationEmail(item, relevantUsers, project.name, project.id);
```

3. **Test thoroughly** with multiple users/tenants

---

## 🐛 Troubleshooting

### Push Notifications Not Received:

1. **Check browser permissions:**
   - Click lock icon in address bar
   - Ensure "Notifications" is set to "Allow"

2. **Check Windows/OS settings:**
   - Windows: Settings → System → Notifications → Chrome
   - macOS: System Preferences → Notifications → Chrome

3. **Check console logs:**
   - Look for "✅ Token saved successfully!"
   - Look for "📬 Foreground message received:"

4. **Verify FCM token saved:**
   - Check Firestore: `users/{userId}` → `fcmTokens` array

5. **Check Cloud Function logs:**
   - Firebase Console → Functions → sendPushNotification → Logs

### Email Not Received:

1. **Check spam folder**
2. **Verify email address** in user profile
3. **Check Cloud Function logs** for email errors
4. **Verify Nodemailer** configuration in `.env`

---

## 📚 Related Documentation

- [EMAIL_NOTIFICATIONS_GUIDE.md](./EMAIL_NOTIFICATIONS_GUIDE.md) - Email setup details
- [FIREBASE_FUNCTIONS_SETUP.md](./FIREBASE_FUNCTIONS_SETUP.md) - Cloud Functions setup
- [SESSION_MANAGEMENT_GUIDE.md](./SESSION_MANAGEMENT_GUIDE.md) - User sessions

---

**Last Updated:** December 31, 2025  
**Version:** 1.0  
**Total Notifications:** 18
