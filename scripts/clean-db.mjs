import mongoose from 'mongoose';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

// Load MONGODB_URI from .env.local if not already in process.env
let uri = process.env.MONGODB_URI;
if (!uri) {
  try {
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^MONGODB_URI=(.+)$/m);
      if (match) uri = match[1].trim();
    }
  } catch {}
}

if (!uri) {
  console.error('[Clean DB] Error: MONGODB_URI not found.');
  process.exit(1);
}

async function cleanDatabase() {
  console.log('[Clean DB] Connecting to database...');
  await mongoose.connect(uri);
  console.log('[Clean DB] Connected successfully.');

  const db = mongoose.connection.db;
  const collectionsToClean = [
    'orders',
    'kitchenorders',
    'statushistories',
    'voiceannouncements',
    'webhookevents',
    'statuswebhookevents',
  ];

  const existingCollections = (await db.listCollections().toArray()).map(c => c.name);

  console.log('\n[Clean DB] Cleaning collections...');
  for (const colName of collectionsToClean) {
    if (existingCollections.includes(colName)) {
      const result = await db.collection(colName).deleteMany({});
      console.log(` ✓ Cleared ${colName}: deleted ${result.deletedCount} documents.`);
    } else {
      console.log(` - Skipped ${colName} (collection does not exist yet).`);
    }
  }

  // Confirm restaurants and kitchendevices are intact
  if (existingCollections.includes('restaurants')) {
    const restCount = await db.collection('restaurants').countDocuments();
    console.log(`\n[Info] Preserved 'restaurants': ${restCount} active record(s).`);
  }
  if (existingCollections.includes('kitchendevices')) {
    const devCount = await db.collection('kitchendevices').countDocuments();
    console.log(`[Info] Preserved 'kitchendevices': ${devCount} active record(s).`);
  }

  await mongoose.disconnect();
  console.log('\n[Clean DB] Database order cleanup complete!\n');
}

cleanDatabase().catch(err => {
  console.error('[Clean DB] Error during cleanup:', err);
  process.exit(1);
});
