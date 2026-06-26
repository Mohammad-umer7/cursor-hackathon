"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import maplibregl from "maplibre-gl";
import { accessColor, CATEGORIES, type CategoryKey } from "@/lib/engine";
import { amenitiesFC, hexFC, lineFC, type FC } from "@/lib/geo";
import type { ReachData } from "@/lib/types";

const EMPTY_FC: FC = { type: "FeatureCollection", features: [] };

const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface MapHandle {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
}

interface LatLng {
  lat: number;
  lng: number;
}

interface SelectedGapInfo {
  district: string;
  worst: CategoryKey;
  access: number;
}

interface RankedSite extends LatLng {
  rank: number;
  selected: boolean;
}

interface MapCanvasProps {
  data: ReachData;
  activeCategories: Set<CategoryKey>;
  cellTargets: Record<string, number>;
  baseline: LatLng | null;
  aiPick: LatLng | null;
  facility: LatLng | null;
  showAB: boolean;
  selectedGap: SelectedGapInfo | null;
  recZone: FC | null;
  catchment: FC | null;
  rankedSites: RankedSite[];
  onCellClick: (district: string) => void;
  onLoaded: () => void;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const MapCanvas = forwardRef<MapHandle, MapCanvasProps>(function MapCanvas(
  {
    data,
    activeCategories,
    cellTargets,
    baseline,
    aiPick,
    facility,
    showAB,
    selectedGap,
    recZone,
    catchment,
    rankedSites,
    onCellClick,
    onLoaded,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const fcRef = useRef<ReturnType<typeof hexFC> | null>(null);
  const displayRef = useRef<Record<string, number>>({});
  const rafRef = useRef<number | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lng: number, lat: number, zoom?: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.easeTo({
        center: [lng, lat],
        zoom: zoom ?? map.getZoom(),
        duration: 1400,
      });
    },
  }));

  // init map
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [54.37, 24.47],
      zoom: 11,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    map.on("load", () => {
      loadedRef.current = true;

      // seed display values
      const initial: Record<string, number> = {};
      for (const cell of data.cells) {
        initial[cell.h3] = cellTargets[cell.h3] ?? cell.access.family;
      }
      displayRef.current = initial;

      const fc = hexFC(data.cells, initial);
      fcRef.current = fc;

      // 1. hexes
      map.addSource("hexes", { type: "geojson", data: fc as any });
      map.addLayer({
        id: "hex-fill",
        type: "fill",
        source: "hexes",
        paint: {
          "fill-color": ["get", "color"],
          // Overview layer: full opacity when zoomed out, fades out at street level
          // so sparse/empty hexes never look broken; amenity dots take over.
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0.5,
            15,
            0,
          ],
        },
      });
      map.addLayer({
        id: "hex-line",
        type: "line",
        source: "hexes",
        paint: {
          "line-color": "#05080d",
          "line-width": 0.5,
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0.35,
            15,
            0,
          ],
        },
      });

      // 2. connector
      map.addSource("connector", {
        type: "geojson",
        data: lineFC(null, null) as any,
      });
      map.addLayer({
        id: "connector-line",
        type: "line",
        source: "connector",
        paint: {
          "line-color": "#9aa6b8",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
          "line-opacity": 0.8,
        },
      });

      // 2b. recommended search zone (convex hull of underserved cells)
      map.addSource("rec-zone", { type: "geojson", data: EMPTY_FC as any });
      map.addLayer({
        id: "rec-zone-fill",
        type: "fill",
        source: "rec-zone",
        paint: { "fill-color": "#3ddc97", "fill-opacity": 0.1 },
      });
      map.addLayer({
        id: "rec-zone-line",
        type: "line",
        source: "rec-zone",
        paint: {
          "line-color": "#3ddc97",
          "line-width": 1.4,
          "line-opacity": 0.55,
        },
      });

      // 2c. ~15-min walk catchment ring around the recommended site
      map.addSource("catchment", { type: "geojson", data: EMPTY_FC as any });
      map.addLayer({
        id: "catchment-fill",
        type: "fill",
        source: "catchment",
        paint: { "fill-color": "#3ddc97", "fill-opacity": 0.05 },
      });
      map.addLayer({
        id: "catchment-line",
        type: "line",
        source: "catchment",
        paint: {
          "line-color": "#3ddc97",
          "line-width": 1.4,
          "line-dasharray": [2, 2],
          "line-opacity": 0.7,
        },
      });

      // 3. amenities
      map.addSource("amenities", {
        type: "geojson",
        data: amenitiesFC(data.amenities) as any,
      });
      map.addLayer({
        id: "amenity-glow",
        type: "circle",
        source: "amenities",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            4,
            16,
            14,
          ],
          "circle-color": ["get", "color"],
          "circle-blur": 1,
          "circle-opacity": 0.18,
        },
      });
      map.addLayer({
        id: "amenity-dot",
        type: "circle",
        source: "amenities",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            1.6,
            16,
            5,
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#05080d",
          "circle-stroke-width": 0.6,
          "circle-opacity": 0.95,
        },
      });

      // interactions
      map.on("click", "hex-fill", (e) => {
        const f = e.features?.[0];
        if (f) onCellClick(String(f.properties?.district));
      });
      const hexPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "amenity-tip",
        offset: 6,
      });
      const catLabel = (key: string) =>
        CATEGORIES.find((c) => c.key === key)?.label ?? key;

      map.on("mousemove", "hex-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const p: any = f.properties || {};
        const acc = Math.round(Number(p.access ?? 0));
        hexPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-weight:600">${p.district || "Area"}</div><div style="opacity:.7">Walk access: ${acc}/100</div><div style="opacity:.55">Weakest: ${catLabel(String(p.worst || ""))}</div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "hex-fill", () => {
        map.getCanvas().style.cursor = "";
        hexPopup.remove();
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "amenity-tip",
        offset: 10,
      });
      popupRef.current = popup;

      map.on("mouseenter", "amenity-dot", (e) => {
        map.getCanvas().style.cursor = "crosshair";
        const f = e.features?.[0];
        if (!f) return;
        const p: any = f.properties || {};
        const sub = String(p.subtype || "");
        const subCap = sub.charAt(0).toUpperCase() + sub.slice(1);
        const coords = (f.geometry as any).coordinates.slice();
        popup
          .setLngLat(coords)
          .setHTML(
            `<div style="font-weight:600">${p.name || "Amenity"}</div><div style="opacity:.6">${subCap}</div>`
          )
          .addTo(map);
      });
      map.on("mouseleave", "amenity-dot", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      onLoaded();
    });

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // category filter
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const apply = () => {
      const active = Array.from(activeCategories);
      const filter: any =
        active.length === 0
          ? ["==", ["get", "cat"], "__none__"]
          : ["in", ["get", "cat"], ["literal", active]];
      if (map.getLayer("amenity-dot")) map.setFilter("amenity-dot", filter);
      if (map.getLayer("amenity-glow")) map.setFilter("amenity-glow", filter);
    };
    if (map.getLayer("amenity-dot")) apply();
    else map.once("idle", apply);
  }, [activeCategories]);

  // hex color tween
  useEffect(() => {
    const map = mapRef.current;
    const fc = fcRef.current;
    if (!map || !loadedRef.current || !fc) return;

    const from: Record<string, number> = { ...displayRef.current };
    const to: Record<string, number> = {};
    for (const cell of data.cells) {
      to[cell.h3] = cellTargets[cell.h3] ?? cell.access.family;
    }

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const start = performance.now();
    const duration = 750;

    const source = map.getSource("hexes") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      const current: Record<string, number> = {};
      for (const feat of fc.features) {
        const h3 = feat.properties.h3 as string;
        const f0 = from[h3] ?? to[h3] ?? 0;
        const f1 = to[h3] ?? f0;
        const v = f0 + (f1 - f0) * eased;
        current[h3] = v;
        feat.properties.access = v;
        feat.properties.color = accessColor(v);
      }
      displayRef.current = current;
      source.setData(fc as any);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellTargets]);

  // markers + connector
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const makePin = (
      cls: string,
      letter: string,
      label: string,
      labelCls: string
    ) => {
      const wrap = document.createElement("div");
      wrap.className = "site-pin-wrap";
      const pin = document.createElement("div");
      pin.className = `site-pin ${cls}`;
      pin.innerHTML = `<span>${letter}</span>`;
      const lbl = document.createElement("div");
      lbl.className = `site-pin-label ${labelCls}`;
      lbl.textContent = label;
      wrap.appendChild(pin);
      wrap.appendChild(lbl);
      return wrap;
    };

    if (showAB && baseline) {
      markersRef.current.push(
        new maplibregl.Marker({ element: makePin("pin-a", "A", "Naive nearest point", "label-a"), anchor: "bottom" })
          .setLngLat([baseline.lng, baseline.lat])
          .addTo(map)
      );
    }

    // Ranked candidate markers (replaces the single "B" pin). Rank 1 / selected
    // gets the prominent accent pin; the rest are small numbered dots.
    if (showAB) {
      for (const site of rankedSites) {
        if (site.selected || site.rank === 1) {
          markersRef.current.push(
            new maplibregl.Marker({
              element: makePin("pin-b", "B", "Reach site (rank 1)", "label-b"),
              anchor: "bottom",
            })
              .setLngLat([site.lng, site.lat])
              .addTo(map)
          );
        } else {
          const el = document.createElement("div");
          el.className = "rank-dot";
          el.textContent = String(site.rank);
          markersRef.current.push(
            new maplibregl.Marker({ element: el, anchor: "center" })
              .setLngLat([site.lng, site.lat])
              .addTo(map)
          );
        }
      }
    }

    if (facility) {
      const el = document.createElement("div");
      el.className = "facility-dot";
      el.innerHTML = '<div class="ring"></div><div class="core"></div>';
      markersRef.current.push(
        new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([facility.lng, facility.lat])
          .addTo(map)
      );
    }

    const connector = map.getSource("connector") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (connector) {
      connector.setData(
        (showAB ? lineFC(baseline, aiPick) : lineFC(null, null)) as any
      );
    }
  }, [baseline, aiPick, facility, showAB, rankedSites]);

  // recommended zone + catchment ring sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const zone = map.getSource("rec-zone") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (zone) zone.setData((recZone ?? EMPTY_FC) as any);
    const ring = map.getSource("catchment") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (ring) ring.setData((catchment ?? EMPTY_FC) as any);
  }, [recZone, catchment]);

  const worstLabel =
    selectedGap &&
    (CATEGORIES.find((c) => c.key === selectedGap.worst)?.label ??
      selectedGap.worst);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {selectedGap && worstLabel && (
        <div className="pointer-events-none absolute left-1/2 top-[132px] z-20 -translate-x-1/2 sm:left-auto sm:right-[400px] sm:translate-x-0">
          <div className="glass rounded-xl px-3 py-2 shadow-float">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">
              Selected access desert
            </div>
            <div className="mt-0.5 text-[11px] text-white/80">
              Weakest: {worstLabel}
            </div>
            <div className="tnum text-[11px] text-white/55">
              Score: {selectedGap.access}/100
            </div>
            {recZone && recZone.features.length > 0 && (
              <div className="mt-1.5 max-w-[210px] border-t border-white/10 pt-1.5 text-[9px] leading-snug text-white/45">
                Shaded area = indicative recommended zone · dashed ring = ~15-min
                walk catchment · 1·2·3 = ranked candidate sites
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
});

export default MapCanvas;
