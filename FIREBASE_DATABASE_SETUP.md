# Firebase Database Setup - Complete Step-by-Step Guide

## Overview

Your app needs the following collections and structure in Firestore:

```
Firestore Database
├── users/                          (Top-level collection)
│   ├── [admin-uid]
│   ├── [client-uid]
│   ├── [designer-uid]
│   └── [vendor-uid]
│
├── projects/                       (Top-level collection)
│   ├── [project-id-1]/
│   │   ├── tasks/
│   │   ├── meetings/
│   │   ├── documents/
│   │   │   └── [doc-id]/comments/
│   │   └── activityLogs/
│   └── [project-id-2]/
│
└── financialRecords/               (Top-level collection)
    ├── [fin-record-1]
    └── [fin-record-2]
```

---

## Step 1: Go to Firestore

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **btw-erp**
3. Click **Firestore Database** (left sidebar)
4. If not created yet, click **Create Database**
   - Start in **production mode**
   - Select region closest to you
   - Click **Create**

---

## Step 2: Create USERS Collection

### 2a. Create Collection
1. Click **+ Start collection**
2. Collection ID: `users`
3. Click **Next**

### 2b. Add Admin User

**Document ID:** Paste your Firebase Authentication UID for the admin account

To get the UID:
- Go to **Authentication** tab
- Click on your admin user email
- Copy the **User UID**

**Add these fields:**

| Field | Type | Value |
|-------|------|-------|
| `id` | String | Paste the UID here |
| `name` | String | `Admin User` |
| `email` | String | `admin@iderpapp.com` |
| `role` | String | `Admin` |
| `phone` | String | `+91-9000000001` |
| `avatar` | String | `https://api.dicebear.com/7.x/avataaars/svg?seed=admin` |
| `company` | String | `ID ERP` |

**Steps:**
1. In Document ID field, paste the UID
2. Click **Save**
3. In the document, click **+ Add field**
4. Add each field from the table above

### 2c. Add Client User (Optional for now)

Repeat the same process:
- Document ID: Client's Firebase UID
- Fields:
  - `id`: [Client UID]
  - `name`: `Client Name`
  - `email`: `client@example.com`
  - `role`: `Client`
  - `phone`: `+91-9000000002`
  - `avatar`: `https://api.dicebear.com/7.x/avataaars/svg?seed=client`

### 2d. Add Designer User (Optional)

- Document ID: Designer's Firebase UID
- Fields:
  - `id`: [Designer UID]
  - `name`: `Designer Name`
  - `email`: `designer@example.com`
  - `role`: `Designer`
  - `specialty`: `Modern Minimalist`
  - `avatar`: `https://api.dicebear.com/7.x/avataaars/svg?seed=designer`

### 2e. Add Vendor User (Optional)

- Document ID: Vendor's Firebase UID
- Fields:
  - `id`: [Vendor UID]
  - `name`: `Vendor Company Name`
  - `email`: `vendor@example.com`
  - `role`: `Vendor`
  - `company`: `Vendor Company`
  - `specialty`: `Electrical`
  - `avatar`: `https://api.dicebear.com/7.x/avataaars/svg?seed=vendor`

---

## Step 3: Create PROJECTS Collection

### 3a. Create Collection
1. Click **+ Add collection**
2. Collection ID: `projects`
3. Click **Next**

### 3b. Add a Project Document

**Document ID:** `proj-1` (you can use any ID)

**Add these fields:**

| Field | Type | Value |
|-------|------|-------|
| `id` | String | `proj-1` |
| `name` | String | `Modern Office Design` |
| `description` | String | `Complete office interior redesign` |
| `clientId` | String | [Client UID] |
| `leadDesignerId` | String | [Designer UID] |
| `teamMembers` | Array | [Leave empty for now] |
| `status` | String | `In Progress` |
| `type` | String | `Designing` |
| `category` | String | `Commercial` |
| `startDate` | String | `2024-01-15` |
| `deadline` | String | `2024-03-15` |
| `budget` | Number | `500000` |
| `thumbnail` | String | `https://images.unsplash.com/photo-1565183938294-7563f3ff68c5` |
| `tasks` | Array | [Leave empty] |
| `financials` | Array | [Leave empty] |
| `meetings` | Array | [Leave empty] |
| `documents` | Array | [Leave empty] |
| `activityLog` | Array | [Leave empty] |

