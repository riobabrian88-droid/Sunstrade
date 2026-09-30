"use client";

import { useEffect, useMemo, useState } from "react";

type Level = { price: number; quantity: number; total: number };
type BookData = { bids: Level[]; asks: Level[] };

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

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

function formatQuantity(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
}

function formatSpread(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

export default function OrderBook({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<BookData>({ bids: [], asks: [] });
  const [status, setStatus] = useState<"loading" | "live" | "error" | "unsupported">("loading");

  useEffect(() => {
    const pair = pairs[symbol];
    let active = true;
    if (!pair) {
      setBook({ bids: [], asks: [] });
      setStatus("unsupported");
      return;
    }

    const loadBook = async () => {
      try {
        const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${pair}&limit=10`, { cache: "no-store" });
        if (!response.ok) throw new Error("Order book unavailable");
        const data = await response.json();
        if (!active) return;
        const toLevels = (rows: string[][]): Level[] => {
          let total = 0;
          return rows.map(([price, quantity]) => {
            const p = Number(price);
            const q = Number(quantity);
            total += q;
            return { price: p, quantity: q, total };
          });
        };
        setBook({ bids: toLevels(data.bids || []), asks: toLevels(data.asks || []) });
        setStatus("live");
      } catch {
        if (active) setStatus("error");
      }
    };

    setStatus("loading");
    void loadBook();
    const timer = window.setInterval(() => void loadBook(), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbol]);

  const spread = useMemo(() => {
    const bestAsk = book.asks[0]?.price;
    const bestBid = book.bids[0]?.price;
    if (!bestAsk || !bestBid) return null;
    return { amount: bestAsk - bestBid, percent: ((bestAsk - bestBid) / bestAsk) * 100 };
  }, [book]);

  const maxTotal = Math.max(1, ...book.bids.map((level) => level.total), ...book.asks.map((level) => level.total));
  const rows = (levels: Level[], side: "bid" | "ask") => levels.map((level, index) => (
    <div className={`book-row ${side}`} key={`${side}-${index}`}>
      <span className="book-depth" style={{ width: `${(level.total / maxTotal) * 100}%` }} />
      <span className="book-price">{formatPrice(level.price)}</span>
      <span>{formatQuantity(level.quantity)}</span>
      <span>{formatQuantity(level.total)}</span>
    </div>
  ));

  return (
    <section className="panel order-book-panel" aria-label={`Live order book for ${symbol}`}>
      <div className="panel-title order-book-heading">
        <div><h2>Live Order Book</h2><small>{symbol} · Binance market depth</small></div>
        <span className={status === "live" ? "book-live" : "book-status"}>{status === "live" ? "● Live · 10s" : status === "loading" ? "Connecting…" : status === "unsupported" ? "Unavailable" : "Data unavailable"}</span>
      </div>
      {status === "unsupported" ? (
        <p className="book-message">Live order book is available for supported crypto pairs.</p>
      ) : status === "error" && !book.bids.length ? (
        <p className="book-message">Could not load market depth. Please try again shortly.</p>
      ) : (
        <>
          <div className="book-column-head"><span>Price (USD)</span><span>Amount</span><span>Total</span></div>
          <div className="book-levels asks">{rows(book.asks, "ask")}</div>
          <div className="book-spread">
            <strong>{spread ? formatSpread(spread.amount) : "—"}</strong>
            <span>Spread {spread ? `(${spread.percent.toFixed(6)}%)` : "—"}</span>
          </div>
          <div className="book-levels bids">{rows(book.bids, "bid")}</div>
          {status === "error" && <p className="book-message">Showing the last available snapshot; refresh is unavailable.</p>}
        </>
      )}
      <p className="book-footnote">Exchange market data for reference only. Orders placed in SunStrade are not submitted to Binance.</p>
    </section>
  );
}
