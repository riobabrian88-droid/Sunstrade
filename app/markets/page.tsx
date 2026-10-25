"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./markets.css";

const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Asset={symbol:string;name:string;price:number;prev_close:number|null;change_24h?:number|null};

const fallback:Asset[]=[
 {symbol:"BTC/USD",name:"Bitcoin",price:0,prev_close:null},
 {symbol:"ETH/USD",name:"Ethereum",price:0,prev_close:null},
 {symbol:"BNB/USD",name:"BNB",price:0,prev_close:null},
 {symbol:"SOL/USD",name:"Solana",price:0,prev_close:null},
 {symbol:"XRP/USD",name:"XRP",price:0,prev_close:null},
 {symbol:"DOGE/USD",name:"Dogecoin",price:0,prev_close:null},
 {symbol:"ADA/USD",name:"Cardano",price:0,prev_close:null},
 {symbol:"LTC/USD",name:"Litecoin",price:0,prev_close:null},
 {symbol:"AVAX/USD",name:"Avalanche",price:0,prev_close:null},
 {symbol:"LINK/USD",name:"Chainlink",price:0,prev_close:null},
 {symbol:"DOT/USD",name:"Polkadot",price:0,prev_close:null},
 {symbol:"TRX/USD",name:"TRON",price:0,prev_close:null},
 {symbol:"BCH/USD",name:"Bitcoin Cash",price:0,prev_close:null},
 {symbol:"SHIB/USD",name:"Shiba Inu",price:0,prev_close:null},
 {symbol:"TON/USD",name:"Toncoin",price:0,prev_close:null},
 {symbol:"XAU/USD",name:"Gold",price:0,prev_close:null},
 {symbol:"XAG/USD",name:"Silver",price:0,prev_close:null},
 {symbol:"WTI/USD",name:"WTI Crude Oil",price:0,prev_close:null},
 {symbol:"BRENT/USD",name:"Brent Crude Oil",price:0,prev_close:null},
 {symbol:"EUR/USD",name:"Euro",price:0,prev_close:null},
 {symbol:"USD/JPY",name:"US Dollar / Japanese Yen",price:0,prev_close:null},
 {symbol:"GBP/USD",name:"British Pound / US Dollar",price:0,prev_close:null},
 {symbol:"USD/CHF",name:"US Dollar / Swiss Franc",price:0,prev_close:null},
 {symbol:"AUD/USD",name:"Australian Dollar / US Dollar",price:0,prev_close:null},
 {symbol:"USD/CAD",name:"US Dollar / Canadian Dollar",price:0,prev_close:null},
 {symbol:"NZD/USD",name:"New Zealand Dollar / US Dollar",price:0,prev_close:null},
 {symbol:"EUR/GBP",name:"Euro / British Pound",price:0,prev_close:null},
 {symbol:"SPX",name:"S&P 500 Index",price:0,prev_close:null},
 {symbol:"NDX",name:"Nasdaq 100 Index",price:0,prev_close:null},
 {symbol:"DJI",name:"Dow Jones Industrial Average",price:0,prev_close:null},
 {symbol:"FTSE",name:"FTSE 100 Index",price:0,prev_close:null},
 {symbol:"DAX",name:"DAX Index",price:0,prev_close:null},
 {symbol:"N225",name:"Nikkei 225 Index",price:0,prev_close:null},
];

const crypto=["BTC","ETH","BNB","SOL","XRP","DOGE","ADA","LTC","AVAX","LINK","DOT","TRX","BCH","SHIB","TON"];
const forex=["EUR/USD","USD/JPY","GBP/USD","USD/CHF","AUD/USD","USD/CAD","NZD/USD","EUR/GBP"];
const indices=["SPX","NDX","DJI","FTSE","DAX","N225"];
const money=(n:number)=>!Number.isFinite(n)||n<=0?"—":n<10?n.toFixed(4):new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const change=(a:Asset)=>typeof a.change_24h==="number"&&Number.isFinite(a.change_24h)?a.change_24h:a.prev_close&&a.price?((a.price-a.prev_close)/a.prev_close)*100:0;
const categoryOf=(s:string)=>crypto.includes(s.split("/")[0])?"Crypto":forex.includes(s)?"Forex":["XAU/USD","XAG/USD","WTI/USD","BRENT/USD"].includes(s)?"Commodities":indices.includes(s)?"Indices":"Indices";

function AssetIcon({symbol}:{symbol:string}){const b=symbol.split("/")[0];const m:Record<string,string>={BTC:"₿",ETH:"◆",BNB:"◆",SOL:"≋",XRP:"✕",DOGE:"Ð",ADA:"●",LTC:"Ł",XAU:"Au",EUR:"€",USD:"$"};return <span className={"market-asset-icon asset-"+b.toLowerCase()}>{m[b]||b[0]}</span>}

