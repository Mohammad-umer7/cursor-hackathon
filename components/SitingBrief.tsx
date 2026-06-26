"use client";

import { motion } from "framer-motion";
import { Copy, X, Settings2, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { CATEGORIES, PERSONAS, type CategoryKey, type PersonaKey } from "@/lib/engine";
import type { Gap, SimResult } from "@/lib/client";
import type { Parcel, RecommendResult } from "@/lib/types";

const LABELS: Record<CategoryKey, string> = CATEGORIES.reduce((acc, c) => {
  acc[c.key] = c.label;
  return acc;
}, {} as Record<CategoryKey, string>);

interface SitingBriefProps {
  gap: Gap;
  persona: PersonaKey;
  pick: Parcel | null;
  aiResult: RecommendResult;
  simResult: SimResult | null;
  priorityMatch: boolean;
  onClose: () => void;
}

function humanize(s: string): string {
  if (!s) return "—";
  const spaced = s.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function Tag({ computed }: { computed: boolean }) {
  return (
    <span
      className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 align-middle text-[8px] font-medium ${
        computed ? "bg-white/8 text-white/55" : "bg-accent/15 text-accent"
      }`}
      title={computed ? "Computed by the engine" : "AI-written"}
    >
      {computed ? <Settings2 size={8} /> : <Sparkles size={8} />}
      {computed ? "computed" : "AI"}
    </span>
  );
}

function buildBriefText(props: SitingBriefProps): string {
  const { gap, persona, pick, aiResult, simResult, priorityMatch } = props;
  const categoryLabel = LABELS[gap.worst];
  const personaLabel =
    PERSONAS.find((p) => p.key === persona)?.label ?? persona;
  const lines: string[] = [];

  lines.push("SITING BRIEF — Reach prototype");
  lines.push("");
  lines.push("PROBLEM");
  lines.push(`District: ${gap.district}`);
  lines.push(`Weakest category: ${categoryLabel}`);
  lines.push(`Access score: ${gap.access}/100`);
  lines.push(`Demand score: ${gap.demand}/100`);
  lines.push(`Persona: ${personaLabel}`);
  lines.push("");
  lines.push("RECOMMENDED PARCEL");
  if (pick) {
    lines.push(`Parcel ID: ${pick.id}`);
    lines.push(`Land use: ${humanize(pick.land_use)}`);
    lines.push(`Zone: ${pick.zone}`);
    lines.push(`Infrastructure: ${pick.infra}/100`);
    lines.push(`Potential: ${pick.potential}/100`);
  } else {
    lines.push(`Parcel ID: ${aiResult.recommended_parcel_id}`);
  }
  lines.push("");
  lines.push("WHY NOT THE BASELINE");
  lines.push("• Nearest-point math");
  lines.push("• Not parcel-aware");
  lines.push("• No zoning/buildability validation");
  lines.push("");
  lines.push("WHY REACH SELECTED THIS");
  lines.push(aiResult.why_better_than_baseline);
  if (pick) {
    lines.push(`• Buildable ${humanize(pick.status)} candidate`);
    lines.push(`• Infrastructure ${pick.infra}/100, potential ${pick.potential}/100`);
  }
  if (priorityMatch) {
    lines.push("• Aligns with community flagged priority");
  }
  lines.push("");
  lines.push("ESTIMATED IMPACT");
  if (simResult) {
    lines.push(
      `Access score: ${simResult.accessBefore.toFixed(1)} → ${simResult.accessAfter.toFixed(1)}`
    );
    lines.push(
      `Change: +${(simResult.accessAfter - simResult.accessBefore).toFixed(1)}`
    );
    lines.push(`Improved cells: ${simResult.affectedCellIds.length}`);
    lines.push(
      `Affected demand: ${simResult.newReach.toLocaleString()} weighted units`
    );
  } else {
    lines.push("(Run simulation to populate impact figures)");
  }
  lines.push(`Category improved: ${categoryLabel}`);
  lines.push(`Persona: ${personaLabel}`);
  lines.push("");
  lines.push("DATA NOTE");
  lines.push(
    "Amenities are OpenStreetMap-derived. Community, listing, and parcel figures are illustrative prototype data."
  );

  return lines.join("\n");
}

export default function SitingBrief(props: SitingBriefProps) {
  const { gap, persona, pick, aiResult, simResult, priorityMatch, onClose } =
    props;
  const [copied, setCopied] = useState(false);
  const categoryLabel = LABELS[gap.worst];
  const personaLabel =
    PERSONAS.find((p) => p.key === persona)?.label ?? persona;

  const copy = useCallback(async () => {
    const text = buildBriefText(props);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [props]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong relative flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-2xl shadow-float"
      >
        <div className="flex items-center justify-between border-b border-white/8 p-4">
          <h2 className="text-[17px] font-bold text-white">Siting brief</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label="Close brief"
          >
            <X size={16} />
          </button>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4 text-[12px] leading-relaxed text-white/70">
          <section>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Problem
              <Tag computed />
            </h3>
            <ul className="space-y-0.5">
              <li>
                <span className="text-white/45">District:</span>{" "}
                <span className="text-white">{gap.district}</span>
              </li>
              <li>
                <span className="text-white/45">Weakest category:</span>{" "}
                {categoryLabel}
              </li>
              <li>
                <span className="text-white/45">Access score:</span>{" "}
                {gap.access}/100
              </li>
              <li>
                <span className="text-white/45">Demand score:</span>{" "}
                {gap.demand}/100
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Recommended parcel
              <Tag computed />
            </h3>
            {pick ? (
              <ul className="space-y-0.5">
                <li>
                  <span className="text-white/45">Parcel ID:</span> {pick.id}
                </li>
                <li>
                  <span className="text-white/45">Land use:</span>{" "}
                  {humanize(pick.land_use)}
                </li>
                <li>
                  <span className="text-white/45">Infrastructure:</span>{" "}
                  {pick.infra}/100
                </li>
                <li>
                  <span className="text-white/45">Potential:</span>{" "}
                  {pick.potential}/100
                </li>
              </ul>
            ) : (
              <p>{aiResult.recommended_parcel_id}</p>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Why not the baseline
            </h3>
            <ul className="list-inside list-disc space-y-0.5 text-white/60">
              <li>Nearest-point math</li>
              <li>Not parcel-aware</li>
              <li>No zoning/buildability validation</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Why Reach selected this
              <Tag computed={false} />
            </h3>
            <p>{aiResult.why_better_than_baseline}</p>
            {pick && (
              <p className="mt-1 text-white/55">
                Buildable {humanize(pick.status)} candidate with infrastructure{" "}
                {pick.infra}/100 and potential {pick.potential}/100.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Estimated impact
              <Tag computed />
            </h3>
            {simResult ? (
              <ul className="space-y-0.5">
                <li>
                  Access score: {simResult.accessBefore.toFixed(1)} →{" "}
                  <span className="text-accent">
                    {simResult.accessAfter.toFixed(1)}
                  </span>
                </li>
                <li>
                  Change: +
                  {(simResult.accessAfter - simResult.accessBefore).toFixed(1)}
                </li>
                <li>Improved cells: {simResult.affectedCellIds.length}</li>
                <li>
                  Affected demand: {simResult.newReach.toLocaleString()} weighted
                  units
                </li>
                <li>Category improved: {categoryLabel}</li>
                <li>Persona: {personaLabel}</li>
              </ul>
            ) : (
              <p className="text-white/45">
                Run simulation first to populate impact figures.
              </p>
            )}
            <p className="mt-1 text-[10px] text-white/35">
              Estimated from the prototype dataset
            </p>
          </section>

          <section className="rounded-lg bg-white/4 p-2.5 ring-1 ring-white/8">
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
              Data note
            </h3>
            <p className="text-[10.5px] text-white/45">
              Amenities are OpenStreetMap-derived. Community, listing, and parcel
              figures are illustrative prototype data.
            </p>
          </section>
        </div>

        <div className="border-t border-white/8 p-4">
          <button
            onClick={copy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-[#06281a] transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <Copy size={15} />
            {copied ? "Copied!" : "Copy brief"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
