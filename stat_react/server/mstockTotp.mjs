import { authenticator } from 'otplib';

authenticator.options = { step: 30, window: 1 };

/**
 * Base32 secret from mStock TOTP setup (or otpauth:// URL).
 * @param {string} raw
 */
export function normalizeTotpSecret(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('otpauth://')) {
    try {
      const u = new URL(s);
      const secret = u.searchParams.get('secret');
      if (secret) return secret.replace(/\s/g, '').toUpperCase();
    } catch {
      /* fall through */
    }
  }
  return s.replace(/\s/g, '').replace(/-/g, '').toUpperCase();
}

/** @param {string} secretBase32 */
export function generateTotpCode(secretBase32) {
  const secret = normalizeTotpSecret(secretBase32);
  if (!secret) throw new Error('MSTOCK_TOTP_SECRET is empty');
  return authenticator.generate(secret);
}
