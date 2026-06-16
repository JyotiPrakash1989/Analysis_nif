import EventEmitter from 'events';
import {
  atmStrike,
  evaluateBreakoutContext,
  getOptionChainForSpot,
  calculateLevels,
  mergeStrategyRules,
} from './analysis.mjs';

function nowMs() {
  return Date.now();
}

/**
 * Simulates m.Stock-style ticks + 1m candles; replace with MTicker subscription when wired.
 */
export class MockNiftyFeed extends EventEmitter {
  constructor(options = {}) {
    super();
    this.tickMs = options.tickMs ?? 800;
    this.spot = options.initialSpot ?? 24518.35;
    this.oneMinuteBars = [];
    this.currentBucketStart = null;
    this.lastSignalKey = '';
    this.reconnectAttempts = 0;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._seedBars();
    this._loop();
    this.emit('status', { connected: true, source: 'mock-feed' });
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.emit('status', { connected: false, source: 'mock-feed' });
  }

  _seedBars() {
    const t = nowMs();
    let p = this.spot - 80;
    for (let i = 180; i >= 0; i--) {
      const time = t - i * 60_000;
      const o = p;
      const noise = (Math.random() - 0.5) * 18;
      const c = p + noise + (Math.random() - 0.5) * 6;
      const h = Math.max(o, c) + Math.random() * 10;
      const l = Math.min(o, c) - Math.random() * 10;
      this.oneMinuteBars.push({ time, open: o, high: h, low: l, close: c });
      p = c;
    }
    this.spot = this.oneMinuteBars[this.oneMinuteBars.length - 1].close;
    this.currentBucketStart = this.oneMinuteBars[this.oneMinuteBars.length - 1].time;
  }

  _rollMinuteIfNeeded() {
    const t = nowMs();
    const bar = this.oneMinuteBars[this.oneMinuteBars.length - 1];
    if (t - bar.time < 60_000) return;
    const o = bar.close;
    const c = this.spot;
    const h = Math.max(o, c, this.spot + Math.random() * 4);
    const l = Math.min(o, c, this.spot - Math.random() * 4);
    this.oneMinuteBars.push({ time: t, open: o, high: h, low: l, close: c });
    if (this.oneMinuteBars.length > 400) this.oneMinuteBars.shift();
  }

  _randomWalkSpot() {
    const drift = (Math.random() - 0.48) * 2.2;
    this.spot = Math.round((this.spot + drift) * 100) / 100;
    const last = this.oneMinuteBars[this.oneMinuteBars.length - 1];
    last.high = Math.max(last.high, this.spot);
    last.low = Math.min(last.low, this.spot);
    last.close = this.spot;
  }

  _loop() {
    if (!this.running) return;
    this._rollMinuteIfNeeded();
    this._randomWalkSpot();
    const ctx = evaluateBreakoutContext(this.oneMinuteBars, this.spot);
    const { prior, current } = { prior: ctx.prior15, current: ctx.current15 };
    const rsi = ctx.rsi;
    const side = ctx.side;

    const atm = atmStrike(this.spot, 50);
    const { chain, expiry: optionChainExpiry } = getOptionChainForSpot(this.spot, atm);
    const sentiment = rsi == null ? 50 : Math.min(100, Math.max(0, rsi));

    const payload = {
      ts: nowMs(),
      spot: this.spot,
      rsi: rsi == null ? null : Math.round(rsi * 100) / 100,
      prior15: prior,
      current15: current,
      atm,
      optionChain: chain,
      optionChainExpiry,
      sentiment,
      bars1m: this.oneMinuteBars.slice(-180),
      strategyRules: mergeStrategyRules(ctx.rules, null),
    };

    this.emit('tick', payload);

    if (side) {
      const row = chain.find((r) => r.strike === atm) || chain[Math.floor(chain.length / 2)];
      const opt = side === 'CE' ? row.ce : row.pe;
      const entry = opt.ltp;
      const signalCandleLowOption = entry * (0.88 + Math.random() * 0.04);
      const levels = calculateLevels(entry, signalCandleLowOption);
      const key = `${side}-${atm}-${Math.floor(payload.ts / 5000)}`;
      if (key !== this.lastSignalKey) {
        this.lastSignalKey = key;
        this.emit('signal', {
          side,
          strike: atm,
          optionType: side,
          entry,
          sl: levels.sl,
          tgt: levels.tgt,
          risk: levels.risk,
          rationale: `15m ${side === 'CE' ? 'high' : 'low'} breakout with RSI ${rsi?.toFixed(1)}`,
          ts: payload.ts,
        });
      }
    }

    this.timer = setTimeout(() => this._loop(), this.tickMs);
  }
}
