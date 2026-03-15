"use client";

import Link from "next/link";
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

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  /* filters */
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

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleCancel = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this campaign?")) return;
    setCancelling(id);
    try {
      await authFetch(`/admin/campaigns/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      });
      setCampaigns((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: "cancelled" } : c))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel campaign.");
    } finally {
      setCancelling(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      published: "bg-emerald-100 text-emerald-700",
      draft: "bg-slate-100 text-slate-600",
      cancelled: "bg-rose-100 text-rose-700",
      completed: "bg-blue-100 text-blue-700",
    };
    return map[status] ?? "bg-slate-100 text-slate-600";
  };

  const inputCls =
    "rounded-xl border border-yellow-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";

  return (
    <div className="px-6 py-8 text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">Manage all flyering campaigns.</p>
        </div>
        <Link
          href="/home/create"
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-emerald-700"
        >
          + New Campaign
        </Link>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-yellow-100 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputCls}
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </div>
        <button
          onClick={() => { setStatusFilter(""); setDateFrom(""); setDateTo(""); }}
          className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-yellow-50 hover:text-slate-600"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-yellow-100 bg-white shadow-lg shadow-yellow-100/60">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          </div>
        ) : campaigns.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No campaigns found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-medium">Campaign</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Location</th>
                  <th className="px-5 py-3 font-medium">Signups</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-yellow-50 last:border-0 transition hover:bg-[#FFFEF5]">
                    <td className="px-5 py-4 font-medium text-[#0F172A]">
                      <Link href={`/admin/campaigns/${c.id}`} className="hover:text-emerald-700 hover:underline">
                        {c.name || c.title || "Untitled"}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {c.date || c.created_at
                        ? new Date((c.date || c.created_at)!).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{c.location || "—"}</td>
                    <td className="px-5 py-4 text-slate-500">
                      {c.signup_count ?? 0}
                      {c.max_volunteers ? `/${c.max_volunteers}` : ""}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/campaigns/${c.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          View
                        </Link>
                        {c.status !== "cancelled" && (
                          <button
                            onClick={() => handleCancel(c.id)}
                            disabled={cancelling === c.id}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                          >
                            {cancelling === c.id ? "..." : "Cancel"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
