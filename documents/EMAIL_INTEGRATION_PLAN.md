# Email Integration Plan for Notifications

## Current System Analysis

### Existing Infrastructure
- **Notification System**: In-app notifications via NotificationContext (React Context)
- **Backend**: Firebase Firestore for data storage
- **Authentication**: Firebase Auth with custom email/password
- **Users**: Have `email` field in User model
- **Notification Types**: info, success, warning, error

### Current Notification Scope
- In-app notifications with recipientId, projectId, and type
- Notifications display in NotificationPanel component
- Real-time toast notifications
- Read/unread tracking

---

## Email Integration Strategy

### Option 1: Firebase Cloud Functions (Recommended)
**Advantages:**
- Native Firebase integration
- Triggers on Firestore changes
- Serverless, no additional infrastructure
- Can schedule emails
- Cost-effective for low volume

**Disadvantages:**
- Requires Cloud Functions deployment
- Needs email service provider (SendGrid, Mailgun, etc.)
- Setup involves external service credentials

### Option 2: Third-Party Email Service (Alternative)
**Examples:** SendGrid, Mailgun, AWS SES, Nodemailer

**Advantages:**
- More control over email delivery
- Rich email template support
- Better delivery tracking
- No need for Cloud Functions

**Disadvantages:**
- Additional API calls from frontend/backend
- Separate service to maintain
- Additional costs

---

## Recommended Implementation: Firebase Cloud Functions + SendGrid

### Architecture Overview
```
User Action (e.g., Task Assigned)
    ↓
Add to Firestore "notifications" collection
    ↓
Cloud Function Trigger (onCreate)
    ↓
Fetch recipient user email
    ↓
Send email via SendGrid API
    ↓
Update notification status to "sent"
```

---

## Implementation Steps

### Phase 1: Setup SendGrid (or Similar Email Service)

1. **Create SendGrid Account**
   - Sign up at sendgrid.com
   - Verify sender email
   - Get API key
   - Create email templates

2. **Store Credentials**
   - Firebase Cloud Functions environment variables
   - `.env.local` (for development/testing)

### Phase 2: Create Firestore "notifications" Collection

**Structure:**
```
/projects/{projectId}/notifications/{notificationId}
  {
    type: "task_assigned" | "task_completed" | "document_shared" | "budget_approved" | "payment_received",
    title: string,
    message: string,
    recipientId: string,
    projectId: string,
    projectName: string,
    createdAt: timestamp,
    emailSent: boolean,
    emailSentAt: timestamp,
    readAt?: timestamp,
    metadata: {
      taskId?: string,
      taskTitle?: string,
      documentId?: string,
      documentName?: string
    }
  }
```

### Phase 3: Refactor NotificationContext

**Current Flow:**
```
addNotification() → Only in-memory storage → Lost on page refresh
```

**New Flow:**
```
addNotification() → In-memory AND Firestore → Cloud Function sends email → Persistent storage
```

**Changes:**
- `addNotification()` saves to Firestore `/projects/{projectId}/notifications`
- Also adds to local state for immediate UI feedback
- Firestore listener updates notifications in real-time

### Phase 4: Create Cloud Function

**File:** `functions/sendEmailNotification.ts`

```typescript
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

interface EmailTemplate {
  task_assigned: (data: any) => string;
  task_completed: (data: any) => string;
  document_shared: (data: any) => string;
  budget_approved: (data: any) => string;
  payment_received: (data: any) => string;
}

const emailTemplates: EmailTemplate = {
  task_assigned: (data) => `
    <h2>New Task Assigned</h2>
    <p>You have been assigned to: <strong>${data.taskTitle}</strong></p>
    <p>Project: ${data.projectName}</p>
    <p>Due Date: ${data.dueDate}</p>
    <a href="${data.actionUrl}">View Task</a>
  `,
  // ... other templates
};

export const sendEmailNotification = functions.firestore
  .document("projects/{projectId}/notifications/{notificationId}")
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    
    if (notification.emailSent) return; // Skip if already sent
    
    try {
      // Get recipient email from users collection
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(notification.recipientId)
        .get();
      
      const recipientEmail = userDoc.data()?.email;
      if (!recipientEmail) {
        console.error(`No email found for user ${notification.recipientId}`);
        return;
      }
      
      // Get email template
      const htmlContent = emailTemplates[notification.type]?.(notification.metadata);
      
      // Send email
      await sgMail.send({
        to: recipientEmail,
        from: process.env.SENDGRID_FROM_EMAIL!,
        subject: notification.title,
        html: htmlContent,
      });
      
      // Update notification status
      await snap.ref.update({
        emailSent: true,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
    } catch (error) {
      console.error("Error sending email:", error);
      // Could trigger retry or alert
    }
  });
```

### Phase 5: Update NotificationContext

