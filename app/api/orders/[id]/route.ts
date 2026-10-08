import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { KitchenOrder } from '@/lib/models';

// GET /api/orders/[id] — get single order
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await connectDB();

  const order = await KitchenOrder.findOne({
    $or: [{ orderId: id }, { externalOrderId: id }],
  }).lean();

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, order });
}
