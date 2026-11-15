# SYMStocks

Global stock watchlist and paper-portfolio simulator.

## Setup
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Market data
Server-side adapters for Twelve Data quotes, time series and symbol search are included. Add `TWELVE_DATA_API_KEY` in Vercel Environment Variables to activate. Without a key the interface remains in explicitly-labelled demo mode. Real-time exchange access depends on provider entitlements. Never commit API keys.

CSV import supports Yahoo Finance Date/Close or Adj Close fields. The first iteration parses and previews CSV files locally.

This tool is for monitoring and paper simulations, not a broker or investment advice service.