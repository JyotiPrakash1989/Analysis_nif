import { useEffect, useRef } from 'react';
import type { OptionChainRow, OrderRow } from '../types/niftyoptima';
import {
  equityPositionExitAlertKey,
  equityPositionExitVoiceText,
  markExitAlertSpoken,
  positionExitAlertKey,
  positionExitVoiceText,
  speakStrategyText,
  wasExitAlertSpoken,
} from '../lib/strategyVoice';

const OPEN_STATUSES = new Set(['open', 'submitted', 'simulated']);

function legLtp(row: OptionChainRow | undefined, side: 'CE' | 'PE'): number | null {
  if (!row) return null;
  const leg = side === 'CE' ? row.ce : row.pe;
  const ltp = Number(leg?.ltp);
  return Number.isFinite(ltp) ? ltp : null;
}

/** Live voice when open orders hit target or stop-loss (options + equity). */
export function useOrderListExitVoice(
  voiceEnabled: boolean,
  orders: OrderRow[],
  chain: OptionChainRow[]
) {
  const announcedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!voiceEnabled || !orders.length) return;

    for (const o of orders) {
      if (o.action === 'SELL' || o.outcome !== 'Open' || !OPEN_STATUSES.has(o.status)) continue;

      const sl = Number(o.sl);
      const tgt = Number(o.tgt);
      let ltp = Number(o.ltp);
      if (!Number.isFinite(ltp) || ltp <= 0) continue;

      if (o.assetType !== 'equity' && o.side !== 'EQ') {
        const row = chain.find((r) => r.strike === o.strike);
        ltp = legLtp(row, o.side as 'CE' | 'PE') ?? ltp;
      }
      if (!Number.isFinite(ltp)) continue;

      if (Number.isFinite(tgt) && tgt > 0 && ltp >= tgt) {
        const key =
          o.assetType === 'equity'
            ? equityPositionExitAlertKey(o.id, 'target')
            : positionExitAlertKey(o.id, 'target');
        if (announcedRef.current.has(key) || wasExitAlertSpoken(key)) continue;
        announcedRef.current.add(key);
        markExitAlertSpoken(key);
        const text =
          o.assetType === 'equity' && o.equitySymbol
            ? equityPositionExitVoiceText(o.equitySymbol, 'target', ltp, tgt)
            : positionExitVoiceText(o.strike, o.side as 'CE' | 'PE', 'target', ltp, tgt);
        speakStrategyText(text);
      } else if (Number.isFinite(sl) && sl > 0 && ltp <= sl) {
        const key =
          o.assetType === 'equity'
            ? equityPositionExitAlertKey(o.id, 'stoploss')
            : positionExitAlertKey(o.id, 'stoploss');
        if (announcedRef.current.has(key) || wasExitAlertSpoken(key)) continue;
        announcedRef.current.add(key);
        markExitAlertSpoken(key);
        const text =
          o.assetType === 'equity' && o.equitySymbol
            ? equityPositionExitVoiceText(o.equitySymbol, 'stoploss', ltp, sl)
            : positionExitVoiceText(o.strike, o.side as 'CE' | 'PE', 'stoploss', ltp, sl);
        speakStrategyText(text);
      }
    }
  }, [voiceEnabled, orders, chain]);
}
