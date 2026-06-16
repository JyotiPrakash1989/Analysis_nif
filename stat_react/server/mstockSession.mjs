import { mstockGenerateSession } from './mstockAuth.mjs';

/**
 * @param {string} apiKey
 * @param {string} smsOtp
 * @param {string} [checksum]
 */
export async function establishMstockSession(apiKey, smsOtp, checksum = 'L') {
  const otp = String(smsOtp || '').trim();
  if (!otp) {
    const e = new Error('SMS OTP required');
    e.code = 'OTP_INVALID';
    e.hint = 'Enter the OTP from your mobile.';
    throw e;
  }

  const key = String(apiKey).trim().replace(/^\uFEFF/, '');
  const checksums = [...new Set([checksum, 'L', 'W'].filter(Boolean))];

  let lastErr;
  for (const c of checksums) {
    try {
      const r = await mstockGenerateSession(key, otp, c);
      return { ...r, source: 'session/token' };
    } catch (e) {
      lastErr = e;
      if (e.code === 'OTP_EXPIRED' || e.code === 'OTP_INVALID') throw e;
      if (e.code === 'API_KEY_INVALID') throw e;
    }
  }
  throw lastErr || new Error('Session failed');
}
