import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { KitchenOrder } from '@/lib/models';
import { validateApiKey } from '@/lib/auth';
import { syncCustomerOrders } from '@/lib/customer-sync';

// GET /api/orders — list orders for the kitchen restaurant
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  const host = req.headers.get('host') ?? '';
  const referer = req.headers.get('referer') ?? '';
  const isDashboard = referer.includes(host) || process.env.NODE_ENV !== 'production';

  if (!isDashboard && !validateApiKey(apiKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const restaurantId = process.env.KITCHEN_RESTAURANT_ID ?? 'REST-001';
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  try {
    await connectDB();

    // Auto-sync any existing or newly placed orders from the shared customer DB
    await syncCustomerOrders();

    const query: Record<string, unknown> = { restaurantId };
    if (status) query.status = status;

    const orders = await KitchenOrder.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({ success: true, orders });
  } catch (err: any) {
    console.error('Error fetching orders:', err);
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
