# Firestore Subcollection Structure

## Overview
All project-related data is now stored as Firestore subcollections under the main `projects` collection for better data organization, scalability, and real-time updates.

## Complete Collection Hierarchy

```
firestore/
├── projects/
│   ├── {projectId}/
│   │   ├── meetings/ (Subcollection)
│   │   │   └── {meetingId}/
│   │   │       └── All meeting fields
│   │   ├── tasks/ (Subcollection)
│   │   │   └── {taskId}/
│   │   │       ├── comments/ (Nested subcollection)
│   │   │       │   └── {commentId}/
│   │   │       │       ├── userId
│   │   │       │       ├── text
│   │   │       │       └── createdAt
│   │   │       ├── checklists/ (Nested subcollection)
│   │   │       │   └── {checklistId}/
│   │   │       │       ├── title
│   │   │       │       └── isCompleted
│   │   │       └── approvals/ (Nested subcollection)
│   │   │           ├── start/
│   │   │           │   ├── status (pending|approved|rejected)
│   │   │           │   ├── client
│   │   │           │   └── designer
│   │   │           └── completion/
│   │   │               ├── status (pending|approved|rejected)
│   │   │               ├── client
│   │   │               └── designer
│   │   ├── documents/ (Subcollection)
│   │   │   └── {docId}/
│   │   │       ├── comments/ (Nested subcollection)
│   │   │       │   └── {commentId}/
│   │   │       │       ├── userId
│   │   │       │       ├── text
│   │   │       │       └── createdAt
│   │   │       └── All document fields
│   │   ├── timelines/ (Subcollection)
│   │   │   └── {timelineId}/
│   │   │       ├── title
│   │   │       ├── startDate
│   │   │       ├── endDate
│   │   │       ├── milestone
│   │   │       └── status
│   │   ├── finances/ (Subcollection) ⭐ NEW
│   │   │   └── {recordId}/
│   │   │       ├── date
│   │   │       ├── description
│   │   │       ├── amount
│   │   │       ├── type (income|expense|designer-charge)
│   │   │       ├── status (paid|pending|overdue|hold)
│   │   │       └── adminApproved
│   │   └── activityLogs/ (Subcollection)
│   │       └── {logId}/
│   │           ├── userId
│   │           ├── action
│   │           └── timestamp
│   │
├── users/ (Top-level - all users)
├── designers/ (Top-level - designers only)
├── vendors/ (Top-level - vendors only)
└── clients/ (Top-level - clients only)
```

---

## Service Functions Reference

### ✅ Meetings (Already Implemented)
```typescript
// Create
await createMeeting(projectId, meetingData);

// Update
await updateMeeting(projectId, meetingId, updates);

// Delete
await deleteMeeting(projectId, meetingId);

// Real-time Subscribe
subscribeToProjectMeetings(projectId, (meetings) => {...})
```

### ✅ Tasks (Already Implemented)
```typescript
// Create
await createTask(projectId, taskData);

// Update
await updateTask(projectId, taskId, updates);

// Real-time Subscribe
subscribeToProjectTasks(projectId, (tasks) => {...})
```

### ✅ Task Comments (NEW - Nested Subcollection)
```typescript
// Add comment to task
await addCommentToTask(projectId, taskId, commentData);

// Delete comment from task
await deleteCommentFromTask(projectId, taskId, commentId);

// Fetch all comments for a task
await getTaskComments(projectId, taskId);

// Real-time Subscribe
subscribeToTaskComments(projectId, taskId, (comments) => {...})
```

### ✅ Task Checklists (NEW - Nested Subcollection)
```typescript
// Add checklist item
await addChecklistItem(projectId, taskId, checklistData);

// Update checklist item
await updateChecklistItem(projectId, taskId, checklistId, updates);

// Delete checklist item
await deleteChecklistItem(projectId, taskId, checklistId);

// Fetch all checklists for a task
await getTaskChecklists(projectId, taskId);

// Real-time Subscribe
subscribeToTaskChecklists(projectId, taskId, (checklists) => {...})
```

### ✅ Task Approvals (NEW - Nested Subcollection)
```typescript
// Update approval status (start or completion)
await updateTaskApproval(projectId, taskId, 'start', approvalData);
await updateTaskApproval(projectId, taskId, 'completion', approvalData);

// Get all approvals for a task
await getTaskApprovals(projectId, taskId);

// Real-time Subscribe
subscribeToTaskApprovals(projectId, taskId, (approvals) => {...})
```

### ✅ Timeline (Already Implemented)
```typescript
// Create
await createTimeline(projectId, timelineData);

// Update
await updateTimeline(projectId, timelineId, updates);

// Real-time Subscribe
subscribeToTimelines(projectId, (timelines) => {...})
```

### ✅ Project Financials (NEW - Moved from Global)
```typescript
// Create financial record (now project-scoped)
await createProjectFinancialRecord(projectId, recordData);

// Update financial record
await updateProjectFinancialRecord(projectId, recordId, updates);

// Delete financial record
await deleteProjectFinancialRecord(projectId, recordId);

// Fetch all financial records for project
await getProjectFinancialRecords(projectId);

// Real-time Subscribe
subscribeToProjectFinancialRecords(projectId, (records) => {...})
```

