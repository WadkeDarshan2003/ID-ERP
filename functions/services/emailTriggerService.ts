/**
 * Email Trigger Service
 * Handles automated email sending for various events
 */

import { Task, User, Project, ProjectDocument } from '../../types';
import { formatDateToIndian } from '../../utils/taskUtils';
import {
  sendTaskAssignmentEmail,
  sendTaskReminder,
  sendDocumentSharedEmail,
  sendEmail,
} from './emailService';

/**
 * Send email when task is assigned/created
 */
export const sendTaskCreationEmail = async (
  task: Task,
  assignee: User,
  projectName: string
): Promise<void> => {
  if (!assignee.email) {
    console.warn(`⚠️ No email for assignee ${assignee.name}`);
    return;
  }

  try {
    const result = await sendTaskAssignmentEmail(
      assignee.email,
      assignee.name,
      task.title,
      projectName,
      task.dueDate,
      task.description
    );

    if (result.success) {
      if (process.env.NODE_ENV !== 'production') console.log(`✅ Task creation email sent to ${assignee.name}`);
    } else {
      console.error(`❌ Failed to send task creation email:`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error sending task creation email:`, error);
  }
};

/**
 * Check for tasks due in 24 hours and send reminders
 */
export const checkAndSendDueDateReminders = async (
  tasks: Task[],
  users: User[],
  projectName: string,
  sentReminders: Set<string> = new Set()
): Promise<void> => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  for (const task of tasks) {
    const dueDate = new Date(task.dueDate);
    const reminderId = `${task.id}-24h-reminder`;

    // If due date is within next 24 hours and we haven't sent reminder yet
    if (
      dueDate > tomorrow &&
      dueDate < dayAfterTomorrow &&
      !sentReminders.has(reminderId)
    ) {
      const assignee = users.find(u => u.id === task.assigneeId);

      if (assignee?.email) {
        try {
          const result = await sendTaskReminder(
            assignee.email,
            assignee.name,
            task.title,
            projectName,
            task.dueDate
          );

          if (result.success) {
            if (process.env.NODE_ENV !== 'production') console.log(`✅ 24-hour reminder sent to ${assignee.name} for task "${task.title}"`);
            sentReminders.add(reminderId);
          } else {
            console.error(`❌ Failed to send 24-hour reminder:`, result.error);
          }
        } catch (error) {
          console.error(`❌ Error sending 24-hour reminder:`, error);
        }
      }
    }
  }
};

/**
 * Send email when user is added to project
 */
export const sendProjectWelcomeEmail = async (
  user: User,
  projectName: string,
  addedBy: User
): Promise<void> => {
  if (!user.email) {
    console.warn(`⚠️ No email for user ${user.name}`);
    return;
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;">👋 Welcome to Project</h2>
      </div>
      
      <p>Hi <strong>${user.name}</strong>,</p>
      
      <p><strong>${addedBy.name}</strong> has added you to the project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Project:</strong> ${projectName}</p>
        <p style="margin: 5px 0;"><strong>Added by:</strong> ${addedBy.name}</p>
        <p style="margin: 5px 0;"><strong>Added on:</strong> ${formatDateToIndian(new Date().toISOString())}</p>
      </div>
      
      <p>You can now access the project details and collaborate with the team. Login to the system to get started.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  try {
    const result = await sendEmail({
      to: user.email,
      recipientName: user.name,
      subject: `Added to Project: ${projectName}`,
      htmlContent,
    });

    if (result.success) {
      if (process.env.NODE_ENV !== 'production') console.log(`✅ Welcome email sent to ${user.name}`);
    } else {
      console.error(`❌ Failed to send welcome email:`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error sending welcome email:`, error);
  }
};

/**
 * Send email when document is approved and shared
 */
export const sendDocumentApprovalEmail = async (
  document: ProjectDocument,
  recipient: User,
  projectName: string,
  approverName: string
): Promise<void> => {
  if (!recipient.email) {
    console.warn(`⚠️ No email for recipient ${recipient.name}`);
    return;
  }

  try {
    const result = await sendDocumentSharedEmail(
      recipient.email,
      recipient.name,
      document.name,
      projectName,
      approverName
    );

    if (result.success) {
      if (process.env.NODE_ENV !== 'production') console.log(`✅ Document approval email sent to ${recipient.name}`);
    } else {
      console.error(`❌ Failed to send document approval email:`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error sending document approval email:`, error);
  }
};

/**
 * Send email when task is approved
 */
export const sendTaskApprovalEmail = async (
  taskTitle: string,
  recipient: User,
  projectName: string,
  approverName: string,
  approvalStage: string
): Promise<void> => {
  if (!recipient.email) {
    console.warn(`⚠️ No email for recipient ${recipient.name}`);
    return;
  }

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: #dcfce7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #16a34a; margin: 0;">✅ Task Approved</h2>
      </div>
      
      <p>Hi <strong>${recipient.name}</strong>,</p>
      
      <p>The task <strong>"${taskTitle}"</strong> in project <strong>${projectName}</strong> has been approved.</p>
      
      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Task:</strong> ${taskTitle}</p>
        <p style="margin: 5px 0;"><strong>Project:</strong> ${projectName}</p>
        <p style="margin: 5px 0;"><strong>Approval Stage:</strong> ${approvalStage}</p>
        <p style="margin: 5px 0;"><strong>Approved by:</strong> ${approverName}</p>
      </div>
      
      <p>Great work! The task has been successfully approved and is moving forward.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  try {
    const result = await sendEmail({
      to: recipient.email,
      recipientName: recipient.name,
      subject: `Task Approved: ${taskTitle}`,
      htmlContent,
    });

    if (result.success) {
      if (process.env.NODE_ENV !== 'production') console.log(`✅ Task approval email sent to ${recipient.name}`);
    } else {
      console.error(`❌ Failed to send task approval email:`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error sending task approval email:`, error);
  }
};
