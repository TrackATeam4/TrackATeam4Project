"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

interface Pantry {
  id: string;
  is_verified?: boolean;
}

interface CampaignSummary {
  id: string;
  target_flyers?: number;
}

type TrendPeriod = "weekly" | "monthly";
type MapboxMap = import("mapbox-gl").Map;
type MapboxMarker = import("mapbox-gl").Marker;
type MapboxModule = typeof import("mapbox-gl")["default"];

const MAPBOX_TOKEN = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim();

const formatDelta = (current: number, previous: number) => {
  const delta = current - previous;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toLocaleString()} vs last period`;
};

const secsAgo = (at: Date | null) => {
  if (!at) return "-";
  const seconds = Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000));
  return `${seconds}s ago`;
};

export default function AdminHomePage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const impactMarkersRef = useRef<MapboxMarker[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trendBuckets, setTrendBuckets] = useState<TrendBucket[]>([]);
  const [impactPoints, setImpactPoints] = useState<ImpactPoint[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("weekly");
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clock, setClock] = useState(0);

  const [todayActiveCampaigns, setTodayActiveCampaigns] = useState(0);
  const [potentialReachToday, setPotentialReachToday] = useState(0);
  const [unverifiedPantries, setUnverifiedPantries] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setClock((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    const initMap = async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !mapContainerRef.current) return;

      const fallbackCenter: [number, number] = impactPoints.length
        ? [impactPoints[0].longitude, impactPoints[0].latitude]
        : [-74.006, 40.7128];

      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: fallbackCenter,
        zoom: 10,
      });

      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });

      mapRef.current = map;
    };

    void initMap();

    return () => {
      cancelled = true;
      impactMarkersRef.current.forEach((m) => m.remove());
      impactMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [impactPoints]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapReady || !mapRef.current) return;

    const renderImpactMarkers = async () => {
      const mapboxgl: MapboxModule = (await import("mapbox-gl")).default;
      const map = mapRef.current;
      if (!map) return;

      impactMarkersRef.current.forEach((m) => m.remove());
      impactMarkersRef.current = [];

      const validPoints = impactPoints.filter(
        (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
      );
      if (!validPoints.length) return;

      const bounds = new mapboxgl.LngLatBounds(
        [validPoints[0].longitude, validPoints[0].latitude],
        [validPoints[0].longitude, validPoints[0].latitude]
      );

      for (const point of validPoints) {
        const size = Math.max(12, Math.min(28, 12 + Math.sqrt(Math.max(0, point.families_reached))));
        const markerEl = document.createElement("div");
        markerEl.className = "rounded-full border border-white/70 bg-amber-400/85 shadow-[0_0_18px_rgba(251,191,36,0.55)]";
        markerEl.style.width = `${size}px`;
        markerEl.style.height = `${size}px`;
        markerEl.style.cursor = "pointer";

        const popup = new mapboxgl.Popup({ offset: 18, className: "tracka-popup" }).setHTML(
          `<div style="font-family:system-ui;min-width:200px;padding:4px 2px">
            <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${point.title || "Untitled"}</div>
            <div style="font-size:12px;color:#475569;margin-bottom:3px">Families: ${point.families_reached.toLocaleString()}</div>
            <div style="font-size:12px;color:#475569">Flyers: ${point.flyers_distributed.toLocaleString()}</div>
          </div>`
        );

        const marker = new mapboxgl.Marker({ element: markerEl, anchor: "center" })
          .setLngLat([point.longitude, point.latitude])
          .setPopup(popup)
          .addTo(map);

        impactMarkersRef.current.push(marker);
        bounds.extend([point.longitude, point.latitude]);
      }

      if (validPoints.length === 1) {
        map.flyTo({ center: [validPoints[0].longitude, validPoints[0].latitude], zoom: 11, duration: 700 });
      } else {
        map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 12 });
      }
    };

    void renderImpactMarkers();
  }, [impactPoints, mapReady]);

  const fetchData = useCallback(async () => {
    setError("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [overviewRes, trendsRes, impactRes, pantryRes, todayCampaignRes] = await Promise.all([
        authFetch<Overview>("/admin/analytics/overview"),
        authFetch<TrendsResponse>(`/admin/analytics/trends?period=${trendPeriod}`),
        authFetch<ImpactMapResponse>("/admin/analytics/impact-map"),
        authFetch<{ food_pantries: Pantry[] }>("/admin/food-pantries"),
        authFetch<{ campaigns: CampaignSummary[] }>(
          `/admin/campaigns?status=published&date_from=${today}&date_to=${today}`
        ),
      ]);

      const pantries = pantryRes.data?.food_pantries ?? [];
      const todaysCampaigns = todayCampaignRes.data?.campaigns ?? [];

      setOverview(overviewRes.data);
      setTrendBuckets(trendsRes.data?.buckets ?? []);
      setImpactPoints(impactRes.data?.points ?? []);
      setTodayActiveCampaigns(todaysCampaigns.length);
      setPotentialReachToday(
        todaysCampaigns.reduce((sum, c) => sum + (Number(c.target_flyers) || 0), 0)
      );
      setUnverifiedPantries(pantries.filter((p) => !p.is_verified).length);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data.");
    }
  }, [trendPeriod]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const chartData = trendBuckets.map((b) => ({
    name: b.label,
    Campaigns: b.campaigns_created,
    Signups: b.new_signups,
    Flyers: b.flyers_distributed,
  }));

  const currentBucket = trendBuckets[trendBuckets.length - 1] ?? null;
  const previousBucket = trendBuckets[trendBuckets.length - 2] ?? null;

  const deltaSummary = useMemo(() => {
    if (!currentBucket || !previousBucket) {
      return {
        campaigns: "No comparison yet",
        signups: "No comparison yet",
        flyers: "No comparison yet",
      };
    }

    return {
      campaigns: formatDelta(currentBucket.campaigns_created, previousBucket.campaigns_created),
      signups: formatDelta(currentBucket.new_signups, previousBucket.new_signups),
      flyers: formatDelta(currentBucket.flyers_distributed, previousBucket.flyers_distributed),
    };
  }, [currentBucket, previousBucket]);

  const statCards = overview
    ? [
        {
          label: "Total Campaigns",
          value: overview.total_campaigns,
          color: "bg-emerald-50 text-emerald-700",
          pulse: deltaSummary.campaigns,
        },
        {
          label: "Total Volunteers",
          value: overview.total_volunteers,
          color: "bg-blue-50 text-blue-700",
          pulse: deltaSummary.signups,
        },
        {
          label: "Flyers Distributed",
          value: overview.total_flyers_distributed,
          color: "bg-amber-50 text-amber-700",
          pulse: deltaSummary.flyers,
        },
        {
          label: "Families Reached",
          value: overview.total_families_reached,
          color: "bg-purple-50 text-purple-700",
          pulse: "Impact to date",
        },
        {
          label: "Campaigns This Month",
          value: overview.campaigns_this_month,
          color: "bg-teal-50 text-teal-700",
          pulse: "Current month momentum",
        },
        {
          label: "Active Campaigns",
          value: overview.active_campaigns,
          color: "bg-rose-50 text-rose-700",
          pulse: "Upcoming and live",
        },
      ]
    : [];

  const topImpact = [...impactPoints]
    .sort((a, b) => b.families_reached - a.families_reached)
    .slice(0, 3);

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
      <motion.div
        className="flex flex-wrap items-start justify-between gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Overview Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Campaigns, volunteers, and community impact at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-slate-500">
            Last updated: {secsAgo(lastUpdated)}
          </span>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </motion.div>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <motion.div
        className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        {[
          { label: "Today Active Campaigns", value: todayActiveCampaigns, hint: "Live campaigns running today" },
          { label: "Potential Reach Today", value: potentialReachToday, hint: "Flyers planned across today's campaigns" },
          { label: "Unverified Pantries Pending", value: unverifiedPantries, hint: "Approval queue for admin action" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-yellow-50 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Live Command Center</p>
            <p className="mt-2 text-sm font-medium text-slate-600">{item.label}</p>
            <p className="mt-1 text-3xl font-bold text-[#0C3B2E]">{item.value.toLocaleString()}</p>
            <p className="mt-2 text-xs text-slate-500">{item.hint}</p>
          </div>
        ))}
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.06 }}
            className="rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60"
          >
            <div className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${card.color}`}>
              {card.label}
            </div>
            <p className="mt-3 text-3xl font-bold text-[#0C3B2E]">{card.value.toLocaleString()}</p>
            <p className="mt-2 text-xs text-slate-500">{card.pulse}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="mt-10 rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#0F172A]">Trends</h2>
          <div className="flex rounded-xl border border-yellow-100 bg-[#FFFEF5] p-0.5">
            {(["weekly", "monthly"] as TrendPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setTrendPeriod(p)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
                  trendPeriod === p ? "bg-white text-[#0F172A] shadow-sm" : "text-slate-400 hover:text-slate-600"
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
            No trend data available yet. Run one campaign to generate trend lines.
          </p>
        )}
      </motion.div>

      <motion.div
        className="mt-10 rounded-2xl border border-yellow-100 bg-white p-6 shadow-lg shadow-yellow-100/60"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h2 className="mb-6 text-lg font-semibold text-[#0F172A]">Impact Map</h2>
        {impactPoints.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No impact data available yet. Complete a campaign and submit impact reports.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="relative h-80 overflow-hidden rounded-2xl border border-yellow-100 bg-slate-100">
              {!MAPBOX_TOKEN && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-amber-50/95 px-6 text-center text-sm text-amber-700">
                  Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to render the live impact map.
                </div>
              )}
              <div ref={mapContainerRef} className="h-full w-full" />
              {MAPBOX_TOKEN && (
                <div className="absolute bottom-3 left-3 rounded-lg bg-black/45 px-3 py-2 text-xs text-emerald-100">
                  Live map of campaign impact by coordinates
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-yellow-100 bg-[#FFFEF8] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Top 3 Hotspots</p>
              <div className="mt-3 space-y-3">
                {topImpact.map((point, idx) => (
                  <div key={point.campaign_id} className="rounded-xl border border-yellow-100 bg-white p-3">
                    <p className="text-xs font-semibold text-amber-700">#{idx + 1} Impact Zone</p>
                    <p className="mt-1 text-sm font-semibold text-[#0F172A]">{point.title || "Untitled"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Families: {point.families_reached.toLocaleString()} | Flyers: {point.flyers_distributed.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
      <span className="hidden">{clock}</span>
    </div>
  );
}
