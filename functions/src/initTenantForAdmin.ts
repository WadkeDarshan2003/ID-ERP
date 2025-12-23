import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

// Initialize admin if not already done in this functions project
if (!admin.apps.length) {
  admin.initializeApp();
}

// Collections to migrate if they don't have tenantId
const COLLECTIONS_TO_MIGRATE = [
  'projects',
  'vendors',
  'clients',
  'designers',
  'tasks',
  'users'
];

export const initTenantForAdmin = functions.https.onCall(async (data: any, context: any) => {
  if (!context || !context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const callerUid = context.auth.uid as string;
  const callerClaims = (context.auth.token || {}) as any;

  // Prevent re-initialization if tenantId already present
  if (callerClaims.tenantId) {
    return { message: 'Tenant already initialized', tenantId: callerClaims.tenantId };
  }

  // Create a new tenant id and record
  const tenantId = (data && data.tenantId) ? String(data.tenantId) : `tenant_${randomUUID()}`;
  const tenantName = (data && data.name) ? String(data.name) : 'New Tenant';

  const db = admin.firestore();

  // Create tenant document
  await db.doc(`tenants/${tenantId}`).set({
    name: tenantName,
    createdBy: callerUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Set custom claims for caller (give them admin role for that tenant)
  await admin.auth().setCustomUserClaims(callerUid, { tenantId, role: 'admin' });

  // Mirror user profile under tenant users
  const userRecord = await admin.auth().getUser(callerUid);
  await db.doc(`tenants/${tenantId}/users/${callerUid}`).set({
    email: userRecord.email || null,
    displayName: userRecord.displayName || null,
    role: 'admin',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Migrate existing documents that lack tenantId: add tenantId to them.
  // NOTE: This will add tenantId to all documents in the listed collections that don't already have it.
  for (const colName of COLLECTIONS_TO_MIGRATE) {
    const colRef = db.collection(colName);
    const snapshot = await colRef.where('tenantId', '==', null).get().catch(async (err) => {
      // Firestore doesn't allow '== null' queries reliably across SDKs; fallback to get all docs and filter
      return await colRef.get();
    });

    const docsToUpdate: FirebaseFirestore.DocumentSnapshot[] = [];
    // If the query returned all docs, filter those missing tenantId
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data || data.tenantId) continue;
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
