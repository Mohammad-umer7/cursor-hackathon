"use client";

import { motion } from "framer-motion";
import { Map as MapIcon, MousePointerClick, Play, X } from "lucide-react";

interface IntroOverlayProps {
  onExample: () => void;
  onDismiss: () => void;
  canExample: boolean;
}

const STEPS = [
  {
    icon: MapIcon,
    text: "Red = underserved, green = a 15-minute walk to essentials.",
  },
  {
    icon: MousePointerClick,
    text: "Click a red zone on the map (or a district in Top access gaps).",
  },
  {
    icon: Play,
    text: "See the AI's site pick vs. naive distance-math, then hit Simulate to watch the gap heal.",
  },
];

export default function IntroOverlay({
  onExample,
  onDismiss,
  canExample,
}: IntroOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="glass-strong relative w-full max-w-[480px] rounded-2xl p-6 shadow-float"
      >
        <button
          onClick={onDismiss}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-white/40 transition hover:bg-white/8 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="pr-8 text-[19px] font-bold leading-tight text-white">
          Reach — where should Abu Dhabi build next?
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/60">
          We map where residents can&apos;t reach essential services on foot —
          then AI picks the real parcel to build on to fix the gap.
        </p>

        <div className="mt-5 space-y-2.5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/25">
                  <Icon size={15} />
                </span>
                <p className="pt-1 text-[12px] leading-snug text-white/70">
                  {s.text}
                </p>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-[10.5px] leading-snug text-white/35">
          Amenities are real OpenStreetMap data. Community and parcel figures are
          illustrative.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={onExample}
            disabled={!canExample}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-[#06281a] transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          >
            Show me an example →
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl bg-white/8 py-2.5 text-[13px] font-semibold text-white/80 ring-1 ring-white/12 transition hover:bg-white/12"
          >
            Explore on my own
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
