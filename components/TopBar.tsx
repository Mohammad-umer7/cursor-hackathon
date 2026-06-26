"use client";

import { motion } from "framer-motion";
import { Compass, HelpCircle, Play } from "lucide-react";
import { PERSONAS, type PersonaKey } from "@/lib/engine";
import type { ReachMeta } from "@/lib/types";

interface TopBarProps {
  meta: ReachMeta;
  persona: PersonaKey;
  onPersona: (p: PersonaKey) => void;
  onHelp: () => void;
  onRunDemo: () => void;
}

export default function TopBar({
  meta,
  persona,
  onPersona,
  onHelp,
  onRunDemo,
}: TopBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4">
      <div className="glass-strong pointer-events-auto max-w-[min(100%,520px)] rounded-2xl px-4 py-2.5 shadow-float">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
            <Compass size={18} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight text-white">
                Reach
              </span>
              <span className="text-[11px] text-white/45">
                Abu Dhabi access copilot
              </span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
            </div>
            <p className="mt-0.5 hidden text-[10px] leading-snug text-white/45 sm:block">
              Red = hard to reach essentials · Green = easy 15-minute access ·
              AI picks where to build
            </p>
            <div className="tnum mt-0.5 text-[10px] text-white/40">
              {meta.essentialCount.toLocaleString()}{" "}
              <span
                className="cursor-help underline decoration-dotted underline-offset-2"
                title="OpenStreetMap-derived places — schools, clinics, parks, transit stops."
              >
                OSM amenities
              </span>{" "}
              · {meta.districtCount.toLocaleString()} districts ·{" "}
              {meta.cellCount.toLocaleString()} cells
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2">
        <button
          onClick={onRunDemo}
          className="glass-strong flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11.5px] font-semibold text-accent shadow-float transition hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Play size={14} />
          <span className="hidden sm:inline">Run demo</span>
        </button>

        <button
          onClick={onHelp}
          title="How Reach works"
          aria-label="How Reach works"
          className="glass-strong flex h-9 w-9 items-center justify-center rounded-xl text-white/55 shadow-float transition hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <HelpCircle size={17} />
        </button>

        <div className="glass-strong flex items-center gap-1 rounded-2xl p-1 shadow-float">
          {PERSONAS.map((p) => {
            const active = p.key === persona;
            return (
              <button
                key={p.key}
                onClick={() => onPersona(p.key)}
                title={p.blurb}
                className="relative rounded-xl px-3 py-1.5 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {active && (
                  <motion.div
                    layoutId="persona-pill"
                    className="absolute inset-0 rounded-xl bg-accent/18 ring-1 ring-accent/35"
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 32,
                    }}
                  />
                )}
                <span
                  className={`relative ${
                    active ? "text-accent" : "text-white/55 hover:text-white/80"
                  }`}
                >
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
