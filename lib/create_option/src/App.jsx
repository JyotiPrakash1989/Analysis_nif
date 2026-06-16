import { useState, useCallback, useEffect } from 'react';
import { getStrategyRules, getLiveNifty, checkLiveApi, runBacktest } from './services/strategyApi';
import LiveNiftyBanner from './components/LiveNiftyBanner';
import DisclaimerBanner from './components/DisclaimerBanner';
import StrategyRulesCard from './components/StrategyRulesCard';
import BacktestMetricsCard from './components/BacktestMetricsCard';
import './App.css';

const defaultRules = {
  entryDescription: 'Entry: NIFTY above 20 EMA, RSI < 30 (oversold) or RSI > 70 (overbought) with candlestick confirmation.',
  stopLossDescription: 'Stop-loss: 2% from entry (configurable).',
  exitDescription: 'Exit: Target 4% reward or stop-loss hit; time exit by 3:15 PM.',
};

export default function App() {
  const [liveNifty, setLiveNifty] = useState({ ltp: null, loading: true, error: '', fromLastCandle: false });
  const [rules, setRules] = useState(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState(false);
  const [checkingApi, setCheckingApi] = useState(false);
  const [apiMessage, setApiMessage] = useState(null);
  const [backtest, setBacktest] = useState({ loading: false, error: false, result: null });

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(false);
    try {
      const data = await getStrategyRules();
      setRules(data ?? defaultRules);
    } catch {
      setRulesError(true);
      setRules(defaultRules);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadLiveNifty = useCallback(async () => {
    setLiveNifty((p) => ({ ...p, loading: true, error: '' }));
    try {
      const { ltp, fromLastCandle, error } = await getLiveNifty();
      setLiveNifty({ ltp: ltp ?? null, loading: false, error: error || '', fromLastCandle: fromLastCandle ?? false });
    } catch (e) {
      setLiveNifty((p) => ({ ...p, loading: false, error: e.message || 'Failed to fetch' }));
    }
  }, []);

  const handleCheckApi = useCallback(async () => {
    if (checkingApi) return;
    setCheckingApi(true);
    setApiMessage(null);
    try {
      const { ok, message } = await checkLiveApi();
      setApiMessage(message);
    } finally {
      setCheckingApi(false);
    }
  }, [checkingApi]);

  const handleRunBacktest = useCallback(async () => {
    setBacktest({ loading: true, error: false, result: null });
    try {
      const result = await runBacktest();
      setBacktest({ loading: false, error: false, result });
    } catch {
      setBacktest((p) => ({ ...p, loading: false, error: true }));
    }
  }, []);

  const handleRetryBacktest = useCallback(() => {
    handleRunBacktest();
  }, [handleRunBacktest]);

  const refreshAll = useCallback(() => {
    loadRules();
    loadLiveNifty();
  }, [loadRules, loadLiveNifty]);

  useEffect(() => {
    loadRules();
    loadLiveNifty();
  }, [loadRules, loadLiveNifty]);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NIFTY Intraday Strategy Research</h1>
        <p className="app-subtitle">Option analysis & backtest</p>
      </header>

      <main className="app-main">
        <LiveNiftyBanner
          ltp={liveNifty.ltp}
          loading={liveNifty.loading}
          error={liveNifty.error}
          fromLastCandle={liveNifty.fromLastCandle}
          onRefresh={loadLiveNifty}
        />

        <DisclaimerBanner />

        {rulesLoading && (
          <div className="loading-block">
            <span className="spinner" /> Loading strategy rules…
          </div>
        )}
        {rulesError && (
          <div className="error-card">
            <p>Could not load strategy rules</p>
            <button type="button" className="btn btn-primary" onClick={loadRules}>Retry</button>
          </div>
        )}
        {!rulesLoading && rules && <StrategyRulesCard rules={rules} />}

        <div className="actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleCheckApi}
            disabled={checkingApi}
          >
            {checkingApi ? (
              <>
                <span className="spinner small" /> Checking…
              </>
            ) : (
              'Check live API'
            )}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunBacktest}
            disabled={backtest.loading}
          >
            {backtest.loading ? (
              <>
                <span className="spinner small" /> Running backtest…
              </>
            ) : (
              'Run Backtest'
            )}
          </button>
        </div>

        {apiMessage && (
          <div className={`snack ${apiMessage.startsWith('Live data API: Working') ? 'snack-success' : 'snack-info'}`}>
            {apiMessage}
          </div>
        )}

        {backtest.error && (
          <div className="error-card">
            <p>Backtest failed</p>
            <button type="button" className="btn btn-primary" onClick={handleRetryBacktest}>Retry</button>
          </div>
        )}

        {backtest.result && <BacktestMetricsCard result={backtest.result} />}
      </main>
    </div>
  );
}
