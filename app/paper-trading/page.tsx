"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Asset = { symbol: string; name: string; price: number };
type Position = { symbol: string; qty: number; avg_price: number };
type Order = { id: string; symbol: string; side: string; qty: number; filled_price: number | null; status: string; created_at: string };

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);

export default function PaperTradingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [balance, setBalance] = useState(0);
  const [symbol, setSymbol] = useState("BTC/USD");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("0.01");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (id: string) => {
    const [walletResult, assetsResult, positionsResult, ordersResult] = await Promise.all([
      supabase.from("wallets").select("cash_balance").eq("user_id", id).maybeSingle(),
      supabase.from("assets").select("symbol,name,price").order("symbol"),
      supabase.from("positions").select("symbol,qty,avg_price").eq("user_id", id).order("symbol"),
      supabase.from("orders").select("id,symbol,side,qty,filled_price,status,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(10),
    ]);
    if (walletResult.error) throw new Error("Could not load your test wallet: " + walletResult.error.message);
    if (assetsResult.error) throw new Error("Could not load test market prices: " + assetsResult.error.message);
    if (positionsResult.error) throw new Error("Could not load test positions: " + positionsResult.error.message);
    if (ordersResult.error) throw new Error("Could not load test orders: " + ordersResult.error.message);
    setBalance(Number(walletResult.data?.cash_balance ?? 0));
    const nextAssets = (assetsResult.data ?? []).map((a) => ({ symbol: a.symbol, name: a.name, price: Number(a.price) }));
    setAssets(nextAssets);
    if (nextAssets.length && !nextAssets.some((a) => a.symbol === symbol)) setSymbol(nextAssets[0].symbol);
    setPositions((positionsResult.data ?? []).map((p) => ({ symbol: p.symbol, qty: Number(p.qty), avg_price: Number(p.avg_price) })));
    setOrders((ordersResult.data ?? []) as Order[]);
  }, [symbol]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session?.user) {
        router.replace("/login?next=/paper-trading");
        return;
      }
      setUserId(session.user.id);
      try {
        const { data: profile, error: profileError } = await supabase.from("profiles").select("is_suspended").eq("id", session.user.id).maybeSingle();
        if (profileError) throw new Error("Could not verify your test account: " + profileError.message);
        if (profile?.is_suspended) {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }
        await refresh(session.user.id);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load paper trading data.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/login");
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [refresh, router]);

  const selectedAsset = assets.find((asset) => asset.symbol === symbol);
  const selectedPosition = positions.find((position) => position.symbol === symbol);
  const parsedQty = Number(qty);
  const estimatedValue = selectedAsset && Number.isFinite(parsedQty) && parsedQty > 0 ? selectedAsset.price * parsedQty : 0;

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!userId) { setError("Sign in to your test account first."); return; }
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) { setError("Enter a quantity greater than zero."); return; }
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("place_paper_market_order", {
        p_symbol: symbol,
        p_side: side,
        p_qty: parsedQty,
      });
      if (rpcError) throw new Error(rpcError.message);
      const result = Array.isArray(data) ? data[0] : data;
      if (result && typeof result === "object" && "error" in result && result.error) throw new Error(String(result.error));
      setMessage(`Paper ${side} order submitted successfully. Check the order history below for the recorded result.`);
      await refresh(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The paper order could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="paper-page">
      <style jsx>{`
        .paper-page{min-height:100vh;background:#0a1020;color:#e8edf8;padding:28px 18px 48px;font-family:Arial,Helvetica,sans-serif}
        .paper-wrap{max-width:1100px;margin:0 auto}.paper-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:28px}
        .brand{font-weight:800;font-size:23px;letter-spacing:-.6px}.brand span{color:#50d6a1}.eyebrow{color:#50d6a1;font-size:11px;letter-spacing:1.5px;font-weight:800;margin:0 0 8px}
        h1{font-size:clamp(28px,5vw,42px);margin:0 0 9px;letter-spacing:-1px}.sub{color:#9eabc4;margin:0;line-height:1.6}
        .back{color:#dce6fa;text-decoration:none;border:1px solid #34415c;padding:10px 13px;border-radius:10px;font-size:13px}
        .notice{margin:20px 0;padding:13px 15px;background:#142b2a;border:1px solid #246252;color:#b8f4dc;border-radius:12px;font-size:13px;line-height:1.5}
        .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:20px 0}.card{background:#111a2d;border:1px solid #25314a;border-radius:16px;padding:18px;min-width:0}.muted{color:#9eabc4;font-size:12px}.stat{font-size:25px;font-weight:750;margin-top:9px;overflow-wrap:anywhere}
        .layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:15px}.card h2{font-size:17px;margin:0 0 17px}.field{display:block;color:#b4c0d7;font-size:12px;margin:15px 0 7px}
        select,input{width:100%;box-sizing:border-box;background:#0b1324;color:#edf3ff;border:1px solid #34415c;border-radius:10px;padding:12px;font-size:14px;outline:none}
        .sides{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sides button{padding:11px;border:1px solid #34415c;border-radius:10px;background:#0b1324;color:#d9e2f5;font-weight:700}.sides button.active{background:#153e35;border-color:#35bb8b;color:#9cf0cc}
        .estimate{display:flex;justify-content:space-between;gap:12px;margin:16px 0;color:#aab8d0;font-size:13px}.estimate strong{color:#f0f5ff}
        .submit{width:100%;border:0;border-radius:10px;padding:13px;background:#48d5a0;color:#061a13;font-weight:800;font-size:14px;cursor:pointer}.submit:disabled{opacity:.55;cursor:wait}
        .message,.error{margin-top:13px;padding:11px;border-radius:9px;font-size:13px;line-height:1.45;overflow-wrap:anywhere}.message{background:#14382f;color:#a6f2d4}.error{background:#3b2028;color:#ffc0c8}
        .table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}th,td{text-align:left;padding:11px 8px;border-bottom:1px solid #27334a}th{color:#9eabc4;font-weight:600}td{color:#e3eaf7}.empty{color:#9eabc4;padding:16px 0;font-size:13px}
        .pill{display:inline-block;border-radius:20px;padding:4px 7px;background:#17372f;color:#93ebc8;font-size:10px;text-transform:uppercase}
        @media(max-width:720px){.paper-page{padding:20px 12px 36px}.stats{grid-template-columns:1fr}.stat{font-size:23px}.layout{grid-template-columns:1fr}.card{padding:15px}.paper-top{align-items:flex-start}}
      `}</style>
      <div className="paper-wrap">
        <header className="paper-top">
          <div><div className="brand">Sun<span>Strade</span></div><p className="eyebrow" style={{ marginTop: 18 }}>STAGING ENVIRONMENT</p><h1>Paper Trading</h1><p className="sub">Practice market orders with your separate test database. No real funds are used by this page.</p></div>
          <Link className="back" href="/dashboard">← Dashboard</Link>
        </header>
        <div className="notice"><strong>Test mode only.</strong> This page calls the <code>place_paper_market_order</code> function in the Supabase project configured for this staging deployment. Confirm the staging environment variables point to your test project.</div>
        {loading ? <div className="card">Loading your test account…</div> : (
          <>
            {error && <div className="error" role="alert">{error}</div>}
            <section className="stats">
              <div className="card"><div className="muted">Test cash balance</div><div className="stat">{money(balance)}</div></div>
              <div className="card"><div className="muted">Available test markets</div><div className="stat">{assets.length}</div></div>
              <div className="card"><div className="muted">Open test positions</div><div className="stat">{positions.filter(p => p.qty > 0).length}</div></div>
            </section>
            <section className="layout">
              <div className="card">
                <h2>Place a paper market order</h2>
                {assets.length === 0 ? <p className="empty">No assets are configured in the test database yet.</p> : <form onSubmit={placeOrder}>
                  <label className="field" htmlFor="paper-symbol">Market</label>
                  <select id="paper-symbol" value={symbol} onChange={e => setSymbol(e.target.value)}>{assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol} — {a.name}</option>)}</select>
                  <label className="field">Order side</label>
                  <div className="sides"><button type="button" className={side === "buy" ? "active" : ""} onClick={() => setSide("buy")}>Buy</button><button type="button" className={side === "sell" ? "active" : ""} onClick={() => setSide("sell")}>Sell</button></div>
                  <label className="field" htmlFor="paper-qty">Quantity</label>
                  <input id="paper-qty" inputMode="decimal" type="number" min="0.000001" step="any" value={qty} onChange={e => setQty(e.target.value)} required />
                  <div className="estimate"><span>Latest test price</span><strong>{selectedAsset ? money(selectedAsset.price) : "—"}</strong></div>
                  <div className="estimate"><span>Estimated order value</span><strong>{money(estimatedValue)}</strong></div>
                  {side === "sell" && <div className="estimate"><span>Your current {symbol} position</span><strong>{number(selectedPosition?.qty ?? 0)}</strong></div>}
                  <button className="submit" type="submit" disabled={submitting || assets.length === 0}>{submitting ? "Submitting test order…" : `Place paper ${side} order`}</button>
                  {message && <div className="message" role="status">{message}</div>}
                </form>}
              </div>
              <div className="card">
                <h2>Your test positions</h2>
                {positions.filter(p => p.qty > 0).length === 0 ? <p className="empty">No positions yet. Place a paper buy order to start testing.</p> : <div className="table-wrap"><table><thead><tr><th>Market</th><th>Quantity</th><th>Avg. price</th></tr></thead><tbody>{positions.filter(p => p.qty > 0).map(p => <tr key={p.symbol}><td>{p.symbol}</td><td>{number(p.qty)}</td><td>{money(p.avg_price)}</td></tr>)}</tbody></table></div>}
              </div>
            </section>
            <section className="card" style={{ marginTop: 15 }}>
              <h2>Recent test orders</h2>
              {orders.length === 0 ? <p className="empty">No paper orders have been recorded for this test account yet.</p> : <div className="table-wrap"><table><thead><tr><th>Market</th><th>Side</th><th>Qty</th><th>Fill price</th><th>Status</th><th>Time</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td>{o.symbol}</td><td>{o.side.toUpperCase()}</td><td>{number(Number(o.qty))}</td><td>{o.filled_price == null ? "—" : money(Number(o.filled_price))}</td><td><span className="pill">{o.status}</span></td><td>{new Date(o.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
            </section>
            <p className="muted" style={{ marginTop: 18, lineHeight: 1.6 }}>Signed in to test account: {userId ? userId.slice(0, 8) + "…" : "checking"} · All balances and order records shown here come from the staging Supabase project.</p>
          </>
        )}
      </div>
    </main>
  );
}
