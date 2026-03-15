"use client";

import Link from "next/link";

const links = [
  { label: "Home", href: "/" },
  { label: "Events", href: "/home" },
  { label: "About", href: "https://foodhelpline.org" },
  { label: "Contact", href: "mailto:hello@foodhelpline.org" },
];

export default function Footer() {
  return (
    <footer className="bg-[#0A1F13] text-emerald-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-sm font-semibold tracking-[0.3em]">
          <span className="text-2xl"><img src="logo.svg" alt="Lemontree Logo" className="h-9 w-9" /></span>
          <span>Lemontree</span>
        </div>
        <nav className="flex flex-wrap gap-6 text-xs uppercase tracking-[0.24em]">
          {links.map((link) => (
            <Link key={link.label} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs">Built with 💛 for Code to Give 2026</p>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-emerald-200">
        Powered by Lemontree • foodhelpline.org
      </div>
    </footer>
  );
}
