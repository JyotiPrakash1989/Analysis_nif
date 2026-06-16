import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { istDayKey } from '../lib/istDay';
import type { OrderLogEntry, SignalPayload, TickPayload } from '../types/niftyoptima';

const socketUrl = (import.meta.env.VITE_NIFTYOPTIMA_API as string | undefined) || undefined;

type SocketExtras = {
  onOrderLog?: (row: OrderLogEntry) => void;
};

export function useNiftySocket(extras: SocketExtras = {}) {
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState<TickPayload | null>(null);
  const [signal, setSignal] = useState<SignalPayload | null>(null);
  const [feedStatus, setFeedStatus] = useState<{
    connected?: boolean;
    reason?: string;
    source?: string;
    phase?: string;
  } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const onOrderLogRef = useRef(extras.onOrderLog);
  onOrderLogRef.current = extras.onOrderLog;

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    const opts = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
    };
    const s = socketUrl ? io(socketUrl, opts) : io(opts);
    socketRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('tick', (p: TickPayload) => {
      setTick(p);
      const today = istDayKey();
      const meta = p.dailyBestBuy;
      const dayKey = meta?.dayKey ?? '';
      if (!dayKey || dayKey !== today) {
        setSignal(null);
        return;
      }
      if (meta?.suppressedByPosition || meta?.hasOpenPosition) {
        setSignal(null);
        return;
      }
      setSignal(meta.signal?.dailyPick ? meta.signal : null);
    });
    s.on('signal', (sig: SignalPayload) => {
      if (!sig.dailyPick) return;
      if (istDayKey(new Date(sig.ts)) !== istDayKey()) return;
      setSignal(sig);
    });
    s.on('orderLog', (row: OrderLogEntry) => onOrderLogRef.current?.(row));
    s.on('equityOrderLog', (row: OrderLogEntry) => onOrderLogRef.current?.(row));
    s.on('feedStatus', (st) => setFeedStatus(st));
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return { connected, tick, signal, feedStatus };
}
