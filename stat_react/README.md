# NiftyOptima Web

React (Vite) + Tailwind + Lightweight Charts dashboard with a Node.js **Express + Socket.io** backend. The PRD flow is: **broker WebSocket → analysis engine → Socket.io → UI**; keys and `placeOrder` stay on the server.

## Run

```bash
npm install
npm run dev
```

(`npm start` is the same as `npm run dev` — API server + Vite together. Do **not** run `npm run vite` alone unless the API is already on port 3200.)

- UI: Vite dev server (default `http://localhost:5173`).
- API + WebSocket: `http://localhost:3200` (see `NIFTYOPTIMA_PORT` in `.env`).

With no env override, the browser uses the **Vite proxy** for `/api/*` and `/socket.io`, so you do not need `VITE_NIFTYOPTIMA_API` for local development.

### mStock live NIFTY (optional)

Type B quote/historical need **`access_token`** from mStock’s session API (saved as `MSTOCK_JWT_TOKEN`):

`POST https://api.mstock.trade/openapi/typea/session/token`  
(form fields: `api_key`, `request_token` = SMS OTP, `checksum` = `L`)

```bash
cd stat_react
npm run mstock:token    # OTP only → writes MSTOCK_JWT_TOKEN to .env
# or
npm run mstock:login    # username/password → OTP → session/token
npm run dev
```

JWT expires at **midnight**. Without it, the headline uses delayed public NIFTY (^NSEI).

### OTP on first page load (default)

1. Run `npm run dev` and open the UI.
2. Enter mStock **client ID**, **password**, click **Send OTP to mobile**.
3. Enter the SMS **OTP** and click **Continue**.
4. Live NIFTY uses mStock for the rest of the day (until midnight).

Server endpoints: `GET /api/mstock/auth-status`, `POST /api/mstock/request-otp`, `POST /api/mstock/session-token`.

### Auto JWT with TOTP (optional, server-only)

1. On [trade.mstock.com](https://trade.mstock.com) → Trading APIs → **Enable TOTP** and save the **base32 secret**.
2. Add to `.env`:

```env
MSTOCK_API_KEY=your_key
MSTOCK_TOTP_SECRET=YOUR_BASE32_SECRET
```

3. Refresh token (writes `MSTOCK_JWT_TOKEN`):

```bash
npm run mstock:totp
npm run dev
```

On server start, if `MSTOCK_TOTP_SECRET` is set, JWT is fetched automatically via `session/verifytotp` ([Type A User docs](https://tradingapi.mstock.com/docs/v1/typeA/User/)).

### mStock broadcast WebSocket (live headline)

For official mStock feed URL/auth from docs, use:

```env
MSTOCK_JWT_TOKEN=eyJhbGciOiJIUzI1NiIs...
# optional explicit ws url
# MSTOCK_WS_URL=wss://ws.mstock.trade?API_KEY=your_api_key&ACCESS_TOKEN=your_jwt
```

The server connects on startup, subscribes to NIFTY (`999260`), and uses WebSocket LTP for the headline (REST polling is skipped while WS is fresh).

If you want to update the token without restarting, call:

```bash
curl -X POST http://localhost:3200/api/mstock/session-token \
  -H "Content-Type: application/json" \
  -d '{"requestToken":"123456","checksum":"L"}'
```

This endpoint exchanges OTP using `https://api.mstock.trade/openapi/typea/session/token`, updates in-memory JWT for the running server, and starts/refreshes live mStock feed.

## What is implemented

- Mock **Nifty spot** + **1m bars** (swap for **MTicker** in `server/feedEngine.mjs` when credentials are ready).
- **RSI(14)**, **prior 15m high/low**, breakout + RSI filter → **CE/PE suggestion** with **SL** (15% premium vs signal-candle low, tighter = higher SL price) and **TGT = Entry + 2×(Entry−SL)**.
- **Option chain** table: ATM ±2 strikes (5 rows), LTP / OI change % / volume for CE and PE.
- **Signal card** (green CE / red PE) and **Execute trade** → `POST /api/place-order` (mock by default; set `MSTOCK_USE_SDK=true` and install `@mstock-mirae-asset/nodetradingapi-typea` to extend `server/placeOrder.mjs`).
- **Order book** with simulated P&amp;L vs chain LTP (lot factor 75 for display only).
- **Auto-reconnect**: Socket.io client options + optional server-side simulated feed drop when `SIMULATE_FEED_DROP_MS` is set.

## Legacy

- `server/proxy.js` — older standalone Type B proxy; the main app now uses `server/index.mjs` (Express) which also exposes `/api/mstock/quote` when `MSTOCK_API_KEY` is set.
