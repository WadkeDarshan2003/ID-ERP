import { getAllProjects, updateProject } from './firebaseService';
import { createProjectFinancialRecord } from './financialService';
import { FinancialRecord, Project } from '../types';

/**
 * Migrates legacy project.financials array to Firestore subcollection (finances)
 * - For each project, if project.financials exists and has items, add each to subcollection
 * - Optionally clears legacy financials array after migration
 */
export const migrateLegacyFinancials = async (clearLegacy = false) => {
  const projects: Project[] = await getAllProjects();
  for (const project of projects) {
    if (Array.isArray(project.financials) && project.financials.length > 0) {
      for (const record of project.financials) {
        // Remove id to let Firestore generate a new one, or use existing if you want to preserve
        const { id, ...recordData } = record;
        try {
          await createProjectFinancialRecord(project.id, recordData);
          if (process.env.NODE_ENV !== 'production') console.log(`Migrated record for project ${project.id}`);
        } catch (e) {
          console.error(`Failed to migrate record for project ${project.id}:`, e);
        }
      }
      if (clearLegacy) {
        try {
          await updateProject(project.id, { financials: [] });
          if (process.env.NODE_ENV !== 'production') console.log(`Cleared legacy financials for project ${project.id}`);
        } catch (e) {
          console.error(`Failed to clear legacy financials for project ${project.id}:`, e);
        }
      }
    }
  }
  if (process.env.NODE_ENV !== 'production') console.log('Migration complete.');
};
