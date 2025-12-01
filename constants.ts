import { Project, User, Role, ProjectStatus, TaskStatus } from './types';

// Construction Sequence / Category Order
export const CATEGORY_ORDER = [
  'Design & Planning',
  'Procurement',
  'Civil Works',
  'Carpentry',
  'Furniture',
  'Electrical',
  'Plumbing',
  'Painting',
  'Flooring',
  'Glazing',
  'HVAC',
  'General'
];

// --- Users ---
export const MOCK_USERS: User[] = [
  // Existing
  { id: 'u1', name: 'Alice Admin', role: Role.ADMIN, email: 'alice@luxespace.com', password: 'admin', avatar: 'https://ui-avatars.com/api/?name=Alice+Admin&background=0D8ABC&color=fff' },
  { id: 'd1', name: 'David Designer', role: Role.DESIGNER, email: 'david@luxespace.com', password: '123', specialty: 'Modern Minimalist', avatar: 'https://ui-avatars.com/api/?name=David+Designer&background=random' },
  { id: 'd2', name: 'Sarah Styles', role: Role.DESIGNER, email: 'sarah@luxespace.com', password: '123', specialty: 'Bohemian Chic', avatar: 'https://ui-avatars.com/api/?name=Sarah+Styles&background=random' },
  { id: 'v1', name: 'BuildRight Construction', role: Role.VENDOR, email: 'contact@buildright.com', password: '123', company: 'BuildRight', specialty: 'General Contractor', avatar: 'https://ui-avatars.com/api/?name=BuildRight&background=random' },
  { id: 'v2', name: 'Luxe Fabrics', role: Role.VENDOR, email: 'orders@luxefabrics.com', password: '123', company: 'Luxe Fabrics', specialty: 'Textiles', avatar: 'https://ui-avatars.com/api/?name=Luxe+Fabrics&background=random' },
  { id: 'c1', name: 'Michael Client', role: Role.CLIENT, email: 'mike@gmail.com', password: '123', phone: '555-0123', avatar: 'https://ui-avatars.com/api/?name=Michael+Client&background=random' },
  { id: 'c2', name: 'Jennifer Smith', role: Role.CLIENT, email: 'jen.smith@yahoo.com', password: '123', phone: '555-0987', avatar: 'https://ui-avatars.com/api/?name=Jennifer+Smith&background=random' },

  // New Designers
  { id: 'd3', name: 'Elena Rogers', role: Role.DESIGNER, email: 'elena@luxespace.com', password: '123', specialty: 'Industrial', avatar: 'https://ui-avatars.com/api/?name=Elena+Rogers&background=random' },
  { id: 'd4', name: 'Marcus Chen', role: Role.DESIGNER, email: 'marcus@luxespace.com', password: '123', specialty: 'Scandinavian', avatar: 'https://ui-avatars.com/api/?name=Marcus+Chen&background=random' },
  { id: 'd5', name: 'Priya Patel', role: Role.DESIGNER, email: 'priya@luxespace.com', password: '123', specialty: 'Traditional', avatar: 'https://ui-avatars.com/api/?name=Priya+Patel&background=random' },

  // New Vendors
  { id: 'v3', name: 'Spark Electric', role: Role.VENDOR, email: 'spark@vendors.com', password: '123', company: 'Spark Electric', specialty: 'Electrical', avatar: 'https://ui-avatars.com/api/?name=Spark+Electric&background=random' },
  { id: 'v4', name: 'Flow Plumbing', role: Role.VENDOR, email: 'flow@vendors.com', password: '123', company: 'Flow Plumbing', specialty: 'Plumbing', avatar: 'https://ui-avatars.com/api/?name=Flow+Plumbing&background=random' },
  { id: 'v5', name: 'ColorWorld Painters', role: Role.VENDOR, email: 'paint@vendors.com', password: '123', company: 'ColorWorld', specialty: 'Painting', avatar: 'https://ui-avatars.com/api/?name=ColorWorld&background=random' },
  { id: 'v6', name: 'WoodCraft Carpentry', role: Role.VENDOR, email: 'wood@vendors.com', password: '123', company: 'WoodCraft', specialty: 'Carpentry', avatar: 'https://ui-avatars.com/api/?name=WoodCraft&background=random' },
  { id: 'v7', name: 'Stone & Tile Co', role: Role.VENDOR, email: 'tile@vendors.com', password: '123', company: 'StoneTile', specialty: 'Flooring', avatar: 'https://ui-avatars.com/api/?name=Stone+Tile&background=random' },
  { id: 'v8', name: 'Glass Masters', role: Role.VENDOR, email: 'glass@vendors.com', password: '123', company: 'Glass Masters', specialty: 'Glazing', avatar: 'https://ui-avatars.com/api/?name=Glass+Masters&background=random' },
  { id: 'v9', name: 'Eco HVAC', role: Role.VENDOR, email: 'hvac@vendors.com', password: '123', company: 'Eco HVAC', specialty: 'HVAC', avatar: 'https://ui-avatars.com/api/?name=Eco+HVAC&background=random' },
  
  // New Clients
  { id: 'c3', name: 'Robert Fox', role: Role.CLIENT, email: 'robert@client.com', password: '123', phone: '555-1111', avatar: 'https://ui-avatars.com/api/?name=Robert+Fox&background=random' },
  { id: 'c4', name: 'Emily Blunt', role: Role.CLIENT, email: 'emily@client.com', password: '123', phone: '555-2222', avatar: 'https://ui-avatars.com/api/?name=Emily+Blunt&background=random' },
  { id: 'c5', name: 'James Wilson', role: Role.CLIENT, email: 'james@client.com', password: '123', phone: '555-3333', avatar: 'https://ui-avatars.com/api/?name=James+Wilson&background=random' },
  { id: 'c6', name: 'Sophia Green', role: Role.CLIENT, email: 'sophia@client.com', password: '123', phone: '555-4444', avatar: 'https://ui-avatars.com/api/?name=Sophia+Green&background=random' },
  { id: 'c7', name: 'Daniel White', role: Role.CLIENT, email: 'daniel@client.com', password: '123', phone: '555-5555', avatar: 'https://ui-avatars.com/api/?name=Daniel+White&background=random' },
  { id: 'c8', name: 'Olivia Brown', role: Role.CLIENT, email: 'olivia@client.com', password: '123', phone: '555-6666', avatar: 'https://ui-avatars.com/api/?name=Olivia+Brown&background=random' },
  { id: 'c9', name: 'William Black', role: Role.CLIENT, email: 'william@client.com', password: '123', phone: '555-7777', avatar: 'https://ui-avatars.com/api/?name=William+Black&background=random' },
  { id: 'c10', name: 'Isabella Grey', role: Role.CLIENT, email: 'isabella@client.com', password: '123', phone: '555-8888', avatar: 'https://ui-avatars.com/api/?name=Isabella+Grey&background=random' }
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

// Helper to generate a basic project
const generateProject = (id: string, name: string, status: ProjectStatus, client: string, designer: string, budget: number): Project => ({
  id,
  name,
  clientId: client,
  leadDesignerId: designer,
  status,
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

export const MOCK_PROJECTS: Project[] = [
  // Existing P1
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
    documents: [
      { id: 'doc1', name: 'Floor_Plan_v3.pdf', type: 'pdf', url: '#', uploadedBy: 'd1', uploadDate: '2023-10-01', sharedWith: [Role.CLIENT, Role.VENDOR] },
      { id: 'doc2', name: 'Moodboard_Living.jpg', type: 'image', url: 'https://picsum.photos/seed/mood/400/300', uploadedBy: 'd1', uploadDate: '2023-10-02', sharedWith: [Role.CLIENT] }
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
        category: 'Design & Planning',
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
          start: { client: { status: 'approved' }, designer: { status: 'approved' } },
          completion: { client: { status: 'approved' }, designer: { status: 'approved' } }
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
        category: 'Procurement',
        dependencies: ['t1'],
        subtasks: [
           { id: 'st3', title: 'Visit showroom', isCompleted: true },
           { id: 'st4', title: 'Get quotes', isCompleted: false }
        ],
        comments: [],
        approvals: {
          start: { client: { status: 'approved' }, designer: { status: 'approved' } },
          completion: { client: { status: 'pending' }, designer: { status: 'pending' } }
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
        category: 'Civil Works',
        dependencies: ['t1'],
        subtasks: [
          { id: 'st5', title: 'Clear furniture', isCompleted: false },
          { id: 'st6', title: 'Remove drywall', isCompleted: false },
          { id: 'st7', title: 'Dispose debris', isCompleted: false }
        ],
        comments: [],
        approvals: createDefaultApprovals()
      }
    ],
    financials: [
      { id: 'f1', date: '2023-10-05', description: 'Initial Deposit', amount: 50000, type: 'income', status: 'paid', category: 'Retainer' },
      { id: 'f2', date: '2023-10-20', description: 'Permit Fees', amount: 2500, type: 'expense', status: 'paid', category: 'Legal' },
      // Added pending entries
      { id: 'f3', date: '2023-11-15', description: 'Cabinetry Advance', amount: 15000, type: 'expense', status: 'pending', category: 'Materials' },
      { id: 'f4', date: '2023-11-01', description: 'Milestone 2 Invoice', amount: 35000, type: 'income', status: 'pending', category: 'Milestone 2' }
    ],
    activityLog: [
      { id: 'al1', userId: 'u1', action: 'Project Created', details: 'Project initialized in ERP', timestamp: '2023-09-01T09:00:00Z', type: 'creation' },
      { id: 'al2', userId: 'c1', action: 'Task Approved', details: 'Client approved "Finalize Floor Plan"', timestamp: '2023-10-01T09:00:00Z', type: 'success' }
    ]
  },
  // Existing P2
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
    documents: [],
    financials: [],
    activityLog: [
      { id: 'al3', userId: 'u1', action: 'Project Created', details: 'Project initialized in ERP', timestamp: '2024-01-01T10:00:00Z', type: 'creation' }
    ]
  },
  // 15 New Projects
  generateProject('p3', 'Skyline Office HQ', ProjectStatus.IN_PROGRESS, 'c3', 'd3', 250000),
  generateProject('p4', 'Modern Loft Conversion', ProjectStatus.PLANNING, 'c4', 'd1', 120000),
  generateProject('p5', 'Victorian Heritage Restore', ProjectStatus.ON_HOLD, 'c5', 'd4', 300000),
  generateProject('p6', 'Seaside Cottage', ProjectStatus.COMPLETED, 'c6', 'd2', 65000),
  generateProject('p7', 'Urban Micro-Apartment', ProjectStatus.IN_PROGRESS, 'c7', 'd5', 45000),
  generateProject('p8', 'Tech Startup Workspace', ProjectStatus.PROCUREMENT, 'c8', 'd3', 180000),
  generateProject('p9', 'Luxury Spa & Retreat', ProjectStatus.IN_PROGRESS, 'c9', 'd4', 400000),
  generateProject('p10', 'Minimalist Studio', ProjectStatus.PLANNING, 'c10', 'd1', 30000),
  generateProject('p11', 'Family Home Extension', ProjectStatus.IN_PROGRESS, 'c3', 'd2', 95000),
  generateProject('p12', 'Boutique Coffee Shop', ProjectStatus.COMPLETED, 'c4', 'd5', 70000),
  generateProject('p13', 'Executive Suite Remodel', ProjectStatus.PROCUREMENT, 'c5', 'd3', 55000),
  generateProject('p14', 'Garden Oasis Landscaping', ProjectStatus.PLANNING, 'c6', 'd4', 25000),
  generateProject('p15', 'Art Gallery Lighting', ProjectStatus.ON_HOLD, 'c7', 'd1', 40000),
  generateProject('p16', 'Library Reading Room', ProjectStatus.IN_PROGRESS, 'c8', 'd2', 60000),
  generateProject('p17', 'Home Cinema Setup', ProjectStatus.PLANNING, 'c9', 'd5', 85000)
];

// Add some random tasks for vendors in new projects to make dashboard lively
const extraTasks: any[] = [
  { id: 't_ex_1', title: 'Install Wiring', projectId: 'p3', assignee: 'v3', status: TaskStatus.IN_PROGRESS, category: 'Electrical' },
  { id: 't_ex_2', title: 'Plumbing Rough-in', projectId: 'p3', assignee: 'v4', status: TaskStatus.TODO, category: 'Plumbing' },
  { id: 't_ex_3', title: 'Paint Walls', projectId: 'p4', assignee: 'v5', status: TaskStatus.TODO, category: 'Painting' },
  { id: 't_ex_4', title: 'Custom Cabinetry', projectId: 'p5', assignee: 'v6', status: TaskStatus.ON_HOLD, category: 'Carpentry' },
  { id: 't_ex_5', title: 'Lay Marble Flooring', projectId: 'p7', assignee: 'v7', status: TaskStatus.IN_PROGRESS, category: 'Flooring' },
  { id: 't_ex_6', title: 'Install Glass Partitions', projectId: 'p8', assignee: 'v8', status: TaskStatus.IN_PROGRESS, category: 'Glazing' },
  { id: 't_ex_7', title: 'HVAC Ducting', projectId: 'p9', assignee: 'v9', status: TaskStatus.IN_PROGRESS, category: 'HVAC' },
  { id: 't_ex_8', title: 'Foundation Repair', projectId: 'p11', assignee: 'v1', status: TaskStatus.IN_PROGRESS, category: 'Civil Works' },
];

extraTasks.forEach(et => {
  const proj = MOCK_PROJECTS.find(p => p.id === et.projectId);
  if (proj) {
    proj.tasks.push({
      id: et.id,
      title: et.title,
      status: et.status,
      assigneeId: et.assignee,
      startDate: '2023-12-01',
      dueDate: '2023-12-15',
      priority: 'medium',
      category: et.category,
      dependencies: [],
      subtasks: [],
      comments: [],
      approvals: createDefaultApprovals()
    });
  }
});