# Complete CRUD Operations Guide

## Overview
All entities in the ID ERP system are now connected to Firebase with full CRUD (Create, Read, Update, Delete) operations and role-based access control.

## Entity Structure

```
Database Structure:
├── projects/
│   ├── [projectId]/
│   │   ├── tasks/
│   │   ├── meetings/
│   │   ├── documents/
│   │   │   ├── [docId]/
│   │   │   │   └── comments/
│   │   ├── financialRecords/
│   │   └── activityLogs/
├── users/
└── financialRecords/
```

## Services & Hooks

### 1. **Projects (firebaseService.ts)**
```typescript
// CRUD Operations
await createProject(project)           // Create new project
await updateProject(projectId, data)   // Update project
await deleteProject(projectId)         // Delete project
await getProject(projectId)            // Get single project
await getAllProjects()                 // Get all projects

// Real-time
subscribeToProjects(callback)          // Listen to all projects
subscribeToUserProjects(userId, role)  // Listen to user's projects
```

**Hook:** `useProjectCrud()`
```typescript
const { createNewProject, updateExistingProject, deleteExistingProject, loading, error } = useProjectCrud();
```

---

### 2. **Tasks (projectDetailsService.ts)**
```typescript
// CRUD Operations
await createTask(projectId, task)                    // Create task
await updateTask(projectId, taskId, updates)        // Update task
await deleteTask(projectId, taskId)                 // Delete task
await getProjectTasks(projectId)                    // Get all tasks

// Real-time
subscribeToProjectTasks(projectId, callback)        // Listen to tasks
```

**Hook:** `useTaskCrud(projectId)`
```typescript
const { createNewTask, updateExistingTask, deleteExistingTask, loading } = useTaskCrud(projectId);

// Usage
await createNewTask({
  title: 'Task Name',
  description: 'Description',
  assigneeId: 'vendor-id',
  startDate: '2025-12-10',
  dueDate: '2025-12-20',
  priority: 'high',
  status: 'To Do',
  category: 'Civil',
  // ...
});
```

---

### 3. **Meetings (projectDetailsService.ts)**
```typescript
// CRUD Operations
await createMeeting(projectId, meeting)              // Create meeting
await updateMeeting(projectId, meetingId, updates)  // Update meeting
await deleteMeeting(projectId, meetingId)           // Delete meeting
await getProjectMeetings(projectId)                 // Get all meetings

// Real-time
subscribeToProjectMeetings(projectId, callback)     // Listen to meetings
```

**Hook:** `useMeetingCrud(projectId)`
```typescript
const { createNewMeeting, updateExistingMeeting, deleteExistingMeeting, loading } = useMeetingCrud(projectId);

// Usage
await createNewMeeting({
  title: 'Site Visit',
  date: '2025-12-15',
  type: 'Site Visit',
  attendees: ['user1', 'user2'],
  notes: 'Discussion points...'
});
```

---

### 4. **Documents (projectDetailsService.ts)**
```typescript
// CRUD Operations
await createDocument(projectId, doc)                 // Upload document
await updateDocument(projectId, docId, updates)     // Update document
await deleteDocument(projectId, docId)              // Delete document
await getProjectDocuments(projectId)                // Get all documents

// Real-time
subscribeToProjectDocuments(projectId, callback)    // Listen to documents

// Access Control
canUserAccessDocument(doc, userRole, userId)       // Check access
getAccessibleDocuments(docs, userRole, userId)     // Filter accessible
```

**Hook:** `useDocumentCrud(projectId)`
```typescript
const { createNewDocument, updateExistingDocument, deleteExistingDocument, loading } = useDocumentCrud(projectId);

// Usage
await createNewDocument({
  name: 'Blueprint.pdf',
  type: 'pdf',
  url: 'https://...',
  uploadedBy: 'user-id',
  uploadDate: '2025-12-10',
  sharedWith: ['Admin', 'Designer', 'Client']
});
```

---

### 5. **Comments (projectDetailsService.ts)**
```typescript
// CRUD Operations
await addCommentToDocument(projectId, docId, comment)      // Add comment
await deleteCommentFromDocument(projectId, docId, id)      // Delete comment
await getDocumentComments(projectId, docId)               // Get comments

// Real-time
subscribeToDocumentComments(projectId, docId, callback)   // Listen to comments
```

**Hook:** `useCommentCrud(projectId, documentId)`
```typescript
const { addNewComment, deleteExistingComment, loading } = useCommentCrud(projectId, docId);

// Usage
await addNewComment({
  userId: 'user-id',
  text: 'This blueprint looks good!',
  timestamp: new Date().toISOString()
});
```

---

