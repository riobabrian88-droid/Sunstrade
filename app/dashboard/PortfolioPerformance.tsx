"use client";

import { useMemo } from "react";

type Order = {
  id: number;
  symbol: string;
  side: string;
  qty: number;
  status: string;
  filled_price: number | null;
  created_at: string;
  filled_at: string | null;
};

type Point = { time: number; value: number };

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PortfolioPerformance({ orders }: { orders: Order[] }) {
  const points = useMemo(() => {
    const lots = new Map<string, Array<{ qty: number; price: number }>>();
    const realized: Point[] = [];
    let cumulative = 0;
    const filled = orders
      .filter((order) => order.status === "filled" && Number(order.filled_price) > 0 && Number(order.qty) > 0)
      .slice()
      .sort((a, b) => new Date(a.filled_at || a.created_at).getTime() - new Date(b.filled_at || b.created_at).getTime());

    for (const order of filled) {
      const queue = lots.get(order.symbol) || [];
      const qty = Number(order.qty);
      const price = Number(order.filled_price);
      if (order.side === "buy") {
        queue.push({ qty, price });
      } else if (order.side === "sell") {
        let remaining = qty;
        while (remaining > 0 && queue.length > 0) {
          const lot = queue[0];
          const used = Math.min(remaining, lot.qty);
          cumulative += used * (price - lot.price);
          remaining -= used;
          lot.qty -= used;
          if (lot.qty <= 0.000000001) queue.shift();
        }
        if (remaining < qty) {
          realized.push({ time: new Date(order.filled_at || order.created_at).getTime(), value: cumulative });
        }
      }
      lots.set(order.symbol, queue);
    }
    return realized.slice(-30);
  }, [orders]);

  const latest = points[points.length - 1]?.value ?? 0;
  const min = Math.min(0, ...points.map((point) => point.value));
  const max = Math.max(0, ...points.map((point) => point.value));
  const range = max - min || 1;
  const coords = points.map((point, index) => ({
    x: points.length < 2 ? 50 : 8 + (index / (points.length - 1)) * 84,
    y: 86 - ((point.value - min) / range) * 72,
  }));
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const positive = latest >= 0;

  return (
    <section className="panel performance-panel" aria-label="Portfolio realized performance">
      <div className="panel-title performance-heading">
        <div><h2>Portfolio Performance</h2><small>Realized profit &amp; loss · Completed trades</small></div>
        <span className={positive ? "trade-buy" : "trade-sell"}>{positive ? "+" : ""}{money(latest)}</span>
      </div>
      {points.length === 0 ? (
        <div className="performance-empty">Your performance chart will appear after you complete a sell trade.</div>
      ) : (
        <>
          <div className="performance-chart">
            <div className="performance-axis"><span>{money(max)}</span><span>{money((max + min) / 2)}</span><span>{money(min)}</span></div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Cumulative realized profit and loss chart">
              <line x1="8" y1={86 - ((0 - min) / range) * 72} x2="92" y2={86 - ((0 - min) / range) * 72} className="performance-zero" />
              {coords.length > 1 && <polyline points={line} className={positive ? "performance-line positive-line" : "performance-line negative-line"} />}
              {coords.length === 1 && <circle cx={coords[0].x} cy={coords[0].y} r="1.8" className="performance-dot" />}
            </svg>
          </div>
          <div className="performance-dates"><span>{new Date(points[0].time).toLocaleDateString()}</span><span>{new Date(points[points.length - 1].time).toLocaleDateString()}</span></div>
          <p className="performance-note">Cumulative realized P/L from filled sell orders, matched against buys using FIFO. Open-position gains are not included.</p>
        </>
      )}
    </section>
  );
}
