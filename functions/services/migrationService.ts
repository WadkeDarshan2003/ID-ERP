import { getAllProjects, updateProject } from './firebaseService';
import { createProjectFinancialRecord } from './financialService';
import { FinancialRecord, Project } from '../types';

/**
 * Migrates legacy project.financials array to Firestore subcollection (finances)
 * - For each project, if project.financials exists and has items, add each to subcollection
 * - Optionally clears legacy financials array after migration
 */
export const migrateLegacyFinancials = async (clearLegacy = true) => {
  try {
    if (process.env.NODE_ENV !== 'production') console.log('🔄 Starting legacy financials migration...');
    const projects: Project[] = await getAllProjects();
    let migratedCount = 0;
    let projectsWithData = 0;

    for (const project of projects) {
      if (Array.isArray(project.financials) && project.financials.length > 0) {
        projectsWithData++;
        if (process.env.NODE_ENV !== 'production') console.log(`📦 Project "${project.name}" has ${project.financials.length} legacy transactions`);
        
        for (const record of project.financials) {
          // Remove id to let Firestore generate a new one, or use existing if you want to preserve
          const { id, ...recordData } = record;
          try {
            await createProjectFinancialRecord(project.id, recordData);
            migratedCount++;
            if (process.env.NODE_ENV !== 'production') console.log(`✅ Migrated transaction: ${record.description}`);
          } catch (e) {
            console.error(`❌ Failed to migrate transaction for project ${project.id}:`, e);
          }
        }
        
        if (clearLegacy) {
          try {
            await updateProject(project.id, { financials: [] });
            if (process.env.NODE_ENV !== 'production') console.log(`🗑️ Cleared legacy financials for project ${project.name}`);
          } catch (e) {
            console.error(`❌ Failed to clear legacy financials for project ${project.id}:`, e);
          }
        }
      }
    }
    
    if (process.env.NODE_ENV !== 'production') console.log(`✅ Migration complete: ${migratedCount} transactions from ${projectsWithData} projects migrated`);
    return { success: true, migratedCount, projectsWithData };
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};
