"use client";

import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { signInWithEmail, signUpWithEmail } from "@/lib/auth";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--auth-display",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--auth-body",
});

const headline = ["Every", "flyer", "feeds", "a", "neighborhood."];

const tickerText = "🍋 Chelsea • Harlem • Bronx • Washington Heights • Sunset Park • East Village • Astoria • Newark • Philadelphia • Boston • Baltimore •";

type AuthStatus = "idle" | "loading" | "error" | "success";

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
  const initialMode = requestedMode === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(initialMode);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [showCursor, setShowCursor] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const animatedHeadline = useMemo(
    () => headline.map((wordText, index) => ({ wordText, index })),
    []
  );

  const buttonX = useMotionValue(0);
  const buttonY = useMotionValue(0);
  const springX = useSpring(buttonX, { stiffness: 120, damping: 12 });
  const springY = useSpring(buttonY, { stiffness: 120, damping: 12 });

  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  const lemonX = useSpring(cursorX, { stiffness: 50, damping: 20 });
  const lemonY = useSpring(cursorY, { stiffness: 50, damping: 20 });

  const passwordStrength = useMemo(() => {
    const length = password.length;
    if (length >= 12) return { width: "100%", color: "bg-emerald-500" };
    if (length >= 8) return { width: "75%", color: "bg-yellow-400" };
    if (length >= 4) return { width: "50%", color: "bg-orange-400" };
    return { width: "25%", color: "bg-rose-400" };
  }, [password]);

  const handleMouse = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    buttonX.set(dx * 0.15);
    buttonY.set(dy * 0.15);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    setShowSuccess(false);

    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password, name);
        localStorage.setItem("tracka.signup_name", name);
      }

      await signInWithEmail(email, password);
      localStorage.setItem("tracka.signup_name", name || email.split("@")[0]);

      setStatus("success");
      setTimeout(() => setShowSuccess(true), 500);
      setTimeout(() => router.push("/home"), 1200);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  };

  return (
    <div className={`${dmSerif.variable} ${dmSans.variable} min-h-screen bg-[#FFFEF5]`}>
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <section className="relative flex min-h-[30vh] flex-col justify-center overflow-hidden bg-[#1B4332] px-8 py-16 text-white lg:min-h-screen">
          <div className="absolute inset-0">
            <motion.div
              animate={{ y: [0, -18, 0], x: [0, 12, 0] }}
              transition={{ duration: 12, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
              className="absolute -left-20 top-10 h-56 w-56 rounded-full bg-yellow-300/20 blur-3xl"
            />
            <motion.div
              animate={{ y: [0, 22, 0], x: [0, -16, 0] }}
              transition={{ duration: 14, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
              className="absolute right-0 top-32 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl"
            />
            <motion.div
              animate={{ y: [0, -25, 0] }}
              transition={{ duration: 10, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
              className="absolute bottom-10 left-10 h-48 w-48 rounded-full bg-yellow-200/10 blur-3xl"
            />
          </div>

          <div className="relative z-10 max-w-md space-y-6">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
            >
              <h1 className="text-4xl font-semibold leading-tight lg:text-6xl" style={{ fontFamily: "var(--auth-display)" }}>
                {animatedHeadline.map(({ wordText, index }) => (
                  <motion.span
                    key={`${wordText}-${index}`}
                    className={`mr-2 inline-block ${wordText === "neighborhood." ? "text-[#FCD34D]" : "text-white"}`}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1, ease: "easeOut" }}
                  >
                    {wordText}
                  </motion.span>
                ))}
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 0.6, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-sm"
            >
              900,000+ families connected to free food
            </motion.p>
          </div>

          <div className="relative z-10 mt-10 w-full overflow-hidden border-y border-white/10 py-2 text-xs text-white/30">
            <div className="flex w-[200%] animate-[ticker_30s_linear_infinite] whitespace-nowrap">
              {[tickerText, tickerText].map((text, index) => (
                <span key={`${text}-${index}`} className="mx-4">
                  {text}
                </span>
              ))}
            </div>
          </div>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 0.4, y: 0 }}
            transition={{ delay: 0.8 }}
            className="relative z-10 mt-8 text-sm italic text-[#FCD34D]"
          >
            “You never know who needs the help.”
          </motion.p>
        </section>

        <section
          className="relative flex items-center justify-center bg-[#FFF8E1] px-6 py-16 lg:px-10"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMousePos({
              x: ((event.clientX - rect.left) / rect.width) * 100,
              y: ((event.clientY - rect.top) / rect.height) * 100,
            });
            cursorX.set(event.clientX - 8);
            cursorY.set(event.clientY - 8);
          }}
          onMouseEnter={() => setShowCursor(true)}
          onMouseLeave={() => setShowCursor(false)}
          style={{
            backgroundImage: "radial-gradient(circle, rgba(27, 67, 50, 0.05) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <motion.div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(252, 211, 77, 0.07), transparent 60%)`,
            }}
          />
          <motion.span
            className="pointer-events-none fixed z-50 text-base opacity-40"
            style={{ x: lemonX, y: lemonY }}
            animate={{ opacity: showCursor ? 0.4 : 0 }}
            transition={{ duration: 0.3 }}
          >
            🍋
          </motion.span>

          <div className="relative z-10 w-full max-w-md">
            <div className="relative rounded-3xl p-[1px]">
              <div className="relative rounded-3xl bg-white p-10 shadow-sm border border-gray-200">
                <div className="relative flex rounded-full border border-gray-200 bg-gray-50 p-1">
                  <motion.div
                    layoutId="authTab"
                    className={`absolute top-1 bottom-1 rounded-full ${
                      mode === "signin"
                        ? "left-1 w-[calc(50%-4px)] bg-[#1B4332]"
                        : "left-[50%] w-[calc(50%-4px)] bg-[#F5C542]"
                    }`}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setStatus("idle");
                      setMessage("");
                      setShowSuccess(false);
                    }}
                    className="relative z-10 flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors"
                    style={{ color: mode === "signin" ? "white" : "#6B7280" }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setStatus("idle");
                      setMessage("");
                      setShowSuccess(false);
                    }}
                    className="relative z-10 flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors"
                    style={{ color: mode === "signup" ? "#1A1A1A" : "#6B7280" }}
                  >
                    Sign up
                  </button>
                </div>

                <div className="mt-10">
                  <AnimatePresence mode="wait">
                    <motion.h2
                      key={mode}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                      className="text-3xl font-semibold text-gray-900"
                      style={{ fontFamily: "var(--auth-display)" }}
                    >
                      {mode === "signin" ? "Welcome back" : mode === "reset" ? "Reset password" : "Join the movement"}
                    </motion.h2>
                  </AnimatePresence>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={`${mode}-subtext`}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.3 }}
                      className="mt-2 text-sm text-[#334155]"
                    >
                      {mode === "signin"
                        ? "Sign in to manage your campaigns."
                        : mode === "reset"
                        ? "Enter your email and we'll send a reset link."
                        : "Start organizing campaigns in under a minute."}
                    </motion.p>
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {status === "error" && message ? (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                      <button
                        type="button"
                        onClick={() => setMessage("")}
                        className="float-right text-xs text-red-400"
                      >
                        ✕
                      </button>
                      {message}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {showSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-10 flex flex-col items-center gap-4"
                    >
                      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                        <motion.circle
                          cx="60"
                          cy="60"
                          r="52"
                          stroke="#10B981"
                          strokeWidth="6"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.6 }}
                        />
                        <motion.path
                          d="M40 62L54 76L82 46"
                          stroke="#10B981"
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.6, delay: 0.3 }}
                        />
                      </svg>
                      <p className="text-base font-semibold text-[#1B4332]">You’re in! Redirecting…</p>
                    </motion.div>
                  ) : mode === "reset" ? (
                    <motion.div
                      key="reset"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.4 }}
                      className="mt-6 space-y-4"
                    >
                      <input
                        type="email"
                        placeholder="Your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-100"
                      />
                      {message && (
                        <p className={`text-xs ${status === "error" ? "text-rose-600" : "text-emerald-700"}`}>{message}</p>
                      )}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={status === "loading" || !email.trim()}
                        onClick={async () => {
                          setStatus("loading");
                          setMessage("");
                          try {
                            const { resetPassword } = await import("@/lib/auth");
                            await resetPassword(email);
                            setStatus("success");
                            setMessage("Reset link sent! Check your inbox.");
                          } catch (e) {
                            setStatus("error");
                            setMessage(e instanceof Error ? e.message : "Something went wrong.");
                          }
                        }}
                        className="w-full rounded-2xl bg-[#1B4332] py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50 hover:bg-[#163828] transition"
                      >
                        {status === "loading" ? "Sending..." : "Send Reset Link"}
                      </motion.button>
                      <button
                        type="button"
                        onClick={() => { setMode("signin"); setMessage(""); setStatus("idle"); }}
                        className="w-full text-center text-sm text-slate-500 hover:text-slate-700 transition"
                      >
                        ← Back to sign in
                      </button>
                    </motion.div>
                  ) : (
                    <motion.form
                      key="form"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.4 }}
                      className="mt-6 space-y-6"
                      onSubmit={handleSubmit}
                    >
                      <AnimatePresence mode="wait">
                        {mode === "signup" && (
                          <motion.div
                            key="name-field"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="overflow-hidden"
                          >
                            <FloatingInput
                              label="Full name"
                              value={name}
                              onChange={(event) => setName(event.target.value)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <FloatingInput
                        label="Email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                      />

                      <div className="space-y-2">
                        <FloatingInput
                          label="Password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          rightElement={
                            <button
                              type="button"
                              onClick={() => setShowPassword((prev) => !prev)}
                              className="text-xs text-gray-500"
                            >
                              {showPassword ? "Hide" : "Show"}
                            </button>
                          }
                        />
                        {mode === "signup" && (
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <motion.div
                              className={`h-full ${passwordStrength.color}`}
                              initial={false}
                              animate={{ width: passwordStrength.width }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                            />
                          </div>
                        )}
                      </div>

                      {mode === "signin" && (
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" className="h-4 w-4 rounded border-gray-300" />
                            Remember me
                          </label>
                          <button
                            type="button"
                            onClick={() => { setMode("reset"); setMessage(""); setStatus("idle"); }}
                            className="text-emerald-700 hover:text-emerald-900 transition"
                          >
                            Forgot password?
                          </button>
                        </div>
                      )}

                      <motion.button
                        type="submit"
                        disabled={status === "loading"}
                        onMouseMove={handleMouse}
                        onMouseLeave={() => {
                          buttonX.set(0);
                          buttonY.set(0);
                        }}
                        style={{ x: springX, y: springY }}
                        whileTap={{ scale: 0.97 }}
                        className={`group relative w-full overflow-hidden rounded-xl px-4 py-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                          status === "success"
                            ? "bg-emerald-600 text-white"
                            : mode === "signup"
                            ? "bg-[#F5C542] text-[#1A1A1A]"
                            : "bg-[#1B4332] text-white"
                        }`}
                      >
                        {status !== "success" ? (
                          <span className="absolute inset-0 rounded-xl bg-black/5 opacity-0 transition group-hover:opacity-100" />
                        ) : null}
                        <span className="relative z-10">
                          {status === "loading" ? (
                            <div className="flex items-center justify-center gap-1">
                              {[0, 1, 2].map((i) => (
                                <motion.div
                                  key={`dot-${i}`}
                                  className="h-2 w-2 rounded-full bg-white"
                                  animate={{ y: [0, -8, 0] }}
                                  transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15 }}
                                />
                              ))}
                            </div>
                          ) : status === "success" ? (
                            <motion.span
                              initial={{ scale: 0.6 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 300, damping: 18 }}
                            >
                              ✓
                            </motion.span>
                          ) : (
                            <span>{mode === "signin" ? "Sign in" : "Create account"}</span>
                          )}
                        </span>
                      </motion.button>

                      <p className="text-xs text-gray-500">
                        {mode === "signin"
                          ? "New here? Switch to sign up above."
                          : "By signing up you agree to Lemontree’s volunteer guidelines."}
                      </p>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.6, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-6 text-center text-[11px] text-slate-500"
            >
              🍋 Powered by Lemontree • helping 900k+ families find free food
            </motion.p>
          </div>
        </section>
      </div>

      <style jsx global>{`
        body {
          font-family: var(--auth-body, 'DM Sans', sans-serif);
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

type FloatingInputProps = {
  label: string;
  type?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  rightElement?: React.ReactNode;
};

function FloatingInput({ label, type = "text", value, onChange, rightElement }: FloatingInputProps) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || value.length > 0;

  return (
    <div className="relative mt-6">
      <input
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full border-b-2 border-gray-200 bg-transparent py-3 pr-12 text-sm text-gray-900 outline-none transition-colors focus:border-transparent"
      />
      {rightElement ? (
        <div className="absolute right-0 top-1/2 -translate-y-1/2">{rightElement}</div>
      ) : null}
      <motion.div
        className="absolute bottom-0 left-0 h-[2px] bg-emerald-500"
        initial={false}
        animate={{
          width: focused ? "100%" : "0%",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
      <motion.label
        className="absolute left-0 pointer-events-none origin-left"
        animate={{
          y: isActive ? -24 : 8,
          scale: isActive ? 0.85 : 1,
          color: isActive ? "#065F46" : "#9CA3AF",
        }}
        transition={{ duration: 0.2 }}
      >
        {label}
      </motion.label>
    </div>
  );
}
