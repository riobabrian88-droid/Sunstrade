import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function getMarketTicker(pair: string): Promise<{ price: number; change: number } | null> {
  for (const host of marketHosts) {
    try {
      const response = await fetch(
        `${host}/api/v3/ticker/24hr?symbol=${pair}`,
        { cache: "no-store" }
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
      (entry): entry is readonly [string, { price: number; change: number }] => entry !== null
    );

    if (available.length === 0) {
      console.error("All Binance public 24-hour ticker endpoints failed");
      return NextResponse.json(
        { error: "Market provider is unreachable. Please check the Vercel function logs." },
        { status: 502 }
      );
    }

    const prices = Object.fromEntries(available.map(([symbol, ticker]) => [symbol, ticker.price]));
    const changes = Object.fromEntries(available.map(([symbol, ticker]) => [symbol, ticker.change]));

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase server environment variables");
      return NextResponse.json(
        { error: "Price service is not configured" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const results = await Promise.all(
      Object.entries(prices).map(([symbol, price]) =>
        supabase
          .from("assets")
          .update({ price, updated_at: new Date().toISOString() })
          .eq("symbol", symbol)
          .select("symbol")
      )
    );

    for (const result of results) {
      if (result.error) {
        console.error("Price update failed:", result.error.message);
      }
    }

    // Check pending Limit/Stop orders against the freshly updated prices.
    const { data: executedCount, error: executionError } = await supabase.rpc(
      "process_pending_orders"
    );
    if (executionError) {
      // Price delivery should remain available even if order processing needs attention.
      console.error("Pending order processing failed:", executionError.message);
    }

    return NextResponse.json({
      ...prices,
      changes,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Price service error:", error);
    return NextResponse.json(
      { error: "Price service unavailable" },
      { status: 500 }
    );
  }
}
