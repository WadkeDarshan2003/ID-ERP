import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  QueryConstraint,
  Unsubscribe,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { Task, Meeting, ProjectDocument, Comment, Role, FinancialRecord, Timeline, SubTask } from "../../types";

// ============ AUTO-LOG TIMELINE EVENTS ============
/**
 * Helper function to automatically create timeline events for project activities
 * This function is called from various handlers to log events to the timeline subcollection
 */
export const logTimelineEvent = async (
  projectId: string,
  title: string,
  description: string,
  status: 'planned' | 'in-progress' | 'completed' | 'delayed' = 'completed',
  startDate?: string,
  endDate?: string
): Promise<string> => {
  try {
    // Get current timestamp with time
    const now = new Date();
    const todayFull = now.toISOString(); // Full ISO timestamp
    
    let validStartDate = startDate || todayFull;
    let validEndDate = endDate || todayFull;
    
    // Helper function to ensure a date string has time component
    const ensureFullTimestamp = (dateStr: string, defaultTime: string): string => {
      // If it's already a full ISO timestamp with time, return as-is
      if (dateStr.includes('T') && dateStr.includes('Z')) {
        return dateStr;
      }
      
      // If it's just a date (YYYY-MM-DD), append the current time
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const dateObj = new Date(defaultTime);
        const datePart = dateStr;
        const timePart = defaultTime.split('T')[1]; // Extract time from full timestamp
        return `${datePart}T${timePart}`;
      }
      
      return dateStr;
    };
    
    // Validate and ensure full timestamp for startDate
    if (validStartDate && !/^\d{4}-\d{2}-\d{2}/.test(validStartDate)) {
      console.warn(`Invalid startDate format: ${validStartDate}, using current timestamp instead`);
      validStartDate = todayFull;
    } else if (validStartDate) {
      // Check if date is actually valid
      const startDateObj = new Date(validStartDate);
      if (isNaN(startDateObj.getTime())) {
        console.warn(`Invalid startDate value: ${validStartDate}, using current timestamp instead`);
        validStartDate = todayFull;
      } else {
        // Ensure it has a time component
        validStartDate = ensureFullTimestamp(validStartDate, todayFull);
      }
    }
    
    // Validate and ensure full timestamp for endDate
    if (validEndDate && !/^\d{4}-\d{2}-\d{2}/.test(validEndDate)) {
      console.warn(`Invalid endDate format: ${validEndDate}, using current timestamp instead`);
      validEndDate = todayFull;
    } else if (validEndDate) {
      // Check if date is actually valid
      const endDateObj = new Date(validEndDate);
      if (isNaN(endDateObj.getTime())) {
        console.warn(`Invalid endDate value: ${validEndDate}, using current timestamp instead`);
        validEndDate = todayFull;
      } else {
        // Ensure it has a time component
        validEndDate = ensureFullTimestamp(validEndDate, todayFull);
      }
    }
    
    // Ensure endDate >= startDate
    if (new Date(validEndDate) < new Date(validStartDate)) {
      validEndDate = validStartDate;
    }
    
    const timelineEvent: Omit<Timeline, 'id'> = {
      projectId,
      title,
      description,
      status,
      type: 'milestone',
      startDate: validStartDate,
      endDate: validEndDate,
      createdAt: new Date().toISOString()
    };
    return await createTimeline(projectId, timelineEvent);
  } catch (error) {
    console.error("Error logging timeline event:", error);
    throw error;
  }
};

// ============ TASKS COLLECTION ============

