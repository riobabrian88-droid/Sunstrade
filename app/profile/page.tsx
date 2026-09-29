"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import "./profile.css";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !currentUser) {
        router.replace("/login");
        return;
      }
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUser.id)
        .maybeSingle();
      if (!active) return;
      if (profileError) {
        setError(profileError.message);
      } else {
        setFullName(data?.full_name || currentUser.user_metadata?.full_name || "");
      }
      setUser(currentUser);
      const savedTheme = window.localStorage.getItem("sunraku-theme");
      const nextTheme = savedTheme === "light" ? "light" : "dark";
      setTheme(nextTheme);
      document.documentElement.classList.toggle("light-theme", nextTheme === "light");
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError("");
    setMessage("");
    const { error: saveError } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: fullName.trim()
      }, { onConflict: "id" });
    if (saveError) setError(saveError.message);
    else setMessage("Profile updated successfully.");
    setSaving(false);
  }

  function changeTheme(value: "dark" | "light") {
    setTheme(value);
    window.localStorage.setItem("sunraku-theme", value);
    document.documentElement.classList.toggle("light-theme", value === "light");
  }

  async function signOut() {
    setSigningOut(true);
    setError("");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      setSigningOut(false);
      return;
    }
    router.replace("/login");
  }

  const displayName = fullName.trim() || user?.email?.split("@")[0] || "Trader";
  const initial = displayName.charAt(0).toUpperCase();

  if (loading) return <main className="profile-page"><p>Loading profile...</p></main>;

  return (
    <main className="profile-page">
      <header className="profile-header">
        <Link href="/dashboard" className="profile-brand"><span className="profile-mark">S</span><span>Sunraku <b>Trade</b></span></Link>
        <Link href="/dashboard" className="back-link">← Back to dashboard</Link>
      </header>
      <section className="profile-content">
        <div className="profile-title"><div><p className="eyebrow">ACCOUNT</p><h1>My Profile</h1><p>Manage your personal information.</p></div></div>
        <section className="profile-card">
          <div className="profile-identity">
            <div className="profile-avatar">{initial}</div>
            <div><h2>{displayName}</h2><p>{user?.email}</p><span className="account-badge">Trading account</span></div>
          </div>
          <form onSubmit={saveProfile} className="profile-form">
            <h3>Personal information</h3>
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={80} placeholder="Enter your full name" />
            <label htmlFor="email">Email address</label>
            <input id="email" value={user?.email || ""} readOnly />
            <p className="profile-help">Your email is managed by your sign-in account and can't be changed here.</p>
            {error && <p className="profile-error" role="alert">{error}</p>}
            {message && <p className="profile-success" role="status">{message}</p>}
            <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
          </form>
        </section>
        <section className="profile-card profile-settings-card">
          <h2>Account preferences</h2>
          <p className="profile-settings-intro">Choose how Sunraku Trade looks on this device.</p>
          <div className="profile-setting-row"><div><strong>Appearance</strong><small>Select a theme for the dashboard.</small></div><div className="profile-theme-options" role="group" aria-label="Appearance"><button type="button" className={theme === "dark" ? "chosen" : ""} aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}>☾ Dark</button><button type="button" className={theme === "light" ? "chosen" : ""} aria-pressed={theme === "light"} onClick={() => changeTheme("light")}>☀ Light</button></div></div>
          <p className="profile-settings-note">Your theme preference is saved on this device.</p>
        </section>
        <section className="profile-card profile-signout-card">
          <h2>Sign out</h2><p>Sign out of your Sunraku Trade account on this device.</p>
          {error && <p className="profile-error" role="alert">{error}</p>}
          <button type="button" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out..." : "Sign out"}</button>
        </section>
      </section>
    </main>
  );
}
