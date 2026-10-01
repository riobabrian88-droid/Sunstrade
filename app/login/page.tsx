"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();

    if (profileError) {
      await supabase.auth.signOut();
      setError("Unable to verify account status. Please try again.");
      setLoading(false);
      return;
    }

    if (profile?.is_suspended) {
      await supabase.auth.signOut();
      setError("Your account is suspended. Please contact support.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="sun-login-page">
      <div className="sun-login-shell">
        <section className="sun-login-visual" aria-label="SunStrade platform introduction">
          <Link href="/" className="sun-login-brand" aria-label="SunStrade home">
            <span className="sun-brand-mark">S</span><span>Sun<span>Strade</span></span>
          </Link>
          <div className="sun-login-copy">
            <p className="sun-eyebrow"><span /> MARKET TOOLS FOR EVERY TRADER</p>
            <h1>Focus.<br />Plan. Trade.<br /><span>Succeed.</span></h1>
            <p className="sun-login-description">A platform designed to help you explore markets, build your strategy, and track your trading activity.</p>
          </div>
          <div className="sun-login-features">
            <div><span className="sun-feature-icon">↗</span><span><strong>Real-time market data</strong><small>Follow prices and market movements</small></span></div>
            <div><span className="sun-feature-icon">▥</span><span><strong>Advanced charting</strong><small>Explore indicators and price action</small></span></div>
            <div><span className="sun-feature-icon">◇</span><span><strong>Risk management</strong><small>Review positions and trading activity</small></span></div>
            <div><span className="sun-feature-icon">◷</span><span><strong>24/7 platform access</strong><small>Check your account when you need it</small></span></div>
          </div>
          <div className="sun-login-market-strip" aria-label="Example market prices">
            <div><small>BTC/USD</small><strong>$67,482.35</strong><em>+2.45%</em></div>
            <div><small>ETH/USD</small><strong>$3,249.17</strong><em>+1.32%</em></div>
            <div><small>SOL/USD</small><strong>$156.32</strong><em>+1.85%</em></div>
          </div>
          <span className="sun-login-visual-note">Market prices shown for design preview</span>
        </section>

        <section className="sun-login-form-side">
          <div className="sun-login-card">
            <div className="sun-login-card-brand"><span className="sun-brand-mark">S</span><span>SunStrade</span></div>
            <div className="sun-login-card-heading">
              <h2>Welcome back</h2>
              <p>Sign in to your account</p>
            </div>
            <div className="sun-login-tabs"><span className="selected">Login</span><Link href="/signup">Create account</Link></div>
            <form onSubmit={handleLogin}>
              <label htmlFor="login-email">Email</label>
              <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" autoComplete="email" required />
              <label htmlFor="login-password">Password</label>
              <input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
              <div className="sun-login-options">
                <span className="sun-login-secure"><span aria-hidden="true">✓</span> Secure sign in</span>
                <Link href="/reset-password">Forgot password?</Link>
              </div>
              {error && <p className="sun-login-error" role="alert">{error}</p>}
              <button className="sun-login-submit" type="submit" disabled={loading}>{loading ? "Signing in..." : "Login"}</button>
            </form>
            <p className="sun-login-signup">New to SunStrade? <Link href="/signup">Create an account</Link></p>
            <div className="sun-login-legal">By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</div>
          </div>
          <div className="sun-login-footer"><span>© {new Date().getFullYear()} SunStrade</span><span><i /> Secure account access</span></div>
        </section>
      </div>
    </main>
  );
}
