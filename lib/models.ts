import mongoose, { Schema, Document, Model } from 'mongoose';

// ─── Restaurant ──────────────────────────────────────────────────────────────
export interface IRestaurant extends Document {
  restaurantId: string;
  name: string;
  active: boolean;
  webhookSecret: string;
  createdAt: Date;
  updatedAt: Date;
}

const RestaurantSchema = new Schema<IRestaurant>(
  {
    restaurantId: { type: String, required: true, unique: true, index: true },
    name:         { type: String, required: true },
    active:       { type: Boolean, default: true },
    webhookSecret:{ type: String, required: true },
  },
  { timestamps: true }
);

export const Restaurant: Model<IRestaurant> =
  mongoose.models.Restaurant ?? mongoose.model<IRestaurant>('Restaurant', RestaurantSchema);

// ─── Kitchen Device ───────────────────────────────────────────────────────────
export interface IKitchenDevice extends Document {
  deviceId: string;
  restaurantId: string;
  name: string;
  active: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KitchenDeviceSchema = new Schema<IKitchenDevice>(
  {
    deviceId:     { type: String, required: true, unique: true, index: true },
    restaurantId: { type: String, required: true, index: true },
    name:         { type: String, required: true },
    active:       { type: Boolean, default: true },
    lastSeen:     { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const KitchenDevice: Model<IKitchenDevice> =
  mongoose.models.KitchenDevice ?? mongoose.model<IKitchenDevice>('KitchenDevice', KitchenDeviceSchema);

// ─── Order Item ───────────────────────────────────────────────────────────────
export interface IOrderItem {
  name: string;
  quantity: number;
}

// ─── Kitchen Order ────────────────────────────────────────────────────────────
export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export interface IKitchenOrder extends Document {
  orderId: string;           // internal UUID
  externalOrderId: string;   // from customer system
  restaurantId: string;
  tableNo: number;
  items: IOrderItem[];
  status: OrderStatus;
  acknowledgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KitchenOrderSchema = new Schema<IKitchenOrder>(
  {
    orderId:         { type: String, required: true, unique: true, index: true },
    externalOrderId: { type: String, required: true, unique: true, index: true },
    restaurantId:    { type: String, required: true, index: true },
    tableNo:         { type: Number, required: true },
    items:           [{ name: { type: String, required: true }, quantity: { type: Number, required: true } }],
    status:          { type: String, enum: ['RECEIVED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'], default: 'RECEIVED' },
    acknowledgedAt:  { type: Date },
  },
  { timestamps: true }
);

KitchenOrderSchema.index({ restaurantId: 1, status: 1 });
KitchenOrderSchema.index({ restaurantId: 1, createdAt: -1 });

export const KitchenOrder: Model<IKitchenOrder> =
  mongoose.models.KitchenOrder ?? mongoose.model<IKitchenOrder>('KitchenOrder', KitchenOrderSchema);

// ─── Status History ───────────────────────────────────────────────────────────
export interface IStatusHistory extends Document {
  orderId: string;
  externalOrderId: string;
  restaurantId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string;
  createdAt: Date;
}

const StatusHistorySchema = new Schema<IStatusHistory>(
  {
    orderId:         { type: String, required: true, index: true },
    externalOrderId: { type: String, required: true },
    restaurantId:    { type: String, required: true },
    fromStatus:      { type: String, default: null },
    toStatus:        { type: String, required: true },
    changedBy:       { type: String, default: 'kitchen' },
  },
  { timestamps: true }
);

export const StatusHistory: Model<IStatusHistory> =
  mongoose.models.StatusHistory ?? mongoose.model<IStatusHistory>('StatusHistory', StatusHistorySchema);

// ─── Voice Announcement ───────────────────────────────────────────────────────
export interface IVoiceAnnouncement extends Document {
  orderId: string;
  externalOrderId: string;
  restaurantId: string;
  text: string;
  status: 'queued' | 'speaking' | 'completed' | 'failed';
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const VoiceAnnouncementSchema = new Schema<IVoiceAnnouncement>(
  {
    orderId:         { type: String, required: true },
    externalOrderId: { type: String, required: true },
    restaurantId:    { type: String, required: true },
    text:            { type: String, required: true },
    status:          { type: String, enum: ['queued', 'speaking', 'completed', 'failed'], default: 'queued' },
    attempts:        { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const VoiceAnnouncement: Model<IVoiceAnnouncement> =
  mongoose.models.VoiceAnnouncement ??
  mongoose.model<IVoiceAnnouncement>('VoiceAnnouncement', VoiceAnnouncementSchema);

// ─── Webhook Event (idempotency) ───────────────────────────────────────────────
export interface IWebhookEvent extends Document {
  eventId: string;
  externalOrderId: string;
  restaurantId: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processedAt?: Date;
  createdAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId:         { type: String, required: true, unique: true, index: true },
    externalOrderId: { type: String, required: true, index: true },
    restaurantId:    { type: String, required: true },
    payload:         { type: Schema.Types.Mixed },
    processed:       { type: Boolean, default: false },
    processedAt:     { type: Date },
  },
  { timestamps: true }
);

export const WebhookEvent: Model<IWebhookEvent> =
  mongoose.models.WebhookEvent ?? mongoose.model<IWebhookEvent>('WebhookEvent', WebhookEventSchema);

// ─── Status Webhook Event (outgoing callbacks) ────────────────────────────────
export interface IStatusWebhookEvent extends Document {
  orderId: string;
  externalOrderId: string;
  restaurantId: string;
  status: OrderStatus;
  callbackUrl: string;
  success: boolean;
  attempts: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StatusWebhookEventSchema = new Schema<IStatusWebhookEvent>(
  {
    orderId:         { type: String, required: true },
    externalOrderId: { type: String, required: true },
    restaurantId:    { type: String, required: true },
    status:          { type: String, required: true },
    callbackUrl:     { type: String, required: true },
    success:         { type: Boolean, default: false },
    attempts:        { type: Number, default: 0 },
    lastError:       { type: String },
  },
  { timestamps: true }
);

export const StatusWebhookEvent: Model<IStatusWebhookEvent> =
  mongoose.models.StatusWebhookEvent ??
  mongoose.model<IStatusWebhookEvent>('StatusWebhookEvent', StatusWebhookEventSchema);
