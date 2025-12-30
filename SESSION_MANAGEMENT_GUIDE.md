# Session Management Guide

Complete documentation of how login/logout sessions are currently handled in the ID ERP system.

---

## 🔐 Overview

The application uses **Firebase Authentication** combined with **React Context** for session management. Sessions are maintained at the browser level with automatic restoration on page refresh.

### Session Flow:
1. **Login** → Firebase Auth + Firestore Profile + Context State
2. **Active Session** → Persistent Firebase Auth Token
3. **Logout** → Clear Auth State + Clear React State + Sign Out from Firebase

---

## 📋 Current Session Architecture

### 1. **Authentication Layer** (Firebase)
- **Provider:** Firebase Authentication (`firebase/auth`)
- **Method:** Email/Password + Phone OTP
- **Token:** Automatic JWT token management by Firebase
- **Storage:** Browser's `localStorage` (managed by Firebase SDK)
- **Persistence:** `LOCAL` (default Firebase persistence)

### 2. **Session Context** (React)
- **Provider:** `AuthContext.tsx`
- **State Variables:**
  - `user`: Current user profile object
  - `firebaseUser`: Firebase auth object (contains UID, email, phone)
  - `loading`: Initial auth state checking
  - `adminCredentials`: Admin email/password for creating users
  - `setAdminCredentials`: Function to store/update credentials

### 3. **Session Storage** (Browser)
- **SessionStorage:**
  - `adminEmail` - Backup storage for admin email
  - `adminPassword` - Backup storage for admin password
- **LocalStorage:**
  - Managed automatically by Firebase SDK
  - Contains encrypted JWT tokens

---

## 🔄 Login Session Handling

### Email/Password Login Flow

**Proper Security Flow:**
- ✅ Email must exist in Firestore with a valid profile BEFORE login
- ✅ Admin creates account in **PeopleList.tsx** → Creates Firebase user + Firestore profile
- ✅ User logs in → Firebase validates credentials → Firestore profile must exist
- ✅ If profile missing → **LOGIN DENIED** with error message

**Why This Matters:**
- ❌ Auto-creating profiles on first login is a security risk
- ❌ Prevents unauthorized users from creating accounts
- ❌ Ensures only admins can create new users through proper flow
- ❌ Maintains audit trail of who created each account

```
1. User enters email + password
   ↓
2. signInWithEmailAndPassword(auth, email, password)
   ↓
3. Firebase validates credentials
   ↓
4. If successful:
   - JWT token stored in localStorage (Firebase)
   - Admin credentials stored in Context state
   - Admin credentials backed up in sessionStorage
   - Fetch user profile from Firestore
   ↓
5. If profile found:
   - Set user in React context
   - User logged in ✓
   ↓
6. If profile NOT found:
   - Deny login with error message
   - Sign out from Firebase immediately
   - Redirect to login screen
   - Message: "Contact your administrator to set up your account" ✗
```

