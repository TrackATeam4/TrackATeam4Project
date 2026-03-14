"use client";

import { AnimatePresence, motion, useInView, useMotionValue, animate } from "framer-motion";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { signInWithEmail, signUpWithEmail } from "@/lib/auth";

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
  return (
    <Suspense>
      <AuthPageInner />
    </Suspense>
  );
}

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMode = searchParams.get("mode");
  const isCreatedBanner = searchParams.get("created") === "1";
  const initialMode = requestedMode === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">(
    isCreatedBanner ? "success" : "idle"
  );
  const [message, setMessage] = useState(
    isCreatedBanner ? "Account created successfully. Please sign in." : ""
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setStatus("loading");
    setMessage("");

    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }

      if (email) {
        localStorage.setItem("tracka.user_email", email);
      }

      if (mode === "signup") {
        localStorage.setItem("tracka.signup_name", name);
        setStatus("success");
        setMessage("Account created successfully. Please sign in.");
        setPassword("");
        router.push("/auth?mode=signin&created=1");
        return;
      }

      router.push("/home");
    } catch (error) {
      setStatus("error");
      const raw = error instanceof Error ? error.message : "Something went wrong.";
      const friendly: Record<string, string> = {
        "User already registered": "An account with this email already exists. Please sign in instead.",
        "Invalid login credentials": "Incorrect email or password.",
        "Email not confirmed": "Please confirm your email before signing in.",
        "Password should be at least 6 characters": "Password must be at least 6 characters.",
      };
      setMessage(friendly[raw] ?? raw);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9D6] text-slate-700">

      <header className="sticky top-0 z-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3 text-2xl font-bold text-[#065F46] sm:text-3xl">
            <Image src="/logo.svg" alt="Lemontree" width={40} height={40} className="h-10 w-10" />
            Lemontree
          </div>
          <a
            href="https://www.foodhelpline.org"
            className="text-base font-semibold text-slate-600 transition hover:text-[#065F46]"
          >
            About Lemontree
          </a>
        </div>
      </header>

      <div className="relative mx-auto grid min-h-[calc(100vh-96px)] max-w-6xl grid-cols-1 gap-12 px-6 pb-16 pt-6 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div className="w-full space-y-8">
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
          className="w-full"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        >
          <div className="rounded-3xl border border-yellow-100 bg-white p-8 shadow-2xl shadow-yellow-200/50 sm:p-10">
            <div className="flex items-center justify-between rounded-full bg-yellow-50 p-1 text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setStatus("idle");
                  setMessage("");
                }}
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
                onClick={() => {
                  setMode("signup");
                  setStatus("idle");
                  setMessage("");
                }}
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

              {status === "success" && message ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
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
