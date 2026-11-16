import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_API_SECRET?.trim();

  if (key && secret) {
    try {
      const url = new URL("https://data.alpaca.markets/v2/stocks/snapshots");
      url.searchParams.set("symbols", symbol);
      url.searchParams.set("feed", "iex");
      const response = await fetch(url, {
        headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json();
      const snapshot = data?.[symbol];
      if (response.ok && snapshot) {
        const latestTrade = snapshot.latestTrade;
        const dailyBar = snapshot.dailyBar;
        const previousBar = snapshot.prevDailyBar;
        const price = Number(latestTrade?.p ?? dailyBar?.c ?? previousBar?.c ?? 0);
        if (price > 0) {
          return NextResponse.json({
            symbol,
            status: "provider",
            source: "alpaca",
            price,
            previousClose: Number(previousBar?.c ?? 0) || null,
            dayOpen: Number(dailyBar?.o ?? 0) || null,
            dayHigh: Number(dailyBar?.h ?? 0) || null,
            dayLow: Number(dailyBar?.l ?? 0) || null,
            dayVolume: Number(dailyBar?.v ?? 0) || 0,
            lastTradeAt: latestTrade?.t ?? null,
            marketDataAsOf: latestTrade?.t ?? dailyBar?.t ?? previousBar?.t ?? null,
            isDelayedOrClosedFallback: !latestTrade?.p,
          });
        }
      }
    } catch {
      // Try the secondary provider below.
    }
  }

  const twelveKey = process.env.TWELVE_DATA_API_KEY;
  if (!twelveKey) {
    return NextResponse.json({ symbol, status: "unavailable", price: null, source: "none", message: "No quote provider returned a price." });
  }
  try {
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", twelveKey);
    const response = await fetch(url, { next: { revalidate: 30 } });
    const data = await response.json();
    const price = Number(data.close ?? data.price ?? 0);
    if (!response.ok || data.status === "error" || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ symbol, status: "unavailable", message: data.message ?? "Quote unavailable" }, { status: 502 });
    }
    return NextResponse.json({
      symbol,
      price,
      previousClose: Number(data.previous_close ?? 0) || null,
      status: "provider",
      source: "twelve_data",
      marketDataAsOf: data.datetime ?? null,
      isDelayedOrClosedFallback: true,
    });
  } catch {
    return NextResponse.json({ symbol, status: "unavailable", message: "Quote provider request failed." }, { status: 502 });
  }
}
