# SYMStocks

Global stock watchlist and paper-portfolio simulator.

## Local setup
```bash
npm install
cp .env.example .env.local
npm run dev
```

Add your Twelve Data key to `.env.local`:
```bash
TWELVE_DATA_API_KEY=your_key_here
```
Never expose the key in browser code or commit it to Git.

## Deploy on Vercel
1. Import `krymyc/SYMStocks` from GitHub as a Next.js project.
2. Keep the Root Directory as `./` and use the default build settings.
3. Add the Environment Variable `TWELVE_DATA_API_KEY` for Production, Preview and Development.
4. Redeploy after saving the variable.

## Market-data endpoints
- `/api/health` — confirms whether a server-side key is configured (does not expose it).
- `/api/quote?symbol=NVDA` — latest provider quote.
- `/api/history?symbol=NVDA&interval=1day&outputsize=90` — historical time series.
- `/api/search?q=semiconductor` — provider symbol search.

The Markets view searches the local starter universe and Twelve Data. The selected instrument's quote and chart use Twelve Data when available. Sample values remain clearly labelled when provider data is unavailable. API usage and real-time exchange access depend on the Twelve Data plan and exchange entitlements.

## Current scope
- Dashboard, global starter universe and watchlists.
- Browser-session paper portfolios.
- Yahoo Finance CSV parsing and preview (not yet persisted).
- Twelve Data server-side quote, history and symbol-search adapters.

This is a monitoring and paper-simulation tool, not a broker or investment advice service.
