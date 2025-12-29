import { Role, Project, User } from '../types';

export interface AccessControl {
  canViewProject: boolean;
  canEditProject: boolean;
  canDeleteProject: boolean;
  canManageTasks: boolean;
  canManageMeetings: boolean;
  canViewFinancials: boolean;
  canManageFinancials: boolean;
  canUploadDocuments: boolean;
  canManageTeam: boolean;
  canApproveCompletion: boolean;
}

export const getProjectAccess = (
  user: User,
  project: Project
): AccessControl => {
  const isAdmin = user.role === Role.ADMIN;
  const isLeadDesigner = user.role === Role.DESIGNER && (project.leadDesignerId === user.id || (project.teamMembers || []).includes(user.id));
  const isClient = user.role === Role.CLIENT && (project.clientId === user.id || (project.clientIds || []).includes(user.id));
  const isVendor = user.role === Role.VENDOR && ((project.vendorIds || []).includes(user.id) || (project.teamMembers || []).includes(user.id));
  const isTeamMember = (project.teamMembers || []).includes(user.id) || false;
  const hasTask = project.tasks.some(t => t.assigneeId === user.id) || false;

  return {
    // View: Admin, Lead Designer, Client, Vendors with tasks, Team members
    canViewProject: isAdmin || isLeadDesigner || isClient || (isVendor && (hasTask || (project.vendorIds || []).includes(user.id))) || isTeamMember,
    
    // Edit: Admin and Lead Designer only
    canEditProject: isAdmin || isLeadDesigner,
    
    // Delete: Admin only
    canDeleteProject: isAdmin,
    
    // Tasks: Admin, Lead Designer, Vendors with tasks
    canManageTasks: isAdmin || isLeadDesigner || (isVendor && (hasTask || (project.vendorIds || []).includes(user.id))),
    
    // Meetings: Admin, Lead Designer, Client, Team members
    canManageMeetings: isAdmin || isLeadDesigner || isClient || isTeamMember || (isVendor && (project.vendorIds || []).includes(user.id)),
    
    // View Financials: Admin, Lead Designer, Client (not Vendors)
    canViewFinancials: !isVendor && (isAdmin || isLeadDesigner || isClient),
    
    // Manage Financials: Admin only
    canManageFinancials: isAdmin,
    
    // Upload Documents: Everyone
    canUploadDocuments: true,
    
    // Manage Team: Admin and Lead Designer
    canManageTeam: isAdmin || isLeadDesigner,
    
    // Approve Completion: Admin and Client
    canApproveCompletion: isAdmin || isClient
  };
};

export const getTaskAccess = (user: User, assigneeId: string, isTaskFrozen: boolean) => {
  const isAdmin = user.role === Role.ADMIN;
  const isAssignee = user.id === assigneeId;

  return {
    canEdit: isAdmin || (isAssignee && !isTaskFrozen),
    canUpdateStatus: isAdmin || (isAssignee && !isTaskFrozen),
    canDelete: isAdmin,
    canComment: true,
    canRequestApproval: isAssignee
  };
};

export const getMeetingAccess = (user: User, meetingAttendees: string[]) => {
  const isAdmin = user.role === Role.ADMIN;
  const isAttendee = meetingAttendees.includes(user.id);

  return {
    canEdit: isAdmin || isAttendee,
    canDelete: isAdmin,
    canAddAttendees: isAdmin || isAttendee
  };
};

export const getFinancialAccess = (user: User, project: Project) => {
  const isAdmin = user.role === Role.ADMIN;
  const isLeadDesigner = user.role === Role.DESIGNER && (project.leadDesignerId === user.id || (project.teamMembers || []).includes(user.id));
  const isClient = user.role === Role.CLIENT && (project.clientId === user.id || (project.clientIds || []).includes(user.id));

  return {
    canView: isAdmin || isLeadDesigner || isClient,
    canAdd: isAdmin,
    canEdit: isAdmin,
    canDelete: isAdmin,
    canApproveAsAdmin: isAdmin,
    canApproveAsClient: isClient
  };
};

export const getDocumentAccess = (
  user: User,
  sharedWithRoles: string[],
  project: Project
) => {
  const isAdmin = user.role === Role.ADMIN;
  const isLeadDesigner = user.role === Role.DESIGNER && (project.leadDesignerId === user.id || (project.teamMembers || []).includes(user.id));
  const isClient = user.role === Role.CLIENT && (project.clientId === user.id || (project.clientIds || []).includes(user.id));
  const hasAccess = sharedWithRoles.includes(user.role);

  return {
    canView: isAdmin || isLeadDesigner || isClient || hasAccess,
    canUpload: true,
    canDelete: isAdmin || isLeadDesigner,
    canComment: isAdmin || isLeadDesigner || isClient || hasAccess,
    canShare: isAdmin || isLeadDesigner
  };
};

export const getVisibleTasksForUser = (tasks: any[], user: User, project: Project) => {
  const isAdmin = user.role === Role.ADMIN;
  const isLeadDesigner = user.role === Role.DESIGNER && (project.leadDesignerId === user.id || (project.teamMembers || []).includes(user.id));
  const isClient = user.role === Role.CLIENT && (project.clientId === user.id || (project.clientIds || []).includes(user.id));
  const isVendor = user.role === Role.VENDOR;

  return tasks.filter(task => {
    // Admin sees all tasks
    if (isAdmin) return true;
    
    // Lead Designer sees all tasks
    if (isLeadDesigner) return true;
    
    // Client sees all tasks
    if (isClient) return true;
    
    // Vendors only see their assigned tasks
    if (isVendor && task.assigneeId === user.id) return true;
    
    return false;
  });
};

export const getVisibleMeetingsForUser = (meetings: any[], user: User, isTeamMember: boolean) => {
  const isAdmin = user.role === Role.ADMIN;
  const isVendor = user.role === Role.VENDOR;

  return meetings.filter(meeting => {
    // Admin sees all meetings
    if (isAdmin) return true;
    
    // Vendors don't see meetings (unless specifically added)
    if (isVendor && !meeting.attendees?.includes(user.id)) return false;
    
    // Team members and others see all meetings
    return true;
  });
};

export const canUserApproveTask = (user: User, taskApprovals: any, userRole: string) => {
  const isAdmin = user.role === Role.ADMIN;
  const isClient = user.role === Role.CLIENT;

  if (userRole === 'admin' && isAdmin) {
    return !taskApprovals?.status || taskApprovals.status === 'pending';
  }

  if (userRole === 'client' && isClient) {
    return !taskApprovals?.status || taskApprovals.status === 'pending';
  }

  return false;
};