export const createTask = async (projectId: string, task: Omit<Task, 'id'>): Promise<string> => {
  try {
    const tasksRef = collection(db, "projects", projectId, "tasks");
    const newDocRef = doc(tasksRef);
    // Remove undefined values before sending to Firebase
    const cleanedTask = Object.fromEntries(
      Object.entries({ ...task }).filter(([_, v]) => v !== undefined)
    );
    if (process.env.NODE_ENV !== 'production') console.log("Creating task with data:", cleanedTask);
    await setDoc(newDocRef, {
      ...cleanedTask,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return newDocRef.id;
  } catch (error) {
    console.error("Error creating task:", error);
    throw error;
  }
};

export const updateTask = async (projectId: string, taskId: string, updates: Partial<Task>): Promise<void> => {
  try {
    // Remove undefined values before sending to Firebase
    const cleanedUpdates = Object.fromEntries(
      Object.entries({ ...updates }).filter(([_, v]) => v !== undefined)
    );
    if (process.env.NODE_ENV !== 'production') console.log(`📤 Updating task ${taskId} with:`, cleanedUpdates);
    await updateDoc(doc(db, "projects", projectId, "tasks", taskId), {
      ...cleanedUpdates,
      updatedAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Task ${taskId} updated in Firestore`);
  } catch (error) {
    console.error("Error updating task:", error);
    throw error;
  }
};

export const deleteTask = async (projectId: string, taskId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "tasks", taskId));
  } catch (error) {
    console.error("Error deleting task:", error);
    throw error;
  }
};

export const getProjectTasks = async (projectId: string): Promise<Task[]> => {
  try {
    const snapshot = await getDocs(collection(db, "projects", projectId, "tasks"));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Task));
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return [];
  }
};

export const subscribeToProjectTasks = (projectId: string, callback: (tasks: Task[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "tasks"), (snapshot) => {
    const tasks = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Task));
    callback(tasks);
  });
};

// ============ MEETINGS COLLECTION ============

export const createMeeting = async (projectId: string, meeting: Omit<Meeting, 'id'>): Promise<string> => {
  try {
    const meetingsRef = collection(db, "projects", projectId, "meetings");
    const newDocRef = doc(meetingsRef);
    // Remove undefined values before sending to Firebase
    const cleanedMeeting = Object.fromEntries(
      Object.entries({ ...meeting }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(newDocRef, {
      ...cleanedMeeting,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return newDocRef.id;
  } catch (error) {
    console.error("Error creating meeting:", error);
    throw error;
  }
};

export const updateMeeting = async (projectId: string, meetingId: string, updates: Partial<Meeting>): Promise<void> => {
  try {
    // Remove undefined values before sending to Firebase
    const cleanedUpdates = Object.fromEntries(
      Object.entries({ ...updates }).filter(([_, v]) => v !== undefined)
    );
    await updateDoc(doc(db, "projects", projectId, "meetings", meetingId), {
      ...cleanedUpdates,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error("Error updating meeting:", error);
    throw error;
  }
};

export const deleteMeeting = async (projectId: string, meetingId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "meetings", meetingId));
  } catch (error) {
    console.error("Error deleting meeting:", error);
    throw error;
  }
};

export const getProjectMeetings = async (projectId: string): Promise<Meeting[]> => {
  try {
    const snapshot = await getDocs(collection(db, "projects", projectId, "meetings"));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Meeting));
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return [];
  }
};

export const subscribeToProjectMeetings = (projectId: string, callback: (meetings: Meeting[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "meetings"), (snapshot) => {
    const meetings = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Meeting));
    callback(meetings);
  });
};

// ============ MEETING COMMENTS SUBCOLLECTION ============

export const addCommentToMeeting = async (
  projectId: string,
  meetingId: string,
  comment: Omit<Comment, 'id'>
): Promise<string> => {
  try {
    const commentsRef = collection(db, "projects", projectId, "meetings", meetingId, "comments");
    const newCommentRef = doc(commentsRef);
    // Remove undefined values before sending to Firebase
    const cleanedComment = Object.fromEntries(
      Object.entries({ ...comment }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(newCommentRef, {
      ...cleanedComment,
      createdAt: new Date()
    });
    return newCommentRef.id;
  } catch (error) {
    console.error("Error adding comment to meeting:", error);
    throw error;
  }
};

export const deleteCommentFromMeeting = async (
  projectId: string,
  meetingId: string,
  commentId: string
): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "meetings", meetingId, "comments", commentId));
  } catch (error) {
    console.error("Error deleting meeting comment:", error);
    throw error;
  }
};

export const getMeetingComments = async (projectId: string, meetingId: string): Promise<Comment[]> => {
  try {
    const commentsRef = collection(db, "projects", projectId, "meetings", meetingId, "comments");
    const snapshot = await getDocs(commentsRef);
    const comments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Comment));
    return comments;
  } catch (error) {
    console.error("Error fetching meeting comments:", error);
    return [];
  }
};

export const subscribeToMeetingComments = (
  projectId: string,
  meetingId: string,
  callback: (comments: Comment[]) => void
): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "meetings", meetingId, "comments"), (snapshot) => {
    const comments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Comment));
    callback(comments);
  });
};

// ============ DOCUMENTS COLLECTION ============

export const createDocument = async (projectId: string, document: Omit<ProjectDocument, 'id'>): Promise<string> => {
  try {
    const docsRef = collection(db, "projects", projectId, "documents");
    const newDocRef = doc(docsRef);
    // Remove undefined values before sending to Firebase
    const cleanedDoc = Object.fromEntries(
      Object.entries({ ...document }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(newDocRef, {
      ...cleanedDoc,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return newDocRef.id;
  } catch (error) {
    console.error("Error creating document:", error);
    throw error;
  }
};

export const updateDocument = async (projectId: string, docId: string, updates: Partial<ProjectDocument>): Promise<void> => {
  try {
    // Remove undefined values before sending to Firebase
    const cleanedUpdates = Object.fromEntries(
      Object.entries({ ...updates }).filter(([_, v]) => v !== undefined)
    );
    await updateDoc(doc(db, "projects", projectId, "documents", docId), {
      ...cleanedUpdates,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error("Error updating document:", error);
    throw error;
  }
};

export const deleteDocument = async (projectId: string, docId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "documents", docId));
  } catch (error) {
    console.error("Error deleting document:", error);
    throw error;
  }
};

export const getProjectDocuments = async (projectId: string): Promise<ProjectDocument[]> => {
  try {
    const snapshot = await getDocs(collection(db, "projects", projectId, "documents"));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProjectDocument));
  } catch (error) {
    console.error("Error fetching documents:", error);
    return [];
  }
};

export const subscribeToProjectDocuments = (projectId: string, callback: (documents: ProjectDocument[]) => void): Unsubscribe => {
  const documentsMap = new Map<string, ProjectDocument>();
  const unsubscribers: Unsubscribe[] = [];
  
  // Subscribe to documents collection
  const docsUnsubscribe = onSnapshot(collection(db, "projects", projectId, "documents"), (snapshot) => {
    // Handle document changes (additions/updates/deletions)
    snapshot.docs.forEach(docSnapshot => {
      const docId = docSnapshot.id;
      const docData = docSnapshot.data() as ProjectDocument;
      
      // Add or update document in map
      // Use comments from document field (which is synced via arrayUnion)
      documentsMap.set(docId, {
        ...docData,
        id: docId,
        comments: docData.comments || []  // Use document field as source of truth
      });
    });
    
    // Remove deleted documents
    documentsMap.forEach((_, docId) => {
      if (!snapshot.docs.find(d => d.id === docId)) {
        documentsMap.delete(docId);
      }
    });
    
    callback(Array.from(documentsMap.values()));
  });
  
  unsubscribers.push(docsUnsubscribe);
  
  // Return unsubscribe function that cleans up all listeners
  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
};

// ============ COMMENTS COLLECTION ============

export const addCommentToDocument = async (
  projectId: string,
  documentId: string,
  comment: Omit<Comment, 'id'>
): Promise<string> => {
  try {
    const documentRef = doc(db, "projects", projectId, "documents", documentId);
    
    // Remove undefined values before sending to Firebase
    const cleanedComment = Object.fromEntries(
      Object.entries({ ...comment }).filter(([_, v]) => v !== undefined)
    );
    
    // Generate a unique comment ID
    const commentId = Math.random().toString(36).substr(2, 9);
    
    const newCommentWithId: Comment = {
      id: commentId,
      userId: (cleanedComment as any).userId || "",
      text: (cleanedComment as any).text || "",
      timestamp: (cleanedComment as any).timestamp || new Date().toISOString(),
      ...cleanedComment,
    };
    
    // Store ONLY in document's comments array field (single source of truth)
    // This avoids duplication and is simpler
    await updateDoc(documentRef, {
      comments: arrayUnion(newCommentWithId)
    });
    
    return commentId;
  } catch (error) {
    console.error("Error adding comment:", error);
    throw error;
  }
};

export const deleteCommentFromDocument = async (
  projectId: string,
  documentId: string,
  commentId: string,
  comment?: Comment
): Promise<void> => {
  try {
    // 1. Delete from subcollection
    await deleteDoc(doc(db, "projects", projectId, "documents", documentId, "comments", commentId));
    
    // 2. ALSO remove from document's comments array field
    // If comment object is provided, use it; otherwise, create a minimal one
    const commentToRemove = comment || { id: commentId, userId: '', text: '', timestamp: '' };
    
    const documentRef = doc(db, "projects", projectId, "documents", documentId);
    await updateDoc(documentRef, {
      comments: arrayRemove(commentToRemove)
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    throw error;
  }
};

export const getDocumentComments = async (projectId: string, documentId: string): Promise<Comment[]> => {
  try {
    const snapshot = await getDocs(collection(db, "projects", projectId, "documents", documentId, "comments"));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Comment));
  } catch (error) {
    console.error("Error fetching comments:", error);
    return [];
  }
};

export const subscribeToDocumentComments = (
  projectId: string,
  documentId: string,
  callback: (comments: Comment[]) => void
): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "documents", documentId, "comments"), (snapshot) => {
    const comments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Comment));
    callback(comments);
  });
};

// ============ ACTIVITY LOGS COLLECTION ============

export const addActivityLog = async (projectId: string, activity: any): Promise<void> => {
  try {
    const logsRef = collection(db, "projects", projectId, "activityLogs");
    // Remove undefined values before sending to Firebase
    const cleanedActivity = Object.fromEntries(
      Object.entries({ ...activity }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(doc(logsRef), {
      ...cleanedActivity,
      createdAt: new Date()
    });
  } catch (error) {
    console.error("Error adding activity log:", error);
    throw error;
  }
};

export const getProjectActivityLogs = async (projectId: string): Promise<any[]> => {
  try {
    const snapshot = await getDocs(collection(db, "projects", projectId, "activityLogs"));
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    return [];
  }
};

export const subscribeToActivityLogs = (projectId: string, callback: (logs: any[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "activityLogs"), (snapshot) => {
    const logs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    callback(logs);
  });
};

// ============ ROLE-BASED ACCESS HELPERS ============

export const canUserAccessDocument = (document: ProjectDocument, userRole: Role, userId: string, projectClientId?: string, projectLeadDesignerId?: string): boolean => {
  // Admins can always access
  if (userRole === Role.ADMIN) return true;
  
  // Check if user's role is in sharedWith
  if (document.sharedWith && document.sharedWith.includes(userRole)) return true;
  
  // Client can access if they're the project client
  if (userRole === Role.CLIENT && userId === projectClientId) return true;
  
  // Designer can access if they're the lead designer
  if (userRole === Role.DESIGNER && userId === projectLeadDesignerId) return true;
  
  return false;
};

export const getAccessibleDocuments = (
  documents: ProjectDocument[],
  userRole: Role,
  userId: string,
  projectClientId?: string,
  projectLeadDesignerId?: string
): ProjectDocument[] => {
  return documents.filter(doc => 
    canUserAccessDocument(doc, userRole, userId, projectClientId, projectLeadDesignerId)
  );
};

// ============ TEAM MEMBERS COLLECTION ============

export const addTeamMember = async (projectId: string, userId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, "projects", projectId), {
      teamMembers: arrayUnion(userId)
    });
  } catch (error) {
    console.error("Error adding team member:", error);
    throw error;
  }
};

export const removeTeamMember = async (projectId: string, userId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, "projects", projectId), {
      teamMembers: arrayRemove(userId)
    });
  } catch (error) {
    console.error("Error removing team member:", error);
    throw error;
  }
};

// ============ TIMELINE COLLECTION ============

export const createTimeline = async (projectId: string, timeline: Omit<Timeline, 'id'>): Promise<string> => {
  try {
    const timelinesRef = collection(db, "projects", projectId, "timelines");
    const newDocRef = doc(timelinesRef);
    // Remove undefined values before sending to Firebase
    const cleanedTimeline = Object.fromEntries(
      Object.entries({ ...timeline }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(newDocRef, {
      ...cleanedTimeline,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Timeline created: ${timeline.title}`);
    return newDocRef.id;
  } catch (error) {
    console.error("Error creating timeline:", error);
    throw error;
  }
};

export const updateTimeline = async (projectId: string, timelineId: string, updates: Partial<Timeline>): Promise<void> => {
  try {
    // Remove undefined values before sending to Firebase
    const cleanedUpdates = Object.fromEntries(
      Object.entries({ ...updates }).filter(([_, v]) => v !== undefined)
    );
    await updateDoc(doc(db, "projects", projectId, "timelines", timelineId), {
      ...cleanedUpdates,
      updatedAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Timeline updated: ${timelineId}`);
  } catch (error) {
    console.error("Error updating timeline:", error);
    throw error;
  }
};

export const deleteTimeline = async (projectId: string, timelineId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "timelines", timelineId));
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Timeline deleted: ${timelineId}`);
  } catch (error) {
    console.error("Error deleting timeline:", error);
    throw error;
  }
};

export const getTimelines = async (projectId: string): Promise<Timeline[]> => {
  try {
    const timelinesRef = collection(db, "projects", projectId, "timelines");
    const snapshot = await getDocs(timelinesRef);
    const timelines = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Timeline));
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Fetched ${timelines.length} timelines for project ${projectId}`);
    return timelines;
  } catch (error) {
    console.error("Error fetching timelines:", error);
    throw error;
  }
};

export const subscribeToTimelines = (projectId: string, callback: (timelines: Timeline[]) => void): Unsubscribe => {
  try {
    const timelinesRef = collection(db, "projects", projectId, "timelines");
    return onSnapshot(timelinesRef, (snapshot) => {
      const timelines = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Timeline));
      if (process.env.NODE_ENV !== 'production') console.log(`📥 Real-time update from timelines: ${timelines.length} timelines`);
      callback(timelines);
    });
  } catch (error) {
    console.error("Error subscribing to timelines:", error);
    throw error;
  }
};

// ============ TASK CHECKLISTS (SUBTASKS) SUBCOLLECTION ============

export const addChecklistItem = async (projectId: string, taskId: string, checklist: Omit<SubTask, 'id'>): Promise<string> => {
  try {
    const checklistRef = collection(db, "projects", projectId, "tasks", taskId, "checklists");
    const newChecklistRef = doc(checklistRef);
    // Remove undefined values before sending to Firebase
    const cleanedChecklist = Object.fromEntries(
      Object.entries({ ...checklist }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(newChecklistRef, {
      ...cleanedChecklist,
      createdAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Checklist item added to task ${taskId}`);
    return newChecklistRef.id;
  } catch (error) {
    console.error("Error adding checklist item:", error);
    throw error;
  }
};

export const updateChecklistItem = async (projectId: string, taskId: string, checklistId: string, updates: Partial<SubTask>): Promise<void> => {
  try {
    // Remove undefined values before sending to Firebase
    const cleanedUpdates = Object.fromEntries(
      Object.entries({ ...updates }).filter(([_, v]) => v !== undefined)
    );
    await updateDoc(doc(db, "projects", projectId, "tasks", taskId, "checklists", checklistId), {
      ...cleanedUpdates,
      updatedAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Checklist item updated`);
  } catch (error) {
    console.error("Error updating checklist item:", error);
    throw error;
  }
};

export const deleteChecklistItem = async (projectId: string, taskId: string, checklistId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "tasks", taskId, "checklists", checklistId));
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Checklist item deleted`);
  } catch (error) {
    console.error("Error deleting checklist item:", error);
    throw error;
  }
};

export const getTaskChecklists = async (projectId: string, taskId: string): Promise<SubTask[]> => {
  try {
    const checklistRef = collection(db, "projects", projectId, "tasks", taskId, "checklists");
    const snapshot = await getDocs(checklistRef);
    const checklists = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SubTask));
    return checklists;
  } catch (error) {
    console.error("Error fetching checklists:", error);
    return [];
  }
};

