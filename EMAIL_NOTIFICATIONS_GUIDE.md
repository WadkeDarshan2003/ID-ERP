# Email Notifications Guide

Complete documentation of all automated email notifications in the ID ERP system.

## 📧 Overview

The system sends automated email notifications for key events across tasks, documents, meetings, and finances. All emails include direct navigation links and are sent to relevant stakeholders.

---

## 🎯 Task Notifications

### 1. Task Assignment/Creation Email
**Trigger:** When a new task is created or assignee is changed  
**Recipients:** Task assignee  
**Content:**
- Task title & description
- Due date (formatted as Indian date)
- Project name & category
- Direct task link with tab navigation

**Direct Link:** `?projectId={projectId}&taskId={taskId}&tab=plan`

---

### 2. Task Completion Approval Notification
**Trigger:** When task status changes to REVIEW or DONE (100% progress)  
**Recipients:** Client + Admin  
**Content:**
- Task title & category
- Status: "100% Complete - Awaiting Final Approval"
- Due date
- Required approvals (Client + Admin)
- Direct task link

**Direct Link:** `?projectId={projectId}&taskId={taskId}&tab=plan`

---

### 3. Task Comment Notification
**Trigger:** When someone adds a comment to a task  
**Recipients:** Task assignee, Lead Designer, Client (excludes commenter)  
**Content:**
- Task title & status
- Commenter name
- Full comment text (highlighted in orange box)
- Direct task link

**Direct Link:** `?projectId={projectId}&taskId={taskId}&tab=plan`

---

### 4. Task Due Date Reminder
**Trigger:** 24 hours before task due date  
**Recipients:** Task assignee  
**Content:**
- Task title & project name
- Due date (formatted as Indian date)
- Task description
- Priority level

---

## 📄 Document Notifications

### 1. Document Comment Notification
**Trigger:** When someone adds a comment to a document  
**Recipients:** Lead Designer, Client, Shared users (excludes commenter)  
**Content:**
- Document name & type
- Approval status (Admin approval level shown)
- Commenter name
- Full comment text (highlighted in orange box)
- Direct documents tab link

**Direct Link:** `?projectId={projectId}&tab=documents`

---

### 2. Document Admin Approval Notification
**Trigger:** When admin approves or rejects a document  
**Recipients:** Client + Document shared users  
**Content:**
- Document name & type
- Admin name
- Approval status (Approved ✅ / Rejected ❌)
- Direct documents tab link

**Direct Link:** `?projectId={projectId}&tab=documents`

**Color-coded:** 
- Green background for approval
- Red background for rejection

---

### 3. Document Client Approval Notification
**Trigger:** When client approves or rejects a document  
**Recipients:** Admin/Lead Designer + Document shared users (excludes client)  
**Content:**
- Document name & type
- Client name
- Approval status (Approved ✅ / Rejected ❌)
- Direct documents tab link

**Direct Link:** `?projectId={projectId}&tab=documents`

**Color-coded:**
- Green background for approval
- Red background for rejection

---

## 💬 Meeting Notifications

### 1. Meeting Creation/Update Email
**Trigger:** When meeting is created or updated  
**Recipients:** All attendees  
**Content:**
- Meeting title & date
- Meeting type (Discovery, Progress, Site Visit, etc.)
- List of all attendees
- Meeting notes
- Meeting link for direct navigation

**Direct Link:** `?projectId={projectId}&meetingId={meetingId}&tab=meetings`

**Email indicates:** "created" or "updated"

---

## 💰 Financial Notifications

### 1. Additional Budget Approval Notification
**Trigger:** When client or admin approves/rejects additional budget request  
**Recipients:** Admin/Lead Designer + Client  
**Content:**
- Record type: "Additional Budget"
- Description & amount (₹)
- Status (Approved ✅ / Rejected ❌)
- Approver name & role
- ⚠️ Warning banner: "This is a request to increase project budget. Both Client and Admin approval required."
- Direct financials tab link

**Direct Link:** `?projectId={projectId}&tab=financials`

**Color-coded:**
- Green background for approval
- Red background for rejection

---

### 2. Payment Approval Notification
**Trigger:** When client or admin confirms/disputes a received payment  
**Recipients:** Admin/Lead Designer + Client  
**Content:**
- Record type: "Payment"
- Payment description & amount (₹)
- Status (Confirmed ✅ / Disputed ❌)
- Approver name & role
- Direct financials tab link

**Direct Link:** `?projectId={projectId}&tab=financials`

**Color-coded:**
- Green background for confirmation
- Red background for dispute

---

