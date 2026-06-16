import { NIFTY_INDEX_TOKEN } from './mstockWsConfig.mjs';

function toFinite(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Type B binary tick — LTP at bytes 43–51 (paise). Token at 2–27. */
export function parseBinaryLtp(buf, tokenFilter = NIFTY_INDEX_TOKEN) {
  if (!Buffer.isBuffer(buf) || buf.length < 51) return null;
  const tokenStr = buf.subarray(2, 27).toString('utf8').replace(/\0/g, '').trim();
  if (tokenFilter && tokenStr && tokenStr !== tokenFilter && tokenStr !== String(Number(tokenFilter))) {
    return null;
  }
  const paise = Number(buf.readBigInt64BE(43));
  if (!Number.isFinite(paise) || paise <= 0) return null;
  const ltp = paise / 100;
  return ltp > 1000 && ltp < 100_000 ? ltp : null;
}

function matchToken(obj, tokenFilter) {
  const t =
    obj?.token ??
    obj?.symboltoken ??
    obj?.symbolToken ??
    obj?.instrument_token ??
    obj?.instrumentToken;
  if (t == null) return true;
  return String(t) === tokenFilter || String(t) === String(Number(tokenFilter));
}

function ltpFromObject(obj, tokenFilter) {
  if (!obj || typeof obj !== 'object' || !matchToken(obj, tokenFilter)) return null;
  const raw =
    obj.ltp ??
    obj.LTP ??
    obj.last_price ??
    obj.lastPrice ??
    obj.lp ??
    obj.close ??
    obj.price;
  let n = toFinite(raw);
  if (n != null && n > 100_000) n = n / 100;
  if (n != null && n > 1000 && n < 100_000) return n;
  return null;
}

/** Walk JSON tick payloads (Type A/B / web broadcast). */
export function parseJsonLtp(data, tokenFilter = NIFTY_INDEX_TOKEN) {
  if (data == null) return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const n = parseJsonLtp(item, tokenFilter);
      if (n != null) return n;
    }
    return null;
  }

  if (typeof data !== 'object') return null;

  const direct = ltpFromObject(data, tokenFilter);
  if (direct != null) return direct;

  for (const key of ['data', 'ticks', 'tick', 'fetched', 'result', 'payload', 'd']) {
    if (data[key] != null) {
      const n = parseJsonLtp(data[key], tokenFilter);
      if (n != null) return n;
    }
  }

  return null;
}

export function parseWsMessage(raw, tokenFilter = NIFTY_INDEX_TOKEN) {
  const filters = (process.env.MSTOCK_NIFTY_TOKEN || '26000,999260')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (Buffer.isBuffer(raw)) {
    for (const t of filters) {
      const bin = parseBinaryLtp(raw, t);
      if (bin != null) return bin;
    }
    const binAny = parseBinaryLtp(raw, '');
    if (binAny != null) return binAny;
    raw = raw.toString('utf8');
  }
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    for (const t of filters) {
      const n = parseJsonLtp(JSON.parse(raw), t);
      if (n != null) return n;
    }
    return parseJsonLtp(JSON.parse(raw), '');
  } catch {
    const n = toFinite(raw);
    return n != null && n > 1000 && n < 100_000 ? n : null;
  }
}
