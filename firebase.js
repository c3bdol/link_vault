import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

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
let initError = null;

const projectId = process.env.FIREBASE_PROJECT_ID ? process.env.FIREBASE_PROJECT_ID.trim() : '';
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ? process.env.FIREBASE_CLIENT_EMAIL.trim() : '';
const privateKey = process.env.FIREBASE_PRIVATE_KEY ? parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY) : '';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

function checkEnvVars() {
  return {
    FIREBASE_PROJECT_ID: Boolean(projectId),
    FIREBASE_CLIENT_EMAIL: Boolean(clientEmail),
    FIREBASE_PRIVATE_KEY: Boolean(privateKey),
  };
}

if (!admin.getApps().length) {
  if (emulatorHost) {
    admin.initializeApp({ projectId: projectId || 'link-vault-demo' });
    isInitialized = true;
    console.log(`🔥 Firebase Admin initialized in EMULATOR mode (Host: ${emulatorHost})`);
  } else if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      isInitialized = true;
      console.log(`🔥 Firebase Admin initialized in CLOUD mode (Project: ${projectId})`);
    } catch (err) {
      initError = err.message;
      console.error('❌ Failed to initialize Firebase Admin with credentials:', err.message);
    }
  } else {
    const missing = [];
    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
    if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
    initError = `Missing Vercel environment variables: ${missing.join(', ')}`;
    console.warn(`⚠️ ${initError}`);
  }
}

let dbInstance = null;
if (isInitialized && admin.getApps().length > 0) {
  try {
    dbInstance = getFirestore();
  } catch (e) {
    initError = e.message;
    console.error('❌ Error initializing Firestore instance:', e.message);
  }
}

export { dbInstance as db, isInitialized, initError, checkEnvVars };
