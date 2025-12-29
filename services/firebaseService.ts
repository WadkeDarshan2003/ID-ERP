import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  QueryConstraint,
  Unsubscribe
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { Project, User, Task, TaskStatus, FinancialRecord } from "../types";

// ============ VENDOR EARNINGS SYNC ============

/**
 * Aggregates vendor earnings and designer charges from all projects and updates each vendor's Firestore document.
 * Adds fields: totalEarnings, totalDesignerCharges, projectBreakdown (per project) to each vendor doc.
 */
export async function syncAllVendorsEarnings(tenantId?: string) {
  try {
    // Fetch all projects
    let q = query(collection(db, 'projects'));
    if (tenantId) {
      q = query(collection(db, 'projects'), where('tenantId', '==', tenantId));
    }
    const projectsSnap = await getDocs(q);
    const projects: Project[] = projectsSnap.docs.map(snap => ({ ...snap.data(), id: snap.id } as Project));

    // Map: vendorId -> { totalEarnings, totalDesignerCharges, projectBreakdown }
    const vendorMap: Record<string, {
      totalEarnings: number;
      totalDesignerCharges: number;
      projectBreakdown: Record<string, { projectName: string; earnings: number; designerCharges: number; }>
    }> = {};

    for (const project of projects) {
      const designerChargePercent = project.designerChargePercentage || 0;
      if (!project.financials) continue;
      for (const fin of project.financials) {
        if (fin.type === 'expense' && fin.vendorId) {
          if (!vendorMap[fin.vendorId]) {
            vendorMap[fin.vendorId] = {
              totalEarnings: 0,
              totalDesignerCharges: 0,
              projectBreakdown: {}
            };
          }
          // Add to totals
          vendorMap[fin.vendorId].totalEarnings += fin.amount;
          const designerCharge = (fin.amount * designerChargePercent) / 100;
          vendorMap[fin.vendorId].totalDesignerCharges += designerCharge;
          // Per-project breakdown
          if (!vendorMap[fin.vendorId].projectBreakdown[project.id]) {
            vendorMap[fin.vendorId].projectBreakdown[project.id] = {
              projectName: project.name,
              earnings: 0,
              designerCharges: 0
            };
          }
          vendorMap[fin.vendorId].projectBreakdown[project.id].earnings += fin.amount;
          vendorMap[fin.vendorId].projectBreakdown[project.id].designerCharges += designerCharge;
        }
      }
    }

    // Update each vendor doc in Firestore
    for (const [vendorId, data] of Object.entries(vendorMap)) {
      await setDoc(doc(db, 'vendors', vendorId), {
        totalEarnings: data.totalEarnings,
        totalDesignerCharges: data.totalDesignerCharges,
        projectBreakdown: data.projectBreakdown
      }, { merge: true });
    }
    
    if (process.env.NODE_ENV !== 'production') console.log('✅ Vendor earnings synced successfully');
  } catch (error) {
    console.error('❌ Error syncing vendor earnings:', error);
    throw error;
  }
}

// ============ VENDOR METRICS AGGREGATION ============

/**
 * Aggregates vendor metrics from all projects and stores them in each vendor's document
 * This ensures all vendor data comes from one place (the vendor document itself)
 */
