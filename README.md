# Restaurant Kitchen AI

A production-ready, **fully independent** kitchen operations system powered by AI. Built with Next.js App Router, MongoDB, Server-Sent Events for realtime, and browser TTS with a cloud-extensible voice service abstraction.

> ⚠️ **Independence guarantee:** This system communicates with the external customer ordering system **only** via secure HTTPS webhooks/callbacks. No shared database, no shared source code, no shared env vars.

---

## Architecture

```
External Customer System
        │
        │  HTTPS POST  /api/webhooks/orders
        ▼
┌─────────────────────────────────┐
│         Kitchen AI Backend      │
│  Next.js App Router API Routes  │
│                                 │
│  ┌────────────┐ ┌─────────────┐ │
│  │  MongoDB   │ │  SSE Emitter│ │
│  │ (Mongoose) │ │  (EventEmit)│ │
│  └────────────┘ └─────────────┘ │
│  ┌────────────┐                 │
│  │ Callback   │ → CUSTOMER_STATUS_WEBHOOK_URL
│  │ Service    │                 │
│  └────────────┘                 │
└─────────────────────────────────┘
        │
        │  Server-Sent Events  /api/realtime/events
        ▼
┌─────────────────────────────────┐
│       Kitchen AI Frontend       │
│    Next.js Page (React Client)  │
│                                 │
│  ┌────────────┐ ┌─────────────┐ │
│  │  Order     │ │  AI Voice   │ │
│  │  Cards     │ │  Assistant  │ │
│  └────────────┘ └─────────────┘ │
└─────────────────────────────────┘
```

## Feature-Based Structure

```
kitchen-ai/
├── app/
│   ├── page.tsx                    ← Kitchen dashboard (React client)
│   ├── layout.tsx                  ← Root layout
│   ├── globals.css                 ← Design system
│   └── api/
│       ├── health/route.ts         ← GET /api/health
│       ├── webhooks/
│       │   └── orders/route.ts     ← POST /api/webhooks/orders
│       ├── orders/
│       │   ├── route.ts            ← GET /api/orders
│       │   └── [id]/
│       │       ├── route.ts        ← GET /api/orders/:id
│       │       ├── status/route.ts ← PATCH /api/orders/:id/status
│       │       └── history/route.ts← GET /api/orders/:id/history
│       ├── realtime/
│       │   └── events/route.ts     ← GET /api/realtime/events (SSE)
│       ├── voice/
│       │   └── test/route.ts       ← POST /api/voice/test
│       └── dev/
│           └── test-order/route.ts ← GET /api/dev/test-order (DEV ONLY)
├── lib/
│   ├── db.ts                       ← MongoDB singleton
│   ├── models.ts                   ← All Mongoose models
│   ├── auth.ts                     ← HMAC webhook auth
│   ├── logger.ts                   ← Structured logger
│   ├── emitter.ts                  ← SSE event emitter
│   └── callback.ts                 ← Customer status callback service
├── scripts/
│   └── seed.mjs                    ← DB seed (restaurant + device)
├── .env.local                      ← Your secrets (gitignored)
├── .env.example                    ← Template
└── README.md
```

---

## Installation

