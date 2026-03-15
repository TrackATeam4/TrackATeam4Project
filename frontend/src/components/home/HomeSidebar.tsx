"use client";

import { DM_Serif_Display } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--home-display",
});

const navItems = [
  { label: "Feed", icon: "🏠", href: "/home" },
  { label: "Discover", icon: "🗺️", href: "/home/discover" },
  { label: "Create Campaign", icon: "➕", href: "/home/create" },
  { label: "Dashboard", icon: "⚙️", href: "/home/dashboard" },
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
  <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 flex-col bg-white px-6 py-8 text-[#1A1A1A] lg:flex border-r border-[#E5E7EB] shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
        <div className="space-y-1">
          <div
            className={`flex items-center gap-2 text-xl font-bold ${dmSerif.variable}`}
            style={{ fontFamily: "var(--home-display)" }}
          >
            <span className="text-[28px]"><img src="/logo.svg" alt="Logo" className="h-7 w-7" /></span>
            Lemontree
          </div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#9CA3AF]">Volunteer Hub</p>
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
                    ? "bg-[#FEF3C7] text-[#1A1A1A] font-semibold border-l-4 border-[#F5C542]"
                    : "text-[#6B7280] hover:bg-gray-50 hover:text-[#1A1A1A]"
                }`}
              >
                {isActive ? (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#F5C542]" />
                ) : null}
                <span className="text-[20px]">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F5C542] text-sm font-semibold text-[#1A1A1A]">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">{userName}</p>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-[#6B7280]">
                Volunteer
              </span>
            </div>
          </div>
        </div>
      </aside>

  <aside className="fixed left-0 top-0 z-40 hidden h-screen w-24 flex-col bg-white px-3 py-8 md:flex lg:hidden border-r border-[#E5E7EB] shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
        <div className="flex flex-col items-center gap-4 text-xl">
          {navItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${
                  isActive
                    ? "bg-[#FEF3C7] text-[#1A1A1A]"
                    : "text-[#6B7280] hover:bg-gray-50 hover:text-[#1A1A1A]"
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
