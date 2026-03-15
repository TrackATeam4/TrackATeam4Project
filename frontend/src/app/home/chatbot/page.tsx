"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import HomeSidebar from "@/components/home/HomeSidebar";
import { supabase } from "@/lib/supabase";

type ChatRole = "user" | "assistant";

type ChatMessage = {
	role: ChatRole;
	content: string;
};

type ChatContext = Record<string, unknown>;

const API_BASE =
	process.env.NEXT_PUBLIC_AI_BEDROCK_API_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	"";

const readPayloadData = (payload: unknown): Record<string, unknown> => {
	if (!payload || typeof payload !== "object") return {};
	const root = payload as Record<string, unknown>;
	const data = root.data;
	if (data && typeof data === "object") {
		return data as Record<string, unknown>;
	}
	return root;
};

const readString = (value: unknown): string => (typeof value === "string" ? value : "");

const readContext = (value: unknown): ChatContext => {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as ChatContext;
	}
	return {};
};

const readMessages = (value: unknown): ChatMessage[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const candidate = item as Record<string, unknown>;
			const role = candidate.role === "user" ? "user" : "assistant";
			const content = readString(candidate.content);
			if (!content) return null;
			return { role, content } as ChatMessage;
		})
		.filter((message): message is ChatMessage => Boolean(message));
};

export default function ChatbotPage() {
	const router = useRouter();
	const [sessionId, setSessionId] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [context, setContext] = useState<ChatContext>({});
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [booting, setBooting] = useState(true);
	const [error, setError] = useState("");

	const getAuthHeaders = useCallback(async (includeJsonContentType = false): Promise<HeadersInit> => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session?.access_token) {
			throw new Error("Missing auth session. Please sign in again.");
		}

		return {
			...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
			Authorization: `Bearer ${session.access_token}`,
		};
	}, []);

	const createSession = useCallback(async () => {
		const response = await fetch(`${API_BASE}/chat/session`, {
			method: "POST",
			headers: await getAuthHeaders(),
		});

		if (!response.ok) {
			throw new Error("Unable to create chat session.");
		}

		const payload = await response.json();
		const data = readPayloadData(payload);
		const newSessionId = readString(data.session_id);

		if (!newSessionId) {
			throw new Error("Session ID missing in response.");
		}

		localStorage.setItem("tracka.chat_session_id", newSessionId);
		setSessionId(newSessionId);
		setContext(readContext(data.context));
		setMessages(readMessages(data.messages));
	}, [getAuthHeaders]);

	const loadSession = useCallback(
		async (existingSessionId: string) => {
			const response = await fetch(`${API_BASE}/chat/session/${existingSessionId}`, {
				method: "GET",
				headers: await getAuthHeaders(),
			});

			if (!response.ok) {
				throw new Error("Unable to load chat session history.");
			}

			const payload = await response.json();
			const data = readPayloadData(payload);
			setSessionId(existingSessionId);
			setContext(readContext(data.context));
			setMessages(readMessages(data.messages));
		},
		[getAuthHeaders]
	);

	useEffect(() => {
		const init = async () => {
			setBooting(true);
			setError("");
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				if (!session) {
					router.push("/auth");
					return;
				}

				const existingSessionId = localStorage.getItem("tracka.chat_session_id") || "";
				if (existingSessionId) {
					await loadSession(existingSessionId);
				} else {
					await createSession();
				}
			} catch {
				localStorage.removeItem("tracka.chat_session_id");
				try {
					await createSession();
				} catch (sessionError) {
					setError(
						sessionError instanceof Error
							? sessionError.message
							: "Failed to initialize chatbot."
					);
				}
			} finally {
				setBooting(false);
			}
		};

		void init();
	}, [createSession, loadSession, router]);

	const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const trimmed = input.trim();
		if (!trimmed || !sessionId || loading) return;

		const userMessage: ChatMessage = { role: "user", content: trimmed };
		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setLoading(true);
		setError("");

		try {
			const response = await fetch(`${API_BASE}/chat/message`, {
				method: "POST",
				headers: await getAuthHeaders(true),
				body: JSON.stringify({
					session_id: sessionId,
					message: trimmed,
				}),
			});

			if (!response.ok) {
				throw new Error("Unable to send message to chatbot.");
			}

			const payload = await response.json();
			const data = readPayloadData(payload);
			const reply = readString(data.reply) || readString(data.message);

			if (reply) {
				setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
			}

			if (Array.isArray(data.messages)) {
				setMessages(readMessages(data.messages));
			}

			setContext(readContext(data.context) || context);
		} catch (messageError) {
			setError(messageError instanceof Error ? messageError.message : "Chat request failed.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<HomeSidebar />
			<main className="min-h-screen bg-[#FFFEF5] px-6 py-8 text-slate-700 md:ml-24 lg:ml-72">
				<div className="mx-auto max-w-5xl space-y-6">
				<div className="flex items-center justify-end">
					<span className="rounded-full bg-yellow-100 px-3 py-1 text-xs text-[#065F46]">
						Session: {sessionId ? sessionId.slice(0, 8) : "none"}
					</span>
				</div>

				<section className="grid gap-6 lg:grid-cols-[1fr_280px]">
					<div className="rounded-3xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60">
						<h1 className="text-2xl font-bold text-[#0F172A]">Campaign Chatbot</h1>
						<p className="mt-2 text-sm text-slate-500">
							Connected to AI_BEDROCK endpoints with bearer-token auth.
						</p>

						<div className="mt-5 h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-4">
							{booting ? (
								<p className="text-sm text-slate-400">Connecting...</p>
							) : messages.length === 0 ? (
								<p className="text-sm text-slate-400">Start the conversation to create your campaign.</p>
							) : (
								messages.map((message, index) => (
									<div
										key={`${message.role}-${index}`}
										className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
											message.role === "user"
												? "ml-auto bg-emerald-600 text-white"
												: "border border-yellow-100 bg-white text-slate-700"
										}`}
									>
										{message.content}
									</div>
								))
							)}
						</div>

						<form className="mt-4 flex gap-3" onSubmit={sendMessage}>
							<input
								value={input}
								onChange={(event) => setInput(event.target.value)}
								placeholder="Ask to create a campaign..."
								className="flex-1 rounded-xl border border-yellow-100 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
								disabled={loading || !sessionId}
							/>
							<button
								type="submit"
								disabled={loading || !sessionId}
								className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
							>
								{loading ? "Sending..." : "Send"}
							</button>
						</form>

						{error ? (
							<div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
								{error}
							</div>
						) : null}
					</div>

					<aside className="rounded-3xl border border-yellow-100 bg-white p-5 shadow-lg shadow-yellow-100/60">
						<h2 className="text-sm font-semibold text-[#0F172A]">Context Snapshot</h2>
						<pre className="mt-3 max-h-[450px] overflow-auto rounded-xl bg-[#FFFEF5] p-3 text-xs text-slate-600">
							{JSON.stringify(context, null, 2)}
						</pre>
					</aside>
				</section>
				</div>
			</main>
		</>
	);
}
