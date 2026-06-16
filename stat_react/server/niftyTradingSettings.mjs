import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MIN_DAILY_SCORE } from './dailyBestBuy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'nifty-trading-settings.json');

/** @param {number} n @param {number} min @param {number} max */
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStoredSettings() {
  ensureDataDir();
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return null;
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return {
      minDailyScore: clamp(Number(raw.minDailyScore), 50, 100),
    };
  } catch {
    return null;
  }
}

function writeStoredSettings(settings) {
  ensureDataDir();
  fs.writeFileSync(
    SETTINGS_PATH,
    JSON.stringify({ ...settings, updatedAt: Date.now() }, null, 2),
    'utf8'
  );
}

const stored = readStoredSettings();
let niftySettings = stored ?? { minDailyScore: DEFAULT_MIN_DAILY_SCORE };

export function getNiftyTradingSettings() {
  return { ...niftySettings };
}

/** @param {{ minDailyScore?: number }} patch */
export function setNiftyTradingSettings(patch) {
  if (patch.minDailyScore != null) {
    niftySettings.minDailyScore = clamp(Number(patch.minDailyScore), 50, 100);
  }
  writeStoredSettings(niftySettings);
  return getNiftyTradingSettings();
}
