// Browser-side analysis. Shares the pure engine math.
import {
  CATEGORIES,
  CATEGORY_THRESHOLDS,
  accessFromDistances,
  haversine,
  scoreFromDistance,
  worstCategory,
  type CategoryKey,
  type PersonaKey,
} from "./engine";
import type { Cell, DistrictSummary, Parcel, ReachData } from "./types";

// A cell is "in reach" of a category once its category score >= 50.
export const REACH_THRESHOLD = 50;

// ---- Unmet-Demand Score (UDS) tunables (Phase 1) ----
export const UDS_ALPHA = 0.6; // population dampener (key fix vs raw-population dominance)
export const UDS_LAMBDA = 0.4; // demand weight
// Local-prioritization floor: how much a district's category UDS survives when the
// service is NOT its standout local gap. The (FLOOR + deficitShare) factor
// decorrelates categories on the sparse synthetic supply maps so different
// questions surface different neighborhoods. Tunable.
export const UDS_LOCAL_FLOOR = 0.25;
// Minimum buildable parcel size (sqm) for a facility of each category.
export const MIN_SIZE: Record<CategoryKey, number> = {
  healthcare: 5000,
  education: 1800,
  grocery: 1000,
  parks: 2000,
  transit: 500,
  services: 800,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Supply target ("well-served" benchmark) for a category, or null if absent. */
function supplyTargetFor(
  data: ReachData,
  category: CategoryKey
): number | null {
  const t = data.meta.supplyTarget?.[category];
  return typeof t === "number" && t > 0 ? t : null;
}

/**
 * E2SFCA shortage for a cell+category in [0,1] (0 = met, 1 = desert), or null
 * if supply data is unavailable (stale reach.json).
 */
function cellShortage(
  cell: Cell,
  category: CategoryKey,
  target: number | null
): number | null {
  if (target == null || !cell.supply || cell.supply[category] === undefined) {
    return null;
  }
  return clamp01((target - cell.supply[category]) / target);
}

/** Whether a district has a buildable parcel adequate for the category. */
function hasBuildableParcel(
  data: ReachData,
  district: string,
  category: CategoryKey
): boolean {
  const min = MIN_SIZE[category];
  return data.parcels.some(
    (p) =>
      p.district === district &&
      (p.status === "vacant" || p.status === "under_development") &&
      p.size >= min
  );
}

export interface DistrictCategoryRank {
  district: string;
  peopleShort: number;
  deprivation: number; // population-weighted mean shortage 0..1
  buildable: number; // 1 or 0.35 soft gate
  uds: number;
}

export interface Gap {
  district: string;
  lat: number;
  lng: number;
  access: number;
  worst: CategoryKey;
  population: number;
  demand: number;
  residentExperience: number;
  mobility: number;
  opportunity: string;
  affectedPopulation: number;
  unservedCells: number;
  cells: Cell[];
  severity: number;
}

export interface SimResult {
  newReach: number;
  accessBefore: number;
  accessAfter: number;
  affectedCellIds: string[];
  updatedAccess: Record<string, number>;
}

export interface RankedCandidate {
  rank: number;
  parcel: Parcel;
  selected: boolean;
  reason: string;
}

export function cellsOfDistrict(data: ReachData, district: string): Cell[] {
  return data.cells.filter((c) => c.district === district);
}

/** Residents per unit hex weight (population / total weight; fallback 220). */
export function peoplePerWeight(
  district: DistrictSummary | undefined,
  cells: Cell[]
): number {
  const totalWeight = cells.reduce((s, c) => s + c.weight, 0);
  if (!district || district.population <= 0 || totalWeight <= 0) return 220;
  return district.population / totalWeight;
}

function districtSummary(
  data: ReachData,
  district: string
): DistrictSummary | undefined {
  return data.districts.find((d) => d.district === district);
}

/** Build a Gap for a district (optionally overriding the targeted category). */
export function targetForDistrict(
  data: ReachData,
  district: string,
  persona: PersonaKey,
  category?: CategoryKey
): Gap {
  const summary = districtSummary(data, district);
  const cells = cellsOfDistrict(data, district);
  const ppw = peoplePerWeight(summary, cells);

  const worst: CategoryKey =
    category ?? (summary ? summary.worst[persona] : worstCategory(
      cells.length ? cells[0].dist : ({} as Record<CategoryKey, number>),
      persona
    ));

  const threshold = CATEGORY_THRESHOLDS[worst];
  const target = supplyTargetFor(data, worst);
  let affectedWeight = 0; // legacy scoreFromDistance count (fallback)
  let shortageWeight = 0; // E2SFCA shortage-weighted count (preferred)
  let supplyAvailable = false;
  let unservedCells = 0;
  let severity = 0;

  for (const cell of cells) {
    const access = cell.access[persona];
    severity += cell.weight * (100 - access);
    const catScore = scoreFromDistance(cell.dist[worst], threshold);
    if (catScore < REACH_THRESHOLD) {
      affectedWeight += cell.weight;
      unservedCells += 1;
    }
    const shortage = cellShortage(cell, worst, target);
    if (shortage != null) {
      supplyAvailable = true;
      shortageWeight += cell.weight * shortage;
    }
  }

  // Category-true affected population from the supply model when available,
  // else fall back to the legacy nearest-distance count.
  const affectedPopulation = Math.round(
    (supplyAvailable ? shortageWeight : affectedWeight) * ppw
  );

  const access = summary
    ? summary.access[persona]
    : weightedMeanAccess(cells, persona);

  return {
    district,
    lat: summary ? summary.lat : cells.length ? cells[0].lat : 24.47,
    lng: summary ? summary.lng : cells.length ? cells[0].lng : 54.37,
    access: Math.round(access),
    worst,
    population: summary ? summary.population : Math.round(
      cells.reduce((s, c) => s + c.weight, 0) * ppw
    ),
    demand: summary ? summary.demand : 50,
    residentExperience: summary ? summary.residentExperience : 0,
    mobility: summary ? summary.mobility : 0,
    opportunity: summary ? summary.opportunity : "",
    affectedPopulation,
    unservedCells,
    cells,
    severity: Math.round(severity),
  };
}

function weightedMeanAccess(cells: Cell[], persona: PersonaKey): number {
  let num = 0;
  let den = 0;
  for (const c of cells) {
    num += c.weight * c.access[persona];
    den += c.weight;
  }
  return den > 0 ? num / den : 0;
}

/** Gaps for all districts, sorted by severity descending. */
export function rankGaps(data: ReachData, persona: PersonaKey): Gap[] {
  return data.districts
    .map((d) => targetForDistrict(data, d.district, persona))
    .sort((a, b) => b.severity - a.severity);
}

/**
 * Pick the best gap for a guided demo: prefer education/healthcare with a
 * meaningful simulated access lift and at least one buildable candidate.
 */
export function pickDemoGap(
  data: ReachData,
  persona: PersonaKey,
  gaps?: Gap[]
): Gap | null {
  const list = gaps ?? rankGaps(data, persona);
  if (list.length === 0) return null;

  const preferred = list.filter(
    (g) =>
      (g.worst === "education" || g.worst === "healthcare") &&
      g.access < 65 &&
      g.unservedCells > 0
  );
  const pool = preferred.length > 0 ? preferred : list.slice(0, 8);

  let best: Gap | null = null;
  let bestLift = -1;

  for (const g of pool) {
    const base = baselinePoint(g);
    const cands = candidateParcels(data, g.district, base);
    if (cands.length === 0) continue;
    const sim = simulatePlacement(
      data,
      g.district,
      g.worst,
      { lat: cands[0].lat, lng: cands[0].lng },
      persona
    );
    const lift = sim.accessAfter - sim.accessBefore;
    const score = lift * 100 + g.severity / 100;
    if (score > bestLift) {
      bestLift = score;
      best = g;
    }
  }

  return best ?? list[0];
}

/**
 * Rank up to three candidate parcels for display. Uses simulatePlacement
 * per candidate to estimate access lift — no changes to core math.
 */
export function rankCandidates(
  data: ReachData,
  gap: Gap,
  candidates: Parcel[],
  selectedId: string | null,
  persona: PersonaKey
): RankedCandidate[] {
  if (candidates.length === 0) return [];

  const scored = candidates
    .map((parcel) => {
      const sim = simulatePlacement(
        data,
        gap.district,
        gap.worst,
        { lat: parcel.lat, lng: parcel.lng },
        persona
      );
      const accessLift = sim.accessAfter - sim.accessBefore;
      const composite =
        accessLift * 120 + parcel.infra * 0.35 + parcel.potential * 0.25;
      return { parcel, accessLift, newReach: sim.newReach, composite };
    })
    .sort((a, b) => b.composite - a.composite);

  let display = scored.slice(0, 3);
  if (selectedId && !display.some((d) => d.parcel.id === selectedId)) {
    const sel = scored.find((s) => s.parcel.id === selectedId);
    if (sel) display = [...scored.slice(0, 2), sel];
  }

  const winner =
    (selectedId
      ? display.find((d) => d.parcel.id === selectedId)
      : undefined) ?? display[0];

  return display.map((item, i) => {
    const selected =
      selectedId !== null
        ? item.parcel.id === selectedId
        : i === 0;
    let reason: string;
    if (selected) {
      reason = "Selected — best access impact + buildable";
    } else if (item.parcel.infra < winner.parcel.infra - 8) {
      reason = "Rejected — lower infrastructure";
    } else if (item.accessLift < winner.accessLift - 0.3) {
      reason = "Rejected — farther from underserved cells";
    } else if (item.parcel.potential < winner.parcel.potential - 8) {
      reason = "Rejected — lower development potential";
    } else {
      reason = "Rejected — lower combined score";
    }
    return {
      rank: i + 1,
      parcel: item.parcel,
      selected: selected || (selectedId === null && i === 0),
      reason,
    };
  });
}

/** Per-category access "deficit" (Σ weight × (100 − category score)) for a district. */
function categoryDeficits(cells: Cell[]): Record<CategoryKey, number> {
  const def = {} as Record<CategoryKey, number>;
  for (const c of CATEGORIES) def[c.key] = 0;
  for (const cell of cells) {
    for (const c of CATEGORIES) {
      const s = scoreFromDistance(cell.dist[c.key], CATEGORY_THRESHOLDS[c.key]);
      def[c.key] += cell.weight * (100 - s);
    }
  }
  return def;
}

/**
 * Legacy deficit-share fallback (used when supply data is absent / stale).
 */
function worstDistrictByDeficit(
  data: ReachData,
  persona: PersonaKey,
  category: CategoryKey
): string {
  let best = "";
  let bestScore = -Infinity;
  for (const d of data.districts) {
    const cells = cellsOfDistrict(data, d.district);
    if (cells.length === 0) continue;
    const gap = targetForDistrict(data, d.district, persona, category);
    const def = categoryDeficits(cells);
    const totalDef = CATEGORIES.reduce((s, c) => s + def[c.key], 0) || 1;
    const share = def[category] / totalDef;
    const score = gap.affectedPopulation * (0.4 + share);
    if (score > bestScore) {
      bestScore = score;
      best = d.district;
    }
  }
  return best;
}

/**
 * Rank all districts for placing a `category` facility using the E2SFCA
 * Unmet-Demand Score (UDS): people present AND underserved, dampened by α, lifted
 * by service demand (λ), and gated by buildable land. Sorted descending.
 */
export function rankDistrictsForCategory(
  data: ReachData,
  category: CategoryKey
): DistrictCategoryRank[] {
  const target = supplyTargetFor(data, category);
  const rows: DistrictCategoryRank[] = [];

  for (const d of data.districts) {
    const cells = cellsOfDistrict(data, d.district);
    if (cells.length === 0) continue;
    const ppw = peoplePerWeight(d, cells);

    let shortageWeight = 0;
    let totalWeight = 0;
    for (const cell of cells) {
      const shortage = cellShortage(cell, category, target);
      if (shortage == null) continue;
      shortageWeight += cell.weight * shortage;
      totalWeight += cell.weight;
    }

    const peopleShort = Math.round(shortageWeight * ppw);
    const deprivation = totalWeight > 0 ? shortageWeight / totalWeight : 0;
    const buildable = hasBuildableParcel(data, d.district, category) ? 1 : 0.35;

    // Local-prioritization: how much of this district's overall access gap is
    // due to THIS category (decorrelates categories so answers diverge).
    const def = categoryDeficits(cells);
    const totalDef = CATEGORIES.reduce((s, c) => s + def[c.key], 0) || 1;
    const localShare = def[category] / totalDef;

    const uds =
      Math.pow(Math.max(0, peopleShort), UDS_ALPHA) *
      (1 + UDS_LAMBDA * (d.demand / 100)) *
      buildable *
      (UDS_LOCAL_FLOOR + localShare);

    rows.push({ district: d.district, peopleShort, deprivation, buildable, uds });
  }

  return rows.sort((a, b) => b.uds - a.uds);
}

/**
 * Best district to build a new facility of `category` (highest UDS).
 * Falls back to the deficit-share heuristic if supply data is unavailable.
 */
export function worstDistrictForCategory(
  data: ReachData,
  persona: PersonaKey,
  category: CategoryKey
): string {
  if (supplyTargetFor(data, category) == null) {
    return worstDistrictByDeficit(data, persona, category);
  }
  const ranked = rankDistrictsForCategory(data, category);
  return ranked.length > 0 ? ranked[0].district : worstDistrictByDeficit(data, persona, category);
}

/**
 * Naive baseline: population-weighted centroid of unserved cells.
 * Deliberately ignores buildability — the point the AI is meant to beat.
 */
export function baselinePoint(gap: Gap): { lat: number; lng: number } {
  const threshold = CATEGORY_THRESHOLDS[gap.worst];
  let wlat = 0;
  let wlng = 0;
  let wsum = 0;
  for (const cell of gap.cells) {
    const catScore = scoreFromDistance(cell.dist[gap.worst], threshold);
    if (catScore < REACH_THRESHOLD) {
      wlat += cell.lat * cell.weight;
      wlng += cell.lng * cell.weight;
      wsum += cell.weight;
    }
  }
  if (wsum <= 0) {
    return { lat: gap.lat, lng: gap.lng };
  }
  return { lat: wlat / wsum, lng: wlng / wsum };
}

/** Vacant / under-development parcels in the district nearest to `near`, top 12. */
export function candidateParcels(
  data: ReachData,
  district: string,
  near: { lat: number; lng: number }
): Parcel[] {
  return data.parcels
    .filter(
      (p) =>
        p.district === district &&
        (p.status === "vacant" || p.status === "under_development")
    )
    .map((p) => ({
      p,
      d: haversine(near.lat, near.lng, p.lat, p.lng),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 12)
    .map((x) => x.p);
}

/**
 * Recompute access if a facility of `category` is placed at `facility`.
 * Cheap and instant — no network.
 */
export function simulatePlacement(
  data: ReachData,
  district: string,
  category: CategoryKey,
  facility: { lat: number; lng: number },
  persona: PersonaKey
): SimResult {
  const summary = districtSummary(data, district);
  const cells = cellsOfDistrict(data, district);
  const ppw = peoplePerWeight(summary, cells);
  const threshold = CATEGORY_THRESHOLDS[category];

  let newReachWeight = 0;
  let beforeNum = 0;
  let afterNum = 0;
  let den = 0;
  const affectedCellIds: string[] = [];
  const updatedAccess: Record<string, number> = {};

  for (const cell of cells) {
    const beforeAccess = cell.access[persona];
    const beforeCatScore = scoreFromDistance(cell.dist[category], threshold);

    const newDist = Math.min(
      cell.dist[category],
      haversine(cell.lat, cell.lng, facility.lat, facility.lng)
    );
    const afterCatScore = scoreFromDistance(newDist, threshold);

    const newDistRecord = { ...cell.dist, [category]: newDist };
    const afterAccess = accessFromDistances(newDistRecord, persona);

    beforeNum += cell.weight * beforeAccess;
    afterNum += cell.weight * afterAccess;
    den += cell.weight;

    updatedAccess[cell.h3] = afterAccess;

    if (afterAccess > beforeAccess + 0.01) {
      affectedCellIds.push(cell.h3);
    }
    if (
      beforeCatScore < REACH_THRESHOLD &&
      afterCatScore >= REACH_THRESHOLD
    ) {
      newReachWeight += cell.weight;
    }
  }

  return {
    newReach: Math.round(newReachWeight * ppw),
    accessBefore: den > 0 ? beforeNum / den : 0,
    accessAfter: den > 0 ? afterNum / den : 0,
    affectedCellIds,
    updatedAccess,
  };
}
