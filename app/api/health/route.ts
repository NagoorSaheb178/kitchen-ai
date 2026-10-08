import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';

export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({
      status: 'ok',
      service: 'Kitchen AI',
      restaurantId: process.env.KITCHEN_RESTAURANT_ID,
      deviceId: process.env.KITCHEN_DEVICE_ID,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: 'Database connection failed' },
      { status: 503 }
    );
  }
}
