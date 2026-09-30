"use client";

import { useEffect, useState } from "react";

type Trade = {
  id: number;
  price: string;
  qty: string;
  time: number;
  isBuyerMaker: boolean;
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

function price(value: string) {
  const number = Number(value);
  return number.toLocaleString("en-US", {
    minimumFractionDigits: number < 1 ? 4 : 2,
    maximumFractionDigits: number < 1 ? 8 : 2,
  });
}

function quantity(value: string) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 8 });
}

export default function RecentTrades({ symbol }: { symbol: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "error" | "unsupported">("loading");

  useEffect(() => {
    const pair = pairs[symbol];
    let active = true;
    if (!pair) {
      setTrades([]);
      setStatus("unsupported");
      return;
    }

    const loadTrades = async () => {
      try {
        const response = await fetch(`https://api.binance.com/api/v3/trades?symbol=${pair}&limit=10`, { cache: "no-store" });
        if (!response.ok) throw new Error("Recent trades unavailable");
        const data: Trade[] = await response.json();
        if (!active) return;
        setTrades(data.slice().reverse());
        setStatus("live");
      } catch {
        if (active) setStatus("error");
      }
    };

    setStatus("loading");
    void loadTrades();
    const timer = window.setInterval(() => void loadTrades(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbol]);

  return (
    <section className="panel recent-trades-panel" aria-label={`Recent market trades for ${symbol}`}>
      <div className="panel-title recent-trades-heading">
        <div><h2>Recent Market Trades</h2><small>{symbol} · Binance public trades</small></div>
        <span className={status === "live" ? "book-live" : "book-status"}>{status === "live" ? "● Live · 10s" : status === "loading" ? "Connecting…" : status === "unsupported" ? "Unavailable" : "Data unavailable"}</span>
      </div>
      {status === "unsupported" ? (
        <p className="book-message">Recent trades are available for supported crypto pairs.</p>
      ) : status === "error" && trades.length === 0 ? (
        <p className="book-message">Could not load recent market trades. Please try again shortly.</p>
      ) : (
        <>
          <div className="recent-trades-columns"><span>Time</span><span>Side</span><span>Price (USD)</span><span>Amount</span></div>
          <div className="recent-trades-list">
            {trades.map((trade) => {
              const side = trade.isBuyerMaker ? "Sell" : "Buy";
              return (
                <div className="recent-trade-row" key={trade.id}>
                  <span>{new Date(trade.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                  <strong className={side === "Buy" ? "trade-buy" : "trade-sell"}>{side}</strong>
                  <span className={side === "Buy" ? "trade-buy" : "trade-sell"}>{price(trade.price)}</span>
                  <span>{quantity(trade.qty)}</span>
                </div>
              );
            })}
          </div>
          {status === "error" && <p className="book-message">Showing the last available snapshot; refresh is unavailable.</p>}
        </>
      )}
      <p className="book-footnote">Public exchange trades for reference only. These are not trades executed by your SunStrade account.</p>
    </section>
  );
}
