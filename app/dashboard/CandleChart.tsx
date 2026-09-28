"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

type Candle = CandlestickData<UTCTimestamp>;

const intervals = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1D", value: "1d" },
];

const symbols: Record<string, string> = {
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
};

export default function CandleChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 360,
      layout: {
        background: { type: ColorType.Solid, color: "#151b23" },
        textColor: "#aab6c2",
        fontFamily: "DM Sans, Arial, sans-serif",
      },
      grid: {
        vertLines: { color: "#202a33" },
        horzLines: { color: "#202a33" },
      },
      rightPriceScale: { borderColor: "#2a3440" },
      timeScale: {
        borderColor: "#2a3440",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#39b982",
      downColor: "#e36d6d",
      borderUpColor: "#39b982",
      borderDownColor: "#e36d6d",
      wickUpColor: "#39b982",
      wickDownColor: "#e36d6d",
    });

    if (candles.length) {
      series.setData(candles);
      chart.timeScale().fitContent();
    }

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles]);

  useEffect(() => {
    let active = true;
    const pair = symbols[symbol];

    async function loadCandles() {
      setLoading(true);
      setError("");
      if (!pair) {
        setCandles([]);
        setError("Candlestick data is currently available for BTC/USD and ETH/USD.");
        setLoading(false);
        return;
      }

      try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${timeframe}&limit=300`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("Market candle data is unavailable.");
        const rows = await response.json();
        const parsed: Candle[] = rows.map((row: (string | number)[]) => ({
          time: Math.floor(Number(row[0]) / 1000) as UTCTimestamp,
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4]),
        }));
        if (active) {
          setCandles(parsed);
          if (!parsed.length) setError("No candle data was returned.");
        }
      } catch {
        if (active) setError("Could not load live candles. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCandles();
    const timer = window.setInterval(loadCandles, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbol, timeframe]);

  return (
    <div className="candle-chart">
      <div className="candle-toolbar">
        <div className="candle-timeframes" aria-label="Chart timeframe">
          {intervals.map((item) => (
            <button
              key={item.value}
              type="button"
              className={timeframe === item.value ? "active" : ""}
              onClick={() => setTimeframe(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="candle-source">Live market data · 15s refresh</span>
      </div>
      <div className="candle-chart-area" ref={containerRef} />
      {loading && <div className="candle-message">Loading candles…</div>}
      {!loading && error && <div className="candle-message">{error}</div>}
    </div>
  );
}
