/**
 * Detect stale NIFTY 1m history (wrong chart day / frozen spot).
 */

/** @param {number} tsMs */
export function istDateKey(tsMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(tsMs));
}

/** @param {number} [nowMs] */
export function istSessionClock(nowMs = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  return {
    hour: get('hour'),
    minute: get('minute'),
    dayOfWeek: weekdayMap[wd] ?? 1,
  };
}

/** NSE cash session Mon–Fri 09:15–15:30 IST. */
export function isNseCashSessionOpen(nowMs = Date.now()) {
  const { hour, minute, dayOfWeek } = istSessionClock(nowMs);
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  const mins = hour * 60 + minute;
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

/**
 * @param {{ time: number }[]} bars
 * @param {number} [nowMs]
 */
export function areIntradayBarsStale(bars, nowMs = Date.now()) {
  if (!Array.isArray(bars) || bars.length < 1) return true;
  const lastTs = bars[bars.length - 1].time;
  if (!Number.isFinite(lastTs)) return true;

  const today = istDateKey(nowMs);
  const barDay = istDateKey(lastTs);
  if (barDay !== today) return true;

  const ageMs = nowMs - lastTs;
  if (isNseCashSessionOpen(nowMs)) return ageMs > 5 * 60_000;
  return ageMs > 20 * 60 * 60_000;
}
