"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import HomeSidebar from "@/components/home/HomeSidebar";
import { supabase } from "@/lib/supabase";

type ChatRole = "user" | "assistant";

type ToolCall = {
  tool?: string;
  input?: unknown;
  result?: Record<string, unknown>;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_AI_BEDROCK_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "";

const suggestions = [
  "Plan a flyering event in Sunset Park next Saturday.",
  "Find nearby food pantries around 11220.",
  "Create a volunteer outreach plan for a school zone.",
  "Generate invite messages for a new campaign.",
];

const markdownComponents: Components = {
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-base font-semibold text-slate-900">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-sm font-semibold text-slate-900">{children}</h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-sm leading-relaxed text-slate-700">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="ml-4 list-disc space-y-1 text-sm text-slate-700">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="ml-4 list-decimal space-y-1 text-sm text-slate-700">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      className="font-medium text-[#1A1A1A] underline decoration-[#F5C542]"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ inline, children }: { inline?: boolean; children?: ReactNode }) =>
    inline ? (
      <code className="rounded bg-[#FEF3C7] px-1.5 py-0.5 font-mono text-xs text-[#92400E]">
        {children}
      </code>
    ) : (
      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">
        <code>{children}</code>
      </pre>
    ),
};

const renderMessageContent = (content: string) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
    {content}
  </ReactMarkdown>
);

const readToolStatus = (result?: Record<string, unknown>) =>
  typeof result?.status === "string" ? result.status : "completed";

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const latestToolCalls = useMemo(() => {
    const lastAssistant = [...messages].reverse().find((msg) => msg.role === "assistant");
    return lastAssistant?.toolCalls ?? [];
  }, [messages]);

  useEffect(() => {
    const ensureSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth");
        return;
      }
      setSessionReady(true);
    };

    void ensureSession();
  }, [router]);

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Missing auth session. Please sign in again.");
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  const createSession = useCallback(async () => {
    const sessionResponse = await fetch(`${API_BASE}/chat/session`, {
      method: "POST",
      headers: await getAuthHeaders(),
    });

    if (!sessionResponse.ok) {
      throw new Error("Unable to start campaign builder session.");
    }

    const sessionPayload = (await sessionResponse.json()) as {
      session_id?: string;
      data?: { session_id?: string };
    };
    const newSessionId = sessionPayload.session_id ?? sessionPayload.data?.session_id ?? null;
    if (!newSessionId) {
      throw new Error("Chat session id missing from response.");
    }

    setSessionId(newSessionId);
    return newSessionId;
  }, [getAuthHeaders]);

  const startNewSession = useCallback(() => {
    if (loading) return;

    setMessages([]);
    setInput("");
    setError("");
    setSessionId(null);
  }, [loading]);

  const submitMessage = useCallback(
    async (prompt: string) => {
      if (!prompt.trim() || loading) return;

      const userMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random()}`,
        role: "user",
        content: prompt.trim(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);
      setError("");

      try {
        let activeSessionId = sessionId;
        if (!activeSessionId) {
          activeSessionId = await createSession();
        }

        const response = await fetch(`${API_BASE}/chat/message`, {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            session_id: activeSessionId,
            message: userMessage.content,
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to reach campaign builder.");
        }

        const payload = (await response.json()) as {
          reply?: string;
          action?: Record<string, unknown> | null;
        };

        const assistantMessage: ChatMessage = {
          id: `${Date.now()}-${Math.random()}`,
          role: "assistant",
          content: payload.reply || "",
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chat request failed.");
      } finally {
        setLoading(false);
      }
    },
    [createSession, getAuthHeaders, loading, sessionId]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage(input);
  };

  if (!sessionReady) {
    return null;
  }

  return (
    <>
      <HomeSidebar />
      <main className="min-h-screen bg-[#FFF8E1] px-6 py-8 text-[#1A1A1A] md:ml-24 lg:ml-72">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#1A1A1A]">🤖 Campaign Builder</h1>
              <p className="mt-1 text-sm text-[#6B7280]">
                Chat with the agent to plan flyering campaigns and generate resources.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startNewSession}
                disabled={loading}
                className="rounded-full border border-[#F5C542] px-3 py-1 text-xs font-semibold text-[#92400E] transition hover:bg-[#FEF3C7] disabled:cursor-not-allowed disabled:opacity-60"
              >
                New session
              </button>
              <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-xs text-[#92400E]">
                Bedrock Agent
              </span>
            </div>
          </div>

          <div className="mt-5 h-[520px] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4">
            {messages.length === 0 ? (
              <div className="space-y-2 text-sm text-[#6B7280]">
                <p>Start with a prompt like:</p>
                <ul className="ml-4 list-disc space-y-1">
                  {suggestions.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      message.role === "user"
                        ? "ml-auto bg-[#F5C542] text-[#1A1A1A]"
                        : "border border-gray-200 bg-white text-[#1A1A1A]"
                    }`}
                  >
                    <div className="space-y-2">{renderMessageContent(message.content)}</div>
                    {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 ? (
                      <div className="mt-3 rounded-xl border border-[#F5C542]/40 bg-[#FEF3C7] px-3 py-2 text-xs text-[#92400E]">
                        <p className="font-semibold">Tools used</p>
                        <ul className="mt-1 space-y-1">
                          {message.toolCalls.map((tool, index) => (
                            <li key={`${tool.tool}-${index}`}>
                              {tool.tool || "tool"} — {readToolStatus(tool.result)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ))}

                {loading ? (
                  <div className="w-fit rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#6B7280] shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#F5C542]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#F5C542]" style={{ animationDelay: "0.1s" }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#F5C542]" style={{ animationDelay: "0.2s" }} />
                      <span className="text-xs">Thinking...</span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void submitMessage(suggestion)}
                className="rounded-full border border-[#F5C542] px-3 py-1 text-xs font-semibold text-[#1A1A1A] transition hover:bg-[#FEF3C7]"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Describe the campaign you want to organize..."
              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#F5C542] focus:ring-2 focus:ring-[#F5C542]/30"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-[#F5C542] px-5 py-3 text-sm font-semibold text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Send
            </button>
          </form>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">Session Tips</h2>
            <ul className="mt-3 space-y-2 text-sm text-[#6B7280]">
              <li>Share your target neighborhood and preferred date.</li>
              <li>Mention volunteer headcount and flyer goals.</li>
              <li>Ask for pantry suggestions or flyer links.</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">Latest Tool Calls</h2>
            {latestToolCalls.length === 0 ? (
              <p className="mt-3 text-sm text-[#6B7280]">No tool calls yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-[#6B7280]">
                {latestToolCalls.map((tool, index) => (
                  <li key={`${tool.tool}-${index}`} className="rounded-xl bg-[#FFF8E1] px-3 py-2">
                    <p className="font-semibold text-[#1A1A1A]">{tool.tool}</p>
                    <p className="text-xs text-[#6B7280]">
                      Status: {readToolStatus(tool.result)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        </div>
      </main>
    </>
  );
}
