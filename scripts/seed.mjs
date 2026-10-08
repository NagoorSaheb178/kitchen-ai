/**
 * Seeds the Kitchen AI MongoDB database with:
 * - Restaurant record (REST-001)
 * - Kitchen device (KITCHEN-01)
 *
 * Run with: node scripts/seed.mjs
 */
import mongoose from 'mongoose';
import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('[Seed] Error: MONGODB_URI environment variable is not defined.');
  process.exit(1);
}

// Inline schemas (avoiding TS import in plain .mjs)
const restaurantSchema = new mongoose.Schema({
  restaurantId: { type: String, unique: true, index: true },
  name: String,
  active: { type: Boolean, default: true },
  webhookSecret: String,
}, { timestamps: true });

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true, index: true },
  restaurantId: { type: String, index: true },
  name: String,
  active: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
}, { timestamps: true });

const Restaurant = mongoose.models.Restaurant ?? mongoose.model('Restaurant', restaurantSchema);
const KitchenDevice = mongoose.models.KitchenDevice ?? mongoose.model('KitchenDevice', deviceSchema);

async function seed() {
  console.log('[Seed] Connecting to MongoDB…');
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  console.log('[Seed] Connected.');

  // Upsert restaurant
  await Restaurant.findOneAndUpdate(
    { restaurantId: 'REST-001' },
    {
      restaurantId:  'REST-001',
      name:          'Spice & Co.',
      active:        true,
      webhookSecret: 'webhook-secret-hmac-key-change-in-production',
    },
    { upsert: true, new: true }
  );
  console.log('[Seed] Restaurant REST-001 upserted.');

  // Upsert kitchen device
  await KitchenDevice.findOneAndUpdate(
    { deviceId: 'KITCHEN-01' },
    {
      deviceId:     'KITCHEN-01',
      restaurantId: 'REST-001',
      name:         'Kitchen Display 01',
      active:       true,
      lastSeen:     new Date(),
    },
    { upsert: true, new: true }
  );
  console.log('[Seed] Device KITCHEN-01 upserted.');

  await mongoose.disconnect();
  console.log('[Seed] Done.');
}

seed().catch(err => { console.error('[Seed] Error:', err); process.exit(1); });
