import { useNiftyAlpha } from '../context/NiftyAlphaContext';
import { AnalyticsDashboardCard } from '../components/AnalyticsDashboardCard';
import { HeatmapPlaceholder } from '../components/HeatmapPlaceholder';
import { LiveSpotBanner } from '../components/LiveSpotBanner';
import { PurchaseStrategyCard } from '../components/PurchaseStrategyCard';

export function DashboardPage() {
  const { actions } = useNiftyAlpha();

  return (
    <div
      className="page scroll"
      role="region"
      aria-label="Dashboard"
    >
      <div className="page-content">
        <LiveSpotBanner />
        <div className="gap" />
        <PurchaseStrategyCard />
        <div className="gap" />
        <AnalyticsDashboardCard />
        <div className="gap" />
        <HeatmapPlaceholder />
      </div>
      <button
        type="button"
        className="pull-refresh"
        onClick={() => actions.refresh()}
      >
        Pull to refresh
      </button>
    </div>
  );
}