**Steps:**
1. Document ID: Type `proj-1`
2. Click **Save**
3. Click **+ Add field** and add each field
4. For Array fields, just leave them empty

---

## Step 4: Create Sub-Collections for Project

Now you need to create sub-collections INSIDE the project document.

### 4a. Create TASKS Sub-Collection

1. Open the project document `proj-1`
2. Scroll down and click **+ Start subcollection**
3. Collection ID: `tasks`
4. Click **Next**
5. Document ID: `task-1`
6. Add fields:

| Field | Type | Value |
|-------|------|-------|
| `id` | String | `task-1` |
| `title` | String | `Flooring Design` |
| `description` | String | `Design and select flooring material` |
| `status` | String | `In Progress` |
| `category` | String | `Flooring` |
| `assigneeId` | String | [Designer UID] |
| `startDate` | String | `2024-01-15` |
| `dueDate` | String | `2024-01-25` |
| `priority` | String | `high` |
| `dependencies` | Array | [Leave empty] |
| `subtasks` | Array | [Leave empty] |
| `comments` | Array | [Leave empty] |
| `approvals` | Map | Create nested map |

For `approvals` map field:
- Create a **Map** field
- Add nested maps:
  - `start` → Object with `client` and `designer`
  - `completion` → Object with `client` and `designer`

Simple version - leave it empty for now

### 4b. Create MEETINGS Sub-Collection

1. Go back to project document `proj-1`
2. Click **+ Start subcollection**
3. Collection ID: `meetings`
4. Document ID: `meeting-1`
5. Add fields:

| Field | Type | Value |
|-------|------|-------|
| `id` | String | `meeting-1` |
| `date` | String | `2024-01-22` |
| `title` | String | `Project Kickoff` |
| `attendees` | Array | `["Client Name", "Designer Name"]` |
| `notes` | String | `Discussed project scope and timeline` |
| `type` | String | `Discovery` |

### 4c. Create DOCUMENTS Sub-Collection

1. Go back to project document `proj-1`
2. Click **+ Start subcollection**
3. Collection ID: `documents`
4. Document ID: `doc-1`
5. Add fields:

| Field | Type | Value |
|-------|------|-------|
| `id` | String | `doc-1` |
| `name` | String | `Floor Plan.pdf` |
| `type` | String | `pdf` |
| `url` | String | `https://example.com/floor-plan.pdf` |
| `uploadedBy` | String | [Designer UID] |
| `uploadDate` | String | `2024-01-18` |
| `sharedWith` | Array | `["Admin", "Client", "Designer"]` |

### 4d. Create COMMENTS Sub-Collection (Inside Document)

1. Open the document `doc-1`
2. Click **+ Start subcollection**
3. Collection ID: `comments`
4. Document ID: `comment-1`
5. Add fields:

| Field | Type | Value |
|-------|------|-------|
| `id` | String | `comment-1` |
| `userId` | String | [Client UID] |
| `text` | String | `Looks great! Please proceed.` |
| `timestamp` | String | `2024-01-18T10:30:00Z` |

### 4e. Create ACTIVITYLOGS Sub-Collection

1. Go back to project document `proj-1`
2. Click **+ Start subcollection**
3. Collection ID: `activityLogs`
4. Document ID: `log-1`
5. Add fields:

