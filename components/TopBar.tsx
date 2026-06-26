"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import { PERSONAS, type PersonaKey } from "@/lib/engine";
import type { ReachMeta } from "@/lib/types";

interface TopBarProps {
  meta: ReachMeta;
  persona: PersonaKey;
  onPersona: (p: PersonaKey) => void;
}

export default function TopBar({ meta, persona, onPersona }: TopBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-4 p-4">
      <div className="glass-strong pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2.5 shadow-float">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
          <Compass size={18} />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
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
          <div className="tnum text-[10.5px] text-white/45">
            {meta.essentialCount.toLocaleString()} real amenities ·{" "}
            {meta.districtCount.toLocaleString()} districts ·{" "}
            {meta.cellCount.toLocaleString()} cells
          </div>
        </div>
      </div>

      <div className="glass-strong pointer-events-auto flex items-center gap-1 rounded-2xl p-1 shadow-float">
        {PERSONAS.map((p) => {
          const active = p.key === persona;
          return (
            <button
              key={p.key}
              onClick={() => onPersona(p.key)}
              title={p.blurb}
              className="relative rounded-xl px-3 py-1.5 text-[12px] font-medium transition-colors"
            >
              {active && (
                <motion.div
                  layoutId="persona-pill"
                  className="absolute inset-0 rounded-xl bg-accent/18 ring-1 ring-accent/35"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
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
  );
}
