/**
 * Email Trigger Service
 * Handles automated email sending for various events
 */

import { Task, User, Project, ProjectDocument, Meeting, Comment, FinancialRecord } from '../types';
import { formatDateToIndian } from '../utils/taskUtils';
import {
  sendTaskAssignmentEmail,
  sendTaskReminder,
  sendDocumentSharedEmail,
  sendEmail,
} from './emailService';
import { sendPushNotification } from './pushNotificationService';

/**
 * Send email when task is assigned/created
 */
export const sendTaskCreationEmail = async (
  task: Task,
  assignee: User,
  projectName: string,
  projectId?: string
): Promise<void> => {
  if (!assignee.email) {
    console.warn(`⚠️ No email for assignee ${assignee.name}`);
    return;
  }

  // Generate task link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const taskLink = projectId ? `${appBaseUrl}?projectId=${projectId}&taskId=${task.id}&tab=plan` : undefined;

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
      
      // Send push notification
      await sendPushNotification(
        assignee.id,
        'New Task Assigned',
        `You have been assigned a new task: ${task.title} in project ${projectName}`,
        taskLink
      );
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
  projectId?: string,
  sentReminders: Set<string> = new Set()
): Promise<void> => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Generate app base URL
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';

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
          // Generate task link
          const taskLink = projectId ? `${appBaseUrl}?projectId=${projectId}&taskId=${task.id}&tab=plan` : undefined;

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
            
            // Send push notification
            await sendPushNotification(
              assignee.id,
              'Task Due Reminder',
              `Task "${task.title}" is due tomorrow in project ${projectName}`,
              taskLink
            );
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
  addedBy: User,
  projectId?: string
): Promise<void> => {
  if (!user.email) {
    console.warn(`⚠️ No email for user ${user.name}`);
    return;
  }

  // Generate project link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const projectLink = projectId ? `${appBaseUrl}?projectId=${projectId}` : undefined;

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
      
      ${projectLink ? `
      <div style="margin: 20px 0;">
        <a href="${projectLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          Access Project
        </a>
      </div>
      ` : ''}

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
      
      // Send push notification
      await sendPushNotification(
        user.id,
        'Added to Project',
        `You have been added to project: ${projectName} by ${addedBy.name}`,
        projectLink
      );
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
  approverName: string,
  projectId?: string
): Promise<void> => {
  if (!recipient.email) {
    console.warn(`⚠️ No email for recipient ${recipient.name}`);
    return;
  }

  try {
    const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
    const deepLink = projectId ? `${appBaseUrl}?projectId=${projectId}&tab=documents` : undefined;

    const result = await sendDocumentSharedEmail(
      recipient.email,
      recipient.name,
      document.name,
      projectName,
      approverName,
      deepLink
    );

    if (result.success) {
      if (process.env.NODE_ENV !== 'production') console.log(`✅ Document approval email sent to ${recipient.name}`);
      
      // Send push notification
      await sendPushNotification(
        recipient.id,
        'Document Approved',
        `Document "${document.name}" in project ${projectName} has been approved by ${approverName}`,
        deepLink
      );
    } else {
      console.error(`❌ Failed to send document approval email:`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error sending document approval email:`, error);
  }
};

/**
 * Send email and push notification when a new document is uploaded
 */
export const sendDocumentUploadNotificationEmail = async (
  document: ProjectDocument,
  uploaderName: string,
  projectName: string,
  recipients: User[],
  projectId?: string
): Promise<void> => {
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const docLink = projectId ? `${appBaseUrl}?projectId=${projectId}&tab=documents` : undefined;
  
  for (const recipient of recipients) {
    if (!recipient.email) {
      console.warn(`⚠️ No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1f2937;">New Document Uploaded</h2>
          <p>Hi ${recipient.name},</p>
          <p><strong>${uploaderName}</strong> uploaded a new document in project <strong>${projectName}</strong>:</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #4b5563;"><strong>Document:</strong> ${document.name}</p>
            <p style="margin: 10px 0 0 0; color: #6b7280;"><strong>Type:</strong> ${document.type}</p>
          </div>
          
          <p style="margin-top: 20px;">
            <a href="${docLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Document</a>
          </p>
        </div>
      `;

      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `New Document Uploaded: ${document.name} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Document upload notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          `New Document - ${projectName}`,
          `${uploaderName} uploaded "${document.name}" (${document.type})`,
          docLink
        );
      } else {
        console.error(`❌ Failed to send document upload notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error sending document upload notification to ${recipient.name}:`, error);
    }
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
  approvalStage: string,
  projectId?: string,
  taskId?: string
): Promise<void> => {
  if (!recipient.email) {
    console.warn(`⚠️ No email for recipient ${recipient.name}`);
    return;
  }

  // Generate task link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const taskLink = projectId && taskId ? `${appBaseUrl}?projectId=${projectId}&taskId=${taskId}&tab=plan` : (projectId ? `${appBaseUrl}?projectId=${projectId}&tab=plan` : undefined);

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
      
      ${taskLink ? `
      <div style="margin: 20px 0;">
        <a href="${taskLink}" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View Task Details
        </a>
      </div>
      ` : ''}

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

      // Send push notification
      await sendPushNotification(
        recipient.id,
        'Task Approved',
        `Task "${taskTitle}" in project ${projectName} has been approved by ${approverName}`,
        taskLink
      );
    } else {
      console.error(`❌ Failed to send task approval email:`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error sending task approval email:`, error);
  }
};
    
/**
 * Send email when meeting is created or updated
 */
export const sendMeetingNotificationEmail = async (
  meeting: Meeting,
  attendees: User[],
  projectName: string,
  projectId: string,
  meetingAction: 'created' | 'updated' = 'created'
): Promise<void> => {
  if (!attendees || attendees.length === 0) {
    console.warn(` No attendees for meeting ${meeting.title}`);
    return;
  }

  // Generate meeting link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const meetingLink = `${appBaseUrl}?projectId=${projectId}&meetingId=${meeting.id}&tab=meetings`;

  const actionText = meetingAction === 'created' ? 'New Meeting Scheduled' : 'Meeting Updated';
  const actionColor = meetingAction === 'created' ? '#0284c7' : '#f59e0b';
  const bgColor = meetingAction === 'created' ? '#dbeafe' : '#fef3c7';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: ${actionColor}; margin: 0;"> ${actionText}</h2>
      </div>
      
      <p>Hi <strong>Team</strong>,</p>
      
      <p>${meetingAction === 'created' ? 'A new meeting has been scheduled' : 'A meeting has been updated'} for project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid ${actionColor}; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Meeting Title:</strong> ${meeting.title}</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${meeting.type}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${formatDateToIndian(meeting.date)}</p>
        <p style="margin: 5px 0;"><strong>Project:</strong> ${projectName}</p>
        ${meeting.notes ? `<p style="margin: 5px 0;"><strong>Notes:</strong> ${meeting.notes}</p>` : ''}
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 5px 0; font-weight: bold;">Attendees:</p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          ${attendees.map(attendee => `<li>${attendee.name}${attendee.email ? ` (${attendee.email})` : ''}</li>`).join('')}
        </ul>
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${meetingLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View Meeting Details
        </a>
      </div>
      
      <p>Click the button above to view the full meeting details and any additional information in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const attendee of attendees) {
    if (!attendee.email) {
      console.warn(` No email for attendee ${attendee.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: attendee.email,
        recipientName: attendee.name,
        subject: `${actionText}: ${meeting.title} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Meeting notification email sent to ${attendee.name}`);
        
        // Send push notification
        await sendPushNotification(
          attendee.id,
          actionText,
          `${meetingAction === 'created' ? 'New meeting scheduled' : 'Meeting updated'}: ${meeting.title} in project ${projectName}`,
          meetingLink
        );
      } else {
        console.error(` Failed to send meeting notification email to ${attendee.name}:`, result.error);
      }
    } catch (error) {
      console.error(` Error sending meeting notification email to ${attendee.name}:`, error);
    }
  }
};