**New addNotification function:**
```typescript
const addNotification = async (data: {
  title: string;
  message: string;
  type: Notification['type'];
  recipientId?: string;
  projectId?: string;
  projectName?: string;
  metadata?: Record<string, any>;
}) => {
  // 1. Add to local state immediately (for UI feedback)
  const newNotification: Notification = {
    id: Math.random().toString(36).substr(2, 9),
    ...data,
    timestamp: new Date(),
    read: false,
  };
  
  setNotifications(prev => [...prev, newNotification]);
  
  // 2. Save to Firestore (triggers Cloud Function for email)
  if (data.projectId) {
    try {
      await addDoc(
        collection(db, "projects", data.projectId, "notifications"),
        {
          ...data,
          createdAt: serverTimestamp(),
          emailSent: false,
        }
      );
    } catch (error) {
      console.error("Error saving notification to Firestore:", error);
      addNotification({
        title: "Error",
        message: "Failed to save notification",
        type: "error",
      });
    }
  }
};
```

### Phase 6: Update Component Calls

**Example - Task Assignment:**
```typescript
// In ProjectDetail.tsx or task assignment logic
const assignTask = async (taskId: string, assigneeId: string) => {
  // ... existing assignment logic
  
  // Add notification
  await addNotification({
    title: "Task Assigned",
    message: `You have been assigned to: ${taskTitle}`,
    type: "success",
    recipientId: assigneeId,
    projectId: currentProject.id,
    projectName: currentProject.name,
    metadata: {
      taskId,
      taskTitle,
      dueDate: task.dueDate,
      actionUrl: `${window.location.origin}/project/${currentProject.id}?tab=tasks&taskId=${taskId}`,
    }
  });
};
```

---

## Notification Events to Email

### 1. **Task Events**
- ✉️ Task assigned to user
- ✉️ Task marked as completed
- ✉️ Task due date approaching (48 hours before)
- ✉️ Task overdue
- ✉️ Task review requested

### 2. **Document Events**
- ✉️ Document shared with user
- ✉️ Document approval requested
- ✉️ Document approved/rejected

### 3. **Financial Events**
- ✉️ Budget increased
- ✉️ Payment received from client
- ✉️ Vendor expense approved
- ✉️ Designer charges calculated

### 4. **Project Events**
- ✉️ Project status changed
- ✉️ User added to project team
- ✉️ Meeting scheduled

### 5. **Meeting Events**
- ✉️ Meeting scheduled
- ✉️ Meeting reminder (24 hours before)

---

## Email Template Examples

### Task Assigned
```
Subject: New Task: {taskTitle}

Hi {recipientName},

You have been assigned to a new task in {projectName}.

Task: {taskTitle}
Status: {taskStatus}
Due Date: {dueDate}
Priority: {priority}

Description: {taskDescription}

[View Task Button]
```

### Document Shared
```
Subject: Document Shared: {documentName}

Hi {recipientName},

{senderName} has shared a document with you.

Document: {documentName}
Project: {projectName}
Type: {documentType}
Shared on: {shareDate}

[View Document Button]
```

### Budget Approved
```
Subject: Budget Approved - {projectName}

Hi {recipientName},

Budget of ₹{amount} has been approved for {projectName}.

Approved by: {approverName}
Reason: {approvalReason}
Effective Date: {effectiveDate}

[View Project Button]
```

---

## Configuration Checklist

### Required Environment Variables
```
SENDGRID_API_KEY=your_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
FIREBASE_PROJECT_ID=btw-erp
```

### Firestore Security Rules
```firestore
match /projects/{projectId}/notifications/{doc=**} {
  allow read: if request.auth.uid == resource.data.recipientId;
  allow create: if request.auth.uid != null; // Signed-in users can create
  allow update: if request.auth.uid == resource.data.recipientId; // Only recipient can update
}
```

### Firebase Cloud Functions Setup
```bash
cd functions
npm install @sendgrid/mail firebase-functions firebase-admin
firebase deploy --only functions:sendEmailNotification
```

---

## Security Considerations

1. **API Key Protection**: Store SendGrid API key in Firebase Functions environment variables only
2. **Email Privacy**: Never log full email addresses in client-side code
3. **Unsubscribe Links**: Add unsubscribe option in emails (compliance with CAN-SPAM, GDPR)
4. **Rate Limiting**: Implement rate limiting to prevent email spam
5. **User Preferences**: Add email notification preferences to User model

---

## Rollout Plan

### Phase 1: Setup (Week 1)
- [ ] Create SendGrid account
- [ ] Store API credentials
- [ ] Create Firestore notifications collection
- [ ] Write Cloud Function

### Phase 2: Testing (Week 2)
- [ ] Test with development environment
- [ ] Test all email templates
- [ ] Test error handling
- [ ] Load testing

### Phase 3: Integration (Week 3)
- [ ] Update NotificationContext
- [ ] Update component notification calls
- [ ] Test end-to-end flow
- [ ] User acceptance testing

### Phase 4: Deployment (Week 4)
- [ ] Deploy Cloud Functions to production
- [ ] Monitor email delivery
- [ ] Gather user feedback
- [ ] Iterate on templates

---

## Cost Estimate (SendGrid)

- **Free Tier**: 100 emails/day
- **Paid Plans**: Starting $20/month for 100,000 emails

For 50 active users with 5-10 notifications/day: ~100-500 emails/day → Free tier sufficient initially

---

## Next Steps

1. **Decision**: Confirm email service provider (SendGrid recommended)
2. **Account Setup**: Create accounts and get API keys
3. **Collection Design**: Finalize Firestore notifications collection structure
4. **Template Design**: Create HTML email templates
5. **Implementation**: Start with Phase 1
