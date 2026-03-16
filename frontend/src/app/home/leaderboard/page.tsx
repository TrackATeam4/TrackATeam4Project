"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import HomeSidebar from "@/components/home/HomeSidebar";
import { supabase } from "@/lib/supabase";

type LeaderboardEntry = {
  rank: number;
  user: { id: string; name: string };
  total_points: number;
  level: { level: number; name: string };
  badge_count: number;
};

type LeaderboardScope = "global" | "nearby";
type LeaderboardPeriod = "all_time" | "monthly" | "weekly";

const parseEntries = (payload: unknown): LeaderboardEntry[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const data = (root.data ?? root) as unknown;
  if (Array.isArray(data)) return data as LeaderboardEntry[];
  if (data && typeof data === "object") {
    const maybeEntries = (data as Record<string, unknown>).entries;
    if (Array.isArray(maybeEntries)) return maybeEntries as LeaderboardEntry[];
  }
  return [];
};

const MEDAL = ["🥇", "🥈", "🥉"] as const;
const MEDAL_BG = [
  "bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200",
  "bg-gradient-to-br from-gray-50 to-slate-100 border-gray-200",
  "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200",
];
const MEDAL_TEXT = ["text-amber-600", "text-slate-500", "text-orange-500"];
const AVATAR_COLORS = [
  "from-[#F5C542] to-[#E5A800]",
  "from-[#F5C542] to-[#E0B63A]",
  "from-violet-400 to-purple-500",
  "from-rose-400 to-pink-500",
  "from-sky-400 to-blue-500",
];

export default function HomeLeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [period, setPeriod] = useState<LeaderboardPeriod>("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchNearby = useCallback(async (): Promise<LeaderboardEntry[]> => {
    if (!navigator.geolocation) throw new Error("Geolocation not supported.");
    const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p.coords),
        () => reject(new Error("Location permission required.")),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
    const res = await authFetch<LeaderboardEntry[]>(
      `/leaderboard/nearby?lat=${coords.latitude}&lng=${coords.longitude}&radius_km=20`
    );
    return parseEntries(res);
  }, []);

  const fetchGlobal = useCallback(async (): Promise<LeaderboardEntry[]> => {
    const res = await authFetch<LeaderboardEntry[]>(`/leaderboard?scope=global&period=${period}`);
    return parseEntries(res);
  }, [period]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push("/auth"); return; }
        const next = scope === "nearby" ? await fetchNearby() : await fetchGlobal();
        setEntries(next);
      } catch (e) {
        setEntries([]);
        setError(e instanceof Error ? e.message : "Unable to load leaderboard.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [fetchGlobal, fetchNearby, router, scope]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <>
      <HomeSidebar />
      <main className="min-h-screen bg-[#FFF8E1] px-6 py-10 text-[#1A1A1A] md:ml-24 lg:ml-72">
        <div className="mx-auto max-w-3xl space-y-6">

          {/* Header */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">Community Rankings</p>
            <h1 className="mt-1 text-3xl font-bold text-[#111827]">Leaderboard</h1>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl border border-gray-200 bg-white p-1">
              {(["global", "nearby"] as LeaderboardScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${
                    scope === s ? "bg-[#F5C542] text-[#111827]" : "text-[#6B7280] hover:text-[#111827]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            {scope === "global" && (
              <div className="flex rounded-xl border border-gray-200 bg-white p-1">
                {(["weekly", "monthly", "all_time"] as LeaderboardPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      period === p ? "bg-[#1B4332] text-white" : "text-[#6B7280] hover:text-[#111827]"
                    }`}
                  >
                    {p.replace("_", " ")}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          {loading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-[#9CA3AF]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#1B4332]" />
              <p className="text-sm">Loading rankings…</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-3xl border border-gray-100 bg-white px-6 py-12 text-center">
              <p className="text-3xl">🏆</p>
              <p className="mt-3 text-sm text-[#6B7280]">No rankings yet — join campaigns to earn points!</p>
            </div>
          ) : (
            <>
              {/* Top 3 podium cards */}
              {top3.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {top3.map((entry, i) => (
                    <div
                      key={`top-${entry.rank}-${entry.user.id}`}
                      className={`relative flex flex-col items-center gap-2 rounded-2xl border p-5 ${MEDAL_BG[i]}`}
                    >
                      <span className="text-2xl">{MEDAL[i]}</span>
                      <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} text-sm font-bold text-white shadow-sm`}>
                        {entry.user.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-bold text-[#111827] text-center leading-tight">{entry.user.name}</p>
                      <p className={`text-xs font-semibold ${MEDAL_TEXT[i]}`}>{entry.total_points.toLocaleString()} pts</p>
                      <p className="text-[10px] text-[#9CA3AF]">Lv {entry.level.level} · {entry.level.name}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Remaining entries */}
              {rest.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                  {/* Header row */}
                  <div className="grid grid-cols-[56px_1fr_100px_80px] gap-2 border-b border-gray-100 bg-[#FFFEF5] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#9CA3AF]">
                    <span>Rank</span>
                    <span>Volunteer</span>
                    <span>Points</span>
                    <span>Badges</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {rest.map((entry, i) => (
                      <div
                        key={`${entry.rank}-${entry.user.id}`}
                        className="grid grid-cols-[56px_1fr_100px_80px] items-center gap-2 px-4 py-3 transition hover:bg-[#FFFBEB]"
                      >
                        <span className="text-sm font-bold text-[#6B7280]">#{entry.rank}</span>
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_COLORS[(i + 3) % AVATAR_COLORS.length]} text-xs font-bold text-white`}>
                            {entry.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#111827]">{entry.user.name}</p>
                            <p className="text-[10px] text-[#9CA3AF]">Lv {entry.level.level} · {entry.level.name}</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[#1B4332]">{entry.total_points.toLocaleString()}</span>
                        <span className="text-sm text-[#6B7280]">{entry.badge_count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
