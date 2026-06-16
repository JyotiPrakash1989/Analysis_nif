import { createContext, useContext, type ReactNode } from 'react';
import { useOrderLog } from '../hooks/useOrderLog';

type OrderLogContextValue = ReturnType<typeof useOrderLog>;

const OrderLogContext = createContext<OrderLogContextValue | null>(null);

export function OrderLogProvider({ children }: { children: ReactNode }) {
  const value = useOrderLog(3000);
  return <OrderLogContext.Provider value={value}>{children}</OrderLogContext.Provider>;
}

export function useSharedOrderLog() {
  const ctx = useContext(OrderLogContext);
  if (!ctx) throw new Error('useSharedOrderLog must be used within OrderLogProvider');
  return ctx;
}
