# Firebase Integration Setup Guide

## Overview
The ID ERP application has been successfully integrated with Firebase for real-time data synchronization. The application now uses Firebase Firestore as the primary database instead of mock data.

## What's New

### Created Files

#### 1. **services/firebaseService.ts**
- Real-time project synchronization
- Real-time user synchronization
- Financial records management
- Real-time listeners for live updates
- Database seeding capabilities

**Key Functions:**
- `getAllProjects()` - Fetch all projects
- `subscribeToProjects()` - Real-time project updates
- `getAllUsers()` - Fetch all users
- `subscribeToUsers()` - Real-time user updates
- `createFinancialRecord()` - Add financial transactions
- `subscribeToProjectFinancialRecords()` - Real-time financial updates
- `seedDatabase()` - Populate Firestore with initial data

#### 2. **services/authService.ts**
- Firebase Authentication wrapper
- Login/Signup functionality
- Real-time auth state monitoring
- Token management

**Key Functions:**
- `loginWithEmail()` - User login
- `signUpWithEmail()` - User registration
- `logout()` - Sign out
- `subscribeToAuthState()` - Real-time auth state
- `getCurrentUserToken()` - Get Firebase ID token

#### 3. **services/firebaseConfig.ts** (Previously Created)
- Firebase initialization with your credentials
- Exports configured services (auth, db, storage, analytics)

### Updated Files

#### **App.tsx**
- Integrated real-time data subscriptions
- Added Firebase data loading on component mount
- Implemented auto-seeding of mock data to Firebase (if database is empty)
- Added loading spinner during data fetch
- Real-time synchronization of projects and users

## Architecture

