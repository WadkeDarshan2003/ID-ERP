# Firebase Collections Setup Guide

Since auto-seeding is disabled, you need to manually create collections and add data in Firebase Console. Follow these steps:

## Step 1: Go to Firebase Console

1. Visit [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click on **Firestore Database** (left sidebar)
4. Click **Start Collection**

## Step 2: Create Top-Level Collections

### Collection 1: `users`
- Click **Start Collection**
- Collection ID: `users`
- Click **Next**
- Add a document with these fields:

```json
{
  "id": "user-1",
  "name": "Admin User",
  "role": "Admin",
  "email": "admin@iderpapp.com",
  "phone": "+91-9000000001",
  "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Admin",
  "company": "ID ERP"
}
```

Repeat for other users (Client, Designer, Vendor roles)

### Collection 2: `projects`
- Click **Start Collection**
- Collection ID: `projects`
- Click **Next**
- Add a document with these fields:

```json
{
  "id": "proj-1",
  "name": "Modern Office Design",
  "clientId": "client-1",
  "leadDesignerId": "designer-1",
  "teamMembers": ["vendor-1", "vendor-2"],
  "status": "In Progress",
  "type": "Designing",
  "category": "Commercial",
  "startDate": "2024-01-15",
  "deadline": "2024-03-15",
  "budget": 500000,
  "thumbnail": "https://images.unsplash.com/photo-1565183938294-7563f3ff68c5",
  "description": "Complete office interior redesign",
  "tasks": [],
  "financials": [],
  "meetings": [],
  "activityLog": [],
  "documents": [],
  "designerChargePercentage": 15
}
```

### Collection 3: `financialRecords`
- Click **Start Collection**
- Collection ID: `financialRecords`
- Click **Next**
- Add documents for financial transactions:

```json
{
  "projectId": "proj-1",
  "date": "2024-01-20",
  "description": "Design Fee Payment",
  "amount": 75000,
  "type": "designer-charge",
  "status": "paid",
  "category": "Design",
  "paidTo": "Designer Name",
  "adminApproved": true,
  "clientApproved": true
}
```

## Step 3: Create Sub-Collections for Each Project

For each project document, create these sub-collections:

### Sub-Collection: `projects/{projectId}/tasks`
```json
{
  "id": "task-1",
  "title": "Flooring Design",
  "description": "Design and select flooring material",
  "status": "In Progress",
  "category": "Flooring",
  "assigneeId": "designer-1",
  "startDate": "2024-01-15",
  "dueDate": "2024-01-25",
  "priority": "high",
  "dependencies": [],
  "subtasks": [],
  "comments": [],
  "approvals": {
    "start": { "status": "approved" },
    "completion": { "status": "pending" }
  }
}
```

### Sub-Collection: `projects/{projectId}/meetings`
```json
{
  "id": "meeting-1",
  "date": "2024-01-22",
  "title": "Project Kickoff",
  "attendees": ["Client Name", "Designer Name"],
  "notes": "Discussed project scope and timeline",
  "type": "Discovery"
}
```

### Sub-Collection: `projects/{projectId}/documents`
```json
{
  "id": "doc-1",
  "name": "Floor Plan.pdf",
  "type": "pdf",
  "url": "https://example.com/floor-plan.pdf",
  "uploadedBy": "designer-1",
  "uploadDate": "2024-01-18",
  "sharedWith": ["Admin", "Client", "Designer"]
}
```

### Sub-Collection: `projects/{projectId}/documents/{documentId}/comments`
```json
{
  "id": "comment-1",
  "userId": "client-1",
  "text": "Looks great! Please proceed.",
  "timestamp": "2024-01-18T10:30:00Z"
}
```

### Sub-Collection: `projects/{projectId}/activityLogs`
```json
{
  "id": "log-1",
  "userId": "designer-1",
  "action": "Created Task",
  "details": "Flooring Design task created",
  "timestamp": "2024-01-15T09:00:00Z",
  "type": "creation"
}
```

## Step 4: Set Security Rules

Go to **Firestore Database** → **Rules** tab and replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Allow authenticated users to read/write their own data
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId || 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin';
    }
    
    // Projects - role-based access
    match /projects/{projectId} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin' ||
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Designer';
      
      // Sub-collections
      match /tasks/{taskId} {
        allow read: if request.auth != null;
        allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Admin', 'Designer'];
      }
      
      match /meetings/{meetingId} {
        allow read: if request.auth != null;
        allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Admin', 'Designer', 'Client'];
      }
      
      match /documents/{documentId} {
        allow read: if request.auth != null;
        allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Admin', 'Designer'];
        
        match /comments/{commentId} {
          allow read: if request.auth != null;
          allow write: if request.auth != null;
        }
      }
      
      match /activityLogs/{logId} {
        allow read: if request.auth != null;
        allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin';
      }
    }
    
    // Financial Records
    match /financialRecords/{recordId} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin';
    }
  }
}
```

## Step 5: Test the App

1. Run `npm run dev`
2. Login with test credentials
3. Navigate to Dashboard/Projects
4. Data from Firebase collections should now appear

## Quick Reference: Collection Structure

```
Firestore Database
├── users/
│   ├── user-1
│   ├── user-2
│   └── user-3
├── projects/
│   ├── proj-1
│   │   ├── tasks/
│   │   ├── meetings/
│   │   ├── documents/
│   │   │   └── doc-1/
│   │   │       └── comments/
│   │   └── activityLogs/
│   └── proj-2
└── financialRecords/
    ├── fin-1
    └── fin-2
```

## Notes

- Document IDs should match the `id` field in the data
- All timestamps should be ISO 8601 format
- URLs for images/documents should be publicly accessible or from Firebase Storage
- Role values must exactly match: `Admin`, `Designer`, `Client`, `Vendor`
- Status values must match enums defined in `types.ts`
