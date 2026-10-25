import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const cryptoSymbols: Record<string, string> = {
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
  "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT",
  "XRP/USD": "XRPUSDT",
  "DOGE/USD": "DOGEUSDT",
  "ADA/USD": "ADAUSDT",
  "LTC/USD": "LTCUSDT",
  "AVAX/USD": "AVAXUSDT",
  "LINK/USD": "LINKUSDT",
  "DOT/USD": "DOTUSDT",
  "TRX/USD": "TRXUSDT",
  "BCH/USD": "BCHUSDT",
  "SHIB/USD": "SHIBUSDT",
  "TON/USD": "TONUSDT",
};

const twelveDataSymbols = [
  // Keep at or below the Basic plan's eight API-credit-per-minute limit.
  // XAG/USD is temporarily excluded because it did not return a usable quote.
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "AUD/USD",
  "USD/CHF",
  "USD/CAD",
  "NZD/USD",
  "XAU/USD",
];

const marketHosts = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
];

type Ticker24h = { lastPrice?: string; priceChangePercent?: string };

async function getCryptoTicker(
  pair: string
): Promise<{ price: number; change: number } | null> {
  for (const host of marketHosts) {
    try {
      const response = await fetch(
        `${host}/api/v3/ticker/24hr?symbol=${pair}`,
        { next: { revalidate: 30 } }
      );
      if (!response.ok) continue;
      const data: Ticker24h = await response.json();
      const price = Number(data.lastPrice);
      const change = Number(data.priceChangePercent);
      if (Number.isFinite(price) && price > 0 && Number.isFinite(change)) {
        return { price, change };
      }
    } catch {
      // Try the next public market-data endpoint.
    }
  }
  return null;
}

type TwelveQuote = {
  close?: string;
  price?: string;
  percent_change?: string;
  status?: string;
  message?: string;
};

async function getTwelveDataQuotes(): Promise<Record<string, { price: number; change: number }>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return {};

  try {
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", twelveDataSymbols.join(","));
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url.toString(), {
      next: { revalidate: 300 },
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.error("Twelve Data quote request failed with status:", response.status);
      return {};
    }

    const data: Record<string, TwelveQuote> | TwelveQuote = await response.json();
    const result: Record<string, { price: number; change: number }> = {};

    // Twelve Data returns a keyed object for multi-symbol requests. Also handle
    // a single-symbol style response defensively if the provider changes format.
    for (const symbol of twelveDataSymbols) {
      const quote = (data as Record<string, TwelveQuote>)[symbol];
      if (!quote || quote.status === "error") continue;
      const price = Number(quote.close ?? quote.price);
      const change = Number(quote.percent_change);
      if (Number.isFinite(price) && price > 0) {
        result[symbol] = {
          price,
          change: Number.isFinite(change) ? change : 0,
        };
      }
    }

    return result;
  } catch (error) {
    console.error("Twelve Data market feed unavailable:", error);
    return {};
  }
}

export async function GET() {
  try {
    const [cryptoEntries, otherQuotes] = await Promise.all([
      Promise.all(
        Object.entries(cryptoSymbols).map(async ([market, pair]) => {
          const ticker = await getCryptoTicker(pair);
          return ticker ? ([market, ticker] as const) : null;
        })
      ),
      getTwelveDataQuotes(),
    ]);

    const cryptoAvailable = cryptoEntries.filter(
      (entry): entry is readonly [string, { price: number; change: number }] =>
        entry !== null
    );

    const quotes: Record<string, { price: number; change: number }> = {
      ...Object.fromEntries(cryptoAvailable),
      ...otherQuotes,
    };

    if (Object.keys(quotes).length === 0) {
      return NextResponse.json(
        { error: "Market data providers are unavailable. Check the server logs." },
        { status: 502 }
      );
    }

    const prices = Object.fromEntries(
      Object.entries(quotes).map(([symbol, quote]) => [symbol, quote.price])
    );
    const changes = Object.fromEntries(
      Object.entries(quotes).map(([symbol, quote]) => [symbol, quote.change])
    );

    // Public read-only quotes only. Never perform database writes or order
    // processing from this endpoint.
    return NextResponse.json(
      { ...prices, changes, updatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Price service error:", error);
    return NextResponse.json(
      { error: "Price service unavailable" },
      { status: 500 }
    );
  }
}
