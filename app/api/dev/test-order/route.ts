import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// GET /api/dev/test-order — simulate sending a test webhook (DEV ONLY)
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const menuItems = [
    [{ name: 'Chicken Biryani', quantity: 2 }, { name: 'Coke', quantity: 1 }],
    [{ name: 'Paneer Tikka', quantity: 1 }, { name: 'Garlic Naan', quantity: 2 }],
    [{ name: 'Masala Dosa', quantity: 1 }, { name: 'Mango Lassi', quantity: 1 }],
    [{ name: 'Vegetable Pulao', quantity: 1 }, { name: 'Butter Naan', quantity: 2 }, { name: 'Water', quantity: 1 }],
  ];

  const randomItems = menuItems[Math.floor(Math.random() * menuItems.length)];
  const tableNo = Math.floor(Math.random() * 15) + 1;
  const externalOrderId = `AO-${Date.now()}`;

  const payload = {
    restaurantId: process.env.KITCHEN_RESTAURANT_ID ?? 'REST-001',
    externalOrderId,
    tableNo,
    items: randomItems,
    createdAt: new Date().toISOString(),
  };

  // POST internally to webhook endpoint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const webhookRes = await fetch(`${baseUrl}/api/webhooks/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.KITCHEN_API_KEY ?? '',
    },
    body: JSON.stringify(payload),
  });

  const result = await webhookRes.json();
  return NextResponse.json({
    success: true,
    message: '⚠️ DEV ONLY — Test order sent',
    payload,
    result,
  });
}
