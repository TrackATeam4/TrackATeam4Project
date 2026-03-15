"use client";

import { motion } from "framer-motion";

const quote = "You never know who needs the help. Share Lemontree with your community.";

const volunteers = [
  { name: "Priya", events: 12, flyers: 520 },
  { name: "Luis", events: 8, flyers: 310 },
  { name: "Amina", events: 15, flyers: 680 },
  { name: "Jordan", events: 6, flyers: 210 },
  { name: "Chen", events: 10, flyers: 430 },
];

export default function Testimonials() {
  return (
    <section className="bg-[#F5C542] py-20 text-[#1A1A1A]">
      <div className="mx-auto max-w-6xl px-6">
        <motion.p
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          className="text-3xl font-semibold italic sm:text-4xl"
        >
          {quote.split(" ").map((item) => (
            <motion.span
              key={item}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5 }}
              className="mr-2 inline-block"
            >
              {item}
            </motion.span>
          ))}
        </motion.p>
        <p className="mt-3 text-sm uppercase tracking-[0.3em]">— Lemontree mission</p>

        <div className="mt-10 flex gap-4 overflow-x-auto pb-4">
          {volunteers.map((volunteer) => (
            <motion.div
              key={volunteer.name}
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="min-w-[220px] rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm"
            >
              <p className="text-lg font-semibold">{volunteer.name}</p>
              <p className="mt-2 text-sm">Events attended: {volunteer.events}</p>
              <p className="text-sm">Flyers distributed: {volunteer.flyers}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
