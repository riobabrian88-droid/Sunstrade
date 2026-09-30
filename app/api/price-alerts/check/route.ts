import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Server is not configured" }, { status: 500 });
  }
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authClient = createClient(url, anonKey);
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { alertId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.alertId) return NextResponse.json({ error: "Missing alertId" }, { status: 400 });

  const supabase = createClient(url, serviceKey);
  const { data: alert, error: alertError } = await supabase.from("price_alerts")
    .select("id,user_id,symbol,target_price,condition")
    .eq("id", body.alertId).eq("user_id", authData.user.id)
    .eq("is_active", true).eq("is_triggered", false).maybeSingle();
  if (alertError) return NextResponse.json({ error: "Could not load alert" }, { status: 500 });
  if (!alert) return NextResponse.json({ triggered: false });

  const { data: asset, error: assetError } = await supabase.from("assets")
    .select("price").eq("symbol", alert.symbol).maybeSingle();
  if (assetError || !asset || !(Number(asset.price) > 0)) {
    return NextResponse.json({ error: "Current price unavailable" }, { status: 502 });
  }
  const price = Number(asset.price);
  const target = Number(alert.target_price);
  const hit = alert.condition === "above" ? price >= target : price <= target;
  if (!hit) return NextResponse.json({ triggered: false });

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase.from("price_alerts")
    .update({ is_triggered: true, is_active: false, triggered_at: now })
    .eq("id", alert.id).eq("user_id", authData.user.id)
    .eq("is_active", true).eq("is_triggered", false).select("id");
  if (claimError) return NextResponse.json({ error: "Could not claim alert" }, { status: 500 });
  if (!claimed?.length) return NextResponse.json({ triggered: false });

  const message = `${alert.symbol} reached ${price} (${alert.condition} ${target}).`;
  const { error: notificationError } = await supabase.from("price_alert_notifications").insert({
    user_id: authData.user.id, alert_id: alert.id, symbol: alert.symbol,
    target_price: target, triggered_price: price, message,
  });
  if (notificationError) {
    console.error("Could not save triggered price alert:", notificationError.message);
    return NextResponse.json({ error: "Alert triggered but notification could not be saved" }, { status: 500 });
  }

  let emailSent = false;
  const { data: preference, error: preferenceError } = await supabase.from("email_notification_preferences")
    .select("email_alerts_enabled").eq("user_id", authData.user.id).maybeSingle();
  if (preferenceError) console.error("Could not load email preference:", preferenceError.message);
  if (preference?.email_alerts_enabled) {
    const resendKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;
    if (resendKey && emailFrom && authData.user.email) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: emailFrom, to: [authData.user.email],
            subject: `SunStrade price alert: ${alert.symbol}`,
            text: `Your price alert was triggered.\n\n${message}\n\nTarget: ${target} USD\nTriggered price: ${price} USD`,
          }),
        });
        emailSent = response.ok;
        if (!response.ok) console.error("Email provider rejected alert:", await response.text());
      } catch (error) { console.error("Could not send price alert email:", error); }
    } else {
      console.error("Email alerts enabled, but email configuration or user email is missing.");
    }
  }
  return NextResponse.json({ triggered: true, message, emailSent });
}
