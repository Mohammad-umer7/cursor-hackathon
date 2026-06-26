import type { CategoryKey } from "./engine";

/** Plain-language gap labels for list rows. */
export const GAP_SHORT_LABELS: Record<CategoryKey, string> = {
  healthcare: "Clinic gap",
  education: "School gap",
  grocery: "Grocery gap",
  parks: "Park gap",
  transit: "Transit gap",
  services: "Services gap",
};

export function categoryGapLabel(key: CategoryKey): string {
  return GAP_SHORT_LABELS[key];
}
