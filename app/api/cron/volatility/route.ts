import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const symbols: Record<string, string> = {
  "BTC/USD": "BTCUSDT", "ETH/USD": "ETHUSDT", "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT", "XRP/USD": "XRPUSDT", "DOGE/USD": "DOGEUSDT",
  "ADA/USD": "ADAUSDT", "LTC/USD": "LTCUSDT",
};
const hosts = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com"];

type Candle = [number, string, string, string, string, string, ...unknown[]];
const finite = (n: number) => Number.isFinite(n);
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
function stddev(xs: number[]) {
  if (xs.length < 2) return 0;
  const avg = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (xs.length - 1));
}
async function candles(pair: string, interval: string, limit: number): Promise<Candle[]> {
  for (const host of hosts) {
    try {
      const response = await fetch(`${host}/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${limit}`, {
        cache: "no-store", signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data) && data.length >= 15) return data as Candle[];
    } catch { /* try alternate Binance host */ }
  }
  throw new Error(`No candle data available for ${pair}`);
}
function calculate(ks: Candle[]) {
  const closed = ks.slice(0, -1); // ignore the currently forming candle
  const closes = closed.map(k => Number(k[4]));
  const returns = closes.slice(1).map((p, i) => Math.log(p / closes[i])).filter(finite);
  // Annualized standard deviation of daily log returns, expressed as a percentage.
  const volatilityPct = stddev(returns) * Math.sqrt(365) * 100;
  const tr: number[] = [];
  for (let i = 1; i < closed.length; i++) {
    const high = Number(closed[i][2]), low = Number(closed[i][3]), previousClose = Number(closed[i - 1][4]);
    tr.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
  }
  const last14 = tr.slice(-14);
  const atr14 = mean(last14);
  const price = closes[closes.length - 1];
  return { price, volatility_pct: volatilityPct, atr_14: atr14, atr_pct: price > 0 ? atr14 / price * 100 : 0 };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Server is not configured" }, { status: 500 });

  const supabase = createClient(url, key);
  const results = await Promise.allSettled(Object.entries(symbols).map(async ([symbol, pair]) => {
    const [daily, hourly] = await Promise.all([candles(pair, "1d", 22), candles(pair, "1h", 16)]);
    const dailyMetrics = calculate(daily);
    const hourlyMetrics = calculate(hourly);
    const metrics = {
      symbol, price: dailyMetrics.price, volatility_pct: dailyMetrics.volatility_pct,
      atr_14: hourlyMetrics.atr_14, atr_pct: hourlyMetrics.atr_pct,
      interval: "1d", sample_size: 20, source: "Binance Spot API", calculated_at: new Date().toISOString(),
    };
    const { error: writeError } = await supabase.from("asset_volatility_metrics").upsert(metrics, { onConflict: "symbol" });
    if (writeError) throw new Error(`Could not save ${symbol} metrics: ${writeError.message}`);
    await supabase.from("assets").update({ price: metrics.price }).eq("symbol", symbol);

    const { data: alerts, error: alertError } = await supabase.from("volatility_alerts")
      .select("id,user_id,symbol,threshold_pct,condition,last_triggered_at")
      .eq("symbol", symbol).eq("is_active", true);
    if (alertError) throw new Error(alertError.message);
    for (const alert of alerts || []) {
      const threshold = Number(alert.threshold_pct);
      const hit = alert.condition === "above" ? metrics.volatility_pct >= threshold : metrics.volatility_pct <= threshold;
      // Prevent duplicate notifications on every daily run; re-arm after 24 hours.
      const recentlyTriggered = alert.last_triggered_at && Date.now() - new Date(alert.last_triggered_at).getTime() < 24 * 60 * 60 * 1000;
      if (!hit || recentlyTriggered) continue;
      const now = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabase.from("volatility_alerts")
        .update({ last_triggered_at: now }).eq("id", alert.id)
        .or(`last_triggered_at.is.null,last_triggered_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`)
        .select("id");
      if (claimError || !claimed?.length) continue;
      await supabase.from("volatility_alert_notifications").insert({
        user_id: alert.user_id, alert_id: alert.id, symbol,
        volatility_pct: metrics.volatility_pct, threshold_pct: threshold,
        message: `${symbol} annualized volatility is ${metrics.volatility_pct.toFixed(2)}% (threshold ${alert.condition} ${threshold}%).`,
      });
    }
    return symbol;
  }));
  const succeeded = results.filter(r => r.status === "fulfilled").map(r => r.status === "fulfilled" ? r.value : "");
  const failed = results.filter(r => r.status === "rejected").map(r => r.status === "rejected" ? String(r.reason) : "");
  if (!succeeded.length) return NextResponse.json({ error: "Could not calculate metrics", details: failed }, { status: 502 });
  return NextResponse.json({ updated: succeeded, failed, calculatedAt: new Date().toISOString() }, { status: 200 });
}
