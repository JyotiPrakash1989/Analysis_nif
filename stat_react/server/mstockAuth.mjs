/**
 * mStock Type A login → session JWT (valid until midnight).
 * @see https://tradingapi.mstock.com/docs/v1/typeA/User/
 */

const BASE = 'https://api.mstock.trade';

/** POST with api_key + OTP (request_token) + checksum → data.access_token */
export const MSTOCK_SESSION_TOKEN_URL = `${BASE}/openapi/typea/session/token`;
export const MSTOCK_VERIFY_TOTP_URL = `${BASE}/openapi/typea/session/verifytotp`;
export const MSTOCK_CONNECT_LOGIN_URL = `${BASE}/openapi/typea/connect/login`;

async function formPost(path, fields, extraHeaders = {}) {
  const body = new URLSearchParams(fields).toString();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'X-Mirae-Version': '1',
      'Content-Type': 'application/x-www-form-urlencoded',
      ...extraHeaders,
    },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/**
 * Triggers OTP to registered mobile.
 * @param {string} username
 * @param {string} password
 */
export async function mstockConnectLogin(username, password) {
  const { status, json, text } = await formPost('/openapi/typea/connect/login', {
    username,
    password,
  });
  if (status !== 200) {
    const msg = json?.message || text.slice(0, 240) || `HTTP ${status}`;
    throw new Error(`Login failed: ${msg}`);
  }
  const ok = json?.status === 'success' || json?.status === true;
  if (!ok) {
    throw new Error(json?.message || 'Login failed');
  }
  return json.data ?? {};
}

/**
 * Exchange OTP for access_token (JWT).
 * @param {string} apiKey
 * @param {string} otp
 * @param {string} [checksum]
 */
function throwSessionError(status, json, text) {
  const msg = json?.message || text.slice(0, 320) || `HTTP ${status}`;
  const err = new Error(msg);
  const type = json?.error_type || '';
  if (/otp.*expired|regenerate.*otp/i.test(msg)) {
    err.code = 'OTP_EXPIRED';
    err.hint = 'Click Send OTP again, then enter the new SMS code within 1–2 minutes.';
  } else if (type === 'APIKeyException' || /API is suspended|APIKey|subscription/i.test(msg)) {
    err.code = 'API_KEY_INVALID';
    err.hint =
      'This API key is not active on mStock. At trade.mstock.com → Trading APIs, create a new key for the same account as your login, update MSTOCK_API_KEY in .env, then restart npm run dev.';
  } else if (/invalid otp|otp/i.test(msg)) {
    err.code = 'OTP_INVALID';
    err.hint = 'Check the SMS code and try again, or request a new OTP.';
  }
  throw err;
}

export async function mstockGenerateSession(apiKey, otp, checksum = 'L') {
  const key = String(apiKey).trim().replace(/^\uFEFF/, '');
  const { status, json, text } = await formPost(new URL(MSTOCK_SESSION_TOKEN_URL).pathname, {
    api_key: key,
    request_token: otp.trim(),
    checksum,
  });
  if (status !== 200) {
    throwSessionError(status, json, text);
  }
  const ok = json?.status === 'success' || json?.status === true;
  if (!ok) {
    throwSessionError(status, json, text);
  }
  const token = json?.data?.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('No access_token in session response');
  }
  return { accessToken: token, data: json.data };
}

/**
 * Session via registered TOTP (no SMS OTP). Requires TOTP enabled on trade.mstock.com.
 * @param {string} apiKey
 * @param {string} totp 6-digit code
 */
export async function mstockVerifyTotp(apiKey, totp) {
  const { status, json, text } = await formPost('/openapi/typea/session/verifytotp', {
    api_key: apiKey,
    totp: String(totp).trim(),
  });
  if (status !== 200) {
    const msg = json?.message || text.slice(0, 240) || `HTTP ${status}`;
    throw new Error(`TOTP session failed: ${msg}`);
  }
  const ok = json?.status === 'success' || json?.status === true;
  if (!ok) {
    throw new Error(json?.message || 'TOTP session failed');
  }
  const token = json?.data?.access_token;
  if (!token || typeof token !== 'string') {
    throw new Error('No access_token in verifytotp response');
  }
  return { accessToken: token, data: json.data };
}
