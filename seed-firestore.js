import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './firebase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeUrl(urlStr) {
  if (!urlStr) return '';
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch (e) {
    return urlStr.trim().replace(/\/$/, '').toLowerCase();
  }
}

async function seedFirestore() {
  try {
    console.log('🌱 Checking Firestore links collection...');
    const snapshot = await db.collection('links').get();
    
    if (!snapshot.empty) {
      console.log(`✅ Firestore already contains ${snapshot.size} documents. Seed skipped.`);
      process.exit(0);
    }

    console.log('📦 Firestore links collection is empty. Seeding initial data from db.example.json...');
    const examplePath = path.join(__dirname, 'db.example.json');
    const rawData = await fs.readFile(examplePath, 'utf-8');
    const { links } = JSON.parse(rawData);

    const batch = db.batch();
    for (const link of links) {
      const docRef = db.collection('links').doc(link.id);
      batch.set(docRef, {
        ...link,
        normalizedUrl: normalizeUrl(link.url)
      });
    }

    await batch.commit();
    console.log(`🎉 Successfully seeded ${links.length} initial links into Firestore!`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding Firestore:', err);
    process.exit(1);
  }
}

seedFirestore();
