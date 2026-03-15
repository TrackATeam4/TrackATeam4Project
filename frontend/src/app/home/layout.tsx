"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/auth");
        return;
      }

      // Fetch and cache the user's role so sidebar + dashboard can read it
      try {
        const res = await authFetch<{ id: string; email: string; role?: string }>("/auth/me");
        const role = res.data?.role ?? "volunteer";
        localStorage.setItem("tracka.user_role", role);
        // storage event only fires cross-tab — dispatch manually so same-tab
        // useSyncExternalStore subscribers (HomeSidebar) pick up the new value
        window.dispatchEvent(new StorageEvent("storage", { key: "tracka.user_role", newValue: role }));
      } catch {
        localStorage.setItem("tracka.user_role", "volunteer");
      }

      setReady(true);
    };

    void check();
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF8E1]">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#F5C542]/30 border-t-[#F5C542]" />
      </div>
    );
  }

  return <>{children}</>;
}
