"use client";

import { DM_Serif_Display } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSyncExternalStore } from "react";
import LemonLogo from "@/components/LemonLogo";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--home-display",
});

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
    label: "Organizer Panel",
    href: "/home/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
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

const adminSubItems = [
  {
    label: "Overview",
    href: "/admin/home",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: "Campaigns",
    href: "/admin/campaigns",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "Pantries",
    href: "/admin/pantries",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Flyers",
    href: "/admin/flyers",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
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
  const [adminExpanded, setAdminExpanded] = useState(
    () => typeof window !== "undefined" && pathname.startsWith("/admin")
  );

  const userName = useSyncExternalStore(
    subscribeToStorage,
    () => getLocalStorageValue("tracka.signup_name", "Volunteer"),
    () => "Volunteer"
  );
  const userRole = useSyncExternalStore(
    subscribeToStorage,
    () => getLocalStorageValue("tracka.user_role", "volunteer"),
    () => "volunteer"
  );

  const isAdmin = userRole === "admin";

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin
  );

  const isActiveRoute = (href: string) => {
    if (href === "/home") return pathname === "/home";
    return pathname.startsWith(href);
  };

  const isAdminSectionActive = pathname.startsWith("/admin");

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
        <nav className="mt-5 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {visibleNavItems.map((item) => {
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

          {/* Admin section */}
          {isAdmin && (
            <div className="mt-2">
              <div className="mb-1 h-px bg-gray-100" />
              <button
                onClick={() => setAdminExpanded((v) => !v)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isAdminSectionActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-[#6B7280] hover:bg-gray-50 hover:text-[#111827]"
                }`}
              >
                {isAdminSectionActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-500" />
                )}
                <span className={`transition-colors ${isAdminSectionActive ? "text-emerald-600" : "text-[#9CA3AF] group-hover:text-[#6B7280]"}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </span>
                <span className="flex-1 text-left">Admin Panel</span>
                <span className={`transition-transform duration-200 ${adminExpanded ? "rotate-180" : ""}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>

              {adminExpanded && (
                <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l-2 border-emerald-100 pl-3">
                  {adminSubItems.map((sub) => {
                    const isActive = isActiveRoute(sub.href);
                    return (
                      <Link
                        key={sub.label}
                        href={sub.href}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-all ${
                          isActive
                            ? "bg-emerald-50 text-emerald-700"
                            : "text-[#6B7280] hover:bg-gray-50 hover:text-[#111827]"
                        }`}
                      >
                        <span className={isActive ? "text-emerald-600" : "text-[#9CA3AF]"}>
                          {sub.icon}
                        </span>
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
            <p className="text-xs text-[#9CA3AF]">{isAdmin ? "Admin" : "Volunteer"}</p>
          </div>
          {isAdmin && (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Admin
            </span>
          )}
        </div>
      </aside>

      {/* Tablet icon-only sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[68px] flex-col items-center border-r border-gray-100 bg-white py-6 md:flex lg:hidden">
        <LemonLogo size={26} />
        <nav className="mt-6 flex flex-1 flex-col items-center gap-1">
          {visibleNavItems.map((item) => {
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

          {/* Admin icon on tablet */}
          {isAdmin && (
            <>
              <div className="my-1 w-8 h-px bg-gray-100" />
              <Link
                href="/admin/home"
                title="Admin Panel"
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                  isAdminSectionActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-[#9CA3AF] hover:bg-gray-50 hover:text-emerald-600"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </Link>
            </>
          )}
        </nav>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#F5C542] to-[#E5A800] text-sm font-bold text-white">
          {userName.charAt(0).toUpperCase()}
        </div>
      </aside>
    </>
  );
}
