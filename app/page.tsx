"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MousePointerClick } from "lucide-react";
import type { CategoryKey, PersonaKey } from "@/lib/engine";
import { CATEGORIES } from "@/lib/engine";
import type { Parcel, ReachData, RecommendResult } from "@/lib/types";
import {
  baselinePoint,
  candidateParcels,
  rankGaps,
  simulatePlacement,
  targetForDistrict,
  worstDistrictForCategory,
  type Gap,
  type SimResult,
} from "@/lib/client";
import MapCanvas, { type MapHandle } from "@/components/MapCanvas";
import TopBar from "@/components/TopBar";
import LeftRail from "@/components/LeftRail";
import Legend from "@/components/Legend";
import Inspector from "@/components/Inspector";
import IntroOverlay from "@/components/IntroOverlay";

const ALL_CATS = new Set<CategoryKey>(CATEGORIES.map((c) => c.key));

/** Tolerantly extract the partial `rationale` string from a growing JSON buffer. */
function liveField(buffer: string, field: string): string {
  const key = `"${field}"`;
  const ki = buffer.indexOf(key);
  if (ki < 0) return "";
  let i = ki + key.length;
  // skip whitespace and colon
  while (i < buffer.length && buffer[i] !== ":") i++;
  i++; // past ':'
  while (i < buffer.length && /\s/.test(buffer[i])) i++;
  if (buffer[i] !== '"') return "";
  i++; // past opening quote
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

  const [simulated, setSimulated] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [facility, setFacility] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [narration, setNarration] = useState("");

  const [asking, setAsking] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const mapRef = useRef<MapHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const narrationTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

      const categoryLabel =
        CATEGORIES.find((c) => c.key === g.worst)?.label ?? g.worst;

      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            category: g.worst,
            categoryLabel,
            district: g.district,
            affectedPopulation: g.affectedPopulation,
            currentAccess: g.access,
            demandIndex: g.demand,
            baseline: base,
            parcels: cands.map((p) => ({
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
              if (live) setStreamText(live);
              else if (acc && !acc.includes("{")) setStreamText(acc);
            } else if (msg.t === "done") {
              const result = msg.v as RecommendResult;
              setAiResult(result);
              setAiSource(msg.source ?? null);
              setStreamText(result.rationale);
              setAiLoading(false);
              const mid = {
                lat: (base.lat + result.recommended_lat) / 2,
                lng: (base.lng + result.recommended_lng) / 2,
              };
              mapRef.current?.flyTo(mid.lng, mid.lat, 13.6);
            }
          }
        }
        setAiLoading(false);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setAiLoading(false);
      }
    },
    [data]
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
      setNarration("");
      if (narrationTimer.current) clearInterval(narrationTimer.current);

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
      setNarration("");
      if (narrationTimer.current) clearInterval(narrationTimer.current);
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

    // typewriter narration
    const lift = (result.accessAfter - result.accessBefore).toFixed(1);
    const sentence = `Placing this facility brings ${result.newReach.toLocaleString()} more residents within a comfortable walk — lifting ${gap.district}'s access score by ${lift} points.`;
    if (narrationTimer.current) clearInterval(narrationTimer.current);
    let n = 0;
    setNarration("");
    narrationTimer.current = setInterval(() => {
      n += 2;
      setNarration(sentence.slice(0, n));
      if (n >= sentence.length && narrationTimer.current) {
        clearInterval(narrationTimer.current);
      }
    }, 16);
  }, [data, gap, aiResult, persona]);

  const handleReset = useCallback(() => {
    setSimulated(false);
    setSimResult(null);
    setFacility(null);
    setNarration("");
    if (narrationTimer.current) clearInterval(narrationTimer.current);
    if (gap) mapRef.current?.flyTo(gap.lng, gap.lat, 12.8);
  }, [gap]);

  const handleClose = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    if (narrationTimer.current) clearInterval(narrationTimer.current);
    setGap(null);
    setBaseline(null);
    setCandidates([]);
    setAiResult(null);
    setAiLoading(false);
    setStreamText("");
    setAiSource(null);
    setSimulated(false);
    setSimResult(null);
    setFacility(null);
    setNarration("");
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

  const handleIntroExample = useCallback(() => {
    setShowIntro(false);
    if (gaps.length > 0) handleSelectGap(gaps[0]);
  }, [gaps, handleSelectGap]);

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
      />

      <LeftRail
        activeCategories={activeCategories}
        onToggle={handleToggle}
        gaps={gaps}
        selectedDistrict={gap?.district ?? null}
        onSelectGap={handleSelectGap}
        asking={asking}
        onAsk={handleAsk}
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
            candidates={candidates}
            simulated={simulated}
            simResult={simResult}
            narration={narration}
            onSimulate={handleSimulate}
            onReset={handleReset}
            onClose={handleClose}
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
            <span className="text-white/80">Top gaps</span> to see where Reach AI
            would build next.
          </p>
        </motion.div>
      )}

      {/* compact guidance pill for smaller screens (the card above is lg-only) */}
      {!gap && mapLoaded && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 lg:hidden">
          <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2 shadow-float">
            <MousePointerClick size={14} className="text-accent" />
            <span className="text-[11px] text-white/70">
              Tap a red zone to see where to build next
            </span>
          </div>
        </div>
      )}

      {/* provenance / honesty footer */}
      <div className="pointer-events-none absolute bottom-2 left-3 z-10 hidden max-w-[46%] text-[9.5px] leading-snug text-white/30 md:block">
        Amenities: real OpenStreetMap data © OpenStreetMap contributors (ODbL).
        Community, listing &amp; parcel figures: illustrative synthetic data for
        this prototype.
      </div>

      <AnimatePresence>
        {showIntro && (
          <IntroOverlay
            onExample={handleIntroExample}
            onDismiss={() => setShowIntro(false)}
            canExample={gaps.length > 0}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
