# Create Option – Strategy Analysis (Web)

React web app for **NIFTY Intraday Strategy Research** and option analysis. Mirrors the Flutter strategy research flow: live NIFTY display from **mStock**, strategy rules, backtest run, and CALL/PUT recommendation with metrics.

## Live NIFTY from mStock

The displayed NIFTY value is fetched from mStock (quote API, with historical-candle fallback). A small Node server runs alongside the app and keeps your API key server-side.

1. Copy `.env.example` to `.env` in this folder.
2. Set `MSTOCK_API_KEY` in `.env` (same key as in the Flutter app root `.env`).
3. Run **one command** (see below) – it starts both the API server and the app.

## Run locally

From **lib/create_option** run (one command starts API server + React app):

```bash
cd lib/create_option
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). The app proxies `/api/nifty` to the server on port 3001; the banner shows **Live NIFTY 50** or **NIFTY 50 (last close)** when mStock responds. If the API key is missing, the banner shows: *MSTOCK_API_KEY not set. Add it to lib/create_option/.env*.

## Build

```bash
npm run build
```

Output is in `dist/`. You can serve it with `npm run preview` or deploy the `dist` folder.

## Design

- **Tech:** React 18 + Vite 5
- **UI:** Dark theme, Outfit + JetBrains Mono, green (CALL) / red (PUT) accents
- **Live NIFTY:** Real data from mStock via `server.js` (GET /api/nifty). Other data (rules, backtest) is still mock in `src/services/strategyApi.js`.

## Structure

- `src/App.jsx` – Main page and state
- `src/components/` – LiveNiftyBanner, DisclaimerBanner, StrategyRulesCard, BacktestMetricsCard
- `src/services/strategyApi.js` – Strategy rules, live NIFTY, check API, run backtest (mock)
