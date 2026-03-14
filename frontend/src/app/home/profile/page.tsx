"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

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
  const userName = useSyncExternalStore(
    subscribeToStorage,
    () => getLocalStorageValue("tracka.signup_name", "Volunteer"),
    () => "Volunteer"
  );

  useEffect(() => {
    const token = localStorage.getItem("tracka.access_token");
    if (!token) {
      router.push("/auth");
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-[#FFFEF5] px-6 py-10 text-slate-700">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/home" className="inline-flex items-center text-sm text-emerald-700 hover:underline">
          ← Back to Home
        </Link>

        <section className="rounded-3xl border border-yellow-100 bg-white p-8 shadow-lg shadow-yellow-100/60">
          <h1 className="text-3xl font-bold text-[#0F172A]">My Profile</h1>
          <p className="mt-2 text-slate-500">This route is now active at /home/profile.</p>

          <div className="mt-6 rounded-2xl border border-yellow-100 bg-[#FFFEF5] p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Name</p>
            <p className="mt-1 text-lg font-semibold text-[#0F172A]">{userName}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
