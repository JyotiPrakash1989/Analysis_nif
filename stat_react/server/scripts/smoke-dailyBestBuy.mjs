import {
  MIN_DAILY_SCORE,
  pickBestSideForDay,
  resolveDailyBestBuy,
  scoreCeSetup,
  signalWindowKey,
} from '../dailyBestBuy.mjs';

const weakPrior = { high: 100, low: 90 };
const weakCtx = {
  rsi: 65,
  prior15: weakPrior,
  prevClose: 99,
  rules: { ce: { ready: true }, pe: { ready: false } },
};
const weakCe = scoreCeSetup(101, weakPrior, 65, 99);
const weakPick = pickBestSideForDay(weakCtx, 101);
if (weakCe >= MIN_DAILY_SCORE || weakPick != null) {
  console.error('FAIL: weak setup should stay below threshold');
  process.exit(1);
}

const strongPrior = { high: 24500, low: 24400 };
const strongCtx = {
  rsi: 100,
  prior15: strongPrior,
  prevClose: 24498,
  rules: { ce: { ready: true }, pe: { ready: false } },
};
const spot = 24550;
const ce = scoreCeSetup(spot, strongPrior, strongCtx.rsi, strongCtx.prevClose);
const pick = pickBestSideForDay(strongCtx, spot);
if (ce < MIN_DAILY_SCORE || !pick || pick.side !== 'CE') {
  console.error('FAIL: strong CE breakout should qualify', { ce, pick });
  process.exit(1);
}

const priorWithEnd = { ...strongPrior, end: 1_700_000_000_000 };
const first = resolveDailyBestBuy({
  state: { dayKey: '2026-06-05', emittedKeys: [], signalsToday: 0 },
  now: Date.now(),
  spot,
  ctx: { ...strongCtx, prior15: priorWithEnd },
  chainRows: [],
  hasOpenPosition: false,
});
if (!first.isNewSignal || first.signalsToday !== 1) {
  console.error('FAIL: first qualifying setup should emit signal 1', first);
  process.exit(1);
}

const secondSameWindow = resolveDailyBestBuy({
  state: {
    dayKey: first.dayKey,
    emittedKeys: first.emittedKeys,
    signalsToday: first.signalsToday,
    lastSignal: first.lastSignal,
  },
  now: Date.now(),
  spot,
  ctx: { ...strongCtx, prior15: priorWithEnd },
  chainRows: [],
  hasOpenPosition: false,
});
if (secondSameWindow.isNewSignal) {
  console.error('FAIL: same 15m window should not emit twice');
  process.exit(1);
}

const suppressed = resolveDailyBestBuy({
  state: { dayKey: '2026-06-05', emittedKeys: [], signalsToday: 0 },
  now: Date.now(),
  spot,
  ctx: { ...strongCtx, prior15: priorWithEnd },
  chainRows: [],
  hasOpenPosition: true,
  openPosition: { strike: 24500, optionType: 'CE', entry: 120, sl: 100, tgt: 160 },
});
if (!suppressed.suppressedByPosition || suppressed.signal != null) {
  console.error('FAIL: open position should suppress UI signal', suppressed);
  process.exit(1);
}
if (!suppressed.holdSuggestion) {
  console.error('FAIL: open position should produce hold suggestion');
  process.exit(1);
}
if (!suppressed.candidateSignal || suppressed.candidateSignal.optionType !== 'CE') {
  console.error('FAIL: open position should expose candidate signal for UI', suppressed.candidateSignal);
  process.exit(1);
}

console.log('weak blocked:', weakCe.toFixed(1));
console.log('strong CE:', ce.toFixed(1), pick);
console.log('window key:', signalWindowKey('2026-06-05', 'CE', priorWithEnd));
console.log('multi-signal + hold suppression OK');
