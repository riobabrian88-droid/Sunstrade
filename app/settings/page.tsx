"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import "./settings.css";

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        router.replace("/login");
        return;
      }
      if (!active) return;
      setEmail(user.email || "");
      const savedTheme = window.localStorage.getItem("sunraku-theme");
      const nextTheme = savedTheme === "light" ? "light" : "dark";
      setTheme(nextTheme);
      document.documentElement.classList.toggle("light-theme", nextTheme === "light");
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, [router]);

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

  if (loading) return <main className="settings-page"><p>Loading settings...</p></main>;

  return (
    <main className="settings-page">
      <header className="settings-header">
        <Link href="/dashboard" className="settings-brand"><span className="settings-mark">S</span><span>Sunraku <b>Trade</b></span></Link>
        <Link href="/dashboard" className="settings-back">← Back to dashboard</Link>
      </header>
      <section className="settings-content">
        <p className="settings-eyebrow">ACCOUNT</p>
        <h1>Account settings</h1>
        <p className="settings-intro">Manage your account and app preferences.</p>

        <section className="settings-card">
          <div className="settings-card-heading"><div><h2>Account</h2><p>Your sign-in information and profile.</p></div><span className="settings-symbol">♙</span></div>
          <div className="settings-row"><div><strong>Email address</strong><small>{email}</small></div><span className="settings-tag">Signed in</span></div>
          <Link className="settings-profile-link" href="/profile">Edit your profile <span>→</span></Link>
        </section>

        <section className="settings-card">
          <div className="settings-card-heading"><div><h2>Preferences</h2><p>Choose how Sunraku Trade looks on this device.</p></div><span className="settings-symbol">⚙</span></div>
          <div className="settings-row"><div><strong>Appearance</strong><small>Select a theme for the dashboard.</small></div>
            <div className="theme-options" role="group" aria-label="Appearance">
              <button type="button" className={theme === "dark" ? "chosen" : ""} aria-pressed={theme === "dark"} onClick={() => changeTheme("dark")}>☾ Dark</button>
              <button type="button" className={theme === "light" ? "chosen" : ""} aria-pressed={theme === "light"} onClick={() => changeTheme("light")}>☀ Light</button>
            </div>
          </div>
          <p className="settings-note">Your theme preference is saved on this device.</p>
        </section>

        <section className="settings-card signout-card">
          <div className="settings-card-heading"><div><h2>Sign out</h2><p>Sign out of your Sunraku Trade account on this device.</p></div><span className="settings-symbol">↪</span></div>
          {error && <p className="settings-error" role="alert">{error}</p>}
          <button className="settings-signout" type="button" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out..." : "Sign out"}</button>
        </section>
      </section>
    </main>
  );
}
