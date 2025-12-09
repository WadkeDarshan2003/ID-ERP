import { useState } from 'react';
import { Project, User, FinancialRecord, Task, Meeting, ProjectDocument, Comment, Timeline, SubTask } from '../types';
import {
  createProject,
  updateProject,
  deleteProject,
  createUser,
  updateUser
} from '../services/firebaseService';
import {
  createTask,
  updateTask,
  deleteTask,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  createDocument,
  updateDocument,
  deleteDocument,
  addCommentToDocument,
  deleteCommentFromDocument,
  addTeamMember,
  removeTeamMember,
  createTimeline,
  updateTimeline,
  deleteTimeline,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  addCommentToTask,
  deleteCommentFromTask,
  updateTaskApproval
} from '../services/projectDetailsService';
import {
  createProjectFinancialRecord,
  updateProjectFinancialRecord,
  deleteProjectFinancialRecord
} from '../services/financialService';

interface UseCrudState {
  loading: boolean;
  error: string | null;
  success: boolean;
}

export const useProjectCrud = () => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewProject = async (project: Omit<Project, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createProject(project);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingProject = async (projectId: string, updates: Partial<Project>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateProject(projectId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingProject = async (projectId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteProject(projectId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewProject,
    updateExistingProject,
    deleteExistingProject
  };
};

export const useUserCrud = () => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewUser = async (user: User) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createUser(user);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingUser = async (userId: string, updates: Partial<User>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateUser(userId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewUser,
    updateExistingUser
  };
};

export const useFinancialCrud = (projectId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewRecord = async (record: Omit<FinancialRecord, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createProjectFinancialRecord(projectId, record);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingRecord = async (recordId: string, updates: Partial<FinancialRecord>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateProjectFinancialRecord(projectId, recordId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingRecord = async (recordId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteProjectFinancialRecord(projectId, recordId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewRecord,
    updateExistingRecord,
    deleteExistingRecord
  };
};

// ============ TASK CRUD ============
export const useTaskCrud = (projectId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewTask = async (task: Omit<Task, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createTask(projectId, task);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingTask = async (taskId: string, updates: Partial<Task>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateTask(projectId, taskId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingTask = async (taskId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteTask(projectId, taskId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewTask,
    updateExistingTask,
    deleteExistingTask
  };
};

// ============ MEETING CRUD ============
export const useMeetingCrud = (projectId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewMeeting = async (meeting: Omit<Meeting, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createMeeting(projectId, meeting);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingMeeting = async (meetingId: string, updates: Partial<Meeting>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateMeeting(projectId, meetingId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingMeeting = async (meetingId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteMeeting(projectId, meetingId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewMeeting,
    updateExistingMeeting,
    deleteExistingMeeting
  };
};

// ============ DOCUMENT CRUD ============
export const useDocumentCrud = (projectId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewDocument = async (doc: Omit<ProjectDocument, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createDocument(projectId, doc);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingDocument = async (docId: string, updates: Partial<ProjectDocument>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateDocument(projectId, docId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingDocument = async (docId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteDocument(projectId, docId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewDocument,
    updateExistingDocument,
    deleteExistingDocument
  };
};

// ============ COMMENT CRUD ============
export const useCommentCrud = (projectId: string, documentId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const addNewComment = async (comment: Omit<Comment, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await addCommentToDocument(projectId, documentId, comment);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingComment = async (commentId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteCommentFromDocument(projectId, documentId, commentId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    addNewComment,
    deleteExistingComment
  };
};

// ============ TEAM MEMBER CRUD ============
export const useTeamMemberCrud = (projectId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const addMember = async (userId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await addTeamMember(projectId, userId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const removeMember = async (userId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await removeTeamMember(projectId, userId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    addMember,
    removeMember
  };
};

// ============ TIMELINE CRUD ============
export const useTimelineCrud = (projectId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewTimeline = async (timeline: Omit<Timeline, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createTimeline(projectId, timeline);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingTimeline = async (timelineId: string, updates: Partial<Timeline>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateTimeline(projectId, timelineId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingTimeline = async (timelineId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteTimeline(projectId, timelineId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewTimeline,
    updateExistingTimeline,
    deleteExistingTimeline
  };
};

// ============ TASK CHECKLIST CRUD ============
export const useChecklistCrud = (projectId: string, taskId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const addNewChecklistItem = async (checklist: Omit<SubTask, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await addChecklistItem(projectId, taskId, checklist);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingChecklistItem = async (checklistId: string, updates: Partial<SubTask>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateChecklistItem(projectId, taskId, checklistId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingChecklistItem = async (checklistId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteChecklistItem(projectId, taskId, checklistId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    addNewChecklistItem,
    updateExistingChecklistItem,
    deleteExistingChecklistItem
  };
};

// ============ TASK COMMENT CRUD ============
export const useTaskCommentCrud = (projectId: string, taskId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const addNewTaskComment = async (comment: Omit<Comment, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await addCommentToTask(projectId, taskId, comment);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingTaskComment = async (commentId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteCommentFromTask(projectId, taskId, commentId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    addNewTaskComment,
    deleteExistingTaskComment
  };
};

// ============ TASK APPROVAL CRUD ============
export const useTaskApprovalCrud = (projectId: string, taskId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const updateTaskApprovalStatus = async (stage: 'start' | 'completion', approval: any) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateTaskApproval(projectId, taskId, stage, approval);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    updateTaskApprovalStatus
  };
};

// ============ PROJECT FINANCIAL RECORD CRUD ============
export const useProjectFinancialCrud = (projectId: string) => {
  const [state, setState] = useState<UseCrudState>({
    loading: false,
    error: null,
    success: false
  });

  const createNewFinancialRecord = async (record: Omit<FinancialRecord, 'id'>) => {
    setState({ loading: true, error: null, success: false });
    try {
      const id = await createProjectFinancialRecord(projectId, record);
      setState({ loading: false, error: null, success: true });
      return id;
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const updateExistingFinancialRecord = async (recordId: string, updates: Partial<FinancialRecord>) => {
    setState({ loading: true, error: null, success: false });
    try {
      await updateProjectFinancialRecord(projectId, recordId, updates);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  const deleteExistingFinancialRecord = async (recordId: string) => {
    setState({ loading: true, error: null, success: false });
    try {
      await deleteProjectFinancialRecord(projectId, recordId);
      setState({ loading: false, error: null, success: true });
    } catch (error: any) {
      setState({ loading: false, error: error.message, success: false });
      throw error;
    }
  };

  return {
    ...state,
    createNewFinancialRecord,
    updateExistingFinancialRecord,
    deleteExistingFinancialRecord
  };
};
