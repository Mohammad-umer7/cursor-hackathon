"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HeartPulse,
  GraduationCap,
  ShoppingCart,
  Trees,
  Bus,
  Landmark,
  ChevronDown,
  Target,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES, type CategoryKey } from "@/lib/engine";
import { categoryGapLabel } from "@/lib/copy";
import type { Gap } from "@/lib/client";
import AskBox from "./AskBox";

const ICONS: Record<CategoryKey, LucideIcon> = {
  healthcare: HeartPulse,
  education: GraduationCap,
  grocery: ShoppingCart,
  parks: Trees,
  transit: Bus,
  services: Landmark,
};

const LABELS: Record<CategoryKey, string> = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c.label;
  return acc;
}, {} as Record<CategoryKey, string>);

interface LeftRailProps {
  activeCategories: Set<CategoryKey>;
  onToggle: (key: CategoryKey) => void;
  gaps: Gap[];
  selectedDistrict: string | null;
  selectedCategory: CategoryKey | null;
  onSelectGap: (gap: Gap) => void;
  asking: boolean;
  onAsk: (question: string) => void;
}

function severityColor(access: number): string {
  if (access < 45) return "#ef4444";
  if (access < 65) return "#f59e0b";
  return "#22c55e";
}

export default function LeftRail({
  activeCategories,
  onToggle,
  gaps,
  selectedDistrict,
  selectedCategory,
  onSelectGap,
  asking,
  onAsk,
}: LeftRailProps) {
  const [filtersOpen, setFiltersOpen] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  const taskText =
    selectedDistrict && selectedCategory
      ? `Fix ${LABELS[selectedCategory].toLowerCase()} access in ${selectedDistrict}.`
      : "Find the best parcel for the next essential facility.";

  return (
    <div className="pointer-events-none absolute left-4 top-[100px] bottom-4 z-20 flex w-[300px] flex-col gap-3">
      {/* Current task */}
      <div className="glass pointer-events-auto rounded-2xl p-3 shadow-float">
        <div className="mb-1.5 flex items-center gap-1.5 text-accent">
          <Target size={13} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
            Current task
          </span>
        </div>
        <p className="text-[12px] leading-snug text-white/75">{taskText}</p>
      </div>

      {/* Worst gaps */}
      <div className="glass pointer-events-auto flex min-h-0 flex-1 flex-col rounded-2xl p-3 shadow-float">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/55">
          Worst gaps to fix
        </div>
        <div className="scroll-thin -mr-1 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {gaps.slice(0, 10).map((gap, i) => {
            const selected = gap.district === selectedDistrict;
            const gapLabel = categoryGapLabel(gap.worst);
            return (
              <motion.button
                key={gap.district}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.035, duration: 0.25 }}
                onClick={() => onSelectGap(gap)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  selected
                    ? "bg-accent/12 ring-accent/35"
                    : "bg-white/4 ring-white/6 hover:bg-white/7"
                }`}
              >
                <span className="tnum w-5 shrink-0 text-center text-[11px] font-semibold text-white/35">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-white/90">
                    {gap.district}
                  </span>
                  <span className="block truncate text-[10px] text-white/45">
                    {gapLabel} · demand{" "}
                    {gap.affectedPopulation.toLocaleString()} units
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className="tnum block text-[16px] font-bold leading-none"
                    style={{ color: severityColor(gap.access) }}
                  >
                    {gap.access}
                  </span>
                  <span className="block text-[8px] uppercase tracking-wider text-white/35">
                    Access
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Collapsible map filters */}
      <div className="glass pointer-events-auto rounded-2xl shadow-float">
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-expanded={filtersOpen}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
            Map filters
          </span>
          <ChevronDown
            size={14}
            className={`text-white/40 transition-transform ${
              filtersOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
                {CATEGORIES.map((c) => {
                  const Icon = ICONS[c.key];
                  const active = activeCategories.has(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => onToggle(c.key)}
                      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        active
                          ? "bg-white/8 ring-white/12"
                          : "bg-transparent ring-white/5 opacity-45 hover:opacity-70"
                      }`}
                    >
                      <span style={{ color: active ? c.color : "#9aa6b8" }}>
                        <Icon size={17} />
                      </span>
                      <span
                        className={active ? "text-white/85" : "text-white/45"}
                      >
                        {LABELS[c.key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pointer-events-auto">
        <AskBox asking={asking} onAsk={onAsk} />
      </div>
    </div>
  );
}
