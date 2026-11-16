import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

type Bar = { t: string; c: number };
type BarResponse = { bars?: Record<string, Bar[]> };

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
