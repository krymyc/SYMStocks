import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

type Bar = { t: string; c: number };
type BarResponse = { bars?: Record<string, Bar[]> };
type NasdaqRow = { symbol?: string; marketCap?: string | number | null };

async function loadCaps(symbols: string[]) {
  const caps = new Map<string, number>();
  await Promise.all(["NASDAQ", "NYSE", "AMEX"].map(async exchange => {
    try {
      const url = new URL("https://api.nasdaq.com/api/screener/stocks");
      url.searchParams.set("tableonly", "true"); url.searchParams.set("limit", "5000"); url.searchParams.set("offset", "0"); url.searchParams.set("exchange", exchange);
      const response = await fetch(url, { headers: { accept: "application/json, text/plain, */*", "user-agent": "Mozilla/5.0 (compatible; SYMStocks/1.0)", origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/market-activity/stocks/screener" }, next: { revalidate: 3600 } });
      if (!response.ok) return;
      const rows = (await response.json())?.data?.rows;
      if (!Array.isArray(rows)) return;
      for (const row of rows as NasdaqRow[]) {
        const symbol = String(row.symbol ?? "").trim().toUpperCase();
        if (!symbols.includes(symbol)) continue;
        const raw = row.marketCap;
        const text = String(raw ?? "").trim().replace(/[$,\s]/g, "").toUpperCase();
        const match = text.match(/^([0-9]*\.?[0-9]+)([KMBT])?$/);
        const scale = ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[match?.[2] ?? ""] ?? 1;
        const value = typeof raw === "number" ? raw : match ? Number(match[1]) * scale : Number.NaN;
        if (symbol && Number.isFinite(value) && value > 0) caps.set(symbol, value);
      }
    } catch { /* Optional market-cap enrichment. */ }
  }));
  return caps;
}

export async function GET(req: Request) {
  const symbols = [...new Set((new URL(req.url).searchParams.get("symbols") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9.^=-]{1,20}$/.test(s)))].slice(0, 100);

  if (!symbols.length) return NextResponse.json({ status: "provider", quotes: {} });

  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_API_SECRET?.trim();
  if (!key || !secret) return NextResponse.json({ status: "unavailable", quotes: {}, message: "Alpaca is not configured." });

  const headers = { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, accept: "application/json" };
  try {
    const snapshotsUrl = new URL("https://data.alpaca.markets/v2/stocks/snapshots");
    snapshotsUrl.searchParams.set("symbols", symbols.join(","));
    snapshotsUrl.searchParams.set("feed", "iex");

    const oneYearAgo = new Date(Date.now() - 370 * 24 * 60 * 60 * 1000);
    const barsUrl = buildBarsUrl(symbols, oneYearAgo);
    const [snapshotResponse, barsResponse] = await Promise.all([
      fetch(snapshotsUrl, { headers, next: { revalidate: 60 } }),
      fetch(barsUrl, { headers, next: { revalidate: 300 } }),
    ]);

    const snapshots = snapshotResponse.ok ? await snapshotResponse.json() : {};
    const historical: BarResponse = barsResponse.ok ? await barsResponse.json() : {};
    const marketCaps = await loadCaps(symbols);
    const quotes: Record<string, unknown> = {};
    const now = Date.now();
    const monthTarget = now - 30 * 24 * 60 * 60 * 1000;
    const yearTarget = now - 365 * 24 * 60 * 60 * 1000;

    for (const symbol of symbols) {
      const snap = snapshots[symbol];
      const price = Number(snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? snap?.prevDailyBar?.c ?? 0) || null;
      const previousClose = Number(snap?.prevDailyBar?.c ?? 0) || null;
      const dayChange = price && previousClose ? (price / previousClose - 1) * 100 : null;
      const bars = historical.bars?.[symbol] ?? [];
      const referenceClose = (target: number) => {
        const eligible = bars.filter(bar => new Date(bar.t).getTime() <= target && Number(bar.c) > 0);
        return eligible.length ? Number(eligible[eligible.length - 1].c) : null;
      };
      const monthReference = referenceClose(monthTarget);
      const yearReference = referenceClose(yearTarget);
      quotes[symbol] = {
        price,
        dayChange,
        monthChange: monthReference && price ? (price / monthReference - 1) * 100 : null,
        yearChange: yearReference && price ? (price / yearReference - 1) * 100 : null,
        dayVolume: Number(snap?.dailyBar?.v ?? 0) || null,
        marketCap: marketCaps.get(symbol) ?? null,
        asOf: snap?.latestTrade?.t ?? snap?.dailyBar?.t ?? null,
      };
    }

    return NextResponse.json({ status: "provider", source: "alpaca", quotes });
  } catch {
    return NextResponse.json({ status: "unavailable", quotes: {}, message: "Batch quotes unavailable." }, { status: 502 });
  }
}

function buildBarsUrl(symbols: string[], start: Date) {
  const url = new URL("https://data.alpaca.markets/v2/stocks/bars");
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("timeframe", "1Day");
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("limit", "10000");
  url.searchParams.set("feed", "iex");
  url.searchParams.set("sort", "asc");
  return url;
}
