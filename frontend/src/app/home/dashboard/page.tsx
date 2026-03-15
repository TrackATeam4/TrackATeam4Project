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
  type PanelTab = "volunteers" | "tasks" | "invite" | "impact" | "promote" | "edit";
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditDraft, setTaskEditDraft] = useState({ title: "", description: "", max_assignees: "1" });
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

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
  const [shareCard, setShareCard] = useState<{ flyers: number; families: number; volunteers: number } | null>(null);

  // Promote
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState("");
  const isPromoted = !!campaign.promoted_at;

  // Remind
  const [reminding, setReminding] = useState(false);
  const [remindMsg, setRemindMsg] = useState("");

  // Edit campaign
  const [editDraft, setEditDraft] = useState({
    title: campaign.title,
    description: campaign.description ?? "",
    address: campaign.address ?? "",
    date: campaign.date ?? "",
    start_time: campaign.start_time ?? "",
    end_time: campaign.end_time ?? "",
    max_volunteers: String(campaign.max_volunteers ?? ""),
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [cancelling, setCancelling] = useState(false);

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
      setShareCard({
        flyers: Number(impactDraft.flyers_distributed) || 0,
        families: Number(impactDraft.families_reached) || 0,
        volunteers: Number(impactDraft.volunteers_attended) || 0,
      });
    } catch (e) {
      setImpactMsg(e instanceof Error ? e.message : "Failed to submit report.");
    } finally { setImpactSubmitting(false); }
  };

  const sendReminders = async () => {
    setReminding(true);
    setRemindMsg("");
    try {
      const res = await authFetch<{ sent: number; total: number }>(`/campaigns/${campaign.id}/remind`, { method: "POST" });
      const d = res.data as unknown as { sent: number; total: number };
      setRemindMsg(`Sent ${d?.sent ?? 0} reminder${(d?.sent ?? 0) !== 1 ? "s" : ""} to ${d?.total ?? 0} volunteer${(d?.total ?? 0) !== 1 ? "s" : ""}.`);
    } catch (e) {
      setRemindMsg(e instanceof Error ? e.message : "Failed to send reminders.");
    } finally { setReminding(false); }
  };

  const saveEdit = async () => {
    setEditSaving(true);
    setEditMsg("");
    try {
      const updates: Record<string, unknown> = {
        title: editDraft.title,
        description: editDraft.description || null,
        address: editDraft.address,
        date: editDraft.date,
        start_time: editDraft.start_time,
        end_time: editDraft.end_time,
        max_volunteers: editDraft.max_volunteers ? Number(editDraft.max_volunteers) : null,
      };
      await authFetch(`/campaigns/${campaign.id}`, { method: "PUT", body: JSON.stringify(updates) });
      setEditMsg("Campaign updated successfully!");
    } catch (e) {
      setEditMsg(e instanceof Error ? e.message : "Failed to update campaign.");
    } finally { setEditSaving(false); }
  };

  const cancelCampaign = async () => {
    if (!confirm(`Cancel "${campaign.title}"? This cannot be undone.`)) return;
    setCancelling(true);
    try {
      await authFetch(`/campaigns/${campaign.id}`, { method: "DELETE" });
      setEditMsg("Campaign cancelled.");
    } catch (e) {
      setEditMsg(e instanceof Error ? e.message : "Failed to cancel campaign.");
    } finally { setCancelling(false); }
  };

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setTaskEditDraft({ title: task.title, description: task.description ?? "", max_assignees: String(task.max_assignees) });
  };

  const saveTaskEdit = async (taskId: string) => {
    setSavingTaskId(taskId);
    try {
      const res = await authFetch<Task>(`/tasks/${taskId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: taskEditDraft.title.trim(),
          description: taskEditDraft.description.trim() || null,
          max_assignees: Number(taskEditDraft.max_assignees) || 1,
        }),
      });
      if (res.data) setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...(res.data as unknown as Task) } : t));
      setEditingTaskId(null);
    } catch { /* ignore */ } finally { setSavingTaskId(null); }
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
    { id: "volunteers", label: "Volunteers" },
    { id: "tasks", label: "Tasks" },
    { id: "invite", label: "Invite" },
    { id: "impact", label: "Impact" },
    { id: "promote", label: "Promote" },
    { id: "edit", label: "Edit" },
  ];

  const tabIcon = (id: PanelTab) => {
    if (id === "volunteers") return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
    if (id === "tasks") return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>;
    if (id === "invite") return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>;
    if (id === "impact") return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>;
    if (id === "promote") return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>;
    return <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>;
  };

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
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                Promoted
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
                  className={`relative shrink-0 inline-flex items-center gap-1.5 px-4 py-3 text-xs font-semibold transition ${
                    activeTab === tab.id ? "text-[#1B4332]" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tabIcon(tab.id)}
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div layoutId={`dash-tab-${campaign.id}`} className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#1B4332]" />
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

                  {/* Send Reminder */}
                  {signups.filter((s) => s.status !== "cancelled").length > 0 && (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-blue-800">Send Reminder Email</p>
                          <p className="text-xs text-blue-600 mt-0.5">
                            Remind all active volunteers about this campaign.
                          </p>
                        </div>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          disabled={reminding}
                          onClick={sendReminders}
                          className="shrink-0 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                        >
                          {reminding ? "Sending..." : (
                            <span className="flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                              Send Reminder
                            </span>
                          )}
                        </motion.button>
                      </div>
                      {remindMsg && (
                        <p className={`mt-2 text-xs ${remindMsg.includes("Failed") ? "text-rose-600" : "text-blue-700 font-semibold"}`}>
                          {remindMsg}
                        </p>
                      )}
                    </div>
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
                      {tasks.map((task) =>
                        editingTaskId === task.id ? (
                          <div key={task.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                            <input
                              type="text"
                              value={taskEditDraft.title}
                              onChange={(e) => setTaskEditDraft({ ...taskEditDraft, title: e.target.value })}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
                              placeholder="Task title"
                            />
                            <input
                              type="text"
                              value={taskEditDraft.description}
                              onChange={(e) => setTaskEditDraft({ ...taskEditDraft, description: e.target.value })}
                              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
                              placeholder="Description (optional)"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="1"
                                value={taskEditDraft.max_assignees}
                                onChange={(e) => setTaskEditDraft({ ...taskEditDraft, max_assignees: e.target.value })}
                                className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-emerald-400 focus:outline-none"
                              />
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.97 }}
                                disabled={savingTaskId === task.id}
                                onClick={() => saveTaskEdit(task.id)}
                                className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {savingTaskId === task.id ? "Saving..." : "Save"}
                              </motion.button>
                              <button
                                type="button"
                                onClick={() => setEditingTaskId(null)}
                                className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div key={task.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-slate-700">{task.title}</p>
                              {task.description && <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>}
                              <p className="mt-1 text-xs text-slate-400">Max {task.max_assignees} · {task.assigned_to ? "Assigned" : "Open"}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditTask(task)}
                                className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-gray-50 transition"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={deletingTaskId === task.id}
                                onClick={() => deleteTask(task.id)}
                                className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
                              >
                                {deletingTaskId === task.id ? "..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        )
                      )}

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
                      className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-100"
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
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
                          />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
                        <textarea
                          rows={3}
                          value={impactDraft.notes}
                          onChange={(e) => setImpactDraft({ ...impactDraft, notes: e.target.value })}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none resize-none"
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

              {/* Edit Campaign */}
              {activeTab === "edit" && (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Edit Campaign Details</p>
                  {[
                    { key: "title", label: "Title", type: "text" },
                    { key: "address", label: "Address", type: "text" },
                    { key: "date", label: "Date", type: "date" },
                    { key: "start_time", label: "Start Time", type: "time" },
                    { key: "end_time", label: "End Time", type: "time" },
                    { key: "max_volunteers", label: "Max Volunteers", type: "number" },
                  ].map(({ key, label, type }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
                      <input
                        type={type}
                        min={type === "number" ? "1" : undefined}
                        value={editDraft[key as keyof typeof editDraft]}
                        onChange={(e) => setEditDraft({ ...editDraft, [key]: e.target.value })}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none resize-none"
                      placeholder="Campaign description"
                    />
                  </div>

                  {editMsg && (
                    <p className={`text-xs font-semibold ${editMsg.includes("success") ? "text-emerald-700" : editMsg.includes("cancel") ? "text-slate-500" : "text-rose-600"}`}>
                      {editMsg}
                    </p>
                  )}

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    disabled={editSaving}
                    onClick={saveEdit}
                    className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-100 disabled:opacity-50"
                  >
                    {editSaving ? "Saving..." : "Save Changes"}
                  </motion.button>

                  {/* Danger zone */}
                  <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
                    <p className="text-xs font-semibold text-rose-700 mb-2">Danger Zone</p>
                    <p className="text-xs text-rose-500 mb-3">
                      Cancelling removes this campaign from the public feed and notifies volunteers.
                    </p>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={cancelling}
                      onClick={cancelCampaign}
                      className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
                    >
                      {cancelling ? "Cancelling..." : (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                          Cancel Campaign
                        </span>
                      )}
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Promote */}
              {activeTab === "promote" && (
                <div className="space-y-4">
                  <div className={`rounded-3xl border p-6 text-center ${isPromoted ? "border-amber-200 bg-amber-50" : "border-dashed border-amber-200 bg-amber-50/40"}`}>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
                      <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                    </div>
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

      {/* ── Impact Share Card Overlay ── */}
      <AnimatePresence>
        {shareCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          >
            {/* Confetti dots */}
            {Array.from({ length: 20 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 1, y: 0, x: 0 }}
                animate={{
                  opacity: 0,
                  y: Math.random() * 400 - 100,
                  x: Math.random() * 600 - 300,
                }}
                transition={{ duration: 1.8 + Math.random() * 0.8, ease: "easeOut" }}
                className="pointer-events-none absolute"
                style={{
                  top: `${20 + Math.random() * 60}%`,
                  left: `${10 + Math.random() * 80}%`,
                  width: 8,
                  height: 8,
                  borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                  backgroundColor: ["#FCD34D", "#34D399", "#60A5FA", "#F87171", "#A78BFA", "#FB923C"][
                    Math.floor(Math.random() * 6)
                  ],
                }}
              />
            ))}

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className="relative w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F2D1F] to-[#1B4332] shadow-2xl"
            >
              {/* Header */}
              <div className="px-8 pt-8 pb-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                  <svg className="w-8 h-8 text-[#F5C542]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
                </div>
                <h2 className="mt-3 text-2xl font-bold text-white">We Made an Impact!</h2>
                <p className="mt-1 text-sm font-semibold text-emerald-300">{campaign.title}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 px-6 py-4">
                {[
                  { label: "Flyers", value: shareCard.flyers },
                  { label: "Families", value: shareCard.families },
                  { label: "Volunteers", value: shareCard.volunteers },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl bg-white/10 px-3 py-4 text-center">
                    <AnimatedShareNumber value={value} />
                    <p className="mt-1 text-xs text-emerald-200/70">{label}</p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 px-6 pb-4">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const text = encodeURIComponent(
                      `🍋 Just made an impact with ${campaign.title}! 📄 ${shareCard.flyers} flyers, 👨‍👩‍👧 ${shareCard.families} families, 🙌 ${shareCard.volunteers} volunteers. #volunteer #community`
                    );
                    window.open(`https://bsky.app/intent/compose?text=${text}`, "_blank");
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0085FF] py-3 text-xs font-bold text-white transition hover:bg-[#0066cc]"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 01-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/></svg>
                  Share on Bluesky
                </motion.button>
                <CopyLinkButton campaignId={campaign.id} />
              </div>

              {/* Close */}
              <div className="px-6 pb-8">
                <button
                  type="button"
                  onClick={() => setShareCard(null)}
                  className="w-full rounded-2xl border border-white/20 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10"
                >
                  Celebrate &amp; Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helpers for share card ─────────────────────────────────────────────────────

function AnimatedShareNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 1000;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(ease * value));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <p className="mt-1 text-2xl font-bold text-white">{display.toLocaleString()}</p>;
}

function CopyLinkButton({ campaignId }: { campaignId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={async () => {
        const url = `${window.location.origin}/c/${campaignId}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex-1 rounded-2xl bg-white/10 py-3 text-xs font-bold text-white transition hover:bg-white/20 border border-white/20"
    >
      {copied ? "Copied!" : (
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
          Copy Public Link
        </span>
      )}
    </motion.button>
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

      // Only admins can access the dashboard
      const role = localStorage.getItem("tracka.user_role") ?? "volunteer";
      if (role !== "admin") {
        router.replace("/home");
        return;
      }

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
                className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-[#1B4332]"
              />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-24 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
                <svg className="w-8 h-8 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg>
              </div>
              <p className="mt-4 text-lg font-semibold text-slate-700">No campaigns yet</p>
              <p className="mt-2 text-sm text-slate-400">Create your first campaign to get started.</p>
              <Link
                href="/home/create"
                className="mt-6 inline-block rounded-2xl bg-[#1B4332] px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#163828] transition"
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
