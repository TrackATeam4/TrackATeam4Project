"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import LemonLogo from "@/components/LemonLogo";

const navItems = [
  {
    label: "Feed",
    href: "/home",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Discover",
    href: "/home/discover",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
  },
  {
    label: "Create Campaign",
    href: "/home/create",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    label: "Dashboard",
    href: "/home/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Leaderboard",
    href: "/home/leaderboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    label: "Custom Flyer",
    href: "/home/CustomFlyer",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10z" />
        <polyline points="14 3 14 10 21 10" />
        <line x1="8" y1="14" x2="16" y2="14" />
        <line x1="8" y1="18" x2="13" y2="18" />
      </svg>
    ),
  },
  {
    label: "My Profile",
    href: "/home/profile",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
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
      {/* Desktop wide sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 flex-col border-r border-gray-100 bg-white px-5 py-7 lg:flex">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-1">
          <LemonLogo size={30} />
          <div>
            <img src="/wordmark.svg" alt="Lemontree" className="h-5 w-auto" />
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#9CA3AF]">Volunteer Hub</p>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-6 h-px bg-gray-100" />

        {/* Nav */}
        <nav className="mt-5 flex flex-1 flex-col gap-0.5">
          {navItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[#FFFBEB] text-[#1B4332]"
                    : "text-[#6B7280] hover:bg-gray-50 hover:text-[#111827]"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#F5C542]" />
                )}
                <span className={`transition-colors ${isActive ? "text-[#1B4332]" : "text-[#9CA3AF] group-hover:text-[#6B7280]"}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="h-px bg-gray-100" />

        {/* User */}
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#FFFBEB] px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F5C542] to-[#E5A800] text-sm font-bold text-white shadow-sm">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#111827]">{userName}</p>
            <p className="text-xs text-[#9CA3AF]">Volunteer</p>
          </div>
        </div>
      </aside>

      {/* Tablet icon-only sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[68px] flex-col items-center border-r border-gray-100 bg-white py-6 md:flex lg:hidden">
        <LemonLogo size={26} />
        <nav className="mt-6 flex flex-1 flex-col items-center gap-1">
          {navItems.map((item) => {
            const isActive = isActiveRoute(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? "bg-[#FFFBEB] text-[#1B4332]"
                    : "text-[#9CA3AF] hover:bg-gray-50 hover:text-[#6B7280]"
                }`}
              >
                {item.icon}
              </Link>
            );
          })}
        </nav>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#F5C542] to-[#E5A800] text-sm font-bold text-white">
          {userName.charAt(0).toUpperCase()}
        </div>
      </aside>
    </>
  );
}
