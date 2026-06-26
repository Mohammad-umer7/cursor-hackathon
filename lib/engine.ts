// Pure access-scoring engine. No Node or browser dependencies:
// this file is imported by both the data-build script and the browser app.

export type CategoryKey =
  | "healthcare"
  | "education"
  | "grocery"
  | "parks"
  | "transit"
  | "services";

export type PersonaKey = "family" | "young" | "senior";

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  threshold: number; // comfortable walk distance, meters
  color: string;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "healthcare", label: "Healthcare", threshold: 1500, color: "#f87171" },
  { key: "education", label: "Education", threshold: 1200, color: "#fbbf24" },
  { key: "grocery", label: "Grocery", threshold: 800, color: "#34d399" },
  { key: "parks", label: "Parks", threshold: 1000, color: "#4ade80" },
  { key: "transit", label: "Transit", threshold: 600, color: "#60a5fa" },
  { key: "services", label: "Services", threshold: 1000, color: "#c084fc" },
];

export const CATEGORY_THRESHOLDS: Record<CategoryKey, number> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c.threshold;
    return acc;
  },
  {} as Record<CategoryKey, number>
);

export interface PersonaDef {
  key: PersonaKey;
  label: string;
  blurb: string;
  weights: Record<CategoryKey, number>;
}

export const PERSONAS: PersonaDef[] = [
  {
    key: "family",
    label: "Family",
    blurb: "Schools, clinics & parks first",
    weights: {
      education: 0.3,
      healthcare: 0.2,
      parks: 0.2,
      grocery: 0.15,
      transit: 0.1,
      services: 0.05,
    },
  },
  {
    key: "young",
    label: "Young professional",
    blurb: "Transit & convenience first",
    weights: {
      transit: 0.3,
      grocery: 0.2,
      services: 0.15,
      parks: 0.15,
      healthcare: 0.1,
      education: 0.1,
    },
  },
  {
    key: "senior",
    label: "Senior",
    blurb: "Healthcare & services first",
    weights: {
      healthcare: 0.35,
      services: 0.2,
      grocery: 0.15,
      parks: 0.15,
      transit: 0.1,
      education: 0.05,
    },
  },
];

export const PERSONA_WEIGHTS: Record<PersonaKey, Record<CategoryKey, number>> =
  PERSONAS.reduce((acc, p) => {
    acc[p.key] = p.weights;
    return acc;
  }, {} as Record<PersonaKey, Record<CategoryKey, number>>);

export const GAP_COLORS = { bad: "#ef4444", mid: "#f59e0b", good: "#22c55e" };

/**
 * Map a raw OSM (category, subtype) to one of the six essentials, or null.
 */
export function essentialOf(
  category: string,
  subtype: string
): CategoryKey | null {
  const cat = (category || "").toLowerCase().trim();
  const sub = (subtype || "").toLowerCase().trim();

  if (cat === "healthcare") return "healthcare";
  if (cat === "education") return "education";
  if (sub === "park" || sub === "garden" || sub === "playground") return "parks";
  if (cat === "mobility") return "transit";
  if (
    sub === "supermarket" ||
    sub === "marketplace" ||
    sub === "convenience" ||
    sub === "mall"
  )
    return "grocery";
  if (
    sub === "bank" ||
    sub === "community_centre" ||
    sub === "fuel_station" ||
    sub === "post_office" ||
    sub === "post"
  )
    return "services";

  return null;
}

/** Great-circle distance in meters. */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * 100 at the threshold or closer, linear decay to 0 at 2x threshold.
 */
export function scoreFromDistance(dist: number, threshold: number): number {
  if (threshold <= 0) return 0;
  return clamp(100 * (2 - dist / threshold), 0, 100);
}

/** Persona-weighted access score (0–100) from per-category nearest distances. */
export function accessFromDistances(
  dist: Record<CategoryKey, number>,
  persona: PersonaKey
): number {
  const weights = PERSONA_WEIGHTS[persona];
  let total = 0;
  for (const c of CATEGORIES) {
    const d = dist[c.key];
    const s = scoreFromDistance(
      d == null || !isFinite(d) ? Infinity : d,
      c.threshold
    );
    total += weights[c.key] * s;
  }
  return clamp(total, 0, 100);
}

/** Category with the largest weighted drag = weight * (100 - score). */
export function worstCategory(
  dist: Record<CategoryKey, number>,
  persona: PersonaKey
): CategoryKey {
  const weights = PERSONA_WEIGHTS[persona];
  let worst: CategoryKey = CATEGORIES[0].key;
  let worstDrag = -Infinity;
  for (const c of CATEGORIES) {
    const d = dist[c.key];
    const s = scoreFromDistance(
      d == null || !isFinite(d) ? Infinity : d,
      c.threshold
    );
    const drag = weights[c.key] * (100 - s);
    if (drag > worstDrag) {
      worstDrag = drag;
      worst = c.key;
    }
  }
  return worst;
}

/** Red -> amber -> green ramp over 0–100. Returns "rgb(r,g,b)". */
export function accessColor(score: number): string {
  const t = clamp(score, 0, 100) / 100;
  const stops = [
    [239, 68, 68], // 0.0 red
    [245, 158, 11], // 0.5 amber
    [34, 197, 94], // 1.0 green
  ];
  let from: number[];
  let to: number[];
  let local: number;
  if (t < 0.5) {
    from = stops[0];
    to = stops[1];
    local = t / 0.5;
  } else {
    from = stops[1];
    to = stops[2];
    local = (t - 0.5) / 0.5;
  }
  const r = Math.round(from[0] + (to[0] - from[0]) * local);
  const g = Math.round(from[1] + (to[1] - from[1]) * local);
  const b = Math.round(from[2] + (to[2] - from[2]) * local);
  return `rgb(${r},${g},${b})`;
}
