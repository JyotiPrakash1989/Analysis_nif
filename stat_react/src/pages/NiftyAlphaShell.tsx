import { useState, useEffect } from 'react';
import { useNiftyAlpha } from '../context/NiftyAlphaContext';
import { DashboardPage } from './DashboardPage';
import { TradePage } from './TradePage';
import { AlertsPage } from './AlertsPage';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '▣' },
  { id: 'trade', label: 'Trade', icon: '📊' },
  { id: 'alerts', label: 'Alerts', icon: '🔔' },
] as const;

export function NiftyAlphaShell() {
  const [index, setIndex] = useState(0);
  const { actions } = useNiftyAlpha();

  useEffect(() => {
    const interval = setInterval(() => actions.refresh(), 60_000);
    return () => clearInterval(interval);
  }, [actions]);

  const pages = [<DashboardPage key="d" />, <TradePage key="t" />, <AlertsPage key="a" />];

  return (
    <div className="shell">
      <div className="shell-content">
        {pages[index]}
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            className={`nav-tab ${i === index ? 'active' : ''}`}
            onClick={() => setIndex(i)}
            aria-current={i === index ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