### 6. **Financial Records (firebaseService.ts & projectDetailsService.ts)**
```typescript
// CRUD Operations
await createFinancialRecord(record)                  // Create transaction
await updateFinancialRecord(recordId, updates)      // Update transaction
await deleteFinancialRecord(recordId)               // Delete transaction
await getProjectFinancialRecords(projectId)         // Get project transactions
await getVendorFinancialRecords(vendorId)          // Get vendor transactions

// Real-time
subscribeToProjectFinancialRecords(projectId)       // Listen to project financials
subscribeToVendorFinancialRecords(vendorId)        // Listen to vendor financials

// Calculations
calculateProjectRevenue(records)                    // Total revenue
calculateVendorPayments(records)                    // Total expenses
calculatePendingApprovals(records)                  // Pending items
calculateApprovedAmount(records)                    // Approved total
```

**Hook:** `useFinancialCrud()`
```typescript
const { createNewRecord, updateExistingRecord, deleteExistingRecord, loading } = useFinancialCrud();

// Usage
await createNewRecord({
  date: '2025-12-10',
  description: 'Vendor payment',
  amount: 5000,
  type: 'expense',
  status: 'pending',
  category: 'Materials',
  vendorName: 'ABC Suppliers',
  paidBy: 'client',
  paidTo: 'vendor',
  adminApproved: false,
  clientApproved: false
});
```

---

### 7. **Users (firebaseService.ts)**
```typescript
// CRUD Operations
await createUser(user)                              // Create user
await updateUser(userId, updates)                  // Update user
await getUser(userId)                              // Get single user
await getAllUsers()                                // Get all users

// Real-time
subscribeToUsers(callback)                         // Listen to users
```

**Hook:** `useUserCrud()`
```typescript
const { createNewUser, updateExistingUser, loading } = useUserCrud();
```

---

### 8. **Team Members (projectDetailsService.ts)**
```typescript
// CRUD Operations
await addTeamMember(projectId, userId)             // Add to project
await removeTeamMember(projectId, userId)          // Remove from project
```

**Hook:** `useTeamMemberCrud(projectId)`
```typescript
const { addMember, removeMember, loading } = useTeamMemberCrud(projectId);

// Usage
await addMember('user-id');     // Add user to project team
await removeMember('user-id');  // Remove user from project
```

---

## Role-Based Access Control (roleBasedAccess.ts)

### Access Levels

```typescript
const access = getProjectAccess(user, project);

// Returns:
{
  canViewProject: boolean,        // View project
  canEditProject: boolean,        // Edit project details
  canDeleteProject: boolean,      // Delete project
  canManageTasks: boolean,        // Create/Edit/Delete tasks
  canManageMeetings: boolean,     // Create/Edit/Delete meetings
  canViewFinancials: boolean,     // View financial data
  canManageFinancials: boolean,   // Edit financial data (Admin only)
  canUploadDocuments: boolean,    // Upload files
  canManageTeam: boolean,         // Add/Remove team members
  canApproveCompletion: boolean   // Approve tasks/projects
}
```

### Role Permissions Matrix

| Permission | Admin | Lead Designer | Client | Vendor | Team Member |
|-----------|-------|---------------|--------|--------|-------------|
| View Project | ✅ | ✅ | ✅ | ✅ (if task assigned) | ✅ |
| Edit Project | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete Project | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage Tasks | ✅ | ✅ | ❌ | ✅ (own) | ❌ |
| Manage Meetings | ✅ | ✅ | ✅ | ❌ | ✅ |
| View Financials | ✅ | ✅ | ✅ | ❌ | ❌ |
| Manage Financials | ✅ | ❌ | ❌ | ❌ | ❌ |
| Upload Documents | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage Team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve Completion | ✅ | ❌ | ✅ | ❌ | ❌ |

### Access Helper Functions

```typescript
// Check if user can access specific document
const canAccess = canUserAccessDocument(doc, userRole, userId, clientId, designerId);

// Filter documents by user access
const visibleDocs = getAccessibleDocuments(docs, userRole, userId, clientId, designerId);

// Get visible tasks for user
const visibleTasks = getVisibleTasksForUser(tasks, user, project);

// Get visible meetings for user
const visibleMeetings = getVisibleMeetingsForUser(meetings, user, isTeamMember);

// Check if user can approve task
const canApprove = canUserApproveTask(user, approvals, 'admin' | 'client');
```

---

## Usage Examples

### Creating a Task with Database Sync
```typescript
import { useTaskCrud } from '../hooks/useCrud';

function TaskForm({ projectId }) {
  const { createNewTask, loading, error } = useTaskCrud(projectId);

  const handleSubmit = async (formData) => {
    try {
      const taskId = await createNewTask({
        title: formData.title,
        description: formData.description,
        assigneeId: formData.vendorId,
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        priority: 'high',
        status: 'To Do',
        category: 'Civil',
        dependencies: [],
        subtasks: [],
        comments: [],
        approvals: {
          start: { client: { status: 'pending' }, designer: { status: 'pending' } },
          completion: { client: { status: 'pending' }, designer: { status: 'pending' } }
        }
      });

      addNotification('Success', `Task created: ${taskId}`, 'success');
    } catch (err) {
      addNotification('Error', `Failed: ${err.message}`, 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button disabled={loading} type="submit">
        {loading ? 'Saving...' : 'Create Task'}
      </button>
    </form>
  );
}
```

