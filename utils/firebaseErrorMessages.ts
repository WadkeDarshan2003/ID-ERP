// utils/firebaseErrorMessages.ts
// Maps Firebase Auth error codes to user-friendly messages for login window

const firebaseErrorMessages: Record<string, string> = {
  'auth/invalid-phone-number': 'The phone number entered is invalid. Please check and try again.',
  'auth/missing-phone-number': 'Please enter your phone number.',
  'auth/too-many-requests': 'Too many attempts. Please try again later or contact support.',
  'auth/quota-exceeded': 'SMS quota exceeded. Please try again later.',
  'auth/user-disabled': 'This account has been disabled. Contact support for help.',
  'auth/network-request-failed': 'Network error. Please check your connection and try again.',
  'auth/code-expired': 'The verification code has expired. Please request a new one.',
  'auth/invalid-verification-code': 'The code you entered is incorrect. Please try again.',
  'auth/session-expired': 'Session expired. Please request a new verification code.',
  // Add more as needed
};

export function getFirebaseErrorMessage(errorCode: string): string {
  return firebaseErrorMessages[errorCode] || 'An unexpected error occurred. Please try again.';
}
