// Browser-side analysis. Shares the pure engine math.
import {
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

/** District maximizing affectedPopulation + severity/50 for a category. */
export function worstDistrictForCategory(
  data: ReachData,
  persona: PersonaKey,
  category: CategoryKey
): string {
  let best = "";
  let bestScore = -Infinity;
  for (const d of data.districts) {
    const gap = targetForDistrict(data, d.district, persona, category);
    const score = gap.affectedPopulation + gap.severity / 50;
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
