"use client";

import { AnimatePresence, motion, useInView, useMotionValue, animate } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const featureItems = [
  {
    title: "Launch campaigns",
    description: "Pick a location, set a date, and go live in minutes",
    emoji: "📍",
  },
  {
    title: "Rally your crew",
    description: "Invite friends, track RSVPs, coordinate logistics",
    emoji: "👥",
  },
  {
    title: "Track your impact",
    description: "Log results and see your community contribution grow",
    emoji: "📊",
  },
];

const stats = [
  { label: "families helped", value: 900000, suffix: "+" },
  { label: "cities", value: 11, suffix: "" },
  { label: "corporate partners", value: 30, suffix: "+" },
];

function StatNumber({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;

    const controls = animate(motionValue, value, {
      duration: 1.4,
      ease: "easeOut",
      onUpdate: (latest) => {
        setDisplay(Math.floor(latest).toLocaleString());
      },
    });

    return () => controls.stop();
  }, [inView, motionValue, value]);

  return (
    <span ref={ref} className="text-emerald-600">
      {display}
      {suffix}
    </span>
  );
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const endpoint = mode === "signup" ? "/auth/signup" : "/auth/signin";
      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          password,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.detail || "Authentication failed.");
      }

      const payload = await response.json();

      if (payload?.session?.access_token) {
        localStorage.setItem("tracka.access_token", payload.session.access_token);
      }

      if (mode === "signup") {
        localStorage.setItem("tracka.signup_name", name);
      }

      router.push("/home");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFFEF5] text-slate-700">
      <motion.div
        className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-yellow-200/50 blur-3xl"
        animate={{ y: [0, -12, 0], opacity: [0.6, 0.8, 0.6] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl"
        animate={{ y: [0, 14, 0], opacity: [0.5, 0.7, 0.5] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-orange-200/30 blur-3xl"
        animate={{ y: [0, -10, 0], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="absolute inset-0 opacity-[0.03]">
        <div className="h-full w-full bg-[radial-gradient(circle_at_1px_1px,#0f172a_1px,transparent_0)] [background-size:24px_24px]" />
      </div>

      <header className="sticky top-0 z-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2 text-lg font-semibold text-[#065F46]">
            <span className="text-2xl">🍋</span>
            Lemontree
          </div>
          <a
            href="https://www.foodhelpline.org"
            className="text-sm font-medium text-slate-500 transition hover:text-[#065F46]"
          >
            About Lemontree
          </a>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-12 px-6 pb-16 pt-6 lg:flex-row lg:items-center">
        <div className="w-full space-y-8 lg:w-3/5">
          <motion.span
            className="inline-flex items-center rounded-full bg-yellow-100 px-4 py-2 text-sm font-medium text-[#065F46]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            🍋 Volunteer Flyering Platform
          </motion.span>

          <motion.h1
            className="text-4xl font-bold tracking-tight text-[#0F172A] sm:text-5xl lg:text-6xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            Spread the word. Feed your neighborhood.
          </motion.h1>

          <motion.p
            className="text-lg text-slate-500"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
          >
            Organize flyering campaigns, rally volunteers, and help families find free food — all in one place.
          </motion.p>

          <motion.div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              show: {
                transition: {
                  staggerChildren: 0.12,
                },
              },
            }}
          >
            {featureItems.map((feature) => (
              <motion.div
                key={feature.title}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  show: { opacity: 1, y: 0 },
                }}
                className="rounded-2xl border border-yellow-100 bg-white p-4 shadow-lg shadow-yellow-100/60"
              >
                <div className="text-2xl">{feature.emoji}</div>
                <h3 className="mt-3 text-base font-semibold text-[#0F172A]">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-slate-500">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="flex flex-wrap gap-4 text-sm text-slate-400">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2">
                <span className="font-semibold text-emerald-600">
                  <StatNumber value={stat.value} suffix={stat.suffix} />
                </span>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          className="w-full lg:w-2/5"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        >
          <div className="rounded-3xl border border-yellow-100 bg-white p-8 shadow-2xl shadow-yellow-200/50 sm:p-10">
            <div className="flex items-center justify-between rounded-full bg-yellow-50 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
                  mode === "signin"
                    ? "bg-white text-[#0F172A] shadow"
                    : "text-slate-500"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
                  mode === "signup"
                    ? "bg-white text-[#0F172A] shadow"
                    : "text-slate-500"
                }`}
              >
                Sign up
              </button>
            </div>

            <div className="mt-8 space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-[#0F172A]">
                  {mode === "signin" ? "Welcome back" : "Create your account"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {mode === "signin"
                    ? "Sign in to manage campaigns and volunteers."
                    : "Get started in under a minute."}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <AnimatePresence initial={false}>
                  {mode === "signup" && (
                    <motion.div
                      key="name-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <label className="text-sm font-medium text-slate-600" htmlFor="name">
                        Full name
                      </label>
                      <input
                        id="name"
                        type="text"
                        placeholder="Jane Organizer"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="w-full rounded-xl border border-yellow-100 px-4 py-3 text-sm text-[#0F172A] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@lemontree.org"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-yellow-100 px-4 py-3 text-sm text-[#0F172A] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-xl border border-yellow-100 px-4 py-3 text-sm text-[#0F172A] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>

                {mode === "signin" && (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 text-slate-500">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                      Remember me
                    </label>
                    <button type="button" className="text-emerald-600 hover:text-emerald-700">
                      Forgot password?
                    </button>
                  </div>
                )}

                <motion.button
                  type="submit"
                  disabled={status === "loading"}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {status === "loading"
                    ? "Please wait..."
                    : mode === "signin"
                      ? "Sign in →"
                      : "Create account →"}
                </motion.button>
              </form>

              {status === "error" && message ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
                  {message}
                </div>
              ) : null}

              <div className="rounded-2xl border border-dashed border-yellow-100 bg-[#FFFEF5] p-4 text-xs text-slate-500">
                {mode === "signin"
                  ? "New here? Switch to sign up above."
                  : "By signing up you agree to Lemontree’s volunteer guidelines."}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
