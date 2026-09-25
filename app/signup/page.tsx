"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name
        }
      }
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      return;
    }

    setMessage(
      "Account created. Check your email to confirm your account."
    );

    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Sunraku Trade</h1>

        <h2>Create your account</h2>

        <p>
          Create your account to access Sunraku Trade.
        </p>

        <form onSubmit={handleSignup}>
          <label htmlFor="name">Full name</label>

          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your full name"
            autoComplete="name"
            required
          />

          <label htmlFor="email">Email</label>

          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            autoComplete="new-password"
            minLength={6}
            required
          />

          <label htmlFor="confirmPassword">
            Confirm password
          </label>

          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(event.target.value)
            }
            placeholder="Confirm your password"
            autoComplete="new-password"
            required
          />

          {error && (
            <p className="error-message">
              {error}
            </p>
          )}

          {message && (
            <p className="success-message">
              {message}
            </p>
          )}

          <button type="submit" disabled={loading}>
            {loading
              ? "Creating account..."
              : "Create account"}
          </button>
        </form>

        <p>
          Already have an account?{" "}
          <Link href="/login">
            Login
          </Link>
        </p>

        <p>
          <Link href="/">
            ← Back to Sunraku Trade
          </Link>
        </p>
      </div>
    </main>
  );
}