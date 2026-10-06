"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import CandleChart from "../dashboard/CandleChart";
import "./trade.css"; // Trade page stylesheet

const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Asset={symbol:string;name:string;price:number;prev_close:number|null;change_24h?:number|null};
type Position={symbol:string;qty:number;avg_price:number};
type Order={id?:string;symbol:string;side:string;status:string;qty:number;filled_price:number|null;created_at:string;filled_at:string|null};

const fallback:Asset[]=[
 {symbol:"BTC/USD",name:"Bitcoin",price:0,prev_close:null},{symbol:"ETH/USD",name:"Ethereum",price:0,prev_close:null},
 {symbol:"BNB/USD",name:"BNB",price:0,prev_close:null},{symbol:"SOL/USD",name:"Solana",price:0,prev_close:null},
 {symbol:"XRP/USD",name:"XRP",price:0,prev_close:null},{symbol:"DOGE/USD",name:"Dogecoin",price:0,prev_close:null},
 {symbol:"ADA/USD",name:"Cardano",price:0,prev_close:null},{symbol:"LTC/USD",name:"Litecoin",price:0,prev_close:null},
 {symbol:"XAU/USD",name:"Gold",price:0,prev_close:null},{symbol:"EUR/USD",name:"Euro",price:0,prev_close:null},{symbol:"USD/JPY",name:"US Dollar / Japanese Yen",price:0,prev_close:null}
];

const icons:Record<string,string>={BTC:"₿",ETH:"◆",BNB:"◆",SOL:"≋",XRP:"✕",DOGE:"Ð",ADA:"●",LTC:"Ł",XAU:"Au",EUR:"€",USD:"$"};
const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const price=(n:number)=>n<10?n.toFixed(4):new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const change=(a:Asset)=>a.change_24h??(a.prev_close&&a.price?((a.price-a.prev_close)/a.prev_close)*100:0);

function Coin({symbol}:{symbol:string}){const b=symbol.split("/")[0];return <span className={"trade-coin coin-"+b.toLowerCase()}>{icons[b]||b[0]}</span>}

