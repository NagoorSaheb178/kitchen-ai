import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { KitchenOrder, StatusHistory, VoiceAnnouncement, OrderStatus } from '@/lib/models';
import { emitKitchenEvent } from '@/lib/emitter';
import { logger } from '@/lib/logger';

// Build speech announcement text for AI voice
function buildAnnouncementText(tableNo: number, items: { name: string; quantity: number }[]): string {
  const words = (n: number) =>
    ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);

  const parts = items.map(item => `${words(item.quantity)} ${item.name}`);
  const list =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1);

  return `New order. Table ${tableNo}. ${list}.`;
}

// Map customer order status string to Kitchen AI OrderStatus
export function mapCustomerStatusToKitchen(customerStatus: string | undefined): OrderStatus {
  if (!customerStatus) return 'RECEIVED';
  const s = customerStatus.trim().toLowerCase();
  if (s.includes('serv') || s.includes('complete')) return 'SERVED';
  if (s.includes('ready')) return 'READY';
  if (s.includes('prep') || s.includes('kitchen')) return 'PREPARING';
  if (s.includes('cancel')) return 'CANCELLED';
  return 'RECEIVED';
}

// Map Kitchen AI OrderStatus back to customer app's status string
export function mapKitchenStatusToCustomer(status: OrderStatus): string {
  switch (status) {
    case 'RECEIVED':  return 'Order received';
    case 'PREPARING': return 'Preparing';
    case 'READY':     return 'Ready';
    case 'SERVED':    return 'Served';
    case 'CANCELLED': return 'Cancelled';
    default:          return 'Order received';
  }
}

/**
 * Synchronize existing customer orders from the shared database's `orders` collection
 * into Kitchen AI's `kitchenorders` collection and notify AI Voice and dashboard.
 */
export async function syncCustomerOrders(notifyNew: boolean = true): Promise<number> {
  try {
    const db = mongoose.connection.db;
    if (!db) return 0;

    const customerOrdersCollection = db.collection('orders');
    const customerOrders = await customerOrdersCollection.find({}).toArray();

    if (!customerOrders.length) return 0;

    const restaurantId = process.env.KITCHEN_RESTAURANT_ID ?? 'REST-001';
    let importedCount = 0;

    for (const doc of customerOrders) {
      const extId = (doc.orderReference || String(doc._id)).trim();
      if (!extId) continue;

      // Check if already in kitchenorders (check both extId and _id string)
      const existing = await KitchenOrder.findOne({
        $or: [
          { externalOrderId: extId },
          { externalOrderId: String(doc._id) },
        ],
      });

      if (!existing) {
        const orderId = uuidv4();
        const items = Array.isArray(doc.items)
          ? doc.items.map((it: any) => ({
              name: String(it.name || it.title || 'Item'),
              quantity: Number(it.quantity) || 1,
            }))
          : [{ name: 'Order Item', quantity: 1 }];

        const kitchenStatus = mapCustomerStatusToKitchen(doc.status);
        const createdAt = doc.createdAt ? new Date(doc.createdAt) : new Date();
        const tableNo = Number(doc.tableNumber) || 1;

        await KitchenOrder.create({
          orderId,
          externalOrderId: extId,
          restaurantId,
          tableNo,
          items,
          status: kitchenStatus,
          createdAt,
          updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : createdAt,
        });

        await StatusHistory.create({
          orderId,
          externalOrderId: extId,
          restaurantId,
          fromStatus: null,
          toStatus: kitchenStatus,
          changedBy: 'customer_db_sync',
          createdAt,
        });

        const announcementText = buildAnnouncementText(tableNo, items);

        await VoiceAnnouncement.create({
          orderId,
          externalOrderId: extId,
          restaurantId,
          text: announcementText,
          status: 'queued',
          attempts: 0,
        });

        if (notifyNew) {
          // Immediately notify Kitchen UI & Voice Assistant over SSE
          emitKitchenEvent({
            type: 'order.created',
            restaurantId,
            payload: {
              orderId,
              externalOrderId: extId,
              tableNo,
              items,
              status: kitchenStatus,
              announcementText,
              createdAt: createdAt.toISOString(),
            },
            timestamp: new Date().toISOString(),
          });
        }

        importedCount++;
      }
    }

    if (importedCount > 0) {
      logger.info('customer_orders_synced', { count: importedCount });
    }

    return importedCount;
  } catch (err) {
    logger.error('sync_customer_orders_error', { error: String(err) });
    return 0;
  }
}

/**
 * Update status in the customer's `orders` collection when Kitchen advances an order.
 */
export async function updateCustomerOrderStatus(
  externalOrderId: string,
  kitchenStatus: OrderStatus
): Promise<boolean> {
  try {
    const db = mongoose.connection.db;
    if (!db) return false;

    const customerStatus = mapKitchenStatusToCustomer(kitchenStatus);
    const filterConditions: any[] = [
      { orderReference: externalOrderId },
      { _id: externalOrderId },
    ];

    if (mongoose.Types.ObjectId.isValid(externalOrderId)) {
      filterConditions.push({ _id: new mongoose.Types.ObjectId(externalOrderId) });
    }

    const res = await db.collection('orders').updateMany(
      { $or: filterConditions },
      {
        $set: {
          status: customerStatus,
          updatedAt: new Date(),
        },
      }
    );

    return (res.modifiedCount ?? 0) > 0;
  } catch (err) {
    logger.warn('update_customer_order_status_error', { externalOrderId, error: String(err) });
    return false;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __orderWatcherStarted: boolean | undefined;
}

/**
 * Starts continuous real-time watching of the customer `orders` collection.
 * Uses both MongoDB Atlas Change Streams (<100ms) and a 1.5s active interval
 * so the AI Voice and Dashboard instantly detect and announce new customer orders.
 */
export function startCustomerOrderWatcher() {
  if (global.__orderWatcherStarted) return;
  global.__orderWatcherStarted = true;

  // Initial sync
  syncCustomerOrders(false).catch(() => {});

  // Fast active polling (every 1.5 seconds)
  setInterval(async () => {
    try {
      await syncCustomerOrders(true);
    } catch {
      // ignore
    }
  }, 1500);

  // Real-time MongoDB Change Streams (instant event push)
  try {
    const db = mongoose.connection.db;
    if (db) {
      const changeStream = db.collection('orders').watch([{ $match: { operationType: 'insert' } }]);
      changeStream.on('change', async () => {
        try {
          await syncCustomerOrders(true);
        } catch {}
      });
      changeStream.on('error', () => {
        // Fallback interval continues handling it smoothly
      });
    }
  } catch {}
}