export async function syncAllVendorMetrics(tenantId?: string): Promise<void> {
  try {
    // Fetch all projects
    let q = query(collection(db, 'projects'));
    if (tenantId) {
      q = query(collection(db, 'projects'), where('tenantId', '==', tenantId));
    }
    const projectsSnap = await getDocs(q);
    const projects: Project[] = projectsSnap.docs.map(snap => ({ ...snap.data(), id: snap.id } as Project));

    // Map: vendorId -> { projectId -> { projectName, taskCount, netAmount } }
    const vendorMetrics: Record<string, Record<string, {
      projectName: string;
      taskCount: number;
      netAmount: number;
    }>> = {};

    // Process each project
    for (const project of projects) {
      // Get all distinct vendor IDs from tasks ONLY (not from names)
      const vendorIds = new Set<string>();
      
      project.tasks?.forEach(task => {
        if (task.assigneeId) vendorIds.add(task.assigneeId);
      });

      // Calculate metrics for each vendor in this project
      for (const vendorId of vendorIds) {
        if (!vendorMetrics[vendorId]) {
          vendorMetrics[vendorId] = {};
        }

        // Count ALL tasks assigned to this vendor (not just DONE)
        const allTaskCount = (project.tasks || []).filter(
          t => t.assigneeId === vendorId
        ).length;

        // Calculate net amount from approved financials
        const vendorFinancials = (project.financials || []).filter(f => 
          (f.adminApproved && f.clientApproved) &&
          (f.vendorId === vendorId)
        );

        const totalPaidToVendor = vendorFinancials
          .filter(f => f.receivedByName && f.receivedByName.includes(vendorId))
          .reduce((sum, f) => sum + f.amount, 0);

        const totalPaidByVendor = vendorFinancials
          .filter(f => f.vendorId === vendorId)
          .reduce((sum, f) => sum + f.amount, 0);

        const netAmount = totalPaidToVendor - totalPaidByVendor;

        vendorMetrics[vendorId][project.id] = {
          projectName: project.name,
          taskCount: allTaskCount,
          netAmount: netAmount
        };
      }
    }

    // Update each vendor's document with their project metrics
    for (const [vendorId, projectMetrics] of Object.entries(vendorMetrics)) {
      try {
        await updateDoc(doc(db, 'users', vendorId), {
          projectMetrics: projectMetrics
        });
      } catch (error: any) {
        // Silently skip if user doesn't exist (vendor might not have account yet)
        if (error.code !== 'not-found') {
          console.warn(`⚠️ Could not update metrics for vendor ${vendorId}:`, error.message);
        }
      }
    }

    if (process.env.NODE_ENV !== 'production') console.log('✅ All vendor metrics synced successfully');
  } catch (error) {
    console.error('❌ Error syncing vendor metrics:', error);
  }
}

// ============ PROJECTS COLLECTION ============

export const projectsRef = collection(db, "projects");

// Get all projects
export const getAllProjects = async (): Promise<Project[]> => {
  try {
    const snapshot = await getDocs(projectsRef);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
};

// Get single project
export const getProject = async (projectId: string): Promise<Project | null> => {
  try {
    const docSnap = await getDoc(doc(db, "projects", projectId));
    if (docSnap.exists()) {
      return { ...docSnap.data(), id: docSnap.id } as Project;
    }
    return null;
  } catch (error) {
    console.error("Error fetching project:", error);
    return null;
  }
};

// Helper to recursively remove undefined values
const cleanUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(v => cleanUndefined(v)).filter(v => v !== undefined);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .map(([k, v]) => [k, cleanUndefined(v)])
        .filter(([_, v]) => v !== undefined)
    );
  }
  return obj;
};

// Create project
export const createProject = async (project: Omit<Project, "id">): Promise<string> => {
  try {
    const newDocRef = doc(projectsRef);
    const cleanedProject = cleanUndefined(project);
    await setDoc(newDocRef, cleanedProject);
    return newDocRef.id;
  } catch (error) {
    console.error("Error creating project:", error);
    throw error;
  }
};

// Update project
export const updateProject = async (projectId: string, updates: Partial<Project>): Promise<void> => {
  try {
    // Remove undefined values recursively - Firebase doesn't allow them
    const cleanedUpdates = cleanUndefined(updates);
    await updateDoc(doc(db, "projects", projectId), cleanedUpdates);
  } catch (error) {
    console.error("Error updating project:", error);
    throw error;
  }
};

// Delete project
export const deleteProject = async (projectId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId));
  } catch (error) {
    console.error("Error deleting project:", error);
    throw error;
  }
};

// Real-time listener for projects
export const subscribeToProjects = (callback: (projects: Project[]) => void, tenantId?: string): Unsubscribe => {
  let q = query(projectsRef);
  if (tenantId) {
    q = query(projectsRef, where('tenantId', '==', tenantId));
  }

  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
    callback(projects);
  }, (error) => {
    // Suppress permission-denied errors during logout - these are expected
    if (error.code !== 'permission-denied') {
      console.error('❌ Error in projects collection listener:', error);
    }
  });
};

// Real-time listener for user's projects
export const subscribeToUserProjects = (
  userId: string,
  userRole: string,
  callback: (projects: Project[]) => void
): Unsubscribe => {
  let constraints: QueryConstraint[] = [];
  
  if (userRole === "Client") {
    constraints = [where("clientId", "==", userId)];
  } else if (userRole === "Designer") {
    constraints = [where("leadDesignerId", "==", userId)];
  } else if (userRole === "Vendor") {
    constraints = [where("vendorIds", "array-contains", userId)];
  } else if (userRole === "Vendor") {
    constraints = [where("vendorIds", "array-contains", userId)];
  }

  const q = query(projectsRef, ...constraints);
  
  return onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
    callback(projects);
  }, (error) => {
    // Suppress permission-denied errors during logout
    if (error.code !== 'permission-denied') {
      console.error('❌ Error in user projects listener:', error);
    }
  });
};

