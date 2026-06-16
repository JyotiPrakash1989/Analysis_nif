/**
 * Actionable mStock Type B auth errors (quote + historical).
 */

/** @param {string} [jwt] @param {string} [apiKey] */
export function hasMstockSessionJwt(jwt, apiKey) {
  const t = typeof jwt === 'string' ? jwt.trim() : '';
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  return Boolean(t && t !== key);
}

/** @param {string} [error] */
export function isMstockAuthError(error) {
  if (!error || typeof error !== 'string') return false;
  return /401|unauthorized|jwt|token|session/i.test(error);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ totpDisabled?: boolean }} [opts]
 */
export function mstockJwtRequiredMessage(env = process.env, opts = {}) {
  if (opts.totpDisabled) {
    return (
      'mStock Type B needs a session JWT. TOTP is not enabled on your account — ' +
      'set MSTOCK_USE_TOTP=0, restart, then enter SMS OTP on the app login screen ' +
      '(or run: npm run mstock:token). JWT is valid until midnight.'
    );
  }
  const useTotp = env.MSTOCK_USE_TOTP === '1' || env.MSTOCK_USE_TOTP === 'true';
  if (useTotp && (env.MSTOCK_TOTP_SECRET || '').trim()) {
    return (
      'mStock Type B needs MSTOCK_JWT_TOKEN. Run: npm run mstock:totp ' +
      '(or enter OTP on the app login screen). Valid until midnight.'
    );
  }
  return (
    'mStock Type B needs MSTOCK_JWT_TOKEN. Enter SMS OTP on the app login screen ' +
    'or run: npm run mstock:token. Valid until midnight.'
  );
}

/** @param {string} [error] @param {NodeJS.ProcessEnv} [env] @param {{ totpDisabled?: boolean }} [opts] */
export function formatMstockAuthHelp(error, env = process.env, opts = {}) {
  if (!isMstockAuthError(error)) return error || '';
  return mstockJwtRequiredMessage(env, opts);
}

const ORDER_ID_KEYS = [
  'orderid',
  'orderId',
  'uniqueorderid',
  'uniqueOrderId',
  'order_id',
  'OrderID',
  'exchangeorderid',
];

/** @param {unknown} obj */
function pickOrderIdFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of ORDER_ID_KEYS) {
    const v = obj[key];
    if (v == null) continue;
    const id = String(v).trim();
    if (id) return id;
  }
  return null;
}

/** @param {unknown} json */
export function parseMstockOrderId(json) {
  if (!json || typeof json !== 'object') return null;
  const direct = pickOrderIdFromObject(json);
  if (direct) return direct;
  const data = json.data ?? json.Data;
  if (typeof data === 'string') {
    const id = data.trim();
    if (/^\d+$/.test(id)) return id;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const id = pickOrderIdFromObject(item);
      if (id) return id;
    }
  }
  if (data && typeof data === 'object') {
    return pickOrderIdFromObject(data);
  }
  return null;
}

/** @param {unknown} json */
export function isMstockResponseOk(json) {
  if (!json || typeof json !== 'object') return false;
  // Broker may return status:false with a valid order id on HTTP 200.
  if (parseMstockOrderId(json)) return true;
  if (json.success === true) return true;
  if (json.success === false) return false;
  const st = json.status ?? json.Status;
  if (st === true || st === 1) return true;
  if (st === false || st === 0) return false;
  const s = String(st ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'success') return true;
  if (s === 'false' || s === '0' || s === 'error' || s === 'failed' || s === 'failure') {
    return false;
  }
  return false;
}

/** @param {string} brokerStatus */
export function mapMstockOrderBookStatus(brokerStatus) {
  const s = String(brokerStatus ?? '').trim().toLowerCase();
  if (!s) return 'submitted';
  if (
    s.includes('complete') ||
    s.includes('filled') ||
    s.includes('traded') ||
    s.includes('executed')
  ) {
    return 'open';
  }
  if (s.includes('reject') || s.includes('cancel')) return 'failed';
  return 'submitted';
}

/**
 * Pull the broker-facing error/success text from mStock JSON (orders, quote, etc.).
 * @param {unknown} json
 * @returns {{ message: string, errorcode: string }}
 */
export function extractMstockBrokerMessage(json) {
  if (!json || typeof json !== 'object') return { message: '', errorcode: '' };

  const errorcode = String(
    json.errorcode ?? json.errorCode ?? json.ErrorCode ?? json.error_code ?? ''
  ).trim();

  const direct = [];
  for (const key of [
    'message',
    'Message',
    'messageText',
    'MessageText',
    'error',
    'Error',
    'errormsg',
    'errorMessage',
    'error_message',
    'remarks',
    'Remarks',
    'description',
    'reason',
    'msg',
  ]) {
    const v = json[key];
    if (v != null && String(v).trim()) direct.push(String(v).trim());
  }

  const data = json.data ?? json.Data;
  if (typeof data === 'string' && data.trim()) direct.push(data.trim());
  else if (data && typeof data === 'object') {
    for (const key of ['message', 'Message', 'text', 'error', 'remarks', 'reason']) {
      const v = data[key];
      if (v != null && String(v).trim()) direct.push(String(v).trim());
    }
  }

  let message = [...new Set(direct)].join(' — ');

  if (!message) {
    message = findNestedBrokerText(json) || '';
  }

  message = humanizeBrokerMessage(message);

  if (message && errorcode && !message.includes(errorcode)) {
    message = `${message} (${errorcode})`;
  } else if (!message && errorcode) {
    message = errorcode;
  }

  return { message, errorcode };
}

/** Prefer plain-language tail of long RMS:… broker strings. */
function humanizeBrokerMessage(msg) {
  if (!msg || typeof msg !== 'string') return '';
  const t = msg.trim();
  if (!/^RMS:/i.test(t)) return t;
  const parts = t.split(',').map((p) => p.trim()).filter(Boolean);
  const readable = parts.filter(
    (p) =>
      p.length > 3 &&
      p.length < 160 &&
      !/^RMS:/i.test(p) &&
      !/^[A-Z0-9_-]+$/i.test(p) &&
      /[a-z]/i.test(p)
  );
  if (readable.length) return readable[readable.length - 1];
  return t.length > 320 ? `${t.slice(0, 320)}…` : t;
}

/** @param {unknown} node @param {number} [depth] */
function findNestedBrokerText(node, depth = 0) {
  if (depth > 5) return '';
  if (typeof node === 'string') {
    const t = node.trim();
    if (t.length < 4) return '';
    if (/^(true|false|null|\{\}|\[\])$/i.test(t)) return '';
    return t;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const s = findNestedBrokerText(item, depth + 1);
      if (s.length > 8) return s;
    }
    return '';
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) {
      const s = findNestedBrokerText(v, depth + 1);
      if (s.length > 8 && /[A-Za-z]{3}/.test(s)) return s;
    }
  }
  return '';
}

/** Turn mStock JSON / wrapped errors into a short user-facing string. */
export function formatMstockApiMessage(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let t = raw.trim();
  if (t.startsWith('Historical: ')) t = t.slice('Historical: '.length).trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const { message, errorcode } = extractMstockBrokerMessage(j);
      if (message) return message;
      if (errorcode) return errorcode;
    } catch {
      /* keep t */
    }
  }
  return t.length > 500 ? `${t.slice(0, 500)}…` : t;
}
