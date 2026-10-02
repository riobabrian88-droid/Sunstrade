"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./dashboard.css";
import CandleChart from "./CandleChart";
import OrderBook from "./OrderBook";
import MarketDepth from "./MarketDepth";
import RecentTrades from "./RecentTrades";
import MarketStats from "./MarketStats";
import PortfolioPerformance from "./PortfolioPerformance";
import AIAssistant from "./AIAssistant";

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

function AssetIcon({ symbol }: { symbol: string }) {
  const base = symbol.split("/")[0];
  const marks: Record<string, string> = {
    BTC: "₿",
    ETH: "◆",
    BNB: "◆",
    SOL: "≋",
    XRP: "✕",
    DOGE: "Ð",
    ADA: "●",
    LTC: "Ł",
    XAU: "▰",
    EUR: "€",
  };
  const isYenPair = symbol === "USD/JPY";
  const mark = isYenPair ? "🇺🇸🇯🇵" : marks[base] || base.slice(0, 1);
  return (
    <span
      className={`coin asset-coin asset-${isYenPair ? "usd-jpy" : base.toLowerCase()}`}
      aria-hidden="true"
    >
      {mark}
    </span>
  );
}

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

function calculateTotalRealizedPL(orders: Order[]) {
  const lots = new Map<string, Array<{ qty: number; price: number }>>();
  let profit = 0;
  let matchedCost = 0;
  const filledOrders = orders.filter((order) => order.status === "filled" && Number(order.filled_price) > 0).slice()
    .sort((a, b) => new Date(a.filled_at || a.created_at).getTime() - new Date(b.filled_at || b.created_at).getTime());
  for (const order of filledOrders) {
    const queue = lots.get(order.symbol) || [];
    const price = Number(order.filled_price);
    if (order.side === "buy") queue.push({ qty: Number(order.qty), price });
    else if (order.side === "sell") {
      let remaining = Number(order.qty);
      while (remaining > 0 && queue.length) {
        const lot = queue[0];
        const used = Math.min(remaining, lot.qty);
        profit += used * (price - lot.price);
        matchedCost += used * lot.price;
        remaining -= used;
        lot.qty -= used;
        if (lot.qty <= 0.000000001) queue.shift();
      }
    }
    lots.set(order.symbol, queue);
  }
  return { profit, matchedCost };
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


function InternalPaperOrderBook({ symbol }: { symbol: string }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("0.01");
  const [book, setBook] = useState<{ bids: any[]; asks: any[]; trades: any[] }>({ bids: [], asks: [], trades: [] });
  const [orders, setOrders] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = async () => {
    const [{ data: bookData, error: bookError }, { data: orderData, error: orderError }] = await Promise.all([
      supabase.rpc("get_internal_order_book", { p_symbol: symbol }),
      supabase.from("internal_orders").select("id,side,price,quantity,remaining_quantity,status,created_at").eq("symbol", symbol).in("status", ["open", "partially_filled"]).order("created_at", { ascending: true }).limit(100),
    ]);
    if (bookError) setMessage("Shared order book unavailable. Apply the public-book SQL migration.");
    else { setBook({ bids: bookData?.bids || [], asks: bookData?.asks || [], trades: bookData?.trades || [] }); setMessage(""); }
    if (!orderError) setOrders(orderData || []);
  };
  useEffect(() => {
    void refresh();
    const channel = supabase.channel("internal-book-" + symbol)
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_orders" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_trades" }, () => void refresh())
      .subscribe();
    // RLS intentionally hides other users' raw order rows, so poll the
    // privacy-preserving aggregate RPC for shared-book updates.
    const poll = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearInterval(poll); void supabase.removeChannel(channel); };
  }, [symbol]);
  const submit = async () => {
    const p = Number(price), q = Number(quantity);
    if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) {
      setMessage("Enter a valid limit price and quantity."); return;
    }
    setBusy(true); setMessage("");
    const { data, error } = await supabase.rpc("place_internal_limit_order", {
      p_symbol: symbol, p_side: side, p_price: p, p_quantity: q,
    });
    if (error) setMessage(error.message);
    else setMessage("Paper order accepted: " + data.status.replace("_", " ") + (Number(data.remaining_quantity) > 0 ? " · remaining " + data.remaining_quantity : ""));
    await refresh(); setBusy(false);
  };
  const cancel = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("cancel_internal_order", { p_order_id: id });
    setMessage(error ? error.message : "Paper order cancelled and reserved funds released.");
    await refresh(); setBusy(false);
  };
  return <section className="panel internal-paper-panel">
    <div className="internal-paper-heading"><div><h2>SunStrade Paper Order Book</h2><small>Shared internal simulated market · {symbol}</small></div><span className="internal-paper-badge">PAPER</span></div>
    <div className="internal-paper-side">
      <button type="button" onClick={() => setSide("buy")} className={side === "buy" ? "active buy" : "buy"}>Buy limit</button>
      <button type="button" onClick={() => setSide("sell")} className={side === "sell" ? "active sell" : "sell"}>Sell limit</button>
    </div>
    <div className="internal-paper-fields">
      <label>Limit price (USD)<input type="number" min="0.00000001" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="Enter limit price" /></label>
      <label>Quantity<input type="number" min="0.00000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
    </div>
    <button type="button" disabled={busy} onClick={() => void submit()} className={side === "buy" ? "internal-paper-submit buy" : "internal-paper-submit sell"}>{busy ? "Processing..." : "Place paper limit order"}</button>
    {message && <p role="status" className="internal-paper-message">{message}</p>}
    <div className="internal-paper-books">
      <div><h3 className="internal-bid-title">Bids <span>Buy</span></h3><table><thead><tr><th>Price</th><th>Quantity</th></tr></thead><tbody>{book.bids.slice(0,8).map((o,i)=><tr key={i} className="internal-book-level internal-book-bid" role="button" tabIndex={0} aria-label={`Select bid price ${o.price}`} onClick={() => { setPrice(String(o.price)); setSide("sell"); setMessage("Bid price selected. Review quantity, then place your sell limit order."); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrice(String(o.price)); setSide("sell"); setMessage("Bid price selected. Review quantity, then place your sell limit order."); } }}><td>{formatPrice(Number(o.price))}</td><td>{o.quantity}</td></tr>)}</tbody></table>{book.bids.length===0&&<p className="internal-paper-empty">No bids</p>}</div>
      <div><h3 className="internal-ask-title">Asks <span>Sell</span></h3><table><thead><tr><th>Price</th><th>Quantity</th></tr></thead><tbody>{book.asks.slice(0,8).map((o,i)=><tr key={i} className="internal-book-level internal-book-ask" role="button" tabIndex={0} aria-label={`Select ask price ${o.price}`} onClick={() => { setPrice(String(o.price)); setSide("buy"); setMessage("Ask price selected. Review quantity, then place your buy limit order."); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrice(String(o.price)); setSide("buy"); setMessage("Ask price selected. Review quantity, then place your buy limit order."); } }}><td>{formatPrice(Number(o.price))}</td><td>{o.quantity}</td></tr>)}</tbody></table>{book.asks.length===0&&<p className="internal-paper-empty">No asks</p>}</div>
    </div>
    <h3 className="internal-paper-subheading">Your open orders</h3>
    {orders.length === 0 ? <p className="internal-paper-empty">You have no open orders for {symbol}.</p> : <div className="internal-paper-table-wrap"><table><thead><tr><th>Side</th><th>Limit</th><th>Remaining</th><th>Action</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><span className={o.side === "buy" ? "internal-side-buy" : "internal-side-sell"}>{o.side}</span></td><td>{formatPrice(Number(o.price))}</td><td>{o.remaining_quantity}</td><td><button type="button" disabled={busy} onClick={() => void cancel(o.id)} className="internal-cancel">Cancel</button></td></tr>)}</tbody></table></div>}
    <h3 className="internal-paper-subheading">Recent internal trades</h3>
    {book.trades.length === 0 ? <p className="internal-paper-empty">No internal trades yet.</p> : <div className="internal-paper-trades">{book.trades.slice(0,8).map((t,i)=><div key={i}><span>{formatPrice(Number(t.price))}</span><span>{t.quantity}</span><span>{new Date(t.created_at).toLocaleTimeString()}</span></div>)}</div>}
    <p className="internal-paper-footnote">The shared book aggregates open orders from all users without exposing account IDs. It is separate from external exchange liquidity.</p>
  </section>;
}
export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [walletBalance, setWalletBalance] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [assets, setAssets] = useState<Asset[]>(fallbackAssets);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState<string | null>(null);
  const [priceAlerts, setPriceAlerts] = useState<any[]>([]);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertCondition, setAlertCondition] = useState<"above" | "below">("above");
  const [alertBusy, setAlertBusy] = useState(false);
  const [priceStatus, setPriceStatus] = useState("Connecting...");
  const [selectedSymbol, setSelectedSymbol] = useState("BTC/USD");
  const [portfolioView, setPortfolioView] = useState<"portfolio" | "history" | "orders">("portfolio");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit" | "stop">("market");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [lotAmount, setLotAmount] = useState("0.01");

  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [toast, setToast] = useState("");
  const [notifications, setNotifications] = useState<Array<{ id: string; message: string; createdAt: string; read: boolean }>>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const knownOrderStatuses = useRef<Map<string, string>>(new Map());
  const knownWalletStatuses = useRef<Map<string, string>>(new Map());

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

  useEffect(() => {
    if (!user) return;
    let initialized = false;

    const loadWalletTransactions = async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id,type,amount,status,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("Wallet notification error:", error);
        return;
      }
      for (const transaction of data || []) {
        const key = String(transaction.id);
        const previousStatus = knownWalletStatuses.current.get(key);
        if (initialized && previousStatus === undefined) {
          const label = transaction.type === "deposit" ? "Deposit" : "Withdrawal";
          const message = label + " request for " + formatMoney(Number(transaction.amount)) + " was submitted."; 
          setNotifications((current) => [{ id: "wallet-" + key + "-submitted", message, createdAt: transaction.created_at || new Date().toISOString(), read: false }, ...current].slice(0, 20));
          showToast(message);
        } else if (initialized && previousStatus && previousStatus !== transaction.status) {
          const label = transaction.type === "deposit" ? "Deposit" : "Withdrawal";
          const message = label + " request for " + formatMoney(Number(transaction.amount)) + " was " + transaction.status + ".";
          setNotifications((current) => [{ id: "wallet-" + key + "-" + transaction.status, message, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 20));
          showToast(message);
        }
        knownWalletStatuses.current.set(key, transaction.status);
      }
      initialized = true;
    };

    void loadWalletTransactions();
    const channel = supabase
      .channel("wallet-notifications-" + user.id)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "wallet_transactions",
        filter: "user_id=eq." + user.id,
      }, () => { void loadWalletTransactions(); })
      .subscribe();

    return () => {
      initialized = false;
      supabase.removeChannel(channel);
    };
  }, [user]);
  async function loadDashboardData(userId: string) {
    const { data: savedWatchlist, error: watchlistError } = await supabase.from("user_watchlist").select("symbol").eq("user_id", userId);
    if (watchlistError) console.error("Watchlist error:", watchlistError);
    else setWatchlistSymbols((savedWatchlist || []).map((item: { symbol: string }) => item.symbol));
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
      const latestOrders = (ordersResult.data || []) as Order[];
      for (const order of latestOrders) {
        const previousStatus = knownOrderStatuses.current.get(String(order.id));
        if (previousStatus === "pending" && (order.status === "filled" || order.status === "rejected")) {
          const resultText = order.status === "filled" ? "was filled" : "was rejected";
          const message = `${order.symbol} ${order.side} ${order.order_type} order ${resultText}${order.filled_price ? ` at ${formatPrice(Number(order.filled_price))}` : ""}.`;
          setNotifications((current) => [{ id: `${order.id}-${order.status}`, message, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 20));
          showToast(message);
        }
        knownOrderStatuses.current.set(String(order.id), order.status);
      }
      setOrders(latestOrders);
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
  async function loadPriceAlerts(userId: string) {
    const { data, error } = await supabase.from("price_alerts").select("id,symbol,target_price,condition,is_active,is_triggered,created_at").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) { console.error("Price alerts error:", error); return; }
    setPriceAlerts(data || []);
  }

  async function createPriceAlert() {
    const target = Number(alertTarget);
    if (!user || !Number.isFinite(target) || target <= 0) { showToast("Enter a valid target price."); return; }
    setAlertBusy(true);
    const { error } = await supabase.from("price_alerts").insert({ user_id: user.id, symbol: selectedSymbol, target_price: target, condition: alertCondition });
    if (error) showToast("Could not create alert: " + error.message);
    else { setAlertTarget(""); showToast("Price alert created."); await loadPriceAlerts(user.id); }
    setAlertBusy(false);
  }

  async function deletePriceAlert(id: string) {
    if (!user) return;
    const { error } = await supabase.from("price_alerts").delete().eq("id", id).eq("user_id", user.id);
    if (error) showToast("Could not delete alert: " + error.message);
    else setPriceAlerts((current) => current.filter((alert) => alert.id !== id));
  }

  async function checkPriceAlerts() {
    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const active = priceAlerts.filter((alert) => alert.is_active && !alert.is_triggered);
    for (const alert of active) {
      const asset = assets.find((item) => item.symbol === alert.symbol);
      if (!asset || !Number.isFinite(asset.price) || asset.price <= 0) continue;
      const hit = alert.condition === "above" ? asset.price >= Number(alert.target_price) : asset.price <= Number(alert.target_price);
      if (!hit) continue;
      try {
        const response = await fetch("/api/price-alerts/check", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ alertId: alert.id }),
        });
        const result = await response.json();
        if (!response.ok) {
          console.error("Price alert check failed:", result.error);
          continue;
        }
        if (result.triggered) {
          setNotifications((current) => [{ id: "price-alert-" + alert.id, message: result.message, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 20));
          showToast(result.message);
          await loadPriceAlerts(user.id);
        }
      } catch (error) {
        console.error("Price alert check failed:", error);
      }
    }
  }

  useEffect(() => { if (user) void loadPriceAlerts(user.id); }, [user]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadSavedPriceNotifications = async () => {
      const { data, error } = await supabase.from("price_alert_notifications")
        .select("id,message,created_at,read_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
      if (error) { console.error("Saved price notifications error:", error); return; }
      if (cancelled) return;
      const saved = (data || []).map((item: any) => ({
        id: "saved-price-alert-" + item.id,
        message: item.message,
        createdAt: item.created_at,
        read: Boolean(item.read_at),
      }));
      setNotifications((current) => {
        const other = current.filter((item) => !item.id.startsWith("saved-price-alert-"));
        return [...saved, ...other].slice(0, 20);
      });
    };
    void loadSavedPriceNotifications();
    const channel = supabase.channel("price-alert-notifications-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "price_alert_notifications", filter: "user_id=eq." + user.id }, () => { void loadSavedPriceNotifications(); })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);


  useEffect(() => { if (user) void checkPriceAlerts(); }, [user, assets, priceAlerts]);

  async function toggleWatchlist(symbol: string) {
    if (!user || watchlistBusy) return;
    setWatchlistBusy(symbol);
    const isSaved = watchlistSymbols.includes(symbol);
    if (isSaved) {
      const { error } = await supabase.from("user_watchlist").delete().eq("user_id", user.id).eq("symbol", symbol);
      if (error) showToast("Could not remove from watchlist: " + error.message);
      else setWatchlistSymbols((current) => current.filter((item) => item !== symbol));
    } else {
      const { error } = await supabase.from("user_watchlist").insert({ user_id: user.id, symbol });
      if (error) showToast("Could not save to watchlist: " + error.message);
      else setWatchlistSymbols((current) => [...current, symbol]);
    }
    setWatchlistBusy(null);
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

    const price = Number(triggerPrice);
    if (orderType !== "market" && (!Number.isFinite(price) || price <= 0)) {
      showToast("Enter a valid trigger price.");
      return;
    }

    setPlacingOrder(true);

    const { error } = await supabase.rpc("place_order", {
      p_symbol: selectedSymbol,
      p_side: side,
      p_order_type: orderType,
      p_qty: qty,
      p_limit_price: orderType === "market" ? null : price,
    });

    if (error) {
      console.error(error);
      showToast(error.message);
      setPlacingOrder(false);
      return;
    }

    const orderMessage = orderType === "market"
      ? (side === "buy" ? "Buy" : "Sell") + " market order for " + lotAmount + " " + selectedSymbol + " was filled successfully."
      : (side === "buy" ? "Buy" : "Sell") + " " + orderType + " order for " + lotAmount + " " + selectedSymbol + " was submitted and is pending."; 
    setNotifications((current) => [{ id: "order-created-" + Date.now(), message: orderMessage, createdAt: new Date().toISOString(), read: false }, ...current].slice(0, 20));
    showToast(
      orderType === "market"
        ? `${side === "buy" ? "Buy" : "Sell"} market order filled successfully.`
        : `${side === "buy" ? "Buy" : "Sell"} ${orderType} order saved as pending.`
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
        <div className="loading-market-art" aria-hidden="true">
          <div className="loading-chart-grid" />
          <svg className="loading-chart-line" viewBox="0 0 900 300" preserveAspectRatio="none">
            <path d="M0 230 C55 205 70 170 115 192 S165 225 210 188 S265 220 310 165 S370 140 410 175 S470 240 520 185 S590 160 635 105 S690 80 730 135 S790 175 835 80 S875 65 900 20" />
          </svg>
          <div className="loading-candles">{[24,38,30,54,43,67,48,76,61,89,73,100,84,116,95,132,109,151].map((h,i)=><i key={i} style={{height: h+"px",left:(i*5.7)+"%"}} />)}</div>
        </div>
        <div className="loading-card">
          <div className="loading-logo">S</div>
          <h1>Sunraku <span>Trade</span></h1>
          <p className="loading-tagline">Your markets, positions and wallet in one place</p>
          <div className="loading-progress" role="progressbar" aria-label="Loading dashboard"><span /></div>
          <p className="loading-status"><span className="loading-shield">✓</span> Connecting securely...</p>
        </div>
        <div className="loading-features" aria-hidden="true">
          <div><span className="loading-feature-icon">▥</span><span>Live markets</span></div>
          <div><span className="loading-feature-icon">▣</span><span>Portfolio</span></div>
          <div><span className="loading-feature-icon">♢</span><span>Secure account</span></div>
        </div>
        <div className="loading-data-wave" aria-hidden="true" />
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

          <div style={{ position: "relative" }}>
            <button
              className="icon-btn notification"
              type="button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              ♧
              {notifications.filter((item) => !item.read).length > 0 && (
                <span>{notifications.filter((item) => !item.read).length}</span>
              )}
            </button>
            {notificationsOpen && (
              <div
                role="dialog"
                aria-label="Notifications"
                style={{
                  position: "absolute",
                  top: "calc(100% + 12px)",
                  right: 0,
                  width: "min(340px, calc(100vw - 32px))",
                  maxHeight: 360,
                  overflowY: "auto",
                  zIndex: 100,
                  padding: 14,
                  border: "1px solid var(--border, #293342)",
                  borderRadius: 12,
                  background: "var(--panel, #141b24)",
                  boxShadow: "0 12px 32px rgba(0,0,0,.35)",
                  color: "var(--text, #e5e7eb)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <strong>Notifications</strong>
                  <button
                    type="button"
                    onClick={() => setNotifications((items) => items.map((item) => ({ ...item, read: true })))}
                    style={{ background: "transparent", border: 0, color: "var(--muted, #94a3b8)", cursor: "pointer", fontSize: 12 }}
                  >
                    Mark all read
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--muted, #94a3b8)", fontSize: 13 }}>Trade and wallet updates will appear here while the dashboard is open.</p>
                ) : (
                  notifications.map((item) => (
                    <div key={item.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border, #293342)", opacity: item.read ? 0.7 : 1 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 13 }}>{item.message}</p>
                      <small style={{ color: "var(--muted, #94a3b8)" }}>{new Date(item.createdAt).toLocaleString()}</small>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

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
          <section className="sun-home-mobile" aria-label="SunStrade home">
            <div className="sun-home-greeting">
              <div>
                <span className="sun-home-kicker">YOUR TRADING SPACE</span>
                <h1>Welcome, {getDisplayName().split(" ")[0]} <span aria-hidden="true">✦</span></h1>
                <p>Markets move. Stay in control.</p>
              </div>
              <a href="/profile" className="sun-home-avatar" aria-label="Open profile">{getInitial()}</a>
            </div>

            <section className="sun-home-balance">
              <div className="sun-home-balance-top">
                <span>Total balance <i aria-hidden="true">◉</i></span>
                <a href="/wallet">Wallet ↗</a>
              </div>
              <strong>{formatMoney(walletBalance)}</strong>
              <div className="sun-home-balance-foot">
                <span><small>Equity</small><b>{formatMoney(equity)}</b></span>
                <span className={todayPL.profit >= 0 ? "positive" : "negative"}><small>Today's P/L</small><b>{todayPL.profit >= 0 ? "+" : ""}{formatMoney(todayPL.profit)}</b></span>
              </div>
              <div className="sun-home-actions">
                <a href="#orderPanel" className="sun-home-primary"><span aria-hidden="true">↗</span> Trade</a>
                <a href="/wallet" className="sun-home-secondary"><span aria-hidden="true">＋</span> Deposit</a>
              </div>
            </section>

            <div className="sun-home-shortcuts" aria-label="Quick actions">
              <a href="#watchlist"><span className="sun-shortcut-icon violet">☆</span><b>Watchlist</b></a>
              <a href="#priceAlerts"><span className="sun-shortcut-icon amber">♧</span><b>Price alerts</b></a>
              <a href="#positions"><span className="sun-shortcut-icon blue">▤</span><b>Portfolio</b></a>
              <a href="/wallet"><span className="sun-shortcut-icon green">▣</span><b>Wallet</b></a>
            </div>

            <section className="sun-home-section">
              <div className="sun-home-section-heading"><div><span>LIVE MARKET</span><h2>Market movers</h2></div><a href="#watchlist">View all <span aria-hidden="true">→</span></a></div>
              <div className="sun-home-movers">
                {assets.slice(0, 4).map((asset) => {
                  const change = assetPercentChange(asset);
                  return <button type="button" key={asset.symbol} onClick={() => setSelectedSymbol(asset.symbol)} className="sun-home-mover">
                    <AssetIcon symbol={asset.symbol} />
                    <span className="sun-home-mover-name"><b>{asset.symbol}</b><small>{asset.name}</small></span>
                    <span className="sun-home-mover-price"><b>{formatPrice(asset.price)}</b><small className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</small></span>
                  </button>;
                })}
              </div>
            </section>

            <section className="sun-home-portfolio">
              <div className="sun-home-section-heading"><div><span>YOUR ASSETS</span><h2>Portfolio</h2></div><a href="#positions">Details <span aria-hidden="true">→</span></a></div>
              <div className="sun-home-portfolio-value"><span>Open positions value</span><strong>{formatMoney(positions.reduce((total, position) => total + position.qty * (assets.find((asset) => asset.symbol === position.symbol)?.price || position.avg_price), 0))}</strong></div>
              <div className="sun-home-portfolio-bottom"><span>{positions.length} open {positions.length === 1 ? "position" : "positions"}</span><span className={openPL >= 0 ? "positive" : "negative"}>{openPL >= 0 ? "+" : ""}{formatMoney(openPL)} unrealized</span></div>
            </section>
          </section>

          <section className="dashboard-welcome" aria-label="Dashboard overview">
            <div>
              <span className="eyebrow">TRADING OVERVIEW</span>
              <h1>Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h1>
              <p>Track your balance, monitor markets, and manage your trading activity.</p>
            </div>
            <div className="welcome-actions">
              <a href="#orderPanel">Start trading <span aria-hidden="true">↗</span></a>
              <a href="#positions">View portfolio <span aria-hidden="true">→</span></a>
            </div>
          </section>

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
                  <AssetIcon symbol={asset.symbol} />

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
                  <AssetIcon symbol={selectedAsset.symbol} />

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

              <OrderBook symbol={selectedSymbol} />
              <MarketDepth symbol={selectedSymbol} />
              <div className="market-detail-grid">
                <RecentTrades symbol={selectedSymbol} />
                <MarketStats symbol={selectedSymbol} />
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

                <div className="tabs watchlist-tabs">
                  <button className={!watchlistOnly ? "active" : ""} type="button" onClick={() => setWatchlistOnly(false)}>Markets</button>
                  <button className={watchlistOnly ? "active" : ""} type="button" onClick={() => setWatchlistOnly(true)}>Watchlist <span>{watchlistSymbols.length}</span></button>
                </div>

                {(watchlistOnly ? assets.filter((asset) => watchlistSymbols.includes(asset.symbol)) : assets).map((asset) => {
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
                      <AssetIcon symbol={asset.symbol} />
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
                      <span className="watch-star" role="button" tabIndex={0} aria-label={watchlistSymbols.includes(asset.symbol) ? "Remove from watchlist" : "Add to watchlist"} title={watchlistSymbols.includes(asset.symbol) ? "Remove from watchlist" : "Add to watchlist"} onClick={(event) => { event.stopPropagation(); void toggleWatchlist(asset.symbol); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); void toggleWatchlist(asset.symbol); } }}>{watchlistBusy === asset.symbol ? "…" : watchlistSymbols.includes(asset.symbol) ? "★" : "☆"}</span>
                    </button>
                  );
                })}
              </section>

              <section className="panel price-alert-panel" id="priceAlerts">
                <div className="panel-title"><h2>Price Alerts</h2><small>{priceAlerts.filter((alert) => alert.is_active && !alert.is_triggered).length} active</small></div>
                <p className="alert-current">Current {selectedSymbol}: <strong>{formatPrice(selectedPrice)}</strong></p>
                <label className="alert-label">Target price (USD)
                  <input type="number" min="0.00000001" step="any" value={alertTarget} onChange={(event) => setAlertTarget(event.target.value)} placeholder="Enter target price" />
                </label>
                <div className="alert-condition" aria-label="Alert condition">
                  <button type="button" className={alertCondition === "above" ? "active" : ""} onClick={() => setAlertCondition("above")}>At or above</button>
                  <button type="button" className={alertCondition === "below" ? "active" : ""} onClick={() => setAlertCondition("below")}>At or below</button>
                </div>
                <button className="create-alert-btn" type="button" disabled={alertBusy} onClick={() => void createPriceAlert()}>{alertBusy ? "Saving..." : "Create price alert"}</button>
                <div className="alert-list">
                  {priceAlerts.length === 0 ? <p className="empty-state">No price alerts yet. Create one to get started.</p> : priceAlerts.map((alert) => (
                    <div className="alert-row" key={alert.id}>
                      <div><strong>{alert.symbol}</strong><small>{alert.condition === "above" ? "At or above" : "At or below"} {formatPrice(Number(alert.target_price))}</small><span className={alert.is_triggered ? "alert-triggered" : alert.is_active ? "alert-active" : "alert-inactive"}>{alert.is_triggered ? "Triggered" : alert.is_active ? "Active" : "Inactive"}</span></div>
                      <button type="button" aria-label={"Delete alert for " + alert.symbol} onClick={() => void deletePriceAlert(alert.id)}>×</button>
                    </div>
                  ))}
                </div>
              </section>

              <section
                className="panel order-panel"
                id="orderPanel"
              >
                <div className="order-symbol">
                  <AssetIcon symbol={selectedSymbol} />

                  <div>
                    <strong>{selectedSymbol}</strong>
                    <small>{orderType.charAt(0).toUpperCase() + orderType.slice(1)} order</small>
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

                <div className="order-types" aria-label="Order type">
                  {(["market", "limit", "stop"] as const).map((type) => (
                    <button
                      key={type}
                      className={orderType === type ? "active" : ""}
                      type="button"
                      aria-pressed={orderType === type}
                      onClick={() => setOrderType(type)}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
                {orderType !== "market" && (
                  <label>
                    {orderType === "limit" ? "Limit price" : "Stop trigger price"} (USD)
                    <input
                      type="number"
                      min="0.00000001"
                      step="any"
                      value={triggerPrice}
                      onChange={(event) => setTriggerPrice(event.target.value)}
                      placeholder={formatPrice(selectedPrice)}
                    />
                    <small className="order-help">
                      {orderType === "limit"
                        ? side === "buy" ? "Triggers when market price is at or below this price." : "Triggers when market price is at or above this price."
                        : side === "buy" ? "Triggers when market price reaches or exceeds this price." : "Triggers when market price reaches or falls below this price."}
                    </small>
                  </label>
                )}

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
                    : orderType === "market"
                      ? `${side === "buy" ? "Buy" : "Sell"} ${selectedSymbol}`
                      : `Place ${orderType} ${side} order`}
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
              <InternalPaperOrderBook symbol={selectedSymbol} />
              <PortfolioPerformance orders={orders} positions={positions} assets={assets} />
            </aside>
          </div>

          <section className="panel positions-panel portfolio-panel" id="positions">
            <div className="section-tabs portfolio-tabs">
              <button type="button" className={portfolioView === "portfolio" ? "active" : ""} onClick={() => setPortfolioView("portfolio")}>Portfolio <b>{positions.length}</b></button>
              <button type="button" id="history" className={portfolioView === "history" ? "active" : ""} onClick={() => setPortfolioView("history")}>Trade History <b>{orders.filter((order) => order.status === "filled").length}</b></button>
              <button type="button" className={portfolioView === "orders" ? "active" : ""} onClick={() => setPortfolioView("orders")}>All Orders <b>{orders.length}</b></button>
            </div>

            {portfolioView === "portfolio" && (
              <>
                <div className="portfolio-summary">
                  <article><span>Portfolio value</span><strong>{formatMoney(positions.reduce((total, position) => total + position.qty * (assets.find((asset) => asset.symbol === position.symbol)?.price || position.avg_price), 0))}</strong><small>Current market value</small></article>
                  <article><span>Cost basis</span><strong>{formatMoney(investedValue)}</strong><small>Open positions</small></article>
                  <article><span>Unrealized P/L</span><strong className={openPL >= 0 ? "positive" : "negative"}>{openPL >= 0 ? "+" : ""}{formatMoney(openPL)}</strong><small>Open positions only</small></article>
                  <article><span>Realized P/L</span><strong className={calculateTotalRealizedPL(orders).profit >= 0 ? "positive" : "negative"}>{calculateTotalRealizedPL(orders).profit >= 0 ? "+" : ""}{formatMoney(calculateTotalRealizedPL(orders).profit)}</strong><small>Matched filled sells (FIFO)</small></article>
                </div>
                <div className="table-wrap">
                  {positions.length === 0 ? <div className="empty-state">You don't have any open positions.</div> : (
                    <table>
                      <thead><tr><th>Asset</th><th>Quantity</th><th>Average entry</th><th>Market price</th><th>Market value</th><th>Unrealized P/L</th><th>Return</th></tr></thead>
                      <tbody>{positions.map((position) => {
                        const currentPrice = assets.find((asset) => asset.symbol === position.symbol)?.price || position.avg_price;
                        const value = position.qty * currentPrice;
                        const cost = position.qty * position.avg_price;
                        const pnl = value - cost;
                        const returnPct = cost > 0 ? pnl / cost * 100 : 0;
                        return <tr key={position.symbol}><td><AssetIcon symbol={position.symbol} /> {position.symbol}</td><td>{position.qty}</td><td>{formatPrice(position.avg_price)}</td><td>{formatPrice(currentPrice)}</td><td>{formatMoney(value)}</td><td className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{formatMoney(pnl)}</td><td className={returnPct >= 0 ? "positive" : "negative"}>{returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%</td></tr>;
                      })}</tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {portfolioView === "history" && (
              <div className="table-wrap">
                {orders.filter((order) => order.status === "filled").length === 0 ? <div className="empty-state">Completed trades will appear here after an order is filled.</div> : (
                  <table>
                    <thead><tr><th>Trade ID</th><th>Asset</th><th>Side</th><th>Order type</th><th>Quantity</th><th>Execution price</th><th>Trade value</th><th>Executed at</th></tr></thead>
                    <tbody>{orders.filter((order) => order.status === "filled").map((order) => (
                      <tr key={order.id}><td>#{order.id}</td><td>{order.symbol}</td><td><span className={order.side === "buy" ? "tag buy-tag" : "tag sell-tag"}>{order.side}</span></td><td>{order.order_type}</td><td>{order.qty}</td><td>{order.filled_price ? formatPrice(Number(order.filled_price)) : "—"}</td><td>{order.filled_price ? formatMoney(Number(order.filled_price) * Number(order.qty)) : "—"}</td><td>{new Date(order.filled_at || order.created_at).toLocaleString()}</td></tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            )}

            {portfolioView === "orders" && (
              <div className="table-wrap">
                {orders.length === 0 ? <div className="empty-state">No orders have been placed yet.</div> : (
                  <table>
                    <thead><tr><th>Order ID</th><th>Asset</th><th>Side</th><th>Type</th><th>Quantity</th><th>Status</th><th>Trigger price</th><th>Fill price</th><th>Created</th></tr></thead>
                    <tbody>{orders.map((order) => (
                      <tr key={order.id}><td>#{order.id}</td><td>{order.symbol}</td><td><span className={order.side === "buy" ? "tag buy-tag" : "tag sell-tag"}>{order.side}</span></td><td>{order.order_type}</td><td>{order.qty}</td><td><span className="tag order-status-tag">{order.status}</span></td><td>{order.limit_price ? formatPrice(Number(order.limit_price)) : "—"}</td><td>{order.filled_price ? formatPrice(Number(order.filled_price)) : "—"}</td><td>{new Date(order.created_at).toLocaleString()}</td></tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            )}
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

      <AIAssistant />
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
