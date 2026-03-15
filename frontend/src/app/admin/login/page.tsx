"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { authFetch } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password);
        setStatus("success");
        setMessage("Admin account created. Please sign in.");
        setPassword("");
        setMode("signin");
        return;
      }

      await signInWithEmail(email, password);

      if (email) {
        localStorage.setItem("tracka.user_email", email);
      }

      // TEMPORARY: admin role check bypassed for testing
      // To re-enable, uncomment the block below:
      // try {
      //   const res = await authFetch<{ role?: string }>("/auth/me");
      //   if (res.data?.role !== "admin") {
      //     setStatus("error");
      //     setMessage("Access denied. This account does not have admin privileges.");
      //     return;
      //   }
      // } catch {
      //   // If /auth/me fails, allow through
      // }

      router.push("/admin/home");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#FFF9D6] px-4 text-slate-700">
      <header className="absolute top-0 left-0 right-0 z-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <a href="/landing" className="flex items-center gap-3 text-2xl font-bold text-[#065F46]">
            <Image src="/logo.svg" alt="Lemontree" width={40} height={40} className="h-10 w-10" />
            Lemontree
          </a>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            Admin Portal
          </span>
        </div>
      </header>

      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
      >
        <div className="rounded-3xl border border-yellow-100 bg-white p-8 shadow-2xl shadow-yellow-200/50 sm:p-10">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl">
              🔒
            </div>
            <h1 className="text-xl font-bold text-[#0F172A]">Admin Console</h1>
            <p className="mt-1 text-sm text-slate-500">Manage campaigns, volunteers &amp; analytics</p>
          </div>

          <div className="flex items-center justify-between rounded-full bg-yellow-50 p-1 text-sm">
            <button
              type="button"
              onClick={() => { setMode("signin"); setStatus("idle"); setMessage(""); }}
              className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
                mode === "signin" ? "bg-white text-[#0F172A] shadow" : "text-slate-500"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setStatus("idle"); setMessage(""); }}
              className={`flex-1 rounded-full px-4 py-2 font-medium transition ${
                mode === "signup" ? "bg-white text-[#0F172A] shadow" : "text-slate-500"
              }`}
            >
              Sign up
            </button>
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-[#0F172A]">
                {mode === "signin" ? "Welcome back, Admin" : "Create admin account"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {mode === "signin"
                  ? "Sign in to access the admin dashboard."
                  : "Set up your admin credentials."}
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {mode === "signup" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600" htmlFor="admin-name">
                    Full name
                  </label>
                  <input
                    id="admin-name"
                    type="text"
                    placeholder="Admin Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-yellow-100 px-4 py-3 text-sm text-[#0F172A] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600" htmlFor="admin-email">
                  Email address
                </label>
                <input
                  id="admin-email"
                  type="email"
                  placeholder="admin@lemontree.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-yellow-100 px-4 py-3 text-sm text-[#0F172A] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-600" htmlFor="admin-password">
                  Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-yellow-100 px-4 py-3 text-sm text-[#0F172A] shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>

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
                    ? "Sign in to Dashboard →"
                    : "Create admin account →"}
              </motion.button>
            </form>

            {status === "error" && message && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
                {message}
              </div>
            )}

            {status === "success" && message && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
                {message}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
