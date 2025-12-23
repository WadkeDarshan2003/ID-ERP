/**
 * Firebase Cloud Function for sending emails via Nodemailer
 */

import * as functions from "firebase-functions";
import nodemailer from "nodemailer";
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

// Initialize admin SDK for functions
if (!admin.apps.length) {
  admin.initializeApp();
}

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
      from: `Between The Walls <${process.env.EMAIL_USER}>`,
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

// --- initTenantForAdmin callable (migrated here) ---
const COLLECTIONS_TO_MIGRATE = [
  'projects', 'vendors', 'clients', 'designers', 'tasks', 'users'
];

export const initTenantForAdmin = functions.https.onCall(async (data: any, context: any) => {
  if (!context || !context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const callerUid = context.auth.uid as string;
  const callerClaims = (context.auth.token || {}) as any;

  if (callerClaims.tenantId) {
    return { message: 'Tenant already initialized', tenantId: callerClaims.tenantId };
  }

  const tenantId = (data && data.tenantId) ? String(data.tenantId) : `tenant_${randomUUID()}`;
  const tenantName = (data && data.name) ? String(data.name) : 'New Tenant';

  const db = admin.firestore();

  await db.doc(`tenants/${tenantId}`).set({
    name: tenantName,
    createdBy: callerUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await admin.auth().setCustomUserClaims(callerUid, { tenantId, role: 'admin' });

  const userRecord = await admin.auth().getUser(callerUid);
  await db.doc(`tenants/${tenantId}/users/${callerUid}`).set({
    email: userRecord.email || null,
    displayName: userRecord.displayName || null,
    role: 'admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  for (const colName of COLLECTIONS_TO_MIGRATE) {
    const colRef = db.collection(colName);
    const snapshot = await colRef.where('tenantId', '==', null).get().catch(async () => {
      return await colRef.get();
    });

    const docsToUpdate: FirebaseFirestore.DocumentSnapshot[] = [];
    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (!d || d.tenantId) continue;
      docsToUpdate.push(doc);
    }

    if (docsToUpdate.length === 0) continue;

    let batch = db.batch();
    let opCount = 0;
    for (const doc of docsToUpdate) {
      batch.update(doc.ref, { tenantId });
      opCount++;
      if (opCount >= 450) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();
  }

  return { message: 'Tenant initialized', tenantId };
});

/**
 * Register new admin with automatic Firestore document creation
 * This bypasses client-side security rules
 */
// Disabled - using direct client-side writes with permissive Firestore rules instead
// export const registerAdmin = functions.https.onCall(async (data: any, context: any) => {
//   ...
// });

// Export additional functions implemented in separate files
export * from './initTenantForAdmin';
