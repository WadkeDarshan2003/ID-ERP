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

export enum ProjectType {
  DESIGNING = 'Designing',
  TURNKEY = 'Turnkey'
}

export enum ProjectCategory {
  COMMERCIAL = 'Commercial',
  RESIDENTIAL = 'Residential'
}

export enum TaskStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  REVIEW = 'Review',
  DONE = 'Done',
  OVERDUE = 'Overdue',
  ABORTED = 'Aborted',
  ON_HOLD = 'On Hold'
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
  type: 'income' | 'expense' | 'designer-charge'; // Income = From Client, Expense = To Vendor, Designer-Charge = Design Fee
  status: 'paid' | 'pending' | 'overdue' | 'hold';
  category: string;
  vendorName?: string; // Name of vendor for expense tracking
  paidBy?: 'client' | 'vendor'; // Who collected the payment (for income/expenses)
  paidTo?: string; // Recipient (vendor/designer name)
  adminApproved?: boolean; // Admin approval for billing
  clientApproved?: boolean; // Client approval for billing
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
  category: string; // e.g. Civil, Electrical, Painting
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

export interface Timeline {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  milestone?: string; // e.g., "Phase 1 Complete", "Design Approval"
  status: 'planned' | 'in-progress' | 'completed' | 'delayed';
  type: 'phase' | 'milestone' | 'deadline';
  relatedTaskIds?: string[]; // IDs of related tasks
  relatedMeetingIds?: string[]; // IDs of related meetings
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string; // e.g., "Created Task", "Approved Phase 1"
  details: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'creation';
}

export interface ProjectDocument {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'cad' | 'other';
  url: string;
  uploadedBy: string;
  uploadDate: string;
  sharedWith: Role[]; // Roles that can see this file
  comments?: Comment[]; // Comments on this document
}

export interface Project {
  id: string;
  name: string;
  clientId: string; // Primary client
  clientIds?: string[]; // Additional clients
  leadDesignerId: string;
  teamMembers?: string[]; // IDs of explicitly added members
  status: ProjectStatus;
  type: ProjectType; // Designing or Turnkey
  category: ProjectCategory; // Commercial or Residential
  startDate: string;
  deadline: string;
  budget: number;
  initialBudget?: number; // Original budget before any increases
  thumbnail: string;
  description: string;
  tasks: Task[];
  financials: FinancialRecord[];
  meetings: Meeting[];
  activityLog: ActivityLog[];
  documents: ProjectDocument[];
  designerChargePercentage?: number; // Design fee as percentage of project budget
}

export interface Notification {
  id: string;
  recipientId?: string; // Optional: If null, global/system notification
  projectId?: string; // Context
  projectName?: string; // Project name for reference if projectId is set
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
  targetTab?: string;
}