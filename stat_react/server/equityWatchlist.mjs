/**
 * Persisted equity watchlist for intraday strategy analysis.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const WATCHLIST_PATH = path.join(DATA_DIR, 'equity-watchlist.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/** @param {string} raw */
export function normalizeSymbol(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\.NS$|\.BO$/i, '')
    .replace(/[^A-Z0-9&-]/g, '');
}

/** @returns {string[]} User-defined stock list only (empty until stocks are added). */
export function readWatchlist() {
  ensureDataDir();
  try {
    if (!fs.existsSync(WATCHLIST_PATH)) {
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf8'));
    const symbols = Array.isArray(raw?.symbols) ? raw.symbols : Array.isArray(raw) ? raw : [];
    return [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  } catch {
    return [];
  }
}

/** @param {string[]} symbols */
export function writeWatchlist(symbols) {
  ensureDataDir();
  const normalized = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  fs.writeFileSync(
    WATCHLIST_PATH,
    JSON.stringify({ symbols: normalized, updatedAt: Date.now() }, null, 2),
    'utf8'
  );
  return normalized;
}

/** @param {string} symbol */
export function addToWatchlist(symbol) {
  const sym = normalizeSymbol(symbol);
  if (!sym) return { ok: false, error: 'Invalid symbol' };
  const list = readWatchlist();
  if (list.includes(sym)) return { ok: true, symbols: list, added: false };
  const next = writeWatchlist([...list, sym]);
  return { ok: true, symbols: next, added: true };
}

/** @param {string} symbol */
export function removeFromWatchlist(symbol) {
  const sym = normalizeSymbol(symbol);
  const next = writeWatchlist(readWatchlist().filter((s) => s !== sym));
  return { ok: true, symbols: next };
}
