import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CorganoResponse = {
  data?: {
    metal?: string;
    symbol?: string;
    price_usd?: { per_oz?: number };
    change_usd?: number;
    change_pct?: number;
    as_of?: string;
  };
  attribution?: {
    required?: boolean;
    text?: string;
    url?: string;
  };
  meta?: Record<string, unknown>;
};

export async function GET() {
  try {
    const response = await fetch("https://silverprice.corgano.com/api/v1/latest", {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { provider: "Corgano", error: "Silver provider returned an unsuccessful response", status: response.status },
        { status: 502 }
      );
    }

    const payload: CorganoResponse = await response.json();
    const price = payload.data?.price_usd?.per_oz;
    const asOf = payload.data?.as_of;
    const parsedTime = asOf ? Date.parse(asOf) : NaN;
    const ageSeconds = Number.isFinite(parsedTime)
      ? Math.max(0, Math.floor((Date.now() - parsedTime) / 1000))
      : null;

    if (
      payload.data?.metal !== "silver" ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(parsedTime) ||
      parsedTime > Date.now() + 60
    ) {
      return NextResponse.json(
        { provider: "Corgano", error: "Provider response failed price or timestamp validation" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      provider: "Corgano",
      symbol: "XAG/USD",
      unit: "USD per troy ounce",
      price,
      change: typeof payload.data?.change_pct === "number" ? payload.data.change_pct : null,
      asOf,
      ageSeconds,
      freshWithinFiveMinutes: ageSeconds <= 300,
      attribution: {
        text: payload.attribution?.text ?? "Silver price data by Corgano",
        url: payload.attribution?.url ?? "https://silverprice.corgano.com/",
      },
      testedAt: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(
      { provider: "Corgano", error: "Could not reach or parse the silver-price provider" },
      { status: 502 }
    );
  }
}
