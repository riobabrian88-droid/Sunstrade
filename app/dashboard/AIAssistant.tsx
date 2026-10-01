"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ChatMessage = { role: "user" | "assistant"; content: string };

const suggestions = [
  "What is a limit order?",
  "Explain MACD in simple terms",
  "How do I use SunStrade?",
];

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const message = (suggested ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setError("");
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    setBusy(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        throw new Error("Please sign in again to use the assistant.");
      }
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The assistant could not respond.");
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="sun-ai-launcher" type="button" aria-label="Open SunStrade AI assistant" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">✦</span><span>AI Assistant</span>
      </button>
      {open && (
        <section className="sun-ai-panel" aria-label="SunStrade AI assistant">
          <header className="sun-ai-header">
            <div className="sun-ai-avatar">✦</div>
            <div><strong>SunStrade AI</strong><small><i /> Trading learning assistant</small></div>
            <button type="button" className="sun-ai-close" aria-label="Close assistant" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="sun-ai-disclaimer">Ask about trading concepts or how to use SunStrade. Answers are educational, not financial advice.</div>
          <div className="sun-ai-messages" aria-live="polite">
            {messages.length === 0 && <div className="sun-ai-welcome"><div className="sun-ai-welcome-icon">✦</div><h3>How can I help?</h3><p>Ask me a question about trading or the platform.</p><div className="sun-ai-suggestions">{suggestions.map((item) => <button key={item} type="button" onClick={() => void sendMessage(undefined, item)} disabled={busy}>{item}<span>↗</span></button>)}</div></div>}
            {messages.map((message, index) => <div key={index} className={"sun-ai-message " + message.role}><span>{message.role === "assistant" ? "AI" : "You"}</span><p>{message.content}</p></div>)}
            {busy && <div className="sun-ai-typing"><i /><i /><i /> <span>Thinking…</span></div>}
            {error && <p className="sun-ai-error" role="alert">{error}</p>}
          </div>
          <form className="sun-ai-form" onSubmit={(event) => void sendMessage(event)}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question…" maxLength={2000} aria-label="Your question" disabled={busy} />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send message">➤</button>
          </form>
          <div className="sun-ai-footer">AI can make mistakes. Verify important information.</div>
        </section>
      )}
    </>
  );
}
