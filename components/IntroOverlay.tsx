"use client";

import { motion } from "framer-motion";
import { Map as MapIcon, MousePointerClick, Play, X } from "lucide-react";

interface IntroOverlayProps {
  onDemo: () => void;
  onDismiss: () => void;
  canDemo: boolean;
}

const STEPS = [
  { icon: MapIcon, text: "Red = hard to reach essentials" },
  {
    icon: MousePointerClick,
    text: "Reach compares naive distance math vs. a real parcel",
  },
  {
    icon: Play,
    text: "Simulate the build and generate a siting brief",
  },
];

export default function IntroOverlay({
  onDemo,
  onDismiss,
  canDemo,
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
          className="absolute right-4 top-4 rounded-lg p-1.5 text-white/40 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="pr-8 text-[19px] font-bold leading-tight text-white">
          Where should Abu Dhabi build next?
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/60">
          Reach finds service-access deserts, chooses a real parcel, and
          simulates how much the gap improves.
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
          Amenities are OpenStreetMap-derived. Community and parcel figures are
          illustrative for this prototype.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={onDemo}
            disabled={!canDemo}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-[#06281a] transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          >
            Run 60-second demo
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl bg-white/8 py-2.5 text-[13px] font-semibold text-white/80 ring-1 ring-white/12 transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            Explore manually
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
