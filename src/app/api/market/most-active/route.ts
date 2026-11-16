import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_API_SECRET?.trim();
  const missing = [
    !key ? "ALPACA_API_KEY" : null,
    !secret ? "ALPACA_API_SECRET" : null,
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    return NextResponse.json({
      status: "not_configured",
      source: "alpaca",
      missing,
      message: "Add the missing Alpaca environment variables to the symstocks Vercel project and redeploy Production.",
    });
  }

  // The missing-variable guard above guarantees both credentials exist.
  const headers: Record<string, string> = {
    "APCA-API-KEY-ID": key!,
    "APCA-API-SECRET-KEY": secret!,
    accept: "application/json",
  };

  try {
    const activeUrl = new URL("https://data.alpaca.markets/v1beta1/screener/stocks/most-actives");
    activeUrl.searchParams.set("by", "volume");
    activeUrl.searchParams.set("top", "100");

    const activeResponse = await fetch(activeUrl, { headers, cache: "no-store" });
    const activeData = await activeResponse.json();

    if (!activeResponse.ok || !Array.isArray(activeData.most_actives)) {
      return NextResponse.json({
        status: "unavailable",
        source: "alpaca",
        message: activeData.message ?? "Alpaca most-active screener unavailable.",
        providerStatus: activeResponse.status,
      });
    }

    const actives = activeData.most_actives as { symbol: string; volume: number; trade_count: number }[];
    const symbols = actives.map((item) => item.symbol).filter(Boolean);
    const snapshots = new Map<string, any>();

    for (let i = 0; i < symbols.length; i += 100) {
      const url = new URL("https://data.alpaca.markets/v2/stocks/snapshots");
      url.searchParams.set("symbols", symbols.slice(i, i + 100).join(","));
      url.searchParams.set("feed", "iex");
      const response = await fetch(url, { headers, cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        for (const [symbol, snapshot] of Object.entries(data)) snapshots.set(symbol, snapshot);
      }
    }

    const results = actives.map((item) => {
      const snapshot = snapshots.get(item.symbol);
      const price = Number(snapshot?.latestTrade?.p ?? snapshot?.dailyBar?.c ?? 0);
      const current = Number(snapshot?.dailyBar?.c ?? 0);
      const previous = Number(snapshot?.prevDailyBar?.c ?? 0);
      const change = previous > 0 && current > 0 ? (current / previous - 1) * 100 : null;
      return {
        symbol: item.symbol,
        name: item.symbol,
        exchange: "US",
        currency: "USD",
        volume: Number(item.volume) || 0,
        tradeCount: Number(item.trade_count) || 0,
        price,
        change,
      };
    });

    return NextResponse.json({
      status: "provider",
      source: "alpaca",
      lastUpdated: activeData.last_updated ?? new Date().toISOString(),
      feed: "IEX for quote snapshots",
      results,
    });
  } catch (error) {
    return NextResponse.json({
      status: "unavailable",
      source: "alpaca",
      message: error instanceof Error ? error.message : "Market data request failed.",
    });
  }
}