function Spark({positive}:{positive:boolean}){return <svg className={"market-spark "+(positive?"up":"down")} viewBox="0 0 70 28" fill="none" aria-hidden="true"><path d={positive?"M2 23 L12 20 L20 21 L30 13 L39 16 L48 8 L58 11 L68 3":"M2 5 L12 8 L20 6 L30 14 L39 11 L48 20 L58 17 L68 25"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d={positive?"M2 23 L12 20 L20 21 L30 13 L39 16 L48 8 L58 11 L68 3":"M2 5 L12 8 L20 6 L30 14 L39 11 L48 20 L58 17 L68 25"} stroke="currentColor" strokeOpacity=".12" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></svg>}

export default function MarketsPage(){
 const [assets,setAssets]=useState<Asset[]>(fallback),[query,setQuery]=useState(""),[category,setCategory]=useState("All"),[sort,setSort]=useState("default"),[watchlist,setWatchlist]=useState<string[]>([]),[user,setUser]=useState<any>(null),[loading,setLoading]=useState(true),[status,setStatus]=useState("Connecting");

 const load=async()=>{
  const {data,error}=await supabase.from("assets").select("symbol,name,price,prev_close").order("symbol");
  if(!error&&data?.length)setAssets(data.map(x=>({symbol:x.symbol,name:x.name,price:Number(x.price),prev_close:x.prev_close==null?null:Number(x.prev_close)})));
 };
 const live=async()=>{
  try{const r=await fetch("/api/prices",{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json();setAssets(cur=>cur.map(a=>({...a,price:typeof d[a.symbol]==="number"?d[a.symbol]:a.price,change_24h:typeof d.changes?.[a.symbol]==="number"?d.changes[a.symbol]:a.change_24h})));setStatus("Live")}
  catch{setStatus("Database")}
 };

 useEffect(()=>{let mounted=true;(async()=>{
  const {data:{session}}=await supabase.auth.getSession();if(!mounted)return;
  setUser(session?.user||null);
  if(session?.user){const {data:w}=await supabase.from("user_watchlist").select("symbol").eq("user_id",session.user.id);if(w)setWatchlist(w.map(x=>x.symbol))}
  await load();await live();if(mounted)setLoading(false);
 })();return()=>{mounted=false}},[]);

 useEffect(()=>{const i=window.setInterval(()=>void live(),30000);return()=>window.clearInterval(i)},[]);

 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase();
  const rows=assets.filter(a=>(!q||a.symbol.toLowerCase().includes(q)||a.name.toLowerCase().includes(q))&&(category==="All"||categoryOf(a.symbol)===category));
  if(sort==="price-high")rows.sort((a,b)=>b.price-a.price);
  else if(sort==="price-low")rows.sort((a,b)=>a.price-b.price);
  else if(sort==="gainers")rows.sort((a,b)=>change(b)-change(a));
  else if(sort==="losers")rows.sort((a,b)=>change(a)-change(b));
  return rows;
 },[assets,query,category,sort]);
 const movers=useMemo(()=>[...assets].filter(a=>a.price>0).sort((a,b)=>Math.abs(change(b))-Math.abs(change(a))).slice(0,3),[assets]);

 async function toggle(symbol:string){
  if(!user){setWatchlist(x=>x.includes(symbol)?x.filter(s=>s!==symbol):[...x,symbol]);return}
  const saved=watchlist.includes(symbol);
  if(saved){const {error}=await supabase.from("user_watchlist").delete().eq("user_id",user.id).eq("symbol",symbol);if(!error)setWatchlist(x=>x.filter(s=>s!==symbol))}
  else{const {error}=await supabase.from("user_watchlist").insert({user_id:user.id,symbol});if(!error)setWatchlist(x=>[...x,symbol])}
 }

 if(loading)return <main className="markets-loading" role="status" aria-label="Loading SunStrade"><div>S</div><span className="sun-page-loading-bars" aria-hidden="true"><i/><i/><i/><i/></span></main>;

 return <main className="sun-markets-page">
  <aside className="desktop-sidebar"><div className="desktop-brand"><strong>Sun<span>Strade</span></strong><small>Trading platform</small></div><nav><Link className="" href="/dashboard"><span>⌂</span>Home</Link><Link className="active" href="/markets"><span>◉</span>Markets</Link><Link className="" href="/trade"><span>↗</span>Trade</Link><Link className="" href="/portfolio"><span>▤</span>Portfolio</Link><Link className="" href="/more"><span>☰</span>More</Link><Link className="" href="/wallet"><span>▣</span>Wallet</Link></nav><div className="desktop-sidebar-footer"><span>●</span> Markets live</div></aside>
  <div className="desktop-main">
  <header className="markets-header">
   <Link href="/dashboard" className="markets-brand"><span className="markets-brand-mark">↗</span><strong>Markets</strong></Link>
   <div className="markets-header-actions"><span className="markets-live"><i/> {status}</span><Link href={user?"/profile":"/login"} className="markets-avatar">{user?((user.user_metadata?.full_name||user.email||"S")[0]?.toUpperCase()||"S"):"↪"}</Link></div>
  </header>

  <section className="markets-intro"><span>DISCOVER THE MARKET</span><h1>Markets</h1><p>Track the assets you care about and move quickly when the market changes.</p></section>

  <label className="markets-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search assets or symbols" aria-label="Search assets or symbols"/>{query&&<button onClick={()=>setQuery("")} aria-label="Clear search">×</button>}</label>

  <div className="markets-categories" role="tablist" aria-label="Filter markets by category">{["All","Forex","Crypto","Indices","Commodities"].map(c=><button key={c} type="button" role="tab" aria-selected={category===c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div>

  {movers.length>0&&<section className="markets-movers" aria-label="Biggest percentage movers"><div className="markets-movers-title"><span>MARKET PULSE</span><b>Biggest movers</b></div>{movers.map(a=>{const c=change(a);return <button type="button" className="markets-mover" key={a.symbol} onClick={()=>{setQuery(a.symbol);setCategory("All")}}><span>{a.symbol}</span><b className={c>=0?"positive":"negative"}>{c>=0?"+":""}{c.toFixed(2)}%</b></button>})}</section>}

  {watchlist.length===0&&<section className="markets-watch-card"><div className="markets-watch-icon">☆</div><div><span>YOUR WATCHLIST</span><h2>Create your watchlist</h2><p>Tap the star beside an asset to keep your favorite markets close.</p></div></section>}

  {watchlist.length>0&&<section className="markets-watch-strip"><div><span>YOUR WATCHLIST</span><strong>{watchlist.length} {watchlist.length===1?"asset":"assets"} saved</strong></div><button onClick={()=>setCategory("All")}>View all →</button></section>}

  <section className="markets-list-card">
   <div className="markets-list-head"><div><span>MARKET WATCH</span><h2>{category==="All"?"All markets":category}</h2></div><div className="markets-list-tools"><small>{filtered.length} assets</small><label className="markets-sort-label">Sort by <select aria-label="Sort markets" value={sort} onChange={e=>setSort(e.target.value)}><option value="default">Default</option><option value="gainers">Top gainers</option><option value="losers">Top losers</option><option value="price-high">Highest price</option><option value="price-low">Lowest price</option></select></label></div></div>
   <div className="markets-list-columns"><span>ASSET</span><span>PRICE / 24H</span></div>
   <div className="markets-list">{filtered.length ? filtered.map(a=>{const c=change(a),positive=c>=0,saved=watchlist.includes(a.symbol);return (
    <Link href={"/trade?symbol="+encodeURIComponent(a.symbol)} className="market-row" key={a.symbol}>
      <button type="button" className={"market-star "+(saved?"saved":"")} aria-label={saved?"Remove "+a.symbol+" from watchlist":"Add "+a.symbol+" to watchlist"} onClick={e=>{e.preventDefault();e.stopPropagation();void toggle(a.symbol)}}>{saved?"★":"☆"}</button>
      <AssetIcon symbol={a.symbol}/><span className="market-name"><b>{a.symbol}</b><small>{a.name}</small></span>
      <Spark positive={positive}/><span className="market-quote"><b>{money(a.price)}</b><small className={positive?"positive":"negative"}>{positive?"+":""}{c.toFixed(2)}%</small></span>
    </Link>
  );}) : <div className="markets-empty"><strong>No markets found</strong><span>Try another search or category.</span></div>}</div>
  </section>

  <p className="markets-note">Prices update automatically. Crypto prices use the platform's live market feed; other instruments use the latest available database price.</p>

  </div>
  <nav className="sun-markets-bottom-nav" aria-label="Primary navigation"><Link href="/dashboard"><span>⌂</span><b>Home</b></Link><Link className="active" href="/markets"><span>◉</span><b>Markets</b></Link><Link href="/trade"><span>↗</span><b>Trade</b></Link><Link href="/portfolio"><span>▤</span><b>Portfolio</b></Link><Link href="/more"><span>☰</span><b>More</b></Link></nav>
 </main>;
}
