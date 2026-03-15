"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

const toolPills = [
  "🔍 Searched pantries",
  "📄 Generated flyer",
  "📨 Drafted invites",
  "🗺️ Assigned zones",
];

export default function AIShowcase() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [80, -80]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#1B4332] py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FCD34D]">AI-powered</p>
          <h2 className="mt-4 text-4xl font-semibold text-white sm:text-5xl">
            Your campaign copilot.
          </h2>
          <p className="mt-4 text-base text-emerald-100">
            Tell our AI agent where and when you want to flyer. It finds real food pantries nearby, generates branded flyers, drafts invite messages, and assigns volunteer zones — all in one conversation.
          </p>
        </motion.div>

        <motion.div style={{ y }} className="relative">
          <div className="rounded-3xl border border-white/10 bg-[#0F2419] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6 }}
                className="ml-auto w-fit max-w-[80%] rounded-2xl bg-[#10B981] px-4 py-3 text-sm text-white"
              >
                I want to flyer near Times Square this Saturday with 4 people.
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="w-fit max-w-[85%] rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-emerald-50"
              >
                Great! I found 8 food pantries nearby. Here’s what I’ve set up and who to invite.
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: 0.35 }}
                className="flex flex-wrap gap-2"
              >
                {toolPills.map((pill, index) => (
                  <motion.span
                    key={pill}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                    className="rounded-full bg-[#1B4332] px-3 py-1 text-xs text-emerald-100"
                  >
                    {pill}
                  </motion.span>
                ))}
              </motion.div>
            </div>
          </div>
          <div className="absolute -bottom-8 -left-12 h-32 w-32 rounded-full bg-[#FCD34D]/30 blur-2xl" />
        </motion.div>
      </div>
    </section>
  );
}
