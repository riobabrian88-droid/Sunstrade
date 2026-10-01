"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name || !email || !country || !password || !confirmPassword) {
      setError("Please fill in all fields."); return;
    }
    if (!terms) { setError("You must accept the terms and conditions."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    setLoading(true);
    const { data, error: signupError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, country, terms_accepted_at: new Date().toISOString() } }
    });
    if (signupError) { setError(signupError.message); setLoading(false); return; }
    if (data.session) { router.push("/dashboard"); return; }
    setMessage("Account created successfully. Please check your email to confirm your account.");
    setLoading(false);
  }

  return (
    <main className="sun-login-page sun-signup-page">
      <div className="sun-login-shell sun-signup-shell">
        <section className="sun-login-visual" aria-label="SunStrade platform introduction">
          <Link href="/" className="sun-login-brand" aria-label="SunStrade home">
            <span className="sun-brand-mark">S</span><span>Sun<span>Strade</span></span>
          </Link>
          <div className="sun-login-copy sun-signup-copy">
            <p className="sun-eyebrow"><span /> MARKET TOOLS FOR EVERY TRADER</p>
            <h1>Start your<br />trading journey.<br /><span>Build your plan.</span></h1>
            <p className="sun-login-description">Create an account to explore markets, practice your strategy, and follow your trading activity.</p>
          </div>
          <div className="sun-login-features">
            <div><span className="sun-feature-icon">↗</span><span><strong>Market insights</strong><small>Follow prices and market movements</small></span></div>
            <div><span className="sun-feature-icon">▥</span><span><strong>Advanced charting</strong><small>Explore indicators and price action</small></span></div>
            <div><span className="sun-feature-icon">◇</span><span><strong>Practice trading</strong><small>Learn with the simulated market</small></span></div>
            <div><span className="sun-feature-icon">◷</span><span><strong>Track your activity</strong><small>Review positions and order history</small></span></div>
          </div>
          <div className="sun-login-market-strip" aria-label="Example market prices">
            <div><small>BTC/USD</small><strong>$67,482.35</strong><em>+2.45%</em></div>
            <div><small>ETH/USD</small><strong>$3,249.17</strong><em>+1.32%</em></div>
            <div><small>SOL/USD</small><strong>$156.32</strong><em>+1.85%</em></div>
          </div>
          <span className="sun-login-visual-note">Market prices shown for design preview</span>
        </section>
        <section className="sun-login-form-side sun-signup-form-side">
          <div className="sun-login-card sun-signup-card">
            <div className="sun-login-card-brand"><span className="sun-brand-mark">S</span><span>SunStrade</span></div>
            <div className="sun-login-card-heading"><h2>Create your account</h2><p>Join SunStrade and get started</p></div>
            <div className="sun-login-tabs"><Link href="/login">Login</Link><span className="selected">Create account</span></div>
            <form onSubmit={handleSignup}>
              <label htmlFor="signup-name">Full name</label>
              <input id="signup-name" type="text" placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
              <label htmlFor="signup-email">Email</label>
              <input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
              <label htmlFor="signup-country">Country</label>
              <select id="signup-country" value={country} onChange={e => setCountry(e.target.value)} required>
                <option value="">Select your country</option><option value="Kenya">Kenya</option><option value="Japan">Japan</option><option value="United States">United States</option><option value="United Kingdom">United Kingdom</option><option value="Singapore">Singapore</option><option value="Australia">Australia</option><option value="Other">Other</option>
              </select>
              <label htmlFor="signup-password">Password</label>
              <input id="signup-password" type="password" placeholder="Create a password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
              <label htmlFor="signup-confirm-password">Confirm password</label>
              <input id="signup-confirm-password" type="password" placeholder="Confirm your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
              <label className="sun-signup-terms"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>I agree to the SunStrade terms and conditions.</span></label>
              {error && <p className="sun-login-error" role="alert">{error}</p>}
              {message && <p className="sun-signup-success" role="status">{message}</p>}
              <button className="sun-login-submit" type="submit" disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
            </form>
            <p className="sun-login-signup">Already have an account? <Link href="/login">Login</Link></p>
            <div className="sun-login-legal">Create an account to access the SunStrade platform.</div>
          </div>
          <div className="sun-login-footer"><span>© {new Date().getFullYear()} SunStrade</span><span><i /> Secure account access</span></div>
        </section>
      </div>
    </main>
  );
}
