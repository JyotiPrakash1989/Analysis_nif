import type { MinuteBar, OptionChainRow, TickPayload } from '../types/niftyoptima';
import type { NiftySpotRest } from '../hooks/useLiveNiftySpot';

export const OPTION_CHAIN_STRIKE_COUNT = 10;

export function atmStrikeFromSpot(spot: number | null, step = 50): number | null {
  if (spot == null || !Number.isFinite(spot)) return null;
  return Math.round(spot / step) * step;
}

/** ATM + forward strikes (same as server `strikesFromSpot`). */
export function strikesFromSpot(
  spot: number | null,
  step = 50,
  count = OPTION_CHAIN_STRIKE_COUNT
): number[] {
  if (spot == null || !Number.isFinite(spot)) return [];
  const atm = atmStrikeFromSpot(spot, step);
  if (atm == null) return [];
  let start = atm;
  if (start < spot) start += step;
  const forward = Array.from({ length: count }, (_, i) => start + i * step);
  if (forward.includes(atm)) return forward;
  return [atm, ...forward.slice(0, Math.max(0, count - 1))];
}

export function isChainAlignedWithSpot(chain: OptionChainRow[], spot: number | null): boolean {
  if (!chain.length || spot == null) return false;
  const expected = strikesFromSpot(spot);
  if (!expected.length) return false;
  return chain[0]?.strike === expected[0];
}

function isValidChain(rows: OptionChainRow[] | undefined): rows is OptionChainRow[] {
  return (
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every(
      (r) =>
        r?.ce != null &&
        r?.pe != null &&
        Number.isFinite(Number(r.ce.ltp)) &&
        Number.isFinite(Number(r.pe.ltp))
    )
  );
}

export function resolveHeadlineSpot(
  spotRest: NiftySpotRest | null,
  tick: TickPayload | null,
  bars: MinuteBar[]
): number | null {
  const liveTick =
    tick?.spot != null &&
    Number.isFinite(tick.spot) &&
    tick.indexSource === 'mstock' &&
    !tick.indexFromLastCandle;
  if (liveTick) return tick.spot;

  const liveRest =
    spotRest?.spot != null &&
    Number.isFinite(spotRest.spot) &&
    spotRest.indexSource === 'mstock' &&
    (spotRest.indexLive === true || !spotRest.indexFromLastCandle);
  if (liveRest) return spotRest.spot;

  if (tick?.spot != null && Number.isFinite(tick.spot)) return tick.spot;
  if (spotRest?.spot != null && Number.isFinite(spotRest.spot)) return spotRest.spot;

  if (bars.length > 0) {
    const close = bars[bars.length - 1].close;
    if (Number.isFinite(close)) return close;
  }
  return null;
}

/** Keep chain + expiry only when strikes match headline spot (forward window). */
export function pickOptionChainSnapshot(
  spotRest: NiftySpotRest | null,
  tick: TickPayload | null,
  headlineSpot: number | null
): { chain: OptionChainRow[]; expiry: string | null } {
  const restChain = spotRest?.optionChain;
  const tickChain = tick?.optionChain;
  const expiry = spotRest?.optionChainExpiry ?? tick?.optionChainExpiry ?? null;

  if (isValidChain(restChain) && isChainAlignedWithSpot(restChain, headlineSpot)) {
    return { chain: restChain, expiry };
  }
  if (isValidChain(tickChain) && isChainAlignedWithSpot(tickChain, headlineSpot)) {
    return { chain: tickChain, expiry };
  }
  return { chain: [], expiry };
}