export const subscribeToTaskChecklists = (projectId: string, taskId: string, callback: (checklists: SubTask[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "tasks", taskId, "checklists"), (snapshot) => {
    const checklists = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SubTask));
    if (process.env.NODE_ENV !== 'production') console.log(`📥 Checklists updated for task ${taskId}: ${checklists.length} items`);
    callback(checklists);
  });
};

// ============ TASK COMMENTS SUBCOLLECTION ============

export const addCommentToTask = async (projectId: string, taskId: string, comment: Omit<Comment, 'id'>): Promise<string> => {
  try {
    const commentsRef = collection(db, "projects", projectId, "tasks", taskId, "comments");
    const newCommentRef = doc(commentsRef);
    // Remove undefined values before sending to Firebase
    const cleanedComment = Object.fromEntries(
      Object.entries({ ...comment }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(newCommentRef, {
      ...cleanedComment,
      createdAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Comment added to task ${taskId}`);
    return newCommentRef.id;
  } catch (error) {
    console.error("Error adding comment to task:", error);
    throw error;
  }
};

export const deleteCommentFromTask = async (projectId: string, taskId: string, commentId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "tasks", taskId, "comments", commentId));
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Comment deleted from task`);
  } catch (error) {
    console.error("Error deleting task comment:", error);
    throw error;
  }
};

export const getTaskComments = async (projectId: string, taskId: string): Promise<Comment[]> => {
  try {
    const commentsRef = collection(db, "projects", projectId, "tasks", taskId, "comments");
    const snapshot = await getDocs(commentsRef);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Comment));
  } catch (error) {
    console.error("Error fetching task comments:", error);
    return [];
  }
};

export const subscribeToTaskComments = (projectId: string, taskId: string, callback: (comments: Comment[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "tasks", taskId, "comments"), (snapshot) => {
    const comments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Comment));
    if (process.env.NODE_ENV !== 'production') console.log(`📥 Comments updated for task ${taskId}: ${comments.length} comments`);
    callback(comments);
  });
};

