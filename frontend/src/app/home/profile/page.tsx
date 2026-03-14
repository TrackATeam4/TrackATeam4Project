"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

type LeaderboardEntry = {
  rank: number;
  user?: { id?: string; name?: string };
  total_points?: number;
  level?: { level?: number; name?: string };
  badge_count?: number;
};

type PointsTransaction = {
  action?: string;
  points?: number;
  campaign_title?: string;
  awarded_at?: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const subscribeToStorage = (callback: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getLocalStorageValue = (key: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) || fallback;
};

export default function HomeProfilePage() {
  const router = useRouter();
  const [email, setEmail] = useState(() => getLocalStorageValue("tracka.user_email", "Not available"));
  const [pointsTotal, setPointsTotal] = useState<number | null>(null);
  const [levelName, setLevelName] = useState("-");
  const [levelNumber, setLevelNumber] = useState<number | null>(null);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<PointsTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const userName = useSyncExternalStore(
    subscribeToStorage,
    () => getLocalStorageValue("tracka.signup_name", "Volunteer"),
    () => "Volunteer"
  );

  const parseData = (payload: unknown): Record<string, unknown> => {
    if (!payload || typeof payload !== "object") return {};
    const root = payload as Record<string, unknown>;
    const data = root.data;
    if (data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
    return root;
  };

  const authHeaders = (): HeadersInit => {
    const token = localStorage.getItem("tracka.access_token");
    if (!token) {
      throw new Error("Missing auth token.");
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  useEffect(() => {
    const token = localStorage.getItem("tracka.access_token");
    if (!token) {
      router.push("/auth");
      return;
    }

    const loadProfileData = async () => {
      setLoading(true);
      setError("");

      try {
        const [meRes, pointsRes, levelRes, leaderboardRes] = await Promise.all([
          fetch(`${API_BASE}/auth/me`, { headers: authHeaders() }),
          fetch(`${API_BASE}/me/points`, { headers: authHeaders() }),
          fetch(`${API_BASE}/me/level`, { headers: authHeaders() }),
          fetch(`${API_BASE}/leaderboard?scope=global&period=monthly`, {
            headers: authHeaders(),
          }),
        ]);

        if (meRes.ok) {
          const mePayload = await meRes.json();
          const meData = parseData(mePayload);
          const userNode = (meData.user ?? mePayload.user) as Record<string, unknown> | undefined;
          const nestedUser = (userNode?.user as Record<string, unknown> | undefined) ?? userNode;
          const userEmail =
            typeof nestedUser?.email === "string"
              ? nestedUser.email
              : getLocalStorageValue("tracka.user_email", "Not available");
          setEmail(userEmail);
          if (typeof userEmail === "string" && userEmail !== "Not available") {
            localStorage.setItem("tracka.user_email", userEmail);
          }
        }

        if (pointsRes.ok) {
          const pointsPayload = await pointsRes.json();
          const pointsData = parseData(pointsPayload);
          const total = pointsData.total;
          if (typeof total === "number") {
            setPointsTotal(total);
          }
          if (Array.isArray(pointsData.transactions)) {
            setRecentTransactions(pointsData.transactions as PointsTransaction[]);
          }
        }

        if (levelRes.ok) {
          const levelPayload = await levelRes.json();
          const levelData = parseData(levelPayload);
          const nextLevelName = typeof levelData.name === "string" ? levelData.name : "-";
          const nextLevelNumber = typeof levelData.level === "number" ? levelData.level : null;
          const nextProgress =
            typeof levelData.progress_pct === "number" ? levelData.progress_pct : null;
          setLevelName(nextLevelName);
          setLevelNumber(nextLevelNumber);
          setProgressPct(nextProgress);
        }

        if (leaderboardRes.ok) {
          const leaderboardPayload = await leaderboardRes.json();
          const leaderboardData = parseData(leaderboardPayload);
          const entries = Array.isArray(leaderboardData)
            ? leaderboardData
            : Array.isArray(leaderboardData.entries)
              ? leaderboardData.entries
              : [];
          setLeaderboard(entries as LeaderboardEntry[]);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load profile data.");
      } finally {
        setLoading(false);
      }
    };

    void loadProfileData();
  }, [router]);

  return (
    <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/home" className="inline-flex items-center text-sm text-emerald-700 hover:underline">
          ← Back to Home
        </Link>

        <section className="rounded-3xl border border-yellow-100 bg-white p-8 shadow-lg shadow-yellow-100/60">
          <h1 className="text-3xl font-bold text-[#0F172A]">My Profile</h1>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Name</p>
              <p className="mt-1 text-lg font-semibold text-[#0F172A]">{userName}</p>
            </div>

            <div className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Email</p>
              <p className="mt-1 text-lg font-semibold text-[#0F172A]">{email}</p>
            </div>

            <div className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Reward Points</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {loading ? "..." : pointsTotal ?? "N/A"}
              </p>
            </div>

            <div className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Leaderboard Level</p>
              <p className="mt-1 text-lg font-semibold text-[#0F172A]">
                {loading ? "Loading..." : levelNumber ? `Level ${levelNumber} - ${levelName}` : levelName}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Progress to next level: {loading ? "..." : progressPct !== null ? `${progressPct}%` : "N/A"}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-5">
              <h2 className="text-lg font-semibold text-[#0F172A]">Leaderboard (Monthly)</h2>
              <div className="mt-3 space-y-2">
                {loading ? (
                  <p className="text-sm text-slate-500">Loading leaderboard...</p>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm text-slate-500">No leaderboard data available yet.</p>
                ) : (
                  leaderboard.slice(0, 5).map((entry) => (
                    <div
                      key={`${entry.rank}-${entry.user?.id ?? entry.user?.name ?? "user"}`}
                      className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
                    >
                      <p className="text-sm text-slate-700">
                        #{entry.rank} {entry.user?.name ?? "Volunteer"}
                      </p>
                      <p className="text-sm font-semibold text-emerald-700">
                        {entry.total_points ?? 0} pts
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-5">
              <h2 className="text-lg font-semibold text-[#0F172A]">Recent Reward Activity</h2>
              <div className="mt-3 space-y-2">
                {loading ? (
                  <p className="text-sm text-slate-500">Loading reward history...</p>
                ) : recentTransactions.length === 0 ? (
                  <p className="text-sm text-slate-500">No rewards history yet.</p>
                ) : (
                  recentTransactions.slice(0, 5).map((txn, index) => (
                    <div key={`${txn.action ?? "reward"}-${index}`} className="rounded-xl bg-white px-3 py-2">
                      <p className="text-sm font-medium text-slate-700">{txn.action ?? "reward"}</p>
                      <p className="text-xs text-slate-500">
                        +{typeof txn.points === "number" ? txn.points : 0} pts
                        {txn.campaign_title ? ` - ${txn.campaign_title}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
