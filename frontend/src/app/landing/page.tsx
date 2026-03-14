"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

const highlightCards = [
  { title: "85%", subtitle: "Increase in turnout", end: 85, suffix: "%" },
  { title: "200+", subtitle: "Active volunteers", end: 200, suffix: "+" },
  { title: "11", subtitle: "Cities running campaigns", end: 11, suffix: "" },
  { title: "900k", subtitle: "Families reached", end: 900, suffix: "k" },
];

const features = [
  {
    icon: "\u{1F680}",
    title: "Launch campaigns",
    desc: "Create and manage neighborhood outreach campaigns in minutes.",
  },
  {
    icon: "\u{1F91D}",
    title: "Rally your crew",
    desc: "Invite volunteers, assign roles, and coordinate schedules effortlessly.",
  },
  {
    icon: "\u{1F4CA}",
    title: "Track your impact",
    desc: "See real-time stats on turnout, reach, and community engagement.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const, delay: i * 0.12 },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

function CountUp({ end, suffix }: { end: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1200;
    const step = 16;
    const increment = end / (duration / step);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setValue(end);
        clearInterval(timer);
      } else {
        setValue(Math.floor(start));
      }
    }, step);
    return () => clearInterval(timer);
  }, [inView, end]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const statsRef = useRef(null);
  const missionRef = useRef(null);
  const ctaRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true, margin: "-80px" });
  const missionInView = useInView(missionRef, { once: true, margin: "-80px" });
  const ctaInView = useInView(ctaRef, { once: true, margin: "-80px" });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* ── Header ── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/90 shadow-md backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
        <div className="flex h-16 items-stretch">
          <div className="flex flex-1 items-center justify-between px-6 lg:px-14">
            <Link href="/landing" className="flex items-center gap-3">
              <Image
                src="/logo.svg"
                alt="Lemontree"
                width={36}
                height={36}
                className="h-9 w-9"
              />
              <span
                className="text-2xl font-extrabold tracking-[0.08em] text-[#0C3B2E] transition-colors duration-300"
              >
                LEMONTREE
              </span>
            </Link>

            <nav className="hidden items-center gap-8 text-base font-medium md:flex">
              {[
                { label: "Home", href: "/landing" },
                { label: "Who We Are", href: "#" },
                { label: "Support Us", href: "/auth?mode=signup" },
                { label: "Events", href: "#" },
                { label: "News", href: "#" },
                { label: "Contact", href: "/auth?mode=signin" },
              ].map((link) =>
                link.href.startsWith("/") ? (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`transition-colors duration-300 hover:opacity-80 ${
                      scrolled ? "text-slate-700" : "text-[#0C3B2E]/80"
                    } ${link.label === "Home" ? "font-semibold" : ""}`}
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    className={`transition-colors duration-300 hover:opacity-80 ${
                      scrolled ? "text-slate-700" : "text-[#0C3B2E]/80"
                    }`}
                  >
                    {link.label}
                  </a>
                )
              )}
            </nav>
          </div>

          <Link
            href="/auth?mode=signup"
            className="hidden w-[180px] items-center justify-center bg-[#E5C64A] text-xl font-black tracking-[0.1em] text-[#0C3B2E] transition hover:bg-[#d9b83a] sm:flex"
          >
            REGISTER
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative min-h-[90vh] bg-[#FFF9D6] pt-16">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-20 lg:grid-cols-2 lg:gap-16 lg:px-14 lg:py-28">
          <div>
            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0}
              className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0C3B2E]/70"
            >
              Community Campaigns
            </motion.p>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={1}
              className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-[#0C3B2E] sm:text-5xl lg:text-7xl"
            >
              Give neighborhoods the{" "}
              <span className="text-[#E5C64A]">visibility</span> they need.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={2}
              className="mt-6 max-w-lg text-lg leading-relaxed text-[#0C3B2E]/70"
            >
              Plan flyer drops, organize volunteers, and track outreach with a
              visual board designed for fast local action.
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={3}
              className="mt-8 flex flex-wrap gap-4"
            >
              <Link
                href="/auth?mode=signup"
                className="rounded-full bg-[#0C3B2E] px-8 py-3.5 text-base font-bold text-white transition hover:bg-[#0C3B2E]/90"
              >
                Start free
              </Link>
              <Link
                href="/auth?mode=signin"
                className="rounded-full border border-[#0C3B2E]/30 px-8 py-3.5 text-base font-semibold text-[#0C3B2E] transition hover:bg-[#0C3B2E]/10"
              >
                I already have an account
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.4, ease: "easeOut" }}
            className="relative overflow-hidden rounded-3xl border-4 border-white/40 shadow-2xl"
          >
            <Image
              src="https://images.pexels.com/photos/6995221/pexels-photo-6995221.jpeg?auto=compress&cs=tinysrgb&w=800"
              alt="Volunteers handing over a box of food donations"
              width={800}
              height={600}
              className="h-full w-full object-cover"
              priority
            />
          </motion.div>
        </div>

        {/* Decorative bottom curve */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" className="w-full">
            <path
              d="M0 60V30C360 0 1080 0 1440 30V60H0Z"
              fill="#F3F0EA"
            />
          </svg>
        </div>
      </section>

      {/* ── Stats ── */}
      <section ref={statsRef} className="bg-[#F3F0EA] py-16 lg:py-24">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate={statsInView ? "visible" : "hidden"}
          className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 lg:grid-cols-4 lg:gap-12 lg:px-14"
        >
          {highlightCards.map((card, i) => (
            <motion.div key={card.title} variants={fadeUp} custom={i}>
              <p className="text-4xl font-extrabold tracking-tight text-[#0C3B2E] lg:text-5xl">
                <CountUp end={card.end} suffix={card.suffix} />
              </p>
              <div className="mt-3 h-1 w-10 rounded-full bg-[#E5C64A]" />
              <p className="mt-2 text-sm font-medium text-slate-600">
                {card.subtitle}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Mission ── */}
      <section ref={missionRef} className="bg-white py-20 lg:py-28">
        <div className="mx-auto max-w-7xl items-center gap-16 px-6 lg:grid lg:grid-cols-2 lg:px-14">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate={missionInView ? "visible" : "hidden"}
            custom={0}
          >
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 lg:text-4xl">
              Built for communities that show up.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
              Lemontree helps neighborhood leaders coordinate volunteers, plan
              outreach, and drive real change &mdash; from flyer drops to food
              pantries.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate={missionInView ? "visible" : "hidden"}
            className="mt-10 space-y-4 lg:mt-0"
          >
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeUp}
                custom={i + 1}
                className="flex items-start gap-4 rounded-2xl bg-[#F3F0EA] p-6"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg">
                  {f.icon}
                </span>
                <div>
                  <p className="font-semibold text-slate-900">{f.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {f.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Bottom CTA + Footer ── */}
      <section ref={ctaRef} className="bg-[#0C3B2E]">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={ctaInView ? "visible" : "hidden"}
          custom={0}
          className="mx-auto max-w-3xl px-6 py-20 text-center lg:py-28"
        >
          <h2 className="text-3xl font-bold text-white lg:text-5xl">
            Ready to make an impact?
          </h2>
          <p className="mt-4 text-lg text-emerald-200">
            Join hundreds of volunteers building stronger neighborhoods.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/auth?mode=signup"
              className="rounded-full bg-[#E5C64A] px-8 py-3.5 text-base font-bold text-[#0C3B2E] transition hover:bg-[#d9b83a]"
            >
              Start free
            </Link>
            <Link
              href="/auth?mode=signin"
              className="rounded-full border border-white/30 px-8 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
            >
              I already have an account
            </Link>
          </div>
        </motion.div>

        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-8 sm:flex-row lg:px-14">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.svg"
                alt="Lemontree"
                width={28}
                height={28}
                className="h-7 w-7"
              />
              <span className="text-lg font-extrabold tracking-[0.06em] text-white">
                LEMONTREE
              </span>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-emerald-300">
              <Link href="/landing" className="hover:text-white">
                Home
              </Link>
              <a href="#" className="hover:text-white">
                Who We Are
              </a>
              <Link href="/auth?mode=signup" className="hover:text-white">
                Support Us
              </Link>
              <a href="#" className="hover:text-white">
                Events
              </a>
              <a href="#" className="hover:text-white">
                News
              </a>
            </nav>

            <p className="text-xs text-emerald-400/60">
              &copy; 2026 Lemontree
            </p>
          </div>
        </footer>
      </section>
    </main>
  );
}
