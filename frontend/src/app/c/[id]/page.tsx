"use client";

import { AnimatePresence, motion } from "framer-motion";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import LemonLogo from "@/components/LemonLogo";

const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--display" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--body" });

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  title: string;
  description?: string | null;
  address?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  max_volunteers?: number | null;
  status?: string | null;
  signup_count?: number | null;
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  max_assignees: number;
  assigned_to?: string | null;
};

type Impact = {
  flyers_distributed: number;
  families_reached: number;
  volunteers_attended: number;
  notes?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Animated counter ──────────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(ease * value));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span>{display.toLocaleString()}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PublicCampaignPage() {
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signupCount, setSignupCount] = useState(0);

  const [rsvpState, setRsvpState] = useState<"idle" | "submitting" | "done" | "alreadyDone">("idle");
  const [rsvpName, setRsvpName] = useState("");
  const [rsvpEmail, setRsvpEmail] = useState("");
  const [rsvpError, setRsvpError] = useState("");
  const [copied, setCopied] = useState(false);

  // ── Load data ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const [campaignRes, tasksRes, impactRes] = await Promise.all([
          fetch(`${API_BASE}/campaigns/${id}`).then((r) => r.json()) as Promise<{ success: boolean; data: Campaign }>,
          fetch(`${API_BASE}/campaigns/${id}/tasks`)
            .then((r) => (r.ok ? r.json() : { success: true, data: [] }))
            .catch(() => ({ success: true, data: [] })) as Promise<{ success: boolean; data: Task[] }>,
          fetch(`${API_BASE}/campaigns/${id}/impact`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null) as Promise<{ success: boolean; data: Impact } | null>,
        ]);

        const c = campaignRes.data;
        setCampaign(c);
        setSignupCount(c.signup_count ?? 0);
        setTasks(tasksRes.data ?? []);
        if (impactRes?.data) setImpact(impactRes.data);
      } catch {
        setError("Could not load campaign.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // ── RSVP handler ─────────────────────────────────────────────────────────────

  const handleRsvp = async () => {
    if (!rsvpEmail.trim()) {
      setRsvpError("Please enter your email address.");
      return;
    }
    setRsvpState("submitting");
    setRsvpError("");
    try {
      const res = await fetch(`${API_BASE}/campaigns/${id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: rsvpEmail.trim(), name: rsvpName.trim() || undefined }),
      });
      const json = (await res.json()) as { success?: boolean; message?: string; detail?: string };
      if (!res.ok && res.status !== 201) {
        throw new Error(json.detail ?? "RSVP failed");
      }
      if (json.message === "Already registered") {
        setRsvpState("alreadyDone");
      } else {
        setRsvpState("done");
        setSignupCount((n) => n + 1);
      }
    } catch (e) {
      setRsvpError(e instanceof Error ? e.message : "Something went wrong");
      setRsvpState("idle");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={`${dmSerif.variable} ${dmSans.variable} min-h-screen bg-[#FFFEF5] flex items-center justify-center`} style={{ fontFamily: "var(--body)" }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="h-10 w-10 rounded-full border-4 border-[#F5C542]/40 border-t-[#E0B63A]"
        />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className={`${dmSerif.variable} ${dmSans.variable} min-h-screen bg-[#FFFEF5] flex items-center justify-center px-4`} style={{ fontFamily: "var(--body)" }}>
        <div className="text-center">
          <p className="text-5xl">😕</p>
          <p className="mt-4 text-lg font-semibold text-slate-700">{error || "Campaign not found"}</p>
        </div>
      </div>
    );
  }

  const spotsTotal = Math.max(1, campaign.max_volunteers ?? 10);
  const progress = Math.min(100, Math.round((signupCount / spotsTotal) * 100));

  return (
    <div className={`${dmSerif.variable} ${dmSans.variable} min-h-screen bg-[#FFFEF5]`} style={{ fontFamily: "var(--body)" }}>

      {/* ── Sticky header bar ── */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-[#FFFEF5]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2 text-[#1B4332]">
            <LemonLogo size={26} />
            <span className="text-lg font-bold tracking-tight">Lemontree</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.href : "");
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-[#374151] transition hover:bg-gray-50"
          >
            {copied ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Share</>
            )}
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1B4332] via-[#14532D] to-[#0F3D24] px-6 py-16 md:px-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 70% 40%, #FCD34D 0%, transparent 60%)" }}
        />
        <div className="relative mx-auto max-w-4xl">
          <h1
            className="text-3xl font-bold text-white md:text-5xl leading-tight"
            style={{ fontFamily: "var(--display)" }}
          >
            {campaign.title}
          </h1>
          {campaign.description && (
            <p className="mt-4 text-base leading-relaxed text-[#F5C542]/70 max-w-2xl">
              {campaign.description}
            </p>
          )}

          {/* Info chips */}
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-[#F5C542]/60">
            {campaign.date && (
              <span className="flex items-center gap-1.5">
                <span className="text-yellow-400">📅</span>
                {fmtDate(campaign.date)}
              </span>
            )}
            {(campaign.start_time || campaign.end_time) && (
              <span className="flex items-center gap-1.5">
                <span className="text-yellow-400">🕐</span>
                {fmtTime(campaign.start_time)}{campaign.end_time ? ` – ${fmtTime(campaign.end_time)}` : ""}
              </span>
            )}
            {campaign.address && (
              <span className="flex items-center gap-1.5">
                <span className="text-yellow-400">📍</span>
                {campaign.address}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-8 max-w-sm space-y-2">
            <div className="flex justify-between text-xs text-[#F5C542]/55">
              <span>👥 {signupCount} / {spotsTotal} volunteers joined</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10">
              <motion.div
                className="h-2 rounded-full bg-gradient-to-r from-yellow-400 to-[#F5C542]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">

        {/* ── RSVP Card ── */}
        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
          <h2 className="text-xl font-bold text-[#0F172A]" style={{ fontFamily: "var(--display)" }}>
            Reserve Your Spot
          </h2>

          <AnimatePresence mode="wait">
            {(rsvpState === "done" || rsvpState === "alreadyDone") ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-5 rounded-2xl border border-[#F5C542]/40 bg-[#F5C542]/10 p-6 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F5C542]/10"
                >
                  <span className="text-3xl">✅</span>
                </motion.div>
                <p className="font-bold text-[#8A5A00]">
                  {rsvpState === "alreadyDone" ? "Already registered!" : "You're registered!"}
                </p>
                <p className="mt-1 text-sm text-[#B7791F]">See you at {campaign.title}!</p>
                <a
                  href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(campaign.title)}&dates=${campaign.date?.replace(/-/g, "") ?? ""}/${campaign.date?.replace(/-/g, "") ?? ""}&location=${encodeURIComponent(campaign.address ?? "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block rounded-xl border border-[#F5C542]/50 px-4 py-2 text-xs font-semibold text-[#A66F00] transition hover:bg-[#F5C542]/15"
                >
                  📅 Add to Calendar
                </a>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-5 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Your name</label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={rsvpName}
                    onChange={(e) => setRsvpName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-[#F5C542] focus:outline-none focus:ring-1 focus:ring-[#F5C542]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Email address</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={rsvpEmail}
                    onChange={(e) => setRsvpEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleRsvp(); }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-[#F5C542] focus:outline-none focus:ring-1 focus:ring-[#F5C542]/30"
                  />
                </div>

                {rsvpError && (
                  <p className="text-xs text-rose-600">{rsvpError}</p>
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ scale: 1.02 }}
                  disabled={rsvpState === "submitting"}
                  onClick={handleRsvp}
                  className="w-full rounded-2xl bg-gradient-to-r from-[#F5C542] to-[#E0B63A] py-3.5 text-sm font-bold text-[#1A1A1A] shadow-lg shadow-[#F5C542]/30 disabled:opacity-60"
                >
                  {rsvpState === "submitting" ? "Registering..." : "Join This Campaign →"}
                </motion.button>

                <p className="text-center text-xs text-slate-400">
                  Already have an account?{" "}
                  <Link href="/auth" className="text-[#B7791F] underline underline-offset-2 hover:text-[#A66F00]">
                    Sign in for full features
                  </Link>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Tasks section ── */}
        {tasks.length > 0 && (
          <div>
            <h2 className="mb-4 text-xl font-bold text-[#0F172A]" style={{ fontFamily: "var(--display)" }}>
              Volunteer Tasks
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <p className="font-semibold text-[#0F172A]">{task.title}</p>
                  {task.description && (
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed">{task.description}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-slate-500">
                      {task.max_assignees} {task.max_assignees === 1 ? "spot" : "spots"}
                    </span>
                    {task.assigned_to && (
                      <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-600">
                        Claimed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-yellow-100 bg-yellow-50 px-5 py-4 text-center text-sm text-yellow-800">
              <Link href="/auth" className="font-semibold underline">Sign up</Link> to claim a task and contribute directly.
            </div>
          </div>
        )}

        {/* ── Impact section ── */}
        {impact && (
          <div>
            <h2 className="mb-4 text-xl font-bold text-[#0F172A]" style={{ fontFamily: "var(--display)" }}>
              Campaign Impact
            </h2>
            <div className="rounded-3xl border border-[#F5C542]/30 bg-gradient-to-br from-[#F5C542]/10 to-white p-8">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Flyers Distributed", value: impact.flyers_distributed, icon: "📄", colorClass: "border-[#F5C542]/30 bg-[#F5C542]/10 text-[#A66F00]" },
                  { label: "Families Reached", value: impact.families_reached, icon: "👨‍👩‍👧", colorClass: "border-yellow-100 bg-yellow-50 text-yellow-700" },
                  { label: "Volunteers Attended", value: impact.volunteers_attended, icon: "🙌", colorClass: "border-teal-100 bg-teal-50 text-teal-700" },
                ].map(({ label, value, icon, colorClass }) => (
                  <div
                    key={label}
                    className={`rounded-2xl border p-5 text-center ${colorClass}`}
                  >
                    <p className="text-2xl">{icon}</p>
                    <p className="mt-2 text-3xl font-bold">
                      <AnimatedNumber value={value} />
                    </p>
                    <p className="mt-1 text-xs leading-tight opacity-70">{label}</p>
                  </div>
                ))}
              </div>
              {impact.notes && (
                <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Notes</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{impact.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <footer className="pt-4 pb-8 text-center">
          <p className="text-sm text-slate-400">
            Powered by 🍋 Lemontree
          </p>
        </footer>
      </div>
    </div>
  );
}
