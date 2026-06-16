/**
 * Separate intraday suggestion history per IST day — NIFTY options vs equity.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calculateLevels } from './analysis.mjs';
import { istDayKey } from './orderLog.mjs';

function levelsFromEntry(entry) {
  const e = Math.round(Number(entry) * 100) / 100;
  if (!Number.isFinite(e) || e <= 0) return null;
  return calculateLevels(e, e * 0.9);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'data', 'suggestion-logs');

function ensureDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logPath(kind, dayKey) {
  const prefix = kind === 'equity' ? 'equity' : 'nifty';
  return path.join(LOG_DIR, `${prefix}-${dayKey}.jsonl`);
}

function readKindLogs(kind, dayKey = istDayKey()) {
  const p = logPath(kind, dayKey);
  if (!fs.existsSync(p)) return [];
  const rows = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      /* skip */
    }
  }
  return rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

function appendKindLog(kind, entry, dedupeKey) {
  ensureDir();
  const dayKey = String(entry.dayKey || istDayKey());
  const existing = readKindLogs(kind, dayKey);
  if (dedupeKey && existing.some((r) => r.dedupeKey === dedupeKey)) {
    return existing.find((r) => r.dedupeKey === dedupeKey) ?? null;
  }
  const row = {
    id: entry.id || `sug-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: entry.ts ?? Date.now(),
    dayKey,
    dedupeKey: dedupeKey || entry.id || null,
    ...entry,
  };
  fs.appendFileSync(logPath(kind, dayKey), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/** @param {object} signal NIFTY CE/PE signal payload */
export function appendNiftySuggestion(signal, { dedupeKey, status = 'active' } = {}) {
  if (!signal) return null;
  const dayKey = String(signal.dayKey || istDayKey());
  const entry = Math.round(Number(signal.entry) * 100) / 100;
  const derived = levelsFromEntry(entry);
  return appendKindLog(
    'nifty',
    {
      dayKey,
      assetType: 'nifty',
      status,
      side: signal.side,
      optionType: signal.optionType,
      strike: signal.strike,
      entry,
      sl: derived?.sl ?? signal.sl,
      tgt: derived?.tgt ?? signal.tgt,
      risk: derived?.risk ?? signal.risk,
      confidence: signal.confidence ?? null,
      signalIndex: signal.signalIndex ?? null,
      rationale: signal.rationale,
      ts: signal.ts ?? Date.now(),
    },
    dedupeKey
  );
}

/** True if this symbol was already logged today (one row per symbol per IST day). */
export function hasEquitySuggestionForSymbol(symbol, dayKey = istDayKey()) {
  const sym = String(symbol || '').toUpperCase();
  if (!sym) return false;
  const key = String(dayKey || istDayKey());
  return readKindLogs('equity', key).some((r) => String(r.symbol || '').toUpperCase() === sym);
}

/** @param {object} payload equity purchase suggestion */
export function appendEquitySuggestion(payload) {
  if (!payload?.symbol) return null;
  const sym = String(payload.symbol).toUpperCase();
  const dayKey = String(payload.dayKey || istDayKey());
  const dedupeKey = payload.dedupeKey || `${dayKey}-${sym}`;
  return appendKindLog(
    'equity',
    {
      dayKey,
      assetType: 'equity',
      symbol: sym,
      entry: payload.entry,
      sl: payload.sl,
      tgt: payload.tgt,
      confidence: payload.confidence,
      ltp: payload.ltp,
      rationale: payload.rationale,
      ts: payload.ts ?? Date.now(),
    },
    dedupeKey
  );
}

export function readNiftySuggestions(dayKey = istDayKey()) {
  return readKindLogs('nifty', dayKey);
}

export function readEquitySuggestions(dayKey = istDayKey()) {
  return readKindLogs('equity', dayKey);
}

export function clearNiftySuggestions(dayKey = istDayKey()) {
  const p = logPath('nifty', dayKey);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { dayKey, cleared: true };
}

export function clearEquitySuggestions(dayKey = istDayKey()) {
  const p = logPath('equity', dayKey);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { dayKey, cleared: true };
}
