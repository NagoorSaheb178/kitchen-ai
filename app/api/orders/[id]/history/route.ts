import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { StatusHistory } from '@/lib/models';

// GET /api/orders/[id]/history
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await connectDB();

  const history = await StatusHistory.find({
    $or: [{ orderId: id }, { externalOrderId: id }],
  })
    .sort({ createdAt: 1 })
    .lean();

  return NextResponse.json({ success: true, history });
}
