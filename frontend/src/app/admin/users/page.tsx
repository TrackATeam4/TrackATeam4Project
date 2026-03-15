"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

interface AdminUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  total_points?: number;
  volunteer_count?: number;
  created_at?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("points");
  const [roleFilter, setRoleFilter] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (sortBy) params.set("sort", sortBy);
      if (roleFilter) params.set("role", roleFilter);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await authFetch<{ users: AdminUser[] }>(`/admin/users${qs}`);
      const list = res.data?.users ?? (Array.isArray(res.data) ? res.data : []);
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [sortBy, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const inputCls =
    "rounded-xl border border-yellow-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";

  const roleBadge = (role?: string) => {
    if (role === "admin") return "bg-purple-100 text-purple-700";
    if (role === "organizer") return "bg-emerald-100 text-emerald-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="px-6 py-8 text-slate-700">
      <h1 className="text-3xl font-bold text-[#0F172A]">Users</h1>
      <p className="mt-1 text-sm text-slate-500">View and manage platform users.</p>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-yellow-100 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Sort by</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={inputCls}>
            <option value="points">Points (high to low)</option>
            <option value="name">Name</option>
            <option value="created_at">Join date</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputCls}>
            <option value="">All</option>
            <option value="admin">Admin</option>
            <option value="organizer">Organizer</option>
            <option value="volunteer">Volunteer</option>
          </select>
        </div>
        <button
          onClick={() => { setSortBy("points"); setRoleFilter(""); }}
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
        ) : users.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Points</th>
                  <th className="px-5 py-3 font-medium">Volunteer Count</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-yellow-50 last:border-0 transition hover:bg-[#FFFEF5]">
                    <td className="px-5 py-4 font-medium text-[#0F172A]">{u.name || "—"}</td>
                    <td className="px-5 py-4 text-slate-500">{u.email || "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${roleBadge(u.role)}`}>
                        {u.role || "volunteer"}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-semibold text-emerald-700">{u.total_points ?? 0}</td>
                    <td className="px-5 py-4 text-slate-500">{u.volunteer_count ?? 0}</td>
                    <td className="px-5 py-4 text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
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
