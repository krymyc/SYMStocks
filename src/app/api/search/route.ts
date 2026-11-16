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

const US_EXCHANGES = [
  "NASDAQ", "NYSE", "NYSE ARCA", "NYSE AMERICAN", "NYSE MKT",
  "AMEX", "CBOE BZX", "CBOE", "BATS", "IEX",
];

function isUsListed(exchange: string) {
  const normalized = exchange.trim().toUpperCase().replace(/\\s+/g, " ");
  return US_EXCHANGES.some((name) => normalized === name || normalized.startsWith(name + " "));
}

const ALLOWED_TYPES = new Set([
  "common stock",
  "stock",
  "etf",
  "american depositary receipt",
  "depositary receipt",
  "global depositary receipt",
]);

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!q || q.length > 40) return NextResponse.json({ status: "invalid", results: [] });
  if (!key) return NextResponse.json({ status: "not_configured", results: [], message: "Configure TWELVE_DATA_API_KEY to search the US equity universe." });

  try {
    const url = new URL("https://api.twelvedata.com/symbol_search");
    url.searchParams.set("symbol", q);
    url.searchParams.set("outputsize", "60");
    url.searchParams.set("apikey", key);
    const response = await fetch(url, { next: { revalidate: 3600 } });
    const data = await response.json();
    if (!response.ok || data.status === "error") {
      return NextResponse.json({ status: "unavailable", results: [], message: data.message ?? "Symbol search unavailable." }, { status: 502 });
    }

    const results = ((data.data ?? []) as SearchResult[])
      .filter((item) => {
        const exchange = item.exchange ?? "";
        const type = (item.instrument_type ?? "").trim().toLowerCase();
        return isUsListed(exchange) && (!type || ALLOWED_TYPES.has(type));
      })
      .map((item) => ({
        symbol: item.symbol!,
        name: item.instrument_name ?? item.symbol!,
        exchange: item.exchange!,
        currency: item.currency ?? "USD",
      }))
      .filter((item) => Boolean(item.symbol))
      .slice(0, 25);

    return NextResponse.json({ status: "provider", results });
  } catch {
    return NextResponse.json({ status: "unavailable", results: [], message: "Symbol search request failed." }, { status: 502 });
  }
}
