export enum Role {
  ADMIN = 'Admin',
  DESIGNER = 'Designer',
  VENDOR = 'Vendor',
  CLIENT = 'Client'
}

export interface Tenant {
  id: string;
  name: string; // Organization name (defaults to business name)
  ownerId: string; // Admin who created the tenant
  createdAt: string;
  status: 'active' | 'inactive';
  // Customization fields
  brandName?: string; // Custom brand name (fallback to "Kydo Solutions")
  logoUrl?: string; // Custom logo URL (fallback to "/kydoicon.png")
  // Optional additional branding
  primaryColor?: string; // For future theme customization
  secondaryColor?: string;
}

export enum ProjectStatus {
  DISCOVERY = 'Discovery',
  PLANNING = 'Planning',
  EXECUTION = 'Execution',
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
  phone?: string;
  avatar?: string;
  tenantId?: string;
  tenantIds?: string[]; // For vendors: array of tenant IDs they can access (multi-tenant support)
  company?: string; // For vendors
  specialty?: string; // For designers/vendors
  authMethod?: 'email' | 'phone'; // Authentication method for vendors (email or phone-based OTP)
  tenantId?: string;
  tenantIds?: string[]; // For vendors: array of tenant IDs they can access (multi-tenant support)
  createdBy?: string; // ID of the user who created this user
  // Vendor project metrics - aggregated from all projects
  projectMetrics?: Record<string, {
    projectName: string;
    taskCount: number; // Number of completed tasks in this project
    netAmount: number; // Net amount (approved only) in this project
  }>;
}

export interface FinancialRecord {
  id: string;
  date: string;
  timestamp?: string; // ISO timestamp for sorting by date and time
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'designer-charge'; // Income = From Client, Expense = To Vendor, Designer-Charge = Design Fee
  status: 'paid' | 'pending' | 'overdue' | 'hold';
  category: string;
  vendorId?: string; // ID of vendor for expense tracking
  vendorName?: string; // Name of vendor for expense tracking
  paidBy?: 'client' | 'vendor' | 'designer' | 'admin' | 'other'; // Who paid (for income/expenses)
  paidByOther?: string; // Name and role for "other" paid by option (e.g., "John Smith (Partner)")
  paidByRole?: 'client' | 'vendor' | 'designer' | 'admin' | 'other'; // Role of who paid for income transactions
  receivedBy?: string; // Who received the payment (person/entity name)
  receivedByName?: string; // Name of who received the payment (for expense transactions)
  receivedByRole?: 'client' | 'vendor' | 'designer' | 'admin' | 'other' | 'client-received' | 'vendor-received' | 'designer-received' | 'admin-received' | 'other-received'; // Role of who received the payment
  paidTo?: string; // Recipient (vendor/designer name) - kept for backward compatibility
  adminApproved?: boolean; // Admin approval for billing
  clientApproved?: boolean; // Client approval for billing
  // Approvals for additional budgets
  isAdditionalBudget?: boolean; // Flag to indicate this is an additional budget increase
  clientApprovalForAdditionalBudget?: ApprovalStatus; // Client approval for additional budget
  adminApprovalForAdditionalBudget?: ApprovalStatus; // Admin approval for additional budget
  // Approvals for received payments from client
  isClientPayment?: boolean; // Flag to indicate this is a payment received from client
  clientApprovalForPayment?: ApprovalStatus; // Client approval for payment record
  adminApprovalForPayment?: ApprovalStatus; // Admin approval for payment record
  paymentMode?: 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'credit_card' | 'other';
}

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  userName?: string; // Store commenter's name for resilience when user data is unavailable
  text: string;
  timestamp: string;
  status?: 'pending' | 'done'; // Mark comment as done or pending
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface TaskApproval {
  status: ApprovalStatus;
  updatedBy?: string; // User ID
  timestamp?: string;
}

export interface ApprovalFlow {
  client: TaskApproval;
  admin: TaskApproval;
  designer?: TaskApproval;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  progress?: number; // 0-100, explicit progress tracking (independent of status)
  category: string; // e.g. Civil, Electrical, Painting
  assigneeId: string; // ID of Designer or Vendor
  startDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD (End Date)
  priority: 'low' | 'medium' | 'high';
  dependencies: string[]; // Array of Task IDs that must finish before this starts
  subtasks: SubTask[];
  comments: Comment[];
  documents?: string[]; // Array of document IDs specific to this task
  approvals: {
    start: ApprovalFlow;
    completion: ApprovalFlow;
  };
}

export interface Meeting {
  id: string;
  date: string;
  title: string;
  attendees: string[]; // List of user IDs
  notes: string;
  type: string; // Flexible meeting type (e.g., Discovery, Progress, Site Visit, etc.)
  comments?: Comment[]; // Comments on the meeting
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
  sharedWith: string[]; // User IDs that can see this file
  comments?: Comment[]; // Comments on this document
  approvalStatus: 'pending' | 'approved' | 'rejected'; // Admin approval status
  approvedBy?: string; // Admin user ID of approver
  rejectedBy?: string; // Admin user ID of rejector
  approvalDate?: string;
  rejectionDate?: string;
  clientApprovalStatus?: 'pending' | 'approved' | 'rejected'; // Client approval status
  clientApprovedBy?: string; // Client user ID of approver
  clientApprovedDate?: string;
}

export interface Project {
  id: string;
  tenantId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  name: string;
  clientId: string; // Primary client
  clientIds?: string[]; // Additional clients
  leadDesignerId: string;
  teamMembers?: string[]; // IDs of explicitly added members
  team?: User[];
  vendorIds?: string[];
  hiddenVendors?: string[]; // IDs of vendors hidden from clients
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