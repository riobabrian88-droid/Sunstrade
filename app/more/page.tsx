"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { supabase } from "@/lib/supabase";
import "./more.css";

export default function MorePage(){
 const [user,setUser]=useState<any>(null),[name,setName]=useState("Trader"),[verified,setVerified]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;(async()=>{const {data:{session}}=await supabase.auth.getSession();if(!active)return;if(!session?.user){window.location.href="/login";return}const u=session.user;setUser(u);setName(u.user_metadata?.full_name||u.email?.split("@")[0]||"Trader");setVerified(Boolean(u.email_confirmed_at));const {data}=await supabase.from("profiles").select("full_name").eq("id",u.id).maybeSingle();if(active&&data?.full_name)setName(data.full_name);setLoading(false)})();return()=>{active=false}},[]);
 if(loading)return <main className="more-loading"><div>S</div><p>Loading SunStrade…</p></main>;
 const initial=name.charAt(0).toUpperCase();
 return <main className="sun-more-page">
  <aside className="more-sidebar"><div className="more-brand"><strong>Sun<span>Strade</span></strong><small>Trading platform</small></div><nav><Link className="active" href="/more"><span>☰</span>More</Link><Link href="/dashboard"><span>⌂</span>Home</Link><Link href="/markets"><span>◉</span>Markets</Link><Link href="/trade"><span>↗</span>Trade</Link><Link href="/portfolio"><span>▤</span>Portfolio</Link><Link href="/wallet"><span>▣</span>Wallet</Link></nav><div className="more-sidebar-footer"><span>●</span> Markets live</div></aside>
  <div className="more-main">
  <header className="more-header"><div><span>ACCOUNT</span><h1>More</h1></div><div className="more-header-actions"><Link href="/profile">◉</Link><Link href="/settings">⚙</Link></div></header>
  <section className="more-profile"><div className="more-avatar">{initial}</div><div className="more-profile-copy"><strong>{name}</strong><small>{user?.email}</small><span>{verified?"✓ Verified account":"Verify your email"}</span></div><Link href="/profile">›</Link></section>
  <section className="more-pro"><div><span>SUNSTRADE PRO</span><h2>Unlock more trading power.</h2><p>Advanced tools, lower fees and exclusive benefits as the platform grows.</p><button type="button">Upgrade Now</button></div><div className="more-pro-art">♛</div></section>
  <section className="more-section"><div className="more-section-title"><span>ACCOUNTS</span><small>Manage your money</small></div><div className="more-grid"><Link href="/wallet"><i>▣</i><b>Wallet</b><small>Balance</small></Link><Link href="/wallet"><i>↕</i><b>Transactions</b><small>History</small></Link><Link href="/wallet"><i>↓</i><b>Deposit</b><small>Add funds</small></Link><Link href="/wallet"><i>↑</i><b>Withdraw</b><small>Request</small></Link></div></section>
  <section className="more-section"><div className="more-section-title"><span>TOOLS</span><small>Stay ahead of the market</small></div><div className="more-list"><Link href="/dashboard"><i>♧</i><span><b>Price Alerts</b><small>Create and manage alerts</small></span><em>›</em></Link><button type="button" onClick={()=>alert("Economic Calendar is coming soon.")}><i>▦</i><span><b>Economic Calendar</b><small>Track upcoming events</small></span><em>›</em></button><button type="button" onClick={()=>alert("Market News is coming soon.")}><i>▤</i><span><b>Market News</b><small>Stay updated with market news</small></span><em>›</em></button></div></section>
  <section className="more-trust"><div><i>♢</i><span><b>Trusted</b><small>Built with secure account controls.</small></span></div><div><i>ϟ</i><span><b>Fast</b><small>Live market data and responsive trading.</small></span></div><div><i>⌁</i><span><b>Powerful</b><small>Advanced charts and professional tools.</small></span></div><div><i>♧</i><span><b>24/7 Support</b><small>Help is available whenever you need it.</small></span></div><div><i>▣</i><span><b>Secure</b><small>Your account data stays protected.</small></span></div></section>
  <nav className="more-nav"><Link href="/dashboard"><span>⌂</span><b>Home</b></Link><Link href="/markets"><span>◉</span><b>Markets</b></Link><Link href="/trade"><span>↗</span><b>Trade</b></Link><Link href="/portfolio"><span>▤</span><b>Portfolio</b></Link><Link className="active" href="/more"><span>☰</span><b>More</b></Link></nav>
 </main>;
}