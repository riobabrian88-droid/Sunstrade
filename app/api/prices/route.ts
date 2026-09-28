import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Unable to fetch live prices" },
        { status: 502 }
      );
    }

    const data = await response.json();

    // Save prices to Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );

    const priceData = [
      {
        symbol: "BTC/USD",
        price: data.bitcoin.usd,
        updated_at: new Date().toISOString(),
      },
      {
        symbol: "ETH/USD",
        price: data.ethereum.usd,
        updated_at: new Date().toISOString(),
      },
    ];

    const { error } = await supabase.from("prices").upsert(priceData, {
      onConflict: "symbol",
    });

    if (error) {
      console.error("Error saving prices to Supabase:", error);
    }

    return NextResponse.json({
      "BTC/USD": data.bitcoin.usd,
      "ETH/USD": data.ethereum.usd,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Price service unavailable" },
      { status: 500 }
    );
  }
}
