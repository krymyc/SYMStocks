import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

const alpacaTimeframe = (interval: string) => ({
  "5min": "5Min",
  "15min": "15Min",
  "30min": "30Min",
  "1h": "1Hour",
  "2h": "2Hour",
  "4h": "4Hour",
  "1day": "1Day",
  "1week": "1Week",
  "1month": "1Month",
}[interval] ?? "1Day");

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const symbol = params.get("symbol")?.trim().toUpperCase();
  const interval = params.get("interval") ?? "1day";
  const outputsize = Math.min(5000, Math.max(1, Number(params.get("outputsize") ?? "90") || 90));
  if (!symbol || !/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const twelveKey = process.env.TWELVE_DATA_API_KEY;
  if (twelveKey) {
    try {
      const url = new URL("https://api.twelvedata.com/time_series");
      for (const [key, value] of Object.entries({ symbol, interval, outputsize: String(outputsize), apikey: twelveKey })) {
        url.searchParams.set(key, value);
      }
      const response = await fetch(url, { next: { revalidate: 300 } });
      const data = await response.json();
      if (response.ok && data.status !== "error" && Array.isArray(data.values) && data.values.length) {
        return NextResponse.json({
          status: "provider",
          source: "twelve_data",
          values: data.values.reverse().map((value: { datetime: string; close: string; open: string; high: string; low: string; volume: string }) => ({
            date: value.datetime,
            close: Number(value.close),
            open: Number(value.open),
            high: Number(value.high),
            low: Number(value.low),
            volume: Number(value.volume),
          })),
        });
      }
    } catch {
      // Fall back to Alpaca historical bars.
    }
  }

  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_API_SECRET?.trim();
  if (key && secret) {
    try {
      const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
      url.searchParams.set("timeframe", alpacaTimeframe(interval));
      url.searchParams.set("limit", String(Math.min(outputsize, 10000)));
      url.searchParams.set("feed", "iex");
      url.searchParams.set("sort", "asc");
      const response = await fetch(url, {
        headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.bars) && data.bars.length) {
        return NextResponse.json({
          status: "provider",
          source: "alpaca",
          values: data.bars.map((bar: { t: string; c: number; o: number; h: number; l: number; v: number }) => ({
            date: bar.t,
            close: Number(bar.c),
            open: Number(bar.o),
            high: Number(bar.h),
            low: Number(bar.l),
            volume: Number(bar.v),
          })),
        });
      }
      return NextResponse.json({ status: "unavailable", message: data.message ?? "Historical bars unavailable.", providerStatus: response.status }, { status: 502 });
    } catch {
      return NextResponse.json({ status: "unavailable", message: "Historical data provider request failed." }, { status: 502 });
    }
  }

  return NextResponse.json({ status: "unavailable", values: [], message: "No historical data provider is configured." });
}
