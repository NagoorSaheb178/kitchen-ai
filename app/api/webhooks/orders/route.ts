import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import connectDB from '@/lib/db';
import { KitchenOrder, WebhookEvent, VoiceAnnouncement, StatusHistory } from '@/lib/models';
import { validateApiKey } from '@/lib/auth';
import { emitKitchenEvent } from '@/lib/emitter';
import { logger } from '@/lib/logger';

// ─── Build voice announcement text ───────────────────────────────────────────
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

// ─── POST /api/webhooks/orders ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  logger.info('webhook_received', { path: '/api/webhooks/orders' });

  // 1. Authenticate — accept API key OR dev bypass
  const apiKey = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '') ?? null;
  if (!validateApiKey(apiKey)) {
    logger.warn('webhook_unauthorized');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse & validate payload
  let body: {
    restaurantId: string;
    externalOrderId: string;
    tableNo: number;
    items: { name: string; quantity: number }[];
    createdAt?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { restaurantId, externalOrderId, tableNo, items } = body;
  if (!restaurantId || !externalOrderId || !tableNo || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 422 });
  }

  // 3. Validate restaurantId
  const allowedRestaurantId = process.env.KITCHEN_RESTAURANT_ID ?? 'REST-001';
  if (restaurantId !== allowedRestaurantId) {
    logger.warn('webhook_invalid_restaurant', { restaurantId });
    return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
  }

  await connectDB();

  // 4. Idempotency — check if externalOrderId already exists
  const existing = await KitchenOrder.findOne({ externalOrderId });
  if (existing) {
    logger.warn('webhook_duplicate_order', { externalOrderId });
    return NextResponse.json(
      { success: true, orderId: existing.orderId, externalOrderId, duplicate: true },
      { status: 200 }
    );
  }

  // 5. Store WebhookEvent record
  const eventId = uuidv4();
  await WebhookEvent.create({
    eventId,
    externalOrderId,
    restaurantId,
    payload: body,
    processed: false,
  });

  // 6. Create KitchenOrder
  const orderId = uuidv4();
  const order = await KitchenOrder.create({
    orderId,
    externalOrderId,
    restaurantId,
    tableNo,
    items,
    status: 'RECEIVED',
  });

  // 7. Status history
  await StatusHistory.create({
    orderId,
    externalOrderId,
    restaurantId,
    fromStatus: null,
    toStatus: 'RECEIVED',
    changedBy: 'webhook',
  });

  // 8. Mark webhook processed
  await WebhookEvent.findOneAndUpdate({ eventId }, { processed: true, processedAt: new Date() });

  // 9. Build announcement text
  const announcementText = buildAnnouncementText(tableNo, items);

  // 10. Save voice announcement to DB
  await VoiceAnnouncement.create({
    orderId,
    externalOrderId,
    restaurantId,
    text: announcementText,
    status: 'queued',
    attempts: 0,
  });

  // 11. Emit realtime event
  emitKitchenEvent({
    type: 'order.created',
    restaurantId,
    payload: {
      orderId,
      externalOrderId,
      tableNo,
      items,
      status: 'RECEIVED',
      announcementText,
      createdAt: order.createdAt,
    },
    timestamp: new Date().toISOString(),
  });

  logger.info('order_created', { orderId, externalOrderId, tableNo, restaurantId });

  return NextResponse.json(
    { success: true, orderId, externalOrderId },
    { status: 201 }
  );
}
