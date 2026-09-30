"use client";

import { useEffect, useState } from "react";

type Stats = {
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
};

const pairs: Record<string, string> = {
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
  "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT",
  "XRP/USD": "XRPUSDT",
  "DOGE/USD": "DOGEUSDT",
  "ADA/USD": "ADAUSDT",
  "LTC/USD": "LTCUSDT",
};

function formatPrice(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US", {
    minimumFractionDigits: n < 1 ? 4 : 2,
    maximumFractionDigits: n < 1 ? 8 : 2,
  }) : "—";
}

function formatVolume(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export default function MarketStats({ symbol }: { symbol: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "error" | "unsupported">("loading");

  useEffect(() => {
    const pair = pairs[symbol];
    let active = true;
    if (!pair) {
      setStats(null);
      setStatus("unsupported");
      return;
    }

    const load = async () => {
      try {
        const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Market statistics unavailable");
        const data: Stats = await response.json();
        if (!active) return;
        setStats(data);
        setStatus("live");
      } catch {
        if (active) setStatus("error");
      }
    };

    setStatus("loading");
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbol]);

  const change = Number(stats?.priceChangePercent ?? 0);
  const changePositive = change >= 0;

  return (
    <section className="panel market-stats-panel" aria-label={`24-hour market statistics for ${symbol}`}>
      <div className="panel-title market-stats-heading">
        <div><h2>24h Market Statistics</h2><small>{symbol} · Binance</small></div>
        <span className={status === "live" ? "book-live" : "book-status"}>{status === "live" ? "● Live · 10s" : status === "loading" ? "Connecting…" : status === "unsupported" ? "Unavailable" : "Data unavailable"}</span>
      </div>
      {status === "unsupported" ? (
        <p className="book-message">Statistics are available for supported crypto pairs.</p>
      ) : !stats ? (
        <p className="book-message">{status === "error" ? "Could not load market statistics. Please try again shortly." : "Loading market statistics…"}</p>
      ) : (
        <div className="market-stats-grid">
          <div className="market-stat"><span>Last price</span><strong>{formatPrice(stats.lastPrice)}</strong></div>
          <div className="market-stat"><span>24h change</span><strong className={changePositive ? "trade-buy" : "trade-sell"}>{changePositive ? "+" : ""}{change.toFixed(2)}%</strong><small>{changePositive ? "+" : ""}{formatPrice(stats.priceChange)}</small></div>
          <div className="market-stat"><span>24h high</span><strong className="trade-buy">{formatPrice(stats.highPrice)}</strong></div>
          <div className="market-stat"><span>24h low</span><strong className="trade-sell">{formatPrice(stats.lowPrice)}</strong></div>
          <div className="market-stat"><span>Base volume</span><strong>{formatVolume(stats.volume)}</strong><small>{symbol.split("/")[0]}</small></div>
          <div className="market-stat"><span>Quote volume</span><strong>{formatVolume(stats.quoteVolume)}</strong><small>USDT</small></div>
        </div>
      )}
      <p className="book-footnote">Rolling 24-hour exchange statistics for reference only.</p>
    </section>
  );
}
