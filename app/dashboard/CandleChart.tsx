"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type CandlestickData,
  type LineData,
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
  "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT",
  "XRP/USD": "XRPUSDT",
  "DOGE/USD": "DOGEUSDT",
  "ADA/USD": "ADAUSDT",
  "LTC/USD": "LTCUSDT",
};

export default function CandleChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const smaSeriesRef = useRef<any>(null);
  const upperBandRef = useRef<any>(null);
  const lowerBandRef = useRef<any>(null);
  const macdSeriesRef = useRef<any>(null);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawings, setDrawings] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);
  const pendingPoint = useRef<{ x: number; y: number } | null>(null);
  const [timeframe, setTimeframe] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSma, setShowSma] = useState(false);
  const [showRsi, setShowRsi] = useState(false);

  const smaData = useMemo<LineData<UTCTimestamp>[]>(() => {
    const period = 20;
    return candles.slice(period - 1).map((candle, index) => {
      const window = candles.slice(index, index + period);
      return {
        time: candle.time,
        value: window.reduce((sum, item) => sum + item.close, 0) / period,
      };
    });
  }, [candles]);

  const bollingerData = useMemo(() => {
    const period = 20;
    return candles.slice(period - 1).map((candle, index) => {
      const window = candles.slice(index, index + period);
      const mean = window.reduce((sum, item) => sum + item.close, 0) / period;
      const variance = window.reduce((sum, item) => sum + (item.close - mean) ** 2, 0) / period;
      const deviation = Math.sqrt(variance) * 2;
      return { time: candle.time, upper: mean + deviation, lower: mean - deviation };
    });
  }, [candles]);

  const macd = useMemo(() => {
    const ema = (values: number[], period: number) => {
      const k = 2 / (period + 1);
      let value = values[0] || 0;
      return values.map((item, index) => {
        value = index === 0 ? item : item * k + value * (1 - k);
        return value;
      });
    };
    if (candles.length < 35) return null;
    const closes = candles.map((candle) => candle.close);
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    const line = fast.map((value, index) => value - slow[index]);
    const signal = ema(line, 9);
    return { value: line[line.length - 1], signal: signal[signal.length - 1], histogram: line[line.length - 1] - signal[signal.length - 1] };
  }, [candles]);

  const rsi = useMemo(() => {
    const period = 14;
    if (candles.length <= period) return null;
    const changes = candles.slice(1).map((candle, index) => candle.close - candles[index].close);
    let gains = 0;
    let losses = 0;
    for (const change of changes.slice(0, period)) {
      gains += Math.max(change, 0);
      losses += Math.max(-change, 0);
    }
    let averageGain = gains / period;
    let averageLoss = losses / period;
    for (const change of changes.slice(period)) {
      averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
      averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    }
    if (averageLoss === 0) return 100;
    return 100 - 100 / (1 + averageGain / averageLoss);
  }, [candles]);

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

    chartRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#39b982",
      downColor: "#e36d6d",
      borderUpColor: "#39b982",
      borderDownColor: "#e36d6d",
      wickUpColor: "#39b982",
      wickDownColor: "#e36d6d",
    });
    upperBandRef.current = chart.addSeries(LineSeries, { color: "#7c8ee8", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: "BB Upper" });
    lowerBandRef.current = chart.addSeries(LineSeries, { color: "#7c8ee8", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: "BB Lower" });
    smaSeriesRef.current = chart.addSeries(LineSeries, {
      color: "#e6b75d",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "SMA 20",
    });

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      smaSeriesRef.current = null;
      upperBandRef.current = null;
      lowerBandRef.current = null;
      macdSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    if (candles.length) {
      candleSeriesRef.current.setData(candles);
      chartRef.current.timeScale().fitContent();
    }
  }, [candles]);

  useEffect(() => {
    if (!smaSeriesRef.current) return;
    smaSeriesRef.current.setData(showSma ? smaData : []);
  }, [showSma, smaData]);

  useEffect(() => {
    if (!upperBandRef.current || !lowerBandRef.current) return;
    upperBandRef.current.setData(showBollinger ? bollingerData.map((point) => ({ time: point.time, value: point.upper })) : []);
    lowerBandRef.current.setData(showBollinger ? bollingerData.map((point) => ({ time: point.time, value: point.lower })) : []);
  }, [showBollinger, bollingerData]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !drawingMode) return;
    const handleClick = (param: any) => {
      if (!param.point || param.point.x < 0 || param.point.y < 0) return;
      const point = { x: param.point.x, y: param.point.y };
      if (!pendingPoint.current) {
        pendingPoint.current = point;
      } else {
        const start = pendingPoint.current;
        setDrawings((current) => [...current, { x1: start.x, y1: start.y, x2: point.x, y2: point.y }]);
        pendingPoint.current = null;
        setDrawingMode(false);
      }
    };
    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [drawingMode]);

  useEffect(() => {
    let active = true;
    const pair = symbols[symbol];

    async function loadCandles() {
      setError("");
      if (!pair) {
        setCandles([]);
        setError("Candlestick charts currently support BTC, ETH, BNB, SOL, XRP, DOGE, ADA, and LTC. Select one of these crypto markets to view candles.");
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

    setLoading(true);
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
      <div className="candle-indicators" aria-label="Chart indicators">
        <button type="button" className={showSma ? "active" : ""} onClick={() => setShowSma((value) => !value)}>SMA 20</button>
        <button type="button" className={showRsi ? "active" : ""} onClick={() => setShowRsi((value) => !value)}>RSI 14</button>
        <button type="button" className={showBollinger ? "active" : ""} onClick={() => setShowBollinger((value) => !value)}>Bollinger Bands</button>
        <button type="button" className={showMacd ? "active" : ""} onClick={() => setShowMacd((value) => !value)}>MACD</button>
        <button type="button" className={drawingMode ? "active" : ""} onClick={() => { pendingPoint.current = null; setDrawingMode((value) => !value); }}>Trend line</button>
        <button type="button" onClick={() => { setDrawings([]); pendingPoint.current = null; }}>Clear drawings</button>
      </div>
      <div className="candle-chart-area" ref={containerRef}>
        <svg className="candle-drawings" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
          {drawings.map((line, index) => <line key={index} x1={`${line.x1 / (containerRef.current?.clientWidth || 1000) * 1000}`} y1={`${line.y1 / (containerRef.current?.clientHeight || 360) * 360}`} x2={`${line.x2 / (containerRef.current?.clientWidth || 1000) * 1000}`} y2={`${line.y2 / (containerRef.current?.clientHeight || 360) * 360}`} stroke="#e6b75d" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
        </svg>
      </div>
      {drawingMode && <div className="candle-message">Trend line: tap two points on the chart to draw a line.</div>}
      {showMacd && <div className="rsi-panel"><span>MACD (12, 26, 9)</span><strong>{macd ? macd.value.toFixed(4) : "Calculating…"}</strong><span>Signal: {macd ? macd.signal.toFixed(4) : "—"}</span><span>Histogram: {macd ? macd.histogram.toFixed(4) : "—"}</span></div>}
      {showRsi && (
        <div className="rsi-panel">
          <span>RSI (14)</span>
          <strong className={rsi !== null && rsi >= 70 ? "negative" : rsi !== null && rsi <= 30 ? "positive" : ""}>{rsi === null ? "Calculating…" : rsi.toFixed(2)}</strong>
          <small>Above 70: overbought · Below 30: oversold</small>
        </div>
      )}
      {loading && <div className="candle-message">Loading candles…</div>}
      {!loading && error && <div className="candle-message">{error}</div>}
    </div>
  );
}
