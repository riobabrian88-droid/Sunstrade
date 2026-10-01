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
      try {
        // Read the persisted session first; getUser() can wait on a network request.
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Sign-in check timed out. Please refresh and try again.")), 12000))
        ]);
        if (!active) return;
        const currentUser = sessionResult.data.session?.user;
        if (sessionResult.error || !currentUser) {
          router.replace("/login");
          return;
        }

        // Render the profile from the authenticated session even if the profile
        // table is slow or unavailable. The metadata is a safe display fallback.
        setUser(currentUser);
        setFullName(currentUser.user_metadata?.full_name || "");
        const savedTheme = window.localStorage.getItem("sunraku-theme");
        const nextTheme = savedTheme === "light" ? "light" : "dark";
        setTheme(nextTheme);
        document.documentElement.classList.toggle("light-theme", nextTheme === "light");
        setLoading(false);

        const profileResult = await Promise.race([
          supabase.from("profiles").select("full_name").eq("id", currentUser.id).maybeSingle(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Profile details could not be loaded. You can still view your account and try saving your name.")), 12000))
        ]);
        if (!active) return;
        if (profileResult.error) {
          setError("Your account loaded, but profile details could not be fetched: " + profileResult.error.message);
        } else if (profileResult.data?.full_name) {
          setFullName(profileResult.data.full_name);
        }
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load your profile. Please refresh and try again.");
      } finally {
        if (active) setLoading(false);
      }
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
  const emailVerified = Boolean(user?.email_confirmed_at);
  const profileComplete = Boolean(fullName.trim() && user?.email);
  const joinedDate = user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

  if (loading) return <main className="profile-page"><p>Loading profile...</p></main>;

  return (
    <main className="profile-page">
      <header className="profile-header">
        <Link href="/dashboard" className="profile-brand"><span className="profile-mark">S</span><span>Sunraku <b>Trade</b></span></Link>
        <Link href="/dashboard" className="back-link">← Back to dashboard</Link>
      </header>
      <section className="profile-content">
        <div className="profile-title"><div><p className="eyebrow">ACCOUNT</p><h1>My Profile</h1><p>Manage your personal information.</p></div></div>
        <section className="profile-hero">
          <div className="profile-hero-top">
            <div className="profile-identity">
              <div className="profile-avatar">{initial}</div>
              <div><h2>{displayName}</h2><p>{user?.email}</p><span className="account-badge">SunStrade account</span></div>
            </div>
            <span className={"profile-verified-badge " + (emailVerified ? "verified" : "unverified")}>{emailVerified ? "✓ Email verified" : "● Email not verified"}</span>
          </div>
          <div className="profile-hero-stats">
            <div><small>Account created</small><strong>{joinedDate}</strong></div>
            <div><small>Profile status</small><strong>{profileComplete ? "Complete" : "Add your name"}</strong></div>
            <div><small>Account type</small><strong>Standard</strong></div>
          </div>
        </section>
        <nav className="profile-quick-links" aria-label="Account shortcuts">
          <Link href="/wallet"><span className="profile-quick-icon">▣</span><span><strong>Wallet</strong><small>Balance & requests</small></span><b>→</b></Link>
          <Link href="/dashboard"><span className="profile-quick-icon">▦</span><span><strong>Dashboard</strong><small>Markets & trading</small></span><b>→</b></Link>
          <Link href="/settings"><span className="profile-quick-icon">⚙</span><span><strong>Settings</strong><small>Account preferences</small></span><b>→</b></Link>
        </nav>
        <section className="profile-card">
          <div className="profile-section-title"><span className="profile-section-icon">♙</span><div><h2>Personal information</h2><p>Keep your account details up to date.</p></div></div>
          <form onSubmit={saveProfile} className="profile-form">
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
          <div className="profile-section-title"><span className="profile-section-icon">☼</span><div><h2>Account preferences</h2><p>Choose how SunStrade looks on this device.</p></div></div>
          <div className="profile-setting-row"><div><strong>Appearance</strong><small>Select a theme for the dashboard.</small></div><div className="profile-theme-options" role="group" aria-label="Appearance"><button type="button" className={theme === "dark" ? "chosen" : ""} aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}>☾ Dark</button><button type="button" className={theme === "light" ? "chosen" : ""} aria-pressed={theme === "light"} onClick={() => changeTheme("light")}>☀ Light</button></div></div>
          <p className="profile-settings-note">Your theme preference is saved on this device.</p>
        </section>
        <section className="profile-card profile-signout-card">
          <div className="profile-section-title"><span className="profile-section-icon danger">↪</span><div><h2>Sign out</h2><p>Sign out of your SunStrade account on this device.</p></div></div>
          {error && <p className="profile-error" role="alert">{error}</p>}
          <button type="button" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out..." : "Sign out"}</button>
        </section>
      </section>
    </main>
  );
}
