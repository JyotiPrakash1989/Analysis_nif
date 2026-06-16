/**
 * mStock Type B guard: IP whitelist (IA403) and rate limits so we do not spam the API.
 */

let ipBlocked = false;
let ipBlockLogged = false;
let lastOptionChainTryAt = 0;
let lastFailureLogAt = 0;

/** Minimum gap between option-chain API attempts when not IP-blocked. */
const OPTION_CHAIN_INTERVAL_MS = Number(process.env.MSTOCK_OPTION_CHAIN_INTERVAL_MS || 30_000);

export const MSTOCK_IP_MISMATCH = 'MSTOCK_IP_MISMATCH';

/** @param {string} [text] */
export function isMstockIpMismatch(text) {
  if (!text || typeof text !== 'string') return false;
  return (
    /IA403/i.test(text) ||
    /ip address are not matching/i.test(text) ||
    /Primary and Secondary IP/i.test(text)
  );
}

export function mstockIpWhitelistMessage() {
  return (
    'mStock rejected API calls: this PC’s public IP is not whitelisted on your API key. ' +
    'Open trade.mstock.com → Trading APIs → your key → set Primary IP (and Secondary if needed) ' +
    'to this machine’s public IP (see GET /api/mstock/my-ip), save, then restart npm run dev.'
  );
}

/** Short UI hint when Yahoo/public feed is already active. */
export function mstockIpWhitelistUiHint(publicIp) {
  const ip = publicIp ? ` ${publicIp}` : '';
  return (
    `mStock live feed blocked — whitelist this PC’s public IP${ip} on trade.mstock.com → Trading APIs → your key → Primary IP, save, then restart npm run dev. ` +
    'Spot and chart use Yahoo ^NSEI until then.'
  );
}

export function isMstockTypeBBlocked() {
  return ipBlocked;
}

export function getMstockTypeBBlockMessage() {
  return ipBlocked ? mstockIpWhitelistMessage() : '';
}

/**
 * @param {string} textOrMessage
 * @returns {boolean} true if IP block was newly set
 */
export function markMstockIpBlocked(textOrMessage) {
  if (!isMstockIpMismatch(textOrMessage)) return false;
  const wasBlocked = ipBlocked;
  ipBlocked = true;
  return !wasBlocked;
}

/** Call when any Type B request succeeds (IP was fixed on mStock portal). */
export function clearMstockIpBlock() {
  ipBlocked = false;
  ipBlockLogged = false;
}

/** Force one option-chain attempt (e.g. user clicked Retry live). */
export function resetOptionChainThrottle() {
  lastOptionChainTryAt = 0;
}

/** @returns {boolean} whether a new attempt is allowed */
export function shouldAttemptOptionChainFetch() {
  const now = Date.now();
  if (now - lastOptionChainTryAt < OPTION_CHAIN_INTERVAL_MS) return false;
  lastOptionChainTryAt = now;
  return true;
}

/** @param {string} message */
export function logMstockOptionChainWarn(message) {
  const now = Date.now();
  if (now - lastFailureLogAt < 120_000) return;
  lastFailureLogAt = now;
  console.warn('[NiftyOptima] mStock option chain:', message);
}

export function logMstockIpBlockOnce() {
  if (ipBlockLogged) return;
  ipBlockLogged = true;
  console.warn(`[NiftyOptima] ${mstockIpWhitelistMessage()}`);
  void logPublicIpHint();
}

async function logPublicIpHint() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const j = await res.json();
    if (j?.ip) {
      console.warn(`[NiftyOptima] Whitelist this public IP on mStock: ${j.ip}`);
      return j.ip;
    }
  } catch {
    /* ignore */
  }
}

/** @param {number} statusCode @param {string} text */
export function throwIfMstockIpError(statusCode, text) {
  if ((statusCode === 400 || statusCode === 403) && isMstockIpMismatch(text)) {
    const err = new Error(MSTOCK_IP_MISMATCH);
    err.code = MSTOCK_IP_MISMATCH;
    err.hint = mstockIpWhitelistMessage();
    throw err;
  }
}
