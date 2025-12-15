# Firebase Storage Setup Guide

## Issue: 403 Forbidden Error on Document/Image Upload

If you're seeing this error when trying to upload documents or project images:
```
POST https://firebasestorage.googleapis.com/v0/b/btw-erp.firebasestorage.app/o?name=documents%2F...
403 (Forbidden)
```

This means your Firebase Storage security rules don't allow authenticated users to upload files.

## Solution: Update Firebase Storage Rules

### Step 1: Go to Firebase Console
1. Visit [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **ID-ERP** (or **btw-erp**)
3. Click on **Storage** in the left sidebar
4. Click on the **Rules** tab

### Step 2: Replace the Rules

Replace the current rules with this configuration:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to read and write to all paths
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Optional: More restrictive rules (uncomment to use instead)
    // match /documents/{projectId}/{allPaths=**} {
    //   allow read: if request.auth != null;
    //   allow write: if request.auth != null && request.auth.uid != null;
    // }
    // 
    // match /thumbnails/{projectId}/{allPaths=**} {
    //   allow read: if request.auth != null;
    //   allow write: if request.auth != null && request.auth.uid != null;
    // }
  }
}
```

### Step 3: Publish the Rules

1. Click the **Publish** button
2. Confirm the update in the dialog that appears
3. Wait for the rules to be deployed (usually a few seconds)

### Step 4: Test the Upload

Once the rules are deployed, try uploading a document or project image again. It should now work without the 403 error.

## Storage Paths in the Application

The application organizes uploaded files as follows:

### Documents
- **Path**: `documents/{projectId}/{timestamp}_{fileName}`
- **Example**: `documents/hsgorXSq7KzGxaZmE6ir/1765278904555_certificate.pdf`
- **Usage**: Uploaded via the Documents tab in Project Details

### Thumbnails
- **Path**: `thumbnails/{projectId}/{timestamp}_{fileName}`
- **Example**: `thumbnails/hsgorXSq7KzGxaZmE6ir/1765278904555_project_image.jpg`
- **Usage**: Project cover images uploaded via Edit Project modal

## Security Considerations

The rules above allow any authenticated user to read and write to all paths. For production use, consider implementing more restrictive rules:

### Recommended Production Rules

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Documents - allow authenticated users
    match /documents/{projectId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid != null;
      allow delete: if request.auth != null && request.auth.uid != null;
    }
    
    // Thumbnails - allow authenticated users
    match /thumbnails/{projectId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid != null;
      allow delete: if request.auth != null && request.auth.uid != null;
    }
    
    // Deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## Troubleshooting

### Still getting 403 errors?

1. **Clear browser cache** - Sometimes the browser caches old rules
2. **Check authentication** - Ensure you're logged in to the application
3. **Verify rules are published** - Check Firebase Console to confirm the rules were saved
4. **Check file size** - Firebase Storage has limits on file uploads
5. **Wait a few minutes** - Sometimes rule changes take a moment to propagate

### Check Firebase Console Logs

1. Go to **Storage** → **Files**
2. Look for any error messages
3. Go to **Storage** → **Rules** to verify your current rules are correct

## Files Involved

- **ProjectDetail.tsx** (Line ~550): Document upload handler
- **ProjectDetail.tsx** (Line ~3535): Project thumbnail upload handler
- **services/firebaseConfig.ts**: Firebase Storage configuration

## Related Documentation

- [Firebase Storage Documentation](https://firebase.google.com/docs/storage)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
