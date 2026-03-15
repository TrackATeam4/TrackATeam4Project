"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import LemonLogo from "@/components/LemonLogo";

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
        
          <div className="flex items-center gap-2.5 text-white/90">
            <LemonLogo size={28} />
            <img src="/wordmark.svg" alt="Lemontree" className="h-6 w-auto brightness-0 invert opacity-80" />
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
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold">Invitation not found</h2>
              <p className="mt-2 text-sm text-white/60">This link may be invalid. Please check the email you received.</p>
            </motion.div>
          )}

          {state === "expired" && (
            <motion.div
              key="expired"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-white/10 p-8 text-center text-white backdrop-blur-sm"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold">Invitation expired</h2>
              <p className="mt-2 text-sm text-white/60">This invitation link has expired. Ask the organizer to send a new one.</p>
            </motion.div>
          )}

          {state === "declined" && (
            <motion.div
              key="declined"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-white/10 p-8 text-center text-white backdrop-blur-sm"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold">Got it, no worries!</h2>
              <p className="mt-2 text-sm text-white/60">You&apos;ve declined this invitation. Hope to see you next time.</p>
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
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <motion.path d="M5 13l4 4L19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.3 }} />
                </svg>
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
                  Add to Google Calendar
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
              <div className="bg-[#1B4332] px-8 py-10 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/70">
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
                    <span className="mt-0.5 shrink-0 text-[#9CA3AF]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#111827]">{fmtDate(inviteData.campaign.date)}</p>
                      {(inviteData.campaign.start_time ?? inviteData.campaign.end_time) && (
                        <p className="text-xs text-[#6B7280]">
                          {fmtTime(inviteData.campaign.start_time)}{inviteData.campaign.end_time ? ` – ${fmtTime(inviteData.campaign.end_time)}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {inviteData.campaign.address && (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-[#9CA3AF]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </span>
                    <p className="text-sm text-[#374151]">{inviteData.campaign.address}</p>
                  </div>
                )}

                {inviteData.campaign.max_volunteers && (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-[#9CA3AF]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </span>
                    <p className="text-sm text-[#374151]">Up to {inviteData.campaign.max_volunteers} volunteers</p>
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
                      disabled={submitting}
                      onClick={handleAccept}
                      className="flex-1 rounded-2xl bg-[#1B4332] py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60 hover:bg-[#163828] transition"
                    >
                      {submitting ? "Confirming…" : "Accept Invitation"}
                    </motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={submitting}
                      onClick={handleDecline}
                      className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-[#6B7280] transition hover:bg-gray-50 disabled:opacity-60"
                    >
                      Decline
                    </motion.button>
                  </div>

                  {inviteData.google_calendar_url && (
                    <a
                      href={inviteData.google_calendar_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block text-center text-xs text-[#9CA3AF] underline underline-offset-2 hover:text-[#6B7280]"
                    >
                      Preview in Google Calendar
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
