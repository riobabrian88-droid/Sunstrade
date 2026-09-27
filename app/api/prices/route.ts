import { NextResponse } from "next/server";

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
