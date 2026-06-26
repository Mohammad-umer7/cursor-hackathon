"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick } from "lucide-react";
import type { CategoryKey, PersonaKey } from "@/lib/engine";
import { CATEGORIES, CATEGORY_THRESHOLDS } from "@/lib/engine";
import type { Parcel, ReachData, RecommendResult } from "@/lib/types";
import {
  baselinePoint,
  candidateParcels,
  pickDemoGap,
  rankCandidates,
  rankGaps,
  simulatePlacement,
  targetForDistrict,
  unservedCellsOf,
  worstDistrictForCategory,
  type Gap,
  type SimResult,
} from "@/lib/client";
import { zonePolygonFC, ringFC, type FC } from "@/lib/geo";
import MapCanvas, { type MapHandle } from "@/components/MapCanvas";
import TopBar from "@/components/TopBar";
import LeftRail from "@/components/LeftRail";
import Legend from "@/components/Legend";
import Inspector from "@/components/Inspector";
import IntroOverlay from "@/components/IntroOverlay";
import DemoProgress, { type DemoStep } from "@/components/DemoProgress";
import SitingBrief from "@/components/SitingBrief";
import PlanningWorkbenchOverlay, {
  type WorkbenchMode,
} from "@/components/PlanningWorkbenchOverlay";
import {
  runSitingPipeline,
  initialSteps,
  type AgentStep,
} from "@/lib/agents";

const ALL_CATS = new Set<CategoryKey>(CATEGORIES.map((c) => c.key));

