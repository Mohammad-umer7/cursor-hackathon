import type { CategoryKey, PersonaKey } from "./engine";

export interface Amenity {
  id: string;
  cat: CategoryKey;
  subtype: string;
  name: string;
  lat: number;
  lng: number;
  district: string;
}

export interface Cell {
  h3: string;
  lat: number;
  lng: number;
  weight: number;
  district: string;
  dist: Record<CategoryKey, number>;
  access: Record<PersonaKey, number>;
  worst: Record<PersonaKey, CategoryKey>;
  // E2SFCA supply accessibility per category (optional-safe for stale data).
  supply?: Record<CategoryKey, number>;
}

export interface DistrictSummary {
  district: string;
  lat: number;
  lng: number;
  area_type: string;
  profile: string;
  population: number;
  demand: number;
  residentExperience: number; // avg resident_experience_score 0–100
  mobility: number; // avg mobility_score 0–100
  opportunity: string;
  access: Record<PersonaKey, number>;
  worst: Record<PersonaKey, CategoryKey>;
  cellCount: number;
}

export interface Parcel {
  id: string;
  district: string;
  zone: string;
  land_use: string;
  status: string;
  size: number;
  value: number;
  infra: number;
  potential: number;
  recommended_use: string;
  lat: number;
  lng: number;
}

export interface ReachMeta {
  amenityCount: number;
  essentialCount: number;
  districtCount: number;
  cellCount: number;
  listingCount: number;
  generatedAt: string;
  // E2SFCA "well-served" benchmark supply per category (pop-weighted 75th pct).
  supplyTarget?: Record<CategoryKey, number>;
}

export interface ReachData {
  meta: ReachMeta;
  amenities: Amenity[];
  cells: Cell[];
  districts: DistrictSummary[];
  parcels: Parcel[];
}

// ---- AI route contract ----

export interface RecommendParcel {
  id: string;
  status: string;
  zone: string;
  land_use: string;
  size: number;
  lat: number;
  lng: number;
  infra: number;
  potential: number;
}

export interface RecommendRequest {
  category: CategoryKey;
  categoryLabel: string;
  district: string;
  affectedPopulation: number;
  currentAccess: number;
  demandIndex: number;
  baseline: { lat: number; lng: number };
  parcels: RecommendParcel[];
}

export interface RecommendResult {
  recommended_parcel_id: string;
  recommended_lng: number;
  recommended_lat: number;
  rationale: string;
  why_better_than_baseline: string;
  confidence: "low" | "medium" | "high";
}
