"use client";

import { easeOut, motion, useMotionValue, useSpring } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Events", href: "/home" },
  { label: "About", href: "https://foodhelpline.org" },
];

const headlineLines = [
  ["Give", "neighborhoods"],
  ["the", "visibility"],
  ["they", "need."],
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const word = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

function MagneticButton({
  children,
  href,
  variant,
}: {
  children: string;
  href: string;
  variant: "primary" | "ghost";
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 120, damping: 12 });
  const springY = useSpring(y, { stiffness: 120, damping: 12 });

  const baseStyles =
    variant === "primary"
      ? "bg-[#FCD34D] text-[#1B4332] shadow-[0_20px_40px_rgba(252,211,77,0.28)]"
      : "border border-white/60 text-white hover:bg-white hover:text-[#1B4332]";

  return (
    <motion.div
      className="inline-flex"
      style={{ x: springX, y: springY }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = event.clientX - rect.left - rect.width / 2;
        const dy = event.clientY - rect.top - rect.height / 2;
        x.set(dx * 0.15);
        y.set(dy * 0.15);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <Link
        href={href}
        className={`rounded-full px-8 py-4 text-base font-semibold transition ${baseStyles}`}
      >
        {children}
      </Link>
    </motion.div>
  );
}

export default function Hero() {
  const heroId = useMemo(() => Math.random().toString(36).slice(2), []);

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#1B4332] text-white">
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="sticky top-0 z-20 bg-[#1B4332]/80 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3 text-sm font-semibold tracking-[0.3em]">
            <Image src="/logo.svg" alt="Lemontree" width={36} height={36} className="h-9 w-9" />
            <span>LEMONTREE</span>
          </div>
          <div className="hidden items-center gap-8 text-sm uppercase tracking-[0.14em] md:flex">
            {navLinks.map((link) => (
              <Link key={link.label} href={link.href} className="text-white/70 hover:text-white">
                {link.label}
              </Link>
            ))}
          </div>
          <Link
            href="/auth"
            className="rounded-full bg-[#FCD34D] px-5 py-2 text-sm font-semibold text-[#1B4332] shadow-[0_12px_28px_rgba(252,211,77,0.3)] transition hover:scale-[1.03]"
          >
            Register
          </Link>
        </div>
      </motion.nav>

      <div className="relative mx-auto grid max-w-6xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <motion.div initial="hidden" animate="visible" variants={container}>
            {headlineLines.map((line, lineIndex) => (
              <div key={`${heroId}-line-${lineIndex}`} className="overflow-hidden">
                <motion.h1
                  variants={container}
                  className="text-5xl font-semibold leading-[1.05] sm:text-6xl lg:text-8xl"
                >
                  {line.map((wordText) => (
                    <motion.span
                      key={wordText}
                      variants={word}
                      className={`mr-3 inline-block ${
                        wordText === "visibility" ? "text-[#FCD34D]" : "text-white"
                      }`}
                    >
                      {wordText}
                    </motion.span>
                  ))}
                </motion.h1>
              </div>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-6 max-w-xl text-base text-emerald-100 sm:text-lg"
          >
            Plan flyer drops, organize volunteers, and track outreach with a platform designed for fast local action.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8, type: "spring", stiffness: 120 }}
            className="mt-8 flex flex-wrap gap-4"
          >
            <MagneticButton href="/auth" variant="primary">
              Start free
            </MagneticButton>
            <MagneticButton href="/auth" variant="ghost">
              I already have an account
            </MagneticButton>
          </motion.div>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="absolute -right-10 -top-10 h-72 w-72 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-gradient-to-br from-yellow-300 via-[#FCD34D] to-emerald-400 opacity-80 blur-2xl animate-[morph_15s_ease-in-out_infinite]" />
          <div className="relative z-10 rounded-[32px] border border-white/15 bg-white/10 p-6 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-100">Community Impact</p>
            <p className="mt-3 text-3xl font-semibold">Every flyer finds a family.</p>
            <p className="mt-3 text-sm text-emerald-100">
              Build campaigns that connect neighbors with real food resources in minutes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
