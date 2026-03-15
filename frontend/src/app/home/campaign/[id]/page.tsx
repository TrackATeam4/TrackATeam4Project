"use client";

import { AnimatePresence, motion } from "framer-motion";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import HomeSidebar from "@/components/home/HomeSidebar";
import { supabase } from "@/lib/supabase";

const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--display" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--body" });

// ── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  title: string;
  description?: string | null;
  address?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  max_volunteers?: number | null;
  organizer_id?: string | null;
  organizer_name?: string | null;
  status?: string | null;
  promoted_at?: string | null;
  promoted_until?: string | null;
  signup_count?: number | null;
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  max_assignees: number;
  assigned_to?: string | null;
};

type ImpactReport = {
  flyers_distributed: number;
  families_reached: number;
  volunteers_attended: number;
  notes?: string | null;
};

type TabId = "tasks" | "impact" | "calendar" | "checkin";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (v?: string | null) => {
  if (!v) return "TBD";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
};

const fmtTime = (v?: string | null) => {
  if (!v) return "TBD";
  const norm = v.length >= 5 ? v.slice(0, 5) : v;
  const d = new Date(`1970-01-01T${norm}`);
  return Number.isNaN(d.getTime()) ? norm : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

// ── Animated counter ─────────────────────────────────────────────────────────

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

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [calendarUrl, setCalendarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [isJoined, setIsJoined] = useState(false);
  const [signupCount, setSignupCount] = useState(0);
  const [assignedTaskId, setAssignedTaskId] = useState<string | null>(null);
  const [taskLoading, setTaskLoading] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [bskyOpen, setBskyOpen] = useState(false);
  const [bskyText, setBskyText] = useState("");
  const [bskyPosting, setBskyPosting] = useState(false);
  const [bskyMsg, setBskyMsg] = useState("");

  // ── Load all data ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth"); return; }

      setLoading(true);
      setError("");

      try {
        const [campaignRes, tasksRes, joinedRes] = await Promise.all([
          authFetch<Campaign>(`/campaigns/${id}`),
          authFetch<Task[]>(`/campaigns/${id}/tasks`).catch(() => ({ success: true as const, data: [] as Task[] })),
          authFetch<{ id: string }[]>(`/campaigns/joined?limit=100`).catch(() => ({ success: true as const, data: [] as { id: string }[] })),
        ]);

        const c = campaignRes.data as unknown as Campaign;
        setCampaign(c);
        setSignupCount((c as { signup_count?: number | null }).signup_count ?? 0);
        setTasks((tasksRes.data as unknown as Task[]) ?? []);

        const joinedIds = new Set(((joinedRes.data ?? []) as { id: string }[]).map((x) => x.id));
        setIsJoined(joinedIds.has(id));

        // fetch impact + calendar (may 404, swallow)
        const [impactRes, calRes] = await Promise.all([
          authFetch<ImpactReport>(`/campaigns/${id}/impact`).catch(() => null),
          authFetch<{ google_calendar_url: string }>(`/campaigns/${id}/calendar-url`).catch(() => null),
        ]);
        if (impactRes?.data) setImpact(impactRes.data as unknown as ImpactReport);
        if (calRes?.data) setCalendarUrl((calRes.data as unknown as { google_calendar_url: string }).google_calendar_url);

        // find which task this user has assigned (if any)
        // we check signups for this campaign to get task_id
        // simplest: fetch signed-up tasks by checking assigned_to on tasks
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load campaign.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, router]);

  // ── Join / Leave ───────────────────────────────────────────────────────────

  const toggleJoin = async () => {
    setJoinLoading(true);
    const wasJoined = isJoined;
    setIsJoined(!wasJoined);
    setSignupCount((n) => Math.max(0, n + (wasJoined ? -1 : 1)));
    try {
      if (wasJoined) {
        await authFetch(`/campaigns/${id}/signup`, { method: "DELETE" });
      } else {
        await authFetch(`/campaigns/${id}/signup`, { method: "POST" });
      }
    } catch {
      setIsJoined(wasJoined);
      setSignupCount((n) => Math.max(0, n + (wasJoined ? 1 : -1)));
    } finally {
      setJoinLoading(false);
    }
  };

  // ── Claim / Unclaim task ───────────────────────────────────────────────────

  const toggleTaskAssign = async (taskId: string) => {
    if (!isJoined) return;
    setTaskLoading(taskId);
    const isClaimed = assignedTaskId === taskId;
    try {
      if (isClaimed) {
        await authFetch(`/tasks/${taskId}/assign`, { method: "DELETE" });
        setAssignedTaskId(null);
      } else {
        await authFetch(`/tasks/${taskId}/assign`, { method: "POST" });
        setAssignedTaskId(taskId);
      }
    } catch {
      // silent — task may be full
    } finally {
      setTaskLoading(null);
    }
  };

  // ── Bluesky share ─────────────────────────────────────────────────────────

  const openBsky = () => {
    if (!campaign) return;
    setBskyText(`📍 Volunteer at ${campaign.title} on ${fmtDate(campaign.date)} in ${campaign.address ?? "NYC"}! Join us and make a difference. #volunteer #community`);
    setBskyOpen(true);
    setBskyMsg("");
  };

  const postToBsky = async () => {
    setBskyPosting(true);
    setBskyMsg("");
    try {
      await authFetch("/bsky/post", { method: "POST", body: JSON.stringify({ content: bskyText }) });
      setBskyMsg("Posted to Bluesky!");
      setTimeout(() => setBskyOpen(false), 1500);
    } catch (e) {
      setBskyMsg(e instanceof Error ? e.message : "Failed to post.");
    } finally {
      setBskyPosting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const spotsTotal = Math.max(1, campaign?.max_volunteers ?? 10);
  const progress = Math.min(100, Math.round((signupCount / spotsTotal) * 100));

  return (
    <div className={`${dmSerif.variable} ${dmSans.variable} min-h-screen bg-[#FFFEF5]`} style={{ fontFamily: "var(--body)" }}>
      <HomeSidebar />
      <main className="md:ml-24 lg:ml-72">

        {/* ── Back bar ── */}
        <div className="sticky top-0 z-30 border-b border-white/20 bg-[#1B4332]/95 backdrop-blur-sm px-6 py-3 flex items-center gap-3">
          <Link href="/home" className="flex items-center gap-2 text-sm text-emerald-200 hover:text-white transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Feed
          </Link>
          {campaign?.promoted_at && (
            <span className="ml-auto rounded-full bg-amber-400/20 border border-amber-400/40 px-3 py-1 text-xs font-semibold text-amber-300">
              ⚡ Promoted
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-40">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              className="h-10 w-10 rounded-full border-4 border-emerald-200 border-t-emerald-600"
            />
          </div>
        ) : error ? (
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <p className="text-lg font-semibold text-rose-600">{error}</p>
            <Link href="/home" className="mt-4 inline-block text-sm text-emerald-700 underline">
              Go back to feed
            </Link>
          </div>
        ) : campaign ? (
          <>
            {/* ── Hero ── */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[#1B4332] via-[#14532D] to-[#0F3D24] px-6 py-14 md:px-12">
              <div className="pointer-events-none absolute inset-0 opacity-10"
                style={{ backgroundImage: "radial-gradient(circle at 70% 40%, #FCD34D 0%, transparent 60%)" }} />

              <div className="relative mx-auto max-w-3xl">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-300 uppercase tracking-wider">
                    📍 Upcoming Campaign
                  </span>
                  {campaign.status === "published" && (
                    <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      Active
                    </span>
                  )}
                </div>

                <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl" style={{ fontFamily: "var(--display)" }}>
                  {campaign.title}
                </h1>
                {campaign.description && (
                  <p className="mt-3 text-base leading-relaxed text-emerald-100/80 max-w-2xl">
                    {campaign.description}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap gap-4 text-sm text-emerald-100/70">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {fmtDate(campaign.date)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m-4-8a9 9 0 110 18 9 9 0 010-18z" />
                    </svg>
                    {fmtTime(campaign.start_time)} – {fmtTime(campaign.end_time)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {campaign.address ?? "Location TBD"}
                  </span>
                </div>

                {/* Volunteer progress */}
                <div className="mt-8 space-y-2 max-w-sm">
                  <div className="flex justify-between text-xs text-emerald-200/60">
                    <span>👥 {signupCount} / {spotsTotal} volunteers joined</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/10">
                    <motion.div
                      className="h-2 rounded-full bg-gradient-to-r from-yellow-400 to-emerald-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Join + Share buttons */}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <motion.button
                    type="button"
                    onClick={toggleJoin}
                    disabled={joinLoading}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className={`rounded-2xl px-8 py-3 text-sm font-semibold transition shadow-lg ${
                      isJoined
                        ? "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                        : "bg-gradient-to-r from-[#FCD34D] to-[#F59E0B] text-[#1B4332] shadow-amber-900/30"
                    }`}
                  >
                    {joinLoading ? "..." : isJoined ? "✓ You're Joined · Leave" : "Join This Campaign"}
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={openBsky}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    🦋 Share on Bluesky
                  </motion.button>
                </div>
              </div>
            </div>

            {/* ── Tab bar ── */}
            <div className="sticky top-[49px] z-20 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
              <div className="mx-auto max-w-3xl px-6">
                <div className="flex gap-0">
                  {(["tasks", "impact", "calendar", "checkin"] as TabId[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`relative px-5 py-4 text-sm font-medium transition capitalize ${
                        activeTab === tab
                          ? "text-emerald-700"
                          : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {tab === "tasks" ? "📋 Tasks" : tab === "impact" ? "📊 Impact" : tab === "calendar" ? "📅 Calendar" : "📱 Check In"}
                      {activeTab === tab && (
                        <motion.div
                          layoutId="tab-underline"
                          className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-emerald-500"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Tab content ── */}
            <div className="mx-auto max-w-3xl px-6 py-8">
              <AnimatePresence mode="wait">
                {/* Tasks */}
                {activeTab === "tasks" && (
                  <motion.div
                    key="tasks"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    {!isJoined && (
                      <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-sm text-yellow-800">
                        Join this campaign to claim a task and contribute directly.
                      </div>
                    )}
                    {tasks.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-16 text-center">
                        <p className="text-4xl">📋</p>
                        <p className="mt-3 font-semibold text-slate-700">No tasks yet</p>
                        <p className="mt-1 text-sm text-slate-400">The organizer hasn't added tasks yet.</p>
                      </div>
                    ) : (
                      <motion.div
                        initial="hidden"
                        animate="show"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
                        className="space-y-3"
                      >
                        {tasks.map((task) => {
                          const isClaimed = assignedTaskId === task.id;
                          const isFull = !isClaimed && (task.assigned_to !== null) && task.max_assignees <= 1;
                          return (
                            <motion.div
                              key={task.id}
                              variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                              className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                                isClaimed
                                  ? "border-emerald-200 ring-1 ring-emerald-200"
                                  : "border-gray-100 hover:border-gray-200"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <p className="font-semibold text-[#0F172A]">{task.title}</p>
                                  {task.description && (
                                    <p className="mt-1 text-sm leading-relaxed text-slate-500">{task.description}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-slate-500">
                                      Max {task.max_assignees} {task.max_assignees === 1 ? "person" : "people"}
                                    </span>
                                    {isFull && (
                                      <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs text-rose-600">
                                        Full
                                      </span>
                                    )}
                                    {isClaimed && (
                                      <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700">
                                        ✓ Claimed by you
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {isJoined && !isFull && (
                                  <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.95 }}
                                    disabled={taskLoading === task.id}
                                    onClick={() => toggleTaskAssign(task.id)}
                                    className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                                      isClaimed
                                        ? "bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100"
                                        : "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white"
                                    }`}
                                  >
                                    {taskLoading === task.id ? "..." : isClaimed ? "Unclaim" : "Claim Task"}
                                  </motion.button>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {/* Impact */}
                {activeTab === "impact" && (
                  <motion.div
                    key="impact"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {impact ? (
                      <div className="space-y-6">
                        <div className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-8">
                          <h2 className="text-xl font-bold text-[#0F172A]" style={{ fontFamily: "var(--display)" }}>
                            Campaign Impact Report
                          </h2>
                          <div className="mt-6 grid grid-cols-3 gap-4">
                            {[
                              { label: "Flyers Distributed", value: impact.flyers_distributed, icon: "📄", color: "emerald" },
                              { label: "Families Reached", value: impact.families_reached, icon: "👨‍👩‍👧", color: "yellow" },
                              { label: "Volunteers Attended", value: impact.volunteers_attended, icon: "🙌", color: "teal" },
                            ].map(({ label, value, icon, color }) => (
                              <div
                                key={label}
                                className={`rounded-2xl border p-5 text-center ${
                                  color === "emerald"
                                    ? "border-emerald-100 bg-emerald-50"
                                    : color === "yellow"
                                    ? "border-yellow-100 bg-yellow-50"
                                    : "border-teal-100 bg-teal-50"
                                }`}
                              >
                                <p className="text-2xl">{icon}</p>
                                <p className={`mt-2 text-3xl font-bold ${
                                  color === "emerald" ? "text-emerald-700" : color === "yellow" ? "text-yellow-700" : "text-teal-700"
                                }`}>
                                  <AnimatedNumber value={value} />
                                </p>
                                <p className="mt-1 text-xs text-slate-500 leading-tight">{label}</p>
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
                    ) : (
                      <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-20 text-center">
                        <p className="text-5xl">📊</p>
                        <p className="mt-4 font-semibold text-slate-700">No impact report yet</p>
                        <p className="mt-1 text-sm text-slate-400">
                          The organizer will submit a report after the campaign ends.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Calendar */}
                {activeTab === "calendar" && (
                  <motion.div
                    key="calendar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-3xl">
                        📅
                      </div>
                      <h2 className="mt-4 text-xl font-bold text-[#0F172A]">Add to Your Calendar</h2>
                      <p className="mt-2 text-sm text-slate-500">
                        {fmtDate(campaign.date)} · {fmtTime(campaign.start_time)} – {fmtTime(campaign.end_time)}
                      </p>
                      <p className="text-sm text-slate-400">{campaign.address}</p>

                      <div className="mt-8 flex flex-col items-center gap-3">
                        {calendarUrl ? (
                          <a
                            href={calendarUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:from-emerald-600 hover:to-emerald-700"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>
                            </svg>
                            Add to Google Calendar
                          </a>
                        ) : (
                          <div className="text-sm text-slate-400">Calendar link loading...</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-5 py-4 text-sm text-yellow-800">
                      <p className="font-semibold">Campaign Details</p>
                      <ul className="mt-2 space-y-1 text-yellow-700">
                        <li>📅 {fmtDate(campaign.date)}</li>
                        <li>🕐 {fmtTime(campaign.start_time)} – {fmtTime(campaign.end_time)}</li>
                        <li>📍 {campaign.address ?? "Location TBD"}</li>
                        <li>👥 {spotsTotal} volunteer spots</li>
                      </ul>
                    </div>
                  </motion.div>
                )}
                {/* Check In */}
                {activeTab === "checkin" && (
                  <motion.div
                    key="checkin"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    {/* QR Code card */}
                    <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm text-center">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Scan to Check In</p>
                      <div className="flex justify-center">
                        <div className="rounded-2xl border border-gray-200 p-3 shadow-sm inline-block bg-white">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                              typeof window !== "undefined" ? `${window.location.origin}/checkin/${id}` : `/checkin/${id}`
                            )}&color=1B4332&bgcolor=ffffff`}
                            alt="Check-in QR Code"
                            width={220}
                            height={220}
                            className="rounded-xl"
                          />
                        </div>
                      </div>
                      <p className="mt-4 text-sm font-semibold text-[#0F172A]">Show this to volunteers on arrival</p>
                      <p className="mt-1 text-xs text-slate-400">or share the link below</p>
                      <div className="mt-4 flex items-center gap-2 justify-center">
                        <code className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-1.5 text-xs text-slate-600">
                          {typeof window !== "undefined" ? `${window.location.origin}/checkin/${id}` : `/checkin/${id}`}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            const url = typeof window !== "undefined" ? `${window.location.origin}/checkin/${id}` : "";
                            void navigator.clipboard.writeText(url);
                          }}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-gray-50 transition"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    {/* Self check-in button */}
                    {isJoined && (
                      <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-6 text-center">
                        <p className="text-sm text-emerald-700 font-semibold mb-3">You&apos;re signed up — check yourself in when you arrive</p>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={async () => {
                            try {
                              await authFetch(`/campaigns/${id}/checkin`, { method: "POST" });
                            } catch { /* ignore */ }
                          }}
                          className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 py-3 text-sm font-bold text-white shadow-md"
                        >
                          ✓ Check In Now
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : null}

        {/* ── Bluesky share modal ── */}
        <AnimatePresence>
          {bskyOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
              onClick={() => setBskyOpen(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
              >
                <div className="bg-[#0085FF] px-6 py-5">
                  <div className="flex items-center gap-2 text-white">
                    <span className="text-xl">🦋</span>
                    <h3 className="font-bold">Share on Bluesky</h3>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <textarea
                    rows={5}
                    value={bskyText}
                    onChange={(e) => setBskyText(e.target.value)}
                    maxLength={300}
                    className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${bskyText.length > 270 ? "text-rose-500" : "text-slate-400"}`}>
                      {bskyText.length}/300
                    </span>
                    {bskyMsg && (
                      <span className={`text-xs font-semibold ${bskyMsg.startsWith("Posted") ? "text-emerald-600" : "text-rose-500"}`}>
                        {bskyMsg}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBskyOpen(false)}
                      className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={bskyPosting || !bskyText.trim()}
                      onClick={postToBsky}
                      className="flex-1 rounded-2xl bg-[#0085FF] py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50"
                    >
                      {bskyPosting ? "Posting..." : "Post to Bluesky"}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
