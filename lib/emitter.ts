import { EventEmitter } from 'events';

// Server-side global SSE event emitter (singleton across hot-reloads in dev)
declare global {
  // eslint-disable-next-line no-var
  var __kitchenEmitter: EventEmitter | undefined;
}

export const kitchenEmitter: EventEmitter =
  global.__kitchenEmitter ?? new EventEmitter();

if (!global.__kitchenEmitter) {
  global.__kitchenEmitter = kitchenEmitter;
  kitchenEmitter.setMaxListeners(100);
}

export type KitchenEventType =
  | 'order.created'
  | 'order.updated'
  | 'order.status_changed'
  | 'voice.started'
  | 'voice.finished'
  | 'device.connected'
  | 'device.disconnected';

export interface KitchenEvent {
  type: KitchenEventType;
  restaurantId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export function emitKitchenEvent(event: KitchenEvent) {
  kitchenEmitter.emit(`restaurant:${event.restaurantId}`, event);
}
