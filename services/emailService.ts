
import { formatDateToIndian } from '../utils/taskUtils';

// Get Cloud Function URL from environment or use deployed URL
const getCloudFunctionUrl = () => {
  const customUrl = import.meta.env.VITE_CLOUD_FUNCTION_URL;
  
  if (customUrl) {
    return customUrl;
  }
  
  // Use the deployed Cloud Function URL
  return 'https://sendemail-jl3d2uhdra-uc.a.run.app';
};

const EMAIL_FUNCTION_URL = getCloudFunctionUrl();

export interface EmailOptions {
  to: string;
  recipientName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

/**
 * Send email via Firebase Cloud Function
 * @param options Email options
 * @returns Promise with email send status
 */

export const sendEmail = async (options: EmailOptions): Promise<{ success: boolean; error?: string; messageId?: string }> => {
  if (!options.to || !options.subject || !options.htmlContent) {
    return { success: false, error: 'Missing required email fields' };
  }

  try {
    const payload = {
      to: options.to,
      recipientName: options.recipientName || options.to.split('@')[0],
      subject: options.subject,
      htmlContent: options.htmlContent,
    };

    const response = await fetch(EMAIL_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Cloud Function error:', error);
      return { success: false, error: error.error || 'Failed to send email' };
    }

    const result = await response.json();
    if (process.env.NODE_ENV !== 'production') console.log('✅ Email sent successfully via Cloud Function:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

/**
 * Send task reminder email
 */
export const sendTaskReminder = async (
  recipientEmail: string,
  recipientName: string,
  taskTitle: string,
  projectName: string,
  dueDate: string
): Promise<{ success: boolean; error?: string }> => {
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="color: #fff; margin: 0; font-size: 24px;">📋 Task Reminder</h2>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 16px;">Hi <strong>${recipientName}</strong>,</p>
        
        <p style="color: #555; font-size: 14px;">This is a friendly reminder about the following task:</p>
        
        <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 8px 0; color: #333;"><strong>Task:</strong> ${taskTitle}</p>
          <p style="margin: 8px 0; color: #333;"><strong>Project:</strong> ${projectName}</p>
          <p style="margin: 8px 0; color: #d97706;"><strong>Due Date:</strong> ${formatDateToIndian(dueDate)}</p>
        </div>
        
        <p style="color: #555; font-size: 14px;">Please update the task status at your earliest convenience.</p>
        
        <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Regards,<br>
          <strong>ID ERP System</strong>
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: recipientEmail,
    recipientName,
    subject: `Reminder: ${taskTitle}`,
    htmlContent,
  });
};

/**
 * Send payment reminder email
 */
export const sendPaymentReminder = async (
  recipientEmail: string,
  recipientName: string,
  projectName: string,
  amount?: string
): Promise<{ success: boolean; error?: string }> => {
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px;">
      <div style="background: linear-gradient(135deg, #ca8a04 0%, #b45309 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="color: #fff; margin: 0; font-size: 24px;"> Payment Reminder</h2>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 16px;">Hi <strong>${recipientName}</strong>,</p>
        
        <p style="color: #555; font-size: 14px;">This is a gentle reminder regarding pending payments for the following project:</p>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #ca8a04; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 8px 0; color: #333;"><strong>Project:</strong> ${projectName}</p>
          ${amount ? `<p style="margin: 8px 0; color: #d97706;"><strong>Outstanding Amount:</strong> ₹${amount}</p>` : ''}
        </div>
        
        <p style="color: #555; font-size: 14px;">Please clear the dues at your earliest convenience to avoid any service delays.</p>
        
        <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Regards,<br>
          <strong>ID ERP System</strong>
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: recipientEmail,
    recipientName,
    subject: `Payment Reminder: ${projectName}`,
    htmlContent,
  });
};

/**
 * Send task assignment notification
 */
export const sendTaskAssignmentEmail = async (
  recipientEmail: string,
  recipientName: string,
  taskTitle: string,
  projectName: string,
  dueDate: string,
  description?: string,
  deepLink?: string
): Promise<{ success: boolean; error?: string }> => {
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px;">
      <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="color: #fff; margin: 0; font-size: 24px;">✅ New Task Assigned</h2>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 16px;">Hi <strong>${recipientName}</strong>,</p>
        
        <p style="color: #555; font-size: 14px;">You have been assigned a new task in <strong>${projectName}</strong>.</p>
        
        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 8px 0; color: #333;"><strong>Task:</strong> ${taskTitle}</p>
          <p style="margin: 8px 0; color: #333;"><strong>Due Date:</strong> ${formatDateToIndian(dueDate)}</p>
          ${description ? `<p style="margin: 8px 0; color: #555;"><strong>Description:</strong> ${description}</p>` : ''}
        </div>
        
        <p style="color: #555; font-size: 14px;">Please review the task details and start working on it as soon as possible.</p>
        
        <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Regards,<br>
          <strong>ID ERP System</strong>
        </p>
      </div>
    </div>
  `;

  // If a deep link is provided, append an action button
  const finalHtml = deepLink ? htmlContent.replace('</div>\n  `;', `</div>\n  <div style="margin:20px 0; text-align:center;"><a href="${deepLink}" style="display:inline-block;background-color:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Open Task</a></div>\n  </div>\n  `) : htmlContent;

  return sendEmail({
    to: recipientEmail,
    recipientName,
    subject: `Task Assigned: ${taskTitle}`,
    htmlContent: finalHtml,
  });
};

/**
 * Send document shared notification
 */
export const sendDocumentSharedEmail = async (
  recipientEmail: string,
  recipientName: string,
  documentName: string,
  projectName: string,
  senderName: string,
  deepLink?: string
): Promise<{ success: boolean; error?: string }> => {
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h2 style="color: #fff; margin: 0; font-size: 24px;">📄 Document Shared</h2>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
        <p style="color: #333; font-size: 16px;">Hi <strong>${recipientName}</strong>,</p>
        
        <p style="color: #555; font-size: 14px;"><strong>${senderName}</strong> has shared a document with you.</p>
        
        <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 8px 0; color: #333;"><strong>Document:</strong> ${documentName}</p>
          <p style="margin: 8px 0; color: #333;"><strong>Project:</strong> ${projectName}</p>
        </div>
        
        <p style="color: #555; font-size: 14px;">Please review the document in the system.</p>
        
        <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Regards,<br>
          <strong>ID ERP System</strong>
        </p>
      </div>
    </div>
  `;

  const finalHtml = deepLink ? htmlContent.replace('</div>\n  </div>\n  `;', `</div>\n  <div style="margin:20px 0; text-align:center;"><a href="${deepLink}" style="display:inline-block;background-color:#0284c7;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Open Document</a></div>\n  </div>\n  `) : htmlContent;

  return sendEmail({
    to: recipientEmail,
    recipientName,
    subject: `Document Shared: ${documentName}`,
    htmlContent: finalHtml,
  });
};
