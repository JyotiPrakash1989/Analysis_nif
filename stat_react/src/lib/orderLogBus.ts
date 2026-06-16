import type { OrderLogEntry } from '../types/niftyoptima';

/** Window event for optimistic order-log rows after manual/API placement. */
export const ORDER_LOG_EVENT = 'niftyoptima-order-log';

export function pushOrderLogEntry(row: OrderLogEntry) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<OrderLogEntry>(ORDER_LOG_EVENT, { detail: row }));
}

export function pushOrderLogEntries(rows: OrderLogEntry[]) {
  for (const row of rows) pushOrderLogEntry(row);
}
