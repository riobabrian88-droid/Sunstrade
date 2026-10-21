"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
type Metric = { symbol: string; price: number; volatility_pct: number; atr_14: number; atr_pct: number; calculated_at: string };
type Alert = { id: number; symbol: string; threshold_pct: number; condition: "above" | "below"; is_active: boolean; created_at: string };
const money = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 }).format(n);
function level(n: number) { return n < 25 ? "Low" : n < 50 ? "Moderate" : n < 75 ? "High" : "Extreme"; }
function levelColor(n: number) { return n < 25 ? "#34d399" : n < 50 ? "#a3e635" : n < 75 ? "#fbbf24" : "#fb7185"; }

export default function VolatilityPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("BTC/USD");
  const [threshold, setThreshold] = useState("50");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [status, setStatus] = useState("Loading market metrics…");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("asset_volatility_metrics").select("symbol,price,volatility_pct,atr_14,atr_pct,calculated_at").order("volatility_pct", { ascending: false });
    if (error) { setStatus("Run supabase/volatility_tools.sql, then refresh this page."); return; }
    setMetrics((data || []).map((x: any) => ({ ...x, price: Number(x.price), volatility_pct: Number(x.volatility_pct), atr_14: Number(x.atr_14), atr_pct: Number(x.atr_pct) })));
    setStatus(data?.length ? "Calculated from Binance historical candles" : "Waiting for the first scheduled calculation");
    const { data: { session } } = await supabase.auth.getSession();
    setUserId(session?.user.id || null);
    if (session?.user) {
      const { data: a } = await supabase.from("volatility_alerts").select("id,symbol,threshold_pct,condition,is_active,created_at").eq("user_id", session.user.id).order("created_at", { ascending: false });
      setAlerts((a || []).map((x: any) => ({ ...x, threshold_pct: Number(x.threshold_pct) })));
    }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60000); return () => window.clearInterval(timer); }, []);

  const sorted = useMemo(() => [...metrics].sort((a, b) => b.volatility_pct - a.volatility_pct), [metrics]);
  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) { setStatus("Please sign in to create an alert."); return; }
    const value = Number(threshold);
    if (!Number.isFinite(value) || value <= 0 || value > 1000) { setStatus("Enter a threshold between 0 and 1000%."); return; }
    setBusy(true);
    const { error } = await supabase.from("volatility_alerts").insert({ user_id: userId, symbol, threshold_pct: value, condition, is_active: true });
    setBusy(false);
    if (error) { setStatus("Could not save alert: " + error.message); return; }
    setStatus("Volatility alert created.");
    await load();
  }
  async function toggleAlert(alert: Alert) {
    const { error } = await supabase.from("volatility_alerts").update({ is_active: !alert.is_active }).eq("id", alert.id).eq("user_id", userId);
    if (error) { setStatus("Could not update alert."); return; }
    await load();
  }

  return <main style={{ minHeight: "100vh", background: "#0b1020", color: "#eef2ff", padding: "clamp(16px,4vw,40px)", fontFamily: "Arial, sans-serif" }}>
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <Link href="/markets" style={{ color: "#91a7ff", textDecoration: "none" }}>← Back to Markets</Link>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "end", justifyContent: "space-between", gap: 16, margin: "24px 0" }}>
        <div><p style={{ color: "#8ea0c8", textTransform: "uppercase", letterSpacing: 2, fontSize: 12 }}>SUNSTRADE · MARKET INTELLIGENCE</p><h1 style={{ fontSize: "clamp(30px,5vw,44px)", margin: "8px 0" }}>Volatility Monitor</h1><p style={{ color: "#aab6d4", margin: 0 }}>Compare market movement, ATR and volatility alerts.</p></div>
        <span style={{ color: "#aab6d4", fontSize: 13 }}>{status}</span>
      </header>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 28 }}>
        {[{title:"Tracked assets",value:String(metrics.length),note:"Crypto pairs with candle data"},{title:"Highest volatility",value:sorted[0] ? sorted[0].symbol : "—",note:sorted[0] ? sorted[0].volatility_pct.toFixed(2)+"% annualized" : "Awaiting data"},{title:"Active alerts",value:String(alerts.filter(a=>a.is_active).length),note:"Your configured thresholds"}].map(card => <div key={card.title} style={{ background:"#121a2e", border:"1px solid #26334f", borderRadius:16, padding:20 }}><div style={{ color:"#9eaccb", fontSize:13 }}>{card.title}</div><div style={{ fontSize:27, fontWeight:700, margin:"10px 0" }}>{card.value}</div><div style={{ color:"#9eaccb", fontSize:13 }}>{card.note}</div></div>)}
      </section>
      <section style={{ background:"#121a2e", border:"1px solid #26334f", borderRadius:16, padding:20, marginBottom:24 }}>
        <h2 style={{ marginTop:0, fontSize:20 }}>Volatility heatmap</h2><p style={{ color:"#9eaccb", fontSize:13 }}>Annualized standard deviation of daily log returns. Risk bands are guideposts, not predictions or trading signals.</p>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, margin:"12px 0 18px" }}>{[{label:"Low",range:"< 25%",color:"#34d399"},{label:"Moderate",range:"25–49.99%",color:"#a3e635"},{label:"High",range:"50–74.99%",color:"#fbbf24"},{label:"Extreme",range:"≥ 75%",color:"#fb7185"}].map(item => <span key={item.label} style={{ display:"inline-flex", alignItems:"center", gap:7, border:"1px solid #2b3855", background:"#0e1527", borderRadius:999, padding:"7px 10px", fontSize:12, color:item.color }}><span style={{ width:8, height:8, borderRadius:"50%", background:item.color }} />{item.label}<span style={{ color:"#9eaccb" }}>{item.range}</span></span>)}</div>
        {sorted.length === 0 ? <p style={{ color:"#9eaccb" }}>No metrics yet. Run the scheduled volatility job after applying the SQL migration.</p> : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:10 }}>{sorted.map(m => {
          const pct = Math.min(100, m.volatility_pct);
          const color = levelColor(m.volatility_pct);
          return <div key={m.symbol} style={{ border:"1px solid #2b3855", borderRadius:12, padding:14, background:"#0e1527" }}><div style={{ display:"flex", justifyContent:"space-between", gap:8 }}><strong>{m.symbol}</strong><span style={{ color, fontSize:12 }}>{level(m.volatility_pct)}</span></div><div style={{ fontSize:24, fontWeight:700, margin:"12px 0 4px" }}>{m.volatility_pct.toFixed(2)}%</div><div style={{ height:7, borderRadius:8, background:"#27324b", overflow:"hidden" }}><div style={{ height:"100%", width:pct+"%", background:color, borderRadius:8 }} /></div><div style={{ display:"flex", justifyContent:"space-between", color:"#9eaccb", fontSize:12, marginTop:12 }}><span>Price {money(m.price)}</span><span>ATR {money(m.atr_14)}</span></div><div style={{ color:"#9eaccb", fontSize:12, marginTop:5 }}>ATR / price: {m.atr_pct.toFixed(2)}%</div></div>;
        })}</div>}
      </section>
      <section style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))", gap:20 }}>
        <form onSubmit={createAlert} style={{ background:"#121a2e", border:"1px solid #26334f", borderRadius:16, padding:20 }}>
          <h2 style={{ marginTop:0, fontSize:20 }}>Create volatility alert</h2><p style={{ color:"#9eaccb", fontSize:13 }}>Alerts are evaluated when the scheduled server calculation runs.</p>
          <label style={{ display:"block", margin:"14px 0 6px" }}>Asset</label><select value={symbol} onChange={e=>setSymbol(e.target.value)} style={field}>{Object.keys({ "BTC/USD":1,"ETH/USD":1,"BNB/USD":1,"SOL/USD":1,"XRP/USD":1,"DOGE/USD":1,"ADA/USD":1,"LTC/USD":1 }).map(s=><option key={s}>{s}</option>)}</select>
          <label style={{ display:"block", margin:"14px 0 6px" }}>Condition</label><select value={condition} onChange={e=>setCondition(e.target.value as "above"|"below")} style={field}><option value="above">Volatility rises above</option><option value="below">Volatility falls below</option></select>
          <label style={{ display:"block", margin:"14px 0 6px" }}>Annualized volatility (%)</label><input type="number" min="0.01" max="1000" step="0.1" value={threshold} onChange={e=>setThreshold(e.target.value)} required style={field}/>
          <button disabled={busy} style={{ marginTop:16, width:"100%", padding:12, border:0, borderRadius:10, color:"#08101f", background:"#9db5ff", fontWeight:700, cursor:"pointer" }}>{busy?"Saving…":"Save alert"}</button>
          {!userId && <p style={{ color:"#fbbf24", fontSize:12 }}>Sign in first to save personal alerts.</p>}
        </form>
        <section style={{ background:"#121a2e", border:"1px solid #26334f", borderRadius:16, padding:20 }}>
          <h2 style={{ marginTop:0, fontSize:20 }}>Your alerts</h2>{alerts.length===0?<p style={{ color:"#9eaccb" }}>No volatility alerts yet.</p>:<div style={{ display:"grid", gap:10 }}>{alerts.map(a=><div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, borderBottom:"1px solid #29344d", padding:"10px 0" }}><div><strong>{a.symbol}</strong><div style={{ color:"#9eaccb", fontSize:13 }}>{a.condition==="above"?"Above":"Below"} {a.threshold_pct}%</div></div><button onClick={()=>void toggleAlert(a)} style={{ ...smallButton, color:a.is_active?"#34d399":"#9eaccb" }}>{a.is_active?"Active · Pause":"Paused · Enable"}</button></div>)}</div>}
        </section>
      </section>
      <p style={{ color:"#8290ae", fontSize:12, lineHeight:1.6, marginTop:24 }}>Data source: Binance Spot historical candles for supported crypto pairs. Volatility uses 20 daily returns, annualized using √365. ATR(14) uses hourly candles and is shown in quote currency. This page currently covers crypto assets only; forex and gold require a separate licensed market-data feed.</p>
    </div>
  </main>;
}
const field: React.CSSProperties = { width:"100%", padding:12, borderRadius:9, border:"1px solid #34415e", background:"#0b1020", color:"#eef2ff", boxSizing:"border-box" };
const smallButton: React.CSSProperties = { padding:"7px 10px", borderRadius:8, border:"1px solid #34415e", background:"#0b1020", cursor:"pointer", fontSize:12 };
