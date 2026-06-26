"use client";

import { motion } from "framer-motion";
import { X, Play, RotateCcw, Sparkles, MapPin } from "lucide-react";
import { CATEGORIES, PERSONAS, type CategoryKey, type PersonaKey } from "@/lib/engine";
import type { Gap, SimResult } from "@/lib/client";
import type { RecommendResult, Parcel } from "@/lib/types";
import CountUp from "./CountUp";

const LABELS: Record<CategoryKey, string> = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c.label;
  return acc;
}, {} as Record<CategoryKey, string>);

interface InspectorProps {
  gap: Gap;
  persona: PersonaKey;
  aiLoading: boolean;
  aiResult: RecommendResult | null;
  aiSource: string | null;
  streamText: string;
  candidates: Parcel[];
  simulated: boolean;
  simResult: SimResult | null;
  narration: string;
  onSimulate: () => void;
  onReset: () => void;
  onClose: () => void;
}

function Ring({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = c * pct;
  const color =
    score < 45 ? "#ef4444" : score < 65 ? "#f59e0b" : "#22c55e";
  return (
    <div className="relative flex h-[68px] w-[68px] items-center justify-center">
      <svg width="68" height="68" className="-rotate-90">
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <motion.circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="tnum text-[18px] font-bold leading-none text-white">
          {Math.round(score)}
        </span>
        <span className="text-[7px] uppercase tracking-wider text-white/40">
          access
        </span>
      </div>
    </div>
  );
}

function confidenceColor(c: string): string {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "#f59e0b";
  return "#ef4444";
}

export default function Inspector({
  gap,
  persona,
  aiLoading,
  aiResult,
  aiSource,
  streamText,
  candidates,
  simulated,
  simResult,
  narration,
  onSimulate,
  onReset,
  onClose,
}: InspectorProps) {
  const categoryLabel = LABELS[gap.worst];
  const personaLabel =
    PERSONAS.find((p) => p.key === persona)?.label.toLowerCase() ?? persona;
  const displayScore =
    simulated && simResult ? simResult.accessAfter : gap.access;

  const pick = aiResult
    ? candidates.find((p) => p.id === aiResult.recommended_parcel_id)
    : null;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="glass-strong pointer-events-auto absolute right-4 top-4 bottom-4 z-30 flex w-[380px] flex-col rounded-2xl shadow-float"
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-white/8 p-4">
        <Ring score={displayScore} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-bold text-white">
            {gap.district}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-gap-bad/15 px-1.5 py-0.5 text-[10px] font-medium text-gap-bad ring-1 ring-gap-bad/25">
              weak: {categoryLabel}
            </span>
            <span className="tnum text-[10.5px] text-white/45">
              demand {gap.demand}/100
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/8 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>

      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        {/* Diagnosis */}
        <p className="text-[12.5px] leading-relaxed text-white/65">
          About{" "}
          <span className="font-semibold text-white">
            {gap.affectedPopulation.toLocaleString()}
          </span>{" "}
          residents in {gap.district} fall outside a comfortable walk of{" "}
          <span className="font-semibold text-white">
            {categoryLabel.toLowerCase()}
          </span>
          . With a service-demand index of{" "}
          <span className="font-semibold text-white">{gap.demand}</span>/100,
          this is a priority {categoryLabel.toLowerCase()} desert for the{" "}
          {personaLabel} persona.
        </p>

        {/* Baseline vs Reach AI */}
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
            Baseline vs Reach AI
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gap-bad/8 p-2.5 ring-1 ring-gap-bad/20">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gap-bad text-[9px] font-bold text-white">
                  A
                </span>
                <span className="text-[11px] font-semibold text-gap-bad">
                  Baseline
                </span>
              </div>
              <p className="text-[10px] leading-snug text-white/45">
                Nearest-distance math. Ignores whether you can build there.
              </p>
            </div>
            <div className="rounded-xl bg-accent/8 p-2.5 ring-1 ring-accent/25">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-[#06281a]">
                  B
                </span>
                <span className="text-[11px] font-semibold text-accent">
                  Reach AI
                </span>
              </div>
              <p className="text-[10px] leading-snug text-white/45">
                Real buildable parcel, zoning-aware.
              </p>
            </div>
          </div>
        </div>

        {/* AI rationale */}
        {aiLoading ? (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-accent">
              <Sparkles size={12} className="animate-pulse" />
              Reach AI is siting the facility…
            </div>
            {streamText ? (
              <p className="text-[12px] leading-relaxed text-white/70">
                {streamText}
                <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-accent align-middle" />
              </p>
            ) : (
              <div className="space-y-2">
                {[90, 80, 95, 60].map((w, i) => (
                  <div
                    key={i}
                    className="h-3 rounded animate-shimmer"
                    style={{
                      width: `${w}%`,
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%)",
                      backgroundSize: "200% 100%",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          aiResult && (
            <div className="space-y-3">
              {/* parcel chip */}
              {pick && (
                <div className="flex items-center gap-2.5 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/8">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-accent/25">
                    <MapPin size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-white">
                      {pick.id}
                    </div>
                    <div className="truncate text-[10px] text-white/45">
                      {pick.status.replace(/_/g, " ")} ·{" "}
                      {pick.land_use.replace(/_/g, " ")} ·{" "}
                      {Math.round(pick.size).toLocaleString()} m²
                    </div>
                  </div>
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1"
                    style={{
                      color: confidenceColor(aiResult.confidence),
                      borderColor: confidenceColor(aiResult.confidence) + "55",
                    }}
                  >
                    {aiResult.confidence}
                  </span>
                </div>
              )}

              {/* rationale */}
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                  Rationale
                </div>
                <p className="text-[12px] leading-relaxed text-white/70">
                  {streamText || aiResult.rationale}
                </p>
              </div>

              {/* why better */}
              <div className="rounded-xl bg-accent/8 p-2.5 ring-1 ring-accent/20">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent/80">
                  Why it beats the baseline
                </div>
                <p className="text-[11.5px] leading-relaxed text-white/70">
                  {aiResult.why_better_than_baseline}
                </p>
              </div>

              {aiSource && aiSource !== "groq" && (
                <p className="text-[10px] italic text-white/35">
                  (Groq key not set — deterministic fallback siting shown.)
                </p>
              )}
            </div>
          )
        )}

        {/* Engine-computed impact */}
        {simulated && simResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
              Engine-computed impact
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-accent/10 p-3 ring-1 ring-accent/20">
                <div className="tnum text-[20px] font-bold text-accent">
                  +<CountUp value={simResult.newReach} />
                </div>
                <div className="text-[10px] leading-snug text-white/50">
                  residents newly in reach
                </div>
              </div>
              <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/8">
                <div className="tnum text-[15px] font-bold text-white">
                  <CountUp value={simResult.accessBefore} decimals={1} /> →{" "}
                  <span className="text-accent">
                    <CountUp value={simResult.accessAfter} decimals={1} />
                  </span>
                </div>
                <div className="text-[10px] leading-snug text-white/50">
                  district access score
                </div>
              </div>
            </div>
            {narration && (
              <p className="text-[12px] leading-relaxed text-accent/90">
                {narration}
              </p>
            )}
          </motion.div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-white/8 p-4">
        {!simulated ? (
          <button
            onClick={onSimulate}
            disabled={!aiResult}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-[#06281a] transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
          >
            <Play size={15} /> Simulate placement
          </button>
        ) : (
          <button
            onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/8 py-2.5 text-[13px] font-semibold text-white/80 ring-1 ring-white/12 transition hover:bg-white/12"
          >
            <RotateCcw size={15} /> Reset simulation
          </button>
        )}
      </div>
    </motion.div>
  );
}
