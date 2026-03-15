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

const BADGE_META: Record<string, { icon: string; label: string; desc: string }> = {
  impact_100: { icon: "📄", label: "Flyer Hero", desc: "Distributed 100+ flyers" },
  first_signup: { icon: "🌱", label: "First Step", desc: "Joined your first campaign" },
  volunteer_5: { icon: "🙌", label: "Regular", desc: "Volunteered 5 times" },
  organizer: { icon: "🎯", label: "Organizer", desc: "Created your first campaign" },
  top_volunteer: { icon: "⭐", label: "Top Volunteer", desc: "Reached the leaderboard top 10" },
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
    if (data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
    return root;
  };

  useEffect(() => {
    const loadProfileData = async () => {
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
          const userEmail =
            typeof nestedUser?.email === "string"
              ? nestedUser.email
              : getLocalStorageValue("tracka.user_email", "Not available");
          setEmail(userEmail);
          if (typeof userEmail === "string" && userEmail !== "Not available") {
            localStorage.setItem("tracka.user_email", userEmail);
          }
        }

        {
          const pointsData = parseData(pointsPayload);
          const total = pointsData.total;
          if (typeof total === "number") {
            setPointsTotal(total);
          }
          if (Array.isArray(pointsData.transactions)) {
            setRecentTransactions(pointsData.transactions as PointsTransaction[]);
          }
        }

        {
          const levelData = parseData(levelPayload);
          const nextLevelName = typeof levelData.name === "string" ? levelData.name : "-";
          const nextLevelNumber = typeof levelData.level === "number" ? levelData.level : null;
          const nextProgress =
            typeof levelData.progress_pct === "number" ? levelData.progress_pct : null;
          setLevelName(nextLevelName);
          setLevelNumber(nextLevelNumber);
          setProgressPct(nextProgress);
        }

        {
          const leaderboardData = parseData(leaderboardPayload);
          const entries = Array.isArray(leaderboardData)
            ? leaderboardData
            : Array.isArray(leaderboardData.entries)
              ? leaderboardData.entries
              : [];
          setLeaderboard(entries as LeaderboardEntry[]);
        }

        {
          const badgeData = badgesPayload.data ?? [];
          setBadges(badgeData as unknown as Badge[]);
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
    <>
      <HomeSidebar />
  <main className="min-h-screen bg-[#FFF8E1] px-6 py-10 text-[#1A1A1A] md:ml-24 lg:ml-72">
        <div className="mx-auto max-w-5xl space-y-6">
        <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-[#1A1A1A]">My Profile</h1>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-[#FFF8E1] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[#6B7280]">Name</p>
              <p className="mt-1 text-lg font-semibold text-[#1A1A1A]">{userName}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-[#FFF8E1] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[#6B7280]">Email</p>
              <p className="mt-1 text-lg font-semibold text-[#1A1A1A]">{email}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-[#FFF8E1] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[#6B7280]">Reward Points</p>
              <p className="mt-1 text-2xl font-bold text-[#7C3AED]">
                {loading ? "..." : pointsTotal ?? "N/A"}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-[#FFF8E1] p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-[#6B7280]">Leaderboard Level</p>
              <p className="mt-1 text-lg font-semibold text-[#1A1A1A]">
                {loading ? "Loading..." : levelNumber ? `Level ${levelNumber} - ${levelName}` : levelName}
              </p>
              <p className="mt-2 text-sm text-[#6B7280]">
                Progress to next level: {loading ? "..." : progressPct !== null ? `${progressPct}%` : "N/A"}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="mt-6 rounded-2xl border border-gray-200 bg-[#FFF8E1] p-5">
            <h2 className="text-lg font-semibold text-[#0F172A]">Badges Earned</h2>
            {loading ? (
              <p className="mt-3 text-sm text-slate-500">Loading badges...</p>
            ) : badges.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-yellow-200 py-8 text-center">
                <p className="text-2xl">🏅</p>
                <p className="mt-2 text-sm text-slate-400">No badges yet — join campaigns to earn them!</p>
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
                className="mt-3 flex flex-wrap gap-3"
              >
                {badges.map((badge, i) => {
                  const meta = BADGE_META[badge.badge_slug] ?? { icon: "🏅", label: badge.badge_slug, desc: "" };
                  return (
                    <motion.div
                      key={badge.id ?? i}
                      variants={{ hidden: { opacity: 0, scale: 0.7 }, show: { opacity: 1, scale: 1 } }}
                      whileHover={{ scale: 1.06 }}
                      title={meta.desc}
                      className="flex flex-col items-center gap-1.5 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-50 px-4 py-3 shadow-sm cursor-default"
                    >
                      <span className="text-3xl">{meta.icon}</span>
                      <span className="text-xs font-semibold text-amber-800">{meta.label}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-[#FFF8E1] p-5">
              <h2 className="text-lg font-semibold text-[#1A1A1A]">Leaderboard (Monthly)</h2>
              <div className="mt-3 space-y-2">
                {loading ? (
                  <p className="text-sm text-[#6B7280]">Loading leaderboard...</p>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No leaderboard data available yet.</p>
                ) : (
                  leaderboard.slice(0, 5).map((entry) => (
                    <div
                      key={`${entry.rank}-${entry.user?.id ?? entry.user?.name ?? "user"}`}
                      className="flex items-center justify-between rounded-xl bg-[#FFF8E1] px-3 py-2"
                    >
                      <p className="text-sm text-[#1A1A1A]">
                        #{entry.rank} {entry.user?.name ?? "Volunteer"}
                      </p>
                      <p className="text-sm font-semibold text-[#1A1A1A]">
                        {entry.total_points ?? 0} pts
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-[#FFF8E1] p-5">
              <h2 className="text-lg font-semibold text-[#1A1A1A]">Recent Reward Activity</h2>
              <div className="mt-3 space-y-2">
                {loading ? (
                  <p className="text-sm text-[#6B7280]">Loading reward history...</p>
                ) : recentTransactions.length === 0 ? (
                  <p className="text-sm text-[#6B7280]">No rewards history yet.</p>
                ) : (
                  recentTransactions.slice(0, 5).map((txn, index) => (
                    <div key={`${txn.action ?? "reward"}-${index}`} className="rounded-xl bg-[#FFF8E1] px-3 py-2">
                      <p className="text-sm font-medium text-[#1A1A1A]">{txn.action ?? "reward"}</p>
                      <p className="text-xs text-[#6B7280]">
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
    </>
  );
}
