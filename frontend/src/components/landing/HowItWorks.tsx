"use client";

import { motion } from "framer-motion";

const cards = [
  {
    title: "Launch campaigns",
    description: "Create and manage neighborhood outreach campaigns in minutes.",
    emoji: "🚀",
  },
  {
    title: "Rally your crew",
    description: "Invite volunteers, assign roles, and coordinate schedules effortlessly.",
    emoji: "🤝",
  },
  {
    title: "Track your impact",
    description: "See real-time stats on turnout, reach, and community engagement.",
    emoji: "📊",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-[#FFF8E1] py-20">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#6B7280]">How it works</p>
          <h2 className="mt-4 text-4xl font-semibold text-[#1A1A1A] sm:text-5xl">
            Built for communities that show up.
          </h2>
          <p className="mt-4 max-w-2xl text-base text-[#6B7280]">
            Lemontree helps neighborhood leaders coordinate volunteers, plan outreach, and drive real change — from flyer drops to food pantries.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {cards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className="group relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-8 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEF3C7] text-2xl">
                {card.emoji}
              </div>
              <h3 className="mt-6 text-xl font-semibold text-[#1A1A1A]">{card.title}</h3>
              <p className="mt-3 text-sm text-[#6B7280]">{card.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
