import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIRESTORE_EMULATOR_HOST } = process.env;

// Helper to sanitize private key from Vercel env variable formatting
function parsePrivateKey(key) {
  if (!key) return '';
  let str = key.trim();
  // Strip outer quotes if user accidentally included quotes when pasting
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }
  // Replace literal \n string representations with real newlines
  return str.replace(/\\n/g, '\n');
}

if (!admin.getApps().length) {
  if (FIRESTORE_EMULATOR_HOST) {
    const projectId = FIREBASE_PROJECT_ID || 'link-vault-demo';
    admin.initializeApp({ projectId });
    console.log(`🔥 Firebase Admin initialized in EMULATOR mode (Host: ${FIRESTORE_EMULATOR_HOST}, Project: ${projectId})`);
  } else if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    try {
      const formattedPrivateKey = parsePrivateKey(FIREBASE_PRIVATE_KEY);
      const cleanProjectId = FIREBASE_PROJECT_ID.trim();
      const cleanClientEmail = FIREBASE_CLIENT_EMAIL.trim();

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: cleanProjectId,
          clientEmail: cleanClientEmail,
          privateKey: formattedPrivateKey,
        }),
      });
      console.log(`🔥 Firebase Admin initialized in CLOUD mode (Project: ${cleanProjectId})`);
    } catch (err) {
      console.error('❌ Failed to initialize Firebase Admin with credentials:', err);
    }
  } else {
    console.warn('⚠️ Missing one or more Firebase environment variables on Vercel:');
    console.warn(`   FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID ? 'SET' : 'MISSING'}`);
    console.warn(`   FIREBASE_CLIENT_EMAIL: ${FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING'}`);
    console.warn(`   FIREBASE_PRIVATE_KEY: ${FIREBASE_PRIVATE_KEY ? 'SET' : 'MISSING'}`);
    const projectId = FIREBASE_PROJECT_ID || 'link-vault-demo';
    admin.initializeApp({ projectId });
  }
}

const db = getFirestore();

export { db };
