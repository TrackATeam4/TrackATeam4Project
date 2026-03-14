import Link from "next/link";

export default function HomeLeaderboardPage() {
  return (
    <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700">
      <div className="mx-auto max-w-4xl rounded-3xl border border-yellow-100 bg-white p-8 shadow-lg shadow-yellow-100/60">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Route Ready</p>
        <h1 className="mt-2 text-3xl font-bold text-[#0F172A]">Leaderboard</h1>
        <p className="mt-3 text-slate-500">This page is active at /home/leaderboard.</p>
        <Link href="/home" className="mt-6 inline-flex rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