### ✅ Documents (Already Implemented)
```typescript
// Create
await createDocument(projectId, documentData);

// Document Comments (Nested)
await addCommentToDocument(projectId, docId, commentData);
subscribeToDocumentComments(projectId, docId, (comments) => {...})
```

---

## React Hooks Reference

### Task Management
```typescript
const { createNewTask, updateExistingTask, deleteExistingTask } = useTaskCrud(projectId);
```

### Meetings
```typescript
const { createNewMeeting, updateExistingMeeting, deleteExistingMeeting } = useMeetingCrud(projectId);
```

### Task Comments
```typescript
const { addNewTaskComment, deleteExistingTaskComment } = useTaskCommentCrud(projectId, taskId);
```

### Checklists
```typescript
const { addNewChecklistItem, updateExistingChecklistItem, deleteExistingChecklistItem } = useChecklistCrud(projectId, taskId);
```

### Task Approvals
```typescript
const { updateTaskApprovalStatus } = useTaskApprovalCrud(projectId, taskId);
```

### Timeline
```typescript
const { createNewTimeline, updateExistingTimeline, deleteExistingTimeline } = useTimelineCrud(projectId);
```

### Project Financials (NEW - Project-scoped)
```typescript
const { 
  createNewFinancialRecord, 
  updateExistingFinancialRecord, 
  deleteExistingFinancialRecord 
} = useProjectFinancialCrud(projectId);
```

---

## Data Saving Checklist

| Feature | Type | Subcollection Path | Status |
|---------|------|-------------------|--------|
| **Meetings** | Discovery, Progress, etc. | `projects/{projectId}/meetings` | ✅ SAVED |
| **Tasks** | Task items | `projects/{projectId}/tasks` | ✅ SAVED |
| **Task Comments** | Comments on tasks | `projects/{projectId}/tasks/{taskId}/comments` | ✅ SAVED |
| **Checklists** | Subtasks/Checklist items | `projects/{projectId}/tasks/{taskId}/checklists` | ✅ SAVED |
| **Approvals** | Task start & completion approvals | `projects/{projectId}/tasks/{taskId}/approvals` | ✅ SAVED |
| **Timeline** | Milestones & phases | `projects/{projectId}/timelines` | ✅ SAVED |
| **Financials** | Income, Expenses, Designer charges | `projects/{projectId}/finances` | ✅ SAVED (MOVED) |
| **Documents** | PDFs, CADs, Images | `projects/{projectId}/documents` | ✅ SAVED |
| **Document Comments** | Comments on documents | `projects/{projectId}/documents/{docId}/comments` | ✅ SAVED |

---

## Migration Notes

### Financial Records
- **Old Path:** `financialRecords/{recordId}` (Global collection)
- **New Path:** `projects/{projectId}/finances/{recordId}` (Project-scoped)
- **Benefit:** Better data isolation and easier querying by project

### Why Subcollections?
1. **Data Organization:** Related data stays together
2. **Real-time Sync:** Better performance with real-time listeners
3. **Security Rules:** Easier to enforce permissions at subcollection level
4. **Scalability:** Subcollections don't count towards document read limits
5. **Querying:** Can query within a project's scope more efficiently

---

## Example Usage in Components

```typescript
import { useProjectDetailsCrud } from '../hooks/useCrud';

function ProjectDetail({ projectId }) {
  const {
    tasks,
    meetings,
    financials,
    timelines,
    documents,
    loading,
    createNewTask,
    addNewTaskComment,
    updateExistingFinancialRecord
  } = useProjectDetailsCrud(projectId);

  const handleAddTask = async () => {
    await createNewTask({ title: 'New Task', ... });
  };

  const handleAddComment = async (taskId, comment) => {
    await addNewTaskComment(taskId, comment);
  };

  return (
    <div>
      {loading ? 'Loading...' : (
        <>
          <TaskList tasks={tasks} onComment={handleAddComment} />
          <MeetingList meetings={meetings} />
          <FinancialsList records={financials} />
        </>
      )}
    </div>
  );
}
```

---

## Key Points Summary

✅ **Meetings:** Saved to `projects/{projectId}/meetings`
✅ **Timeline:** Saved to `projects/{projectId}/timelines`
✅ **Tasks:** Saved to `projects/{projectId}/tasks`
✅ **Checklists:** Saved to `projects/{projectId}/tasks/{taskId}/checklists`
✅ **Task Comments:** Saved to `projects/{projectId}/tasks/{taskId}/comments`
✅ **Approvals:** Saved to `projects/{projectId}/tasks/{taskId}/approvals`
✅ **Financials:** Saved to `projects/{projectId}/finances` (NOW PROJECT-SCOPED)
✅ **Documents:** Saved to `projects/{projectId}/documents`
✅ **Document Comments:** Saved to `projects/{projectId}/documents/{docId}/comments`

All data is automatically synced in real-time through Firestore listeners!
