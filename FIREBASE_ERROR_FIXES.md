# Firebase Error Fixes - Timeline & Task Updates

## Issues Identified & Fixed

### 1. **FirebaseError: No document to update**
**Error:** `FirebaseError: No document to update: projects/btw-erp/databases/(default)/documents/projects/JjsMHFJV0LPg7tmZ5Zfi/tasks/t8wfewjk7`

**Root Cause:** 
- Tasks were being updated in Firebase without first confirming they existed in the subcollection
- This happened when tasks were created locally but never synced to Firebase, or when syncing failed silently
- The app then tried to update these non-existent documents, causing the error

**Solution:**
- Added error handling in `handleSaveTask()` (line ~780) to catch the "not-found" error
- When update fails, the code now attempts to create the task instead
- Added try-catch wrapper around all Firebase operations for task updates

**Code Changes in ProjectDetail.tsx:**

```tsx
try {
  if (index >= 0) {
    // ... existing update logic ...
    try {
      await updateTask(project.id, taskData.id, taskData);
    } catch (updateError: any) {
      if (updateError.code === 'not-found' || updateError.message?.includes('No document')) {
        console.warn(`Task ${taskData.id} not found, creating instead...`);
        await createTask(project.id, taskData);
      } else {
        throw updateError;
      }
    }
  }
} catch (error: any) {
  addNotification('Error', `Failed to save task: ${error.message}`, 'error');
}
```

### 2. **Invalid Timeline Dates**
**Error:** Timeline entries were receiving invalid date formats, causing the timeline to fail or display incorrectly

**Root Cause:**
- Some places were calling `logTimelineEvent()` without proper date parameters
- Dates weren't being validated for YYYY-MM-DD format
- Invalid date strings were being passed to Firebase

**Solution:**
- Added comprehensive date validation in `logTimelineEvent()` function in projectDetailsService.ts
- Validates both startDate and endDate against YYYY-MM-DD regex pattern
- Falls back to today's date if invalid dates are provided
- Ensures endDate >= startDate

**Code Changes in projectDetailsService.ts:**

```tsx
// Validate and ensure dates are in YYYY-MM-DD format
const today = new Date().toISOString().split('T')[0];

let validStartDate = startDate || today;
let validEndDate = endDate || today;

// Validate startDate format (YYYY-MM-DD)
if (validStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(validStartDate)) {
  console.warn(`Invalid startDate format: ${validStartDate}, using today's date instead`);
  validStartDate = today;
}

// Ensure endDate >= startDate
if (new Date(validEndDate) < new Date(validStartDate)) {
  validEndDate = validStartDate;
}
```

### 3. **Kanban Status Update Sync Issues**
**Added similar error handling in `handleKanbanStatusUpdate()`:**
- Now catches Firebase errors when updating task status
- Recreates the task in Firebase if update fails
- Passes proper date parameters to timeline event logging

## Files Modified

1. **`/components/ProjectDetail.tsx`**
   - Enhanced `handleSaveTask()` with error recovery
   - Enhanced `handleKanbanStatusUpdate()` with error recovery and proper date handling
   - Added proper date parameters to all `logTimelineEvent()` calls

2. **`/services/projectDetailsService.ts`**
   - Enhanced `logTimelineEvent()` with date validation
   - Added format checking for YYYY-MM-DD
   - Added date range validation

## Testing Recommendations

1. **Test Task Creation & Update:**
   - Create a new task and verify it appears in Firestore under `projects/{projectId}/tasks`
   - Update the task and ensure it syncs without errors

2. **Test Timeline Events:**
   - Perform actions that trigger timeline events (create task, update status, add meeting)
   - Check Firebase Console → Firestore → `projects/{projectId}/timelines` to verify dates are valid YYYY-MM-DD format

3. **Test Error Recovery:**
   - Manually delete a task from Firestore subcollection
   - Try updating that task from the UI - it should recreate it instead of failing

## Browser Console Output

Watch for these console messages:
- ✅ `Timeline created: {title}` - Success
- ⚠️ `Invalid startDate format: {date}` - Date validation fallback
- ⚠️ `Task {id} not found in Firestore, creating instead...` - Task recreation
- ❌ Any Firebase errors should now be caught and logged properly

## Error Prevention Going Forward

1. Always pass valid YYYY-MM-DD dates to `logTimelineEvent()`
2. Use the date validation in `logTimelineEvent()` - it will handle invalid inputs gracefully
3. The try-catch blocks will recover from sync failures automatically
4. Check Firebase error logs if issues persist
