# Unsaved Changes Detection Feature

## Overview
This feature adds a confirmation dialog to modals/forms that prompts users to save their changes before closing when unsaved changes are detected.

## Implemented Components

### 1. **useUnsavedChanges Hook** (`hooks/useUnsavedChanges.ts`)
A custom React hook that tracks changes between initial and current form data.

**Features:**
- Deep comparison of form objects
- Support for nested objects and arrays
- Optional keys to ignore during comparison
- Returns `hasUnsavedChanges` boolean and `resetChanges` function

**Usage:**
```typescript
const { hasUnsavedChanges, resetChanges } = useUnsavedChanges(
  initialData,
  currentData,
  { ignoreKeys: ['id', 'createdAt'] }
);
```

### 2. **ConfirmDialog Component** (`components/ConfirmDialog.tsx`)
A reusable confirmation dialog component with customizable options.

**Props:**
- `isOpen`: Boolean to control visibility
- `onClose`: Function to call when dialog is closed
- `onConfirm`: Function to call when user confirms (Save & Exit)
- `title`: Dialog title (default: "Unsaved Changes")
- `message`: Dialog message
- `confirmText`: Text for confirm button (default: "Save & Exit")
- `cancelText`: Text for cancel button (default: "Don't Save")
- `variant`: Visual variant - 'danger' | 'warning' | 'info'

**Buttons:**
1. **Cancel** - Closes the dialog and returns to the form
2. **Don't Save** - Closes the form without saving
3. **Save & Exit** - Validates and saves the form, then closes

### 3. **Updated Components**

#### NewProjectModal (`components/NewProjectModal.tsx`)
- Tracks changes to project form data
- Detects file uploads (cover image, documents)
- Shows confirmation dialog on close if there are unsaved changes

#### MeetingForm (`components/MeetingForm.tsx`)
- Tracks changes to meeting form data
- Shows confirmation dialog on close/backdrop click if there are unsaved changes

#### PeopleList (`components/PeopleList.tsx`)
- Tracks changes to user form data (create/edit modal)
- Shows confirmation dialog on close if there are unsaved changes

## User Flow

1. User opens a modal and makes changes to form fields
2. User clicks close button (X) or Cancel button
3. If changes detected:
   - Confirmation dialog appears with 3 options:
     - **Cancel** - Return to editing
     - **Don't Save** - Discard changes and close
     - **Save & Exit** - Save changes and close
4. If no changes detected:
   - Modal closes immediately

## Technical Implementation

### Detection Logic
The hook compares initial data with current data using deep comparison:
- Handles primitive types
- Handles nested objects
- Handles arrays
- Supports ignoring specific keys

### Close Handler Pattern
```typescript
const handleClose = () => {
  if (hasUnsavedChanges) {
    setShowConfirmDialog(true);
  } else {
    onClose();
  }
};
```

### Save and Exit Handler
```typescript
const handleSaveAndExit = async () => {
  if (!validate()) {
    setShowConfirmDialog(false);
    return;
  }
  await handleSubmit(new Event('submit') as any);
};
```

## Benefits

1. **Prevents Data Loss** - Users won't accidentally lose their work
2. **Better UX** - Clear feedback when there are unsaved changes
3. **Consistent Behavior** - Same pattern across all modals
4. **Flexible** - Easy to add to new modals/forms
5. **Reusable** - Both hook and dialog component are reusable

## Future Enhancements

Consider adding this feature to other modals/forms in the application:
- Task editing modals
- Document upload forms
- Settings panels
- Any other forms where data loss prevention is valuable

## Browser Compatibility

The feature uses standard React hooks and portal APIs, so it works in all modern browsers that support React 16.8+.
