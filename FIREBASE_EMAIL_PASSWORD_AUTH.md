# Firebase Email/Password Authentication Setup

Your app is now configured to use Firebase Email/Password authentication. Here's how to set it up:

## Step 1: Enable Email/Password Authentication in Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** (left sidebar)
4. Click on **Sign-in method** tab
5. Click on **Email/Password** provider
6. Toggle **Enable** 
7. Click **Save**

## Step 2: Create Users in Firebase Authentication

1. Still in **Authentication**, go to **Users** tab
2. Click **Add user**
3. Enter:
   - **Email**: `user@example.com`
   - **Password**: `password123` (minimum 6 characters)
4. Click **Add user**
5. Repeat for all your users (Clients, Designers, Vendors, Admin)

Example users to create:
```
admin@iderpapp.com / admin123
designer1@iderpapp.com / designer123
vendor1@iderpapp.com / vendor123
client1@iderpapp.com / client123
```

## Step 3: Create User Profiles in Firestore

For each user created in Firebase Authentication, you must also create a matching document in the `users` collection in Firestore.

**IMPORTANT**: The document ID must match the Firebase Authentication UID.

### How to get the UID:

1. Go to **Authentication** > **Users** tab
2. Click on a user's email address
3. Copy the **User UID** value

### Create User Document:

1. Go to **Firestore Database**
2. Click on **users** collection
3. Click **Add document**
4. Document ID: Paste the UID from step 2
5. Add these fields:

```json
{
  "id": "paste-uid-here",
  "name": "User Full Name",
  "email": "user@iderpapp.com",
  "role": "Admin|Designer|Client|Vendor",
  "phone": "+91-9000000000",
  "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=username",
  "company": "Company Name (for vendors)"
}
```

**Example for Admin:**
```json
{
  "id": "abc123def456ghi789",
  "name": "Admin User",
  "email": "admin@iderpapp.com",
  "role": "Admin",
  "phone": "+91-9000000001",
  "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
  "company": "ID ERP"
}
```

**Example for Designer:**
```json
{
  "id": "xyz789abc123def456",
  "name": "John Designer",
  "email": "designer1@iderpapp.com",
  "role": "Designer",
  "phone": "+91-9000000002",
  "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=designer",
  "specialty": "Modern Minimalist"
}
```

## Step 4: Test Login

1. Run `npm run dev`
2. You'll see the login screen with Email/Password form
3. Enter the credentials you created in Firebase Authentication
4. If the Firestore user profile exists, you'll be logged in

## Troubleshooting

### "User profile not found"
- Make sure you created a matching document in Firestore `users` collection
- The document ID must exactly match the Firebase UID
- Check that all required fields are present

### "Invalid credentials"
- Check the email and password are correct
- Make sure the user exists in Firebase Authentication
- Check for typos (email/password are case-sensitive for the password)

### "User profile not found but I created it"
- Verify the Document ID matches the Firebase UID exactly
- Go to Authentication > Users, click on the user, copy the UID
- Go to Firestore > users collection, check the Document ID
- They must be identical

## User Roles

Valid roles are:
- `Admin` - Full system access
- `Designer` - Can create projects, manage tasks, view financials
- `Client` - Can view their projects, approve tasks, manage meetings
- `Vendor` - Can view assigned tasks and documents

## Security Rules

Update Firestore Security Rules to protect user data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    match /users/{userId} {
      // Users can read all users (for team selection)
      allow read: if request.auth != null;
      // Users can only write their own profile, admins can write anyone's
      allow write: if request.auth.uid == userId || 
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin';
    }
    
    match /projects/{projectId} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['Admin', 'Designer'];
    }
    
    match /financialRecords/{recordId} {
      allow read: if request.auth != null;
      allow write: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin';
    }
  }
}
```

## Important Notes

1. **Never commit Firebase credentials** - They're already in `.gitignore`
2. **Passwords must be at least 6 characters** - Firebase minimum requirement
3. **Email must be unique** - Firebase enforces this
4. **User ID must match** - Firestore UID must match Authentication UID
5. **All fields are required** - name, email, role are mandatory

## Next Steps

1. ✅ Enable Email/Password authentication
2. ✅ Create users in Firebase Authentication
3. ✅ Create matching user profiles in Firestore
4. ✅ Test login with your credentials
5. ⏳ Add projects, clients, vendors, designers via the app
6. ⏳ Create tasks, meetings, documents for projects
