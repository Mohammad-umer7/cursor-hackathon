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
