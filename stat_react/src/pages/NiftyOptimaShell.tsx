import { useEffect, useState } from 'react';
import { EquityAlertsProvider, useEquityAlerts } from '../context/EquityAlertsContext';
import { NiftyAlertsProvider, useNiftyAlerts } from '../context/NiftyAlertsContext';
import { OrderLogProvider } from '../context/OrderLogContext';
import { ViewModeBar, type ViewMode } from '../components/niftyoptima/ViewModeBar';
import { HistoryPage } from './HistoryPage';
import { NiftyOptimaDashboard } from './NiftyOptimaDashboard';
import { OrdersPage } from './OrdersPage';
import { StocksPage } from './StocksPage';

function AppBody({ tab, authTick }: { tab: ViewMode; authTick: number }) {
  if (tab === 'nifty') return <NiftyOptimaDashboard authTick={authTick} />;
  if (tab === 'stocks') return <StocksPage />;
  if (tab === 'orders') return <OrdersPage authTick={authTick} />;
  return <HistoryPage authTick={authTick} />;
}

function AppChrome({
  tab,
  setTab,
  authTick,
}: {
  tab: ViewMode;
  setTab: (tab: ViewMode) => void;
  authTick: number;
}) {
  const { profitableHint: niftyHint } = useNiftyAlerts();
  const { profitableHint: stockHint } = useEquityAlerts();

  return (
    <div className="min-h-screen bg-nox-bg flex flex-col">
      <ViewModeBar
        mode={tab}
        onChange={setTab}
        niftyHint={niftyHint}
        stockHint={stockHint}
      />
      <div className="flex-1 min-h-0">
        <AppBody tab={tab} authTick={authTick} />
      </div>
    </div>
  );
}

export function NiftyOptimaShell() {
  const [tab, setTab] = useState<ViewMode>('nifty');
  const [authTick, setAuthTick] = useState(0);

  useEffect(() => {
    const onAuth = () => setAuthTick((n) => n + 1);
    window.addEventListener('mstock-auth-ok', onAuth);
    return () => window.removeEventListener('mstock-auth-ok', onAuth);
  }, []);

  return (
    <OrderLogProvider>
      <NiftyAlertsProvider authTick={authTick}>
        <EquityAlertsProvider>
          <AppChrome tab={tab} setTab={setTab} authTick={authTick} />
        </EquityAlertsProvider>
      </NiftyAlertsProvider>
    </OrderLogProvider>
  );
}
