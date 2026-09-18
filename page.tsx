import Link from 'next/link';

export default function Home() {
  return <main>
    <nav className="nav"><div className="brand">Sunstrade</div><div><Link className="btn secondary" href="/login">Login</Link></div></nav>
    <section className="hero container">
      <h1>Welcome to Sunstrade</h1>
      <p className="muted">Create your account and access your personal dashboard.</p>
      <div className="actions">
        <Link className="btn" href="/signup">Create Account</Link>
        <Link className="btn secondary" href="/login">Login</Link>
      </div>
    </section>
  </main>;
}
