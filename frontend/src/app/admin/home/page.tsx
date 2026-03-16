"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import {
  AreaChart,
  Area,
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
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" as const, delay: i * 0.07 },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

/* ── stat card config ── */
const CARD_CONFIG = [
  {
    key: "total_campaigns",
    label: "Total Campaigns",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
    gradient: "from-emerald-500 to-teal-400",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-100",
  },
  {
    key: "total_volunteers",
    label: "Volunteers",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    gradient: "from-blue-500 to-indigo-400",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-100",
  },
  {
    key: "total_flyers_distributed",
    label: "Flyers Distributed",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    gradient: "from-amber-500 to-yellow-400",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-100",
  },
  {
    key: "total_families_reached",
    label: "Families Reached",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    gradient: "from-purple-500 to-pink-400",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-100",
  },
  {
    key: "campaigns_this_month",
    label: "This Month",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    gradient: "from-teal-500 to-cyan-400",
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-100",
  },
  {
    key: "active_campaigns",
    label: "Active Now",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    gradient: "from-rose-500 to-orange-400",
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-100",
  },
];

/* ── custom tooltip ── */
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-yellow-100 bg-white p-3 shadow-xl shadow-black/5">
      <p className="mb-2 text-xs font-semibold text-slate-500">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="font-medium text-slate-700">{entry.name}:</span>
          <span className="text-slate-500">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/* ── skeleton loader ── */
