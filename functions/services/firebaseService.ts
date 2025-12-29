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
import { Project, User, Task, TaskStatus, FinancialRecord } from "../../types";

// ============ VENDOR EARNINGS SYNC ============

/**
 * Aggregates vendor earnings and designer charges from all projects and updates each vendor's Firestore document.
 * Adds fields: totalEarnings, totalDesignerCharges, projectBreakdown (per project) to each vendor doc.
 */
export async function syncAllVendorsEarnings() {
  try {
    // Fetch all projects
    const projectsSnap = await getDocs(collection(db, 'projects'));
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
export async function syncAllVendorMetrics(): Promise<void> {
  try {
    // Fetch all projects
    const projectsSnap = await getDocs(collection(db, 'projects'));
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
      
      project.tasks?.forEach((task: Task) => {
        if (task.assigneeId) vendorIds.add(task.assigneeId);
      });

      // Calculate metrics for each vendor in this project
      for (const vendorId of vendorIds) {
        if (!vendorMetrics[vendorId]) {
          vendorMetrics[vendorId] = {};
        }

        // Count ALL tasks assigned to this vendor (not just DONE)
        const allTaskCount = (project.tasks || []).filter(
          (t: Task) => t.assigneeId === vendorId
        ).length;

        // Calculate net amount from approved financials
        const vendorFinancials = (project.financials || []).filter((f: FinancialRecord) => 
          (f.adminApproved && f.clientApproved) &&
          (f.vendorId === vendorId)
        );

        const totalPaidToVendor = vendorFinancials
          .filter((f: FinancialRecord) => f.receivedByName && f.receivedByName.includes(vendorId))
          .reduce((sum: number, f: FinancialRecord) => sum + f.amount, 0);

        const totalPaidByVendor = vendorFinancials
          .filter((f: FinancialRecord) => f.vendorId === vendorId)
          .reduce((sum: number, f: FinancialRecord) => sum + f.amount, 0);

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
export const subscribeToProjects = (callback: (projects: Project[]) => void): Unsubscribe => {
  return onSnapshot(projectsRef, (snapshot) => {
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
    const docSnap = await getDoc(doc(db, "users", userId));
    if (docSnap.exists()) {
      return { ...docSnap.data(), id: docSnap.id } as User;
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
    console.log(`📱 Looking for user profile - UID: ${uid}, Phone: ${phoneNumber}`);
    
    // First try: Look up by UID directly
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data() as User;
      console.log(`✅ Found user by UID: ${uid}`);
      return userData;
    }

    // Second try: Search by phone number (handle multiple formats)
    const cleanPhone = phoneNumber.replace(/\D/g, ''); // e.g., "919960207455"
    console.log(`📱 UID not found, searching by phone (clean: ${cleanPhone})...`);
    
    const usersRef = collection(db, "users");
    
    // Try multiple phone formats
    const phoneFormats = [
      phoneNumber,                    // Original: "+91 9960207455"
      phoneNumber.replace(/\s/g, ''), // No spaces: "+919960207455"
      cleanPhone,                     // Only digits: "919960207455"
      `+${cleanPhone}`,              // With +: "+919960207455"
    ];

    for (const format of phoneFormats) {
      const q = query(usersRef, where("phone", "==", format));
      const querySnap = await getDocs(q);
      
      if (!querySnap.empty) {
        const userData = querySnap.docs[0].data() as User;
        console.log(`✅ Found existing user by phone format "${format}"!`);
        return userData;
      }
    }

    // Third try: Look for placeholder profile
    const placeholderId = `phone_${cleanPhone}`;
    const placeholderRef = doc(db, "users", placeholderId);
    const placeholderSnap = await getDoc(placeholderRef);

    if (placeholderSnap.exists()) {
      const userData = placeholderSnap.data() as User;
      console.log(`📱 Found placeholder profile. Migrating to UID: ${uid}`);

      const newUserData = { ...userData, id: uid };
      await setDoc(doc(db, "users", uid), newUserData);

      const roleCollection = userData.role.toLowerCase() + 's';
      await setDoc(doc(db, roleCollection, uid), newUserData);

      await deleteDoc(placeholderRef);
      await deleteDoc(doc(db, roleCollection, placeholderId));

      return newUserData;
    }

    console.log(`❌ No profile found for UID: ${uid}, Phone: ${phoneNumber}`);
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
export const subscribeToUsers = (callback: (users: User[]) => void): Unsubscribe => {
  let allUsers: User[] = [];
  let unsubscribers: Unsubscribe[] = [];

  // Listen to main users collection
  const unsubUser = onSnapshot(usersRef, (snapshot) => {
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
export const subscribeToDesigners = (callback: (designers: User[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "designers"), (snapshot) => {
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
export const subscribeToVendors = (callback: (vendors: User[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "vendors"), (snapshot) => {
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
export const subscribeToClients = (callback: (clients: User[]) => void): Unsubscribe => {
  return onSnapshot(collection(db, "clients"), (snapshot) => {
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
