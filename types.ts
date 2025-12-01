export enum Role {
  ADMIN = 'Admin',
  DESIGNER = 'Designer',
  VENDOR = 'Vendor',
  CLIENT = 'Client'
}

export enum ProjectStatus {
  PLANNING = 'Planning',
  IN_PROGRESS = 'In Progress',
  PROCUREMENT = 'Procurement',
  COMPLETED = 'Completed',
  ON_HOLD = 'On Hold'
}

export enum TaskStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  REVIEW = 'Review',
  DONE = 'Done'
}

export interface User {
  id: string;
  name: string;
  role: Role;
  email: string; // Acts as Login ID
  password?: string; // Acts as Password (Aadhar)
  aadhar?: string; // Explicit Aadhar Number
  phone?: string;
  avatar?: string;
  company?: string; // For vendors
  specialty?: string; // For designers/vendors
}

export interface FinancialRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense'; // Income = From Client, Expense = To Vendor/Material
  status: 'paid' | 'pending' | 'overdue' | 'hold';
  category: string;
}

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface TaskApproval {
  status: ApprovalStatus;
  updatedBy?: string; // User ID
  timestamp?: string;
}

export interface ApprovalFlow {
  client: TaskApproval;
  designer: TaskApproval;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId: string; // ID of Designer or Vendor
  startDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD (End Date)
  priority: 'low' | 'medium' | 'high';
  dependencies: string[]; // Array of Task IDs that must finish before this starts
  subtasks: SubTask[];
  comments: Comment[];
  approvals: {
    start: ApprovalFlow;
    completion: ApprovalFlow;
  };
}

export interface Meeting {
  id: string;
  date: string;
  title: string;
  attendees: string[]; // List of names
  notes: string;
  type: 'Discovery' | 'Progress' | 'Site Visit' | 'Vendor Meet';
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string; // e.g., "Created Task", "Approved Phase 1"
  details: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'creation';
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  leadDesignerId: string;
  status: ProjectStatus;
  startDate: string;
  deadline: string;
  budget: number;
  thumbnail: string;
  description: string;
  tasks: Task[];
  financials: FinancialRecord[];
  meetings: Meeting[];
  activityLog: ActivityLog[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
}