function Skeleton({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 ${className}`} />
  );
}

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trendBuckets, setTrendBuckets] = useState<TrendBucket[]>([]);
  const [impactPoints, setImpactPoints] = useState<ImpactPoint[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("weekly");
  const [chartType, setChartType] = useState<"area" | "bar">("area");
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

  const chartData = trendBuckets.map((b) => ({
    name: b.label,
    Campaigns: b.campaigns_created,
    Signups: b.new_signups,
    Flyers: b.flyers_distributed,
  }));

  const reportedPoints = impactPoints.filter((p) => p.has_impact_report);
  const totalFlyers = reportedPoints.reduce((s, p) => s + (p.flyers_distributed || 0), 0);
  const totalFamilies = reportedPoints.reduce((s, p) => s + (p.families_reached || 0), 0);

  if (loading && !overview) {
    return (
      <div className="px-6 py-8">
        <Skeleton className="mb-3 h-9 w-64" />
        <Skeleton className="mb-10 h-4 w-80" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="mt-10 h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#0F172A]">Overview</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Community impact across all campaigns
            </p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-xl border border-yellow-100 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm transition hover:bg-yellow-50 hover:text-slate-700"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </motion.div>
      )}

      {/* Stat Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {CARD_CONFIG.map((card, i) => {
          const value = overview ? (overview as unknown as Record<string, number>)[card.key] ?? 0 : 0;
          return (
            <motion.div
              key={card.key}
              variants={fadeUp}
              custom={i}
              className={`group relative overflow-hidden rounded-2xl border ${card.border} bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg`}
            >
              {/* Background glow */}
              <div className={`absolute -right-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br ${card.gradient} opacity-10 blur-xl transition-all duration-300 group-hover:opacity-20`} />

              <div className="relative flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{card.label}</p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={value}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="mt-2 text-3xl font-bold tracking-tight text-[#0C3B2E]"
                    >
                      {value.toLocaleString()}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} text-white shadow-sm`}>
                  {card.icon}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Impact Summary Bar */}
      {reportedPoints.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-6 flex flex-wrap gap-4 rounded-2xl border border-yellow-100 bg-gradient-to-r from-[#FFFEF5] to-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <svg className="h-4 w-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Impact</p>
              <p className="text-sm font-bold text-[#0F172A]">{totalFlyers.toLocaleString()} flyers · {totalFamilies.toLocaleString()} families</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {reportedPoints.length} reports filed
          </div>
        </motion.div>
      )}

      {/* Trends Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
        className="mt-8 rounded-2xl border border-yellow-100 bg-white p-6 shadow-sm"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">Activity Trends</h2>
            <p className="text-xs text-slate-400">Campaign creation, volunteer signups, flyers distributed</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Chart type toggle */}
            <div className="flex rounded-xl border border-yellow-100 bg-[#FFFEF5] p-0.5">
              <button
                onClick={() => setChartType("area")}
                title="Area chart"
                className={`rounded-lg px-3 py-1.5 transition-all ${chartType === "area" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </button>
              <button
                onClick={() => setChartType("bar")}
                title="Bar chart"
                className={`rounded-lg px-3 py-1.5 transition-all ${chartType === "bar" ? "bg-white text-slate-700 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </button>
            </div>
            {/* Period toggle */}
            <div className="flex rounded-xl border border-yellow-100 bg-[#FFFEF5] p-0.5">
              {(["weekly", "monthly"] as TrendPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setTrendPeriod(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                    trendPeriod === p ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {chartData.length > 0 ? (
            <motion.div
              key={`${chartType}-${trendPeriod}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ResponsiveContainer width="100%" height={300}>
                {chartType === "area" ? (
                  <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gCampaigns" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#065F46" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#065F46" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gSignups" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#E5C64A" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#E5C64A" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gFlyers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} />
                    <Area type="monotone" dataKey="Campaigns" stroke="#065F46" strokeWidth={2} fill="url(#gCampaigns)" dot={{ r: 3, fill: "#065F46" }} />
                    <Area type="monotone" dataKey="Signups" stroke="#D4A017" strokeWidth={2} fill="url(#gSignups)" dot={{ r: 3, fill: "#D4A017" }} />
                    <Area type="monotone" dataKey="Flyers" stroke="#0ea5e9" strokeWidth={2} fill="url(#gFlyers)" dot={{ r: 3, fill: "#0ea5e9" }} />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} />
                    <Bar dataKey="Campaigns" fill="#065F46" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="Signups" fill="#E5C64A" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="Flyers" fill="#0ea5e9" radius={[5, 5, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </motion.div>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-16 text-center text-sm text-slate-400"
            >
              No trend data yet — create your first campaign to see activity.
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Impact table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-8 rounded-2xl border border-yellow-100 bg-white shadow-sm"
      >
        <div className="flex items-center justify-between border-b border-yellow-50 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#0F172A]">Campaign Impact</h2>
            <p className="text-xs text-slate-400">Completed campaigns with filed impact reports</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {reportedPoints.length} campaigns
          </span>
        </div>

        {reportedPoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
              <svg className="h-6 w-6 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 0 1 0 10h-2" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-400">No impact data yet</p>
            <p className="mt-1 text-xs text-slate-300">File impact reports after campaigns complete</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-6 py-3 font-medium">Campaign</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Volunteers</th>
                  <th className="px-6 py-3 font-medium">Flyers</th>
                  <th className="px-6 py-3 font-medium">Families</th>
                  <th className="px-6 py-3 font-medium">Report</th>
                </tr>
              </thead>
              <tbody>
                {reportedPoints.map((point, i) => (
                  <motion.tr
                    key={point.campaign_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.65 + i * 0.04, duration: 0.3 }}
                    className="border-t border-yellow-50 transition-colors hover:bg-[#FFFEF5]"
                  >
                    <td className="px-6 py-4 font-medium text-[#0F172A]">{point.title || "Untitled"}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        point.status === "published" ? "bg-emerald-50 text-emerald-700" :
                        point.status === "completed" ? "bg-blue-50 text-blue-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          point.status === "published" ? "bg-emerald-500" :
                          point.status === "completed" ? "bg-blue-500" : "bg-slate-400"
                        }`} />
                        {point.status || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{point.volunteers_attended}</td>
                    <td className="px-6 py-4 font-semibold text-emerald-700">{point.flyers_distributed.toLocaleString()}</td>
                    <td className="px-6 py-4 font-semibold text-amber-600">{point.families_reached.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      {point.has_impact_report ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Filed
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
