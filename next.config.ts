import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {},
  env: {
    NEXT_PUBLIC_KITCHEN_DEVICE_NAME: process.env.KITCHEN_DEVICE_NAME ?? 'KITCHEN-01',
  },
  // Allow large streaming responses (SSE)
  serverExternalPackages: ['mongoose'],
};

export default nextConfig;
