"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Layers,
  Map,
  FileText,
  Users,
  X,
  Loader2,
} from "lucide-react";

export type WorkbenchMode = "explain" | "demo" | "brief";

const BEFORE_ITEMS = [
  { icon: Map, label: "Maps" },
  { icon: FileSpreadsheet, label: "Spreadsheets" },
  { icon: FileText, label: "Parcel files" },
  { icon: Users, label: "Community reports" },
  { icon: Layers, label: "GIS layers" },
];

const OUTPUT_ITEMS = [
  "Worst access gap",
  "Recommended parcel",
  "Baseline comparison",
  "Estimated impact",
  "Siting brief",
];

const DEMO_STEPS = [
  "Scanning the access map",
  "Reading community demand signals",
  "Checking OpenStreetMap-derived amenities",
  "Filtering candidate parcels",
  "Comparing naive baseline vs Reach parcel",
  "Estimating access improvement",
  "Preparing the siting brief",
];

const BRIEF_STEPS = [
  "Access gap",
  "Parcel recommendation",
  "Baseline limitation",
  "Simulation result",
  "Data note",
];

const DEMO_STEP_MS = 850;
const BRIEF_STEP_MS = 350;

export interface PlanningWorkbenchOverlayProps {
  open: boolean;
  mode: WorkbenchMode;
  onClose: () => void;
  onRunDemo?: () => void;
  onSkip?: () => void;
  onComplete?: () => void;
}

