import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { KitchenOrder, StatusHistory } from '@/lib/models';
import { emitKitchenEvent } from '@/lib/emitter';
import { sendStatusCallback } from '@/lib/callback';
import { updateCustomerOrderStatus } from '@/lib/customer-sync';
import { logger } from '@/lib/logger';
import type { OrderStatus } from '@/lib/models';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED:   ['PREPARING', 'CANCELLED'],
  PREPARING:  ['READY', 'CANCELLED'],
  READY:      ['SERVED', 'CANCELLED'],
  SERVED:     [],
  CANCELLED:  [],
};

// PATCH /api/orders/[id]/status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { status: string; changedBy?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const newStatus = body.status as OrderStatus;
  const validStatuses: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'];
  if (!validStatuses.includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 422 });
  }

  await connectDB();

  const order = await KitchenOrder.findOne({
    $or: [{ orderId: id }, { externalOrderId: id }],
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${order.status} to ${newStatus}` },
      { status: 409 }
    );
  }

  const prevStatus = order.status;
  order.status = newStatus;
  await order.save();

  // Status history
  await StatusHistory.create({
    orderId:         order.orderId,
    externalOrderId: order.externalOrderId,
    restaurantId:    order.restaurantId,
    fromStatus:      prevStatus,
    toStatus:        newStatus,
    changedBy:       body.changedBy ?? 'kitchen',
  });

  console.log(`[KITCHEN] Status changed: ${order.externalOrderId} (${order.orderId}) -> ${newStatus}`);

  logger.info('order_status_changed', {
    orderId:         order.orderId,
    externalOrderId: order.externalOrderId,
    from:            prevStatus,
    to:              newStatus,
  });

  // Emit realtime event
  emitKitchenEvent({
    type: 'order.status_changed',
    restaurantId: order.restaurantId,
    payload: {
      orderId:         order.orderId,
      externalOrderId: order.externalOrderId,
      tableNo:         order.tableNo,
      status:          newStatus,
      previousStatus:  prevStatus,
      items:           order.items,
      updatedAt:       new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  });

  // Send callback to customer (fire and forget — kitchen stays working if this fails)
  sendStatusCallback({
    restaurantId:    order.restaurantId,
    externalOrderId: order.externalOrderId,
    orderId:         order.orderId,
    status:          newStatus,
    updatedAt:       new Date().toISOString(),
  }).catch(err => logger.error('callback_fire_error', { error: String(err) }));

  // Also sync status directly to the customer's shared orders collection
  await updateCustomerOrderStatus(order.externalOrderId, newStatus);

  return NextResponse.json({
    success: true,
    orderId: order.orderId,
    externalOrderId: order.externalOrderId,
    status: newStatus,
    previousStatus: prevStatus,
  });
}
