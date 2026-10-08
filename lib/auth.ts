import crypto from 'crypto';

/** Validate incoming webhook using HMAC-SHA256 signature */
export function validateWebhookSignature(
  body: string,
  signature: string | null,
  secret: string = process.env.WEBHOOK_SECRET!
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  const expectedHeader = `sha256=${expected}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedHeader)
    );
  } catch {
    return false;
  }
}

/** Generate HMAC-SHA256 signature for outgoing callbacks */
export function signPayload(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Validate simple API key */
export function validateApiKey(key: string | null): boolean {
  const validKey = process.env.KITCHEN_API_KEY;
  if (!validKey || !key) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(validKey));
  } catch {
    return false;
  }
}

/** Generate HMAC for outgoing callback to customer */
export function generateCallbackSignature(payload: object): string {
  const body = JSON.stringify(payload);
  const secret = process.env.CUSTOMER_WEBHOOK_API_KEY ?? 'default-secret';
  return signPayload(body, secret);
}
