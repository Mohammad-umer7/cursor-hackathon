// Client-orchestrated multi-agent siting pipeline.
// Stages 1–4 are DETERMINISTIC (real computed numbers from lib/client + lib/engine).
// Stage 5 is the LLM Brief Writer (streamed /api/recommend, with deterministic fallback).
// The LLM never invents a number — every figure shown comes from the engine.

import { CATEGORIES } from "./engine";
import {
  rankCandidates,
  rankDistrictsForCategory,
  simulatePlacement,
  type Gap,
} from "./client";
import type { Parcel, ReachData, RecommendResult } from "./types";
import type { PersonaKey } from "./engine";

export type AgentStatus = "queued" | "running" | "done" | "error";

export interface AgentEvidence {
  label: string;
  value: string;
  computed: boolean; // true = engine-computed (⚙), false = AI-judged (✦)
}

export interface AgentStep {
  id: string;
  label: string;
  role: string;
  status: AgentStatus;
  evidence?: AgentEvidence[];
  text?: string; // streamed narrative (Brief Writer)
}

export interface PipelineContext {
  baseline: { lat: number; lng: number };
  candidates: Parcel[];
}

export interface PipelineHandlers {
  onStep: (step: AgentStep) => void;
  onResult: (result: RecommendResult, source: string) => void;
  onStreamText?: (text: string) => void;
  signal?: AbortSignal;
}

export const AGENT_DEFS: { id: string; label: string; role: string }[] = [
  { id: "gap-analyst", label: "Gap Analyst", role: "E2SFCA shortage + UDS ranking" },
  { id: "site-scout", label: "Site Scout", role: "Buildable parcel shortlist" },
  {
    id: "suitability-scorer",
    label: "Suitability Scorer",
    role: "Weighted multi-criteria scoring",
  },
  { id: "impact-modeler", label: "Impact Modeler", role: "Coverage-gain simulation" },
  { id: "brief-writer", label: "Brief Writer", role: "AI rationale (with fallback)" },
];

