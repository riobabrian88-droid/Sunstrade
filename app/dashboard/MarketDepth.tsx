"use client";

import { useEffect, useMemo, useState } from "react";

type Level = { price: number; quantity: number };
type Depth = { bids: Level[]; asks: Level[] };

const pairs: Record<string, string> = {
  "BTC/USD": "BTCUSDT", "ETH/USD": "ETHUSDT", "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT", "XRP/USD": "XRPUSDT", "DOGE/USD": "DOGEUSDT",
  "ADA/USD": "ADAUSDT", "LTC/USD": "LTCUSDT",
};

function priceLabel(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

export default function MarketDepth({ symbol }: { symbol: string }) {
  const [depth, setDepth] = useState<Depth>({ bids: [], asks: [] });
  const [status, setStatus] = useState<"loading" | "live" | "error" | "unsupported">("loading");

  useEffect(() => {
    const pair = pairs[symbol];
    let active = true;
    if (!pair) {
      setDepth({ bids: [], asks: [] });
      setStatus("unsupported");
      return;
    }
    const load = async () => {
      try {
        const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${pair}&limit=100`, { cache: "no-store" });
        if (!response.ok) throw new Error("Market depth unavailable");
        const data = await response.json();
        if (!active) return;
        const parse = (rows: string[][]): Level[] => rows
          .map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity) }))
          .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.quantity) && level.quantity > 0);
        setDepth({ bids: parse(data.bids || []), asks: parse(data.asks || []) });
        setStatus("live");
      } catch {
        if (active) setStatus("error");
      }
    };
    setStatus("loading");
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [symbol]);

  const chart = useMemo(() => {
    const bids = [...depth.bids].sort((a, b) => b.price - a.price);
    const asks = [...depth.asks].sort((a, b) => a.price - b.price);
    if (!bids.length || !asks.length) return null;

    let bidTotal = 0;
    const bidPoints = bids.map((level) => {
      bidTotal += level.quantity;
      return { price: level.price, total: bidTotal };
    }).reverse();
    let askTotal = 0;
    const askPoints = asks.map((level) => {
      askTotal += level.quantity;
      return { price: level.price, total: askTotal };
    });

    const minPrice = Math.min(bidPoints[0].price, asks[0].price);
    const maxPrice = Math.max(bids[bids.length - 1].price, asks[asks.length - 1].price);
    const range = maxPrice - minPrice || Math.max(maxPrice * 0.001, 1);
    const maxQty = Math.max(bidTotal, askTotal, 0.00000001);
    const x = (price: number) => 8 + ((price - minPrice) / range) * 584;
    const y = (qty: number) => 166 - (qty / maxQty) * 146;
    const path = (points: { price: number; total: number }[]) =>
      points.map((point, index) => `${index ? "L" : "M"} ${x(point.price).toFixed(2)} ${y(point.total).toFixed(2)}`).join(" ");
    const bidLine = path(bidPoints);
    const askLine = path(askPoints);
    return {
      bidLine, askLine,
      bidArea: `${bidLine} L ${x(bidPoints[bidPoints.length - 1].price).toFixed(2)} 166 L ${x(bidPoints[0].price).toFixed(2)} 166 Z`,
      askArea: `${askLine} L ${x(askPoints[askPoints.length - 1].price).toFixed(2)} 166 L ${x(askPoints[0].price).toFixed(2)} 166 Z`,
      min: minPrice, max: maxPrice,
      bidQty: bidTotal, askQty: askTotal,
      midpoint: (bids[0].price + asks[0].price) / 2,
      midpointX: x((bids[0].price + asks[0].price) / 2),
    };
  }, [depth]);

  return (
    <section className="panel market-depth-panel" aria-label={`Market depth chart for ${symbol}`}>
      <div className="panel-title market-depth-heading">
        <div><h2>Market Depth</h2><small>{symbol} · Cumulative order-book liquidity</small></div>
        <span className={status === "live" ? "book-live" : "book-status"}>{status === "live" ? "● Live · 10s" : status === "loading" ? "Connecting…" : status === "unsupported" ? "Unavailable" : "Data unavailable"}</span>
      </div>
      {status === "unsupported" ? (
        <p className="book-message">Market depth is available for supported crypto pairs.</p>
      ) : !chart ? (
        <p className="book-message">{status === "error" ? "Could not load market depth. Please try again shortly." : "Loading market depth…"}</p>
      ) : (
        <>
          <div className="depth-legend"><span><i className="depth-bid-key" /> Bids <b>{chart.bidQty.toLocaleString("en-US",{maximumFractionDigits:4})}</b></span><span><i className="depth-ask-key" /> Asks <b>{chart.askQty.toLocaleString("en-US",{maximumFractionDigits:4})}</b></span></div>
          <svg className="market-depth-chart" viewBox="0 0 600 190" role="img" aria-label="Cumulative buy and sell liquidity by price">
            {[20, 68, 117, 166].map((y) => <line key={y} x1="8" x2="592" y1={y} y2={y} className="depth-gridline" />)}
            <path d={chart.bidArea} className="depth-bid-area" />
            <path d={chart.askArea} className="depth-ask-area" />
            <path d={chart.bidLine} className="depth-bid-line" />
            <path d={chart.askLine} className="depth-ask-line" />
            <line x1={chart.midpointX} x2={chart.midpointX} y1="18" y2="166" className="depth-midline" />
            <text x="8" y="184" className="depth-axis-label">{priceLabel(chart.min)}</text>
            <text x="300" y="184" textAnchor="middle" className="depth-axis-label">{priceLabel(chart.midpoint)}</text>
            <text x="592" y="184" textAnchor="end" className="depth-axis-label">{priceLabel(chart.max)}</text>
          </svg>
          <div className="depth-axis-caption"><span>Buy-side liquidity</span><span>Sell-side liquidity</span></div>
          {status === "error" && <p className="book-message">Showing the last available snapshot; refresh is unavailable.</p>}
        </>
      )}
      <p className="book-footnote">Illustrative cumulative depth from public Binance order-book data. This is reference market data, not SunStrade execution liquidity.</p>
    </section>
  );
}
