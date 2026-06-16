/**
 * Persistent intraday order log (JSONL per IST day) for audit and Excel export.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { istCalendar } from './analysis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, 'data', 'order-logs');

export function istDayKey(now = new Date()) {
  const { year, month, day } = istCalendar(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function logPath(dayKey) {
  return path.join(LOG_DIR, `${dayKey}.jsonl`);
}

function ensureDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * @param {Record<string, unknown>} entry
 */
export function appendOrderLog(entry) {
  ensureDir();
  const dayKey = String(entry.dayKey || istDayKey());
  const row = {
    id: entry.id || `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: entry.ts ?? Date.now(),
    dayKey,
    ...entry,
  };
  fs.appendFileSync(logPath(dayKey), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/** Remove persisted JSONL for an IST session (clears trade summary for that day). */
export function clearDayLogs(dayKey = istDayKey()) {
  const p = logPath(dayKey);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return { dayKey, cleared: true };
}

export function readDayLogs(dayKey = istDayKey()) {
  const p = logPath(dayKey);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  const rows = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      rows.push(JSON.parse(t));
    } catch {
      /* skip corrupt line */
    }
  }
  return rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

const CLOSING_SELL_STATUSES = new Set(['target_exit', 'stoploss_exit', 'closed']);

/** SELL at target placed after buy — still holding until it fills. */
export function hasPendingTargetSell(logs, buyOrderId) {
  const id = String(buyOrderId);
  return logs.some(
    (r) =>
      r.action === 'SELL' &&
      String(r.parentBuyId) === id &&
      (r.trigger === 'target' || r.status === 'target_pending') &&
      !CLOSING_SELL_STATUSES.has(r.status) &&
      r.status !== 'failed'
  );
}

function isEquityLogRow(r) {
  return r.assetType === 'equity' || r.optionType === 'EQ';
}

function isNiftyOptionLogRow(r) {
  return !isEquityLogRow(r) && (r.optionType === 'CE' || r.optionType === 'PE');
}

/** Open BUY positions without a completed exit SELL for the same buyOrderId. */
export function openPositionsFromLogs(dayKey = istDayKey()) {
  const logs = readDayLogs(dayKey);
  const closedBuyIds = new Set(
    logs
      .filter(
        (r) =>
          r.action === 'SELL' &&
          r.parentBuyId &&
          CLOSING_SELL_STATUSES.has(r.status)
      )
      .map((r) => String(r.parentBuyId))
  );
  return logs.filter(
    (r) =>
      r.action === 'BUY' &&
      (r.status === 'submitted' || r.status === 'simulated' || r.status === 'open') &&
      r.orderId &&
      !closedBuyIds.has(String(r.orderId))
  );
}

/** Open NIFTY CE/PE buys only — equity positions must not block index option strategy. */
export function openNiftyPositionsFromLogs(dayKey = istDayKey()) {
  return openPositionsFromLogs(dayKey).filter(isNiftyOptionLogRow);
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const CSV_HEADERS = [
  'Time (IST)',
  'Action',
  'Mode',
  'Trigger',
  'Strike',
  'Type',
  'Lots',
  'Units',
  'Entry',
  'SL',
  'Target',
  'Exit/LTP',
  'Order ID',
  'Parent Buy ID',
  'Status',
  'Outcome',
  'Mock',
  'Message',
];

const PENDING_SELL_STATUSES = new Set(['submitted', 'target_pending', 'stoploss_pending']);

function exitOutcomeFromEntry(r) {
  if (r.status === 'target_exit' || (r.status === 'closed' && r.trigger === 'target')) {
    return 'Target achieved';
  }
  if (r.status === 'stoploss_exit' || (r.status === 'closed' && r.trigger === 'stoploss')) {
    return 'Stop loss triggered';
  }
  return null;
}

function buildExitByBuyId(logs) {
  const exitByBuyId = new Map();
  for (const r of logs) {
    if (r.action === 'SELL' && r.parentBuyId && CLOSING_SELL_STATUSES.has(r.status)) {
      exitByBuyId.set(String(r.parentBuyId), r);
    }
  }
  for (const r of logs) {
    if (r.action !== 'UPDATE' || r.status !== 'closed' || !r.orderId) continue;
    const buyId = String(r.orderId);
    if (exitByBuyId.has(buyId)) continue;
    exitByBuyId.set(buyId, r);
  }
  return exitByBuyId;
}

function csvOutcome(r, exitByBuyId) {
  if (r.action === 'SELL') {
    const closed = exitOutcomeFromEntry(r);
    if (closed) return closed;
    if (
      r.trigger === 'target' &&
      (PENDING_SELL_STATUSES.has(r.status) || r.status === 'simulated')
    ) {
      return 'Pending';
    }
    if (r.trigger === 'stoploss' && PENDING_SELL_STATUSES.has(r.status)) {
      return 'Pending';
    }
    return 'Exit';
  }
  const buyId = r.orderId != null ? String(r.orderId) : '';
  const exit = buyId ? exitByBuyId.get(buyId) : null;
  if (exit) {
    const closed =
      exit.action === 'SELL'
        ? exitOutcomeFromEntry(exit)
        : exit.trigger === 'target'
          ? 'Target achieved'
          : exit.trigger === 'stoploss'
            ? 'Stop loss triggered'
            : 'Closed';
    if (closed) return closed;
  }
  if (r.status === 'failed') return 'Failed';
  if (['open', 'submitted', 'simulated'].includes(r.status)) return 'Open';
  return '';
}

function formatIstTime(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(ts));
}

export function dayLogsToCsv(dayKey = istDayKey()) {
  const logs = readDayLogs(dayKey);
  const exitByBuyId = buildExitByBuyId(logs);
  const lines = [CSV_HEADERS.join(',')];
  for (const r of logs) {
    if (r.action !== 'BUY' && r.action !== 'SELL') continue;
    lines.push(
      [
        formatIstTime(r.ts),
        r.action,
        r.mode,
        r.trigger,
        r.strike,
        r.optionType,
        r.lots,
        r.units,
        r.entry,
        r.sl,
        r.tgt,
        r.exitPrice ?? r.ltp ?? '',
        r.orderId,
        r.parentBuyId ?? '',
        r.status,
        csvOutcome(r, exitByBuyId),
        r.mock ? 'yes' : 'no',
        r.message ?? '',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}
