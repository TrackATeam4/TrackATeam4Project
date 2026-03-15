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

  if (Array.isArray(data)) {
    return data as LeaderboardEntry[];
  }

  if (data && typeof data === "object") {
    const maybeEntries = (data as Record<string, unknown>).entries;
    if (Array.isArray(maybeEntries)) {
      return maybeEntries as LeaderboardEntry[];
    }
  }

  return [];
};

export default function HomeLeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [period, setPeriod] = useState<LeaderboardPeriod>("monthly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchNearby = useCallback(async (): Promise<LeaderboardEntry[]> => {
    if (!navigator.geolocation) {
      throw new Error("Geolocation is not supported in this browser.");
    }

    const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position.coords),
        () => reject(new Error("Location permission is required for nearby leaderboard.")),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    const response = await authFetch<LeaderboardEntry[]>(
      `/leaderboard/nearby?lat=${coords.latitude}&lng=${coords.longitude}&radius_km=20`
    );
    return parseEntries(response);
  }, []);

  const fetchGlobal = useCallback(async (): Promise<LeaderboardEntry[]> => {
    const response = await authFetch<LeaderboardEntry[]>(`/leaderboard?scope=global&period=${period}`);
    return parseEntries(response);
  }, [period]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.push("/auth");
          return;
        }

        const nextEntries = scope === "nearby" ? await fetchNearby() : await fetchGlobal();
        setEntries(nextEntries);
      } catch (loadError) {
        setEntries([]);
        setError(loadError instanceof Error ? loadError.message : "Unable to load leaderboard.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [fetchGlobal, fetchNearby, router, scope]);

  return (
    <>
      <HomeSidebar />
      <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700 md:ml-24 lg:ml-72">
        <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-yellow-100 bg-white p-8 shadow-lg shadow-yellow-100/60">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Community Rankings</p>
              <h1 className="mt-1 text-3xl font-bold text-[#0F172A]">Leaderboard</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setScope("global")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  scope === "global"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                }`}
              >
                Global
              </button>
              <button
                type="button"
                onClick={() => setScope("nearby")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  scope === "nearby"
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                }`}
              >
                Nearby
              </button>
            </div>
          </div>

          {scope === "global" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {(["weekly", "monthly", "all_time"] as LeaderboardPeriod[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPeriod(option)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] ${
                    period === option
                      ? "bg-yellow-300 text-slate-800"
                      : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                  }`}
                >
                  {option.replace("_", " ")}
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 overflow-hidden rounded-2xl border border-yellow-100">
            <div className="grid grid-cols-[72px_1fr_130px_160px_120px] gap-3 bg-[#FFFEF5] px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <p>Rank</p>
              <p>Volunteer</p>
              <p>Points</p>
              <p>Level</p>
              <p>Badges</p>
            </div>

            <div className="divide-y divide-yellow-100 bg-white">
              {loading ? (
                <p className="px-4 py-6 text-sm text-slate-500">Loading leaderboard...</p>
              ) : entries.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">No leaderboard entries available.</p>
              ) : (
                entries.map((entry) => (
                  <div
                    key={`${entry.rank}-${entry.user.id}`}
                    className="grid grid-cols-[72px_1fr_130px_160px_120px] items-center gap-3 px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-slate-700">#{entry.rank}</p>
                    <p className="text-sm text-slate-700">{entry.user.name}</p>
                    <p className="text-sm font-semibold text-emerald-700">{entry.total_points}</p>
                    <p className="text-sm text-slate-600">
                      Lv {entry.level.level} - {entry.level.name}
                    </p>
                    <p className="text-sm text-slate-600">{entry.badge_count}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        </div>
      </main>
    </>
  );
}
