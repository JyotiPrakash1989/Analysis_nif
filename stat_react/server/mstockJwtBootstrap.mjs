import { mstockGenerateSession, mstockVerifyTotp } from './mstockAuth.mjs';
import { generateTotpCode, normalizeTotpSecret } from './mstockTotp.mjs';
import { resolveMstockBroadcastWsUrl } from './mstockWsConfig.mjs';

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {{ force?: boolean }} [opts]
 */
export async function refreshJwtFromTotp(env, opts = {}) {
  const apiKey = (env.MSTOCK_API_KEY || env.VITE_MSTOCK_API_KEY || '').trim().replace(/^\uFEFF/, '');
  const secret = normalizeTotpSecret(env.MSTOCK_TOTP_SECRET || '');
  if (!apiKey || !secret) return null;
  const totp = generateTotpCode(secret);
  const { accessToken } = await mstockVerifyTotp(apiKey, totp);
  return accessToken;
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export async function refreshJwtFromOtp(env) {
  const apiKey = (env.MSTOCK_API_KEY || env.VITE_MSTOCK_API_KEY || '').trim().replace(/^\uFEFF/, '');
  const otp = (env.MSTOCK_OTP || env.MSTOCK_REQUEST_TOKEN || '').trim();
  if (!apiKey || !otp) return null;
  const { accessToken } = await mstockGenerateSession(
    apiKey,
    otp,
    (env.MSTOCK_CHECKSUM || 'L').trim(),
  );
  return accessToken;
}

/**
 * TOTP first, then OTP env fallback.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ existingJwt?: string, force?: boolean }} [opts]
 */
function useAutoTotp(env) {
  const v = env.MSTOCK_USE_TOTP;
  return v === '1' || v === 'true' || v === 'on';
}

export async function bootstrapMstockJwt(env, opts = {}) {
  if (opts.existingJwt?.trim() && !opts.force) {
    return { accessToken: opts.existingJwt.trim(), source: 'env' };
  }
  const secret = useAutoTotp(env) ? normalizeTotpSecret(env.MSTOCK_TOTP_SECRET || '') : '';
  if (secret) {
    try {
      const accessToken = await refreshJwtFromTotp(env, opts);
      return { accessToken, source: 'verifytotp' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/totp.*not enabled/i.test(msg)) {
        const err = new Error(
          'TOTP is not enabled on this mStock account. Set MSTOCK_USE_TOTP=0 in .env, restart, then use SMS OTP in the app or npm run mstock:token.',
        );
        err.code = 'TOTP_NOT_ENABLED';
        throw err;
      }
      if (opts.force) throw e;
    }
  }
  const fromOtp = await refreshJwtFromOtp(env);
  if (fromOtp) return { accessToken: fromOtp, source: 'session/token' };
  return null;
}

/** @param {string} accessToken */
export function buildWsUrlOverride(env, accessToken) {
  return (
    resolveMstockBroadcastWsUrl({
      ...env,
      MSTOCK_JWT_TOKEN: accessToken,
      MSTOCK_WS_URL: '',
    }) || ''
  );
}