export default function Page() {
  const [data, setData] = useState<ReachData | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [persona, setPersona] = useState<PersonaKey>("family");
  const [activeCategories, setActiveCategories] = useState<Set<CategoryKey>>(
    new Set(ALL_CATS)
  );

  const [gap, setGap] = useState<Gap | null>(null);
  const [baseline, setBaseline] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [candidates, setCandidates] = useState<Parcel[]>([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<RecommendResult | null>(null);
  const [streamText, setStreamText] = useState("");
  const [aiSource, setAiSource] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);

  const [simulated, setSimulated] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [facility, setFacility] = useState<{ lat: number; lng: number } | null>(
    null
  );

  const [asking, setAsking] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [demoStep, setDemoStep] = useState<DemoStep>(1);
  const [showBrief, setShowBrief] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchMode, setWorkbenchMode] = useState<WorkbenchMode>("explain");

  const mapRef = useRef<MapHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/data/reach.json")
      .then((r) => r.json())
      .then((d: ReachData) => setData(d))
      .catch(() => setData(null));
  }, []);

  const gaps = useMemo(
    () => (data ? rankGaps(data, persona) : []),
    [data, persona]
  );

  const rankedCandidates = useMemo(() => {
    if (!data || !gap) return [];
    return rankCandidates(
      data,
      gap,
      candidates,
      aiResult?.recommended_parcel_id ?? null,
      persona
    );
  }, [data, gap, candidates, aiResult, persona]);

  const recZone = useMemo<FC | null>(
    () => (gap ? zonePolygonFC(unservedCellsOf(gap)) : null),
    [gap]
  );

  const catchment = useMemo<FC | null>(() => {
    if (!gap || !aiResult) return null;
    return ringFC(
      { lat: aiResult.recommended_lat, lng: aiResult.recommended_lng },
      CATEGORY_THRESHOLDS[gap.worst]
    );
  }, [gap, aiResult]);

  const rankedSites = useMemo(
    () =>
      rankedCandidates.map((c) => ({
        lat: c.parcel.lat,
        lng: c.parcel.lng,
        rank: c.rank,
        selected: c.selected,
      })),
    [rankedCandidates]
  );

  const cellTargets = useMemo(() => {
    if (!data) return {};
    const base: Record<string, number> = {};
    for (const cell of data.cells) base[cell.h3] = cell.access[persona];
    if (simulated && simResult) {
      for (const [h3, v] of Object.entries(simResult.updatedAccess)) {
        base[h3] = v;
      }
    }
    return base;
  }, [data, persona, simulated, simResult]);

  const runRecommend = useCallback(
    async (
      g: Gap,
      cands: Parcel[],
      base: { lat: number; lng: number }
    ) => {
      if (!data) return;
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setAiLoading(true);
      setAiResult(null);
      setStreamText("");
      setAiSource(null);
      setAgentSteps(initialSteps());
      if (demoMode) setDemoStep(2);

      await runSitingPipeline(
        data,
        g,
        persona,
        { baseline: base, candidates: cands },
        {
          signal: ctrl.signal,
          onStep: (step) => {
            setAgentSteps((prev) =>
              prev.map((s) => (s.id === step.id ? { ...s, ...step } : s))
            );
          },
          onStreamText: (t) => setStreamText(t),
          onResult: (result, source) => {
            setAiResult(result);
            setAiSource(source);
            setStreamText(result.rationale);
            setAiLoading(false);
            if (demoMode) setDemoStep(3);
            const mid = {
              lat: (base.lat + result.recommended_lat) / 2,
              lng: (base.lng + result.recommended_lng) / 2,
            };
            mapRef.current?.flyTo(mid.lng, mid.lat, 13.6);
          },
        }
      );
      setAiLoading(false);
    },
    [data, demoMode, persona]
  );

  const openTarget = useCallback(
    (g: Gap) => {
      if (!data) return;
      const base = baselinePoint(g);
      const cands = candidateParcels(data, g.district, base);
      setGap(g);
      setBaseline(base);
      setCandidates(cands);
      // reset simulation
      setSimulated(false);
      setSimResult(null);
      setFacility(null);

      mapRef.current?.flyTo(g.lng, g.lat, 12.8);
      runRecommend(g, cands, base);
    },
    [data, runRecommend]
  );

  const handleSelectGap = useCallback(
    (g: Gap) => openTarget(g),
    [openTarget]
  );

  const handleCellClick = useCallback(
    (district: string) => {
      if (!data || !district || district === "Unknown") return;
      const g = targetForDistrict(data, district, persona);
      openTarget(g);
    },
    [data, persona, openTarget]
  );

  const handlePersona = useCallback(
    (p: PersonaKey) => {
      setPersona(p);
      setSimulated(false);
      setSimResult(null);
      setFacility(null);
      if (gap && data) {
        const g = targetForDistrict(data, gap.district, p, gap.worst);
        setGap(g);
        const base = baselinePoint(g);
        const cands = candidateParcels(data, g.district, base);
        setBaseline(base);
        setCandidates(cands);
        runRecommend(g, cands, base);
      }
    },
    [gap, data, runRecommend]
  );

  const handleToggle = useCallback((key: CategoryKey) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSimulate = useCallback(() => {
    if (!data || !gap || !aiResult) return;
    const facilityPt = {
      lat: aiResult.recommended_lat,
      lng: aiResult.recommended_lng,
    };
    const result = simulatePlacement(
      data,
      gap.district,
      gap.worst,
      facilityPt,
      persona
    );
    setSimResult(result);
    setFacility(facilityPt);
    setSimulated(true);
    mapRef.current?.flyTo(facilityPt.lng, facilityPt.lat, 13.8);
    if (demoMode) setDemoStep(4);
  }, [data, gap, aiResult, persona, demoMode]);

  const handleReset = useCallback(() => {
    setSimulated(false);
    setSimResult(null);
    setFacility(null);
    if (gap) mapRef.current?.flyTo(gap.lng, gap.lat, 12.8);
  }, [gap]);

  const handleClose = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setGap(null);
    setBaseline(null);
    setCandidates([]);
    setAiResult(null);
    setAiLoading(false);
    setStreamText("");
    setAiSource(null);
    setAgentSteps([]);
    setSimulated(false);
    setSimResult(null);
    setFacility(null);
  }, []);

  const handleAsk = useCallback(
    async (question: string) => {
      if (!data) return;
      setAsking(true);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            districts: data.districts.map((d) => d.district),
          }),
        });
        const parsed = await res.json();
        const category: CategoryKey = parsed.category;
        let district: string | null = parsed.district ?? null;
        if (!district) {
          district = worstDistrictForCategory(data, persona, category);
        }
        if (!district) return;
        const g = targetForDistrict(data, district, persona, category);
        openTarget(g);
      } catch {
        // ignore
      } finally {
        setAsking(false);
      }
    },
    [data, persona, openTarget]
  );

  const beginDemo = useCallback(() => {
    if (!data) return;
    setShowIntro(false);
    setDemoMode(true);
    setDemoStep(1);
    setShowBrief(false);
    const g = pickDemoGap(data, persona, gaps);
    if (g) openTarget(g);
  }, [data, persona, gaps, openTarget]);

  // Open the workbench in demo mode AND kick off the real pipeline so the
  // workbench renders the live AgentTrace (no more theatrical timer).
  const startDemoFlow = useCallback(() => {
    setShowIntro(false);
    setWorkbenchMode("demo");
    setWorkbenchOpen(true);
    beginDemo();
  }, [beginDemo]);

  const openExplainWorkbench = useCallback(() => {
    setWorkbenchMode("explain");
    setWorkbenchOpen(true);
  }, []);

  const handleWorkbenchRunDemo = useCallback(() => {
    setWorkbenchMode("demo");
    beginDemo();
  }, [beginDemo]);

  const handleWorkbenchComplete = useCallback(() => {
    if (workbenchMode === "demo") {
      // Gap + pipeline already running; just reveal the inspector.
      setWorkbenchOpen(false);
    } else if (workbenchMode === "brief") {
      setWorkbenchOpen(false);
      setShowBrief(true);
    }
  }, [workbenchMode]);

  const handleWorkbenchSkip = useCallback(() => {
    if (workbenchMode === "demo") {
      setWorkbenchOpen(false);
    } else if (workbenchMode === "brief") {
      setWorkbenchOpen(false);
      setShowBrief(true);
    }
  }, [workbenchMode]);

  const handleOpenBrief = useCallback(() => {
    setWorkbenchMode("brief");
    setWorkbenchOpen(true);
  }, []);

  const handleIntroDemo = useCallback(() => {
    startDemoFlow();
  }, [startDemoFlow]);

  const exitDemo = useCallback(() => {
    setDemoMode(false);
    setDemoStep(1);
  }, []);

  if (!data) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-ink-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
          <p className="text-[13px] text-white/50">
            Loading Abu Dhabi access data…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-ink-950">
      <MapCanvas
        ref={mapRef}
        data={data}
        activeCategories={activeCategories}
        cellTargets={cellTargets}
        baseline={baseline}
        aiPick={
          aiResult
            ? { lat: aiResult.recommended_lat, lng: aiResult.recommended_lng }
            : null
        }
        facility={facility}
        showAB={!!gap}
        selectedGap={
          gap
            ? { district: gap.district, worst: gap.worst, access: gap.access }
            : null
        }
        recZone={recZone}
        catchment={catchment}
        rankedSites={rankedSites}
        onCellClick={handleCellClick}
        onLoaded={() => setMapLoaded(true)}
      />

      {!mapLoaded && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink-950">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-accent" />
            <p className="text-[13px] text-white/50">Rendering map…</p>
          </div>
        </div>
      )}

      <TopBar
        meta={data.meta}
        persona={persona}
        onPersona={handlePersona}
        onHelp={() => setShowIntro(true)}
        onRunDemo={startDemoFlow}
        onOpenExplain={openExplainWorkbench}
      />

      {demoMode && <DemoProgress step={demoStep} onExit={exitDemo} />}

      <LeftRail
        activeCategories={activeCategories}
        onToggle={handleToggle}
        gaps={gaps}
        selectedDistrict={gap?.district ?? null}
        selectedCategory={gap?.worst ?? null}
        onSelectGap={handleSelectGap}
        asking={asking}
        onAsk={handleAsk}
        onOpenExplain={openExplainWorkbench}
      />

      <Legend />

      <AnimatePresence>
        {gap && (
          <Inspector
            key={gap.district + gap.worst}
            gap={gap}
            persona={persona}
            aiLoading={aiLoading}
            aiResult={aiResult}
            aiSource={aiSource}
            streamText={streamText}
            agentSteps={agentSteps}
            rankedCandidates={rankedCandidates}
            simulated={simulated}
            simResult={simResult}
            highlightSimulate={!!aiResult && !simulated && !aiLoading}
            onSimulate={handleSimulate}
            onReset={handleReset}
            onClose={handleClose}
            onOpenBrief={handleOpenBrief}
          />
        )}
      </AnimatePresence>

      {!gap && mapLoaded && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass pointer-events-none absolute right-4 top-1/2 z-20 hidden w-[230px] -translate-y-1/2 rounded-2xl p-4 shadow-float lg:block"
        >
          <div className="mb-2 flex items-center gap-2 text-accent">
            <MousePointerClick size={16} />
            <span className="text-[12px] font-semibold">
              Select an access desert
            </span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-white/55">
            Click a red zone on the map, or pick from{" "}
            <span className="text-white/80">Worst gaps to fix</span> to see where
            Reach recommends building next.
          </p>
        </motion.div>
      )}

      {/* compact guidance pill for smaller screens (the card above is lg-only) */}
      {!gap && mapLoaded && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 lg:hidden">
          <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2 shadow-float">
            <MousePointerClick size={14} className="text-accent" />
            <span className="text-[11px] text-white/70">
              Tap a red zone · or Run demo above
            </span>
          </div>
        </div>
      )}

      {/* provenance / honesty footer */}
      <div className="pointer-events-none absolute bottom-2 left-3 z-10 hidden max-w-[46%] text-[9.5px] leading-snug text-white/30 md:block">
        Amenities: OpenStreetMap-derived © OpenStreetMap contributors (ODbL).
        Community, listing &amp; parcel figures: illustrative prototype data.
      </div>

      <AnimatePresence>
        {workbenchOpen && (
          <PlanningWorkbenchOverlay
            open={workbenchOpen}
            mode={workbenchMode}
            agentSteps={agentSteps}
            onClose={() => setWorkbenchOpen(false)}
            onRunDemo={handleWorkbenchRunDemo}
            onSkip={handleWorkbenchSkip}
            onComplete={handleWorkbenchComplete}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIntro && (
          <IntroOverlay
            onDemo={handleIntroDemo}
            onDismiss={() => setShowIntro(false)}
            canDemo={gaps.length > 0}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBrief && gap && aiResult && (
          <SitingBrief
            gap={gap}
            persona={persona}
            pick={
              rankedCandidates.find((c) => c.selected)?.parcel ??
              candidates.find((p) => p.id === aiResult.recommended_parcel_id) ??
              null
            }
            aiResult={aiResult}
            simResult={simResult}
            priorityMatch={
              (() => {
                const o = (gap.opportunity || "").toLowerCase();
                if (o.includes("school") || o.includes("educat"))
                  return gap.worst === "education";
                if (
                  o.includes("clinic") ||
                  o.includes("health") ||
                  o.includes("medical")
                )
                  return gap.worst === "healthcare";
                return false;
              })()
            }
            onClose={() => setShowBrief(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
