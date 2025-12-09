import { Task, Project, TaskStatus } from '../types';

export const calculateTaskProgress = (task: Task | Partial<Task>): number => {
  // If task has subtasks, calculate based on completion
  if (task.subtasks && task.subtasks.length > 0) {
    const completedCount = task.subtasks.filter(s => s.isCompleted).length;
    return Math.round((completedCount / task.subtasks.length) * 100);
  }

  // Fallback: If no subtasks, base it on status
  if (task.status === TaskStatus.DONE) return 100;
  
  // Optional: Give some progress for being in progress? 
  // For now, sticking to 0 unless done or has checklist items as per user request "checklist completion measure one task progress"
  return 0;
};

export const calculateProjectProgress = (tasks: Task[]): number => {
  if (!tasks || tasks.length === 0) return 0;

  const totalProgress = tasks.reduce((sum, task) => {
    return sum + calculateTaskProgress(task);
  }, 0);

  return Math.round(totalProgress / tasks.length);
};
