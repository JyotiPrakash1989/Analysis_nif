const AUTO_KEY = 'niftyoptima-auto-trading';
const SCORE_KEY = 'niftyoptima-min-daily-score';

export const DEFAULT_MIN_DAILY_SCORE = 92;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MIN_DAILY_SCORE;
  return Math.min(100, Math.max(50, Math.round(n)));
}

export function readAutoTradingLocal(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAutoTradingLocal(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function readMinDailyScoreLocal(): number {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    if (raw == null) return DEFAULT_MIN_DAILY_SCORE;
    return clampScore(Number(raw));
  } catch {
    return DEFAULT_MIN_DAILY_SCORE;
  }
}

export function writeMinDailyScoreLocal(score: number) {
  try {
    localStorage.setItem(SCORE_KEY, String(clampScore(score)));
  } catch {
    /* ignore */
  }
}