```bash
# Clone or navigate to project
cd restaurant-system/kitchen-ai

# Install dependencies
npm install
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `KITCHEN_API_KEY` | API key for webhook authentication |
| `WEBHOOK_SECRET` | HMAC secret for signature validation |
| `NEXTAUTH_SECRET` | NextAuth.js session secret |
| `KITCHEN_RESTAURANT_ID` | Restaurant ID (e.g. `REST-001`) |
| `KITCHEN_RESTAURANT_NAME` | Display name |
| `KITCHEN_DEVICE_ID` | Device ID (e.g. `KITCHEN-01`) |
| `CUSTOMER_STATUS_WEBHOOK_URL` | URL to POST status updates to customer system |
| `CUSTOMER_WEBHOOK_API_KEY` | API key sent to customer on callbacks |
| `GEMINI_API_KEY` | Google Gemini AI key (for future cloud TTS) |

---

## Database Setup

Seed the database with restaurant and device records:

```bash
node scripts/seed.mjs
```

---

## Running the App

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

The app runs on **http://localhost:3000**

---

## Realtime (SSE)

The kitchen UI subscribes to Server-Sent Events at:

```
GET /api/realtime/events?restaurantId=REST-001
```

Events emitted:
- `order.created` — new order from webhook
- `order.status_changed` — status updated by kitchen staff
- `voice.started` / `voice.finished`
- `device.connected` / `device.disconnected`

---

## TTS Voice Architecture

```
VoiceService (abstraction)
   ├── BrowserSpeechProvider  ← current (SpeechSynthesis API)
   └── CloudTTSProvider       ← future (Gemini / ElevenLabs / etc.)
```

The `VoiceQueue` class in `app/page.tsx` handles:
- FIFO queue (no overlapping speech)
- Duplicate announcement prevention
- Error handling with fallback
- Speaking state for UI feedback

---

## Webhook Authentication

Incoming webhooks require an API key header:

```http
POST /api/webhooks/orders
x-api-key: your-kitchen-api-key
Content-Type: application/json
```

For HMAC signature validation, send:
```http
X-Signature: sha256=<hmac-sha256-of-body>
```

---

## Customer Status Callback

When kitchen staff updates an order status, the system POSTs to `CUSTOMER_STATUS_WEBHOOK_URL`:

```json
{
  "restaurantId": "REST-001",
  "externalOrderId": "AO-506333",
  "orderId": "internal-uuid",
  "status": "PREPARING",
  "updatedAt": "2026-10-08T13:30:00Z"
}
```

Headers sent:
```
X-Kitchen-Signature: sha256=<hmac-signature>
X-Kitchen-Restaurant: REST-001
```

Retry policy: up to 3 attempts with exponential backoff (1s, 2s, 4s).

---

## API Endpoints

### Health
```bash
curl http://localhost:3000/api/health
```

### Incoming Order Webhook
```bash
curl -X POST http://localhost:3000/api/webhooks/orders \
  -H "Content-Type: application/json" \
  -H "x-api-key: kitchen-api-key-change-in-production" \
  -d '{
    "restaurantId": "REST-001",
    "externalOrderId": "AO-506333",
    "tableNo": 6,
    "items": [
      { "name": "Chicken Biryani", "quantity": 2 },
      { "name": "Coke", "quantity": 1 }
    ],
    "createdAt": "2026-10-08T13:20:00Z"
  }'
```

### List Orders
```bash
curl http://localhost:3000/api/orders \
  -H "x-api-key: kitchen-api-key-change-in-production"
```

### Update Order Status
```bash
curl -X PATCH http://localhost:3000/api/orders/<orderId>/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "PREPARING" }'
```

### Order History
```bash
curl http://localhost:3000/api/orders/<orderId>/history
```

### Test Voice
```bash
curl -X POST http://localhost:3000/api/voice/test
```

### DEV: Simulate Test Order
```bash
curl http://localhost:3000/api/dev/test-order
```
Or click the **⚠ DEV — Simulate New Order** button in the kitchen UI.

---

## Production Deployment

1. Set `NODE_ENV=production` — this disables the DEV test-order endpoint
2. Use a strong `KITCHEN_API_KEY` and `WEBHOOK_SECRET`
3. Set `CUSTOMER_STATUS_WEBHOOK_URL` to your live customer system
4. Deploy to Vercel, Railway, or any Node.js host
5. Use HTTPS — the system is designed HTTPS-ready

---

## Security Notes

- No secrets are ever logged or exposed to the frontend
- Restaurant isolation: every query scoped to `restaurantId`
- API key validated with `crypto.timingSafeEqual` (timing-safe)
- HMAC-SHA256 for outgoing callbacks
- Customer system treated as untrusted external third party
