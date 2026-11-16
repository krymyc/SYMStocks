import {NextResponse} from "next/server";

export const dynamic = "force-dynamic";

type SearchResult = {
  symbol?: string;
  instrument_name?: string;
  exchange?: string;
  currency?: string;
  country?: string;
  instrument_type?: string;
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!q || q.length > 40) return NextResponse.json({ status: "invalid", results: [] });
  if (!key) return NextResponse.json({ status: "not_configured", results: [], message: "Configure TWELVE_DATA_API_KEY to search the US equity universe." });

  try {
    const url = new URL("https://api.twelvedata.com/symbol_search");
    url.searchParams.set("symbol", q);
    url.searchParams.set("apikey", key);
    const response = await fetch(url, { next: { revalidate: 3600 } });
    const data = await response.json();
    if (!response.ok || data.status === "error") {
      return NextResponse.json({ status: "unavailable", results: [], message: data.message ?? "Symbol search unavailable." }, { status: 502 });
    }

    const allowedExchanges = /NASDAQ|NYSE|NYSE ARCA|NYSE MKT|AMEX|BATS|CBOE/i;
    const results = ((data.data ?? []) as SearchResult[])
      .filter((item) => {
        const country = (item.country ?? "").toLowerCase();
        const type = (item.instrument_type ?? "").toLowerCase();
        const exchange = item.exchange ?? "";
        const isUS = country === "united states" || country === "usa" || allowedExchanges.test(exchange);
        const isEquity = !type || type.includes("common stock") || type === "stock" || type === "etf";
        return isUS && isEquity && Boolean(item.symbol);
      })
      .slice(0, 25)
      .map((item) => ({
        symbol: item.symbol!,
        name: item.instrument_name ?? item.symbol!,
        exchange: item.exchange ?? "US",
        currency: item.currency ?? "USD",
      }));

    return NextResponse.json({ status: "provider", results });
  } catch {
    return NextResponse.json({ status: "unavailable", results: [], message: "Symbol search request failed." }, { status: 502 });
  }
}
