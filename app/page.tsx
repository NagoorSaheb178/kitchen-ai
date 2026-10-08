'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { OrderStatus } from '@/lib/models';

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderItem { name: string; quantity: number; }
interface KitchenOrder {
  orderId: string;
  externalOrderId: string;
  restaurantId: string;
  tableNo: number;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}
interface Announcement { text: string; orderId: string; tableNo: number; time: string; }

type FilterTab = 'all' | 'new' | 'preparing' | 'ready' | 'served';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  RECEIVED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SERVED',
};
const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  RECEIVED: 'Start Preparing',
  PREPARING: 'Mark Ready',
  READY: 'Mark Served',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function numberWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[n] ?? String(n);
}

function buildAnnouncementText(tableNo: number, items: OrderItem[]): string {
  const parts = items.map(i => `${numberWord(i.quantity)} ${i.name}`);
  const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1);
  return `New order. Table ${tableNo}. ${list}.`;
}

// ─── Voice Service (BrowserSpeechProvider) ───────────────────────────────────
class VoiceQueue {
  private queue: { text: string; id: string }[] = [];
  private speaking = false;
  private announced = new Set<string>();

  onStateChange?: (speaking: boolean, text: string | null) => void;

  enqueue(text: string, id: string) {
    if (this.announced.has(id)) return; // duplicate prevention
    this.queue.push({ text, id });
    this.processNext();
  }

  private processNext() {
    if (this.speaking || this.queue.length === 0) return;
    const item = this.queue.shift()!;
    this.speaking = true;
    this.announced.add(item.id);
    this.onStateChange?.(true, item.text);
    this.speak(item.text, () => {
      this.speaking = false;
      this.onStateChange?.(false, null);
      this.processNext();
    });
  }

  private speak(text: string, onEnd: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setTimeout(onEnd, 2000);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1;
    u.onend = onEnd;
    u.onerror = onEnd;
    window.speechSynthesis.speak(u);
  }

  get queueLength() { return this.queue.length; }
  get isSpeaking() { return this.speaking; }
}

