"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const navItems = [
  { label: "Feed", icon: "🏠", href: "/home" },
  { label: "Discover", icon: "🗺️", href: "/home/discover" },
  { label: "Create Campaign", icon: "➕", href: "/home/create" },
  { label: "Campaign Builder", icon: "🤖", href: "/chat" },
  { label: "Leaderboard", icon: "📊", href: "/home/leaderboard" },
  { label: "My Profile", icon: "👤", href: "/home/profile" },
];

const subscribeToStorage = (callback: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getLocalStorageValue = (key: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) || fallback;
};

export default function HomeSidebar() {
  const pathname = usePathname();
  const userName = useSyncExternalStore(
    subscribeToStorage,
    () => getLocalStorageValue("tracka.signup_name", "Volunteer"),
    () => "Volunteer"
  );

  const isActiveRoute = (href: string) => {
    if (href === "/home") return pathname === "/home";
    return pathname.startsWith(href);
  };

  return (
    <>
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 flex-col bg-[#1B4332] px-6 py-8 text-white lg:flex">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xl font-bold">
            <span className="text-[28px]">🍋</span>
            Lemontree
          </div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-400/60">Volunteer Hub</p>
        </div>

        <nav className="mt-10 flex flex-1 flex-col gap-2 text-sm">
          {navItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`relative flex items-center gap-3 rounded-xl px-4 py-3 transition ${
                  isActive
                    ? "bg-gradient-to-r from-emerald-500/20 to-transparent text-white font-semibold"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {isActive ? (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#FCD34D]" />
                ) : null}
                <span className="text-[20px]">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6">
          <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#FCD34D] to-[#10B981] text-sm font-semibold text-[#1B4332]">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{userName}</p>
              <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-xs text-emerald-200">
                Volunteer
              </span>
            </div>
          </div>
        </div>
      </aside>

      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-24 flex-col bg-[#1B4332] px-3 py-8 md:flex lg:hidden">
        <div className="flex flex-col items-center gap-4 text-xl">
          {navItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/60 hover:bg-white/10 hover:text-white"
                }`}
                title={item.label}
              >
                {item.icon}
              </Link>
            );
          })}
        </div>
      </aside>
    </>
  );
}
