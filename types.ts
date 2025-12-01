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
  email: string;
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
  type: 'income' | 'expense';
  status: 'paid' | 'pending' | 'overdue';
  category: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId: string; // ID of Designer or Vendor
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
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
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  read: boolean;
}