// ─── Order Card Component ─────────────────────────────────────────────────────
function OrderCard({
  order,
  onAdvance,
  isNew,
}: {
  order: KitchenOrder;
  onAdvance: (id: string, status: OrderStatus) => void;
  isNew: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const nextStatus = NEXT_STATUS[order.status];
  const actionLabel = ACTION_LABEL[order.status];

  const statusClass: Record<OrderStatus, string> = {
    RECEIVED: 'status-received',
    PREPARING: 'status-preparing',
    READY: 'status-ready',
    SERVED: 'status-served',
    CANCELLED: 'status-cancelled',
  };

  const handleAction = async () => {
    if (!nextStatus) return;
    setLoading(true);
    await onAdvance(order.orderId, nextStatus);
    setLoading(false);
  };

  return (
    <article className={`order-card p-4 sm:p-5 ${isNew ? 'is-new order-new-enter' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold tracking-[.08em]" style={{ color: 'var(--ink)' }}>
              TABLE {order.tableNo}
            </p>
            {(order.status === 'RECEIVED') && (
              <span className="status-pill status-received text-[10px]">NEW</span>
            )}
          </div>
          <p className="mt-1 text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Order #{order.externalOrderId}
          </p>
        </div>
        <div className="text-right">
          <span className={`status-pill ${statusClass[order.status]}`}>{order.status}</span>
          <p className="mt-2 text-xs" style={{ color: '#85867e' }}>
            Received {formatRelativeTime(order.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t pt-3 hairline">
        <p className="text-[11px] font-bold uppercase tracking-[.12em] mb-2" style={{ color: 'var(--muted)' }}>
          Items ({order.items.reduce((acc, it) => acc + (it.quantity || 1), 0)})
        </p>
        <ul className="space-y-2">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: i < order.items.length - 1 ? '1px dashed var(--line)' : 'none' }}>
              <div className="flex items-center">
                <span className="order-item-badge">{item.quantity}x</span>
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>{item.name}</span>
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Qty {item.quantity}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {nextStatus && actionLabel && (
        <div className="mt-5 flex justify-end">
          <button
            id={`action-${order.orderId}`}
            type="button"
            onClick={handleAction}
            disabled={loading}
            className="action-btn"
          >
            {loading ? 'Updating…' : actionLabel}
          </button>
        </div>
      )}
    </article>
  );
}

// ─── Main Kitchen Dashboard ───────────────────────────────────────────────────
export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechText, setSpeechText] = useState('Waiting for the next kitchen announcement.');
  const [activeSpeechTable, setActiveSpeechTable] = useState('—');
  const [activeSpeechOrder, setActiveSpeechOrder] = useState('—');
  const [voiceQueue, setVoiceQueue] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [now, setNow] = useState('');
  const [loadingState, setLoadingState] = useState(true);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());

  const voiceRef = useRef<VoiceQueue>(new VoiceQueue());
  const sseRef = useRef<EventSource | null>(null);

  const restaurantId = 'REST-001';

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const announcedOrdersRef = useRef<Set<string>>(new Set());

  // ── Load existing orders from DB & Auto-Announce New Bookings ─────────────
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        const incomingOrders: KitchenOrder[] = data.orders ?? [];
        setOrders(incomingOrders);

        // Instantly announce newly booked customer orders
        incomingOrders.forEach(o => {
          if (o.status === 'RECEIVED' && !announcedOrdersRef.current.has(o.orderId)) {
            announcedOrdersRef.current.add(o.orderId);
            const text = buildAnnouncementText(o.tableNo, o.items);
            voiceRef.current.enqueue(text, o.orderId);
            setAnnouncements(prev => [
              {
                text,
                orderId: o.orderId,
                tableNo: o.tableNo,
                time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
              },
              ...prev.slice(0, 3),
            ]);
          }
        });
      }
    } catch { /* ignore — SSE will keep us updated */ }
    setLoadingState(false);
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 2000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // ── Voice queue state wiring ─────────────────────────────────────────────
  useEffect(() => {
    const vq = voiceRef.current;
    vq.onStateChange = (isSpeaking: boolean, text: string | null) => {
      setSpeaking(isSpeaking);
      setVoiceQueue(vq.queueLength);
      if (isSpeaking && text) {
        setSpeechText(text);
        // Extract table number from text "New order. Table X."
        const match = text.match(/Table (\d+)/i);
        if (match) setActiveSpeechTable(`TABLE ${match[1]}`);
        setActiveSpeechOrder('—');
      } else {
        setSpeechText('Waiting for the next kitchen announcement.');
        setActiveSpeechTable('—');
        setActiveSpeechOrder('—');
      }
    };
  }, []);

  // ── SSE subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    const connectSSE = () => {
      const url = `/api/realtime/events?restaurantId=${restaurantId}`;
      const es = new EventSource(url);
      sseRef.current = es;

      es.onopen = () => setConnected(true);
      es.onerror = () => { setConnected(false); es.close(); setTimeout(connectSSE, 3000); };

      es.onmessage = (evt) => {
        if (!evt.data || evt.data.startsWith(':')) return;
        try {
          const event = JSON.parse(evt.data);
          handleKitchenEvent(event);
        } catch { /* ignore parse errors */ }
      };
    };

    connectSSE();
    return () => { sseRef.current?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle realtime events ────────────────────────────────────────────────
  const handleKitchenEvent = useCallback((event: {
    type: string;
    payload: Record<string, unknown>;
  }) => {
    if (event.type === 'order.created') {
      const p = event.payload as unknown as KitchenOrder & { announcementText?: string };
      setOrders(prev => {
        if (prev.some(o => o.orderId === p.orderId)) return prev;
        return [p, ...prev];
      });
      setNewOrderIds(prev => new Set([...prev, p.orderId]));
      setTimeout(() => setNewOrderIds(prev => { const n = new Set(prev); n.delete(p.orderId); return n; }), 5000);

      // Queue voice announcement
      const text = p.announcementText ?? buildAnnouncementText(p.tableNo, p.items);
      voiceRef.current.enqueue(text, p.orderId);
      setVoiceQueue(voiceRef.current.queueLength + (voiceRef.current.isSpeaking ? 0 : 0));

      // Add to recent announcements
      setAnnouncements(prev => [
        { text, orderId: p.orderId, tableNo: p.tableNo, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }) },
        ...prev.slice(0, 3),
      ]);
    }

    if (event.type === 'order.status_changed') {
      const p = event.payload as { orderId: string; status: OrderStatus };
      setOrders(prev => prev.map(o => o.orderId === p.orderId ? { ...o, status: p.status } : o));
    }

    if (event.type === 'voice.started') {
      const p = event.payload as { text: string };
      voiceRef.current.enqueue(p.text, `test-${Date.now()}`);
      setVoiceQueue(voiceRef.current.queueLength);
    }
  }, []);

  // ── Advance order status ───────────────────────────────────────────────────
  const advanceOrder = useCallback(async (orderId: string, nextStatus: OrderStatus) => {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      setOrders(prev => prev.map(o => o.orderId === orderId ? { ...o, status: data.status } : o));
    }
  }, []);


  // ── Test voice ─────────────────────────────────────────────────────────────
  const testVoice = useCallback(async () => {
    await fetch('/api/voice/test', { method: 'POST' });
    voiceRef.current.enqueue('Kitchen voice system is working.', `voice-test-${Date.now()}`);
    setVoiceQueue(voiceRef.current.queueLength);
  }, []);

  // ── Filtered orders ────────────────────────────────────────────────────────
  const filteredOrders = orders.filter(o => {
    if (filter === 'all') return o.status !== 'SERVED' && o.status !== 'CANCELLED';
    if (filter === 'new') return o.status === 'RECEIVED';
    if (filter === 'preparing') return o.status === 'PREPARING';
    if (filter === 'ready') return o.status === 'READY';
    if (filter === 'served') return o.status === 'SERVED';
    return true;
  });

  const countByStatus = {
    new: orders.filter(o => o.status === 'RECEIVED').length,
    preparing: orders.filter(o => o.status === 'PREPARING').length,
    ready: orders.filter(o => o.status === 'READY').length,
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="w-full border-b hairline" style={{ background: 'var(--panel)' }}>
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-5 px-5 py-5 sm:px-8">
          <div>
            <p className="display-serif text-[1.45rem] leading-none font-semibold tracking-[.03em]" style={{ color: 'var(--ink)', fontSize: '1.2rem' }}>
              SPICE &amp; CO.
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[.16em]" style={{ color: '#6b7065' }}>
              Kitchen
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Kitchen AI</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                {now} &nbsp;·&nbsp; {process.env.NEXT_PUBLIC_KITCHEN_DEVICE_NAME ?? 'KITCHEN-01'}
              </p>
            </div>
            <div className="flex items-center gap-2 border-l hairline pl-5">
              <span className={`connection-dot ${connected ? '' : 'offline'}`} />
              <div>
                <span
                  className="block text-sm font-semibold"
                  style={{ color: connected ? '#4f664f' : '#78786f' }}
                >
                  {connected ? 'Connected' : 'Reconnecting…'}
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--muted)' }}>
                  KITCHEN-01
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(340px,2fr)]">

          {/* ── ORDERS PANEL ─────────────────────────────────────────────── */}
          <section aria-labelledby="orders-heading">

            {/* Header row */}
            <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-5">
              <div>
                <h1 id="orders-heading" className="display-serif font-semibold leading-none" style={{ fontSize: '2rem', color: 'var(--ink)' }}>
                  Orders
                </h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                  Live kitchen order queue
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  id="btn-sync"
                  type="button"
                  onClick={fetchOrders}
                  className="demo-btn inline-flex items-center gap-2"
                  title="Synchronize live orders from MongoDB"
                >
                  <span>↻</span>
                  Sync DB Orders
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <nav aria-label="Order filters" className="mt-0 flex gap-5 border-b hairline">
              {(['all', 'new', 'preparing', 'ready', 'served'] as FilterTab[]).map(tab => (
                <button
                  key={tab}
                  id={`filter-${tab}`}
                  type="button"
                  className={`filter-btn capitalize ${filter === tab ? 'active' : ''}`}
                  onClick={() => setFilter(tab)}
                >
                  {tab}
                  {tab === 'new' && countByStatus.new > 0 && (
                    <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: '#a66a34', color: '#fff' }}>
                      {countByStatus.new}
                    </span>
                  )}
                  {tab === 'preparing' && countByStatus.preparing > 0 && (
                    <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: '#56624d', color: '#fff' }}>
                      {countByStatus.preparing}
                    </span>
                  )}
                  {tab === 'ready' && countByStatus.ready > 0 && (
                    <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ background: '#42654c', color: '#fff' }}>
                      {countByStatus.ready}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Order list */}
            <div
              id="orders-list"
              className="mt-5 space-y-3"
              aria-live="polite"
              aria-label="Kitchen orders"
            >
              {loadingState ? (
                <p className="border hairline rounded-lg p-6 text-center text-sm" style={{ background: 'var(--panel)', color: 'var(--muted)' }}>
                  Loading orders…
                </p>
              ) : filteredOrders.length === 0 ? (
                <p className="border hairline rounded-lg p-6 text-center text-sm" style={{ background: 'var(--panel)', color: 'var(--muted)' }}>
                  No orders in this view.
                </p>
              ) : (
                filteredOrders.map(order => (
                  <OrderCard
                    key={order.orderId}
                    order={order}
                    onAdvance={advanceOrder}
                    isNew={newOrderIds.has(order.orderId)}
                  />
                ))
              )}
            </div>

            <aside className="mt-5 flex items-start gap-3 border-t hairline pt-4">
              <svg className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#66735b' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
              </svg>
              <p className="max-w-2xl text-xs leading-5" style={{ color: 'var(--muted)' }}>
                Kitchen actions sync through the backend. Customer status updates sent via secure callbacks. Real-time via Server-Sent Events.
              </p>
            </aside>
          </section>

          {/* ── VOICE PANEL ────────────────────────────────────────────────── */}
          <aside
            className={`voice-panel p-5 sm:p-6 ${speaking ? 'speaking' : ''}`}
            aria-labelledby="voice-heading"
          >
            <div className="relative z-10 flex h-full flex-col">

              {/* Panel header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[.16em]" style={{ color: '#cbd7bb' }}>Kitchen AI</p>
                  <h2 id="voice-heading" className="mt-1 text-xl font-semibold" style={{ color: '#f8f6ef' }}>AI Voice Assistant</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#d8e1cc' }}>
                  <span className={`connection-dot ${connected ? '' : 'offline'}`} />
                  {connected ? 'Voice system ready' : 'Connecting…'}
                </span>
              </div>

              {/* Visualizer */}
              <div className="my-7 flex flex-col items-center">
                <div className="voice-mark">
                  <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                </div>
                <div className="wave mt-5" aria-hidden="true">
                  {Array.from({ length: 7 }).map((_, i) => <span key={i} />)}
                </div>
                <p className="mt-3 text-sm font-semibold" style={{ color: '#e5ebdb' }}>
                  {speaking ? '● Speaking' : '○ Voice ready'}
                </p>
              </div>

              {/* Now speaking */}
              <section className="voice-card p-4" aria-labelledby="speech-heading">
                <p id="speech-heading" className="text-[10px] font-bold tracking-[.17em]" style={{ color: '#cbd7bb' }}>
                  NOW SPEAKING
                </p>
                <p className="mt-2 font-medium leading-7" style={{ fontSize: '1.06rem', color: '#fbfaf5' }}>
                  {speechText}
                </p>
                <div className="mt-4 flex items-center gap-3 text-xs" style={{ color: '#c9cbbf' }}>
                  <span>{activeSpeechTable}</span>
                  <span className="h-1 w-1 rounded-full" style={{ background: '#9fa997' }} />
                  <span>{activeSpeechOrder}</span>
                </div>
              </section>

              {/* Voice queue */}
              <section className="mt-5" aria-labelledby="queue-heading">
                <div className="mb-2 flex items-center justify-between">
                  <h3 id="queue-heading" className="text-xs font-semibold uppercase tracking-[.12em]" style={{ color: '#cbd7bb' }}>
                    Voice Queue
                  </h3>
                  <span className="text-xs" style={{ color: '#bec5b5' }}>{voiceQueue} waiting</span>
                </div>
                <div id="voice-queue-list" className="overflow-hidden rounded-lg" style={{ border: '1px solid rgba(223,229,214,.34)' }}>
                  {voiceQueue === 0 ? (
                    <p className="px-3 py-3 text-xs" style={{ color: '#bec5b5' }}>No pending announcements</p>
                  ) : (
                    Array.from({ length: voiceQueue }).map((_, i) => (
                      <div key={i} className="queue-row flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="text-sm font-medium" style={{ color: '#e5ebdb' }}>Announcement {i + 1}</span>
                        <span className="text-xs" style={{ color: '#b9c0af' }}>Waiting</span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Speaker & controls */}
              <section className="mt-auto border-t pt-5" style={{ borderColor: 'rgba(255,255,255,.15)' }} aria-labelledby="speaker-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p id="speaker-heading" className="text-xs font-semibold uppercase tracking-[.12em]" style={{ color: '#cbd7bb' }}>
                      Speaker
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                      <span className="connection-dot" />
                      <span style={{ color: '#f8f6ef' }}>Connected</span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: '#c7cabe' }}>Kitchen Speaker 01</p>
                  </div>
                  <button id="btn-test-voice" type="button" onClick={testVoice} className="soft-btn inline-flex items-center gap-2">
                    Test Voice
                  </button>
                </div>

                {/* Recent announcements */}
                <div className="mt-5">
                  <p className="text-[10px] font-bold uppercase tracking-[.16em]" style={{ color: '#aeb8a0' }}>
                    Recent Announcements
                  </p>
                  <div id="announcement-history" className="mt-2 space-y-1.5 text-xs" style={{ color: '#d8dbd1' }}>
                    {announcements.length === 0 ? (
                      <p style={{ color: '#9fa997' }}>No announcements yet</p>
                    ) : (
                      announcements.map((a, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span>{a.time} &nbsp; Table {a.tableNo}</span>
                          <span style={{ color: '#cbd7bb' }}>Announced ✓</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
