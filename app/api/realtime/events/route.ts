import { NextRequest } from 'next/server';
import { kitchenEmitter } from '@/lib/emitter';
import type { KitchenEvent } from '@/lib/emitter';
import connectDB from '@/lib/db';
import { startCustomerOrderWatcher } from '@/lib/customer-sync';

// GET /api/realtime/events?restaurantId=REST-001
// Server-Sent Events endpoint — kitchen UI subscribes here
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const restaurantId = searchParams.get('restaurantId') ?? process.env.KITCHEN_RESTAURANT_ID ?? 'REST-001';

  // Ensure DB connection and start real-time customer order watcher
  connectDB().then(() => {
    startCustomerOrderWatcher();
  }).catch(() => {});

  const channel = `restaurant:${restaurantId}`;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const sendEvent = (event: KitchenEvent) => {
        try {
          controller.enqueue(
            `data: ${JSON.stringify(event)}\n\n`
          );
        } catch {
          // Client disconnected
        }
      };

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Send initial connection confirmation
      sendEvent({
        type: 'device.connected',
        restaurantId: restaurantId!,
        payload: { message: 'Kitchen AI connected', deviceId: process.env.KITCHEN_DEVICE_ID },
        timestamp: new Date().toISOString(),
      });

      kitchenEmitter.on(channel, sendEvent);

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        kitchenEmitter.off(channel, sendEvent);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* ignore */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
