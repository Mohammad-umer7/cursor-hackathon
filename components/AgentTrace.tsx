"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Settings2, Sparkles, AlertTriangle } from "lucide-react";
import type { AgentStep } from "@/lib/agents";

function StatusDot({ status }: { status: AgentStep["status"] }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
        <Check size={11} strokeWidth={3} />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
        <Loader2 size={11} className="animate-spin" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gap-bad/20 text-gap-bad">
        <AlertTriangle size={11} />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/30">
      <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
    </span>
  );
}

function EvidenceChip({
  label,
  value,
  computed,
}: {
  label: string;
  value: string;
  computed: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-medium ring-1 ${
        computed
          ? "bg-white/5 text-white/70 ring-white/10"
          : "bg-accent/10 text-accent ring-accent/25"
      }`}
      title={computed ? "Computed by the engine" : "AI-written"}
    >
      {computed ? (
        <Settings2 size={9} className="text-white/40" />
      ) : (
        <Sparkles size={9} className="text-accent/80" />
      )}
      <span className="text-white/40">{label}:</span> {value}
    </span>
  );
}

export default function AgentTrace({ steps }: { steps: AgentStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
          Agent pipeline
        </span>
        <span className="flex items-center gap-2 text-[8.5px] text-white/35">
          <span className="inline-flex items-center gap-0.5">
            <Settings2 size={9} /> computed
          </span>
          <span className="inline-flex items-center gap-0.5 text-accent/70">
            <Sparkles size={9} /> AI
          </span>
        </span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((step) => {
          const active = step.status === "running";
          return (
            <li
              key={step.id}
              className={`rounded-lg px-2.5 py-2 ring-1 transition-colors ${
                active
                  ? "bg-accent/8 ring-accent/25"
                  : step.status === "done"
                  ? "bg-white/4 ring-white/8"
                  : step.status === "error"
                  ? "bg-gap-bad/8 ring-gap-bad/20"
                  : "bg-white/[0.02] ring-white/5 opacity-60"
              }`}
            >
              <div className="flex items-center gap-2">
                <StatusDot status={step.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-white/85">
                    {step.label}
                  </div>
                  <div className="truncate text-[9.5px] text-white/40">
                    {step.role}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {step.evidence && step.evidence.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-1.5 flex flex-wrap gap-1 pl-7"
                  >
                    {step.evidence.map((e, i) => (
                      <EvidenceChip
                        key={`${e.label}-${i}`}
                        label={e.label}
                        value={e.value}
                        computed={e.computed}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {step.id === "brief-writer" && step.text && (
                <p className="mt-1.5 pl-7 text-[10.5px] leading-relaxed text-white/60">
                  {step.text}
                  {active && (
                    <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-accent align-middle" />
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
