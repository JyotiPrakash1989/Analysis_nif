/**
 * mStock Type B API – live NIFTY 50 quote.
 * Same as Flutter: quote API first, then last candle as fallback.
 * Docs: https://tradingapi.mstock.com/docs/v1/typeB/
 * Set VITE_MSTOCK_API_KEY (and optionally VITE_MSTOCK_JWT_TOKEN) in .env.
 * If browser CORS blocks, use a backend proxy and set VITE_MSTOCK_API_URL to the proxy base.
 */

const MIRAE_VERSION = '1';
// Use backend proxy (server/proxy.js) when set – avoids CORS; proxy adds API key server-side
const PROXY_URL = import.meta.env.VITE_MSTOCK_API_URL ?? '';
const USE_PROXY = PROXY_URL.length > 0;
const BASE_URL = USE_PROXY ? PROXY_URL.replace(/\/$/, '') : '';
const QUOTE_PATH = USE_PROXY ? '/api/quote' : '/api/mstock/quote';
const HISTORICAL_PATH = USE_PROXY ? '/api/historical' : '/api/mstock/historical';

function getApiKey(): string {
  return import.meta.env.VITE_MSTOCK_API_KEY ?? '';
}

function getJwtToken(): string {
  return import.meta.env.VITE_MSTOCK_JWT_TOKEN ?? '';
}

function getAuthBearer(): string {
  const jwt = getJwtToken();
  return jwt.length > 0 ? jwt : getApiKey();
}

function getHeaders(includeAuth: boolean): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    h['X-Mirae-Version'] = MIRAE_VERSION;
    h['Authorization'] = `Bearer ${getAuthBearer()}`;
    h['X-PrivateKey'] = getApiKey();
  }
  return h;
}

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type LiveNiftyResult = {
  ltp: number | null;
  fromLastCandle: boolean;
  error: string;
};

/**
 * Fetches live NIFTY 50 LTP. Tries quote API first, then last candle close as fallback.
 */
export async function getLiveNiftyLtp(): Promise<LiveNiftyResult> {
  if (!USE_PROXY) {
    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        ltp: null,
        fromLastCandle: false,
        error: 'Add VITE_MSTOCK_API_URL=http://localhost:3100 to .env and run npm start',
      };
    }
  }

  const headers = getHeaders(!USE_PROXY);

  const quoteUrl = `${BASE_URL}${QUOTE_PATH}`;
  const bodyLtp = JSON.stringify({
    mode: 'LTP',
    exchangeTokens: { NSE: ['999260'] },
  });

  let lastError = '';

  // Try POST then GET with body (mStock docs: GET with JSON body)
  for (const method of ['POST', 'GET']) {
    try {
      const res = await fetch(quoteUrl, {
        method,
        headers,
        body: bodyLtp,
      });
      if (res.status === 401) {
        lastError =
          getJwtToken().length > 0
            ? 'JWT expired. Log in again at trade.mstock.com.'
            : 'Set VITE_MSTOCK_JWT_TOKEN in .env (login at trade.mstock.com).';
      } else if (res.status !== 200) {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text) as { message?: string };
          if (j?.message) errMsg = j.message;
        } catch {
          if (text) errMsg = text.slice(0, 200);
        }
        lastError = errMsg;
      } else {
        const decoded = (await res.json()) as {
          status?: boolean | string;
          data?: { fetched?: Array<{ ltp?: number; close?: number }> };
        };
        if (decoded?.status !== true && decoded?.status !== 'true') {
          lastError = (decoded as { message?: string }).message ?? 'Quote API error';
        } else {
          const fetched = decoded?.data?.fetched;
          if (Array.isArray(fetched) && fetched.length > 0) {
            const first = fetched[0];
            const n = first?.ltp ?? first?.close;
            if (typeof n === 'number') {
              return { ltp: n, fromLastCandle: false, error: '' };
            }
          }
          lastError = 'No LTP in response';
        }
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (lastError.toLowerCase().includes('failed') || lastError.toLowerCase().includes('network') || lastError.toLowerCase().includes('cors')) {
        lastError = 'Network error. Restart dev server (npm start) so proxy is active.';
      }
    }
  }

  // Retry with OHLC mode
  const ohlcBody = JSON.stringify({
    mode: 'OHLC',
    exchangeTokens: { NSE: ['999260'] },
  });
  try {
    const res = await fetch(quoteUrl, { method: 'POST', headers, body: ohlcBody });
    if (res.status === 200) {
      const decoded = (await res.json()) as {
        data?: { fetched?: Array<{ ltp?: number; close?: number }> };
      };
      const fetched = decoded?.data?.fetched;
      if (Array.isArray(fetched) && fetched.length > 0) {
        const first = fetched[0];
        const n = first?.ltp ?? first?.close;
        if (typeof n === 'number') {
          return { ltp: n, fromLastCandle: false, error: '' };
        }
      }
    }
  } catch {
    // keep lastError from LTP attempt
  }

  // Fallback: last candle close from historical
  try {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 2);
    const fromStr = `${dateStr(from)} 09:15`;
    const toStr = `${dateStr(to)} 15:30`;
    const histUrl = `${BASE_URL}${HISTORICAL_PATH}`;
    const histBody = JSON.stringify({
      exchange: 'NSE',
      symboltoken: '999260',
      interval: 'ONE_MINUTE',
      fromdate: fromStr,
      todate: toStr,
    });
    const res = await fetch(histUrl, {
      method: 'POST',
      headers,
      body: histBody,
    });
    if (res.status === 200) {
      const json = (await res.json()) as { data?: { candles?: unknown[] } };
      const candles = json?.data?.candles;
      if (Array.isArray(candles) && candles.length > 0) {
        const last = candles[candles.length - 1];
        const arr = Array.isArray(last) ? last : [];
        const close = arr[4]; // [timestamp, open, high, low, close, volume]
        if (typeof close === 'number') {
          return { ltp: close, fromLastCandle: true, error: '' };
        }
      }
    }
  } catch {
    // keep lastError from quote
  }

  return {
    ltp: null,
    fromLastCandle: false,
    error: lastError || 'Unable to fetch live NIFTY',
  };
}