### Uploading Document with Access Control
```typescript
import { useDocumentCrud } from '../hooks/useCrud';
import { getProjectAccess } from '../services/roleBasedAccess';

function DocumentUpload({ projectId, project, user }) {
  const access = getProjectAccess(user, project);
  const { createNewDocument, loading } = useDocumentCrud(projectId);

  if (!access.canUploadDocuments) {
    return <div>You don't have permission to upload documents.</div>;
  }

  const handleUpload = async (file) => {
    try {
      const docId = await createNewDocument({
        name: file.name,
        type: file.type,
        url: 'https://storage-url',
        uploadedBy: user.id,
        uploadDate: new Date().toISOString(),
        sharedWith: ['Admin', 'Designer', 'Client']
      });

      addNotification('Success', 'Document uploaded', 'success');
    } catch (err) {
      addNotification('Error', err.message, 'error');
    }
  };

  return <FileUploadUI onUpload={handleUpload} loading={loading} />;
}
```

### Financial Management with Approvals
```typescript
import { useFinancialCrud } from '../hooks/useCrud';
import { getFinancialAccess } from '../services/roleBasedAccess';

function FinancialForm({ projectId, project, user }) {
  const access = getFinancialAccess(user, project);
  const { createNewRecord, updateExistingRecord, loading } = useFinancialCrud();

  if (!access.canAdd) {
    return <div>Only admin can manage financials.</div>;
  }

  const handleSaveTransaction = async (formData) => {
    const recordId = await createNewRecord({
      date: formData.date,
      description: formData.description,
      amount: formData.amount,
      type: formData.type,
      status: 'pending',
      category: formData.category,
      vendorName: formData.vendor,
      paidBy: formData.paidBy,
      paidTo: formData.paidTo,
      adminApproved: false,
      clientApproved: false
    });

    addNotification('Success', 'Transaction recorded', 'success');
  };

  return <TransactionForm onSubmit={handleSaveTransaction} loading={loading} />;
}
```

---

## Database Firestore Rules (Security)

```json
{
  "rules_version": '2',
  "rules": {
    "projects": {
      "{projectId}": {
        ".read": "auth != null && (root.child('users').child(auth.uid).child('role').val() == 'Admin' || 
                 resource.data.clientId == auth.uid || 
                 resource.data.leadDesignerId == auth.uid || 
                 resource.data.teamMembers.hasChild(auth.uid))",
        ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() == 'Admin' || 
                 resource.data.leadDesignerId == auth.uid)",
        
        "tasks": {
          "{taskId}": {
            ".read": "true",
            ".write": "root.child('users').child(auth.uid).child('role').val() == 'Admin' || 
                     parent.parent.data.leadDesignerId == auth.uid"
          }
        },
        "meetings": {
          "{meetingId}": {
            ".read": "true",
            ".write": "root.child('users').child(auth.uid).child('role').val() == 'Admin'"
          }
        },
        "documents": {
          "{docId}": {
            ".read": "true",
            ".write": "root.child('users').child(auth.uid).child('role').val() == 'Admin' || 
                     parent.parent.data.leadDesignerId == auth.uid",
            "comments": {
              "{commentId}": {
                ".read": "true",
                ".write": "auth != null"
              }
            }
          }
        }
      }
    },
    "users": {
      "{userId}": {
        ".read": "auth.uid == $userId || root.child('users').child(auth.uid).child('role').val() == 'Admin'",
        ".write": "auth.uid == $userId"
      }
    },
    "financialRecords": {
      "{recordId}": {
        ".read": "root.child('users').child(auth.uid).child('role').val() != 'Vendor'",
        ".write": "root.child('users').child(auth.uid).child('role').val() == 'Admin'"
      }
    }
  }
}
```

---

## Real-Time Updates Flow

```
User Action
    ↓
Local State Update (UI feedback)
    ↓
CRUD Hook Called
    ↓
Firebase Operation
    ↓
Database Updated
    ↓
Real-time Listener Triggered (if subscribed)
    ↓
All Connected Clients Notified
    ↓
UI Reflects Changes
```

---

## Integration Checklist

- ✅ Project CRUD operations
- ✅ Task CRUD operations  
- ✅ Meeting CRUD operations
- ✅ Document CRUD operations
- ✅ Comment CRUD operations
- ✅ Financial CRUD operations
- ✅ User CRUD operations
- ✅ Team member management
- ✅ Role-based access control
- ✅ Real-time synchronization
- ✅ Activity logging
- ✅ Document sharing/permissions
- ⏳ Client forms connected
- ⏳ Vendor forms connected
- ⏳ Designer forms connected
- ⏳ Project detail forms connected

---

## Next Steps

1. Update all form components to use appropriate CRUD hooks
2. Implement role-based access checks in UI components
3. Add Firebase security rules
4. Set up real-time listeners in main components
5. Test all CRUD operations with different user roles