export function initialSteps(): AgentStep[] {
  return AGENT_DEFS.map((a) => ({ ...a, status: "queued" as AgentStatus }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tolerantly extract a partial string field from a growing JSON buffer. */
function liveField(buffer: string, field: string): string {
  const key = `"${field}"`;
  const ki = buffer.indexOf(key);
  if (ki < 0) return "";
  let i = ki + key.length;
  while (i < buffer.length && buffer[i] !== ":") i++;
  i++;
  while (i < buffer.length && /\s/.test(buffer[i])) i++;
  if (buffer[i] !== '"') return "";
  i++;
  let out = "";
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === "\\") {
      const next = buffer[i + 1];
      if (next === undefined) break;
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else out += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i++;
  }
  return out;
}

/**
 * Run the 5-agent siting pipeline for an opened gap. Emits a step event per
 * stage transition. Resolves with the final RecommendResult (also delivered via
 * handlers.onResult). Cheap stages run instantly with a small visual stagger.
 */
export async function runSitingPipeline(
  data: ReachData,
  gap: Gap,
  persona: PersonaKey,
  ctx: PipelineContext,
  handlers: PipelineHandlers,
  stepDelayMs = 320
): Promise<{ result: RecommendResult; source: string } | null> {
  const { onStep, onResult, onStreamText, signal } = handlers;
  const categoryLabel =
    CATEGORIES.find((c) => c.key === gap.worst)?.label ?? gap.worst;

  const emit = (
    id: string,
    patch: Partial<AgentStep>
  ): void => {
    const def = AGENT_DEFS.find((a) => a.id === id)!;
    onStep({ id, label: def.label, role: def.role, status: "running", ...patch });
  };

  // ---------- Stage 1: Gap Analyst (deterministic) ----------
  emit("gap-analyst", { status: "running" });
  const ranked = rankDistrictsForCategory(data, gap.worst);
  const idx = ranked.findIndex((r) => r.district === gap.district);
  const chosen = idx >= 0 ? ranked[idx] : ranked[0];
  await sleep(stepDelayMs);
  emit("gap-analyst", {
    status: "done",
    evidence: [
      { label: "Chosen district", value: gap.district, computed: true },
      {
        label: "Weakest service",
        value: categoryLabel,
        computed: true,
      },
      {
        label: "Deprivation",
        value: chosen ? `${Math.round(chosen.deprivation * 100)}% short` : "—",
        computed: true,
      },
      {
        label: "Underserved",
        value: `${gap.affectedPopulation.toLocaleString()} residents`,
        computed: true,
      },
      {
        label: "UDS rank",
        value: idx >= 0 ? `#${idx + 1} of ${ranked.length}` : "—",
        computed: true,
      },
    ],
  });
  if (signal?.aborted) return null;

  // ---------- Stage 2: Site Scout (deterministic) ----------
  emit("site-scout", { status: "running" });
  await sleep(stepDelayMs);
  const ids = ctx.candidates.slice(0, 3).map((p) => p.id);
  emit("site-scout", {
    status: "done",
    evidence: [
      {
        label: "Buildable parcels",
        value: String(ctx.candidates.length),
        computed: true,
      },
      {
        label: "Shortlist",
        value: ids.length ? ids.join(", ") : "none",
        computed: true,
      },
    ],
  });
  if (signal?.aborted) return null;

  // ---------- Stage 3: Suitability Scorer (deterministic) ----------
  emit("suitability-scorer", { status: "running" });
  await sleep(stepDelayMs);
  const scored = rankCandidates(data, gap, ctx.candidates, null, persona);
  const top = scored[0]?.parcel ?? ctx.candidates[0] ?? null;
  emit("suitability-scorer", {
    status: "done",
    evidence:
      scored.length > 0
        ? scored.slice(0, 3).map((c) => ({
            label: `#${c.rank}`,
            value: `${c.parcel.id} · ${Math.round(c.suitability * 100)}/100`,
            computed: true,
          }))
        : [{ label: "Candidates", value: "none", computed: true }],
  });
  if (signal?.aborted) return null;

  // ---------- Stage 4: Impact Modeler (deterministic) ----------
  emit("impact-modeler", { status: "running" });
  await sleep(stepDelayMs);
  if (top) {
    const sim = simulatePlacement(
      data,
      gap.district,
      gap.worst,
      { lat: top.lat, lng: top.lng },
      persona
    );
    emit("impact-modeler", {
      status: "done",
      evidence: [
        {
          label: "Newly served",
          value: `+${sim.newReach.toLocaleString()}`,
          computed: true,
        },
        {
          label: "Access",
          value: `${sim.accessBefore.toFixed(1)} → ${sim.accessAfter.toFixed(1)}`,
          computed: true,
        },
        {
          label: "Cells improved",
          value: String(sim.affectedCellIds.length),
          computed: true,
        },
      ],
    });
  } else {
    emit("impact-modeler", {
      status: "done",
      evidence: [{ label: "Impact", value: "no parcel", computed: true }],
    });
  }
  if (signal?.aborted) return null;

  // ---------- Stage 5: Brief Writer (LLM, streamed, with fallback) ----------
  emit("brief-writer", { status: "running", text: "" });
  let outcome: { result: RecommendResult; source: string } | null = null;
  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        category: gap.worst,
        categoryLabel,
        district: gap.district,
        affectedPopulation: gap.affectedPopulation,
        currentAccess: gap.access,
        demandIndex: gap.demand,
        baseline: ctx.baseline,
        // Computed analysis context so the LLM narrative stays consistent with
        // the numbers (output JSON contract unchanged).
        analysis: {
          deprivationPct: chosen ? Math.round(chosen.deprivation * 100) : null,
          udsRank: idx >= 0 ? idx + 1 : null,
          topCandidateId: top?.id ?? null,
          topSuitability: scored[0]
            ? Math.round(scored[0].suitability * 100)
            : null,
        },
        parcels: ctx.candidates.map((p) => ({
          id: p.id,
          status: p.status,
          zone: p.zone,
          land_use: p.land_use,
          size: p.size,
          lat: p.lat,
          lng: p.lng,
          infra: p.infra,
          potential: p.potential,
        })),
      }),
    });

    if (!res.body) throw new Error("no stream");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let acc = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.t === "chunk") {
          acc += msg.v;
          const live = liveField(acc, "rationale");
          const text = live || (acc.includes("{") ? "" : acc);
          if (text) {
            onStreamText?.(text);
            emit("brief-writer", { status: "running", text });
          }
        } else if (msg.t === "done") {
          const result = msg.v as RecommendResult;
          const source = msg.source ?? "groq";
          outcome = { result, source };
          onStreamText?.(result.rationale);
          onResult(result, source);
          emit("brief-writer", {
            status: "done",
            text: result.rationale,
            evidence: [
              {
                label: "Confidence",
                value: result.confidence,
                computed: false,
              },
              {
                label: "Source",
                value:
                  source === "groq" ? "Groq LLM" : "Deterministic fallback",
                computed: false,
              },
            ],
          });
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return null;
    emit("brief-writer", {
      status: "error",
      evidence: [{ label: "Error", value: "rationale unavailable", computed: false }],
    });
  }

  return outcome;
}
