"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { authFetch } from "@/lib/api";
import HomeSidebar from "@/components/home/HomeSidebar";
import { supabase } from "@/lib/supabase";

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

type Badge = {
  id?: string;
  badge_slug: string;
  badge_name?: string;
  awarded_at?: string;
};

const BADGE_META: Record<string, { label: string; desc: string; color: string }> = {
  impact_100:    { label: "Flyer Hero",     desc: "Distributed 100+ flyers",      color: "from-amber-400 to-yellow-300" },
  first_signup:  { label: "First Step",     desc: "Joined your first campaign",    color: "from-emerald-400 to-teal-400" },
  volunteer_5:   { label: "Regular",        desc: "Volunteered 5 times",           color: "from-violet-400 to-purple-400" },
  organizer:     { label: "Organizer",      desc: "Created your first campaign",   color: "from-rose-400 to-pink-400" },
  top_volunteer: { label: "Top Volunteer",  desc: "Reached leaderboard top 10",    color: "from-sky-400 to-blue-400" },
};

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
  const [badges, setBadges] = useState<Badge[]>([]);
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
    if (data && typeof data === "object") return data as Record<string, unknown>;
    return root;
  };

  useEffect(() => {
    const loadProfileData = async () => {
      setLoading(true);
      setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push("/auth"); return; }

        const [mePayload, pointsPayload, levelPayload, leaderboardPayload, badgesPayload] = await Promise.all([
          authFetch<Record<string, unknown>>("/auth/me"),
          authFetch<Record<string, unknown>>("/me/points"),
          authFetch<Record<string, unknown>>("/me/level"),
          authFetch<Record<string, unknown>>("/leaderboard?scope=global&period=monthly"),
          authFetch<Badge[]>("/me/badges").catch(() => ({ success: true as const, data: [] as Badge[] })),
        ]);

        {
          const meData = parseData(mePayload);
          const userNode = meData.user as Record<string, unknown> | undefined;
          const nestedUser = (userNode?.user as Record<string, unknown> | undefined) ?? userNode;
          const userEmail = typeof nestedUser?.email === "string" ? nestedUser.email : getLocalStorageValue("tracka.user_email", "Not available");
          setEmail(userEmail);
          if (typeof userEmail === "string" && userEmail !== "Not available") {
            localStorage.setItem("tracka.user_email", userEmail);
          }
        }

        {
          const pointsData = parseData(pointsPayload);
          if (typeof pointsData.total === "number") setPointsTotal(pointsData.total);
          if (Array.isArray(pointsData.transactions)) setRecentTransactions(pointsData.transactions as PointsTransaction[]);
        }

        {
          const levelData = parseData(levelPayload);
          setLevelName(typeof levelData.name === "string" ? levelData.name : "-");
          setLevelNumber(typeof levelData.level === "number" ? levelData.level : null);
          setProgressPct(typeof levelData.progress_pct === "number" ? levelData.progress_pct : null);
        }

        {
          const leaderboardData = parseData(leaderboardPayload);
          const entries = Array.isArray(leaderboardData) ? leaderboardData : Array.isArray(leaderboardData.entries) ? leaderboardData.entries : [];
          setLeaderboard(entries as LeaderboardEntry[]);
        }

        setBadges((badgesPayload.data ?? []) as unknown as Badge[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unable to load profile data.");
      } finally {
        setLoading(false);
      }
    };
    void loadProfileData();
  }, [router]);

  return (
    <>
      <HomeSidebar />
      <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-[#111827] md:ml-[68px] lg:ml-72">
        <div className="mx-auto max-w-4xl space-y-6">

          {/* Profile hero */}
          <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="h-24 bg-gradient-to-r from-[#1B4332] to-[#2D6A4F]" />
            <div className="px-8 pb-8">
              <div className="-mt-10 flex items-end gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F5C542] to-[#F97316] text-3xl font-bold text-white shadow-md ring-4 ring-white">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="mb-1">
                  <h1 className="text-2xl font-bold text-[#111827]">{userName}</h1>
                  <p className="text-sm text-[#6B7280]">{email}</p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          {/* Stats row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Reward Points</p>
              <p className="mt-2 text-3xl font-bold text-[#1B4332]">
                {loading ? "—" : (pointsTotal ?? 0).toLocaleString()}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Level</p>
                {levelNumber && (
                  <span className="rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-xs font-bold text-[#B45309]">
                    Lv {levelNumber}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-lg font-bold text-[#111827]">
                {loading ? "—" : levelName}
              </p>
              {progressPct !== null && !loading && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-[#9CA3AF] mb-1">
                    <span>Progress to next level</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#F5C542] to-[#F97316]"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-[#111827]">Badges Earned</h2>
            {loading ? (
              <div className="mt-4 flex gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 w-24 animate-pulse rounded-2xl bg-gray-100" />
                ))}
              </div>
            ) : badges.length === 0 ? (
              <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-gray-200 py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-2xl">🏅</div>
                <p className="text-sm text-[#6B7280]">No badges yet — join campaigns to earn them!</p>
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
                className="mt-4 flex flex-wrap gap-3"
              >
                {badges.map((badge, i) => {
                  const meta = BADGE_META[badge.badge_slug] ?? { label: badge.badge_slug, desc: "", color: "from-gray-400 to-gray-500" };
                  return (
                    <motion.div
                      key={badge.id ?? i}
                      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                      whileHover={{ y: -2 }}
                      title={meta.desc}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-[#FFFEF5] px-5 py-3.5 shadow-sm cursor-default"
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${meta.color} text-white text-lg font-bold shadow-sm`}>
                        {meta.label.charAt(0)}
                      </div>
                      <span className="text-xs font-semibold text-[#374151]">{meta.label}</span>
                      <span className="text-[10px] text-[#9CA3AF] text-center leading-tight">{meta.desc}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>

          {/* Leaderboard + Activity */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-[#111827]">Monthly Leaderboard</h2>
              <div className="mt-4 space-y-2">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" />)}
                  </div>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm text-[#9CA3AF]">No data yet.</p>
                ) : (
                  leaderboard.slice(0, 5).map((entry) => (
                    <div
                      key={`${entry.rank}-${entry.user?.id ?? entry.user?.name ?? "user"}`}
                      className="flex items-center gap-3 rounded-xl bg-[#FFFEF5] px-3 py-2.5"
                    >
                      <span className="w-6 text-center text-xs font-bold text-[#6B7280]">#{entry.rank}</span>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#F5C542] to-[#F97316] text-xs font-bold text-white">
                        {(entry.user?.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <p className="flex-1 text-sm text-[#111827]">{entry.user?.name ?? "Volunteer"}</p>
                      <p className="text-xs font-semibold text-[#1B4332]">{(entry.total_points ?? 0).toLocaleString()} pts</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-[#111827]">Recent Activity</h2>
              <div className="mt-4 space-y-2">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" />)}
                  </div>
                ) : recentTransactions.length === 0 ? (
                  <p className="text-sm text-[#9CA3AF]">No reward history yet.</p>
                ) : (
                  recentTransactions.slice(0, 5).map((txn, index) => (
                    <div key={`${txn.action ?? "reward"}-${index}`} className="flex items-center gap-3 rounded-xl bg-[#FFFEF5] px-3 py-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-[#111827]">{txn.action ?? "Reward"}</p>
                        {txn.campaign_title && <p className="truncate text-[10px] text-[#9CA3AF]">{txn.campaign_title}</p>}
                      </div>
                      <p className="text-xs font-bold text-emerald-600">+{typeof txn.points === "number" ? txn.points : 0}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </>
  );
}
