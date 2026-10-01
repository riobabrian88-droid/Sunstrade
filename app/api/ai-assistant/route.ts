import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Please sign in to use the AI assistant." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !anonKey || !apiKey) {
    console.error("AI assistant configuration is incomplete.");
    return NextResponse.json({ error: "The AI assistant is not configured yet. Please try again later." }, { status: 503 });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 12) {
    return NextResponse.json({ error: "Send between 1 and 12 chat messages." }, { status: 400 });
  }

  const messages: ChatMessage[] = [];
  for (const item of body.messages) {
    if (!item || typeof item !== "object") return NextResponse.json({ error: "Invalid chat message." }, { status: 400 });
    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim() || content.length > 2000) {
      return NextResponse.json({ error: "Each message must have a valid role and be no longer than 2,000 characters." }, { status: 400 });
    }
    messages.push({ role, content: content.trim() });
  }
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "The latest message must be from you." }, { status: 400 });
  }

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: "You are SunStrade AI, a friendly educational assistant inside a simulated trading platform. Explain trading concepts and how to use the website in clear, simple language. Do not claim to have live market data or access to the user's account unless it is explicitly provided in the conversation. Do not give personalized financial advice, promise profits, or tell users what to buy or sell. Explain uncertainty and risks. Never place trades, request passwords, API keys, or payment details. If asked about a specific current price, say you do not have live prices in this chat and direct the user to the market dashboard.",
        input: messages.map((message) => ({ role: message.role, content: [{ type: "input_text", text: message.content }] })),
        max_output_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await aiResponse.json();
    if (!aiResponse.ok) {
      console.error("OpenAI Responses API error:", result?.error?.message || aiResponse.status);
      return NextResponse.json({ error: "The assistant is temporarily unavailable. Please try again." }, { status: 502 });
    }
    const reply = Array.isArray(result.output)
      ? result.output.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
          .filter((item: { type?: string }) => item.type === "output_text")
          .map((item: { text?: string }) => item.text || "")
          .join("\n").trim()
      : "";
    if (!reply) return NextResponse.json({ error: "The assistant returned an empty response. Please try again." }, { status: 502 });
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("AI assistant request failed:", error);
    return NextResponse.json({ error: "The assistant could not connect. Please try again." }, { status: 502 });
  }
}
