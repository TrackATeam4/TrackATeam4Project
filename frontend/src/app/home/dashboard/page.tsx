"use client";

import { AnimatePresence, motion } from "framer-motion";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import HomeSidebar from "@/components/home/HomeSidebar";
import { supabase } from "@/lib/supabase";

const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--display" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--body" });

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string;
  title: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  address?: string | null;
  description?: string | null;
  max_volunteers?: number | null;
  status?: string | null;
  promoted_at?: string | null;
  promoted_until?: string | null;
};

type Signup = {
  id: string;
  user_id: string;
  status: "pending" | "confirmed" | "cancelled";
  joined_at: string;
  task_id?: string | null;
};

type Invitation = {
  id: string;
  email: string;
  status: string;
  created_at: string;
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  max_assignees: number;
  assigned_to?: string | null;
};

type ImpactDraft = {
  flyers_distributed: string;
  families_reached: string;
  volunteers_attended: string;
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (v?: string | null) => {
  if (!v) return "TBD";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const statusColor = (s: string) =>
  s === "confirmed" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
  : s === "cancelled" ? "bg-rose-50 text-rose-600 border-rose-200"
  : s === "accepted" ? "bg-blue-50 text-blue-700 border-blue-200"
  : "bg-amber-50 text-amber-700 border-amber-200";

// ── Campaign panel ─────────────────────────────────────────────────────────────

function CampaignPanel({ campaign }: { campaign: Campaign }) {
  type PanelTab = "volunteers" | "tasks" | "invite" | "impact" | "promote";
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("volunteers");

  // Volunteers
  const [signups, setSignups] = useState<Signup[]>([]);
  const [signupsLoading, setSignupsLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", max_assignees: "1" });
  const [addingTask, setAddingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Invite
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  // Impact
  const [impactDraft, setImpactDraft] = useState<ImpactDraft>({ flyers_distributed: "", families_reached: "", volunteers_attended: "", notes: "" });
  const [impactSubmitting, setImpactSubmitting] = useState(false);
  const [impactMsg, setImpactMsg] = useState("");
  const [impactExists, setImpactExists] = useState(false);

  // Promote
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState("");
  const isPromoted = !!campaign.promoted_at;

  // Load panel data when opened
  useEffect(() => {
    if (!open) return;
    void loadVolunteers();
    void loadTasks();
    void loadInvitations();
    void checkImpact();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadVolunteers = async () => {
    setSignupsLoading(true);
    try {
      const res = await authFetch<Signup[]>(`/campaigns/${campaign.id}/signups`);
      setSignups((res.data as unknown as Signup[]) ?? []);
    } catch { /* organizer only */ } finally { setSignupsLoading(false); }
  };

  const loadTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await authFetch<Task[]>(`/campaigns/${campaign.id}/tasks`);
      setTasks((res.data as unknown as Task[]) ?? []);
    } catch { /* ignore */ } finally { setTasksLoading(false); }
  };

  const loadInvitations = async () => {
    try {
      const res = await authFetch<Invitation[]>(`/campaigns/${campaign.id}/invitations`);
      setInvitations((res.data as unknown as Invitation[]) ?? []);
    } catch { /* ignore */ }
  };

  const checkImpact = async () => {
    try {
      await authFetch(`/campaigns/${campaign.id}/impact`);
      setImpactExists(true);
    } catch { setImpactExists(false); }
  };

  const confirmAttendance = async (userId: string) => {
    setConfirmingId(userId);
    try {
      await authFetch(`/campaigns/${campaign.id}/confirm/${userId}`, { method: "POST" });
      setSignups((prev) => prev.map((s) => s.user_id === userId ? { ...s, status: "confirmed" } : s));
    } catch { /* ignore */ } finally { setConfirmingId(null); }
  };

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    setAddingTask(true);
    try {
      const res = await authFetch<Task>(`/campaigns/${campaign.id}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: newTask.title.trim(), description: newTask.description.trim() || undefined, max_assignees: Number(newTask.max_assignees) || 1 }),
      });
      if (res.data) setTasks((prev) => [...prev, res.data as unknown as Task]);
      setNewTask({ title: "", description: "", max_assignees: "1" });
    } catch { /* ignore */ } finally { setAddingTask(false); }
  };

  const deleteTask = async (taskId: string) => {
    setDeletingTaskId(taskId);
    try {
      await authFetch(`/tasks/${taskId}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch { /* ignore */ } finally { setDeletingTaskId(null); }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSendingInvite(true);
    setInviteMsg("");
    try {
      await authFetch(`/campaigns/${campaign.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      setInviteMsg("Invitation sent!");
      setInviteEmail("");
      void loadInvitations();
    } catch (e) {
      setInviteMsg(e instanceof Error ? e.message : "Failed to send invitation.");
    } finally { setSendingInvite(false); }
  };

  const submitImpact = async () => {
    setImpactSubmitting(true);
    setImpactMsg("");
    try {
      await authFetch(`/campaigns/${campaign.id}/impact`, {
        method: "POST",
        body: JSON.stringify({
          flyers_distributed: Number(impactDraft.flyers_distributed) || 0,
          families_reached: Number(impactDraft.families_reached) || 0,
          volunteers_attended: Number(impactDraft.volunteers_attended) || 0,
          notes: impactDraft.notes.trim() || undefined,
        }),
      });
      setImpactMsg("Impact report submitted! +10 points earned.");
      setImpactExists(true);
    } catch (e) {
      setImpactMsg(e instanceof Error ? e.message : "Failed to submit report.");
    } finally { setImpactSubmitting(false); }
  };

  const promote = async () => {
    setPromoting(true);
    setPromoteMsg("");
    try {
      await authFetch(`/campaigns/${campaign.id}/promote`, { method: "POST" });
      setPromoteMsg("Campaign boosted for 24 hours!");
    } catch (e) {
      setPromoteMsg(e instanceof Error ? e.message : "Already promoted.");
    } finally { setPromoting(false); }
  };

  const tabs: { id: PanelTab; label: string }[] = [
    { id: "volunteers", label: "👥 Volunteers" },
    { id: "tasks", label: "📋 Tasks" },
    { id: "invite", label: "✉️ Invite" },
    { id: "impact", label: "📊 Impact" },
    { id: "promote", label: "⚡ Promote" },
  ];

  const pendingCount = signups.filter((s) => s.status === "pending").length;
  const confirmedCount = signups.filter((s) => s.status === "confirmed").length;

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-5 text-left transition hover:bg-gray-50/60"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-[#0F172A]">{campaign.title}</h3>
            {isPromoted && (
              <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                ⚡ Promoted
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-400">
            {fmtDate(campaign.date)} · {campaign.address ?? "Location TBD"}
          </p>
          {open && (
            <div className="mt-2 flex gap-3 text-xs">
              <span className="rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-amber-700">{pendingCount} pending</span>
              <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-emerald-700">{confirmedCount} confirmed</span>
              <span className="rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-blue-700">{tasks.length} tasks</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/home/campaign/${campaign.id}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-gray-50"
          >
            View →
          </Link>
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-gray-100"
          >
            {/* Tab bar */}
            <div className="flex overflow-x-auto border-b border-gray-100 bg-gray-50/60 px-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative shrink-0 px-4 py-3 text-xs font-semibold transition ${
                    activeTab === tab.id ? "text-emerald-700" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div layoutId={`dash-tab-${campaign.id}`} className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-emerald-500" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Volunteers */}
              {activeTab === "volunteers" && (
                <div className="space-y-2">
                  {signupsLoading ? (
                    <p className="text-sm text-slate-400 py-4 text-center">Loading volunteers...</p>
                  ) : signups.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center">
                      <p className="text-slate-400 text-sm">No volunteers yet</p>
                    </div>
                  ) : (
                    signups.map((signup) => (
                      <div key={signup.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700 font-mono text-xs">{signup.user_id.slice(0, 8)}…</p>
                          <p className="text-xs text-slate-400">{new Date(signup.joined_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColor(signup.status)}`}>
                            {signup.status}
                          </span>
                          {signup.status === "pending" && (
                            <motion.button
                              type="button"
                              whileTap={{ scale: 0.95 }}
                              disabled={confirmingId === signup.user_id}
                              onClick={() => confirmAttendance(signup.user_id)}
                              className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              {confirmingId === signup.user_id ? "..." : "Confirm ✓"}
                            </motion.button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tasks */}
              {activeTab === "tasks" && (
                <div className="space-y-3">
                  {tasksLoading ? (
                    <p className="text-sm text-slate-400 py-4 text-center">Loading tasks...</p>
                  ) : (
                    <>
                      {tasks.map((task) => (
                        <div key={task.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-700">{task.title}</p>
                            {task.description && <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>}
                            <p className="mt-1 text-xs text-slate-400">Max {task.max_assignees} · {task.assigned_to ? "Assigned" : "Open"}</p>
                          </div>
                          <button
                            type="button"
                            disabled={deletingTaskId === task.id}
                            onClick={() => deleteTask(task.id)}
                            className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
                          >
                            {deletingTaskId === task.id ? "..." : "Delete"}
                          </button>
                        </div>
                      ))}

                      {/* Add task form */}
                      <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Add New Task</p>
                        <input
                          type="text"
                          placeholder="Task title"
                          value={newTask.title}
                          onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-100"
                        />
                        <input
                          type="text"
                          placeholder="Description (optional)"
                          value={newTask.description}
                          onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-100"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            placeholder="Max people"
                            value={newTask.max_assignees}
                            onChange={(e) => setNewTask({ ...newTask, max_assignees: e.target.value })}
                            className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
                          />
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            disabled={addingTask || !newTask.title.trim()}
                            onClick={addTask}
                            className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {addingTask ? "Adding..." : "Add Task"}
                          </motion.button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Invite */}
              {activeTab === "invite" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="volunteer@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void sendInvite(); }}
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-100"
                    />
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={sendingInvite || !inviteEmail.trim()}
                      onClick={sendInvite}
                      className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {sendingInvite ? "Sending..." : "Send Invite"}
                    </motion.button>
                  </div>
                  {inviteMsg && (
                    <p className={`text-xs ${inviteMsg.startsWith("Inv") ? "text-emerald-700" : "text-rose-600"}`}>{inviteMsg}</p>
                  )}
                  {invitations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Sent Invitations</p>
                      {invitations.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
                          <span className="text-sm text-slate-600">{inv.email}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusColor(inv.status)}`}>
                            {inv.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Impact */}
              {activeTab === "impact" && (
                <div className="space-y-4">
                  {impactExists ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
                      Impact report already submitted for this campaign.{" "}
                      <Link href={`/home/campaign/${campaign.id}`} className="underline">View on campaign page →</Link>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-slate-500">Submit a post-event impact report to earn +10 points.</p>
                      {[
                        { key: "flyers_distributed", label: "Flyers Distributed" },
                        { key: "families_reached", label: "Families Reached" },
                        { key: "volunteers_attended", label: "Volunteers Attended" },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                          <input
                            type="number"
                            min="0"
                            value={impactDraft[key as keyof ImpactDraft]}
                            onChange={(e) => setImpactDraft({ ...impactDraft, [key]: e.target.value })}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-emerald-400 focus:outline-none"
                          />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
                        <textarea
                          rows={3}
                          value={impactDraft.notes}
                          onChange={(e) => setImpactDraft({ ...impactDraft, notes: e.target.value })}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:border-emerald-400 focus:outline-none resize-none"
                          placeholder="How did the campaign go?"
                        />
                      </div>
                      {impactMsg && (
                        <p className={`text-xs ${impactMsg.includes("+10") ? "text-emerald-700" : "text-rose-600"}`}>{impactMsg}</p>
                      )}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={impactSubmitting}
                        onClick={submitImpact}
                        className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-100 disabled:opacity-50"
                      >
                        {impactSubmitting ? "Submitting..." : "Submit Impact Report"}
                      </motion.button>
                    </>
                  )}
                </div>
              )}

              {/* Promote */}
              {activeTab === "promote" && (
                <div className="space-y-4">
                  <div className={`rounded-3xl border p-6 text-center ${isPromoted ? "border-amber-200 bg-amber-50" : "border-dashed border-amber-200 bg-amber-50/40"}`}>
                    <p className="text-4xl">⚡</p>
                    <h3 className="mt-3 font-bold text-[#0F172A]">
                      {isPromoted ? "Campaign is Promoted" : "Boost This Campaign"}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {isPromoted
                        ? `Promoted until ${fmtDate(campaign.promoted_until)}`
                        : "Promote your campaign for 24 hours to appear at the top of the feed and attract more volunteers."}
                    </p>
                    {!isPromoted && (
                      <>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          whileHover={{ scale: 1.02 }}
                          disabled={promoting}
                          onClick={promote}
                          className="mt-5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-8 py-3 text-sm font-bold text-[#1B4332] shadow-md shadow-amber-100 disabled:opacity-50"
                        >
                          {promoting ? "Boosting..." : "Boost for 24 Hours"}
                        </motion.button>
                        <p className="mt-2 text-xs text-amber-600">One-time boost per campaign</p>
                      </>
                    )}
                    {promoteMsg && (
                      <p className="mt-3 text-xs text-emerald-700 font-semibold">{promoteMsg}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth"); return; }

      try {
        const res = await authFetch<Campaign[]>("/campaigns/mine");
        setCampaigns((res.data as unknown as Campaign[]) ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load your campaigns.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  return (
    <div className={`${dmSerif.variable} ${dmSans.variable} min-h-screen bg-[#FFFEF5]`} style={{ fontFamily: "var(--body)" }}>
      <HomeSidebar />
      <main className="md:ml-24 lg:ml-72 px-6 py-10">
        <div className="mx-auto max-w-3xl">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#0F172A]" style={{ fontFamily: "var(--display)" }}>
              Organizer Dashboard
            </h1>
            <p className="mt-2 text-slate-500">Manage your campaigns, volunteers, tasks, and impact reports.</p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-24">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="h-10 w-10 rounded-full border-4 border-emerald-200 border-t-emerald-600"
              />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-24 text-center">
              <p className="text-5xl">🌱</p>
              <p className="mt-4 text-lg font-semibold text-slate-700">No campaigns yet</p>
              <p className="mt-2 text-sm text-slate-400">Create your first campaign to get started.</p>
              <Link
                href="/home/create"
                className="mt-6 inline-block rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-100"
              >
                Create Campaign
              </Link>
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
              className="space-y-4"
            >
              {campaigns.map((c) => (
                <motion.div
                  key={c.id}
                  variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
                >
                  <CampaignPanel campaign={c} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
