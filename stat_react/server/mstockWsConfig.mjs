/** @param {NodeJS.ProcessEnv} env */
export function resolveMstockBroadcastWsUrl(env) {
  const full = (env.MSTOCK_WS_URL || '').trim();
  if (full) return full;

  const jwt = (env.MSTOCK_JWT_TOKEN || env.VITE_MSTOCK_JWT_TOKEN || '').trim();
  if (!jwt) return '';

  const apiKey = (env.MSTOCK_API_KEY || env.VITE_MSTOCK_API_KEY || '').trim().replace(/^\uFEFF/, '');
  const style = (env.MSTOCK_WS_AUTH_STYLE || 'token').trim().toLowerCase();

  if (style === 'query-key' && apiKey) {
    const base = (env.MSTOCK_WS_BROADCAST_URL || 'wss://ws.mstock.trade').trim();
    if (base.includes('API_KEY=') || base.includes('ACCESS_TOKEN=')) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}API_KEY=${encodeURIComponent(apiKey)}&ACCESS_TOKEN=${encodeURIComponent(jwt)}`;
  }

  const base = (env.MSTOCK_WS_BROADCAST_URL || 'wss://wsbcastxoi.mstock.com/ws').trim();
  if (base.includes('token=') || base.includes('ACCESS_TOKEN=')) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(jwt)}`;
}

/** Pull JWT from a full wss URL (?token=…) for REST Type B. */
export function extractJwtFromWsUrl(wsUrl) {
  try {
    const u = new URL(wsUrl);
    return (
      u.searchParams.get('token')?.trim() ||
      u.searchParams.get('ACCESS_TOKEN')?.trim() ||
      u.searchParams.get('access_token')?.trim() ||
      ''
    );
  } catch {
    return '';
  }
}

export const NIFTY_INDEX_TOKEN = (process.env.MSTOCK_NIFTY_TOKEN || '26000,999260')
  .split(',')[0]
  .trim();
