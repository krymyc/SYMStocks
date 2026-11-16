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
        const text = String(raw ?? "").trim().replace(/[$,\\s]/g, "").toUpperCase();
        const match = text.match(/^([0-9]*\\.?[0-9]+)([KMBT])?$/);
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

    const [snapshotResponse, monthResponse, yearResponse] = await Promise.all([
      fetch(snapshotsUrl, { headers, cache: "no-store" }),
      fetch(buildBarsUrl(symbols, 30), { headers, cache: "no-store" }),
      fetch(buildBarsUrl(symbols, 260), { headers, cache: "no-store" }),
    ]);

    const snapshots = snapshotResponse.ok ? await snapshotResponse.json() : {};
    const monthBars: BarResponse = monthResponse.ok ? await monthResponse.json() : {};
    const yearBars: BarResponse = yearResponse.ok ? await yearResponse.json() : {};

    const quotes: Record<string, unknown> = {};
    const marketCaps = await loadCaps(symbols);
    for (const symbol of symbols) {
      const snap = snapshots[symbol];
      const price = Number(snap?.latestTrade?.p ?? snap?.dailyBar?.c ?? snap?.prevDailyBar?.c ?? 0) || null;
      const previousClose = Number(snap?.prevDailyBar?.c ?? 0) || null;
      const dayChange = price && previousClose ? (price / previousClose - 1) * 100 : null;
      const month = monthBars.bars?.[symbol] ?? [];
      const year = yearBars.bars?.[symbol] ?? [];
      const monthStart = month.length ? Number(month[0].c) : null;
      const yearStart = year.length ? Number(year[0].c) : null;
      quotes[symbol] = {
        price,
        dayChange,
        monthChange: monthStart && price ? (price / monthStart - 1) * 100 : null,
        yearChange: yearStart && price ? (price / yearStart - 1) * 100 : null,
        asOf: snap?.latestTrade?.t ?? snap?.dailyBar?.t ?? null,
      };
    }

    return NextResponse.json({ status: "provider", source: "alpaca", quotes });
  } catch {
    return NextResponse.json({ status: "unavailable", quotes: {}, message: "Batch quotes unavailable." }, { status: 502 });
  }
}

function buildBarsUrl(symbols: string[], limit: number) {
  const url = new URL("https://data.alpaca.markets/v2/stocks/bars");
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("timeframe", "1Day");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("feed", "iex");
  url.searchParams.set("sort", "asc");
  return url;
}
