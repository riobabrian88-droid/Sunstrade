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

export async function GET() {
  try {
    const entries = await Promise.all(
      Object.entries(symbols).map(async ([market, pair]) => {
        try {
          const response = await fetch(
            `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`,
            { cache: "no-store" }
          );
          if (!response.ok) return null;
          const data: { price?: string } = await response.json();
          const price = Number(data.price);
          return Number.isFinite(price) && price > 0
            ? ([market, price] as [string, number])
            : null;
        } catch {
          return null;
        }
      })
    );

    const availablePrices = Object.fromEntries(
      entries.filter((entry): entry is [string, number] => entry !== null)
    );

    if (Object.keys(availablePrices).length === 0) {
      return NextResponse.json(
        { error: "Unable to fetch live prices from the market provider" },
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
