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

// ---- Candidate suitability weights (Phase 3, all sub-terms 0–1) ----
export const SUITABILITY_WEIGHTS = {
  coverageGain: 0.35,
  buildability: 0.2,
  infrastructure: 0.15,
  proximity: 0.15,
  equity: 0.15,
};

// E2SFCA decay weights (Luo & Qi 2009), mirrored from the data builder for the
// marginal coverage simulation.
const E2SFCA_WEIGHTS = [1.0, 0.42, 0.09];
function zoneWeight(d: number, d0: number): number {
  if (d > d0) return 0;
  if (d < d0 / 3) return E2SFCA_WEIGHTS[0];
  if (d < (2 * d0) / 3) return E2SFCA_WEIGHTS[1];
  return E2SFCA_WEIGHTS[2];
}

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

export interface CandidateScores {
  coverageGain: number; // 0..1 normalized marginal newly-served population
  buildability: number; // 0..1
  infrastructure: number; // 0..1
  proximity: number; // 0..1
  equity: number; // 0..1
}

export interface RankedCandidate {
  rank: number;
  parcel: Parcel;
  selected: boolean;
  reason: string;
  suitability: number; // 0..1 weighted multi-criteria score
  scores: CandidateScores;
  newReach: number; // marginal residents newly served (greedy)
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
 * Marginal newly-served demand (raw weighted units) if a facility of `category`
 * is added at `parcel`, via an E2SFCA marginal simulation. `extra` accumulates
 * supply already committed by previously-selected facilities (for greedy
 * diminishing returns). Returns raw units plus the per-cell supply increments so
 * the caller can commit them when this parcel is chosen.
 */
function marginalCoverage(
  data: ReachData,
  parcel: Parcel,
  category: CategoryKey,
  target: number,
  extra: Map<string, number>
): { raw: number; increments: Map<string, number> } {
  const d0 = CATEGORY_THRESHOLDS[category];
  const inRange: { cell: Cell; w: number }[] = [];
  let denom = 0;
  for (const cell of data.cells) {
    const d = haversine(cell.lat, cell.lng, parcel.lat, parcel.lng);
    if (d <= d0) {
      const w = zoneWeight(d, d0);
      inRange.push({ cell, w });
      denom += cell.weight * w;
    }
  }
  const R = denom > 0 ? 1 / denom : 0; // one new supply unit
  let raw = 0;
  const increments = new Map<string, number>();
  for (const { cell, w } of inRange) {
    const base = (cell.supply?.[category] ?? 0) + (extra.get(cell.h3) ?? 0);
    const inc = R * w;
    const before = clamp01((target - base) / target);
    const after = clamp01((target - (base + inc)) / target);
    raw += cell.weight * (before - after);
    increments.set(cell.h3, inc);
  }
  return { raw, increments };
}

/**
 * Rank candidate parcels by a transparent weighted multi-criteria suitability
 * score (coverage gain, buildability, infrastructure, proximity, equity), all
 * sub-terms normalized 0–1. Coverage gain uses a greedy marginal E2SFCA
 * simulation so later picks show diminishing returns. Falls back to a
 * simulatePlacement access-lift heuristic when supply data is unavailable.
 */
export function rankCandidates(
  data: ReachData,
  gap: Gap,
  candidates: Parcel[],
  selectedId: string | null,
  persona: PersonaKey
): RankedCandidate[] {
  if (candidates.length === 0) return [];

  const category = gap.worst;
  const d0 = CATEGORY_THRESHOLDS[category];
  const target = supplyTargetFor(data, category);
  const summary = districtSummary(data, gap.district);
  const districtCells = cellsOfDistrict(data, gap.district);
  const ppw = peoplePerWeight(summary, districtCells);
  const centroid = baselinePoint(gap);

  const W = SUITABILITY_WEIGHTS;

  // Static (parcel-intrinsic) sub-scores.
  const staticScore = (parcel: Parcel) => {
    const statusFactor =
      parcel.status === "vacant"
        ? 1.0
        : parcel.status === "under_development"
        ? 0.6
        : 0.3;
    const sizeAdequacy = clamp01(parcel.size / MIN_SIZE[category]);
    const buildability = clamp01(statusFactor * sizeAdequacy);
    const infrastructure = clamp01(
      (0.6 * parcel.infra + 0.4 * parcel.potential) / 100
    );
    const distToUnserved = haversine(
      centroid.lat,
      centroid.lng,
      parcel.lat,
      parcel.lng
    );
    const proximity = 1 - clamp01(distToUnserved / d0);
    const equity = clamp01(gap.demand / 100);
    return { buildability, infrastructure, proximity, equity };
  };

  // Greedy coverage assignment (diminishing returns).
  const extra = new Map<string, number>();
  const remaining = [...candidates];
  const ordered: {
    parcel: Parcel;
    rawCoverage: number;
    scores: CandidateScores;
    newReach: number;
  }[] = [];

  // Reference (max) raw coverage from the first, untouched pass for normalizing.
  let maxRaw = 0;

  const coverageRaw = (parcel: Parcel) => {
    if (target != null) {
      return marginalCoverage(data, parcel, category, target, extra);
    }
    // Fallback: access-lift heuristic (no supply data).
    const sim = simulatePlacement(
      data,
      gap.district,
      category,
      { lat: parcel.lat, lng: parcel.lng },
      persona
    );
    return {
      raw: Math.max(0, sim.accessAfter - sim.accessBefore),
      increments: new Map<string, number>(),
    };
  };

  while (remaining.length > 0) {
    let bestIdx = 0;
    let best = coverageRaw(remaining[0]);
    for (let i = 1; i < remaining.length; i++) {
      const c = coverageRaw(remaining[i]);
      if (c.raw > best.raw) {
        best = c;
        bestIdx = i;
      }
    }
    const parcel = remaining.splice(bestIdx, 1)[0];
    if (ordered.length === 0) maxRaw = best.raw;
    const stat = staticScore(parcel);
    ordered.push({
      parcel,
      rawCoverage: best.raw,
      scores: { coverageGain: 0, ...stat }, // coverageGain filled after normalize
      newReach: Math.round(best.raw * ppw),
    });
    // Commit this facility's supply so subsequent picks see diminished gains.
    for (const [h3, inc] of best.increments) {
      extra.set(h3, (extra.get(h3) ?? 0) + inc);
    }
  }

  const denom = maxRaw > 0 ? maxRaw : 1;
  for (const o of ordered) {
    o.scores.coverageGain = clamp01(o.rawCoverage / denom);
  }

  const suitabilityOf = (s: CandidateScores) =>
    W.coverageGain * s.coverageGain +
    W.buildability * s.buildability +
    W.infrastructure * s.infrastructure +
    W.proximity * s.proximity +
    W.equity * s.equity;

  // Re-rank by full suitability (coverage greedy order is a strong prior, but
  // the weighted score is the displayed ranking).
  const fullScored = ordered
    .map((o) => ({ ...o, suitability: suitabilityOf(o.scores) }))
    .sort((a, b) => b.suitability - a.suitability);

  let display = fullScored.slice(0, 3);
  if (selectedId && !display.some((d) => d.parcel.id === selectedId)) {
    const sel = fullScored.find((s) => s.parcel.id === selectedId);
    if (sel) display = [...fullScored.slice(0, 2), sel];
  }

  const winner =
    (selectedId
      ? display.find((d) => d.parcel.id === selectedId)
      : undefined) ?? display[0];

  return display.map((item, i) => {
    const selected =
      selectedId !== null ? item.parcel.id === selectedId : i === 0;

    let reason: string;
    if (selected) {
      reason = `Selected — best balance: covers ~${item.newReach.toLocaleString()} residents on ${item.parcel.status.replace(/_/g, " ")} land`;
    } else if (item.scores.coverageGain > winner.scores.coverageGain + 0.05) {
      reason = `Rejected — covers more (${item.newReach.toLocaleString()}) but ${
        item.parcel.status === "vacant" ? "weaker site quality" : "on under-development land"
      }`;
    } else if (item.scores.buildability < winner.scores.buildability - 0.1) {
      reason = "Rejected — lower buildability (status / size)";
    } else if (item.scores.infrastructure < winner.scores.infrastructure - 0.1) {
      reason = "Rejected — lower infrastructure / potential";
    } else if (item.scores.proximity < winner.scores.proximity - 0.1) {
      reason = "Rejected — farther from the underserved core";
    } else {
      reason = `Rejected — lower overall suitability (${Math.round(item.suitability * 100)}/100)`;
    }

    return {
      rank: i + 1,
      parcel: item.parcel,
      selected: selected || (selectedId === null && i === 0),
      reason,
      suitability: item.suitability,
      scores: item.scores,
      newReach: item.newReach,
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
