"use client";

import { motion } from "framer-motion";
import {
  X,
  Play,
  RotateCcw,
  Sparkles,
  MapPin,
  Check,
  FileText,
} from "lucide-react";
import {
  CATEGORIES,
  PERSONAS,
  type CategoryKey,
  type PersonaKey,
} from "@/lib/engine";
import type { Gap, RankedCandidate, SimResult } from "@/lib/client";
import type { RecommendResult, Parcel } from "@/lib/types";
import type { AgentStep } from "@/lib/agents";
import AgentTrace from "@/components/AgentTrace";

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
  agentSteps: AgentStep[];
  rankedCandidates: RankedCandidate[];
  simulated: boolean;
  simResult: SimResult | null;
  highlightSimulate: boolean;
  onSimulate: () => void;
  onReset: () => void;
  onClose: () => void;
  onOpenBrief: () => void;
}

function humanizeOpportunity(s: string): string {
  if (!s) return "";
  const spaced = s.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function opportunityToCategory(s: string): CategoryKey | null {
  const o = (s || "").toLowerCase();
  if (!o) return null;
  if (o.includes("school") || o.includes("educat")) return "education";
  if (o.includes("clinic") || o.includes("health") || o.includes("medical"))
    return "healthcare";
  if (
    o.includes("retail") ||
    o.includes("grocery") ||
    o.includes("shop") ||
    o.includes("mall") ||
    o.includes("market")
  )
    return "grocery";
  if (o.includes("park") || o.includes("green") || o.includes("recreation"))
    return "parks";
  if (
    o.includes("transit") ||
    o.includes("mobility") ||
    o.includes("transport") ||
    o.includes("bus") ||
    o.includes("metro") ||
    o.includes("cycle")
  )
    return "transit";
  if (o.includes("service") || o.includes("community") || o.includes("bank"))
    return "services";
  return null;
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/8 text-[10px] font-bold text-white/60 ring-1 ring-white/10">
        {n}
      </span>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
        {title}
      </h3>
    </div>
  );
}

