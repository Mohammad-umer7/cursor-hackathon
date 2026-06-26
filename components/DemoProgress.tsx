"use client";

import { motion } from "framer-motion";

export type DemoStep = 1 | 2 | 3 | 4;

const LABELS: Record<DemoStep, string> = {
  1: "Access gap found",
  2: "Comparing sites",
  3: "Recommendation ready",
  4: "Impact simulated",
};

interface DemoProgressProps {
  step: DemoStep;
  onExit: () => void;
}

export default function DemoProgress({ step, onExit }: DemoProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong pointer-events-auto absolute left-1/2 top-[76px] z-30 flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 shadow-float"
    >
      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent ring-1 ring-accent/30">
        Demo
      </span>
      <span className="text-[11px] text-white/70">
        Step {step}/4 · {LABELS[step]}
      </span>
      <div className="flex gap-1">
        {([1, 2, 3, 4] as DemoStep[]).map((s) => (
          <span
            key={s}
            className={`h-1.5 w-4 rounded-full transition-colors ${
              s <= step ? "bg-accent" : "bg-white/15"
            }`}
          />
        ))}
      </div>
      <button
        onClick={onExit}
        className="ml-1 text-[10px] text-white/40 underline-offset-2 transition hover:text-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        Exit
      </button>
    </motion.div>
  );
}
