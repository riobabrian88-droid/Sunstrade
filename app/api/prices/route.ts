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

async function getMarketPrice(pair: string): Promise<number | null> {
  for (const host of marketHosts) {
    try {
      const response = await fetch(
        `${host}/api/v3/ticker/price?symbol=${pair}`,
        { cache: "no-store" }
      );
      if (!response.ok) continue;
      const data: { price?: string } = await response.json();
      const price = Number(data.price);
      if (Number.isFinite(price) && price > 0) return price;
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
        const price = await getMarketPrice(pair);
        return price === null ? null : ([market, price] as [string, number]);
      })
    );

    const availablePrices = Object.fromEntries(
      entries.filter((entry): entry is [string, number] => entry !== null)
    );

    if (Object.keys(availablePrices).length === 0) {
      console.error("All Binance public market-data endpoints failed");
      return NextResponse.json(
        { error: "Market provider is unreachable. Please check the Vercel function logs." },
        { status: 502 }
      );
    }

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
      Object.entries(availablePrices).map(([symbol, price]) =>
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

    return NextResponse.json({
      ...availablePrices,
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
