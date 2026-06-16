import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'app-env-settings.json');

const SECRET_KEYS = new Set([
  'MSTOCK_API_KEY',
  'MSTOCK_PASSWORD',
  'MSTOCK_TOTP_SECRET',
  'MSTOCK_JWT_TOKEN',
  'MSTOCK_OTP',
]);

/** Keys editable from Settings UI (mirrors stat_react/.env.example). */
export const ENV_FIELD_DEFS = [
  { key: 'MSTOCK_API_KEY', label: 'mStock API key', secret: true, group: 'mStock API' },
  { key: 'MSTOCK_APP_NAME', label: 'mStock app name', group: 'mStock API' },
  { key: 'MSTOCK_USERNAME', label: 'mStock client ID / username', group: 'mStock login' },
  { key: 'MSTOCK_PASSWORD', label: 'mStock password', secret: true, group: 'mStock login' },
  { key: 'MSTOCK_JWT_TOKEN', label: 'Session JWT (optional)', secret: true, group: 'mStock login' },
  { key: 'MSTOCK_USE_TOTP', label: 'Use server TOTP (1 / 0)', group: 'mStock login' },
  { key: 'MSTOCK_TOTP_SECRET', label: 'TOTP secret (base32)', secret: true, group: 'mStock login' },
  { key: 'MSTOCK_WS_URL', label: 'WebSocket URL override', group: 'mStock advanced' },
  { key: 'MSTOCK_WS_BROADCAST_URL', label: 'Broadcast WS base URL', group: 'mStock advanced' },
  { key: 'NIFTY_PUBLIC_SPOT_FALLBACK', label: 'Yahoo fallback (1 / 0)', group: 'Market data' },
  { key: 'NIFTY_INDEX_POLL_MS', label: 'Index poll interval (ms)', group: 'Market data' },
  { key: 'NIFTY_BARS_REFRESH_MS', label: '1m bars refresh (ms)', group: 'Market data' },
  { key: 'FEED_TICK_MS', label: 'Mock tick interval (ms)', group: 'Market data' },
  { key: 'EQUITY_SCAN_MS', label: 'Equity scan interval (ms)', group: 'Market data' },
  { key: 'SIMULATE_FEED_DROP_MS', label: 'Simulate WS drop (ms)', group: 'Debug' },
];

const ALLOWED_KEYS = new Set(ENV_FIELD_DEFS.map((f) => f.key));

let reloadHandler = async () => {};

export function setEnvSettingsReloadHandler(fn) {
  reloadHandler = typeof fn === 'function' ? fn : async () => {};
}

/** Remove keys from settings file and process.env without running reloadHandler. */
export function removeStoredEnvKeys(keys) {
  const stored = { ...readStoredRaw() };
  for (const key of keys) {
    if (!ALLOWED_KEYS.has(key)) continue;
    delete stored[key];
    delete process.env[key];
  }
  writeStoredRaw(stored);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStoredRaw() {
  ensureDataDir();
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeStoredRaw(obj) {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ ...obj, updatedAt: Date.now() }, null, 2), 'utf8');
}

function effectiveValue(key) {
  const fromFile = readStoredRaw()[key];
  if (fromFile != null && String(fromFile).trim() !== '') return String(fromFile).trim();
  const fromEnv = process.env[key];
  if (fromEnv != null && String(fromEnv).trim() !== '') return String(fromEnv).trim();
  return '';
}

function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

/** Apply saved settings file over process.env (after dotenv). */
export function loadStoredEnvIntoProcess() {
  const stored = readStoredRaw();
  for (const key of ALLOWED_KEYS) {
    const v = stored[key];
    if (v != null && String(v).trim() !== '') process.env[key] = String(v).trim();
  }
}

export function getEnvSettingsForClient() {
  const stored = readStoredRaw();
  return {
    fields: ENV_FIELD_DEFS.map((def) => {
      const value = effectiveValue(def.key);
      return {
        ...def,
        value: def.secret ? '' : value,
        isSet: Boolean(value),
        masked: def.secret && value ? maskSecret(value) : '',
        source: stored[def.key] != null && String(stored[def.key]).trim() !== '' ? 'settings' : value ? 'env' : 'unset',
      };
    }),
    updatedAt: stored.updatedAt ?? null,
    settingsFile: 'server/data/app-env-settings.json',
  };
}

/**
 * @param {Record<string, string | null | undefined>} patch
 * @param {{ clearKeys?: string[] }} [opts]
 */
export async function saveEnvSettings(patch, opts = {}) {
  const stored = { ...readStoredRaw() };
  const clearKeys = new Set(opts.clearKeys || []);

  for (const key of ALLOWED_KEYS) {
    if (clearKeys.has(key)) {
      delete stored[key];
      delete process.env[key];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const v = patch[key];
    if (v == null || String(v).trim() === '') {
      if (SECRET_KEYS.has(key)) continue;
      delete stored[key];
      delete process.env[key];
      continue;
    }
    const trimmed = String(v).trim();
    stored[key] = trimmed;
    process.env[key] = trimmed;
  }

  writeStoredRaw(stored);
  await reloadHandler();
  return getEnvSettingsForClient();
}
