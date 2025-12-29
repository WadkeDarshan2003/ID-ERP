/**
 * Session Management Utilities
 * Handles 24-hour session persistence and auto-restore
 */

import { User } from '../types';

const SESSION_KEY = 'erp_session';
const SESSION_EXPIRY_KEY = 'erp_session_expiry';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_WARNING_MS = 23 * 60 * 60 * 1000; // Warn at 23 hours

export interface SessionData {
  user: User;
  loginTime: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
  isAutoRestored: boolean;
}

/**
 * Save session to localStorage
 */
export const saveSession = (user: User): void => {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

    const sessionData: SessionData = {
      user,
      loginTime: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isAutoRestored: false
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    localStorage.setItem(SESSION_EXPIRY_KEY, expiresAt.toISOString());

    if (process.env.NODE_ENV !== 'production') {
      console.log('💾 Session saved. Expires at:', expiresAt.toISOString());
    }
  } catch (error) {
    console.error('Failed to save session:', error);
  }
};

/**
 * Get current session from localStorage
 */
export const getSession = (): SessionData | null => {
  try {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    if (!sessionStr) return null;

    const session: SessionData = JSON.parse(sessionStr);
    const expiresAt = new Date(session.expiresAt);
    const now = new Date();

    // Check if session has expired
    if (now > expiresAt) {
      clearSession();
      return null;
    }

    return session;
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
};

/**
 * Check if session is still valid
 */
export const isSessionValid = (): boolean => {
  const session = getSession();
  return session !== null;
};

/**
 * Get remaining session time in milliseconds
 */
export const getSessionTimeRemaining = (): number => {
  const session = getSession();
  if (!session) return 0;

  const expiresAt = new Date(session.expiresAt);
  const now = new Date();
  const remaining = expiresAt.getTime() - now.getTime();

  return Math.max(0, remaining);
};

/**
 * Get remaining session time as human-readable string
 */
export const getSessionTimeRemainingFormatted = (): string => {
  const ms = getSessionTimeRemaining();

  if (ms <= 0) return 'Session expired';

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
};

/**
 * Check if should show expiry warning (23 hours passed)
 */
export const shouldShowExpiryWarning = (): boolean => {
  const session = getSession();
  if (!session) return false;

  const loginTime = new Date(session.loginTime);
  const now = new Date();
  const elapsedTime = now.getTime() - loginTime.getTime();

  return elapsedTime >= SESSION_WARNING_MS;
};

/**
 * Extend session by 24 hours
 */
export const extendSession = (user: User): void => {
  saveSession(user);
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔄 Session extended for another 24 hours');
  }
};

/**
 * Clear session from localStorage
 */
export const clearSession = (): void => {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    if (process.env.NODE_ENV !== 'production') {
      console.log('🗑️ Session cleared');
    }
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
};

/**
 * Get session info for debugging
 */
export const getSessionInfo = () => {
  const session = getSession();
  if (!session) return null;

  return {
    user: session.user.name,
    email: session.user.email,
    loginTime: new Date(session.loginTime).toLocaleString(),
    expiresAt: new Date(session.expiresAt).toLocaleString(),
    timeRemaining: getSessionTimeRemainingFormatted(),
    isAutoRestored: session.isAutoRestored
  };
};
