import mongoose from 'mongoose';
import dns from 'node:dns';
import { v4 as uuidv4 } from 'uuid';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('[Sync] Error: MONGODB_URI environment variable is not defined.');
  process.exit(1);
}

function mapStatus(s) {
  if (!s) return 'RECEIVED';
  const str = s.toLowerCase();
  if (str.includes('serv') || str.includes('comp')) return 'SERVED';
  if (str.includes('ready')) return 'READY';
  if (str.includes('prep') || str.includes('kitch')) return 'PREPARING';
  if (str.includes('cancel')) return 'CANCELLED';
  return 'RECEIVED';
}

async function run() {
  console.log('[Sync] Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('[Sync] Connected.');

  const db = mongoose.connection.db;
  const customerOrders = await db.collection('orders').find({}).toArray();
  console.log(`[Sync] Found ${customerOrders.length} customer orders.`);

  const kitchenOrdersCol = db.collection('kitchenorders');
  const statusHistoryCol = db.collection('statushistories');

  let synced = 0;
  for (const doc of customerOrders) {
    const extId = (doc.orderReference || String(doc._id)).trim();
    const existing = await kitchenOrdersCol.findOne({
      $or: [{ externalOrderId: extId }, { externalOrderId: String(doc._id) }],
    });

    if (!existing) {
      const orderId = uuidv4();
      const items = Array.isArray(doc.items)
        ? doc.items.map(it => ({
            name: String(it.name || it.title || 'Item'),
            quantity: Number(it.quantity) || 1,
          }))
        : [{ name: 'Order Item', quantity: 1 }];

      const status = mapStatus(doc.status);
      const createdAt = doc.createdAt ? new Date(doc.createdAt) : new Date();

      await kitchenOrdersCol.insertOne({
        orderId,
        externalOrderId: extId,
        restaurantId: 'REST-001',
        tableNo: Number(doc.tableNumber) || 1,
        items,
        status,
        createdAt,
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : createdAt,
      });

      await statusHistoryCol.insertOne({
        orderId,
        externalOrderId: extId,
        restaurantId: 'REST-001',
        fromStatus: null,
        toStatus: status,
        changedBy: 'sync_script',
        createdAt,
      });

      synced++;
      console.log(`[Sync] Synced order: ${extId} (Table ${doc.tableNumber}) -> ${status}`);
    } else {
      console.log(`[Sync] Order already exists: ${extId}`);
    }
  }

  console.log(`[Sync] Done. Synced ${synced} new orders.`);
  await mongoose.disconnect();
}

run().catch(console.error);
