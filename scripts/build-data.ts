// Reach data builder. Run with: npm run build-data
// Downloads the Abu Dhabi proptech CSVs (if missing), bins listings into H3 cells
// as a population proxy, scores access per persona, and writes public/data/reach.json.

import { promises as fs } from "node:fs";
import path from "node:path";
import { latLngToCell, cellToLatLng } from "h3-js";
import {
  CATEGORIES,
  accessFromDistances,
  essentialOf,
  haversine,
  worstCategory,
  type CategoryKey,
  type PersonaKey,
} from "../lib/engine";
import { PERSONAS } from "../lib/engine";
import type {
  Amenity,
  Cell,
  DistrictSummary,
  Parcel,
  ReachData,
} from "../lib/types";

const H3_RES = 8;

const BASE_URL =
  "https://huggingface.co/datasets/eVoost/abu-dhabi-ai-proptech-challenge/resolve/main";

const FILES = [
  "osm_amenities",
  "sample_listings",
  "sample_communities",
  "sample_parcels",
  "districts",
];

const DATA_DIR = path.join(process.cwd(), "data");
const OUT_DIR = path.join(process.cwd(), "public", "data");

// ---------- helpers ----------

function num(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function titleize(s: string): string {
  return (s || "")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** FNV-1a based deterministic pseudo-random in [0,1) from a string seed. */
function hash01(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // map to [0,1)
  return ((h >>> 0) % 1000000) / 1000000;
}

/** Minimal RFC-4180-ish CSV parser. Handles quotes, "" escapes, commas, CRLF/LF. */
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        // swallow; handled by following \n or treat lone \r as newline
        if (text[i + 1] !== "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        }
      } else {
        field += ch;
      }
    }
  }
  // last field / row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === "") continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      rec[headers[c]] = (cells[c] ?? "").trim();
    }
    out.push(rec);
  }
  return out;
}

