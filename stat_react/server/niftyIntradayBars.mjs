/**
 * Live NIFTY 1m bars: seed from mStock historical, update forming bar from WS/REST LTP.
 */

/** @typedef {{ time: number, open: number, high: number, low: number, close: number }} MinuteBar */

function minuteBucketMs(tsMs) {
  return Math.floor(tsMs / 60_000) * 60_000;
}

export class LiveIntradayBars {
  constructor() {
    /** @type {MinuteBar[]} */
    this.bars = [];
    this.loadedAt = 0;
  }

  get length() {
    return this.bars.length;
  }

  /** @param {MinuteBar[]} bars */
  setBars(bars) {
    const sorted = [...bars]
      .filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close))
      .sort((a, b) => a.time - b.time);
    const deduped = [];
    for (const b of sorted) {
      const bucket = minuteBucketMs(b.time);
      const bar = {
        time: bucket,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      };
      const last = deduped[deduped.length - 1];
      if (last && last.time === bucket) {
        deduped[deduped.length - 1] = bar;
      } else {
        deduped.push(bar);
      }
    }
    this.bars = deduped;
    this.loadedAt = Date.now();
  }

  /** @param {number} ltp @param {number} [tsMs] */
  updateLtp(ltp, tsMs = Date.now()) {
    if (!Number.isFinite(ltp)) return;
    const bucket = minuteBucketMs(tsMs);
    const last = this.bars[this.bars.length - 1];
    if (!last) {
      this.bars.push({ time: bucket, open: ltp, high: ltp, low: ltp, close: ltp });
      return;
    }
    if (bucket > last.time) {
      this.bars.push({
        time: bucket,
        open: last.close,
        high: ltp,
        low: ltp,
        close: ltp,
      });
    } else if (bucket === last.time) {
      last.high = Math.max(last.high, ltp);
      last.low = Math.min(last.low, ltp);
      last.close = ltp;
    }
    const max = Number(process.env.NIFTY_BARS_MAX || 400);
    if (this.bars.length > max) {
      this.bars = this.bars.slice(-max);
    }
  }

  /** @param {number} [limit] @returns {MinuteBar[]} */
  getBars(limit = 180) {
    if (limit <= 0 || this.bars.length <= limit) return [...this.bars];
    return this.bars.slice(-limit);
  }
}
