import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const symbols: Record<string, string> = {
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
  "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT",
  "XRP/USD": "XRPUSDT",
  "DOGE/USD": "DOGEUSDT",
  "ADA/USD": "ADAUSDT",
  "LTC/USD": "LTCUSDT",
};

const marketHosts = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
];

type Ticker24h = {
  lastPrice?: string;
  priceChangePercent?: string;
};

async function getMarketTicker(
  pair: string
): Promise<{ price: number; change: number } | null> {
  for (const host of marketHosts) {
    try {
      const response = await fetch(
        `${host}/api/v3/ticker/24hr?symbol=${pair}`,
        { next: { revalidate: 15 } }
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

export async function GET() {
  try {
    const entries = await Promise.all(
      Object.entries(symbols).map(async ([market, pair]) => {
        const ticker = await getMarketTicker(pair);
        return ticker ? ([market, ticker] as const) : null;
      })
    );

    const available = entries.filter(
      (entry): entry is readonly [string, { price: number; change: number }] =>
        entry !== null
    );

    if (available.length === 0) {
      console.error("All Binance public 24-hour ticker endpoints failed");
      return NextResponse.json(
        { error: "Market provider is unreachable. Please check the Vercel function logs." },
        { status: 502 }
      );
    }

    const prices = Object.fromEntries(
      available.map(([symbol, ticker]) => [symbol, ticker.price])
    );
    const changes = Object.fromEntries(
      available.map(([symbol, ticker]) => [symbol, ticker.change])
    );

    // This public endpoint only returns market quotes. Database writes and
    // pending-order execution belong in the CRON_SECRET-protected route.
    return NextResponse.json(
      {
        ...prices,
        changes,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
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