| Field | Type | Value |
|-------|------|-------|
| `id` | String | `log-1` |
| `userId` | String | [Designer UID] |
| `action` | String | `Created Task` |
| `details` | String | `Flooring Design task created` |
| `timestamp` | String | `2024-01-15T09:00:00Z` |
| `type` | String | `creation` |

---

## Step 5: Create FINANCIALRECORDS Collection

### 5a. Create Collection
1. Click **+ Add collection**
2. Collection ID: `financialRecords`
3. Click **Next**

### 5b. Add Financial Record

**Document ID:** `fin-1`

**Add these fields:**

| Field | Type | Value |
|-------|------|-------|
| `id` | String | `fin-1` |
| `projectId` | String | `proj-1` |
| `date` | String | `2024-01-20` |
| `description` | String | `Design Fee Payment` |
| `amount` | Number | `75000` |
| `type` | String | `designer-charge` |
| `status` | String | `paid` |
| `category` | String | `Design` |
| `paidTo` | String | `Designer Name` |
| `adminApproved` | Boolean | `true` |
| `clientApproved` | Boolean | `true` |

---

## Step 6: Verify Your Setup

Your Firestore should now look like:

```
users/
  ├── [admin-uid]
  │   ├── id: [admin-uid]
  │   ├── name: Admin User
  │   ├── email: admin@iderpapp.com
  │   └── role: Admin
  │
  ├── [client-uid] (Optional)
  └── [designer-uid] (Optional)

projects/
  ├── proj-1
  │   ├── id: proj-1
  │   ├── name: Modern Office Design
  │   ├── tasks/
  │   │   └── task-1
  │   ├── meetings/
  │   │   └── meeting-1
  │   ├── documents/
  │   │   └── doc-1
  │   │       └── comments/
  │   │           └── comment-1
  │   └── activityLogs/
  │       └── log-1

financialRecords/
  └── fin-1
```

---

## Step 7: Test the App

1. Run `npm run dev`
2. Try logging in with admin account
3. You should see the project on the Dashboard
4. Check Clients/Designers/Vendors pages (should be empty if you only created admin)

---

## Important Notes

### Document IDs
- **users**: Must match Firebase Authentication UID exactly
- **projects**: Can be any ID (we use `proj-1`, `proj-2`, etc.)
- **tasks, meetings, documents**: Can be any ID

### Array Fields
Leave array fields (`tasks`, `financials`, `meetings`, `documents`, `teamMembers`) empty when creating. The app will populate them when you add data through the UI.

### Timestamps
Use ISO 8601 format: `YYYY-MM-DDTHH:MM:SSZ` (e.g., `2024-01-18T10:30:00Z`)

### URLs
For images, use publicly accessible URLs (Unsplash, Picsum, etc.)

### Allowed Values

**Status**: `Planning`, `In Progress`, `Procurement`, `Completed`, `On Hold`

**Task Status**: `To Do`, `In Progress`, `Review`, `Done`, `Overdue`, `Aborted`, `On Hold`

**Type**: `Designing`, `Turnkey`

**Category**: `Commercial`, `Residential`

**Financial Type**: `income`, `expense`, `designer-charge`

**Financial Status**: `paid`, `pending`, `overdue`, `hold`

**Role**: `Admin`, `Designer`, `Client`, `Vendor`

**Meeting Type**: `Discovery`, `Progress`, `Site Visit`, `Vendor Meet`

---

## Common Issues

### "User not found"
- Check that the document ID in users collection matches the Firebase UID
- Verify spelling and case

### Empty Projects/Clients/Vendors pages
- This is normal - you haven't added any data yet
- Add projects through the app UI or manually in Firestore

### "Failed to get document"
- Wait a few seconds and refresh
- Check internet connection
- Verify Firestore is accessible

---

## Next Steps

After completing this setup:
1. ✅ Admin can login
2. ✅ Dashboard shows 1 project
3. ⏳ Create more projects through the app UI
4. ⏳ Add clients, designers, vendors through People section
5. ⏳ Create tasks, meetings, documents for projects
