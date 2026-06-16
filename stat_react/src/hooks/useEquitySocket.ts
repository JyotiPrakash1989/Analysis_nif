import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { EquitySignalPayload } from '../types/equityStrategy';

const socketUrl = (import.meta.env.VITE_NIFTYOPTIMA_API as string | undefined) || undefined;

export type EquityOrderLogEntry = {
  id?: string;
  ts: number;
  assetType?: string;
  equitySymbol?: string;
  action: 'BUY' | 'SELL' | 'UPDATE';
  mode?: 'auto' | 'manual';
  trigger?: string;
  entry?: number;
  sl?: number;
  tgt?: number;
  exitPrice?: number;
  ltp?: number;
  status?: string;
  units?: number;
  orderId?: string;
  parentBuyId?: string;
  message?: string;
};

type Options = {
  onSignal?: (sig: EquitySignalPayload) => void;
  onOrderLog?: (row: EquityOrderLogEntry) => void;
};

export function useEquitySocket(options: Options = {}) {
  const [connected, setConnected] = useState(false);
  const [lastSignal, setLastSignal] = useState<EquitySignalPayload | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const onSignalRef = useRef(options.onSignal);
  const onOrderLogRef = useRef(options.onOrderLog);
  onSignalRef.current = options.onSignal;
  onOrderLogRef.current = options.onOrderLog;

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    const opts = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
    };
    const s = socketUrl ? io(socketUrl, opts) : io(opts);
    socketRef.current = s;
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('equitySignal', (sig: EquitySignalPayload) => {
      setLastSignal(sig);
      onSignalRef.current?.(sig);
    });
    s.on('equityOrderLog', (row: EquityOrderLogEntry) => {
      onOrderLogRef.current?.(row);
    });
  }, []);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return { connected, lastSignal };
}
