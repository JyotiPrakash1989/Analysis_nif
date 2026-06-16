import WebSocket from 'ws';
import { NIFTY_INDEX_TOKEN } from './mstockWsConfig.mjs';
import { parseWsMessage } from './mstockWsParse.mjs';

const NIFTY_TOKENS = (process.env.MSTOCK_NIFTY_TOKEN || '26000,999260')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function subscribePayloads() {
  const tokens = NIFTY_TOKENS.length ? NIFTY_TOKENS : ['26000'];
  const numeric = tokens.map((t) => Number(t)).filter((n) => Number.isFinite(n));
  return [
    { a: 'subscribe', v: numeric.length ? numeric : [26000] },
    { a: 'subscribe', v: tokens },
    {
      action: 1,
      params: {
        mode: 1,
        tokenList: [{ exchangeType: 1, tokens }],
      },
    },
  ];
}

/**
 * mStock web broadcast WebSocket (e.g. wss://wsbcastxoi.mstock.com/ws?token=JWT).
 * @param {string} wsUrl
 * @param {{ onLtp: (ltp: number) => void, onStatus?: (s: object) => void }} handlers
 */
export function startMstockBroadcastWs(wsUrl, handlers) {
  let ws = null;
  let stopped = false;
  let retryMs = 2000;

  const connect = () => {
    if (stopped) return;
    handlers.onStatus?.({ connected: false, source: 'mstock-ws', phase: 'connecting', url: wsUrl.split('?')[0] });

    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      retryMs = 2000;
      handlers.onStatus?.({ connected: true, source: 'mstock-ws', phase: 'open' });
      for (const payload of subscribePayloads()) {
        try {
          ws.send(JSON.stringify(payload));
        } catch {
          /* ignore */
        }
      }
    });

    ws.on('message', (data, isBinary) => {
      const raw = isBinary ? data : data.toString();
      const ltp = parseWsMessage(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)), NIFTY_INDEX_TOKEN);
      if (ltp != null) handlers.onLtp(ltp);
    });

    ws.on('close', () => {
      handlers.onStatus?.({ connected: false, source: 'mstock-ws', phase: 'closed' });
      ws = null;
      if (!stopped) setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 1.5, 30_000);
    });

    ws.on('error', (err) => {
      handlers.onStatus?.({
        connected: false,
        source: 'mstock-ws',
        phase: 'error',
        error: err.message,
      });
    });
  };

  connect();

  return {
    stop() {
      stopped = true;
      ws?.close();
    },
  };
}
