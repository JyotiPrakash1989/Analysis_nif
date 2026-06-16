/**
 * Small backend to fetch live NIFTY from mStock (avoids CORS and keeps API key server-side).
 * Set MSTOCK_API_KEY in .env or environment. Run: node server.js (port 3001).
 */

const http = require('http');

const MSTOCK_BASE = 'https://api.mstock.trade';
const QUOTE_PATH = '/openapi/typeb/instruments/quote';
const HISTORICAL_PATH = '/openapi/typeb/instruments/historical';
const MIRAE_VERSION = '1';
const NIFTY_TOKEN = '999260';

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 2);
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())} 09:15`;
  const toStr = `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())} 15:30`;
  return { fromStr, toStr };
}

async function getNiftyQuote(apiKey) {
  const url = new URL(QUOTE_PATH, MSTOCK_BASE);
  for (const mode of ['LTP', 'OHLC']) {
    try {
      const body = JSON.stringify({
        mode,
        exchangeTokens: { NSE: [NIFTY_TOKEN] },
      });
      const opt = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'GET',
        headers: {
          'X-Mirae-Version': MIRAE_VERSION,
          'Authorization': `Bearer ${apiKey}`,
          'X-PrivateKey': apiKey,
          'Content-Type': 'application/json',
        },
      };
      if (url.protocol === 'https:') {
        const https = require('https');
        const res = await new Promise((resolve, reject) => {
          const r = https.request({ ...opt, port: 443 }, (resp) => {
            let data = '';
            resp.on('data', (c) => { data += c; });
            resp.on('end', () => {
              try {
                resolve({ statusCode: resp.statusCode, body: data ? JSON.parse(data) : null });
              } catch {
                resolve({ statusCode: resp.statusCode, body: null });
              }
            });
          });
          r.on('error', reject);
          r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
          r.write(body);
          r.end();
        });
        if (res.statusCode !== 200 || !res.body) continue;
        const status = res.body.status;
        if (status !== true && status !== 'true') continue;
        const data = res.body.data;
        if (!data || !Array.isArray(data.fetched) || data.fetched.length === 0) continue;
        const first = data.fetched[0];
        const ltp = first.ltp;
        const close = first.close;
        const n = typeof ltp === 'number' ? ltp : (typeof close === 'number' ? close : null);
        if (n != null) return { value: n, error: null };
      }
    } catch (_) {
      continue;
    }
  }
  return { value: null, error: 'Quote API failed (check API key or network)' };
}

async function getNiftyFromLastCandle(apiKey) {
  const { fromStr, toStr } = dateRange();
  const url = new URL(HISTORICAL_PATH, MSTOCK_BASE);
  const body = JSON.stringify({
    exchange: 'NSE',
    symboltoken: NIFTY_TOKEN,
    interval: 'ONE_MINUTE',
    fromdate: fromStr,
    todate: toStr,
  });
  const https = require('https');
  const opt = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'GET',
    headers: {
      'X-Mirae-Version': MIRAE_VERSION,
      'Authorization': `Bearer ${apiKey}`,
      'X-PrivateKey': apiKey,
      'Content-Type': 'application/json',
    },
  };
  return new Promise((resolve, reject) => {
    const r = https.request(opt, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode !== 200 || !parsed?.data?.candles?.length) {
            resolve(null);
            return;
          }
          const candles = parsed.data.candles;
          const last = candles[candles.length - 1];
          if (Array.isArray(last) && last.length >= 5 && typeof last[4] === 'number') {
            resolve(last[4]);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    r.on('error', () => resolve(null));
    r.setTimeout(15000, () => { r.destroy(); resolve(null); });
    r.write(body);
    r.end();
  });
}

const PORT = process.env.PORT || 3001;

async function loadEnv() {
  try {
    const path = require('path');
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      });
    }
  } catch (_) {}
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/api/nifty' || req.url === '/api/nifty/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const apiKey = process.env.MSTOCK_API_KEY || '';
    if (!apiKey) {
      res.statusCode = 200;
      res.end(JSON.stringify({
        ltp: null,
        fromLastCandle: false,
        error: 'MSTOCK_API_KEY not set. Add it to lib/create_option/.env',
      }));
      return;
    }
    try {
      const quote = await getNiftyQuote(apiKey);
      if (quote.value != null) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          ltp: quote.value,
          fromLastCandle: false,
          error: '',
        }));
        return;
      }
      const fromCandle = await getNiftyFromLastCandle(apiKey);
      if (fromCandle != null) {
        res.statusCode = 200;
        res.end(JSON.stringify({
          ltp: fromCandle,
          fromLastCandle: true,
          error: '',
        }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({
        ltp: null,
        fromLastCandle: false,
        error: quote.error || 'Unable to fetch live NIFTY',
      }));
    } catch (e) {
      res.statusCode = 200;
      res.end(JSON.stringify({
        ltp: null,
        fromLastCandle: false,
        error: e.message || 'Server error',
      }));
    }
    return;
  }
  if (req.method === 'OPTIONS' && req.url.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }
  res.statusCode = 404;
  res.end('Not found');
});

loadEnv().then(() => {
  const apiKey = process.env.MSTOCK_API_KEY || '';
  const appName = process.env.MSTOCK_APP_NAME || 'JPAPP';
  server.listen(PORT, () => {
    console.log(`Create Option API server at http://localhost:${PORT}`);
    console.log(`GET /api/nifty → live NIFTY (mStock Type B, ${appName})`);
    if (!apiKey) console.log('Warning: MSTOCK_API_KEY not set in .env');
  });
});
