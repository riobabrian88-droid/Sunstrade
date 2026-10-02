"use client";

import { useEffect, useState } from "react";
import "./wallet.css";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Transaction = {
  id: string;
  type: "deposit" | "withdrawal";
  amount: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export default function WalletPage() {
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const money = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);

  async function loadWallet(userId: string) {
    const [walletResult, transactionResult] = await Promise.all([
      supabase
        .from("wallets")
        .select("cash_balance")
        .eq("user_id", userId)
        .maybeSingle(),

      supabase
        .from("wallet_transactions")
        .select("id,type,amount,status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (walletResult.error) {
      setMessage(walletResult.error.message);
    } else {
      setBalance(Number(walletResult.data?.cash_balance || 0));
    }

    if (transactionResult.error) {
      setMessage(transactionResult.error.message);
    } else {
      setTransactions(transactionResult.data || []);
    }
  }

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

      setUser(session.user);
      await loadWallet(session.user.id);

      if (mounted) setLoading(false);
    }

    initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        window.location.href = "/login";
      } else {
        setUser(session.user);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("wallet-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadWallet(user.id)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadWallet(user.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid amount.");
      return;
    }

    if (type === "withdrawal" && value > balance) {
      setMessage("Your wallet balance is insufficient.");
      return;
    }

    if (!user) {
      setMessage("Please sign in again.");
      return;
    }

    setSubmitting(true);

    const { error } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: user.id,
        type,
        amount: value,
      });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Your request was submitted successfully.");
      setAmount("");
      await loadWallet(user.id);
    }

    setSubmitting(false);
  }

  const pendingCount = transactions.filter((t) => t.status === "pending").length;
  const approvedCount = transactions.filter((t) => t.status === "approved").length;
  const recentTransactions = transactions.slice(0, 6);

  if (loading) {
    return <main className="sun-wallet-page"><div className="sun-wallet-container"><div className="sun-wallet-loading">Loading your wallet...</div></div></main>;
  }

  return (
    <main className="sun-wallet-page">
      <div className="sun-wallet-container">
        <header className="sun-wallet-header">
          <div className="sun-wallet-brand"><span className="sun-wallet-mark">S</span><div><strong>SunStrade</strong><small>WALLET CENTER</small></div></div>
          <a href="/dashboard" className="sun-wallet-back">← Dashboard</a>
        </header>

        <div className="sun-wallet-title-row">
          <div><p className="sun-wallet-kicker">ACCOUNT OVERVIEW</p><h1>Wallet Overview</h1><p className="sun-wallet-subtitle">Your funds at a glance</p></div>
          <span className="sun-wallet-demo-badge">PAPER / DEMO</span>
        </div>

        <section className="sun-wallet-overview">
          <div className="sun-wallet-balance-card">
            <div className="sun-wallet-balance-top"><span>Total wallet balance</span><span className="sun-wallet-live-dot">Account balance</span></div>
            <strong>{money(balance)}</strong>
            <small>USD · Available wallet funds</small>
            <div className="sun-wallet-balance-graphic" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/><span/><span/></div>
            <p>Balance updates when an administrator approves a request.</p>
          </div>
          <div className="sun-wallet-stat-stack">
            <article className="sun-wallet-stat-card"><span>Available balance</span><strong>{money(balance)}</strong><small>Current wallet balance</small></article>
            <article className="sun-wallet-stat-card"><span>Pending requests</span><strong>{pendingCount}</strong><small>Awaiting administrator review</small></article>
            <article className="sun-wallet-stat-card"><span>Approved requests</span><strong>{approvedCount}</strong><small>In your transaction history</small></article>
          </div>
        </section>

        <section className="sun-wallet-action-card">
          <div className="sun-wallet-section-heading"><div><h2>Wallet actions</h2><p>Request a deposit or withdrawal</p></div><span className="sun-wallet-lock">⌑ Secure request</span></div>
          <div className="sun-wallet-tabs" role="tablist" aria-label="Wallet action">
            <button type="button" role="tab" aria-selected={type === "deposit"} className={type === "deposit" ? "active" : ""} onClick={() => { setType("deposit"); setMessage(""); }}>＋ Deposit</button>
            <button type="button" role="tab" aria-selected={type === "withdrawal"} className={type === "withdrawal" ? "active" : ""} onClick={() => { setType("withdrawal"); setMessage(""); }}>↗ Withdraw</button>
          </div>
          <form className="sun-wallet-request-form" onSubmit={submitRequest}>
            <label htmlFor="wallet-amount">Amount <span>(USD)</span></label>
            <div className="sun-wallet-amount-wrap"><span>$</span><input id="wallet-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required /></div>
            <p className="sun-wallet-hint">{type === "deposit" ? "Submit a deposit request for administrator review." : "Submit a withdrawal request. The requested amount cannot exceed your current wallet balance."}</p>
            {message && <p className={message.includes("successfully") ? "sun-wallet-message success" : "sun-wallet-message"} role="status">{message}</p>}
            <button className="sun-wallet-submit" type="submit" disabled={submitting}>{submitting ? "Submitting request..." : type === "deposit" ? "Request deposit →" : "Request withdrawal →"}</button>
          </form>
          <p className="sun-wallet-demo-note">Demo mode: no real money is transferred. Requests are reviewed by an administrator.</p>
        </section>

        <section className="sun-wallet-transactions">
          <div className="sun-wallet-section-heading"><div><h2>Recent transactions</h2><p>Your latest wallet requests and their status</p></div><span className="sun-wallet-count">{transactions.length} total</span></div>
          {recentTransactions.length === 0 ? <div className="sun-wallet-empty"><span>↗</span><strong>No transactions yet</strong><p>Your deposit and withdrawal requests will appear here.</p></div> : (
            <div className="sun-wallet-table-wrap"><table className="sun-wallet-table"><thead><tr><th>Type</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
              {recentTransactions.map((transaction) => <tr key={transaction.id}><td><span className={`sun-wallet-tx-icon ${transaction.type}`}>{transaction.type === "deposit" ? "↓" : "↑"}</span><span className="sun-wallet-tx-type">{transaction.type}</span></td><td className="sun-wallet-tx-amount">{money(Number(transaction.amount))}</td><td><span className={`sun-wallet-status ${transaction.status}`}>{transaction.status}</span></td><td className="sun-wallet-date">{new Date(transaction.created_at).toLocaleString()}</td></tr>)}
            </tbody></table></div>
          )}
        </section>
        <footer className="sun-wallet-footer"><span>SunStrade Wallet</span><span>Demo wallet · No real funds transferred</span></footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0d1117",
    color: "#e7edf2",
    padding: "24px 14px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "850px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "24px",
  },
  title: {
    fontSize: "22px",
    margin: 0,
    color: "#39b982",
  },
  subtitle: {
    color: "#8b98a5",
    margin: "6px 0 0",
  },
  back: {
    color: "#39b982",
    textDecoration: "none",
    border: "1px solid #2a3440",
    padding: "10px 13px",
    borderRadius: "7px",
  },
  balanceCard: {
    background: "#151b23",
    border: "1px solid #2a3440",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "18px",
  },
  label: {
    display: "block",
    color: "#8b98a5",
    fontSize: "13px",
    marginBottom: "10px",
  },
  balance: {
    fontSize: "32px",
    margin: "8px 0",
    color: "#39b982",
  },
  note: {
    color: "#8b98a5",
    fontSize: "12px",
    lineHeight: 1.6,
  },
  card: {
    background: "#151b23",
    border: "1px solid #2a3440",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "18px",
  },
  heading: {
    fontSize: "17px",
    margin: "0 0 18px",
  },
  tabs: {
    display: "flex",
    gap: "8px",
    marginBottom: "18px",
  },
  tab: {
    flex: 1,
    padding: "11px",
    border: "1px solid #2a3440",
    borderRadius: "7px",
    background: "#10151c",
    color: "#c5cfd6",
    cursor: "pointer",
  },
  activeTab: {
    background: "#18382e",
    borderColor: "#39b982",
    color: "#70d2a5",
  },
  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    marginTop: "8px",
    padding: "12px",
    background: "#0f151b",
    color: "#e7edf2",
    border: "1px solid #2a3440",
    borderRadius: "7px",
    fontSize: "16px",
  },
  submit: {
    width: "100%",
    padding: "13px",
    marginTop: "18px",
    background: "#23845f",
    color: "#fff",
    border: 0,
    borderRadius: "7px",
    fontWeight: 700,
    cursor: "pointer",
  },
  message: {
    color: "#70d2a5",
    fontSize: "13px",
    marginTop: "14px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
    fontSize: "12px",
  },
  th: {
    padding: "12px 8px",
    borderBottom: "1px solid #2a3440",
    color: "#8b98a5",
  },
  td: {
    padding: "12px 8px",
    borderBottom: "1px solid #232d36",
  },
  status: {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: "5px",
    textTransform: "capitalize",
  },
  approved: {
    background: "#18382e",
    color: "#70d2a5",
  },
  rejected: {
    background: "#3b2528",
    color: "#f08c8c",
  },
  pending: {
    background: "#3a3020",
    color: "#e6b75d",
  },
};
