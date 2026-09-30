import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const symbols: Record<string, string> = {
  "BTC/USD": "BTCUSDT", "ETH/USD": "ETHUSDT", "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT", "XRP/USD": "XRPUSDT", "DOGE/USD": "DOGEUSDT",
  "ADA/USD": "ADAUSDT", "LTC/USD": "LTCUSDT",
};
const hosts = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com", "https://api2.binance.com", "https://api3.binance.com"];

async function ticker(pair: string): Promise<number | null> {
  for (const host of hosts) {
    try {
      const response = await fetch(`${host}/api/v3/ticker/price?symbol=${pair}`, { cache: "no-store" });
      if (!response.ok) continue;
      const data = await response.json();
      const price = Number(data.price);
      if (Number.isFinite(price) && price > 0) return price;
    } catch { /* try next provider */ }
  }
  return null;
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
  const entries = await Promise.all(Object.entries(symbols).map(async ([symbol, pair]) => [symbol, await ticker(pair)] as const));
  const prices = new Map(entries.filter((entry): entry is readonly [string, number] => entry[1] !== null));
  if (!prices.size) return NextResponse.json({ error: "Market provider unavailable" }, { status: 502 });

  const now = new Date().toISOString();
  const priceUpdates = await Promise.all([...prices].map(([symbol, price]) =>
    supabase.from("assets").update({ price, updated_at: now }).eq("symbol", symbol)
  ));
  const failed = priceUpdates.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: "Could not update market prices" }, { status: 500 });

  const { data: alerts, error } = await supabase.from("price_alerts")
    .select("id,user_id,symbol,target_price,condition")
    .eq("is_active", true).eq("is_triggered", false);
  if (error) return NextResponse.json({ error: "Could not load alerts" }, { status: 500 });

  let triggered = 0;
  for (const alert of alerts || []) {
    const price = prices.get(alert.symbol);
    if (price === undefined) continue;
    const target = Number(alert.target_price);
    const hit = alert.condition === "above" ? price >= target : price <= target;
    if (!hit) continue;

    const { data: claimed, error: claimError } = await supabase.from("price_alerts")
      .update({ is_triggered: true, is_active: false, triggered_at: now })
      .eq("id", alert.id).eq("is_active", true).eq("is_triggered", false).select("id");
    if (claimError || !claimed?.length) continue;

    const message = `${alert.symbol} reached ${price} (${alert.condition} ${target}).`;
    const { error: notificationError } = await supabase.from("price_alert_notifications").insert({
      user_id: alert.user_id, alert_id: alert.id, symbol: alert.symbol,
      target_price: target, triggered_price: price, message,
    });
    if (notificationError) {
      console.error("Could not save price alert notification:", notificationError.message);
      continue;
    }
    triggered++;

    const { data: preference, error: preferenceError } = await supabase
      .from("email_notification_preferences")
      .select("email_alerts_enabled")
      .eq("user_id", alert.user_id)
      .maybeSingle();
    if (preferenceError) {
      console.error("Could not load email preference:", preferenceError.message);
      continue;
    }
    if (!preference?.email_alerts_enabled) continue;

    const resendKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;
    if (!resendKey || !emailFrom) {
      console.error("Email alerts enabled, but RESEND_API_KEY or EMAIL_FROM is missing.");
      continue;
    }
    const { data: account, error: accountError } = await supabase.auth.admin.getUserById(alert.user_id);
    const recipient = account?.user?.email;
    if (accountError || !recipient) {
      console.error("Could not resolve email recipient:", accountError?.message || "No email");
      continue;
    }
    try {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [recipient],
          subject: `SunStrade price alert: ${alert.symbol}`,
          text: `Your price alert was triggered.\\n\\n${message}\\n\\nTarget: ${target} USD\\nTriggered price: ${price} USD`,
        }),
      });
      if (!emailResponse.ok) {
        console.error("Email provider rejected alert:", await emailResponse.text());
      }
    } catch (emailError) {
      console.error("Could not send price alert email:", emailError);
    }
  }

  const { error: orderError } = await supabase.rpc("process_pending_orders");
  if (orderError) console.error("Pending order processing failed:", orderError.message);

  return NextResponse.json({ updated: prices.size, triggered, checkedAt: now });
}
