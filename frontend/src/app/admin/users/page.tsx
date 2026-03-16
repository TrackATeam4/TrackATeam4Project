"use client";

import { motion, AnimatePresence } from "framer-motion";
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

function Avatar({ name }: { name?: string }) {
  const letter = name?.charAt(0)?.toUpperCase() ?? "?";
  const colors = [
    "from-emerald-400 to-teal-500",
    "from-blue-400 to-indigo-500",
    "from-amber-400 to-yellow-500",
    "from-rose-400 to-pink-500",
    "from-purple-400 to-violet-500",
  ];
  const color = colors[(letter.charCodeAt(0) ?? 0) % colors.length];
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${color} text-xs font-bold text-white shadow-sm`}>
      {letter}
    </div>
  );
}

function RoleBadge({ role }: { role?: string }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Admin
      </span>
    );
  }
  if (role === "organizer") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Organizer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
      Volunteer
    </span>
  );
}

function PointsBar({ points, max }: { points: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (points / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-right text-sm font-semibold text-emerald-700">{points}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("points");
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");

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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const maxPoints = Math.max(...users.map((u) => u.total_points ?? 0), 1);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  });

  const inputCls = "rounded-xl border border-yellow-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <h1 className="text-3xl font-bold text-[#0F172A]">Users</h1>
        <p className="mt-1 text-sm text-slate-500">View and manage platform members</p>
      </motion.div>

      {/* Stats */}
      {!loading && users.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mt-6 flex flex-wrap gap-3"
        >
          {[
            { label: "Total", value: users.length, color: "border-yellow-100 bg-white" },
            { label: "Admins", value: users.filter(u => u.role === "admin").length, color: "border-purple-100 bg-purple-50", textColor: "text-purple-700" },
            { label: "Volunteers", value: users.filter(u => !u.role || u.role === "volunteer").length, color: "border-emerald-100 bg-emerald-50", textColor: "text-emerald-700" },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-xl border px-4 py-3 ${stat.color}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${stat.textColor ?? "text-slate-400"}`}>{stat.label}</p>
              <p className={`text-xl font-bold ${stat.textColor ?? "text-[#0F172A]"}`}>{stat.value}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-yellow-100 bg-white p-4 shadow-sm"
      >
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Search</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email…"
              className={`${inputCls} pl-8 w-full`}
            />
          </div>
        </div>
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
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="organizer">Organizer</option>
            <option value="volunteer">Volunteer</option>
          </select>
        </div>
        {(roleFilter || search) && (
          <button
            onClick={() => { setSortBy("points"); setRoleFilter(""); setSearch(""); }}
            className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-yellow-50 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </motion.div>

      {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.45 }}
        className="mt-6 overflow-hidden rounded-2xl border border-yellow-100 bg-white shadow-sm"
      >
        {loading ? (
          <div className="space-y-0">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-yellow-50 px-6 py-4">
                <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
                <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-44 animate-pulse rounded bg-slate-100" />
                <div className="ml-auto h-5 w-20 animate-pulse rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
              <svg className="h-6 w-6 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-400">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-50 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Points</th>
                  <th className="px-6 py-3 font-medium">Campaigns</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((u, i) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.025, duration: 0.3 }}
                      className="border-b border-yellow-50 last:border-0 transition-colors hover:bg-[#FFFEF5]"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} />
                          <div className="min-w-0">
                            <p className="font-medium text-[#0F172A]">{u.name || "—"}</p>
                            <p className="text-xs text-slate-400">{u.email || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-6 py-4">
                        <PointsBar points={u.total_points ?? 0} max={maxPoints} />
                      </td>
                      <td className="px-6 py-4 text-slate-500">{u.volunteer_count ?? 0}</td>
                      <td className="px-6 py-4 text-slate-500">
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "—"}
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
