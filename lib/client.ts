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
  let affectedWeight = 0;
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
  }

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
    affectedPopulation: Math.round(affectedWeight * ppw),
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
 * Best district to build a new facility of `category`.
 * Ranks by residents underserved for THAT service, amplified by how much that
 * service stands out as the district's local gap — so different questions
 * surface different, sensible neighborhoods (people present + that service
 * specifically lacking) rather than always returning the all-around worst area.
 */
export function worstDistrictForCategory(
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
    const totalDef =
      CATEGORIES.reduce((s, c) => s + def[c.key], 0) || 1;
    const share = def[category] / totalDef; // 0..1 of the district's gap due to this category
    const score = gap.affectedPopulation * (0.4 + share);
    if (score > bestScore) {
      bestScore = score;
      best = d.district;
    }
  }
  return best;
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
