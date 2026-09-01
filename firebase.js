import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIRESTORE_EMULATOR_HOST } = process.env;

if (!admin.getApps().length) {
  if (FIRESTORE_EMULATOR_HOST) {
    // Emulator mode for local testing & development
    const projectId = FIREBASE_PROJECT_ID || 'link-vault-demo';
    admin.initializeApp({ projectId });
    console.log(`🔥 Firebase Admin initialized in EMULATOR mode (Host: ${FIRESTORE_EMULATOR_HOST}, Project: ${projectId})`);
  } else if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    // Production cloud mode
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    console.log(`🔥 Firebase Admin initialized in CLOUD mode (Project: ${FIREBASE_PROJECT_ID})`);
  } else {
    // Fallback: Default app initialization
    const projectId = FIREBASE_PROJECT_ID || 'link-vault-demo';
    admin.initializeApp({ projectId });
    console.log(`🔥 Firebase Admin initialized with project config (${projectId})`);
  }
}

const db = getFirestore();

export { db };
