"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LemonLogo from "@/components/LemonLogo";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Campaign = {
  id: string;
  title: string;
  date?: string | null;
  start_time?: string | null;
  address?: string | null;
  max_volunteers?: number | null;
};

type PageState = "loading" | "ready" | "checkedIn" | "error";

function fmtDate(v?: string | null) {
  if (!v) return "TBD";
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function fmtTime(v?: string | null) {
  if (!v) return "";
  const [h, m] = v.split(":").map(Number);
  const d = new Date(0, 0, 0, h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export default function CheckinPage() {
  const { id } = useParams<{ id: string }>();

  const [state, setState] = useState<PageState>("loading");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        // Fetch campaign details
        const res = await fetch(`${API_BASE}/campaigns/${id}`);
        if (!res.ok) {
          setState("error");
          return;
        }
        const json = (await res.json()) as { success: boolean; data: Campaign };
        setCampaign(json.data);

        // Check auth
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setIsLoggedIn(true);
        }

        setState("ready");
      } catch {
        setState("error");
      }
    })();
  }, [id]);

  const handleCheckin = async () => {
    if (!id) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };

      if (isLoggedIn) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
        const res = await fetch(`${API_BASE}/campaigns/${id}/checkin`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const json = (await res.json()) as { detail?: string };
          throw new Error(json.detail ?? "Check-in failed");
        }
      } else {
        if (!email.trim()) {
          setErrorMsg("Please enter your email address.");
          setSubmitting(false);
          return;
        }
        const res = await fetch(`${API_BASE}/campaigns/${id}/checkin`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { detail?: string };
          throw new Error(json.detail ?? "Check-in failed");
        }
      }

      setState("checkedIn");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
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
              <p className="text-sm">Loading campaign...</p>
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
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold">Campaign not found</h2>
              <p className="mt-2 text-sm text-white/60">This check-in link may be invalid or the campaign may have ended.</p>
            </motion.div>
          )}

          {state === "ready" && campaign && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/40"
            >
              {/* Hero */}
              <div className="bg-[#1B4332] px-8 py-10 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F5C542]/70">
                  Volunteer Check-In
                </p>
                <h1 className="mt-2 text-2xl font-bold leading-tight">{campaign.title}</h1>
                <div className="mt-3 space-y-1 text-sm text-white/70">
                  {campaign.date && (
                    <p>📅 {fmtDate(campaign.date)}{campaign.start_time ? ` · ${fmtTime(campaign.start_time)}` : ""}</p>
                  )}
                  {campaign.address && <p>📍 {campaign.address}</p>}
                </div>
              </div>

              {/* Form */}
              <div className="px-8 py-6 space-y-4">
                {isLoggedIn ? (
                  <div className="text-center">
                    <p className="text-sm text-slate-600 mb-5">
                      You&apos;re signed in. Tap the button below to check in for this campaign.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Your Name <span className="font-normal text-slate-400">(optional)</span></label>
                      <input
                        type="text"
                        placeholder="e.g. Alex Johnson"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-[#F5C542] focus:outline-none focus:ring-2 focus:ring-[#F5C542]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Email Address</label>
                      <input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void handleCheckin(); }}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-[#F5C542] focus:outline-none focus:ring-2 focus:ring-[#F5C542]/30"
                      />
                    </div>
                  </>
                )}

                {errorMsg && (
                  <p className="text-xs text-rose-600">{errorMsg}</p>
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.01 }}
                  disabled={submitting}
                  onClick={handleCheckin}
                  className="w-full rounded-2xl bg-[#1B4332] py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60 hover:bg-[#163828] transition"
                >
                  {submitting ? "Checking in…" : "Check In Now"}
                </motion.button>
              </div>
            </motion.div>
          )}

          {state === "checkedIn" && (
            <motion.div
              key="checkedIn"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-3xl bg-white/10 p-8 text-center text-white backdrop-blur-sm relative overflow-hidden"
            >
              {/* Confetti */}
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 1, y: 0, x: 0 }}
                  animate={{
                    opacity: 0,
                    y: Math.random() * 300 - 50,
                    x: Math.random() * 400 - 200,
                  }}
                  transition={{ duration: 1.5 + Math.random() * 0.8, ease: "easeOut" }}
                  className="pointer-events-none absolute"
                  style={{
                    top: `${20 + Math.random() * 60}%`,
                    left: `${10 + Math.random() * 80}%`,
                    width: 7,
                    height: 7,
                    borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                    backgroundColor: ["#FCD34D", "#34D399", "#60A5FA", "#F87171", "#A78BFA"][
                      Math.floor(Math.random() * 5)
                    ],
                  }}
                />
              ))}

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#F5C542]/20 ring-4 ring-[#F5C542]/30"
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  />
                </svg>
              </motion.div>
              <h2 className="mt-5 text-2xl font-bold">You&apos;re checked in!</h2>
              {campaign && (
                <p className="mt-2 font-semibold text-[#F5C542]/70">{campaign.title}</p>
              )}
              <p className="mt-3 text-sm text-white/60">See you there!</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