// ============ TASK APPROVALS SUBCOLLECTION ============

export const updateTaskApproval = async (projectId: string, taskId: string, stage: 'start' | 'completion', approval: any): Promise<void> => {
  try {
    const approvalsRef = doc(db, "projects", projectId, "tasks", taskId, "approvals", stage);
    await setDoc(approvalsRef, {
      ...approval,
      updatedAt: new Date()
    }, { merge: true });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Approval updated for task ${taskId} (${stage})`);
  } catch (error) {
    console.error("Error updating approval:", error);
    throw error;
  }
};

export const getTaskApprovals = async (projectId: string, taskId: string): Promise<any> => {
  try {
    const approvalsRef = collection(db, "projects", projectId, "tasks", taskId, "approvals");
    const snapshot = await getDocs(approvalsRef);
    const approvals: any = {};
    snapshot.docs.forEach(doc => {
      approvals[doc.id] = { ...doc.data(), id: doc.id };
    });
    return approvals;
  } catch (error) {
    console.error("Error fetching approvals:", error);
    return {};
  }
};

export const subscribeToTaskApprovals = (projectId: string, taskId: string, callback: (approvals: any) => void): Unsubscribe => {
  return onSnapshot(collection(db, "projects", projectId, "tasks", taskId, "approvals"), (snapshot) => {
    const approvals: any = {};
    snapshot.docs.forEach(doc => {
      approvals[doc.id] = { ...doc.data(), id: doc.id };
    });
    if (process.env.NODE_ENV !== 'production') console.log(`📥 Approvals updated for task ${taskId}`);
    callback(approvals);
  });
};
