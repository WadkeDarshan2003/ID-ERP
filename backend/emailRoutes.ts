/**
 * Email Routes for Nodemailer
 */

import { Router, Request, Response } from 'express';
import { transporter, SENDER_EMAIL, SENDER_NAME } from '../emailConfig';

const router = Router();

interface EmailPayload {
  to: string;
  recipientName?: string;
  subject: string;
  htmlContent: string;
}

/**
 * POST /api/email/send
 * Send email via Nodemailer
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, recipientName, subject, htmlContent }: EmailPayload = req.body;

    // Validate required fields
    if (!to || !subject || !htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, subject, htmlContent',
      });
    }

    // Send email
    const mailOptions = {
      from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
      to: to,
      subject: subject,
      html: htmlContent,
      text: htmlContent.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('✅ Email sent successfully:', info.messageId);

    res.status(200).json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error('❌ Error sending email:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email',
    });
  }
});

export default router;
