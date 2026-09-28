"use client";

import { useEffect, useState } from "react";
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

  if (loading) {
    return (
      <main style={styles.page}>
        <p>Loading your wallet...</p>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Sunraku Trade</h1>
            <p style={styles.subtitle}>Your wallet</p>
          </div>
          <a href="/dashboard" style={styles.back}>
            ← Dashboard
          </a>
        </header>

        <section style={styles.balanceCard}>
          <p style={styles.label}>Available wallet balance</p>
          <h2 style={styles.balance}>{money(balance)}</h2>
          <p style={styles.note}>
            Your balance changes after an admin approves a request.
          </p>
        </section>

        <section style={styles.card}>
          <h2 style={styles.heading}>Deposit or withdraw</h2>

          <div style={styles.tabs}>
            <button
              type="button"
              onClick={() => setType("deposit")}
              style={{
                ...styles.tab,
                ...(type === "deposit" ? styles.activeTab : {}),
              }}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setType("withdrawal")}
              style={{
                ...styles.tab,
                ...(type === "withdrawal" ? styles.activeTab : {}),
              }}
            >
              Withdraw
            </button>
          </div>

          <form onSubmit={submitRequest}>
            <label style={styles.label}>
              Amount (USD)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                required
                style={styles.input}
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              style={{
                ...styles.submit,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting
                ? "Submitting..."
                : `Request ${type === "deposit" ? "Deposit" : "Withdrawal"}`}
            </button>
          </form>

          {message && <p style={styles.message}>{message}</p>}

          <p style={styles.note}>
            Demo mode: requests are reviewed by an administrator.
            No real money is transferred.
          </p>
        </section>

        <section style={styles.card}>
          <h2 style={styles.heading}>Transaction history</h2>

          {transactions.length === 0 ? (
            <p style={styles.note}>No requests yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td style={styles.td}>
                        {transaction.type}
                      </td>
                      <td style={styles.td}>
                        {money(Number(transaction.amount))}
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.status,
                            ...(transaction.status === "approved"
                              ? styles.approved
                              : transaction.status === "rejected"
                              ? styles.rejected
                              : styles.pending),
                          }}
                        >
                          {transaction.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        {new Date(
                          transaction.created_at
                        ).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