export default function TradePage(){
 const [assets,setAssets]=useState<Asset[]>(fallback),[selected,setSelected]=useState("BTC/USD"),[user,setUser]=useState<any>(null),[balance,setBalance]=useState(0),[positions,setPositions]=useState<Position[]>([]),[orders,setOrders]=useState<Order[]>([]),[side,setSide]=useState<"buy"|"sell">("buy"),[qty,setQty]=useState("0.01"),[tab,setTab]=useState<"positions"|"orders"|"history">("positions"),[loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false),[message,setMessage]=useState(""),[showMarkets,setShowMarkets]=useState(false),[chartCommand,setChartCommand]=useState<"indicators"|"draw"|"more"|null>(null),[showCompare,setShowCompare]=useState(false);

 const current=assets.find(a=>a.symbol===selected)||fallback[0];
 const c=change(current);
 const position=positions.find(p=>p.symbol===selected);
 const orderValue=(Number(qty)||0)*current.price;
 const availableSell=position?.qty||0;

 const load=async(id:string)=>{
  const [w,p,o,a]=await Promise.all([
   supabase.from("wallets").select("cash_balance").eq("user_id",id).maybeSingle(),
   supabase.from("positions").select("symbol,qty,avg_price").eq("user_id",id),
   supabase.from("orders").select("id,symbol,side,status,qty,filled_price,created_at,filled_at").eq("user_id",id).order("created_at",{ascending:false}).limit(30),
   supabase.from("assets").select("symbol,name,price,prev_close").order("symbol")
  ]);
  if(!w.error)setBalance(Number(w.data?.cash_balance||0));
  if(!p.error)setPositions((p.data||[]).map(x=>({symbol:x.symbol,qty:Number(x.qty),avg_price:Number(x.avg_price)})));
  if(!o.error)setOrders((o.data||[]) as Order[]);
  if(!a.error&&a.data?.length)setAssets(a.data.map(x=>({symbol:x.symbol,name:x.name,price:Number(x.price),prev_close:x.prev_close==null?null:Number(x.prev_close)})));
 };

 const live=async()=>{
  try{const r=await fetch("/api/prices",{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json();setAssets(cur=>cur.map(a=>({...a,price:typeof d[a.symbol]==="number"?d[a.symbol]:a.price,change_24h:typeof d.changes?.[a.symbol]==="number"?d.changes[a.symbol]:a.change_24h})))}catch{}
 };

 useEffect(()=>{let active=true;(async()=>{const {data:{session}}=await supabase.auth.getSession();if(!session?.user){window.location.href="/login";return}setUser(session.user);await load(session.user.id);await live();if(active)setLoading(false)})();return()=>{active=false}},[]);
 useEffect(()=>{const i=window.setInterval(()=>void live(),15000);return()=>window.clearInterval(i)},[]);
 useEffect(()=>{if(!user)return;const ch=supabase.channel("sunstrade-trade").on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:`user_id=eq.${user.id}`},()=>void load(user.id)).on("postgres_changes",{event:"*",schema:"public",table:"positions",filter:`user_id=eq.${user.id}`},()=>void load(user.id)).on("postgres_changes",{event:"*",schema:"public",table:"wallets",filter:`user_id=eq.${user.id}`},()=>void load(user.id)).subscribe();return()=>{void supabase.removeChannel(ch)}},[user]);

 const execute=async()=>{
  if(!user)return;
  const amount=Number(qty);
  if(!Number.isFinite(amount)||amount<=0){setMessage("Enter a valid lot size.");return}
  if(side==="sell"&&amount>availableSell){setMessage("You do not have enough of this position to sell.");return}
  if(side==="buy"&&orderValue>balance){setMessage("Insufficient cash balance for this order.");return}
  setSubmitting(true);setMessage("");
  const {error}=await supabase.rpc("place_order",{p_symbol:selected,p_side:side,p_order_type:"market",p_qty:amount,p_limit_price:null});
  if(error)setMessage(error.message||"Order could not be placed.");
  else {setMessage(`${side==="buy"?"Buy":"Sell"} order placed for ${amount} ${selected}.`);await load(user.id)}
  setSubmitting(false);
 };

 if(loading)return <main className="trade-loading">
  <aside className="desktop-sidebar"><div className="desktop-brand"><strong>Sun<span>Strade</span></strong><small>Trading platform</small></div><nav><Link className="" href="/dashboard"><span>⌂</span>Home</Link><Link className="" href="/markets"><span>◉</span>Markets</Link><Link className="active" href="/trade"><span>↗</span>Trade</Link><Link className="" href="/portfolio"><span>▤</span>Portfolio</Link><Link className="" href="/more"><span>☰</span>More</Link><Link className="" href="/wallet"><span>▣</span>Wallet</Link></nav><div className="desktop-sidebar-footer"><span>●</span> Markets live</div></aside>
  <div className="desktop-main"><div>S</div><p>Loading Trade…</p></main>;

 return <main className="sun-trade-page">
  <header className="trade-mobile-header"><Link href="/dashboard" className="trade-back">‹</Link><div><span>TRADE</span><strong>SunStrade</strong></div><Link href="/profile" className="trade-profile">{((user?.user_metadata?.full_name||user?.email||"S")[0]?.toUpperCase()||"S")}</Link></header>

  <section className="trade-heading"><div><span>EXECUTION DESK</span><h1>Trade</h1><p>Execute paper trades with live market pricing.</p></div><button className="trade-settings" onClick={()=>setShowMarkets(v=>!v)} aria-label="Choose market">☷</button></section>

  <section className="trade-instrument">
   <button className="trade-selector" onClick={()=>setShowMarkets(v=>!v)}><Coin symbol={selected}/><span><b>{selected}</b><small>{current.name}</small></span><strong>⌄</strong></button>
   <button className="trade-star" aria-label="Favorite market">☆</button>
   <div className="trade-price"><b>{price(current.price)}</b><span className={c>=0?"positive":"negative"}>{c>=0?"+":""}{c.toFixed(2)}%</span></div>
  </section>

  {showMarkets&&<div className="trade-market-menu">{assets.map(a=><button key={a.symbol} className={a.symbol===selected?"active":""} onClick={()=>{setSelected(a.symbol);setShowMarkets(false)}}><Coin symbol={a.symbol}/><span><b>{a.symbol}</b><small>{a.name}</small></span><strong>{price(a.price)}</strong></button>)}</div>}

  <section className="trade-chart-card">
   <div className="trade-chart-top"><span>LIVE · BINANCE REFERENCE</span><small>{selected}</small></div>
   <CandleChart symbol={selected} command={chartCommand} onCommandHandled={()=>setChartCommand(null)}/>
   <div className="trade-tools">
    <button onClick={() => setChartCommand("indicators")}>◈<span>Indicators</span></button>
    <button onClick={() => setChartCommand("draw")}>╱<span>Draw</span></button>
    <button onClick={() => setShowCompare(v => !v)}>◌<span>Compare</span></button>
    <button onClick={() => setChartCommand("more")}>•••<span>More</span></button>
   </div>
   {showCompare && (
    <div className="trade-tool-panel">
     <strong>Compare markets</strong>
     <div>
      {assets.filter(a => a.symbol !== selected).slice(0, 6).map(a => (
       <button key={a.symbol} onClick={() => { setSelected(a.symbol); setShowCompare(false); }}>{a.symbol}</button>
      ))}
     </div>
    </div>
   )}
   {chartCommand === "indicators" && (
    <div className="trade-tool-panel">
     <strong>Indicators</strong>
     <span>Use the indicator controls above the chart.</span>
    </div>
   )}
   {chartCommand === "more" && (
    <div className="trade-tool-panel">
     <strong>Chart tools</strong>
     <span>Pinch/drag to inspect the chart or use Draw for trend lines.</span>
    </div>
   )}
  </section>

  <section className="trade-ticket">
   <div className="trade-side-toggle"><button className={side==="sell"?"active sell":""} onClick={()=>setSide("sell")}>SELL <strong>{price(current.price)}</strong></button><div><b>{qty}</b><small>Lot</small></div><button className={side==="buy"?"active buy":""} onClick={()=>setSide("buy")}>BUY <strong>{price(current.price)}</strong></button></div>
   <div className="trade-ticket-row"><label>Order size<input inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)}/></label><div className="trade-presets">{["0.01","0.05","0.1","0.5"].map(v=><button key={v} className={qty===v?"active":""} onClick={()=>setQty(v)}>{v}</button>)}</div></div>
   <div className="trade-summary"><span>Estimated value <b>{money(orderValue)}</b></span><span>{side==="buy"?"Available cash":"Available position"} <b>{side==="buy"?money(balance):availableSell.toFixed(4)+" "+selected}</b></span></div>
   <button className={"trade-submit "+side} onClick={execute} disabled={submitting}>{submitting?"Processing…":side==="buy"?"BUY · PLACE ORDER":"SELL · PLACE ORDER"}</button>
   <p className="trade-demo">Paper trading · Orders use SunStrade's simulated account and current market reference price.</p>
   {message&&<div className="trade-message">{message}</div>}
  </section>

  <section className="trade-records">
   <div className="trade-tabs">{([["positions","Positions",positions.length],["orders","Orders",orders.filter(o=>o.status!=="filled").length],["history","History",orders.filter(o=>o.status==="filled").length]] as const).map(([key,label,count])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}<b>{count}</b></button>)}</div>
   {tab==="positions"&&(positions.length?<div className="trade-record-list">{positions.map(p=>{const a=assets.find(x=>x.symbol===p.symbol);const pl=a?(a.price-p.avg_price)*p.qty:0;return <Link href={"/trade?symbol="+encodeURIComponent(p.symbol)} key={p.symbol} className="trade-record-row"><Coin symbol={p.symbol}/><span><b>{p.symbol}</b><small>{p.qty} lots · avg {price(p.avg_price)}</small></span><strong className={pl>=0?"positive":"negative"}>{pl>=0?"+":""}{money(pl)}</strong></Link>})}</div>:<div className="trade-empty">No open positions yet.</div>)}
   {tab==="orders"&&(orders.filter(o=>o.status!=="filled").length?<div className="trade-record-list">{orders.filter(o=>o.status!=="filled").map((o,i)=><div className="trade-record-row" key={o.id||i}><Coin symbol={o.symbol}/><span><b>{o.side.toUpperCase()} · {o.symbol}</b><small>{o.qty} lots · {o.status}</small></span><strong>{price(Number(o.filled_price||0))}</strong></div>)}</div>:<div className="trade-empty">No active orders.</div>)}
   {tab==="history"&&(orders.filter(o=>o.status==="filled").length?<div className="trade-record-list">{orders.filter(o=>o.status==="filled").slice(0,10).map((o,i)=><div className="trade-record-row" key={o.id||i}><Coin symbol={o.symbol}/><span><b>{o.side.toUpperCase()} · {o.symbol}</b><small>{new Date(o.filled_at||o.created_at).toLocaleString()}</small></span><strong className={o.side==="buy"?"positive":"negative"}>{o.side==="buy"?"+":"−"} {price(Number(o.filled_price||0))}</strong></div>)}</div>:<div className="trade-empty">No completed trades yet.</div>)}
  </section>

  </div>

  <nav className="sun-trade-bottom-nav"><Link href="/dashboard"><span>⌂</span><b>Home</b></Link><Link href="/markets"><span>◉</span><b>Markets</b></Link><Link href="/trade" className="active"><span>↗</span><b>Trade</b></Link><Link href="/portfolio"><span>▤</span><b>Portfolio</b></Link><Link href="/more"><span>☰</span><b>More</b></Link></nav>
 </main>;
}
