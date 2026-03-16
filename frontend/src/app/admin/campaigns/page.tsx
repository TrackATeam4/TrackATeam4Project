"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

interface Campaign {
  id: string;
  name?: string;
  title?: string;
  status: string;
  created_at?: string;
  date?: string;
  location?: string;
  signup_count?: number;
  max_volunteers?: number;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  published: { label: "Published", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  draft:     { label: "Draft",     dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-600" },
  cancelled: { label: "Cancelled", dot: "bg-rose-500",    badge: "bg-rose-50 text-rose-700" },
  completed: { label: "Completed", dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-700" },
};

const STATUS_OPTIONS = ["draft", "published", "completed", "cancelled"];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await authFetch<{ campaigns: Campaign[] }>(`/admin/campaigns${qs}`);
      const list = res.data?.campaigns ?? (Array.isArray(res.data) ? res.data : []);
      setCampaigns(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this campaign?")) return;
    setCancelling(id);
    try {
      await authFetch(`/admin/campaigns/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      });
      setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, status: "cancelled" } : c));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel campaign.");
    } finally {
      setCancelling(null);
    }
  };

  const statusCounts = STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = campaigns.filter((c) => c.status === s).length;
    return acc;
  }, {});

  const inputCls =
    "rounded-xl border border-yellow-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">Manage all flyering campaigns</p>
        </div>
        <Link
          href="/home/create"
          className="flex items-center gap-2 rounded-xl bg-[#F5C542] px-5 py-2.5 text-sm font-semibold text-[#1A1A1A] shadow-lg shadow-[#F5C542]/30 transition hover:bg-[#E0B63A]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Campaign
        </Link>
      </motion.div>

      {/* Status pill summary */}
      {!loading && campaigns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mt-6 flex flex-wrap gap-2"
        >
          <button
            onClick={() => setStatusFilter("")}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === ""
                ? "border-[#0F172A] bg-[#0F172A] text-white"
                : "border-yellow-100 bg-white text-slate-500 hover:bg-yellow-50"
            }`}
          >
            All · {campaigns.length}
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? "" : s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === s
                  ? `border-transparent ${STATUS_CONFIG[s]?.badge ?? "bg-slate-100 text-slate-600"}`
                  : "border-yellow-100 bg-white text-slate-500 hover:bg-yellow-50"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_CONFIG[s]?.dot ?? "bg-slate-400"}`} />
              {s} · {statusCounts[s] ?? 0}
            </button>
          ))}
        </motion.div>
      )}

      {/* Date filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-yellow-100 bg-white p-4 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-yellow-50 hover:text-slate-600"
          >
            Clear dates
          </button>
        )}
      </motion.div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.45 }}
        className="mt-6 overflow-hidden rounded-2xl border border-yellow-100 bg-white shadow-sm"
      >
        {loading ? (
          <div className="space-y-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-yellow-50 px-6 py-4">
                <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-50">
              <svg className="h-6 w-6 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-400">No campaigns found</p>
            <p className="mt-1 text-xs text-slate-300">Try adjusting the filters or create a new campaign</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-50 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3 font-medium">Campaign</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Location</th>
                  <th className="px-6 py-3 font-medium">Volunteers</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {campaigns.map((c, i) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: i * 0.03, duration: 0.3 }}
                      className="border-b border-yellow-50 last:border-0 transition-colors hover:bg-[#FFFEF5]"
                    >
                      <td className="px-6 py-4">
                        <Link
                          href={`/admin/campaigns/${c.id}`}
                          className="font-medium text-[#0F172A] hover:text-emerald-700 hover:underline"
                        >
                          {c.name || c.title || "Untitled"}
                        </Link>
                        {c.location && (
                          <p className="mt-0.5 text-xs text-slate-400">{c.location}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {c.date || c.created_at
                          ? new Date((c.date || c.created_at)!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-500">{c.location || "—"}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-700">{c.signup_count ?? 0}</span>
                          {c.max_volunteers && (
                            <>
                              <span className="text-slate-300">/</span>
                              <span className="text-slate-400">{c.max_volunteers}</span>
                            </>
                          )}
                        </div>
                        {c.max_volunteers && (
                          <div className="mt-1.5 h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${Math.min(100, ((c.signup_count ?? 0) / c.max_volunteers) * 100)}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/campaigns/${c.id}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
                          >
                            View
                          </Link>
                          {c.status !== "cancelled" && c.status !== "completed" && (
                            <button
                              onClick={() => handleCancel(c.id)}
                              disabled={cancelling === c.id}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                            >
                              {cancelling === c.id ? (
                                <span className="flex items-center gap-1">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />
                                </span>
                              ) : "Cancel"}
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
