import { Project, User, Role, ProjectStatus, TaskStatus, ProjectType, ProjectCategory } from './types';

// Construction Sequence / Category Order
export const CATEGORY_ORDER = [
  'General',
  'Design and Planning',
  'Execution'
];

// --- Users ---
export const MOCK_USERS: User[] = [];


const createDefaultApprovals = () => ({
  start: {
    client: { status: 'pending' as const },
    admin: { status: 'pending' as const },
    designer: { status: 'pending' as const }
  },
  completion: {
    client: { status: 'pending' as const },
    admin: { status: 'pending' as const },
    designer: { status: 'pending' as const }
  }
});

// Helper to generate a basic project
const generateProject = (id: string, name: string, status: ProjectStatus, client: string, designer: string, budget: number, type: ProjectType = ProjectType.DESIGNING, category: ProjectCategory = ProjectCategory.RESIDENTIAL): Project => ({
  id,
  name,
  clientId: client,
  leadDesignerId: designer,
  teamMembers: [],
  status,
  type,
  category,
  startDate: '2023-11-01',
  deadline: '2024-06-01',
  budget,
  thumbnail: `https://picsum.photos/seed/${id}/800/600`,
  description: `Comprehensive interior design project for ${name}.`,
  meetings: [],
  documents: [],
  financials: [
    { id: `f_${id}_1`, date: '2023-11-05', description: 'Initial Deposit', amount: budget * 0.3, type: 'income', status: 'paid', category: 'Retainer' },
    // Add pending income for testing calculations
    { id: `f_${id}_2`, date: '2023-12-05', description: 'Milestone 1 Payment', amount: budget * 0.2, type: 'income', status: 'pending', category: 'Milestone 1' }
  ],
  tasks: [
    { 
      id: `t_${id}_1`, 
      title: 'Initial Consultation', 
      status: TaskStatus.DONE, 
      assigneeId: designer, 
      startDate: '2023-11-02', 
      dueDate: '2023-11-05', 
      priority: 'high', 
      category: 'Design & Planning', 
      dependencies: [], 
      subtasks: [{id:'st1', title:'Meet Client', isCompleted:true}], 
      comments:[], 
      approvals: createDefaultApprovals() 
    }
  ],
  activityLog: []
});


export const MOCK_PROJECTS: Project[] = [];