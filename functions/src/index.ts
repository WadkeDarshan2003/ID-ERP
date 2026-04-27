/**
 * Firebase Cloud Function for sending emails via Nodemailer
 */

import * as functions from "firebase-functions";
import admin from "firebase-admin";
import nodemailer from "nodemailer";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// Create Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Verify transporter (non-blocking, will log when function runs)
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transporter.verify((error, success) => {
    if (error) {
      console.error("❌ Nodemailer setup failed:", error);
    } else {
      if (process.env.NODE_ENV !== 'production') console.log("✅ Nodemailer ready from:", process.env.EMAIL_USER);
    }
  });
}

interface EmailPayload {
  to: string;
  recipientName?: string;
  subject: string;
  htmlContent: string;
}

// Enable CORS headers for all requests
const enableCORS = (req: any, res: any) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
};

/**
 * Cloud Function to send emails
 * Endpoint: https://sendemail-jl3d2uhdra-uc.a.run.app/
 */
export const sendEmail = functions.https.onRequest(async (req, res) => {
  // Apply CORS first
  enableCORS(req, res);

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { to, recipientName, subject, htmlContent }: EmailPayload = req.body;

    // Validate required fields
    if (!to || !subject || !htmlContent) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: to, subject, htmlContent",
      });
      return;
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("❌ Email credentials not configured in Cloud Function");
      res.status(500).json({
        success: false,
        error: "Email service not configured. Please set environment variables in Firebase Console.",
      });
      return;
    }

    // Send email
    const mailOptions = {
      from: `Kydo Solutions <${process.env.EMAIL_USER}>`,
      replyTo: `Kydo Solutions <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
      text: htmlContent.replace(/<[^>]*>/g, ""), // Strip HTML tags
    };

    const info = await transporter.sendMail(mailOptions);

    if (process.env.NODE_ENV !== 'production') console.log("✅ Email sent successfully:", info.messageId);

    res.status(200).json({
      success: true,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error("❌ Error sending email:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to send email",
    });
  }
});

/**
 * Cloud Function to send push notifications
 * Endpoint: https://sendpushnotification-jl3d2uhdra-uc.a.run.app/
 */
export const sendPushNotification = functions.https.onRequest(async (req, res) => {
  // Apply CORS first
  enableCORS(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const { recipientId, title, body, url, icon } = req.body;

  if (!recipientId || !title || !body) {
    res.status(400).json({ error: "Missing required fields: recipientId, title, body" });
    return;
  }

  try {
    // Get user's FCM tokens from Firestore
    const userDoc = await db.collection("users").doc(recipientId).get();
    
    if (!userDoc.exists) {
      console.log(`User ${recipientId} not found`);
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userData = userDoc.data();
    const tokens = userData?.fcmTokens || [];

    if (tokens.length === 0) {
      console.log(`No FCM tokens for user ${recipientId}`);
      res.status(200).json({ success: true, message: "No tokens found for user" });
      return;
    }

    // Prepare message payload - send to each token individually
    const messages = tokens.map((token: string) => ({
      token: token,
      notification: {
        title: title,
        body: body,
      },
      webpush: {
        notification: {
          title: title,
          body: body,
          icon: icon || '/icons/icon-192x192.png',
        },
        fcmOptions: {
          link: url || '/'
        }
      },
      data: {
        url: url || '/',
      }
    }));

    // Send to all tokens using sendEach (FCM HTTP v1 API)
    const response = await messaging.sendEach(messages);
    
    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      
      if (failedTokens.length > 0) {
        await db.collection("users").doc(recipientId).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...failedTokens)
        });
        console.log(`Removed ${failedTokens.length} invalid tokens`);
      }
    }

    if (process.env.NODE_ENV !== 'production') console.log(`✅ Push notification sent to ${recipientId}: ${response.successCount} success, ${response.failureCount} failed`);
    
    res.status(200).json({ 
      success: true, 
      results: {
        successCount: response.successCount,
        failureCount: response.failureCount
      }
    });

  } catch (error) {
    console.error("❌ Error sending push notification:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

/**
 * Health check function
 */
export const health = functions.https.onRequest((req, res) => {
  // Apply CORS
  enableCORS(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  res.json({
    status: "Email service is running",
    timestamp: new Date(),
  });
});