### 3. Expense Approval Notification
**Trigger:** When client or admin approves/rejects an expense  
**Recipients:** Admin/Lead Designer + Client  
**Content:**
- Record type: "Expense"
- Expense description & amount (₹)
- Status (Approved ✅ / Rejected ❌)
- Approver name & role
- Direct financials tab link

**Direct Link:** `?projectId={projectId}&tab=financials`

**Color-coded:**
- Green background for approval
- Red background for rejection

---

## 📊 Email Summary Table

| Event | Trigger | Recipients | Link Destination |
|-------|---------|------------|------------------|
| Task Assignment | Create/Update task | Assignee | Task detail (plan tab) |
| Task Completion Approval | Status → REVIEW/DONE | Client + Admin | Task detail (plan tab) |
| Task Comment | Comment added | Assignee, Designer, Client | Task detail (plan tab) |
| Task Reminder | 24h before due | Assignee | N/A |
| Document Comment | Comment added | Designer, Client, Shared | Documents tab |
| Document Admin Approval | Admin approves/rejects | Client, Shared users | Documents tab |
| Document Client Approval | Client approves/rejects | Designer, Shared users | Documents tab |
| Meeting Notification | Create/Update | All attendees | Meeting detail |
| Additional Budget | Approval action | Admin, Client | Financials tab |
| Payment | Confirmation action | Admin, Client | Financials tab |
| Expense | Approval action | Admin, Client | Financials tab |

---

## 🔗 Link Format Standards

All emails include clickable buttons with direct navigation:

```
Base URL: ?projectId={projectId}&tab={tabName}
```

**Tab Names:**
- `plan` - Task details
- `documents` - Documents section
- `meetings` - Meetings section
- `financials` - Financial records section

**Task-specific:** `&taskId={taskId}`  
**Meeting-specific:** `&meetingId={meetingId}`

---

## ✉️ Email Features

### Common Features
- ✅ Professional HTML formatting
- ✅ Color-coded status (Green for approval, Red for rejection)
- ✅ Direct clickable buttons
- ✅ Works for logged-in and logged-out users
- ✅ Formatted currency (₹ with locale formatting)
- ✅ Formatted dates (Indian date format)
- ✅ Commenter/Approver names prominently displayed
- ✅ Content previews (comments show full text)

### Email Headers
- Themed color backgrounds
- Clear status emoji (✅ ❌ 💬 etc.)
- Project name included

### Email Footers
- System signature
- Professional closing

---

## 🚀 Implementation Status

✅ All email notifications are **fully active and integrated**  
✅ All emails include **direct navigation links**  
✅ All emails are **professionally formatted**  
✅ No errors in compilation

---

## 📝 Email Service Functions

All emails are triggered through these main services:

**Main Notification Functions:**
- `sendTaskCreationEmail()` - Task assignments
- `sendTaskCommentNotificationEmail()` - Task comments
- `sendTaskCompletionApprovalNotificationEmail()` - Completion approvals
- `sendTaskReminder()` - Due date reminders
- `sendDocumentCommentNotificationEmail()` - Document comments
- `sendDocumentAdminApprovalNotificationEmail()` - Admin approvals
- `sendDocumentClientApprovalNotificationEmail()` - Client approvals
- `sendMeetingNotificationEmail()` - Meeting notifications
- `sendFinancialApprovalNotificationEmail()` - Financial approvals

**Core Email Service:**
- `sendEmail()` - Sends HTML-formatted emails via email service

---

## 📍 Notification Triggers in Code

**Tasks** - [ProjectDetail.tsx](components/ProjectDetail.tsx)
- Line ~1911: Task creation notification
- Line ~1881: Task assignee change notification
- Line ~2180: Task completion approval notification
- Line ~2348: Task comment notification

**Documents** - [ProjectDetail.tsx](components/ProjectDetail.tsx)
- Line ~1110: Document admin approval/rejection
- Line ~1145: Document client approval/rejection
- Line ~1195: Document comment notification

**Meetings** - [ProjectDetail.tsx](components/ProjectDetail.tsx)
- Line ~566: Meeting creation notification
- Line ~588: Meeting update notification

**Finances** - [ProjectDetail.tsx](components/ProjectDetail.tsx)
- Line ~1750: Additional budget approval
- Line ~1830: Payment approval
- Line ~1890: Expense approval

---

## 🔐 Privacy & Security

- ✅ Only relevant stakeholders receive notifications
- ✅ Commenters are excluded from their own comment notifications
- ✅ Client/Admin approvals only sent to involved parties
- ✅ No sensitive data in email subjects
- ✅ Direct links require user login to view details

---

Last Updated: December 24, 2025