// ============ USERS COLLECTION ============

export const usersRef = collection(db, "users");

// Get all users
export const getAllUsers = async (): Promise<User[]> => {
  try {
    const snapshot = await getDocs(usersRef);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
};

// Get single user
export const getUser = async (userId: string): Promise<User | null> => {
  try {
    // First try: Check users collection
    const docSnap = await getDoc(doc(db, "users", userId));
    if (docSnap.exists()) {
      const userData = { ...docSnap.data(), id: docSnap.id } as User;
      
      // IMPORTANT: Ensure every user has a tenantId for proper data isolation
      // If missing, assign UID as tenantId (this is a fallback for existing users)
      if (!userData.tenantId) {
        console.warn(`⚠️ User ${userId} missing tenantId. Assigning UID as tenantId.`);
        userData.tenantId = userId;
        
        // Persist the fix back to Firestore
        try {
          await updateDoc(doc(db, "users", userId), { tenantId: userId });
          console.log(`✅ Updated user ${userId} with tenantId in Firestore`);
        } catch (updateError) {
          console.warn(`⚠️ Could not persist tenantId to Firestore for ${userId}, will use in-memory value`);
        }
      }
      
      return userData;
    }
    
    // Second try: Check clients collection if not in users
    console.log(`User ${userId} not found in users collection, checking clients...`);
    const clientSnap = await getDoc(doc(db, "clients", userId));
    if (clientSnap.exists()) {
      const userData = { ...clientSnap.data(), id: clientSnap.id } as User;
      
      // Ensure tenantId is set
      if (!userData.tenantId) {
        console.warn(`⚠️ Client ${userId} missing tenantId. Assigning UID as tenantId.`);
        userData.tenantId = userId;
        
        // Persist the fix back to Firestore
        try {
          await updateDoc(doc(db, "clients", userId), { tenantId: userId });
          console.log(`✅ Updated client ${userId} with tenantId in Firestore`);
        } catch (updateError) {
          console.warn(`⚠️ Could not persist tenantId to Firestore for ${userId}, will use in-memory value`);
        }
      }
      
      return userData;
    }
    
    console.warn(`User document not found for ID: ${userId}. Make sure to create a user profile in Firestore.`);
    return null;
  } catch (error: any) {
    if (error.code === 'failed-precondition') {
      console.error(`Firebase offline: ${error.message}`);
    } else {
      console.error("Error fetching user:", error);
    }
    throw error;
  }
};

// Claim a phone user profile (migrate from placeholder to real UID)
export const claimPhoneUserProfile = async (uid: string, phoneNumber: string): Promise<User | null> => {
  try {
    console.log(`📱 Phone login - UID: ${uid}, Phone: ${phoneNumber}`);
    
    // First try: Look by UID (if already linked)
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data() as User;
      console.log(`✅ Found user by UID: ${uid}`);
      return userData;
    }

    // Second try: Search vendors by phone number (first login case)
    console.log(`📱 UID not found, searching vendors by phone...`);
    
    const vendorsRef = collection(db, "vendors");
    
    // Normalize the phone from Firebase Auth (digits only)
    // Firebase returns phone like "+919307710946"
    // Firestore stores it like "919307710946" (digits only)
    const normalizedSearchPhone = phoneNumber.replace(/\D/g, ''); // Just digits
    console.log(`🔎 Searching with normalized phone: "${normalizedSearchPhone}"`);
    
    const q = query(vendorsRef, where("phone", "==", normalizedSearchPhone));
    const querySnap = await getDocs(q);
    
    if (!querySnap.empty) {
      const oldDocData = querySnap.docs[0].data() as User;
      const oldDocId = querySnap.docs[0].id;
      console.log(`✅ Found vendor by phone: ${normalizedSearchPhone}, oldID: ${oldDocId}`);
      
      let finalData = oldDocData;
      
      // Ensure tenantId is set - use UID for data isolation
      if (!finalData.tenantId) {
        finalData.tenantId = uid;
      }
      
      // NOW MIGRATE: Update document ID from temporary ID to real Firebase Auth UID
      if (oldDocId !== uid) {
        console.log(`🔄 Migrating document from ${oldDocId} to real UID: ${uid}`);
        
        // Update data with new UID and tenantId
        const updatedData = { ...oldDocData, id: uid, tenantId: uid };
        finalData = updatedData;
        
        // Save to new UID location in users collection
        await setDoc(doc(db, "users", uid), updatedData);
        
        // Save to new UID location in vendors collection
        await setDoc(doc(db, "vendors", uid), updatedData);
        
        // Delete old temporary documents (from ALL sources to prevent duplicates)
        console.log(`🗑️ Deleting old documents with ID: ${oldDocId}`);
        await deleteDoc(doc(db, "users", oldDocId));
        await deleteDoc(doc(db, "vendors", oldDocId));
        console.log(`✅ Deleted old documents with ID: ${oldDocId}`);
      }
      
      return finalData;
    }

    console.log(`❌ No vendor found with phone: ${normalizedSearchPhone}`);
    return null;
  } catch (error) {
    console.error("Error claiming phone profile:", error);
    return null;
  }
};

