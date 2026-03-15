"use client";

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
  hours?: string;
}

export default function AdminPantriesPage() {
  const [pantries, setPantries] = useState<Pantry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);

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
      setPantries((prev) =>
        prev.map((p) => (p.id === id ? { ...p, is_verified: true } : p))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to verify pantry.");
    } finally {
      setVerifying(null);
    }
  };

  const verifiedCount = pantries.filter((p) => p.is_verified).length;
  const unverifiedCount = pantries.length - verifiedCount;

  return (
    <div className="px-6 py-8 text-slate-700">
      <h1 className="text-3xl font-bold text-[#0F172A]">Food Pantries</h1>
      <p className="mt-1 text-sm text-slate-500">Manage and verify food pantry listings.</p>

      {/* Stats */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="rounded-xl border border-yellow-100 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total</span>
          <p className="text-xl font-bold text-[#0F172A]">{pantries.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Verified</span>
          <p className="text-xl font-bold text-emerald-700">{verifiedCount}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">Unverified</span>
          <p className="text-xl font-bold text-amber-700">{unverifiedCount}</p>
        </div>
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
        ) : pantries.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No food pantries found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Address</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Hours</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {pantries.map((p) => (
                  <tr key={p.id} className="border-b border-yellow-50 last:border-0 transition hover:bg-[#FFFEF5]">
                    <td className="px-5 py-4 font-medium text-[#0F172A]">{p.name}</td>
                    <td className="px-5 py-4 text-slate-500">{p.address || "—"}</td>
                    <td className="px-5 py-4 text-slate-500">{p.phone || "—"}</td>
                    <td className="px-5 py-4 text-slate-500">{p.hours || "—"}</td>
                    <td className="px-5 py-4">
                      {p.is_verified ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          Unverified
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {!p.is_verified && (
                        <button
                          onClick={() => handleVerify(p.id)}
                          disabled={verifying === p.id}
                          className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {verifying === p.id ? "Verifying..." : "Verify"}
                        </button>
                      )}
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
