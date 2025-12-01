import { Project, User, Role, ProjectStatus, TaskStatus, Task } from './types';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Alice Admin', role: Role.ADMIN, email: 'alice@luxespace.com', password: 'admin', avatar: 'https://picsum.photos/seed/alice/100/100' },
  { id: 'd1', name: 'David Designer', role: Role.DESIGNER, email: 'david@luxespace.com', password: '123', specialty: 'Modern Minimalist', avatar: 'https://picsum.photos/seed/david/100/100' },
  { id: 'd2', name: 'Sarah Styles', role: Role.DESIGNER, email: 'sarah@luxespace.com', password: '123', specialty: 'Bohemian Chic', avatar: 'https://picsum.photos/seed/sarah/100/100' },
  { id: 'v1', name: 'BuildRight Construction', role: Role.VENDOR, email: 'contact@buildright.com', password: '123', company: 'BuildRight', specialty: 'General Contractor', avatar: 'https://picsum.photos/seed/build/100/100' },
  { id: 'v2', name: 'Luxe Fabrics', role: Role.VENDOR, email: 'orders@luxefabrics.com', password: '123', company: 'Luxe Fabrics', specialty: 'Textiles', avatar: 'https://picsum.photos/seed/fabric/100/100' },
  { id: 'c1', name: 'Michael Client', role: Role.CLIENT, email: 'mike@gmail.com', password: '123', phone: '555-0123', avatar: 'https://picsum.photos/seed/mike/100/100' },
  { id: 'c2', name: 'Jennifer Smith', role: Role.CLIENT, email: 'jen.smith@yahoo.com', password: '123', phone: '555-0987', avatar: 'https://picsum.photos/seed/jen/100/100' },
];

const createDefaultApprovals = () => ({
  start: {
    client: { status: 'pending' as const },
    designer: { status: 'pending' as const }
  },
  completion: {
    client: { status: 'pending' as const },
    designer: { status: 'pending' as const }
  }
});

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Penthouse Renovation - Downtown',
    clientId: 'c1',
    leadDesignerId: 'd1',
    status: ProjectStatus.IN_PROGRESS,
    startDate: '2023-10-01',
    deadline: '2024-03-15',
    budget: 150000,
    thumbnail: 'https://picsum.photos/seed/p1/800/600',
    description: 'Full interior overhaul of a 2000sqft penthouse focusing on open plan living and smart home integration.',
    meetings: [
      { id: 'm1', date: '2023-09-15', title: 'Initial Discovery', attendees: ['Michael Client', 'David Designer', 'Alice Admin'], notes: 'Client likes marble and gold accents. Needs smart lighting.', type: 'Discovery' }
    ],
    tasks: [
      { 
        id: 't1', 
        title: 'Finalize Floor Plan', 
        status: TaskStatus.DONE, 
        assigneeId: 'd1', 
        startDate: '2023-10-01',
        dueDate: '2023-10-15', 
        priority: 'high',
        dependencies: [],
        subtasks: [
          { id: 'st1', title: 'Measure living room', isCompleted: true },
          { id: 'st2', title: 'Draft CAD layout', isCompleted: true }
        ],
        comments: [
          { id: 'cm1', userId: 'c1', text: 'Please ensure the master bath is expanded.', timestamp: '2023-10-05T10:00:00Z' },
          { id: 'cm2', userId: 'd1', text: 'Noted, updated in v2 draft.', timestamp: '2023-10-06T14:30:00Z' }
        ],
        approvals: {
          start: {
            client: { status: 'approved', timestamp: '2023-10-01T09:00:00Z' },
            designer: { status: 'approved', timestamp: '2023-10-01T09:00:00Z' }
          },
          completion: {
            client: { status: 'approved', timestamp: '2023-10-15T16:00:00Z' },
            designer: { status: 'approved', timestamp: '2023-10-15T15:00:00Z' }
          }
        }
      },
      { 
        id: 't2', 
        title: 'Source Kitchen Cabinetry', 
        status: TaskStatus.IN_PROGRESS, 
        assigneeId: 'd1', 
        startDate: '2023-10-16',
        dueDate: '2023-11-01', 
        priority: 'medium',
        dependencies: ['t1'],
        subtasks: [
           { id: 'st3', title: 'Visit showroom', isCompleted: true },
           { id: 'st4', title: 'Get quotes', isCompleted: false }
        ],
        comments: [],
        approvals: {
          start: {
            client: { status: 'approved', timestamp: '2023-10-16T10:00:00Z' },
            designer: { status: 'approved', timestamp: '2023-10-16T10:00:00Z' }
          },
          completion: {
            client: { status: 'pending' },
            designer: { status: 'pending' }
          }
        }
      },
      { 
        id: 't3', 
        title: 'Demolition of Partition Walls', 
        status: TaskStatus.TODO, 
        assigneeId: 'v1', 
        startDate: '2023-11-02',
        dueDate: '2023-11-10', 
        priority: 'high',
        dependencies: ['t1'],
        subtasks: [],
        comments: [],
        approvals: createDefaultApprovals()
      }
    ],
    financials: [
      { id: 'f1', date: '2023-10-05', description: 'Initial Deposit', amount: 50000, type: 'income', status: 'paid', category: 'Retainer' },
      { id: 'f2', date: '2023-10-20', description: 'Permit Fees', amount: 2500, type: 'expense', status: 'paid', category: 'Legal' },
    ],
    activityLog: [
      { id: 'al1', userId: 'u1', action: 'Project Created', details: 'Project initialized in ERP', timestamp: '2023-09-01T09:00:00Z', type: 'creation' },
      { id: 'al2', userId: 'c1', action: 'Task Approved', details: 'Client approved "Finalize Floor Plan"', timestamp: '2023-10-01T09:00:00Z', type: 'success' }
    ]
  },
  {
    id: 'p2',
    name: 'Coastal Villa Refresh',
    clientId: 'c2',
    leadDesignerId: 'd2',
    status: ProjectStatus.PLANNING,
    startDate: '2024-01-15',
    deadline: '2024-05-01',
    budget: 75000,
    thumbnail: 'https://picsum.photos/seed/p2/800/600',
    description: 'Soft furnishing update and new lighting scheme for a holiday home.',
    meetings: [],
    tasks: [],
    financials: [],
    activityLog: [
      { id: 'al3', userId: 'u1', action: 'Project Created', details: 'Project initialized in ERP', timestamp: '2024-01-01T10:00:00Z', type: 'creation' }
    ]
  }
];