/**
 * Send email when task is assigned/created/updated
 */
export const sendTaskAssignmentNotificationEmail = async (
  task: Task,
  assignee: User,
  projectName: string,
  projectId: string,
  taskAction: 'created' | 'updated' = 'created'
): Promise<void> => {
  if (!assignee.email) {
    console.warn(` No email for assignee ${assignee.name}`);
    return;
  }

  // Generate task link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const taskLink = `${appBaseUrl}?projectId=${projectId}&taskId=${task.id}&tab=plan`;

  const actionText = taskAction === 'created' ? 'New Task Assigned' : 'Task Updated';
  const actionColor = taskAction === 'created' ? '#0284c7' : '#f59e0b';
  const bgColor = taskAction === 'created' ? '#dbeafe' : '#fef3c7';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: ${actionColor}; margin: 0;"> ${actionText}</h2>
      </div>
      
      <p>Hi <strong>${assignee.name}</strong>,</p>
      
      <p>${taskAction === 'created' ? 'You have been assigned a new task' : 'A task you are assigned to has been updated'} in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid ${actionColor}; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Task:</strong> ${task.title}</p>
        <p style="margin: 5px 0;"><strong>Category:</strong> ${task.category}</p>
        <p style="margin: 5px 0;"><strong>Priority:</strong> <span style="color: ${task.priority === 'high' ? '#dc2626' : task.priority === 'medium' ? '#f59e0b' : '#059669'}; font-weight: bold;">${task.priority.toUpperCase()}</span></p>
        <p style="margin: 5px 0;"><strong>Start Date:</strong> ${formatDateToIndian(task.startDate)}</p>
        <p style="margin: 5px 0;"><strong>Due Date:</strong> ${formatDateToIndian(task.dueDate)}</p>
        ${task.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${task.description}</p>` : ''}
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${taskLink}" style="display: inline-block; background-color: ${actionColor}; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View Task Details
        </a>
      </div>
      
      <p>Click the button above to view the full task details and start working on it in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  try {
    const result = await sendEmail({
      to: assignee.email,
      recipientName: assignee.name,
      subject: `${actionText}: ${task.title} - ${projectName}`,
      htmlContent,
    });

    if (result.success) {
      if (process.env.NODE_ENV !== 'production') console.log(`✅ Task assignment notification email sent to ${assignee.name}`);
      
      // Send push notification
      await sendPushNotification(
        assignee.id,
        actionText,
        `${taskAction === 'created' ? 'New task assigned' : 'Task updated'}: ${task.title} in project ${projectName}`,
        taskLink
      );
    } else {
      console.error(` Failed to send task assignment notification email:`, result.error);
    }
  } catch (error) {
    console.error(` Error sending task assignment notification email:`, error);
  }
};

/**
 * Send approval notification when task requires start approval
 */
export const sendTaskStartApprovalNotificationEmail = async (
  task: Task,
  recipients: User[],
  projectName: string,
  projectId: string
): Promise<void> => {
  if (!recipients || recipients.length === 0) {
    console.warn(` No recipients for task start approval notification`);
    return;
  }

  // Generate task link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const taskLink = `${appBaseUrl}?projectId=${projectId}&taskId=${task.id}&tab=plan`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #f59e0b; margin: 0;">⏳ Task Start Approval Pending</h2>
      </div>
      
      <p>Hi Team,</p>
      
      <p>A new task requires start approval in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Task:</strong> ${task.title}</p>
        <p style="margin: 5px 0;"><strong>Category:</strong> ${task.category}</p>
        <p style="margin: 5px 0;"><strong>Priority:</strong> <span style="color: ${task.priority === 'high' ? '#dc2626' : task.priority === 'medium' ? '#f59e0b' : '#059669'}; font-weight: bold;">${task.priority.toUpperCase()}</span></p>
        <p style="margin: 5px 0;"><strong>Start Date:</strong> ${formatDateToIndian(task.startDate)}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> Awaiting approval to begin</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 5px 0; font-weight: bold;">Approval Required From:</p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Admin</li>
          ${task.assigneeId ? '<li>Designer/Vendor</li>' : ''}
          <li>Client</li>
        </ul>
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${taskLink}" style="display: inline-block; background-color: #f59e0b; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          Review & Approve Task
        </a>
      </div>
      
      <p>Click the button above to review the task details and provide your approval in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    if (!recipient.email) {
      console.warn(`No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `Task Start Approval Pending: ${task.title} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Task start approval notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          'Task Start Approval Pending',
          `Task "${task.title}" in project ${projectName} requires start approval`,
          taskLink
        );
      } else {
        console.error(` Failed to send task start approval notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(` Error sending task start approval notification to ${recipient.name}:`, error);
    }
  }
};

