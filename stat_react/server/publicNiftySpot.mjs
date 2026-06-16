/**
 * Fallback NIFTY 50 when mStock Type B is unavailable (e.g. expired JWT).
 * Spot + 1m candles from the same Yahoo ^NSEI response so chart and headline match.
 */

const CHART_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1m&range=1d';
const DAILY_CHART_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=5d';

function finite(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/**
 * @param {unknown} r
 * @returns {{ ltp: number | null, bars: { time: number, open: number, high: number, low: number, close: number }[], error: string, note?: string }}
 */
function parseYahooChartResult(r) {
  if (!r) {
    return { ltp: null, bars: [], error: 'Public NIFTY: empty chart result' };
  }
  const meta = r.meta ?? {};
  const timestamps = r.timestamp;
  const q = r?.indicators?.quote?.[0] ?? {};
  const opens = q.open ?? [];
  const highs = q.high ?? [];
  const lows = q.low ?? [];
  const closes = q.close ?? [];

  /** @type {{ time: number, open: number, high: number, low: number, close: number }[]} */
  const bars = [];
  const len = Math.min(
    Array.isArray(timestamps) ? timestamps.length : 0,
    opens.length,
    highs.length,
    lows.length,
    closes.length,
  );
  for (let i = 0; i < len; i++) {
    const ts = timestamps[i];
    const open = finite(opens[i]);
    const high = finite(highs[i]);
    const low = finite(lows[i]);
    const close = finite(closes[i]);
    if (ts == null || open == null || high == null || low == null || close == null) continue;
    bars.push({
      time: ts > 1e12 ? ts : ts * 1000,
      open,
      high,
      low,
      close,
    });
  }

  let ltp = finite(meta.regularMarketPrice) ?? finite(meta.previousClose);
  if (bars.length) {
    const last = bars[bars.length - 1].close;
    ltp = last;
  } else if (Array.isArray(closes)) {
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = finite(closes[i]);
      if (c != null) {
        ltp = c;
        break;
      }
    }
  }

  if (ltp == null) {
    return { ltp: null, bars: [], error: 'Public NIFTY: no price in response' };
  }

  const previousClose =
    finite(meta.chartPreviousClose) ?? finite(meta.previousClose) ?? null;

  return {
    ltp,
    bars,
    previousClose,
    error: '',
    note: 'NIFTY chart + headline from Yahoo ^NSEI (delayed). For broker LTP: npm run mstock:totp',
  };
}

async function fetchYahooChart() {
  const res = await fetch(CHART_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NiftyOptima/1.0; +local dev)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    return { ltp: null, bars: [], error: `Public NIFTY: HTTP ${res.status}` };
  }
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  return parseYahooChartResult(r);
}

/**
 * @returns {Promise<{ ltp: number | null, error: string, note?: string }>}
 */
export async function fetchPublicNiftySpot() {
  try {
    const out = await fetchYahooChart();
    return { ltp: out.ltp, error: out.error, note: out.note };
  } catch (e) {
    return {
      ltp: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Spot and 1m bars from the same Yahoo request (keeps chart aligned with headline).
 * @returns {Promise<{ ltp: number | null, bars: { time: number, open: number, high: number, low: number, close: number }[], error: string, note?: string }>}
 */
export async function fetchPublicNiftyIntraday() {
  try {
    return await fetchYahooChart();
  } catch (e) {
    return {
      ltp: null,
      bars: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function lastNBars(bars, n) {
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  return sorted.slice(-n);
}

/**
 * Last N trading days from Yahoo ^NSEI (delayed).
 * @param {number} [tradingDays]
 */
export async function fetchPublicNiftyDaily(tradingDays = 5) {
  const days = Math.min(10, Math.max(1, Math.floor(tradingDays) || 5));
  try {
    const res = await fetch(DAILY_CHART_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NiftyOptima/1.0; +local dev)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      return { bars: [], error: `Public daily NIFTY: HTTP ${res.status}`, note: '' };
    }
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const out = parseYahooChartResult(r);
    const bars = lastNBars(out.bars, days);
    if (!bars.length) {
      return { bars: [], error: out.error || 'Public daily NIFTY: no bars', note: '' };
    }
    return {
      bars,
      error: '',
      note: 'Last 5 sessions from Yahoo ^NSEI (delayed). For broker data: log in via OTP.',
    };
  } catch (e) {
    return {
      bars: [],
      error: e instanceof Error ? e.message : String(e),
      note: '',
    };
  }
}
