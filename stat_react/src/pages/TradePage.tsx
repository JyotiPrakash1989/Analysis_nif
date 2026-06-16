import { ChartPlaceholder } from '../components/ChartPlaceholder';
import { ExecutionBar } from '../components/ExecutionBar';
import { LiveSpotBanner } from '../components/LiveSpotBanner';
import { PurchaseStrategyCard } from '../components/PurchaseStrategyCard';
import { SmartStrikeCard } from '../components/SmartStrikeCard';

export function TradePage() {
  return (
    <div className="page scroll" role="region" aria-label="Trade">
      <div className="page-content">
        <LiveSpotBanner />
        <div className="gap" />
        <PurchaseStrategyCard />
        <div className="gap" />
        <ChartPlaceholder />
        <div className="gap" />
        <SmartStrikeCard />
        <div className="gap" />
        <ExecutionBar />
        <div className="gap-sm" />
        <button type="button" className="btn btn-outline full">
          📦 Basket order (e.g. Bull Call Spread)
        </button>
        <div className="gap" />
        <p className="risk-disclaimer">
          Options are high-risk. Consider spreads for higher Probability of Profit.
        </p>
      </div>
    </div>
  );
}
