"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import Link from "next/link";

function MagneticButton({ label }: { label: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 120, damping: 12 });
  const springY = useSpring(y, { stiffness: 120, damping: 12 });

  return (
    <motion.div
      className="inline-flex"
      style={{ x: springX, y: springY }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const dx = event.clientX - rect.left - rect.width / 2;
        const dy = event.clientY - rect.top - rect.height / 2;
        x.set(dx * 0.15);
        y.set(dy * 0.15);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <Link
        href="/auth"
        className="rounded-full bg-[#FCD34D] px-10 py-5 text-lg font-semibold text-[#1B4332] shadow-[0_25px_50px_rgba(252,211,77,0.4)] transition hover:scale-[1.02]"
      >
        {label}
      </Link>
    </motion.div>
  );
}

export default function CTASection() {
  return (
    <section className="bg-[#1B4332] py-24 text-white">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h2 className="text-4xl font-semibold sm:text-5xl">Ready to make a difference?</h2>
          <p className="mt-4 text-base text-emerald-100">
            Join hundreds of volunteers spreading the word about free food resources.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-8 flex justify-center"
        >
          <div className="animate-[pulseGlow_4s_ease-in-out_infinite]">
            <MagneticButton label="Get started — it’s free" />
          </div>
        </motion.div>

        <p className="mt-4 text-xs text-emerald-200">
          No credit card required. Just a desire to help.
        </p>
      </div>
    </section>
  );
}
