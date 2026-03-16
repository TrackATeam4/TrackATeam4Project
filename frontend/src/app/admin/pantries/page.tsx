"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";

interface Pantry {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  is_verified?: boolean;
  phone?: string;
  hours?: string | Record<string, string>;
}

export default function AdminPantriesPage() {
  const [pantries, setPantries] = useState<Pantry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState<"all" | "verified" | "unverified">("all");

  useEffect(() => {
    const fetchPantries = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch<{ food_pantries: Pantry[] }>("/admin/food-pantries");
        const list = res.data?.food_pantries ?? (Array.isArray(res.data) ? res.data : []);
        setPantries(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pantries.");
      } finally {
        setLoading(false);
      }
    };
    fetchPantries();
  }, []);

  const handleVerify = async (id: string) => {
    setVerifying(id);
    try {
      await authFetch(`/admin/food-pantries/${id}/verify`, {
        method: "PUT",
        body: JSON.stringify({ is_verified: true }),
      });
      setPantries((prev) => prev.map((p) => p.id === id ? { ...p, is_verified: true } : p));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to verify pantry.");
    } finally {
      setVerifying(null);
    }
  };

  const verifiedCount = pantries.filter((p) => p.is_verified).length;
  const unverifiedCount = pantries.length - verifiedCount;

  const filtered = pantries.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.address?.toLowerCase().includes(search.toLowerCase()));
    const matchFilter = verifiedFilter === "all" || (verifiedFilter === "verified" ? p.is_verified : !p.is_verified);
    return matchSearch && matchFilter;
  });

  const inputCls = "rounded-xl border border-yellow-100 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100";

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <h1 className="text-3xl font-bold text-[#0F172A]">Food Pantries</h1>
        <p className="mt-1 text-sm text-slate-500">Manage and verify food pantry listings</p>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="mt-6 flex flex-wrap gap-3"
      >
        {[
          { label: "Total", value: pantries.length, color: "border-yellow-100 bg-white", textColor: "text-[#0F172A]", labelColor: "text-slate-400" },
          { label: "Verified", value: verifiedCount, color: "border-emerald-100 bg-emerald-50", textColor: "text-emerald-700", labelColor: "text-emerald-600" },
          { label: "Unverified", value: unverifiedCount, color: "border-amber-100 bg-amber-50", textColor: "text-amber-700", labelColor: "text-amber-600" },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ y: -1 }}
            transition={{ duration: 0.2 }}
            className={`rounded-xl border px-5 py-3 shadow-sm ${stat.color}`}
          >
            <p className={`text-xs font-semibold uppercase tracking-wider ${stat.labelColor}`}>{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.textColor}`}>{stat.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-yellow-100 bg-white p-4 shadow-sm"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">Search</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or address…"
              className={`${inputCls} pl-8 w-full`}
            />
          </div>
        </div>
        <div className="flex gap-1.5 rounded-xl border border-yellow-100 bg-[#FFFEF5] p-0.5">
          {(["all", "verified", "unverified"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setVerifiedFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                verifiedFilter === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
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
                <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
                <div className="ml-auto h-5 w-20 animate-pulse rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-50">
              <svg className="h-6 w-6 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-400">No pantries found</p>
            <p className="mt-1 text-xs text-slate-300">Try adjusting the search or filter</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-50 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Address</th>
                  <th className="px-6 py-3 font-medium">Phone</th>
                  <th className="px-6 py-3 font-medium">Hours</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((p, i) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.025, duration: 0.3 }}
                      className="border-b border-yellow-50 last:border-0 transition-colors hover:bg-[#FFFEF5]"
                    >
                      <td className="px-6 py-4 font-medium text-[#0F172A]">{p.name}</td>
                      <td className="max-w-[220px] truncate px-6 py-4 text-slate-500">{p.address || "—"}</td>
                      <td className="px-6 py-4 text-slate-500">{p.phone || "—"}</td>
                      <td className="px-6 py-4 text-slate-500">
                        {p.hours && typeof p.hours === "object"
                          ? Object.entries(p.hours).slice(0, 2).map(([day, time]) => (
                              <div key={day} className="text-xs capitalize">{day}: {String(time)}</div>
                            ))
                          : p.hours
                          ? <span className="text-xs">{p.hours}</span>
                          : "—"}
                        {p.hours && typeof p.hours === "object" && Object.keys(p.hours).length > 2 && (
                          <span className="text-xs text-slate-300">+{Object.keys(p.hours).length - 2} more</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {p.is_verified ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            Unverified
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {!p.is_verified && (
                          <button
                            onClick={() => handleVerify(p.id)}
                            disabled={verifying === p.id}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                          >
                            {verifying === p.id ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
                            ) : (
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                            Verify
                          </button>
                        )}
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
