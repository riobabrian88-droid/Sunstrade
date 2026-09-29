import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ids = "bitcoin,ethereum,binancecoin,solana,ripple,dogecoin,cardano,litecoin";
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to fetch live prices" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    const prices: Record<string, number> = {
      "BTC/USD": data.bitcoin?.usd,
      "ETH/USD": data.ethereum?.usd,
      "BNB/USD": data.binancecoin?.usd,
      "SOL/USD": data.solana?.usd,
      "XRP/USD": data.ripple?.usd,
      "DOGE/USD": data.dogecoin?.usd,
      "ADA/USD": data.cardano?.usd,
      "LTC/USD": data.litecoin?.usd,
    };

    const entries = Object.entries(prices).filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1])
    );

    const results = await Promise.all(entries.map(([symbol, price]) =>
      supabase.from("assets").update({
        price,
        updated_at: new Date().toISOString(),
      }).eq("symbol", symbol).select("symbol")
    ));

    for (const result of results) {
      if (result?.error) {
        console.error("Price update failed:", result.error.message);
      }
    }

    const availablePrices = Object.fromEntries(entries);

    return NextResponse.json({
      ...availablePrices,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Price service unavailable" },
      { status: 500 }
    );
  }
}
