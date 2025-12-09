import { GoogleGenAI, Type } from "@google/genai";
import { Task, TaskStatus } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const generateProjectTasks = async (projectDescription: string, projectId: string): Promise<Task[]> => {
  if (!apiKey) {
    console.warn("API Key not found. Returning empty tasks.");
    return [];
  }

  try {
    const prompt = `
      You are an expert interior design project manager.
      Based on the following project description, generate a list of 5-8 essential tasks to complete the project.
      
      Project Description: "${projectDescription}"
      
      Return the tasks in a JSON format compatible with the following schema structure. 
      Assign generic placeholder IDs for assignees if not known, or leave blank if unsure.
      Estimate due dates as relative days from now (e.g. "+7 days").
      Assign a category to each task (e.g., "Design & Planning", "Civil Works", "Electrical", "Plumbing", "Painting", "Carpentry", "Procurement").
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
              category: { type: Type.STRING },
              estimatedDaysFromNow: { type: Type.NUMBER }
            },
            required: ["title", "priority", "category", "estimatedDaysFromNow"]
          }
        }
      }
    });

    const generatedData = JSON.parse(response.text || '[]');

    const newTasks: Task[] = generatedData.map((item: any, index: number) => {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (item.estimatedDaysFromNow || 7));
      
      return {
        id: `gen_${projectId}_${Date.now()}_${index}`,
        title: item.title,
        description: item.description || '',
        status: TaskStatus.TODO,
        assigneeId: '', // Unassigned by default
        dueDate: dueDate.toISOString().split('T')[0],
        startDate: new Date().toISOString().split('T')[0], // Default start today
        priority: item.priority as 'low' | 'medium' | 'high',
        category: item.category || 'General',
        dependencies: [],
        subtasks: [],
        comments: [],
        approvals: {
          start: {
            client: { status: 'pending' },
            designer: { status: 'pending' }
          },
          completion: {
            client: { status: 'pending' },
            designer: { status: 'pending' }
          }
        }
      };
    });

    return newTasks;

  } catch (error) {
    console.error("Error generating tasks with Gemini:", error);
    return [];
  }
};