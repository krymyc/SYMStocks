# SYMStocks

US equity market tracker focused on custom watchlists. No portfolio or paper-trading module.

## Local setup
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Market data

The Dashboard requests the top 100 US stocks by daily trading volume from Alpaca's most-active screener and retrieves IEX quote snapshots.

Create a free Alpaca account and add these server-side environment variables:
```bash
ALPACA_API_KEY=your_key
ALPACA_API_SECRET=your_secret
```

Never expose credentials in browser code or commit them to Git.

The free Alpaca Basic market-data plan has limited real-time US equity coverage (IEX), not consolidated all-exchange volume. Alpaca documents its most-active endpoint as SIP-based; availability of that endpoint under Basic must be confirmed with the account. If the endpoint is not entitled, the dashboard will show a market-data error rather than fabricate a ranking.

Optional `TWELVE_DATA_API_KEY` remains for the existing individual-symbol search, quote and history adapters. It is not used by the Dashboard's top-volume list.

## Vercel
Add `ALPACA_API_KEY` and `ALPACA_API_SECRET` under Settings → Environment Variables for Production, Preview and Development, then redeploy. Add `TWELVE_DATA_API_KEY` only if continuing to use its optional endpoints.

## Endpoints
- `/api/market/most-active` — top 100 US most-active symbols by volume and IEX snapshots.
- `/api/quote?symbol=NVDA` — optional Twelve Data quote.
- `/api/history?symbol=NVDA&interval=1day&outputsize=90` — optional Twelve Data history.
- `/api/search?q=semiconductor` — optional Twelve Data symbol search.

Watchlists are stored locally in the browser. CSV import currently supports watchlist creation from portfolio snapshots and preview of historical data; imported data is not a persistent market-data source.
