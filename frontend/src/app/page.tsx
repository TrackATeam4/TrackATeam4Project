"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DM_Sans, DM_Serif_Display, Space_Mono } from "next/font/google";
import AIShowcase from "@/components/landing/AIShowcase";
import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import StatsTicker from "@/components/landing/StatsTicker";
import Testimonials from "@/components/landing/Testimonials";
import { supabase } from "@/lib/supabase";

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const finalizeAuth = async () => {
      if (typeof window === "undefined") return;

      const hashParams = new URLSearchParams(window.location.hash.replace("#", ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (!accessToken || !refreshToken) return;

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error) {
        router.replace("/home");
      }
    };

    void finalizeAuth();
  }, [router]);

  return (
    <div className={`${dmSerif.variable} ${dmSans.variable} ${spaceMono.variable} bg-[#FFF8E1]`}>
      <Hero />
      <StatsTicker />
      <HowItWorks />
      <AIShowcase />
      <Testimonials />
      <CTASection />
      <Footer />

      <style jsx global>{`
        :root {
          --font-display: ${dmSerif.style.fontFamily};
          --font-body: ${dmSans.style.fontFamily};
          --font-mono: ${spaceMono.style.fontFamily};
        }

        h1, h2, h3, h4 {
          font-family: var(--font-display);
        }

        body {
          font-family: var(--font-body);
        }

        .font-mono {
          font-family: var(--font-mono);
        }

        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes morph {
          0%, 100% { border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%; }
          25% { border-radius: 58% 42% 75% 25% / 76% 46% 54% 24%; }
          50% { border-radius: 50% 50% 33% 67% / 55% 27% 73% 45%; }
          75% { border-radius: 33% 67% 58% 42% / 63% 68% 32% 37%; }
        }

        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 rgba(245, 197, 66, 0.0); }
          50% { box-shadow: 0 0 35px rgba(245, 197, 66, 0.35); }
        }
      `}</style>
    </div>
  );
}
