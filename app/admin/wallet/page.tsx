"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Transaction = {
  id: string;
  user_id: string;
  type: "deposit" | "withdrawal";
  amount: number;
  status: string;
  created_at: string;
};

export default function AdminWalletPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadTransactions() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      setMessage("Access denied. Admins only.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("id, user_id, type, amount, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(error.message);
    } else {
      setTransactions(data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadTransactions();

    const channel = supabase
      .channel("admin-wallet-transactions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_transactions",
        },
        () => loadTransactions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function reviewTransaction(
    transactionId: string,
    decision: "approved" | "rejected"
  ) {
    const confirmed = window.confirm(
      `Are you sure you want to ${decision} this request?`
    );

    if (!confirmed) return;

    setBusyId(transactionId);
    setMessage("");

    const { error } = await supabase.rpc(
      "review_wallet_transaction",
      {
        p_transaction_id: transactionId,
        p_decision: decision,
      }
    );

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(`Request ${decision} successfully.`);
      await loadTransactions();
    }

    setBusyId(null);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1220",
        color: "#fff",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            border: "1px solid #334155",
            background: "#172033",
            color: "#fff",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          ← Dashboard
        </button>

        <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>
          Admin Wallet
        </h1>
        <p style={{ color: "#94a3b8", marginBottom: "24px" }}>
          Review pending deposits and withdrawals.
        </p>

        {message && (
          <p
            style={{
              padding: "12px",
              borderRadius: "8px",
              background: "#172033",
              marginBottom: "16px",
            }}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p>Loading requests...</p>
        ) : transactions.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>
            No pending wallet requests.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {transactions.map((transaction) => (
              <article
                key={transaction.id}
                style={{
                  background: "#172033",
                  border: "1px solid #334155",
                  borderRadius: "12px",
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: "18px" }}>
                    {transaction.type === "deposit"
                      ? "Deposit"
                      : "Withdrawal"}
                  </strong>
                  <strong style={{ fontSize: "20px" }}>
                    {Number(transaction.amount).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2 }
                    )}
                  </strong>
                </div>

                <p
                  style={{
                    color: "#94a3b8",
                    fontSize: "13px",
                    overflowWrap: "anywhere",
                  }}
                >
                  User ID: {transaction.user_id}
                </p>

                <p style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Submitted:{" "}
                  {new Date(transaction.created_at).toLocaleString()}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginTop: "16px",
                  }}
                >
                  <button
                    disabled={busyId === transaction.id}
                    onClick={() =>
                      reviewTransaction(transaction.id, "approved")
                    }
                    style={{
                      flex: 1,
                      padding: "12px",
                      border: "none",
                      borderRadius: "8px",
                      background: "#16a34a",
                      color: "#fff",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    {busyId === transaction.id
                      ? "Processing..."
                      : "Approve"}
                  </button>

                  <button
                    disabled={busyId === transaction.id}
                    onClick={() =>
                      reviewTransaction(transaction.id, "rejected")
                    }
                    style={{
                      flex: 1,
                      padding: "12px",
                      border: "none",
                      borderRadius: "8px",
                      background: "#dc2626",
                      color: "#fff",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
        }
