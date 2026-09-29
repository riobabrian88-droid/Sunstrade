"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./dashboard.css";
import CandleChart from "./CandleChart";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Asset = {
  symbol: string;
  name: string;
  price: number;
  prev_close: number | null;
  volatility: number | null;
  change_24h?: number | null;
};

type Position = {
  user_id: string;
  symbol: string;
  qty: number;
  avg_price: number;
};

type Order = {
  id: number;
  user_id: string;
  symbol: string;
  side: string;
  order_type: string;
  qty: number;
  limit_price: number | null;
  status: string;
  filled_price: number | null;
  created_at: string;
  filled_at: string | null;
};

type Profile = {
  full_name?: string | null;
  username?: string | null;
};

const fallbackAssets: Asset[] = [
  { symbol: "BNB/USD", name: "BNB / US Dollar", price: 0, prev_close: null, volatility: 0.02 },
  { symbol: "SOL/USD", name: "Solana / US Dollar", price: 0, prev_close: null, volatility: 0.03 },
  { symbol: "XRP/USD", name: "XRP / US Dollar", price: 0, prev_close: null, volatility: 0.03 },
  { symbol: "DOGE/USD", name: "Dogecoin / US Dollar", price: 0, prev_close: null, volatility: 0.04 },
  { symbol: "ADA/USD", name: "Cardano / US Dollar", price: 0, prev_close: null, volatility: 0.03 },
  { symbol: "LTC/USD", name: "Litecoin / US Dollar", price: 0, prev_close: null, volatility: 0.03 },
  {
    symbol: "BTC/USD",
    name: "Bitcoin / US Dollar",
    price: 67482.35,
    prev_close: 66233.73,
    volatility: 0.02,
  },
  {
    symbol: "ETH/USD",
    name: "Ethereum / US Dollar",
    price: 3249.17,
    prev_close: 3175.86,
    volatility: 0.02,
  },
  {
    symbol: "XAU/USD",
    name: "Gold / US Dollar",
    price: 2501.42,
    prev_close: 2484.54,
    volatility: 0.01,
  },
  {
    symbol: "EUR/USD",
    name: "Euro / US Dollar",
    price: 1.1076,
    prev_close: 1.1049,
    volatility: 0.003,
  },
  {
    symbol: "USD/JPY",
    name: "US Dollar / Japanese Yen",
    price: 143.32,
    prev_close: 143.58,
    volatility: 0.003,
  },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: number) {
  if (value < 10) return value.toFixed(4);

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function percentChange(
  price: number,
  previous: number | null
) {
  if (!previous) return 0;
  return ((price - previous) / previous) * 100;
}

function assetPercentChange(asset: Asset) {
  return typeof asset.change_24h === "number" && Number.isFinite(asset.change_24h)
    ? asset.change_24h
    : percentChange(asset.price, asset.prev_close);
}

type RealizedDailyPL = { profit: number; costBasis: number };

function calculateTodayRealizedPL(orders: Order[]): RealizedDailyPL {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();

  const lots = new Map<string, Array<{ qty: number; price: number }>>();
  let profit = 0;
  let costBasis = 0;

  const filledOrders = orders
    .filter((order) => order.status === "filled")
    .slice()
    .sort(
      (a, b) =>
        new Date(a.filled_at || a.created_at).getTime() -
        new Date(b.filled_at || b.created_at).getTime()
    );

  for (const order of filledOrders) {
    const queue = lots.get(order.symbol) || [];
    const timestamp = new Date(order.filled_at || order.created_at).getTime();
    const price = Number(order.filled_price);

    if (!Number.isFinite(price) || price <= 0) continue;

    if (order.side === "buy") {
      queue.push({ qty: Number(order.qty), price });
      lots.set(order.symbol, queue);
      continue;
    }

    if (order.side !== "sell") continue;

    let remaining = Number(order.qty);
    let matchedCost = 0;
    let matchedQty = 0;

    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const used = Math.min(remaining, lot.qty);
      matchedCost += used * lot.price;
      matchedQty += used;
      remaining -= used;
      lot.qty -= used;
      if (lot.qty <= 0.000000001) queue.shift();
    }

    if (timestamp >= today && matchedQty > 0) {
      costBasis += matchedCost;
      profit += matchedQty * price - matchedCost;
    }
    lots.set(order.symbol, queue);
  }

  return { profit, costBasis };
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [walletBalance, setWalletBalance] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [assets, setAssets] = useState<Asset[]>(fallbackAssets);
  const [priceStatus, setPriceStatus] = useState("Connecting...");
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USD");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [lotAmount, setLotAmount] = useState("0.01");

  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [toast, setToast] = useState("");

  const selectedAsset =
    assets.find((asset) => asset.symbol === selectedSymbol) ||
    fallbackAssets[0];

  const selectedPrice = selectedAsset?.price || 0;

  const availableBalance = walletBalance;

  const requiredMargin =
    selectedPrice * Number(lotAmount || 0);

  const openPL = useMemo(() => {
    return positions.reduce((total, position) => {
      const asset = assets.find((item) => item.symbol === position.symbol);
      if (!asset) return total;
      return total + (asset.price - position.avg_price) * position.qty;
    }, 0);
  }, [positions, assets]);

  const equity = useMemo(() => {
    const marketValue = positions.reduce((total, position) => {
      const asset = assets.find((item) => item.symbol === position.symbol);
      return total + (asset ? position.qty * asset.price : 0);
    }, 0);
    return walletBalance + marketValue;
  }, [walletBalance, positions, assets]);

  const investedValue = useMemo(
    () => positions.reduce((total, position) => total + position.qty * position.avg_price, 0),
    [positions]
  );

  const todayPL = useMemo(
    () => calculateTodayRealizedPL(orders),
    [orders]
  );

  const todayPLPercent = todayPL.costBasis > 0
    ? (todayPL.profit / todayPL.costBasis) * 100
    : 0;

  const freeMargin = walletBalance;

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session?.user) {
        window.location.href = "/login";
        return;
      }

      const { data: account, error: accountError } = await supabase
        .from("profiles")
        .select("is_suspended")
        .eq("id", session.user.id)
        .maybeSingle();

      if (accountError || account?.is_suspended) {
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      setUser(session.user);
      await loadDashboardData(session.user.id);

      if (mounted) {
        setLoading(false);
      }
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          window.location.href = "/login";
          return;
        }

        setUser(session.user);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
  loadLivePrices();

  const interval = window.setInterval(() => {
    loadLivePrices();
  }, 30000);

  return () => {
    window.clearInterval(interval);
  };
}, []);
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("sunraku-dashboard")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadDashboardData(user.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "positions",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadDashboardData(user.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadDashboardData(user.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function loadDashboardData(userId: string) {
    const [
      profileResult,
      walletResult,
      positionsResult,
      ordersResult,
      assetsResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),

      supabase
        .from("wallets")
        .select("cash_balance")
        .eq("user_id", userId)
        .maybeSingle(),

      supabase
        .from("positions")
        .select("user_id,symbol,qty,avg_price")
        .eq("user_id", userId)
        .order("symbol"),

      supabase
        .from("orders")
        .select(
          "id,user_id,symbol,side,order_type,qty,limit_price,status,filled_price,created_at,filled_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),

      supabase
        .from("assets")
        .select(
          "symbol,name,price,prev_close,volatility"
        )
        .order("symbol"),
    ]);

    if (profileResult.error) {
      console.error("Profile error:", profileResult.error);
    } else {
      setProfile(profileResult.data);
    }

    if (walletResult.error) {
      console.error("Wallet error:", walletResult.error);
    } else {
      setWalletBalance(
        Number(walletResult.data?.cash_balance || 0)
      );
    }

    if (positionsResult.error) {
      console.error(
        "Positions error:",
        positionsResult.error
      );
    } else {
      setPositions(positionsResult.data || []);
    }

    if (ordersResult.error) {
      console.error("Orders error:", ordersResult.error);
    } else {
      setOrders(ordersResult.data || []);
    }

    if (!assetsResult.error && assetsResult.data?.length) {
      setAssets(
        assetsResult.data.map((asset) => ({
          ...asset,
          price: Number(asset.price),
          prev_close:
            asset.prev_close === null
              ? null
              : Number(asset.prev_close),
          volatility:
            asset.volatility === null
              ? null
              : Number(asset.volatility),
        }))
      );
    }
  }
  async function loadLivePrices() {
  try {
    const response = await fetch("/api/prices", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to fetch prices");
    }

    const data = await response.json();

    setAssets((currentAssets) =>
      currentAssets.map((asset) => {
        const livePrice = data[asset.symbol];
        const liveChange = data.changes?.[asset.symbol];
        return {
          ...asset,
          ...(typeof livePrice === "number" && Number.isFinite(livePrice)
            ? { price: livePrice }
            : {}),
          ...(typeof liveChange === "number" && Number.isFinite(liveChange)
            ? { change_24h: liveChange }
            : {}),
        };
      })
    );

    setPriceStatus("Live prices");
  } catch (error) {
    console.error("Live price error:", error);
    setPriceStatus("Price service unavailable");
  }
}
  async function handleSignOut() {
    setSigningOut(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      showToast(error.message);
      setSigningOut(false);
      return;
    }

    window.location.href = "/login";
  }

  async function handlePlaceOrder() {
    if (!user) {
      showToast("Please sign in first.");
      return;
    }

    const { data: account, error: accountError } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("id", user.id)
      .maybeSingle();

    if (accountError || account?.is_suspended) {
      await supabase.auth.signOut();
      window.location.href = "/login";
      return;
    }

    const qty = Number(lotAmount);

    if (!Number.isFinite(qty) || qty <= 0) {
      showToast("Enter a valid lot amount.");
      return;
    }

    setPlacingOrder(true);

    const { error } = await supabase.rpc("place_order", {
      p_symbol: selectedSymbol,
      p_side: side,
      p_order_type: "market",
      p_qty: qty,
      p_limit_price: null,
    });

    if (error) {
      console.error(error);
      showToast(error.message);
      setPlacingOrder(false);
      return;
    }

    showToast(
      `${side === "buy" ? "Buy" : "Sell"} order placed successfully.`
    );

    await loadDashboardData(user.id);
    setPlacingOrder(false);
  }

  function showToast(message: string) {
    setToast(message);

    window.setTimeout(() => {
      setToast("");
    }, 3500);
  }

  function getDisplayName() {
    return (
      profile?.full_name ||
      profile?.username ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split("@")[0] ||
      "Trader"
    );
  }

  function getInitial() {
    return getDisplayName().charAt(0).toUpperCase();
  }

  if (loading) {
    return (
      <main className="dashboard-loading">
        <div className="loading-card">
          <div className="loading-logo">S</div>
          <h1>Sunraku Trade</h1>
          <p>Loading your trading dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="trade-app">
      <header className="trade-header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <svg viewBox="0 0 40 40" fill="none">
              <path
                d="M5 29V18l7-5v8l8-12 5 4 10-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M26 4h9v9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>

          <span>
            <strong>
              Sunraku <em>Trade</em>
            </strong>
            <small>Read the candles, not the noise.</small>
          </span>
        </a>

        <div className="header-actions">
          <button
            className="icon-btn"
            type="button"
            aria-label="Toggle theme"
            onClick={() => {
              document.documentElement.classList.toggle(
                "light-theme"
              );
            }}
          >
            ☾
          </button>

          <button
            className="icon-btn notification"
            type="button"
            aria-label="Notifications"
          >
            ♧
            <span>3</span>
          </button>

          <a
            href="/profile"
            className="user-chip profile-shortcut"
            aria-label="Open your profile"
            title="Open your profile"
          >
            <span className="avatar">{getInitial()}</span>

            <span className="user-copy">
              <strong>{getDisplayName()}</strong>
              <small>{user?.email || "No email"}</small>
            </span>
          </a>

          <button
            className="signout-btn"
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <div className="trade-shell">
        <aside className="sidebar">
          <nav className="side-nav">
            <a className="active" href="/dashboard">
              <span>⌂</span> Dashboard
            </a>

            <a href="#orderPanel">
              <span>↗</span> Trade
            </a>

            <a href="#watchlist">
              <span>◉</span> Markets
            </a>

            <a href="#positions">
              <span>▣</span> Portfolio
            </a>

            <a href="#history">
              <span>◷</span> History
            </a>

            <a href="#insights">
              <span>▥</span> Analytics
            </a>

            <a href="/profile">
              <span>◉</span> Profile
            </a>

            <a href="/settings">
              <span>⚙</span> Settings
            </a>
          </nav>

          <div className="pro-card">
            <div className="pro-icon">♛</div>
            <h3>Upgrade to Pro</h3>
            <p>
              Get advanced tools, more indicators and priority
              support.
            </p>
            <button type="button" className="gold-btn">
              Go Pro
            </button>
          </div>
       <div className="market-status">
  <span className="status-dot" />
  <div>
    <strong>Crypto Market</strong>
    <small>{priceStatus}</small>
  </div>
</div>
        </aside>

        <section className="workspace">
          <section className="stats-grid">
            <a
  href="/wallet"
  className="stat-card"
  style={{ display: "block", textDecoration: "none" }}
>
  <span>Total Balance</span>
  <strong>{formatMoney(walletBalance)}</strong>
  <small className="positive">
    View wallet, deposit or withdraw →
  </small>
</a>

            <article className="stat-card">
              <span>Equity</span>
              <strong>{formatMoney(equity)}</strong>
              <small>Cash + current position value</small>
            </article>

            <article className="stat-card">
              <span>Free Margin</span>
              <strong>{formatMoney(freeMargin)}</strong>
              <small>Cash available for new trades</small>
            </article>

            <article className="stat-card">
              <span>Today's P/L</span>
              <strong className={todayPL.profit >= 0 ? "positive" : "negative"}>
                {todayPL.profit >= 0 ? "+" : ""}
                {formatMoney(todayPL.profit)}
              </strong>
              <small className={todayPL.profit >= 0 ? "positive" : "negative"}>
                {todayPL.profit >= 0 ? "+" : ""}
                {todayPLPercent.toFixed(2)}% realized today
              </small>
            </article>
          </section>

          <section className="market-strip">
            {assets.slice(0, 5).map((asset) => {
              const change = assetPercentChange(asset);

              return (
                <button
                  key={asset.symbol}
                  className={`symbol-card ${
                    selectedSymbol === asset.symbol
                      ? "active"
                      : ""
                  }`}
                  type="button"
                  onClick={() =>
                    setSelectedSymbol(asset.symbol)
                  }
                >
                  <span className="coin btc">◆</span>

                  <span>
                    <b>{asset.symbol}</b>
                    <small>{formatPrice(asset.price)}</small>
                  </span>

                  <strong
                    className={
                      change >= 0 ? "positive" : "negative"
                    }
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(2)}%
                  </strong>
                </button>
              );
            })}
          </section>

          <div className="main-grid">
            <section className="chart-panel">
              <div className="chart-head">
                <div className="instrument">
                  <span className="coin btc">◆</span>

                  <div>
                    <strong>{selectedAsset.symbol}</strong>
                    <small>{selectedAsset.name}</small>
                  </div>
                </div>

                <div className="price-box">
                  <strong>{formatPrice(selectedPrice)}</strong>

                  <span
                    className={
                      assetPercentChange(selectedAsset) >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    {assetPercentChange(selectedAsset) >= 0
                      ? "+"
                      : ""}
                    {assetPercentChange(selectedAsset).toFixed(2)}
                    %
                  </span>
                </div>

                <div className="ohlc">
                  <span>
                    Price <b>{formatPrice(selectedPrice)}</b>
                  </span>

                  <span>
                    Previous{" "}
                    <b>
                      {selectedAsset.prev_close
                        ? formatPrice(
                            selectedAsset.prev_close
                          )
                        : "—"}
                    </b>
                  </span>
                </div>
              </div>

              <CandleChart symbol={selectedSymbol} />

              <div className="chart-note">
                Market prices are supplied by the Sunraku
                database.
              </div>
            </section>

            <aside className="right-column">
              <section
                className="panel watchlist"
                id="watchlist"
              >
                <div className="panel-title">
                  <h2>Market Watch</h2>
                </div>

                <div className="tabs">
                  <button className="active" type="button">
                    Markets
                  </button>
                </div>

                {assets.map((asset) => {
                  const change = assetPercentChange(asset);

                  return (
                    <button
                      className="watch-row"
                      key={asset.symbol}
                      type="button"
                      onClick={() =>
                        setSelectedSymbol(asset.symbol)
                      }
                    >
                      <span className="coin btc">◆</span>
                      <b>{asset.symbol}</b>
                      <span>{formatPrice(asset.price)}</span>

                      <strong
                        className={
                          change >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        {change >= 0 ? "+" : ""}
                        {change.toFixed(2)}%
                      </strong>
                    </button>
                  );
                })}
              </section>

              <section
                className="panel order-panel"
                id="orderPanel"
              >
                <div className="order-symbol">
                  <span className="coin btc">◆</span>

                  <div>
                    <strong>{selectedSymbol}</strong>
                    <small>Market order</small>
                  </div>
                </div>

                <div className="buy-sell">
                  <button
                    className={
                      side === "buy" ? "buy active" : "buy"
                    }
                    type="button"
                    onClick={() => setSide("buy")}
                  >
                    Buy
                  </button>

                  <button
                    className={
                      side === "sell"
                        ? "sell active"
                        : "sell"
                    }
                    type="button"
                    onClick={() => setSide("sell")}
                  >
                    Sell
                  </button>
                </div>

                <div className="order-types">
                  <button
                    className="active"
                    type="button"
                  >
                    Market
                  </button>
                  <button type="button">Limit</button>
                  <button type="button">Stop</button>
                </div>

                <label>
                  Amount (Lot)

                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={lotAmount}
                    onChange={(event) =>
                      setLotAmount(event.target.value)
                    }
                  />
                </label>

                <div className="lot-presets">
                  {["0.01", "0.05", "0.1", "0.5"].map(
                    (amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() =>
                          setLotAmount(amount)
                        }
                      >
                        {amount}
                      </button>
                    )
                  )}
                </div>

                <button
                  className={`place-order ${
                    side === "buy" ? "buy" : "sell"
                  }`}
                  id="placeOrder"
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={placingOrder}
                >
                  {placingOrder
                    ? "Processing..."
                    : `${side === "buy" ? "Buy" : "Sell"} ${selectedSymbol}`}
                </button>

                <div className="margin-info">
                  <span>
                    Required Margin{" "}
                    <b>{formatMoney(requiredMargin)}</b>
                  </span>

                  <span>
                    Available Balance{" "}
                    <b>{formatMoney(availableBalance)}</b>
                  </span>
                </div>

                <p className="demo-warning">
                  Orders are processed through the Sunraku
                  trading database.
                </p>
              </section>
            </aside>
          </div>

          <section
            className="panel positions-panel"
            id="positions"
          >
            <div className="section-tabs">
              <button className="active" type="button">
                Open Positions <b>{positions.length}</b>
              </button>

              <button type="button">
                Pending Orders (
                {
                  orders.filter(
                    (order) =>
                      order.status === "open" ||
                      order.status === "pending"
                  ).length
                }
                )
              </button>

              <button id="history" type="button">
                Trade History
              </button>
            </div>

            <div className="table-wrap">
              {positions.length === 0 ? (
                <div className="empty-state">
                  You don't have any open positions.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th>Lots</th>
                      <th>Open Price</th>
                      <th>Current Price</th>
                      <th>P/L</th>
                    </tr>
                  </thead>

                  <tbody>
                    {positions.map((position) => {
                      const asset = assets.find(
                        (a) =>
                          a.symbol === position.symbol
                      );

                      const currentPrice =
                        asset?.price || position.avg_price;

                      const pnl =
                        (currentPrice -
                          position.avg_price) *
                        position.qty;

                      return (
                        <tr key={position.symbol}>
                          <td>
                            <span className="coin btc">
                              ◆
                            </span>{" "}
                            {position.symbol}
                          </td>

                          <td>
                            <span className="tag buy-tag">
                              Position
                            </span>
                          </td>

                          <td>{position.qty}</td>

                          <td>
                            {formatPrice(position.avg_price)}
                          </td>

                          <td>
                            {formatPrice(currentPrice)}
                          </td>

                          <td
                            className={
                              pnl >= 0
                                ? "positive"
                                : "negative"
                            }
                          >
                            {pnl >= 0 ? "+" : ""}
                            {formatMoney(pnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="panel positions-panel">
            <div className="section-tabs">
              <button className="active" type="button">
                Recent Orders <b>{orders.length}</b>
              </button>
            </div>

            <div className="table-wrap">
              {orders.length === 0 ? (
                <div className="empty-state">
                  No orders have been placed yet.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Type</th>
                      <th>Lots</th>
                      <th>Status</th>
                      <th>Filled Price</th>
                      <th>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {orders.slice(0, 20).map((order) => (
                      <tr key={order.id}>
                        <td>{order.symbol}</td>

                        <td>
                          <span
                            className={
                              order.side === "buy"
                                ? "tag buy-tag"
                                : "tag sell-tag"
                            }
                          >
                            {order.side}
                          </span>
                        </td>

                        <td>{order.order_type}</td>
                        <td>{order.qty}</td>
                        <td>{order.status}</td>

                        <td>
                          {order.filled_price
                            ? formatPrice(
                                order.filled_price
                              )
                            : "—"}
                        </td>

                        <td>
                          {new Date(
                            order.created_at
                          ).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="insights" id="insights">
            <div className="section-heading">
              <h2>Trading Insights</h2>
              <span>Database information</span>
            </div>

            <div className="insight-grid">
              <article>
                <span className="insight-icon">▣</span>
                <div>
                  <small>Open Positions</small>
                  <strong>{positions.length}</strong>
                </div>
              </article>

              <article>
                <span className="insight-icon">↗</span>
                <div>
                  <small>Wallet Balance</small>
                  <strong>
                    {formatMoney(walletBalance)}
                  </strong>
                </div>
              </article>

              <article>
                <span className="insight-icon">◷</span>
                <div>
                  <small>Total Orders</small>
                  <strong>{orders.length}</strong>
                </div>
              </article>

            </div>
          </section>
        </section>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