function LayerCard({
  icon: Icon,
  label,
  muted,
}: {
  icon: typeof Map;
  label: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 ${
        muted
          ? "bg-white/4 ring-white/8 text-white/50"
          : "bg-accent/8 ring-accent/20 text-white/75"
      }`}
    >
      <Icon size={12} className={muted ? "text-white/35" : "text-accent/80"} />
      <span className="text-[10.5px] font-medium">{label}</span>
    </div>
  );
}

export default function PlanningWorkbenchOverlay({
  open,
  mode,
  onClose,
  onRunDemo,
  onSkip,
  onComplete,
}: PlanningWorkbenchOverlayProps) {
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(-1);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const steps = mode === "brief" ? BRIEF_STEPS : DEMO_STEPS;
  const stepMs = mode === "brief" ? BRIEF_STEP_MS : DEMO_STEP_MS;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearTimer();
    setDone(true);
    setActiveStep(steps.length);
    if (mode === "demo" || mode === "brief") {
      onComplete?.();
    }
  }, [clearTimer, mode, onComplete, steps.length]);

  const skipAnimation = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearTimer();
    setActiveStep(steps.length);
    setDone(true);
    onSkip?.();
  }, [clearTimer, onSkip, steps.length]);

  useEffect(() => {
    if (!open) {
      clearTimer();
      setActiveStep(-1);
      setDone(false);
      completedRef.current = false;
      return;
    }

    if (mode === "explain") return;

    completedRef.current = false;
    setDone(false);

    if (reduceMotion) {
      setActiveStep(steps.length);
      setDone(true);
      const t = setTimeout(() => onComplete?.(), mode === "brief" ? 0 : 50);
      return () => clearTimeout(t);
    }

    let i = 0;
    setActiveStep(0);

    const tick = () => {
      i += 1;
      if (i >= steps.length) {
        finish();
        return;
      }
      setActiveStep(i);
      timerRef.current = setTimeout(tick, stepMs);
    };

    timerRef.current = setTimeout(tick, stepMs);
    return clearTimer;
  }, [open, mode, reduceMotion, steps.length, stepMs, clearTimer, finish, onComplete]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const title =
    mode === "brief"
      ? "Compiling siting evidence"
      : "Reach Planning Workbench";

  const subtitle =
    mode === "brief"
      ? "Assembling the planning brief from prototype layers."
      : "From scattered planning layers to one siting decision.";

  const showFullLayout = mode !== "brief";
  const showChecklist = mode !== "explain";
  const allComplete = done || activeStep >= steps.length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workbench-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`glass-strong relative w-full rounded-2xl shadow-[0_0_40px_-8px_rgba(61,220,151,0.15)] ring-1 ring-white/10 ${
              mode === "brief" ? "max-w-[400px] p-5" : "max-w-[640px] p-5 sm:p-6"
            }`}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-white/40 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              aria-label="Close workbench"
            >
              <X size={16} />
            </button>

            <h2
              id="workbench-title"
              className="pr-8 text-[17px] font-bold leading-tight text-white sm:text-[18px]"
            >
              {title}
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
              {subtitle}
            </p>

            {showFullLayout && (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-2">
                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Before Reach
                  </div>
                  <div className="space-y-1.5">
                    {BEFORE_ITEMS.map((item) => (
                      <LayerCard
                        key={item.label}
                        icon={item.icon}
                        label={item.label}
                        muted
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-center py-1 sm:px-1 sm:pt-8">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <span className="text-[10px] font-medium text-white/50">
                      Reach combines them
                    </span>
                    <ArrowRight
                      size={18}
                      className="hidden text-accent sm:block"
                    />
                    <ArrowRight
                      size={18}
                      className="rotate-90 text-accent sm:hidden"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-accent/70">
                    Decision output
                  </div>
                  <div className="space-y-1.5">
                    {OUTPUT_ITEMS.map((label) => (
                      <div
                        key={label}
                        className="rounded-lg bg-accent/8 px-2.5 py-1.5 text-[10.5px] font-medium text-white/80 ring-1 ring-accent/20"
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {showChecklist && (
              <div
                className={`${showFullLayout ? "mt-5 border-t border-white/8 pt-4" : "mt-4"}`}
              >
                <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                  {mode === "brief"
                    ? "Compiling sections"
                    : "What Reach is doing"}
                </div>
                <ul className="space-y-1.5" aria-live="polite">
                  {steps.map((label, i) => {
                    const isComplete = allComplete || i < activeStep;
                    const isActive =
                      !allComplete && i === activeStep && activeStep >= 0;
                    return (
                      <li
                        key={label}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                          isActive
                            ? "bg-accent/10 ring-1 ring-accent/30"
                            : isComplete
                              ? "bg-white/4"
                              : "opacity-40"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            isComplete
                              ? "bg-accent/20 text-accent"
                              : isActive
                                ? "bg-white/10 text-white/60"
                                : "bg-white/5 text-white/30"
                          }`}
                        >
                          {isComplete ? (
                            <Check size={11} strokeWidth={3} />
                          ) : isActive ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <span className="text-[9px] font-bold">{i + 1}</span>
                          )}
                        </span>
                        <span
                          className={`text-[11px] ${
                            isComplete
                              ? "text-white/75"
                              : isActive
                                ? "text-white/90"
                                : "text-white/45"
                          }`}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {allComplete && mode === "demo" && (
                  <p className="mt-3 text-center text-[12px] font-semibold text-accent">
                    Decision ready
                  </p>
                )}

                {mode === "demo" && !allComplete && !reduceMotion && (
                  <button
                    onClick={skipAnimation}
                    className="mt-3 w-full text-center text-[11px] text-white/40 underline-offset-2 transition hover:text-white/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    Skip animation
                  </button>
                )}
              </div>
            )}

            {showFullLayout && (
              <>
                <p className="mt-4 text-[10.5px] leading-snug text-white/40">
                  Reach does not replace planners. It gives them a faster
                  evidence-backed shortlist.
                </p>
                <p className="mt-1.5 text-[10px] leading-snug text-white/30">
                  Amenities are OpenStreetMap-derived. Community and parcel
                  figures are illustrative for this prototype.
                </p>
              </>
            )}

            {mode === "explain" && (
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={onRunDemo}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-[#06281a] transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  Run demo now
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl bg-white/8 py-2.5 text-[13px] font-semibold text-white/75 ring-1 ring-white/12 transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                >
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
