"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const finalize = async () => {
      try {
        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (typeof window !== "undefined") {
          const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
          }
        }
        router.replace("/home");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to complete sign-in.");
        router.replace("/auth?mode=signin");
      }
    };

    void finalize();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF8E1] px-6 text-center text-[#1A1A1A]">
      <div className="space-y-3">
        <p className="text-lg font-semibold">Finalizing your sign-in…</p>
        {errorMessage ? (
          <p className="text-sm text-rose-600">{errorMessage}</p>
        ) : (
          <p className="text-sm text-[#6B7280]">You'll be redirected to your dashboard.</p>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FFF8E1]">
          <p className="text-sm text-[#6B7280]">Finalizing your sign-in…</p>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