async function ensureFiles(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  for (const file of FILES) {
    const fp = path.join(DATA_DIR, `${file}.csv`);
    let needs = false;
    try {
      const stat = await fs.stat(fp);
      if (stat.size === 0) needs = true;
    } catch {
      needs = true;
    }
    if (needs) {
      const url = `${BASE_URL}/${file}.csv`;
      process.stdout.write(`  fetching ${file}.csv ... `);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`failed to fetch ${url}: ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      await fs.writeFile(fp, text, "utf8");
      console.log(`done (${(text.length / 1024).toFixed(0)} KB)`);
    } else {
      console.log(`  using cached ${file}.csv`);
    }
  }
}

async function readCSV(file: string): Promise<Record<string, string>[]> {
  const fp = path.join(DATA_DIR, `${file}.csv`);
  const text = await fs.readFile(fp, "utf8");
  return parseCSV(text);
}

function emptyDist(): Record<CategoryKey, number> {
  const d = {} as Record<CategoryKey, number>;
  for (const c of CATEGORIES) d[c.key] = Infinity;
  return d;
}

function mostCommon(map: Map<string, number>): string {
  let best = "";
  let bestN = -Infinity;
  for (const [k, v] of map) {
    if (v > bestN) {
      bestN = v;
      best = k;
    }
  }
  return best;
}

// ---------- main ----------

async function main() {
  console.log("Reach data builder");
  console.log("ensuring input CSVs...");
  await ensureFiles();

  console.log("parsing CSVs...");
  const [amenRows, listingRows, communityRows, parcelRows, districtRows] =
    await Promise.all([
      readCSV("osm_amenities"),
      readCSV("sample_listings"),
      readCSV("sample_communities"),
      readCSV("sample_parcels"),
      readCSV("districts"),
    ]);

  // ----- districts: centroids + metadata -----
  const districtMeta = new Map<
    string,
    { lat: number; lng: number; area_type: string; profile: string }
  >();
  for (const r of districtRows) {
    const name = (r.district || "").trim();
    if (!name) continue;
    districtMeta.set(name, {
      lat: num(r.latitude),
      lng: num(r.longitude),
      area_type: r.area_type || "",
      profile: r.profile || "",
    });
  }

  // ----- amenities -> essentials + per-category point lists -----
  const amenities: Amenity[] = [];
  const pointsByCat: Record<CategoryKey, { lat: number; lng: number }[]> =
    {} as any;
  for (const c of CATEGORIES) pointsByCat[c.key] = [];

  for (const r of amenRows) {
    const cat = essentialOf(r.category || "", r.subtype || "");
    if (!cat) continue;
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    if (!lat || !lng) continue;
    let name = (r.name || "").trim();
    if (!name || name === "(unnamed park)") {
      name = titleize(r.subtype || cat);
    }
    amenities.push({
      id: String(r.amenity_id || `${cat}-${amenities.length}`),
      cat,
      subtype: r.subtype || "",
      name,
      lat: round6(lat),
      lng: round6(lng),
      district: (r.district || "").trim(),
    });
    pointsByCat[cat].push({ lat, lng });
  }

  // ----- bin listings into H3 cells (population proxy) -----
  interface CellAcc {
    h3: string;
    count: number;
    districts: Map<string, number>;
  }
  const cellAcc = new Map<string, CellAcc>();
  let listingCount = 0;
  for (const r of listingRows) {
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    if (!lat || !lng) continue;
    listingCount++;
    const h3 = latLngToCell(lat, lng, H3_RES);
    let acc = cellAcc.get(h3);
    if (!acc) {
      acc = { h3, count: 0, districts: new Map() };
      cellAcc.set(h3, acc);
    }
    acc.count += 1;
    const dist = (r.district || "").trim();
    if (dist) acc.districts.set(dist, (acc.districts.get(dist) || 0) + 1);
  }

  // ----- score each cell -----
  const nearestDist = (
    lat: number,
    lng: number,
    cat: CategoryKey
  ): number => {
    const pts = pointsByCat[cat];
    let best = Infinity;
    for (const p of pts) {
      const d = haversine(lat, lng, p.lat, p.lng);
      if (d < best) best = d;
    }
    return best;
  };

  const cells: Cell[] = [];
  for (const acc of cellAcc.values()) {
    const [lat, lng] = cellToLatLng(acc.h3);
    const dist = emptyDist();
    for (const c of CATEGORIES) {
      const d = nearestDist(lat, lng, c.key);
      dist[c.key] = isFinite(d) ? Math.round(d) : 999999;
    }
    const access = {} as Record<PersonaKey, number>;
    const worst = {} as Record<PersonaKey, CategoryKey>;
    for (const p of PERSONAS) {
      access[p.key] = Math.round(accessFromDistances(dist, p.key) * 10) / 10;
      worst[p.key] = worstCategory(dist, p.key);
    }
    const district = mostCommon(acc.districts) || "Unknown";
    cells.push({
      h3: acc.h3,
      lat: round6(lat),
      lng: round6(lng),
      weight: acc.count,
      district,
      dist,
      access,
      worst,
    });
  }

  // ----- district summaries -----
  // population & demand from communities
  const communityByDistrict = new Map<
    string,
    { pop: number; demandSum: number; demandN: number; opportunity: string }
  >();
  for (const r of communityRows) {
    const d = (r.district || "").trim();
    if (!d) continue;
    let agg = communityByDistrict.get(d);
    if (!agg) {
      agg = { pop: 0, demandSum: 0, demandN: 0, opportunity: "" };
      communityByDistrict.set(d, agg);
    }
    agg.pop += num(r.population_estimate);
    const demand = num(r.service_demand_index);
    if (demand > 0) {
      agg.demandSum += demand;
      agg.demandN += 1;
    }
    if (!agg.opportunity && r.optimization_opportunity) {
      agg.opportunity = r.optimization_opportunity;
    }
  }

  const cellsByDistrict = new Map<string, Cell[]>();
  for (const cell of cells) {
    const arr = cellsByDistrict.get(cell.district) || [];
    arr.push(cell);
    cellsByDistrict.set(cell.district, arr);
  }

  const districts: DistrictSummary[] = [];
  const allDistrictNames = new Set<string>([
    ...districtMeta.keys(),
    ...cellsByDistrict.keys(),
    ...communityByDistrict.keys(),
  ]);

  for (const name of allDistrictNames) {
    if (!name || name === "Unknown") continue;
    const meta = districtMeta.get(name);
    const dcells = cellsByDistrict.get(name) || [];
    const comm = communityByDistrict.get(name);

    // centroid: prefer district meta, else weighted cell centroid
    let lat = meta?.lat || 0;
    let lng = meta?.lng || 0;
    if (!lat || !lng) {
      let wlat = 0;
      let wlng = 0;
      let wsum = 0;
      for (const c of dcells) {
        wlat += c.lat * c.weight;
        wlng += c.lng * c.weight;
        wsum += c.weight;
      }
      if (wsum > 0) {
        lat = round6(wlat / wsum);
        lng = round6(wlng / wsum);
      }
    }
    if (!lat || !lng) continue;

    const access = {} as Record<PersonaKey, number>;
    const worst = {} as Record<PersonaKey, CategoryKey>;
    const totalWeight = dcells.reduce((s, c) => s + c.weight, 0);
    for (const p of PERSONAS) {
      let num2 = 0;
      for (const c of dcells) num2 += c.weight * c.access[p.key];
      access[p.key] =
        totalWeight > 0 ? Math.round((num2 / totalWeight) * 10) / 10 : 0;
      // weight-weighted most common worst category
      const tally = new Map<CategoryKey, number>();
      for (const c of dcells) {
        const w = c.worst[p.key];
        tally.set(w, (tally.get(w) || 0) + c.weight);
      }
      let bestCat: CategoryKey = CATEGORIES[0].key;
      let bestN = -Infinity;
      for (const [k, v] of tally) {
        if (v > bestN) {
          bestN = v;
          bestCat = k;
        }
      }
      worst[p.key] = bestCat;
    }

    districts.push({
      district: name,
      lat,
      lng,
      area_type: meta?.area_type || "",
      profile: meta?.profile || "",
      population: comm ? Math.round(comm.pop) : 0,
      demand:
        comm && comm.demandN > 0
          ? Math.round(comm.demandSum / comm.demandN)
          : 50,
      opportunity: comm?.opportunity || "",
      access,
      worst,
      cellCount: dcells.length,
    });
  }

  // ----- parcels: real attributes, deterministic jitter around district centroid -----
  const parcels: Parcel[] = [];
  for (const r of parcelRows) {
    const district = (r.district || "").trim();
    const meta = districtMeta.get(district);
    const dsum = districts.find((d) => d.district === district);
    const cLat = meta?.lat || dsum?.lat || 24.47;
    const cLng = meta?.lng || dsum?.lng || 54.37;
    const id = String(r.parcel_id || `parcel-${parcels.length}`);

    const rRand = hash01(id + ":r");
    const aRand = hash01(id + ":a");
    // radius ~0.4–2.6 km, angle full circle
    const radiusM = 400 + rRand * 2200;
    const angle = aRand * Math.PI * 2;
    // convert meters offset to degrees
    const dLat = (radiusM * Math.cos(angle)) / 111320;
    const dLng =
      (radiusM * Math.sin(angle)) /
      (111320 * Math.cos((cLat * Math.PI) / 180) || 1);

    parcels.push({
      id,
      district,
      zone: r.zone || "",
      land_use: r.land_use || "",
      status: (r.current_status || "").trim(),
      size: num(r.parcel_size_sqm),
      value: num(r.estimated_value_aed),
      infra: num(r.infrastructure_score),
      potential: num(r.development_potential_score),
      recommended_use: r.recommended_use || "",
      lat: round6(cLat + dLat),
      lng: round6(cLng + dLng),
    });
  }

  const data: ReachData = {
    meta: {
      amenityCount: amenRows.length,
      essentialCount: amenities.length,
      districtCount: districts.length,
      cellCount: cells.length,
      listingCount,
      generatedAt: new Date().toISOString(),
    },
    amenities,
    cells,
    districts,
    parcels,
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, "reach.json");
  await fs.writeFile(outPath, JSON.stringify(data), "utf8");

  console.log(
    `wrote ${path.relative(process.cwd(), outPath)} — ` +
      `${data.meta.essentialCount} essentials / ${data.meta.amenityCount} amenities, ` +
      `${data.meta.cellCount} cells, ${data.meta.districtCount} districts, ` +
      `${parcels.length} parcels, ${listingCount} listings.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