function ScoreChip({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium ring-1 ${
        ok
          ? "bg-accent/10 text-accent ring-accent/25"
          : "bg-white/5 text-white/65 ring-white/10"
      }`}
    >
      <span className="text-white/45">{label}:</span> {value}
    </span>
  );
}

export default function Inspector({
  gap,
  persona,
  aiLoading,
  aiResult,
  aiSource,
  streamText,
  agentSteps,
  rankedCandidates,
  simulated,
  simResult,
  highlightSimulate,
  onSimulate,
  onReset,
  onClose,
  onOpenBrief,
}: InspectorProps) {
  const categoryLabel = LABELS[gap.worst];
  const personaLabel =
    PERSONAS.find((p) => p.key === persona)?.label ?? persona;
  const displayScore =
    simulated && simResult ? Math.round(simResult.accessAfter) : gap.access;

  const pick = aiResult
    ? rankedCandidates.find((c) => c.selected)?.parcel ??
      rankedCandidates[0]?.parcel
    : null;

  const flaggedCategory = opportunityToCategory(gap.opportunity);
  const priorityMatch =
    flaggedCategory !== null && flaggedCategory === gap.worst;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="glass-strong pointer-events-auto absolute right-4 top-4 bottom-4 z-30 flex w-[380px] flex-col rounded-2xl shadow-float"
    >
      <div className="flex items-center justify-between border-b border-white/8 p-4">
        <div>
          <div className="text-[15px] font-bold text-white">{gap.district}</div>
          <div className="text-[10.5px] text-white/45">Decision sequence</div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Close inspector"
        >
          <X size={16} />
        </button>
      </div>

      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
        {agentSteps.length > 0 && (
          <section className="space-y-2">
            <AgentTrace steps={agentSteps} />
          </section>
        )}

        {/* Step 1 */}
        <section className="space-y-2">
          <StepHeader n={1} title="Access gap found" />
          <p className="text-[12.5px] leading-relaxed text-white/70">
            This district has weak walk access to{" "}
            <span className="font-semibold text-white">
              {categoryLabel.toLowerCase()}
            </span>{" "}
            for the{" "}
            <span className="font-semibold text-white">{personaLabel}</span>{" "}
            persona.
          </p>
          <div className="flex flex-wrap gap-2">
            <ScoreChip label="Access" value={`${displayScore}/100`} />
            <ScoreChip label="Demand" value={`${gap.demand}/100`} />
            <ScoreChip
              label="Underserved demand"
              value={`${gap.affectedPopulation.toLocaleString()} units`}
            />
          </div>
        </section>

        {/* Step 2 */}
        <section className="space-y-2">
          <StepHeader n={2} title="Naive baseline" />
          <div className="rounded-xl bg-gap-bad/8 p-3 ring-1 ring-gap-bad/20">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gap-bad text-[9px] font-bold text-white">
                A
              </span>
              <span className="text-[12px] font-semibold text-gap-bad">
                Nearest-point math
              </span>
            </div>
            <ul className="space-y-1 text-[10.5px] text-white/55">
              <li>• Finds the closest point</li>
              <li>• Not parcel-aware</li>
              <li>• No zoning/buildability check</li>
            </ul>
          </div>
        </section>

        {/* Step 3 */}
        <section className="space-y-2">
          <StepHeader n={3} title="Reach AI recommendation" />
          <div className="rounded-xl bg-accent/8 p-3 ring-1 ring-accent/25">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-[#06281a]">
                B
              </span>
              <span className="text-[12px] font-semibold text-accent">
                Real candidate parcel
              </span>
            </div>

            {aiLoading ? (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-accent">
                  <Sparkles size={12} className="animate-pulse" />
                  Evaluating buildable parcels…
                </div>
                {streamText ? (
                  <p className="text-[11px] leading-relaxed text-white/60">
                    {streamText}
                    <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-accent align-middle" />
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {[90, 75, 85].map((w, i) => (
                      <div
                        key={i}
                        className="h-2.5 rounded animate-shimmer"
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
                  {pick && (
                    <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2 ring-1 ring-white/8">
                      <MapPin size={14} className="shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold text-white">
                          {pick.id}
                        </div>
                        <div className="truncate text-[10px] text-white/45">
                          {humanizeOpportunity(pick.land_use)} ·{" "}
                          {pick.zone} · {Math.round(pick.size).toLocaleString()}{" "}
                          m²
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                      Why this parcel wins
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <ScoreChip label="Buildability" value="Pass" ok />
                      <ScoreChip
                        label="Zoning fit"
                        value={pick ? humanizeOpportunity(pick.land_use) : "—"}
                        ok
                      />
                      {pick && (
                        <>
                          <ScoreChip
                            label="Infrastructure"
                            value={`${pick.infra}/100`}
                          />
                          <ScoreChip
                            label="Potential"
                            value={`${pick.potential}/100`}
                          />
                        </>
                      )}
                      <ScoreChip
                        label="Demand alignment"
                        value={categoryLabel}
                        ok
                      />
                      <ScoreChip
                        label="Priority match"
                        value={priorityMatch ? "Yes" : "No"}
                        ok={priorityMatch}
                      />
                    </div>
                  </div>

                  {streamText && (
                    <p className="text-[11px] leading-relaxed text-white/60">
                      {streamText}
                    </p>
                  )}

                  {priorityMatch && (
                    <div className="flex items-center gap-1 text-[10px] font-medium text-gap-good">
                      <Check size={12} />
                      Matches community flagged priority
                    </div>
                  )}

                  {aiSource && aiSource !== "groq" && (
                    <p className="text-[9.5px] text-white/35">
                      Deterministic siting — add a Groq key for live AI rationale.
                    </p>
                  )}
                </div>
              )
            )}
          </div>

          {rankedCandidates.length > 0 && !aiLoading && (
            <div className="mt-2">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Candidate ranking
              </div>
              <div className="space-y-1.5">
                {rankedCandidates.map((c) => (
                  <div
                    key={c.parcel.id}
                    className={`rounded-lg px-2.5 py-2 text-[10.5px] ring-1 ${
                      c.selected
                        ? "bg-accent/8 text-white/80 ring-accent/25"
                        : "bg-white/3 text-white/50 ring-white/8"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="tnum font-semibold text-white/70">
                        {c.rank}.
                      </span>
                      <span className="font-medium">{c.parcel.id}</span>
                      <span
                        className={`ml-auto tnum rounded px-1.5 py-0.5 text-[9.5px] font-semibold ring-1 ${
                          c.selected
                            ? "bg-accent/15 text-accent ring-accent/30"
                            : "bg-white/5 text-white/55 ring-white/10"
                        }`}
                        title="Weighted suitability score"
                      >
                        {Math.round(c.suitability * 100)}/100
                      </span>
                    </div>

                    <div className="mt-1.5 grid grid-cols-5 gap-1">
                      {(
                        [
                          ["Cover", c.scores.coverageGain],
                          ["Build", c.scores.buildability],
                          ["Infra", c.scores.infrastructure],
                          ["Near", c.scores.proximity],
                          ["Need", c.scores.equity],
                        ] as [string, number][]
                      ).map(([label, v]) => (
                        <div key={label} className="flex flex-col gap-0.5">
                          <div className="h-1 overflow-hidden rounded-full bg-white/8">
                            <div
                              className={`h-full rounded-full ${
                                c.selected ? "bg-accent/70" : "bg-white/35"
                              }`}
                              style={{ width: `${Math.round(v * 100)}%` }}
                            />
                          </div>
                          <span className="text-[8px] text-white/35">
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-1 text-[9.5px] text-white/45">
                      {c.reason}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[8.5px] leading-snug text-white/30">
                Suitability = 0.35·coverage + 0.20·buildability + 0.15·infra +
                0.15·proximity + 0.15·need (engine-computed ⚙).
              </p>
            </div>
          )}
        </section>

        {/* Step 4 */}
        <section className="space-y-2">
          <StepHeader n={4} title="Simulate impact" />
          {simulated && simResult ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-white/5 p-3 ring-1 ring-white/8"
            >
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Estimated impact
              </div>
              <div className="space-y-1.5 text-[11px] text-white/70">
                <div>
                  Access score:{" "}
                  <span className="tnum text-white">
                    {simResult.accessBefore.toFixed(1)}
                  </span>{" "}
                  →{" "}
                  <span className="tnum font-semibold text-accent">
                    {simResult.accessAfter.toFixed(1)}
                  </span>
                </div>
                <div>
                  Change:{" "}
                  <span className="tnum text-accent">
                    +
                    {(simResult.accessAfter - simResult.accessBefore).toFixed(1)}
                  </span>
                </div>
                <div>
                  Improved cells:{" "}
                  <span className="tnum text-white">
                    {simResult.affectedCellIds.length}
                  </span>
                </div>
                <div>
                  Affected demand:{" "}
                  <span className="tnum text-white">
                    {simResult.newReach.toLocaleString()}
                  </span>{" "}
                  weighted units
                </div>
                <div>Category improved: {categoryLabel}</div>
                <div>Persona: {personaLabel}</div>
              </div>
              <p className="mt-2 text-[9.5px] text-white/35">
                Estimated from the prototype dataset
              </p>
            </motion.div>
          ) : (
            <p className="text-[11px] text-white/45">
              Simulate building on the recommended parcel to see estimated access
              improvement on the map.
            </p>
          )}
        </section>
      </div>

      <div className="space-y-2 border-t border-white/8 p-4">
        {!simulated ? (
          <button
            onClick={onSimulate}
            disabled={!aiResult}
            className={`flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-[#06281a] transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 ${
              highlightSimulate && aiResult ? "simulate-cta-pulse" : ""
            }`}
          >
            <Play size={15} /> Simulate building here
          </button>
        ) : (
          <>
            <button
              onClick={onOpenBrief}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-[#06281a] transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <FileText size={15} /> Generate siting brief
            </button>
            <button
              onClick={onReset}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/8 py-2 text-[12px] font-semibold text-white/70 ring-1 ring-white/12 transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <RotateCcw size={14} /> Reset simulation
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