```
┌─────────────────────────────────────────────┐
│           React Components                  │
│    (Dashboard, ProjectDetail, etc.)         │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│      AuthContext & NotificationContext      │
│     (User state & Real-time updates)        │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│   Services Layer (Real-time Listeners)      │
│  - firebaseService.ts (projects/users)      │
│  - authService.ts (authentication)          │
│  - financialService.ts (billing)            │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│         Firebase (Realtime)                 │
│  ┌─────────────────────────────────────┐   │
│  │  Firestore Collections:             │   │
│  │  - projects                         │   │
│  │  - users                            │   │
│  │  - financialRecords                 │   │
│  └─────────────────────────────────────┘   │
│  ┌─────────────────────────────────────┐   │
│  │  Authentication:                    │   │
│  │  - Firebase Auth                    │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## Database Collections

### 1. **projects** Collection
```typescript
{
  id: string;
  name: string;
  description: string;
  clientId: string;
  leadDesignerId: string;
  status: ProjectStatus;
  type: ProjectType;           // DESIGNING | TURNKEY
  category: ProjectCategory;   // COMMERCIAL | RESIDENTIAL
  deadline: string;
  thumbnail: string;
  tasks: Task[];
  budget: number;
  spent: number;
  // ... other fields
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. **users** Collection
```typescript
{
  id: string;
  name: string;
  email: string;
  role: Role;                  // ADMIN | DESIGNER | CLIENT | VENDOR
  avatar: string;
  // ... other fields
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. **financialRecords** Collection
```typescript
{
  id: string;
  projectId: string;
  vendorId: string;
  amount: number;
  type: "PAYMENT" | "EXPENSE";
  vendorName: string;
  paidBy: string;
  paidTo: string;
  adminApproved: boolean;
  clientApproved: boolean;
  // ... other fields
  createdAt: Date;
  updatedAt: Date;
}
```

## Testing the Integration

### Option 1: Automatic Seeding (Recommended for Testing)
When you log in, if the Firebase database is empty, the app will automatically:
1. Detect empty Firestore collections
2. Seed the database with all mock data (17 projects + 8 users)
3. Establish real-time listeners
4. Display the seeded data

**Steps:**
1. Run `npm run dev`
2. Log in with any mock user credentials
3. App will automatically populate Firebase with mock data
4. You'll see all projects and users loaded from Firestore

### Option 2: Manual Database Setup
If you want to manually populate the database:

```typescript
// In browser console or component
import { seedDatabase } from './services/firebaseService';
import { MOCK_PROJECTS, MOCK_USERS } from './constants';

seedDatabase(MOCK_PROJECTS, MOCK_USERS)
  .then(() => console.log("Database seeded!"))
  .catch(err => console.error("Seeding error:", err));
```

### Option 3: Manual Data Addition
Add individual records using Firebase console:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to Firestore Database
4. Create collections and add documents manually

## Features Now Working with Real-Time Data

✅ **Projects Management** - Create, read, update, delete projects in real-time
✅ **User Management** - Manage team members with real-time updates
✅ **Financial Tracking** - Track project expenses and approvals
✅ **Notifications** - Real-time notification system
✅ **Dashboard** - Live project statistics
✅ **Project Details** - Edit projects and sync to Firebase
✅ **Vendor Management** - Track vendor tasks and payments
✅ **Category Sorting** - Commercial/Residential sorting persists to database

## Real-Time Features

### Live Updates Example
When Admin modifies a project:
```typescript
// In ProjectDetail.tsx
const handleUpdateProject = (updated: Project) => {
  await updateProject(updated.id, updated);
  // ALL users connected to Firebase will see the update in real-time
  // through subscribeToProjects listener
};
```

### Real-Time Financial Updates
```typescript
// Subscribe to vendor's financial records
subscribeToVendorFinancialRecords(vendorId, (records) => {
  // This callback fires every time records change for this vendor
  setVendorRecords(records);
});
```

## Deployment Considerations

### Before Production Deployment

1. **Security Rules** - Set up Firebase Firestore security rules
```json
{
  "rules_version": '2',
  "rules": {
    "projects": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'ADMIN'"
    },
    "users": {
      ".read": "auth != null",
      ".write": "auth != null && auth.uid == $uid"
    },
    "financialRecords": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'ADMIN'"
    }
  }
}
```

2. **Environment Variables** - Store Firebase config in `.env` file (don't commit to git)

3. **Rate Limiting** - Implement rate limiting for real-time listeners to prevent excessive database reads

4. **Indexing** - Create composite indexes in Firestore for complex queries

## Running the Application

```bash
# Install dependencies
npm install

# Run development server (with real-time Firebase sync)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Troubleshooting

### Issue: "Loading data from Firebase..." spinner stuck
**Solution:** Check Firebase credentials in `firebaseConfig.ts` and ensure network connectivity

### Issue: Data not persisting
**Solution:** Check Firestore security rules in Firebase Console - they might be blocking writes

### Issue: Real-time updates not working
**Solution:** 
- Verify Firebase config is correct
- Check browser console for errors
- Ensure unsubscribe functions are called on cleanup

### Issue: Authentication errors
**Solution:** 
- Verify email/password match user records in Firebase
- Check Firebase Authentication is enabled
- Ensure user role is set in Firestore `users` collection

## Next Steps

1. **User Authentication Integration** - Connect AuthContext with Firebase Authentication
2. **Offline Support** - Add Firestore offline persistence
3. **Cloud Functions** - Set up automated tasks (notifications, approvals)
4. **File Storage** - Use Cloud Storage for project thumbnails and documents
5. **Analytics** - Monitor usage patterns with Firebase Analytics
6. **Performance Optimization** - Implement caching and pagination

## File Structure
```
services/
├── firebaseConfig.ts      ← Firebase initialization
├── firebaseService.ts     ← CRUD operations & real-time listeners
├── authService.ts         ← Authentication
├── financialService.ts    ← Financial records management
└── geminiService.ts       ← Existing Gemini integration

components/
└── ... existing components use services above
```

## Support
For Firebase issues, refer to [Firebase Documentation](https://firebase.google.com/docs)
For project support, check the README.md in the root directory
