import { Project, User, Role, ProjectStatus, TaskStatus } from './types';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Alice Admin', role: Role.ADMIN, email: 'alice@luxespace.com', avatar: 'https://picsum.photos/seed/alice/100/100' },
  { id: 'd1', name: 'David Designer', role: Role.DESIGNER, email: 'david@luxespace.com', specialty: 'Modern Minimalist', avatar: 'https://picsum.photos/seed/david/100/100' },
  { id: 'd2', name: 'Sarah Styles', role: Role.DESIGNER, email: 'sarah@luxespace.com', specialty: 'Bohemian Chic', avatar: 'https://picsum.photos/seed/sarah/100/100' },
  { id: 'v1', name: 'BuildRight Construction', role: Role.VENDOR, email: 'contact@buildright.com', company: 'BuildRight', specialty: 'General Contractor', avatar: 'https://picsum.photos/seed/build/100/100' },
  { id: 'v2', name: 'Luxe Fabrics', role: Role.VENDOR, email: 'orders@luxefabrics.com', company: 'Luxe Fabrics', specialty: 'Textiles', avatar: 'https://picsum.photos/seed/fabric/100/100' },
  { id: 'c1', name: 'Michael Client', role: Role.CLIENT, email: 'mike@gmail.com', phone: '555-0123', avatar: 'https://picsum.photos/seed/mike/100/100' },
  { id: 'c2', name: 'Jennifer Smith', role: Role.CLIENT, email: 'jen.smith@yahoo.com', phone: '555-0987', avatar: 'https://picsum.photos/seed/jen/100/100' },
];

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
    tasks: [
      { id: 't1', title: 'Finalize Floor Plan', status: TaskStatus.DONE, assigneeId: 'd1', dueDate: '2023-10-15', priority: 'high' },
      { id: 't2', title: 'Source Kitchen Cabinetry', status: TaskStatus.IN_PROGRESS, assigneeId: 'd1', dueDate: '2023-11-01', priority: 'medium' },
      { id: 't3', title: 'Demolition of Partition Walls', status: TaskStatus.TODO, assigneeId: 'v1', dueDate: '2023-11-10', priority: 'high' }
    ],
    financials: [
      { id: 'f1', date: '2023-10-05', description: 'Initial Deposit', amount: 50000, type: 'income', status: 'paid', category: 'Retainer' },
      { id: 'f2', date: '2023-10-20', description: 'Permit Fees', amount: 2500, type: 'expense', status: 'paid', category: 'Legal' },
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
    tasks: [],
    financials: []
  }
];