/**
 * Send approval notification when task completion requires approval
 */
export const sendTaskCompletionApprovalNotificationEmail = async (
  task: Task,
  recipients: User[],
  projectName: string,
  projectId: string
): Promise<void> => {
  if (!recipients || recipients.length === 0) {
    console.warn(` No recipients for task completion approval notification`);
    return;
  }

  // Generate task link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const taskLink = `${appBaseUrl}?projectId=${projectId}&taskId=${task.id}&tab=plan`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;"> Task Completion Approval Pending</h2>
      </div>
      
      <p>Hi Team,</p>
      
      <p>A task has been completed and requires final approval in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Task:</strong> ${task.title}</p>
        <p style="margin: 5px 0;"><strong>Category:</strong> ${task.category}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> 100% Complete - Awaiting Final Approval</p>
        <p style="margin: 5px 0;"><strong>Due Date:</strong> ${formatDateToIndian(task.dueDate)}</p>
      </div>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 5px 0; font-weight: bold;">Approval Required From:</p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Client</li>
          <li>Admin</li>
        </ul>
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${taskLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          Review & Approve Completion
        </a>
      </div>
      
      <p>Click the button above to review the completed task and provide your final approval in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    if (!recipient.email) {
      console.warn(` No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `Task Completion Approval: ${task.title} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(` Task completion approval notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          'Task Completion Approval Pending',
          `Task "${task.title}" in project ${projectName} requires completion approval`,
          taskLink
        );
      } else {
        console.error(` Failed to send task completion approval notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(` Error sending task completion approval notification to ${recipient.name}:`, error);
    }
  }
};

/**
 * Send email notification when a comment is added to a task
 */
export const sendTaskCommentNotificationEmail = async (
  task: Task,
  comment: Comment,
  commenterName: string,
  recipients: User[],
  projectName: string,
  projectId: string
): Promise<void> => {
  if (!recipients || recipients.length === 0) {
    console.warn(` No recipients for task comment notification`);
    return;
  }

  // Generate task link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const taskLink = `${appBaseUrl}?projectId=${projectId}&taskId=${task.id}&tab=plan`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;">💬 New Comment on Task</h2>
      </div>
      
      <p>Hi Team,</p>
      
      <p><strong>${commenterName}</strong> added a comment to task <strong>"${task.title}"</strong> in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Task:</strong> ${task.title}</p>
        <p style="margin: 5px 0;"><strong>Category:</strong> ${task.category}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${task.status}</p>
        <p style="margin: 5px 0;"><strong>Commenter:</strong> ${commenterName}</p>
      </div>
      
      <div style="background-color: #fff8f0; border-left: 4px solid #ea580c; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0 10px 0; font-weight: bold;">Comment:</p>
        <p style="margin: 0; white-space: pre-wrap; color: #333;">${comment.text}</p>
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${taskLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View Task & Comments
        </a>
      </div>
      
      <p>Click the button above to view the full task and all comments in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    // Don't send email to the person who just commented
    if (recipient.id === comment.userId) continue;

    if (!recipient.email) {
      console.warn(` No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `New Comment on Task: ${task.title} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(` Task comment notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          `New Comment on Task - ${projectName}`,
          `${commenterName} commented on "${task.title}": ${comment.text.substring(0, 80)}${comment.text.length > 80 ? '...' : ''}`,
          taskLink
        );
      } else {
        console.error(` Failed to send task comment notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(` Error sending task comment notification to ${recipient.name}:`, error);
    }
  }
};

/**
 * Send email notification when a comment is added to a document
 */
export const sendDocumentCommentNotificationEmail = async (
  document: ProjectDocument,
  comment: Comment,
  commenterName: string,
  recipients: User[],
  projectName: string,
  projectId: string
): Promise<void> => {
  if (!recipients || recipients.length === 0) {
    console.warn(` No recipients for document comment notification`);
    return;
  }

  // Generate document link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const documentLink = `${appBaseUrl}?projectId=${projectId}&tab=documents&docId=${document.id}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;"> New Comment on Document</h2>
      </div>
      
      <p>Hi Team,</p>
      
      <p><strong>${commenterName}</strong> added a comment to document <strong>"${document.name}"</strong> in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Document:</strong> ${document.name}</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${document.type || 'Not specified'}</p>
        <p style="margin: 5px 0;"><strong>Commenter:</strong> ${commenterName}</p>
        <p style="margin: 5px 0;"><strong>Admin Approval:</strong> ${document.approvalStatus || 'Pending'}</p>
      </div>
      
      <div style="background-color: #fff8f0; border-left: 4px solid #ea580c; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0 10px 0; font-weight: bold;">Comment:</p>
        <p style="margin: 0; white-space: pre-wrap; color: #333;">${comment.text}</p>
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${documentLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View Document & Comments
        </a>
      </div>
      
      <p>Click the button above to view the full document and all comments in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    // Don't send email to the person who just commented
    if (recipient.id === comment.userId) continue;

    if (!recipient.email) {
      console.warn(` No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `New Comment on Document: ${document.name} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(` Document comment notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          'New Comment on Document',
          `${commenterName} commented on document "${document.name}" in project ${projectName}: ${comment.text.substring(0, 50)}${comment.text.length > 50 ? '...' : ''}`,
          documentLink
        );
      } else {
        console.error(` Failed to send document comment notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(` Error sending document comment notification to ${recipient.name}:`, error);
    }
  }
};

/**
 * Send email notification when document is approved by admin
 */
export const sendDocumentAdminApprovalNotificationEmail = async (
  document: ProjectDocument,
  approverName: string,
  recipients: User[],
  projectName: string,
  projectId: string,
  action: 'approved' | 'rejected' = 'approved'
): Promise<void> => {
  if (!recipients || recipients.length === 0) {
    console.warn(` No recipients for document admin approval notification`);
    return;
  }

  // Generate documents link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const documentLink = `${appBaseUrl}?projectId=${projectId}&tab=documents&docId=${document.id}`;

  const isApproved = action === 'approved';
  const bgColor = isApproved ? '#dcfce7' : '#fee2e2';
  const headerColor = isApproved ? '#16a34a' : '#dc2626';
  const statusText = isApproved ? 'Approved' : 'Rejected';
  const statusEmoji = isApproved ? '✅' : '❌';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: ${headerColor}; margin: 0;">${statusEmoji} Document ${statusText} by Admin</h2>
      </div>
      
      <p>Hi Team,</p>
      
      <p>Document <strong>"${document.name}"</strong> has been <strong>${action}</strong> by admin <strong>${approverName}</strong> in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Document:</strong> ${document.name}</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${document.type || 'Not specified'}</p>
        <p style="margin: 5px 0;"><strong>Admin:</strong> ${approverName}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${statusText}</p>
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${documentLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View All Documents
        </a>
      </div>
      
      <p>Click the button above to view all documents and their approval status in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    if (!recipient.email) {
      console.warn(` No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `Document ${statusText} by Admin: ${document.name} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(` Document admin approval notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          `Document ${statusText} by Admin`,
          `Document "${document.name}" in project ${projectName} has been ${action} by ${approverName}`,
          documentLink
        );
      } else {
        console.error(`❌ Failed to send document admin approval notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error sending document admin approval notification to ${recipient.name}:`, error);
    }
  }
};

/**
 * Send email notification when document is approved by client
 */
export const sendDocumentClientApprovalNotificationEmail = async (
  document: ProjectDocument,
  clientName: string,
  recipients: User[],
  projectName: string,
  projectId: string,
  action: 'approved' | 'rejected' = 'approved'
): Promise<void> => {
  if (!recipients || recipients.length === 0) {
    console.warn(` No recipients for document client approval notification`);
    return;
  }

  // Generate documents link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const documentLink = `${appBaseUrl}?projectId=${projectId}&tab=documents`;

  const isApproved = action === 'approved';
  const bgColor = isApproved ? '#dcfce7' : '#fee2e2';
  const headerColor = isApproved ? '#16a34a' : '#dc2626';
  const statusText = isApproved ? 'Approved' : 'Rejected';
  const statusEmoji = isApproved ? '✅' : '❌';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: ${headerColor}; margin: 0;">${statusEmoji} Document ${statusText} by Client</h2>
      </div>
      
      <p>Hi Team,</p>
      
      <p>Document <strong>"${document.name}"</strong> has been <strong>${action}</strong> by client <strong>${clientName}</strong> in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Document:</strong> ${document.name}</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${document.type || 'Not specified'}</p>
        <p style="margin: 5px 0;"><strong>Client:</strong> ${clientName}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${statusText}</p>
      </div>
      
      <div style="margin: 20px 0;">
        <a href="${documentLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View All Documents
        </a>
      </div>
      
      <p>Click the button above to view all documents and their approval status in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    if (!recipient.email) {
      console.warn(`⚠️ No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `Document ${statusText} by Client: ${document.name} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Document client approval notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          `Document ${statusText} by Client`,
          `Document "${document.name}" in project ${projectName} has been ${action} by ${clientName}`,
          documentLink
        );
      } else {
        console.error(`❌ Failed to send document client approval notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error sending document client approval notification to ${recipient.name}:`, error);
    }
  }
};

/**
 * Send email notification for financial record approval (Additional Budget, Expense, Payment)
 */
export const sendFinancialApprovalNotificationEmail = async (
  record: FinancialRecord,
  approverName: string,
  recipients: User[],
  projectName: string,
  projectId: string,
  action: 'approved' | 'rejected' = 'approved',
  approverRole: 'admin' | 'client' = 'admin',
  recordType: 'additional-budget' | 'expense' | 'payment' = 'expense'
): Promise<void> => {
  if (!recipients || recipients.length === 0) {
    console.warn(`⚠️ No recipients for financial approval notification`);
    return;
  }

  // Generate financials link
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const financialLink = `${appBaseUrl}?projectId=${projectId}&tab=financials`;

  const isApproved = action === 'approved';
  const bgColor = isApproved ? '#dcfce7' : '#fee2e2';
  const headerColor = isApproved ? '#16a34a' : '#dc2626';
  const statusEmoji = isApproved ? '✅' : '❌';

  // Get record type display name
  let recordTypeDisplay = 'Financial Record';
  if (recordType === 'additional-budget') recordTypeDisplay = 'Additional Budget';
  else if (recordType === 'expense') recordTypeDisplay = 'Expense';
  else if (recordType === 'payment') recordTypeDisplay = 'Payment';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: ${bgColor}; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: ${headerColor}; margin: 0;">${statusEmoji} ${recordTypeDisplay} ${action === 'approved' ? 'Approved' : 'Rejected'}</h2>
      </div>
      
      <p>Hi Team,</p>
      
      <p>A ${recordTypeDisplay.toLowerCase()} has been <strong>${action}</strong> by <strong>${approverName}</strong> (${approverRole}) in project <strong>${projectName}</strong>.</p>
      
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>Type:</strong> ${recordTypeDisplay}</p>
        <p style="margin: 5px 0;"><strong>Description:</strong> ${record.description}</p>
        <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${record.amount.toLocaleString()}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${record.status}</p>
        <p style="margin: 5px 0;"><strong>Approved By:</strong> ${approverName}</p>
        <p style="margin: 5px 0;"><strong>Approval Status:</strong> ${action === 'approved' ? 'Approved ✅' : 'Rejected ❌'}</p>
      </div>

      ${recordType === 'additional-budget' ? `
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 5px 0; font-weight: bold;">⚠️ Additional Budget</p>
          <p style="margin: 5px 0;">This is a request to increase the project budget by ₹${record.amount.toLocaleString()}. Approval from both Client and Admin is required.</p>
        </div>
      ` : ''}
      
      <div style="margin: 20px 0;">
        <a href="${financialLink}" style="display: inline-block; background-color: #0284c7; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-weight: bold;">
          View Financial Records
        </a>
      </div>
      
      <p>Click the button above to view all financial records and their approval status in the system.</p>
      
      <p style="margin-top: 30px; color: #666; font-size: 14px;">
        Regards,<br>
        <strong>ID ERP System</strong>
      </p>
    </div>
  `;

  for (const recipient of recipients) {
    if (!recipient.email) {
      console.warn(`⚠️ No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `${recordTypeDisplay} ${action === 'approved' ? 'Approved' : 'Rejected'}: ${record.description} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Financial approval notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          `${recordTypeDisplay} ${action === 'approved' ? 'Approved' : 'Rejected'}`,
          `${recordTypeDisplay} "${record.description}" in project ${projectName} has been ${action} by ${approverName}`,
          financialLink
        );
      } else {
        console.error(`❌ Failed to send financial approval notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error sending financial approval notification to ${recipient.name}:`, error);
    }
  }
};

/**
 * Send email and push notification when someone comments on a meeting
 */
export const sendMeetingCommentNotificationEmail = async (
  meeting: Meeting,
  comment: Comment,
  commenterName: string,
  projectName: string,
  recipients: User[],
  projectId?: string
): Promise<void> => {
  // Generate app base URL
  const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.REACT_APP_BASE_URL || 'http://localhost:5173';
  const meetingLink = projectId ? `${appBaseUrl}?projectId=${projectId}&meetingId=${meeting.id}&tab=meetings` : undefined;
  
  for (const recipient of recipients) {
    if (!recipient.email) {
      console.warn(`⚠️ No email for recipient ${recipient.name}`);
      continue;
    }

    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1f2937;">New Comment on Meeting</h2>
          <p>Hi ${recipient.name},</p>
          <p><strong>${commenterName}</strong> commented on a meeting in project <strong>${projectName}</strong>:</p>
          
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #4b5563;"><strong>Meeting:</strong> ${meeting.title}</p>
            <p style="margin: 10px 0 0 0; color: #6b7280;">"${comment.text}"</p>
          </div>
          
          ${meetingLink ? `
          <p style="margin-top: 20px;">
            <a href="${meetingLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Meeting</a>
          </p>
          ` : ''}
        </div>
      `;

      const result = await sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `New Comment on Meeting: ${meeting.title} - ${projectName}`,
        htmlContent,
      });

      if (result.success) {
        if (process.env.NODE_ENV !== 'production') console.log(`✅ Meeting comment notification sent to ${recipient.name}`);
        
        // Send push notification
        await sendPushNotification(
          recipient.id,
          `New Comment on Meeting - ${projectName}`,
          `${commenterName} commented on "${meeting.title}": ${comment.text.substring(0, 100)}${comment.text.length > 100 ? '...' : ''}`,
          meetingLink
        );
      } else {
        console.error(`❌ Failed to send meeting comment notification to ${recipient.name}:`, result.error);
      }
    } catch (error) {
      console.error(`❌ Error sending meeting comment notification to ${recipient.name}:`, error);
    }
  }
};
