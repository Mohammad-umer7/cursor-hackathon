import { cellToBoundary } from "h3-js";
import { CATEGORIES, accessColor, type CategoryKey } from "./engine";
import type { Amenity, Cell } from "./types";

export const CATEGORY_COLOR: Record<CategoryKey, string> = CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c.color;
    return acc;
  },
  {} as Record<CategoryKey, string>
);

export interface FC {
  type: "FeatureCollection";
  features: any[];
}

export function amenitiesFC(amenities: Amenity[]): FC {
  return {
    type: "FeatureCollection",
    features: amenities.map((a) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      properties: {
        id: a.id,
        cat: a.cat,
        name: a.name,
        subtype: (a.subtype || "").replace(/_/g, " "),
        color: CATEGORY_COLOR[a.cat],
      },
    })),
  };
}

/**
 * FeatureCollection of hex polygons. Geometry is static; the `access`/`color`
 * properties are mutated in place during color tweening on the map.
 */
export function hexFC(
  cells: Cell[],
  accessByCell: Record<string, number>
): FC {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => {
      const boundary = cellToBoundary(cell.h3, true); // [lng, lat]
      const ring = boundary.map((p) => [p[0], p[1]]);
      if (ring.length > 0) ring.push([ring[0][0], ring[0][1]]);
      const access = accessByCell[cell.h3] ?? cell.access.family;
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {
          h3: cell.h3,
          district: cell.district,
          access,
          color: accessColor(access),
        },
      };
    }),
  };
}

/** Andrew's monotone-chain convex hull over [lng,lat] points. */
function convexHull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (
    o: [number, number],
    a: [number, number],
    b: [number, number]
  ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * "Recommended search zone": a convex-hull polygon around the given cells'
 * centroids (typically the underserved / high-shortage cells of a district).
 */
export function zonePolygonFC(cells: { lat: number; lng: number }[]): FC {
  if (!cells.length) return { type: "FeatureCollection", features: [] };
  const pts: [number, number][] = cells.map((c) => [c.lng, c.lat]);
  let hull = convexHull(pts);
  if (hull.length < 3) {
    // Degenerate (1–2 cells): make a tiny box so something renders.
    const c = cells[0];
    const e = 0.004;
    hull = [
      [c.lng - e, c.lat - e],
      [c.lng + e, c.lat - e],
      [c.lng + e, c.lat + e],
      [c.lng - e, c.lat + e],
    ];
  }
  const ring = [...hull, hull[0]];
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: {},
      },
    ],
  };
}

/**
 * "15-minute walk catchment": a polygon circle of `radiusMeters` around a point,
 * approximated with `steps` segments (equirectangular, fine at city scale).
 */
export function ringFC(
  center: { lat: number; lng: number } | null,
  radiusMeters: number,
  steps = 64
): FC {
  if (!center) return { type: "FeatureCollection", features: [] };
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos(latRad) || 1);
  const pts: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    pts.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [pts] },
        properties: {},
      },
    ],
  };
}

export function lineFC(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null
): FC {
  if (!a || !b) {
    return { type: "FeatureCollection", features: [] };
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ],
        },
        properties: {},
      },
    ],
  };
}
