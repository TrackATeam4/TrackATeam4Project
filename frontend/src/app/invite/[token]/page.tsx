"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Campaign = {
  id: string;
  title: string;
  description?: string | null;
  address?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  max_volunteers?: number | null;
};

type InviteData = {
  invitation: { id: string; email: string; status: string };
  campaign: Campaign;
  google_calendar_url: string;
};

type PageState = "loading" | "error" | "expired" | "ready" | "accepted" | "declined";

function fmtDate(v?: string | null) {
  if (!v) return "";
  return new Date(`${v}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(v?: string | null) {
  if (!v) return "";
  const [h, m] = v.split(":").map(Number);
  const d = new Date(0, 0, 0, h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function InvitePage() {
  const params = useParams();
  const token =
    typeof params.token === "string"
      ? params.token
      : Array.isArray(params.token)
        ? params.token[0]
        : "";

  const [state, setState] = useState<PageState>("loading");
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/invitations/${token}`);
        if (res.status === 410) { setState("expired"); return; }
        if (!res.ok) { setState("error"); return; }
        const json = (await res.json()) as { success: boolean; data: InviteData };
        const data = json.data;
        if (data.invitation.status === "accepted") {
          setCalendarUrl(data.google_calendar_url);
          setInviteData(data);
          setState("accepted");
          return;
        }
        if (data.invitation.status === "expired") { setState("expired"); return; }
        setInviteData(data);
        setState("ready");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const json = (await res.json()) as { success?: boolean; data?: { google_calendar_url?: string }; detail?: string };
      if (!res.ok) throw new Error(json.detail ?? "Failed to accept");
      setCalendarUrl(json.data?.google_calendar_url ?? "");
      setState("accepted");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/invitations/${token}/decline`, { method: "POST" });
    } catch { /* ignore */ } finally {
      setSubmitting(false);
      setState("declined");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2D1F] via-[#1B4332] to-[#0F2D1F] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex justify-center"
        >
          <div className="flex items-center gap-2 text-white/80">
            <span className="text-3xl">🍋</span>
            <span className="text-xl font-bold tracking-tight">Lemontree</span>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {state === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 text-white/60"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="h-10 w-10 rounded-full border-4 border-white/20 border-t-white/70"
              />
              <p className="text-sm">Loading your invitation…</p>
            </motion.div>
          )}

          {state === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-white/10 p-8 text-center text-white backdrop-blur-sm"
            >
              <p className="text-4xl">😕</p>
              <h2 className="mt-4 text-xl font-bold">Invitation not found</h2>
              <p className="mt-2 text-sm text-white/60">
                This link may be invalid. Please check the email you received.
              </p>
            </motion.div>
          )}

          {state === "expired" && (
            <motion.div
              key="expired"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-white/10 p-8 text-center text-white backdrop-blur-sm"
            >
              <p className="text-4xl">⏰</p>
              <h2 className="mt-4 text-xl font-bold">Invitation expired</h2>
              <p className="mt-2 text-sm text-white/60">
                This invitation link has expired. Ask the organizer to send a new one.
              </p>
            </motion.div>
          )}

          {state === "declined" && (
            <motion.div
              key="declined"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-white/10 p-8 text-center text-white backdrop-blur-sm"
            >
              <p className="text-4xl">👋</p>
              <h2 className="mt-4 text-xl font-bold">Got it, no worries!</h2>
              <p className="mt-2 text-sm text-white/60">
                You&apos;ve declined this invitation. Hope to see you next time.
              </p>
            </motion.div>
          )}

          {state === "accepted" && (
            <motion.div
              key="accepted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-white/10 p-8 text-center text-white backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-4 ring-emerald-400/30"
              >
                <span className="text-4xl">✅</span>
              </motion.div>
              <h2 className="mt-5 text-2xl font-bold">You&apos;re confirmed!</h2>
              {inviteData?.campaign && (
                <p className="mt-2 text-white/70">
                  See you at{" "}
                  <strong className="text-white">{inviteData.campaign.title}</strong>
                  {inviteData.campaign.date ? ` on ${fmtDate(inviteData.campaign.date)}` : ""}!
                </p>
              )}
              <p className="mt-3 text-sm text-white/50">
                A confirmation email is on its way to you.
              </p>
              {calendarUrl && (
                <a
                  href={calendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-block rounded-2xl bg-white/15 px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/25"
                >
                  📅 Add to Google Calendar
                </a>
              )}
            </motion.div>
          )}

          {state === "ready" && inviteData && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/40"
            >
              {/* Hero */}
              <div className="bg-gradient-to-br from-[#1B4332] to-[#10B981] px-8 py-10 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/70">
                  You&apos;re invited to volunteer
                </p>
                <h1 className="mt-2 text-2xl font-bold leading-tight">
                  {inviteData.campaign.title}
                </h1>
                {inviteData.campaign.description && (
                  <p className="mt-2 text-sm text-white/70 line-clamp-2">
                    {inviteData.campaign.description}
                  </p>
                )}
              </div>

              {/* Details */}
              <div className="space-y-3 px-8 py-6">
                {inviteData.campaign.date && (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg">📅</span>
                    <div>
                      <p className="text-sm font-semibold text-[#0F172A]">
                        {fmtDate(inviteData.campaign.date)}
                      </p>
                      {(inviteData.campaign.start_time ?? inviteData.campaign.end_time) && (
                        <p className="text-xs text-slate-500">
                          {fmtTime(inviteData.campaign.start_time)}
                          {inviteData.campaign.end_time
                            ? ` – ${fmtTime(inviteData.campaign.end_time)}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {inviteData.campaign.address && (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg">📍</span>
                    <p className="text-sm text-slate-700">{inviteData.campaign.address}</p>
                  </div>
                )}

                {inviteData.campaign.max_volunteers && (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-lg">👥</span>
                    <p className="text-sm text-slate-700">
                      Up to {inviteData.campaign.max_volunteers} volunteers
                    </p>
                  </div>
                )}

                {/* RSVP form */}
                <div className="border-t border-gray-100 pt-5">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Invited:{" "}
                    <span className="normal-case font-medium text-slate-600">
                      {inviteData.invitation.email}
                    </span>
                  </p>

                  <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                    Your name{" "}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Alex Johnson"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAccept(); }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />

                  {errorMsg && (
                    <p className="mt-2 text-xs text-rose-600">{errorMsg}</p>
                  )}

                  <div className="mt-4 flex gap-3">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ scale: 1.02 }}
                      disabled={submitting}
                      onClick={handleAccept}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-sm font-bold text-white shadow-md shadow-emerald-100 disabled:opacity-60"
                    >
                      {submitting ? "Confirming…" : "✓ Accept Invitation"}
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={submitting}
                      onClick={handleDecline}
                      className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-slate-500 transition hover:bg-gray-50 disabled:opacity-60"
                    >
                      Decline
                    </motion.button>
                  </div>

                  {inviteData.google_calendar_url && (
                    <a
                      href={inviteData.google_calendar_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block text-center text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600"
                    >
                      📅 Preview in Google Calendar
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
