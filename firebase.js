import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIRESTORE_EMULATOR_HOST } = process.env;

function parsePrivateKey(key) {
  if (!key) return '';
  let str = key.trim();
  // Strip outer quotes if user accidentally included quotes when pasting in Vercel UI
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }
  // Replace literal \n string representations with real newlines
  return str.replace(/\\n/g, '\n');
}

let isInitialized = false;

if (!admin.getApps().length) {
  if (FIRESTORE_EMULATOR_HOST) {
    const projectId = FIREBASE_PROJECT_ID || 'link-vault-demo';
    admin.initializeApp({ projectId });
    isInitialized = true;
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
      isInitialized = true;
      console.log(`🔥 Firebase Admin initialized in CLOUD mode (Project: ${cleanProjectId})`);
    } catch (err) {
      console.error('❌ Failed to initialize Firebase Admin with credentials:', err.message);
    }
  } else {
    console.warn('⚠️ Missing one or more Firebase environment variables on Vercel.');
  }

  // Fallback: Ensure an admin app exists so server start never crashes top-level
  if (!isInitialized && !admin.getApps().length) {
    try {
      const projectId = (FIREBASE_PROJECT_ID && FIREBASE_PROJECT_ID.trim()) || 'link-vault-demo';
      admin.initializeApp({ projectId });
      console.log(`🔥 Firebase Admin initialized with fallback project (${projectId})`);
    } catch (err) {
      console.error('❌ Fallback Firebase initialization error:', err.message);
    }
  }
}

let dbInstance = null;
try {
  if (admin.getApps().length > 0) {
    dbInstance = getFirestore();
  }
} catch (e) {
  console.error('❌ Error initializing Firestore instance:', e.message);
}

export { dbInstance as db };
