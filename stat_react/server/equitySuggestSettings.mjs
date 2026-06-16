import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  MIN_SUGGEST_CONFIDENCE_PCT,
  MIN_SUGGEST_TARGET_MOVE_PCT,
} from './equityAnalysis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_PATH = path.join(DATA_DIR, 'equity-suggest-settings.json');

/** @param {number} n @param {number} min @param {number} max */
function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
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
      minConfidence: clamp(Math.round(Number(raw.minConfidence)), 0, 100),
      minTargetPct: clamp(Number(raw.minTargetPct), 0.5, 50),
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
let suggestSettings = stored ?? {
  minConfidence: MIN_SUGGEST_CONFIDENCE_PCT,
  minTargetPct: MIN_SUGGEST_TARGET_MOVE_PCT,
};

export function getEquitySuggestSettings() {
  return { ...suggestSettings };
}

/** @param {{ minConfidence?: number, minTargetPct?: number }} patch */
export function setEquitySuggestSettings(patch) {
  if (patch.minConfidence != null) {
    suggestSettings.minConfidence = clamp(Math.round(Number(patch.minConfidence)), 0, 100);
  }
  if (patch.minTargetPct != null) {
    suggestSettings.minTargetPct = clamp(Number(patch.minTargetPct), 0.5, 50);
  }
  writeStoredSettings(suggestSettings);
  return getEquitySuggestSettings();
}
