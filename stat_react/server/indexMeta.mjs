/**
 * User-facing index status when mStock and/or public fallback are used.
 */

/** @param {string} jwt */
export function formatPublicIndexNote(jwt, mstockErr, pubNote) {
  const hasJwt = Boolean(jwt && String(jwt).trim());
  const err = (mstockErr || '').trim();

  if (!hasJwt) {
    return (
      pubNote ||
      'NIFTY from delayed public feed. For mStock live: npm run mstock:login (then restart dev server).'
    );
  }

  if (err.includes('401') || /jwt|unauthorized|session jwt/i.test(err)) {
    return (
      'mStock session expired or missing (valid until midnight). ' +
      'Enter SMS OTP on the app login screen, or run: npm run mstock:token'
    );
  }

  if (err) {
    return `${err} — showing delayed public NIFTY until mStock recovers.`;
  }

  return pubNote || '';
}
