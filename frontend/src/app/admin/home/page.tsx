"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { authFetch } from "@/lib/api";

/* ── types ── */
interface Overview {
  total_campaigns: number;
  total_volunteers: number;
  total_flyers_distributed: number;
  total_families_reached: number;
  campaigns_this_month: number;
  active_campaigns: number;
}

interface TrendBucket {
  label: string;
  campaigns_created: number;
  new_signups: number;
  flyers_distributed: number;
  families_reached: number;
  points_awarded: number;
}

interface TrendsResponse {
  period: string;
  buckets: TrendBucket[];
}

interface ImpactPoint {
  campaign_id: string;
  title?: string;
  latitude: number;
  longitude: number;
  status?: string;
  date?: string;
  flyers_distributed: number;
  families_reached: number;
  volunteers_attended: number;
  has_impact_report: boolean;
}

interface ImpactMapResponse {
  points: ImpactPoint[];
}

type TrendPeriod = "weekly" | "monthly";

/* ── animation variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: i * 0.08 },
  }),
};

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trendBuckets, setTrendBuckets] = useState<TrendBucket[]>([]);
  const [impactPoints, setImpactPoints] = useState<ImpactPoint[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("weekly");
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, trendsRes, impactRes] = await Promise.all([
        authFetch<Overview>("/admin/analytics/overview"),
        authFetch<TrendsResponse>(`/admin/analytics/trends?period=${trendPeriod}`),
        authFetch<ImpactMapResponse>("/admin/analytics/impact-map"),
      ]);

      setOverview(overviewRes.data);
      setTrendBuckets(trendsRes.data?.buckets ?? []);
      setImpactPoints(impactRes.data?.points ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data.");
    } finally {
      setLoading(false);
    }
  }, [trendPeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── build chart data from trends ── */
  const chartData = trendBuckets.map((b) => ({
    name: b.label,
    Campaigns: b.campaigns_created,
    Signups: b.new_signups,
    Flyers: b.flyers_distributed,
  }));

  /* ── stat cards config ── */
  const statCards = overview
    ? [
        { label: "Total Campaigns", value: overview.total_campaigns, color: "bg-emerald-50 text-emerald-700" },
        { label: "Total Volunteers", value: overview.total_volunteers, color: "bg-blue-50 text-blue-700" },
        { label: "Flyers Distributed", value: overview.total_flyers_distributed, color: "bg-amber-50 text-amber-700" },
        { label: "Families Reached", value: overview.total_families_reached, color: "bg-purple-50 text-purple-700" },
        { label: "Campaigns This Month", value: overview.campaigns_this_month, color: "bg-teal-50 text-teal-700" },
        { label: "Active Campaigns", value: overview.active_campaigns, color: "bg-rose-50 text-rose-700" },
      ]
    : [];

  if (loading && !overview) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600" />
          <p className="text-sm text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 text-slate-700">
      <motion.h1
        className="text-3xl font-bold text-[#0F172A]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        Overview Dashboard
      </motion.h1>
      <p className="mt-2 text-sm text-slate-500">
        Campaigns, volunteers, and community impact at a glance.
      </p>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={i}
            className="rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60"
          >
            <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${card.color}`}>
              {card.label}
            </div>
            <p className="mt-3 text-3xl font-bold text-[#0C3B2E]">
              {card.value.toLocaleString()}
            </p>
          </motion.div>
        ))}
      </div>

      {/* ── Trends Chart ── */}
      <motion.div
        className="mt-10 rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">Trends</h2>
          <div className="flex rounded-xl border border-yellow-100 bg-[#FFFEF5] p-0.5">
            {(["weekly", "monthly"] as TrendPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setTrendPeriod(p)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
                  trendPeriod === p
                    ? "bg-white text-[#0F172A] shadow-sm"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #fef3c7",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
              />
              <Legend />
              <Bar dataKey="Campaigns" fill="#065F46" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Signups" fill="#E5C64A" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Flyers" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-slate-400">
            No trend data available yet.
          </p>
        )}
      </motion.div>

      {/* ── Impact Map ── */}
      <motion.div
        className="mt-10 rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
      >
        <h2 className="mb-6 text-lg font-semibold text-[#0F172A]">Impact Map</h2>
        {impactPoints.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No impact data available yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-yellow-100 text-xs uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pr-4 font-medium">Campaign</th>
                  <th className="pb-3 pr-4 font-medium">Coordinates</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Flyers</th>
                  <th className="pb-3 font-medium">Families</th>
                </tr>
              </thead>
              <tbody>
                {impactPoints.map((point) => (
                  <tr key={point.campaign_id} className="border-b border-yellow-50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-[#0F172A]">{point.title || "Untitled"}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        point.status === "published" ? "bg-emerald-100 text-emerald-700" :
                        point.status === "completed" ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {point.status || "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-semibold text-emerald-700">
                      {point.flyers_distributed.toLocaleString()}
                    </td>
                    <td className="py-3 font-semibold text-amber-700">
                      {point.families_reached.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
