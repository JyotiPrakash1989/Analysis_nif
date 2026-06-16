/**
 * Small proxy so the React app can call mStock Type B API without CORS.
 * Reads API key from .env (MSTOCK_API_KEY). Start with: node server/proxy.js
 * React app should set VITE_MSTOCK_API_URL=http://localhost:3100 in .env
 */
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, '..', '.env');
  if (!existsSync(envPath)) return {};
  const raw = readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

const env = loadEnv();
const API_KEY = env.MSTOCK_API_KEY || env.VITE_MSTOCK_API_KEY || '';
const PORT = Number(env.PROXY_PORT || '3100');
const MSTOCK = 'https://api.mstock.trade';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function forward(path, body, res) {
  const url = `${MSTOCK}${path}`;
  const headers = {
    'X-Mirae-Version': '1',
    'Authorization': `Bearer ${API_KEY}`,
    'X-PrivateKey': API_KEY,
    'Content-Type': 'application/json',
  };
  fetch(url, { method: 'POST', headers, body })
    .then((r) => r.text())
    .then((text) => {
      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(text);
    })
    .catch((e) => {
      res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: false, message: e.message }));
    });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, CORS_HEADERS);
    res.end();
    return;
  }
  if (!API_KEY) {
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: false, message: 'MSTOCK_API_KEY not set in .env' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    if (req.url === '/api/quote' || req.url === '/api/mstock/quote') {
      forward('/openapi/typeb/instruments/quote', body || '{"mode":"LTP","exchangeTokens":{"NSE":["999260"]}}', res);
    } else if (req.url === '/api/historical' || req.url === '/api/mstock/historical') {
      forward('/openapi/typeb/instruments/historical', body, res);
    } else {
      res.writeHead(404, CORS_HEADERS);
      res.end();
    }
  });
});

server.listen(PORT, () => {
  console.log(`[nifty_stat] Proxy running at http://localhost:${PORT} (mStock Type B)`);
});
