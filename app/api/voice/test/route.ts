import { NextRequest, NextResponse } from 'next/server';
import { emitKitchenEvent } from '@/lib/emitter';

// POST /api/voice/test — test voice system
export async function POST(req: NextRequest) {
  const restaurantId = process.env.KITCHEN_RESTAURANT_ID ?? 'REST-001';

  emitKitchenEvent({
    type: 'voice.started',
    restaurantId,
    payload: {
      text: 'Kitchen voice system is working.',
      isTest: true,
    },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, text: 'Kitchen voice system is working.' });
}
