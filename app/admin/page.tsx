"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  is_admin: boolean | null;
  is_suspended: boolean | null;
};
type Wallet = { user_id: string; cash_balance: number | string };
type Transaction = {
  id: string;
  user_id: string;
  type: string;
  amount: number | string;
  status: string;
  created_at: string;
};

const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value ?? 0));
const date = (value: string) => new Date(value).toLocaleString();

export default function AdminDashboardPage() {
  const router = useRouter();
  const [users, setUsers] = useState<Profile[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  async function loadData() {
    setError("");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      router.replace("/login");
      return;
    }
    const { data: ownProfile, error: ownError } = await supabase
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (ownError || !ownProfile?.is_admin) {
      setAuthorized(false);
      setError("Access denied. This page is for administrators only.");
      setLoading(false);
      return;
    }
    setAuthorized(true);
    const [profileResult, walletResult, transactionResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,username,is_admin,is_suspended").order("created_at", { ascending: false }),
      supabase.from("wallets").select("user_id,cash_balance"),
      supabase.from("wallet_transactions").select("id,user_id,type,amount,status,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    const problems = [profileResult.error, walletResult.error, transactionResult.error].filter(Boolean);
    if (problems.length) setError(problems.map((item) => item!.message).join(" · "));
    if (!profileResult.error) setUsers(profileResult.data ?? []);
    if (!walletResult.error) setWallets(walletResult.data ?? []);
    if (!transactionResult.error) setTransactions(transactionResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const channel = supabase.channel("admin-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const walletByUser = useMemo(() => new Map(wallets.map((wallet) => [wallet.user_id, Number(wallet.cash_balance)])), [wallets]);
  const filteredUsers = users.filter((user) => {
    const text = `${user.full_name ?? ""} ${user.username ?? ""} ${user.id}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });
  const filteredTransactions = transactions.filter((item) => {
    const matchesStatus = status === "all" || item.status === status;
    const matchesSearch = item.user_id.toLowerCase().includes(search.toLowerCase()) ||
      item.type.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && (search === "" || matchesSearch);
  });
  async function setUserSuspended(user: Profile) {
    const nextSuspended = !user.is_suspended;
    const confirmed = window.confirm(
      nextSuspended
        ? "Suspend this account? The status will be saved, but access restrictions must also be enforced in your app."
        : "Activate this account?"
    );
    if (!confirmed) return;
    setUpdatingUser(user.id);
    setError("");
    const { error: updateError } = await supabase.rpc("admin_set_user_suspended", {
      p_user_id: user.id,
      p_suspended: nextSuspended,
    });
    setUpdatingUser(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setUsers((current) => current.map((item) =>
      item.id === user.id ? { ...item, is_suspended: nextSuspended } : item
    ));
  }

  const totalBalance = wallets.reduce((sum, wallet) => sum + Number(wallet.cash_balance || 0), 0);
  const pendingCount = transactions.filter((item) => item.status === "pending").length;

  return (
    <main style={{ minHeight: "100vh", background: "#0b1220", color: "#e5edf7", padding: "22px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <div><p style={{ color: "#39b982", margin: "0 0 6px", fontSize: 12 }}>SUNRAKU TRADE · ADMIN</p><h1 style={{ margin: 0, fontSize: 28 }}>Admin dashboard</h1><p style={{ color: "#94a3b8", marginBottom: 0 }}>Users, wallet balances, account status and transaction activity</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/admin/wallet")} style={buttonStyle}>Review requests</button>
            <button onClick={() => router.push("/dashboard")} style={buttonStyle}>← Trading dashboard</button>
            <button onClick={loadData} style={buttonStyle}>Refresh</button>
          </div>
        </header>
        {error && <div role="alert" style={{ background: "#3b2528", color: "#fecaca", padding: 12, borderRadius: 8, marginBottom: 16 }}>{error}</div>}
        {!loading && !authorized && !error && <p>Checking administrator access…</p>}
        {loading ? <p style={{ color: "#94a3b8" }}>Loading admin data…</p> : authorized && <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 22 }}>
            <Stat label="Registered users" value={String(users.length)} />
            <Stat label="Total wallet balances" value={money(totalBalance)} />
            <Stat label="Wallet transactions" value={String(transactions.length)} />
            <Stat label="Pending requests" value={String(pendingCount)} />
          </section>
          <label style={{ display: "block", marginBottom: 18, color: "#94a3b8", fontSize: 13 }}>Search users or transaction user IDs
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, username or user ID" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 7, padding: 12, borderRadius: 8, border: "1px solid #334155", background: "#111b2d", color: "#fff" }} />
          </label>
          <section style={cardStyle}>
            <h2 style={headingStyle}>Users and wallet balances</h2>
            <div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr><th style={thStyle}>User</th><th style={thStyle}>User ID</th><th style={thStyle}>Wallet balance</th><th style={thStyle}>Role</th><th style={thStyle}>Account status</th><th style={thStyle}>Action</th></tr></thead><tbody>
              {filteredUsers.map((user) => <tr key={user.id}><td style={tdStyle}><strong>{user.full_name || user.username || "Unnamed user"}</strong>{user.username && user.full_name && <small style={{ display: "block", color: "#94a3b8" }}>@{user.username}</small>}</td><td style={{ ...tdStyle, maxWidth: 230, overflowWrap: "anywhere" }}>{user.id}</td><td style={tdStyle}>{money(walletByUser.get(user.id) ?? 0)}</td><td style={tdStyle}>{user.is_admin ? "Admin" : "User"}</td><td style={tdStyle}><span style={{ color: user.is_suspended ? "#f87171" : "#39b982" }}>{user.is_suspended ? "Suspended" : "Active"}</span></td><td style={tdStyle}>{user.is_admin ? "—" : <button disabled={updatingUser === user.id} onClick={() => setUserSuspended(user)} style={{ ...buttonStyle, background: user.is_suspended ? "#14532d" : "#7f1d1d", opacity: updatingUser === user.id ? 0.6 : 1 }}>{updatingUser === user.id ? "Saving…" : user.is_suspended ? "Activate" : "Suspend"}</button>}</td></tr>)}
              {filteredUsers.length === 0 && <tr><td style={tdStyle} colSpan={6}>No users found.</td></tr>}
            </tbody></table></div>
          </section>
          <section style={{ ...cardStyle, marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}><h2 style={headingStyle}>Transaction history</h2><select value={status} onChange={(event) => setStatus(event.target.value)} style={{ padding: 9, borderRadius: 7, border: "1px solid #334155", background: "#111b2d", color: "#fff" }}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
            <p style={{ color: "#94a3b8", fontSize: 12 }}>Showing the latest 500 records.</p>
            <div style={{ overflowX: "auto" }}><table style={tableStyle}><thead><tr><th style={thStyle}>Date</th><th style={thStyle}>User ID</th><th style={thStyle}>Type</th><th style={thStyle}>Amount</th><th style={thStyle}>Status</th></tr></thead><tbody>
              {filteredTransactions.map((item) => <tr key={item.id}><td style={tdStyle}>{date(item.created_at)}</td><td style={{ ...tdStyle, maxWidth: 230, overflowWrap: "anywhere" }}>{item.user_id}</td><td style={tdStyle}>{item.type}</td><td style={tdStyle}>{money(item.amount)}</td><td style={tdStyle}><span style={{ color: item.status === "approved" ? "#39b982" : item.status === "rejected" ? "#f87171" : "#e6b75d" }}>{item.status}</span></td></tr>)}
              {filteredTransactions.length === 0 && <tr><td style={tdStyle} colSpan={5}>No transactions found.</td></tr>}
            </tbody></table></div>
          </section>
        </>}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article style={{ ...cardStyle, padding: 17 }}><small style={{ color: "#94a3b8" }}>{label}</small><strong style={{ display: "block", fontSize: 23, marginTop: 10 }}>{value}</strong></article>;
}
const cardStyle: React.CSSProperties = { background: "#111b2d", border: "1px solid #253449", borderRadius: 10, padding: 16, marginBottom: 0 };
const headingStyle: React.CSSProperties = { fontSize: 17, margin: "0 0 12px" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 12 };
const thStyle: React.CSSProperties = { color: "#94a3b8", padding: "11px 10px", borderBottom: "1px solid #253449", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "12px 10px", borderBottom: "1px solid #1e2a3c", verticalAlign: "top" };
const buttonStyle: React.CSSProperties = { padding: "10px 13px", borderRadius: 7, border: "1px solid #334155", background: "#172033", color: "#fff", cursor: "pointer" };
