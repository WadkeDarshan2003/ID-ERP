import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { FinancialRecord } from "../types";

// ============ PROJECT FINANCIAL RECORDS - SUBCOLLECTION ONLY ============

// Create financial record in project subcollection
export const createProjectFinancialRecord = async (projectId: string, record: Omit<FinancialRecord, 'id'>): Promise<string> => {
  try {
    const recordsRef = collection(db, "projects", projectId, "finances");
    const newRecordRef = doc(recordsRef);
    // Remove undefined values before sending to Firebase
    const cleanedRecord = Object.fromEntries(
      Object.entries({ ...record }).filter(([_, v]) => v !== undefined)
    );
    await setDoc(newRecordRef, {
      ...cleanedRecord,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Financial record created for project ${projectId}`);
    return newRecordRef.id;
  } catch (error) {
    console.error("Error creating financial record:", error);
    throw error;
  }
};

// Update financial record in project subcollection
export const updateProjectFinancialRecord = async (projectId: string, recordId: string, updates: Partial<FinancialRecord>): Promise<void> => {
  try {
    // Remove undefined values before sending to Firebase
    const cleanedUpdates = Object.fromEntries(
      Object.entries({ ...updates }).filter(([_, v]) => v !== undefined)
    );
    await updateDoc(doc(db, "projects", projectId, "finances", recordId), {
      ...cleanedUpdates,
      updatedAt: new Date()
    });
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Financial record updated for project ${projectId}`);
  } catch (error) {
    console.error("Error updating financial record:", error);
    throw error;
  }
};

// Delete financial record from project subcollection
export const deleteProjectFinancialRecord = async (projectId: string, recordId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, "projects", projectId, "finances", recordId));
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Financial record deleted for project ${projectId}`);
  } catch (error) {
    console.error("Error deleting financial record:", error);
    throw error;
  }
};

// Get financial records from project subcollection
export const getProjectFinancialRecords = async (projectId: string): Promise<FinancialRecord[]> => {
  try {
    const recordsRef = collection(db, "projects", projectId, "finances");
    const snapshot = await getDocs(recordsRef);
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FinancialRecord));
  } catch (error) {
    console.error("Error fetching financial records:", error);
    return [];
  }
};

// Real-time listener for project's financial records (subcollection)
export const subscribeToProjectFinancialRecords = (projectId: string, callback: (records: FinancialRecord[]) => void): Unsubscribe => {
  return onSnapshot(
    collection(db, "projects", projectId, "finances"),
    (snapshot) => {
      const records = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FinancialRecord));
        // Financial records updated for project
        callback(records);
    },
    (error) => {
      // Suppress permission-denied errors during logout (expected behavior)
      if (error.code !== 'permission-denied') {
        console.error("Error subscribing to financial records:", error);
      }
    }
  );
};

// ============ FINANCIAL CALCULATIONS ============

// Calculate total project revenue
export const calculateProjectRevenue = (records: FinancialRecord[]): number => {
  return records
    .filter(r => r.type === "income" && r.paidTo === "Admin")
    .reduce((sum, r) => sum + r.amount, 0);
};

// Calculate vendor total payments
export const calculateVendorPayments = (records: FinancialRecord[]): number => {
  return records
    .filter(r => r.type === "expense")
    .reduce((sum, r) => sum + r.amount, 0);
};

// Calculate pending approvals
export const calculatePendingApprovals = (records: FinancialRecord[]): FinancialRecord[] => {
  return records.filter(r => !r.adminApproved || !r.clientApproved);
};

// Calculate approved amount
export const calculateApprovedAmount = (records: FinancialRecord[]): number => {
  return records
    .filter(r => r.adminApproved && r.clientApproved)
    .reduce((sum, r) => sum + r.amount, 0);
};
