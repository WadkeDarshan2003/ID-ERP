import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook to track unsaved changes in forms/modals
 * Compares current form data with initial data to detect changes
 */
export function useUnsavedChanges<T>(
  initialData: T,
  currentData: T,
  options?: {
    enabled?: boolean; // Whether to enable tracking (default: true)
    ignoreKeys?: (keyof T)[]; // Keys to ignore when comparing
  }
) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialDataRef = useRef<T>(initialData);
  const enabled = options?.enabled !== false;

  // Update initial data reference when it changes
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);

  // Check for changes whenever currentData updates
  useEffect(() => {
    if (!enabled) {
      setHasUnsavedChanges(false);
      return;
    }

    const hasChanges = detectChanges(initialDataRef.current, currentData, options?.ignoreKeys);
    setHasUnsavedChanges(hasChanges);
  }, [currentData, enabled, options?.ignoreKeys]);

  const resetChanges = useCallback(() => {
    setHasUnsavedChanges(false);
    initialDataRef.current = currentData;
  }, [currentData]);

  return {
    hasUnsavedChanges,
    resetChanges,
  };
}

/**
 * Deep comparison function to detect changes between two objects
 */
function detectChanges<T>(
  initial: T,
  current: T,
  ignoreKeys?: (keyof T)[]
): boolean {
  if (initial === current) return false;
  
  if (typeof initial !== 'object' || typeof current !== 'object' || initial === null || current === null) {
    return initial !== current;
  }

  const initialKeys = Object.keys(initial) as (keyof T)[];
  const currentKeys = Object.keys(current) as (keyof T)[];
  
  // Filter out ignored keys
  const filteredInitialKeys = ignoreKeys 
    ? initialKeys.filter(key => !ignoreKeys.includes(key))
    : initialKeys;
  const filteredCurrentKeys = ignoreKeys
    ? currentKeys.filter(key => !ignoreKeys.includes(key))
    : currentKeys;

  // Check if number of keys changed
  if (filteredInitialKeys.length !== filteredCurrentKeys.length) {
    return true;
  }

  // Check each key
  for (const key of filteredInitialKeys) {
    if (!filteredCurrentKeys.includes(key)) {
      return true;
    }

    const initialValue = initial[key];
    const currentValue = current[key];

    // Handle arrays
    if (Array.isArray(initialValue) && Array.isArray(currentValue)) {
      if (initialValue.length !== currentValue.length) {
        return true;
      }
      for (let i = 0; i < initialValue.length; i++) {
        if (detectChanges(initialValue[i], currentValue[i])) {
          return true;
        }
      }
      continue;
    }

    // Recursively check nested objects
    if (typeof initialValue === 'object' && typeof currentValue === 'object' && initialValue !== null && currentValue !== null) {
      if (detectChanges(initialValue, currentValue)) {
        return true;
      }
      continue;
    }

    // Direct comparison
    if (initialValue !== currentValue) {
      return true;
    }
  }

  return false;
}
