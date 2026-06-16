import type { OrderLogEntry, OrderRow } from '../types/niftyoptima';

type AssetLike = Pick<OrderLogEntry, 'assetType' | 'optionType'>;

export function isEquityOrder(entry: AssetLike): boolean {
  return entry.assetType === 'equity' || entry.optionType === 'EQ';
}

export function isNiftyOptionOrder(entry: AssetLike): boolean {
  if (isEquityOrder(entry)) return false;
  return entry.optionType === 'CE' || entry.optionType === 'PE';
}

export function filterNiftyOrderLogs(logs: OrderLogEntry[]): OrderLogEntry[] {
  return logs.filter(isNiftyOptionOrder);
}

export function filterEquityOrderLogs(logs: OrderLogEntry[]): OrderLogEntry[] {
  return logs.filter(isEquityOrder);
}

export function filterNiftyOrderRows(rows: OrderRow[]): OrderRow[] {
  return rows.filter(isNiftyOptionOrder);
}

export function filterEquityOrderRows(rows: OrderRow[]): OrderRow[] {
  return rows.filter(isEquityOrder);
}
