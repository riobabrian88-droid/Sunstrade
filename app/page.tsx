import Link from "next/link";

export default function Home() {
  return (
    <main className="home-page">
      <div className="home-content">
        <h1>Sunraku Trade</h1>

        <p>Read the candles, not the noise.</p>

        <div className="home-buttons">
          <Link href="/login" className="home-button">
            Login
          </Link>

          <Link href="/signup" className="home-button secondary">
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}