"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./home.css";

const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Asset={symbol:string;name:string;price:number;prev_close:number|null;change_24h?:number|null};
type Position={symbol:string;qty:number;avg_price:number};
type Order={symbol:string;side:string;status:string;qty:number;filled_price:number|null;created_at:string;filled_at:string|null};
type Profile={full_name?:string|null;username?:string|null};

const fallback:Asset[]=[
 {symbol:"BTC/USD",name:"Bitcoin",price:0,prev_close:null},
 {symbol:"ETH/USD",name:"Ethereum",price:0,prev_close:null},
 {symbol:"SOL/USD",name:"Solana",price:0,prev_close:null},
 {symbol:"XRP/USD",name:"XRP",price:0,prev_close:null},
];

const money=(n:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const fmt=(n:number)=>!Number.isFinite(n)||n<=0?"—":n<10?n.toFixed(4):new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const pct=(a:Asset)=>typeof a.change_24h==="number"&&Number.isFinite(a.change_24h)?a.change_24h:a.prev_close&&a.price?((a.price-a.prev_close)/a.prev_close)*100:0;

function Icon({symbol}:{symbol:string}){const b=symbol.split("/")[0];const m:Record<string,string>={BTC:"₿",ETH:"◆",SOL:"≋",XRP:"✕"};return <span className={"home-asset-icon asset-"+b.toLowerCase()}>{m[b]||b[0]}</span>}

function realized(orders:Order[]){
 const start=new Date();start.setHours(0,0,0,0);const lots=new Map<string,{qty:number;price:number}[]>();let out=0;
 for(const o of [...orders].filter(x=>x.status==="filled"&&Number(x.filled_price)>0).sort((a,b)=>new Date(a.filled_at||a.created_at).getTime()-new Date(b.filled_at||b.created_at).getTime())){
  const q=lots.get(o.symbol)||[];const p=Number(o.filled_price);
  if(o.side==="buy")q.push({qty:Number(o.qty),price:p});
  if(o.side==="sell"){let r=Number(o.qty);while(r>0&&q.length){const l=q[0],u=Math.min(r,l.qty);if(new Date(o.filled_at||o.created_at)>=start)out+=u*(p-l.price);r-=u;l.qty-=u;if(l.qty<=1e-9)q.shift()}}
  lots.set(o.symbol,q);
 } return out;
}

export default function DashboardPage(){
 const [user,setUser]=useState<any>(null),[profile,setProfile]=useState<Profile|null>(null),[balance,setBalance]=useState(0),[positions,setPositions]=useState<Position[]>([]),[orders,setOrders]=useState<Order[]>([]),[assets,setAssets]=useState<Asset[]>(fallback),[unread,setUnread]=useState(0),[status,setStatus]=useState("Connecting"),[loading,setLoading]=useState(true);

 const load=async(id:string)=>{
  const [p,w,pos,o,a,n]=await Promise.all([
   supabase.from("profiles").select("full_name,username").eq("id",id).maybeSingle(),
   supabase.from("wallets").select("cash_balance").eq("user_id",id).maybeSingle(),
   supabase.from("positions").select("symbol,qty,avg_price").eq("user_id",id),
   supabase.from("orders").select("symbol,side,status,qty,filled_price,created_at,filled_at").eq("user_id",id).order("created_at",{ascending:false}),
   supabase.from("assets").select("symbol,name,price,prev_close").order("symbol"),
   supabase.from("price_alert_notifications").select("id").eq("user_id",id).is("read_at",null)
  ]);
  if(!p.error)setProfile(p.data);
  if(!w.error)setBalance(Number(w.data?.cash_balance||0));
  if(!pos.error)setPositions((pos.data||[]).map(x=>({symbol:x.symbol,qty:Number(x.qty),avg_price:Number(x.avg_price)})));
  if(!o.error)setOrders((o.data||[]) as Order[]);
  if(!a.error&&a.data?.length)setAssets(a.data.map(x=>({symbol:x.symbol,name:x.name,price:Number(x.price),prev_close:x.prev_close==null?null:Number(x.prev_close)})));
  if(!n.error)setUnread(n.data?.length||0);
 };
 const live=async()=>{
  try{const r=await fetch("/api/prices",{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json();setAssets(cur=>cur.map(a=>({...a,price:typeof d[a.symbol]==="number"?d[a.symbol]:a.price,change_24h:typeof d.changes?.[a.symbol]==="number"?d.changes[a.symbol]:a.change_24h})));setStatus("Live")}
  catch{setStatus("Unavailable")}
 };
 useEffect(()=>{let mounted=true;(async()=>{
  const {data:{session}}=await supabase.auth.getSession();if(!mounted)return;
  if(!session?.user){window.location.href="/login";return}
  const {data:account}=await supabase.from("profiles").select("is_suspended").eq("id",session.user.id).maybeSingle();
  if(account?.is_suspended){await supabase.auth.signOut();window.location.href="/login";return}
  setUser(session.user);
  // Render the dashboard shell as soon as the authenticated account check passes.
  // Account data and live prices can arrive independently; neither should hold the
  // entire page behind the full-screen loading state.
  if(mounted)setLoading(false);
  void load(session.user.id).catch((error)=>console.error("Dashboard data load failed:",error));
  void live().catch((error)=>console.error("Live prices failed:",error));
 })().catch((error)=>{
  console.error("Dashboard startup failed:",error);
  if(mounted)setLoading(false);
 });
 const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{if(!s?.user)window.location.href="/login"});
 return()=>{mounted=false;subscription.unsubscribe()}
 },[]);
 useEffect(()=>{const i=window.setInterval(()=>void live(),30000);return()=>window.clearInterval(i)},[]);
 useEffect(()=>{if(!user)return;const ch=supabase.channel("sunstrade-home").on("postgres_changes",{event:"*",schema:"public",table:"wallets",filter:`user_id=eq.${user.id}`},()=>void load(user.id)).on("postgres_changes",{event:"*",schema:"public",table:"positions",filter:`user_id=eq.${user.id}`},()=>void load(user.id)).on("postgres_changes",{event:"INSERT",schema:"public",table:"price_alert_notifications",filter:`user_id=eq.${user.id}`},()=>void load(user.id)).subscribe();return()=>{void supabase.removeChannel(ch)}},[user]);

 const equity=useMemo(()=>balance+positions.reduce((t,p)=>{const a=assets.find(x=>x.symbol===p.symbol);return t+p.qty*(a?.price||p.avg_price)},0),[balance,positions,assets]);
 const openPL=useMemo(()=>positions.reduce((t,p)=>{const a=assets.find(x=>x.symbol===p.symbol);return t+(a?(a.price-p.avg_price)*p.qty:0)},0),[positions,assets]);
 const today=useMemo(()=>realized(orders),[orders]);
 const name=profile?.full_name||profile?.username||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"Trader";
 const first=name.split(" ")[0];

 if(loading)return <main className="home-loading"><div>S</div><p>Loading your trading space…</p></main>;

 return <main className="sun-home-page">
  <aside className="desktop-sidebar"><div className="desktop-brand"><strong>Sun<span>Strade</span></strong><small>Trading platform</small></div><nav><Link className="active" href="/dashboard"><span>⌂</span>Home</Link><Link className="" href="/markets"><span>◉</span>Markets</Link><Link className="" href="/trade"><span>↗</span>Trade</Link><Link className="" href="/portfolio"><span>▤</span>Portfolio</Link><Link className="" href="/more"><span>☰</span>More</Link><Link className="" href="/wallet"><span>▣</span>Wallet</Link></nav><div className="desktop-sidebar-footer"><span>●</span> Markets live</div></aside>
  <div className="desktop-main">
  <header className="sun-home-header">
   <Link href="/dashboard" className="sun-home-brand"><span className="sun-home-brand-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 29V18l7-5v8l8-12 5 4 10-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M26 4h9v9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span><strong>SunStrade</strong><small>Read the candles, not the noise.</small></span></Link>
   <div className="sun-home-header-actions"><button className="sun-home-icon-btn" type="button" aria-label="Notifications">♧{unread>0&&<span>{unread>9?"9+":unread}</span>}</button><Link href="/profile" className="sun-home-profile">{first[0]?.toUpperCase()}</Link></div>
  </header>

  <section className="sun-home-topline"><span className="sun-home-eyebrow">MARKET OPEN · {status.toUpperCase()}</span><h1>Good morning, {first}</h1><p>Stay close to the market and keep your trading under control.</p></section>

  <section className="sun-home-equity">
   <div className="sun-home-equity-head"><div><span>Total Equity</span><small>Available account value</small></div><Link href="/wallet">Manage ↗</Link></div>
   <strong>{money(equity)}</strong>
   <div className="sun-home-equity-meta"><span><small>Cash balance</small><b>{money(balance)}</b></span><span className={today>=0?"positive":"negative"}><small>Today's P/L</small><b>{today>=0?"+":""}{money(today)}</b></span></div>
   <div className="sun-home-equity-actions"><Link href="/trade">Trade</Link><Link href="/wallet">Deposit</Link></div>
  </section>

  <section className="sun-home-shortcuts">
   <Link href="/markets"><i className="violet">☆</i><b>Watchlist</b><small>Track assets</small></Link>
   <Link href="/dashboard"><i className="amber">♧</i><b>Alerts</b><small>Price levels</small></Link>
   <Link href="/portfolio"><i className="blue">▤</i><b>Portfolio</b><small>Positions</small></Link>
   <Link href="/wallet"><i className="green">▣</i><b>Wallet</b><small>Funds</small></Link>
  </section>

  <section className="sun-home-promo"><div><span>SunStrade Pro</span><h2>Trade more. Learn more.</h2><p>Advanced tools, indicators and priority support as the platform grows.</p></div><b>✦</b></section>

  <section className="sun-home-section">
   <div className="sun-home-section-head"><div><span>LIVE MARKET</span><h2>Market Movers</h2></div><Link href="/markets">View all →</Link></div>
   <div className="sun-home-movers">{assets.slice(0,4).map(a=>{const c=pct(a);return <Link href={"/trade?symbol="+encodeURIComponent(a.symbol)} className="sun-home-mover" key={a.symbol}><Icon symbol={a.symbol}/><span className="sun-home-mover-copy"><b>{a.symbol}</b><small>{a.name}</small></span><span className="sun-home-mover-quote"><b>{fmt(a.price)}</b><small className={c>=0?"positive":"negative"}>{c>=0?"+":""}{c.toFixed(2)}%</small></span></Link>})}</div>
  </section>

  <section className="sun-home-section sun-home-portfolio-card">
   <div className="sun-home-section-head"><div><span>YOUR ACCOUNT</span><h2>Portfolio snapshot</h2></div><Link href="/portfolio">Details →</Link></div>
   <div className="sun-home-portfolio-main"><span>Open positions value</span><strong>{money(equity-balance)}</strong></div>
   <div className="sun-home-portfolio-foot"><span>{positions.length} open {positions.length===1?"position":"positions"}</span><span className={openPL>=0?"positive":"negative"}>{openPL>=0?"+":""}{money(openPL)} unrealized</span></div>
  </section>

  </div>
  <nav className="sun-home-bottom-nav" aria-label="Primary navigation"><Link className="active" href="/dashboard"><span>⌂</span><b>Home</b></Link><Link href="/markets"><span>◉</span><b>Markets</b></Link><Link href="/trade"><span>↗</span><b>Trade</b></Link><Link href="/portfolio"><span>▤</span><b>Portfolio</b></Link><Link href="/more"><span>☰</span><b>More</b></Link></nav>
 </main>;
}