// Create user
export const createUser = async (user: User): Promise<string> => {
  try {
    await setDoc(doc(db, "users", user.id), user);
    return user.id;
  } catch (error) {
    console.error("Error creating user:", error);
    throw error;
  }
};

// Update user
export const updateUser = async (userId: string, updates: Partial<User>): Promise<void> => {
  try {
    await updateDoc(doc(db, "users", userId), updates);
  } catch (error) {
    console.error("Error updating user:", error);
    throw error;
  }
};

// Real-time listener for users
export const subscribeToUsers = (callback: (users: User[]) => void, tenantId?: string): Unsubscribe => {
  
  let allUsers: User[] = [];
  let unsubscribers: Unsubscribe[] = [];

  let q = query(usersRef);
  if (tenantId) {
    q = query(usersRef, where('tenantId', '==', tenantId));
  }

  // Listen to main users collection
  const unsubUser = onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
    // Real-time update received for users
    allUsers = users;
    callback(allUsers);
  }, (error) => {
    console.error('❌ Error in users collection listener:', error);
  });

  unsubscribers.push(unsubUser);

  // Return cleanup function
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};

// ============ BULK OPERATIONS ============

// Seed initial data to Firestore
export const seedDatabase = async (projects: Project[], users: User[]): Promise<void> => {
  try {
    // Add projects
    for (const project of projects) {
      const { id, ...projectData } = project;
      await setDoc(doc(db, "projects", id), projectData);
    }

    // Add users
    for (const user of users) {
      const { id, ...userData } = user;
      await setDoc(doc(db, "users", id), userData);
    }

    if (process.env.NODE_ENV !== 'production') console.log("Database seeded successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
};

// ============ ROLE-SPECIFIC COLLECTIONS ============

// Real-time listener for designers
export const subscribeToDesigners = (callback: (designers: User[]) => void, tenantId?: string): Unsubscribe => {
  let q = query(collection(db, "designers"));
  if (tenantId) {
    q = query(collection(db, "designers"), where('tenantId', '==', tenantId));
  }
  return onSnapshot(q, (snapshot) => {
    const designers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
    // Real-time update received for designers
    callback(designers);
  }, (error) => {
    // Suppress permission-denied errors during logout
    if (error.code !== 'permission-denied') {
      console.error('❌ Error in designers collection listener:', error);
    }
  });
};

// Real-time listener for vendors
export const subscribeToVendors = (callback: (vendors: User[]) => void, tenantId?: string): Unsubscribe => {
  let q = query(collection(db, "vendors"));
  if (tenantId) {
    q = query(collection(db, "vendors"), where('tenantId', '==', tenantId));
  }
  return onSnapshot(q, (snapshot) => {
    const vendors = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
    // Real-time update received for vendors
    callback(vendors);
  }, (error) => {
    // Suppress permission-denied errors during logout
    if (error.code !== 'permission-denied') {
      console.error('❌ Error in vendors collection listener:', error);
    }
  });
};

// Real-time listener for clients
export const subscribeToClients = (callback: (clients: User[]) => void, tenantId?: string): Unsubscribe => {
  let q = query(collection(db, "clients"));
  if (tenantId) {
    q = query(collection(db, "clients"), where('tenantId', '==', tenantId));
  }
  return onSnapshot(q, (snapshot) => {
    const clients = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as User));
    // Real-time update received for clients
    callback(clients);
  }, (error) => {
    // Suppress permission-denied errors during logout
    if (error.code !== 'permission-denied') {
      console.error('❌ Error in clients collection listener:', error);
    }
  });
};
