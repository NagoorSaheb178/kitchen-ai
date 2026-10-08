import { logger } from './logger';
import { generateCallbackSignature } from './auth';
import connectDB from './db';
import { StatusWebhookEvent } from './models';
import type { OrderStatus } from './models';

const MAX_RETRIES = 3;
const TIMEOUT_MS  = 10000;

export interface StatusCallbackPayload {
  restaurantId: string;
  externalOrderId: string;
  status: OrderStatus;
  orderId: string;
  updatedAt: string;
}

async function sendWithRetry(
  url: string,
  payload: StatusCallbackPayload,
  attempt: number = 1
): Promise<{ success: boolean; error?: string }> {
  // Only send customer-relevant fields — DO NOT send internal Kitchen ID
  const cleanPayload = {
    restaurantId: payload.restaurantId,
    externalOrderId: payload.externalOrderId,
    status: payload.status,
    updatedAt: payload.updatedAt,
  };

  const body = JSON.stringify(cleanPayload);
  const secret = process.env.CUSTOMER_STATUS_WEBHOOK_SECRET ?? 'default-secret';
  const signature = generateCallbackSignature(cleanPayload);

  console.log(`[KITCHEN] Sending customer status callback: ${url} ${payload.externalOrderId} ${payload.status} (attempt ${attempt})`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': secret,
        'authorization': `Bearer ${secret}`,
        'X-Kitchen-Signature': signature,
        'X-Kitchen-Restaurant': payload.restaurantId,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // If the target returned 405 (e.g. deployed Vercel site where /api/orders/status is GET-only),
      // seamlessly fallback to the deployed customer endpoint: /api/kitchen/orders/[id]/status
      if (res.status === 405 && url.includes('/api/orders/status')) {
        const fallbackUrl = url.replace(
          '/api/orders/status',
          `/api/kitchen/orders/${encodeURIComponent(payload.externalOrderId)}/status`
        );
        console.log(`[KITCHEN] Target returned 405; falling back to deployed route: ${fallbackUrl}`);
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': secret,
            'authorization': `Bearer ${secret}`,
            'X-Kitchen-Signature': signature,
            'X-Kitchen-Restaurant': payload.restaurantId,
          },
          body: JSON.stringify({
            status: payload.status,
            restaurantId: payload.restaurantId,
            updatedAt: payload.updatedAt,
          }),
        });

        if (fallbackRes.ok) {
          console.log(`[KITCHEN] Customer status callback delivered via deployed route: ${payload.externalOrderId} -> ${payload.status}`);
          logger.info('customer_callback_sent', {
            externalOrderId: payload.externalOrderId,
            status: payload.status,
            attempt: String(attempt),
            endpoint: 'deployed_fallback',
          });
          return { success: true };
        }
      }

      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    console.log(`[KITCHEN] Customer status callback delivered: ${payload.externalOrderId} -> ${payload.status}`);

    logger.info('customer_callback_sent', {
      externalOrderId: payload.externalOrderId,
      status: payload.status,
      attempt: String(attempt),
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KITCHEN] Customer status callback attempt ${attempt} failed:`, message);

    logger.warn('customer_callback_failed', {
      externalOrderId: payload.externalOrderId,
      status: payload.status,
      attempt: String(attempt),
      error: message,
    });

    if (attempt < MAX_RETRIES) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      return sendWithRetry(url, payload, attempt + 1);
    }

    return { success: false, error: message };
  }
}

export async function sendStatusCallback(payload: StatusCallbackPayload): Promise<void> {
  const url = process.env.CUSTOMER_STATUS_WEBHOOK_URL;
  if (!url) {
    logger.warn('customer_callback_skipped', { reason: 'CUSTOMER_STATUS_WEBHOOK_URL not set' });
    return;
  }

  await connectDB();

  const record = await StatusWebhookEvent.create({
    orderId:         payload.orderId,
    externalOrderId: payload.externalOrderId,
    restaurantId:    payload.restaurantId,
    status:          payload.status,
    callbackUrl:     url,
    success:         false,
    attempts:        0,
  });

  const result = await sendWithRetry(url, payload);

  // Also deliver to local customer dev server if configured URL is remote
  if (url !== 'http://localhost:3001/api/orders/status' && !url.includes('localhost:3001')) {
    sendWithRetry('http://localhost:3001/api/orders/status', payload).catch(() => {});
  }

  await StatusWebhookEvent.findByIdAndUpdate(record._id, {
    success:    result.success,
    attempts:   MAX_RETRIES,
    lastError:  result.error,
  });
}