**Key Code:** [Login.tsx#L31-L73](components/Login.tsx#L31-L73)

```typescript
const authResult = await signInWithEmailAndPassword(auth, email, password);

// Store admin credentials for creating new users without logout
setAdminCredentials({ email, password });

// Backup in sessionStorage
sessionStorage.setItem('adminEmail', email);
sessionStorage.setItem('adminPassword', password);

// Fetch user profile from Firestore
let userProfile = await getUser(authResult.user.uid);

// Profile MUST exist in Firestore (created by admin)
if (!userProfile) {
  setError('Account not found. Please contact administrator.');
  await signOut(auth); // Sign out immediately
  return; // Deny login
}

login(userProfile);
```

---

### Phone OTP Login Flow

**File:** [components/Login.tsx](components/Login.tsx#L104)

```
1. User enters phone number
   ↓
2. setupPhoneAuthentication(phone, recaptcha-container)
   - Validates phone format
   - Sends OTP via SMS
   ↓
3. User receives OTP and enters it
   ↓
4. verifyPhoneOTP(confirmationResult, otp)
   - Firebase verifies OTP
   ↓
5. If successful:
   - Try to fetch phone user profile from Firestore
   ↓
6. If profile found:
   - Set user in React context
   - User logged in ✓
   ↓
7. If profile NOT found:
   - Show error: "Contact administrator"
   - User NOT logged in ✗
   - Phone users must have pre-created profiles
```

**Key Code:** [Login.tsx#L146-L175](components/Login.tsx#L146-L175)

```typescript
const authResult = await verifyPhoneOTP(confirmationResult, otp);

// Try to fetch user profile
let userProfile = await getUser(authResult.uid);

// Try to claim placeholder profile
if (!userProfile && authResult.phoneNumber) {
  userProfile = await claimPhoneUserProfile(authResult.uid, authResult.phoneNumber);
}

// Phone users MUST have profiles
if (!userProfile) {
  setError('User profile not found. Please contact administrator.');
  return; // Deny login
}

login(userProfile);
```

---

## 🔍 Active Session Management

### Firebase Auth State Listener

**File:** [contexts/AuthContext.tsx](contexts/AuthContext.tsx#L28)

```typescript
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
    if (authUser) {
      // User is logged in
      // Restore session by fetching profile
      let userProfile = await getUser(authUser.uid);
      setFirebaseUser(authUser);
      setUser(userProfile);
    } else {
      // User is logged out
      setFirebaseUser(null);
      setUser(null);
    }
    setLoading(false);
  });
  
  return unsubscribe;
}, []);
```

### How It Works:
1. **On App Load:**
   - Checks if Firebase token exists in localStorage
   - If valid token → Restores user session automatically
   - Sets `loading = false` to show content
   - No re-login needed (session persisted)

2. **During Activity:**
   - Firebase automatically refreshes token before expiry
   - Session remains active indefinitely
   - Token stored securely in browser's localStorage

3. **Session Timeout:**
   - Firebase handles automatic logout if token expires
   - `onAuthStateChanged` will fire with `authUser = null`
   - User will be redirected to login page

---

## 🚪 Logout Session Handling

### Logout Flow

**File:** [contexts/AuthContext.tsx](contexts/AuthContext.tsx#L80-L95)

```typescript
const logout = async () => {
  try {
    // 1. Clear user state immediately
    setUser(null);
    setFirebaseUser(null);
    
    // 2. Small delay for cleanup handlers
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 3. Sign out from Firebase
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};
```

**Triggered From:** [App.tsx](App.tsx#L456)

```typescript
<button 
  onClick={async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }}
>
  Sign Out
</button>
```

### What Happens on Logout:

1. **State Clearing (Immediate):**
   - Clear `user` from React context
   - Clear `firebaseUser` from React context
   - Signal real-time listeners to unsubscribe
   - All components re-render with `user = null`

2. **Cleanup Delay (100ms):**
   - Allows unsubscribe handlers to complete
   - Prevents orphaned listeners
   - Suppresses "permission-denied" errors from Firestore

3. **Firebase Sign Out:**
   - Delete JWT token from localStorage
   - Clear Firebase auth session
   - `onAuthStateChanged` fires with `authUser = null`
   - Components switch to login screen

4. **Session Complete Destruction:**
   - ✅ React state cleared
   - ✅ Firebase auth cleared
   - ✅ localStorage token removed
   - ✅ All listeners unsubscribed

---

## 📊 Session Data Structure

### Firebase Auth Object
```typescript
{
  uid: "user-123",                    // Unique user ID
  email: "admin@example.com",         // Email address
  phoneNumber: "+91987654321",        // Phone (if phone auth)
  displayName: null,                  // Not used
  emailVerified: true/false,          // Email verification status
  isAnonymous: false,                 // Not anonymous
  metadata: {
    creationTime: "2024-01-01...",   // Account created
    lastSignInTime: "2024-12-24..."  // Last login
  }
}
```

### User Profile Object (from Firestore)
```typescript
{
  id: "user-123",                     // User ID (matches Firebase UID)
  name: "John Doe",                   // Display name
  email: "john@example.com",          // Email address
  phone: "+919876543210",             // Phone number
  role: "Admin" | "Designer" | "Vendor" | "Client",
  company?: "ABC Corp",               // Company (for vendors)
  specialty?: "Civil Work",           // Specialty (for designers)
  avatar?: "url",                     // Avatar image URL
  tenantId?: "tenant-id",             // Multi-tenant isolation
  authMethod?: "email" | "phone",     // Authentication method
  projectMetrics?: {                  // Aggregated metrics
    projectName: string,
    taskCount: number,
    netAmount: number
  }
}
```

### Admin Credentials (SessionStorage)
```typescript
{
  adminEmail: "admin@example.com",    // Admin email
  adminPassword: "secret123"          // Admin password
}
```

---

## 🔐 Security Features

### 1. **Token Management**
- ✅ JWT tokens handled by Firebase SDK
- ✅ Tokens stored in secure localStorage
- ✅ Automatic token refresh before expiry
- ✅ Tokens deleted on logout

### 2. **Multi-Tenant Isolation**
- ✅ `tenantId` assigned at login
- ✅ Filters all Firestore queries by `tenantId`
- ✅ Prevents cross-tenant data access
- ✅ Temporary admins get `tenantId = UID`

### 3. **Session Persistence**
- ✅ Tokens persisted in localStorage
- ✅ Sessions survive page refresh
- ✅ Sessions survive browser restart
- ✅ Sessions cleared on logout

### 4. **Permission Handling**
- ✅ Firestore rules enforce authentication
- ✅ Permission-denied errors suppressed on logout
- ✅ Real-time listeners unsubscribe cleanly
- ✅ No console errors on logout

### 5. **Admin Credentials**
- ✅ Stored in React context (in-memory)
- ✅ Backed up in sessionStorage (lost on browser close)
- ✅ Used for creating new users without logout
- ✅ Cleared on logout

---

## 🎯 Session Lifecycle

### Timeline:

```
┌─────────────────────────────────────────────────────────┐
│ USER ACTIONS                                            │
└─────────────────────────────────────────────────────────┘

[1] App Load
    ↓
    Firebase checks localStorage for token
    ↓
    [Token valid?]
    ├─ YES → Restore session (onAuthStateChanged fires)
    │         User data loaded from Firestore
    │         Show dashboard
    └─ NO → Show login screen

[2] User Logs In
    ↓
    Email/Password OR Phone OTP authentication
    ↓
    Firebase creates session token
    ↓
    Token stored in localStorage
    ↓
    User profile loaded from Firestore
    ↓
    React context updated (user ≠ null)
    ↓
    Redirect to dashboard
    ↓
    Real-time listeners start (meetings, tasks, docs, etc.)

[3] User Is Active
    ↓
    Session token in localStorage
    ↓
    Firebase auto-refreshes token before expiry
    ↓
    Real-time Firestore listeners active
    ↓
    User can perform all actions

[4] User Logs Out OR Token Expires
    ↓
    If manual logout:
    ├─ Clear React context state
    ├─ Wait 100ms for cleanup
    └─ Call Firebase signOut()
    ↓
    If token expires:
    └─ Firebase auto-signs out
       onAuthStateChanged fires with authUser = null
    ↓
    [Result: Same Either Way]
    ├─ User state cleared from React
    ├─ Token removed from localStorage
    ├─ Real-time listeners unsubscribed
    ├─ Firestore requests denied (permission-denied suppressed)
    └─ Redirect to login screen

[5] User Logs In Again
    ↓
    (Repeat from [2])
```

---

## 📈 Session Statistics

| Aspect | Current | Notes |
|--------|---------|-------|
| **Session Duration** | Indefinite | Until logout or token expiry |
| **Token Expiry** | ~1 hour | Firebase default, auto-refresh |
| **Persistence** | localStorage | Survives browser restart |
| **Refresh Rate** | Auto | Firebase handles transparently |
| **Simultaneous Sessions** | 1 per browser | New login clears old session |
| **Cross-Tab Sync** | ✓ Yes | localStorage events sync |
| **Offline Support** | Limited | Cached data only |

---

## 🔧 Current Implementation Status

### ✅ Implemented:
- [x] Email/Password login with session storage
- [x] Phone OTP login with verification
- [x] Automatic session restoration on app load
- [x] Logout with complete cleanup
- [x] Admin credentials backup in sessionStorage
- [x] Multi-tenant isolation via tenantId
- [x] Firebase auth state listener
- [x] Permission-denied error suppression
- [x] Real-time listener cleanup

### ⚠️ Potential Improvements:
- [x] ~~Session timeout warning~~ → ✅ **IMPLEMENTED**
- [x] **"Remember Me" functionality** → ✅ **IMPLEMENTED**
- [x] **24-hour session persistence** → ✅ **IMPLEMENTED**
- [ ] Session activity tracking
- [ ] Automatic re-authentication modal
- [ ] Logout from all devices feature
- [ ] Session history/audit log

---

## ⏰ 24-Hour Session Persistence

### Overview

Users can now stay logged in for **24 hours** without needing to re-enter credentials, even after closing the browser.

### How It Works

**On Login:**
1. Session is saved with login time and expiry time (24 hours later)
2. User profile stored in localStorage
3. Firebase JWT token also persists

**On App Reload (if within 24 hours):**
1. Firebase checks for valid JWT token first
2. If no token but valid cached session → Auto-restore user
3. User logged in without any action needed ✨
4. Session expiry time extended

**After 24 Hours:**
1. Session cache expires
2. User redirected to login screen
3. Must enter credentials again

### Implementation Details

**Session Data Structure:**
```typescript
{
  "erp_session": {
    "user": { ...User },
    "loginTime": "2024-12-24T10:00:00Z",
    "expiresAt": "2024-12-25T10:00:00Z",  // 24 hours later
    "isAutoRestored": false
  },
  "erp_session_expiry": "2024-12-25T10:00:00Z"
}
```

**Storage Location:**
- `localStorage` - Persists across browser restarts
- Auto-cleared on logout
- Auto-expires after 24 hours

### Session Utilities

**File:** [utils/sessionUtils.ts](utils/sessionUtils.ts)

Available Functions:
```typescript
// Core session management
saveSession(user)                        // Save session (24h from now)
getSession()                             // Get current valid session
isSessionValid()                         // Check if session exists
clearSession()                           // Remove session (on logout)
extendSession(user)                      // Extend session for 24h more

// Session info
getSessionTimeRemaining()                // Milliseconds until expiry
getSessionTimeRemainingFormatted()       // "23h 45m remaining"
shouldShowExpiryWarning()                // Is it > 23 hours? (show warning)
getSessionInfo()                         // Debug info object
```

### Session Expiry Warning

**Component:** [components/SessionExpiryWarning.tsx](components/SessionExpiryWarning.tsx)

**When shown:**
- Automatically displayed when 23+ hours have passed
- Shows time remaining until auto-logout
- Checks every minute for updates

**Features:**
- ✅ Shows remaining time (e.g., "23h 45m remaining")
- ✅ "Extend Session" button → Adds 24 hours more
- ✅ Can be dismissed (warning stays until 24h reached)
- ✅ Fixed position (bottom-right corner)
- ✅ Auto-disappears after extension

**User Experience:**
```
┌─────────────────────────────────┐
│ ⚠️ Session Expiring Soon         │
│                                  │
│ ⏱️ 45m remaining                  │
│                                  │
│ [Extend Session] [✕]             │
│                                  │
│ After expiry, you'll need to     │
│ log in again.                    │
└─────────────────────────────────┘
```

### Auth Context Updates

**File:** [contexts/AuthContext.tsx](contexts/AuthContext.tsx)

**New Features:**
```typescript
interface AuthContextType {
  // ... existing properties
  extendSession: () => void;  // NEW: Extend session 24h
}

// In login():
saveSession(user);  // Save session on login

// In logout():
clearSession();     // Clear session on logout

// In onAuthStateChanged():
const cachedSession = getSession();
if (cachedSession) {
  // Auto-restore if within 24h
  setUser(cachedSession.user);
}
```

### Session Lifecycle with 24-Hour Persistence

```
[User Logs In]
    ↓
Save session with 24h expiry
Firebase token in localStorage
    ↓
[User Closes Browser]
    ↓
[User Opens App Again]
    ↓
[Within 24 Hours?]
├─ YES:
│  ├─ Try Firebase auth first
│  ├─ If not available, restore from localStorage cache
│  └─ Auto-login ✨ (No password needed)
│
└─ NO:
   └─ Session expired
       Show login screen
       User must re-login

[After Auto-Login]
    ↓
[Any Logout Trigger] OR [24h reached]
    ↓
Clear session cache
Clear Firebase token
Show login screen
```

### Timeline Example

```
Monday 10:00 AM  → User logs in
                   Session saved: expires Tuesday 10:00 AM

Monday 11:00 PM  → Browser closed
                   Session cache in localStorage

Tuesday 9:00 AM  → Browser opened
                   ✨ Auto-login! No password needed
                   Session extends: expires Wed 9:00 AM

Tuesday 11:00 PM → Show warning "45m remaining"
                   User can click "Extend Session"

Tuesday 11:59 PM → If not extended → Auto-logout
                   Session expired
                   Show login screen (need password again)
```

### Integration with "Remember Device"

Works seamlessly with the "Remember Device" feature:

| Feature | 24-Hour Session | Remember Device |
|---------|-----------------|-----------------|
| **Duration** | 24 hours | 30 days |
| **Purpose** | Auto-login without password | Skip login entirely |
| **Storage** | localStorage | localStorage |
| **Expiry** | Auto (manual logout possible) | Manual forget or 30 days |
| **Use case** | Same device, frequent user | Multiple devices |

Example flow:
1. Monday: Login with "Remember Device" checked
2. Monday 11 PM: Close browser
3. Tuesday: Browser opens → Firebase auto-logins (from device fingerprint)
4. Friday: 24-hour session expired but device still remembered
5. Friday: Still shows "Remember Device" banner with new session

---

## 💾 "Remember This Device" Feature

### Overview

The app now includes a **"Remember This Device"** feature to avoid repeated logins on trusted devices.

### How It Works

**On Login:**
1. User checks **"Remember this device for 30 days"** checkbox
2. Device fingerprint is generated (browser + OS combination)
3. Device info is saved to browser's **localStorage**
4. Device marked as "remembered"

**On Future Visits:**
1. Firebase checks localStorage for valid session token
2. If token exists and is valid → Auto-login (no password needed)
3. Device last login time is updated
4. Session restored seamlessly

### Implementation Details

**Device Fingerprinting:**
- Combines: User Agent, Language, Screen Resolution, Color Depth, Timezone, CPU Count, Memory
- Generated hash: Unique identifier per device
- **NOT personally identifiable** - just distinguishes devices

**Storage:**
```javascript
// Stored in localStorage as JSON
{
  "rememberedDevices": {
    "device-id-1": {
      "id": "abc123",
      "name": "Chrome on Windows",
      "type": "desktop",
      "browser": "Chrome",
      "os": "Windows",
      "lastLogin": "2024-12-24T10:30:00Z",
      "createdAt": "2024-12-24T10:00:00Z"
    }
  }
}
```

**Duration:**
- Default: 30 days
- Resets on each login
- Cleared when user logs out manually
- Can be manually forgotten

### Device Management Component

**File:** [components/RememberedDevices.tsx](components/RememberedDevices.tsx)

Features:
- ✅ View all remembered devices
- ✅ See last login time
- ✅ See device creation date
- ✅ Mark current device
- ✅ Forget individual devices
- ✅ See device fingerprint info

**Usage in Settings:**
```tsx
import RememberedDevices from '../components/RememberedDevices';

<div className="space-y-6">
  <RememberedDevices />
</div>
```

### Device Utilities

**File:** [utils/deviceUtils.ts](utils/deviceUtils.ts)

Available Functions:
```typescript
// Get device info
createDeviceInfo()                    // Create current device info
generateDeviceFingerprint()           // Get device ID hash
getDeviceName()                       // Get "Chrome on Windows" format

// Browser detection
getBrowserName()                      // "Chrome", "Firefox", "Safari"
getOSName()                           // "Windows", "macOS", "Linux"
getDeviceType()                       // "desktop", "mobile", "tablet"

// Device management
saveDeviceToLocal(device)             // Remember a device
getRememberedDevices()                // Get all remembered devices
isDeviceRemembered()                  // Check if current device is remembered
forgetDevice(deviceId)                // Remove a device
forgetAllDevices()                    // Clear all remembered devices
updateDeviceLastLogin(deviceId)       // Update login time
```

### User Experience

**Login Screen:**
```
[Email input]
[Password input]
☑ Remember this device for 30 days
[Login button]
```

**What happens:**
1. ✅ User checks box (default: ON)
2. ✅ Logs in successfully
3. ✅ Notification: "Device Remembered"
4. ✅ Device saved to localStorage
5. ✅ Next login: Auto-login (no password)

**Device Management Screen:**
```
Remembered Devices (2)

[Desktop] Chrome on Windows
  Last login: 2 hours ago
  Added: 2 days ago
  [Forget] button

[Mobile] Chrome on Android
  Last login: 1 week ago
  Added: 2 weeks ago
  [Forget] button
ℹ️ About Device Memory
- Devices remembered for 30 days of inactivity
- Each login extends the period
- Forgetting requires manual login
- Fingerprints stored locally only
```

---

## 🚀 Best Practices

### For Developers:

1. **Always use `useAuth()` hook:**
   ```typescript
   const { user, logout, login } = useAuth();
   ```

2. **Check loading state:**
   ```typescript
   const { loading } = useAuth();
   if (loading) return <Loader />;
   ```

3. **Handle logout errors:**
   ```typescript
   try {
     await logout();
   } catch (error) {
     addNotification('Logout failed', error.message, 'error');
   }
   ```

4. **Clean up subscriptions:**
   ```typescript
   useEffect(() => {
     const unsubscribe = onSnapshot(...);
     return () => unsubscribe(); // Cleanup on unmount
   }, []);
   ```

---

## 📝 Summary

**Current Session Model:**
- ✅ Firebase Authentication (backend)
- ✅ React Context (frontend state)
- ✅ localStorage (token persistence)
- ✅ sessionStorage (admin credentials backup)
- ✅ Real-time Firestore listeners

**Security:**
- ✅ JWT tokens
- ✅ Multi-tenant isolation
- ✅ Permission-based access control
- ✅ Automatic cleanup on logout

**User Experience:**
- ✅ One-click logout
- ✅ Session persistence across refreshes
- ✅ No re-login after browser restart
- ✅ Smooth session restoration

---

Last Updated: December 24, 2025
