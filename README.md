# Reach — AI siting copilot for Abu Dhabi

Reach is a single-screen, full-bleed map app that visualizes how easily residents of
Abu Dhabi can reach six categories of everyday essentials (a "15-minute city" analysis),
surfaces the worst-served neighborhoods ("access deserts"), and uses an LLM to recommend
the single best **real, buildable land parcel** to place a missing facility — then lets you
**simulate** that placement and watch the access map improve in real time.

The core story: a **naive baseline** (nearest-distance math) picks a geometric point that may
land on water or non-buildable land, whereas **Reach AI** picks a real parcel that is
zoning-aware. The app shows both side by side ("A vs B").

## Stack

- Next.js 14 (App Router), React 18, TypeScript (strict)
- Tailwind CSS 3.4
- maplibre-gl 4.5 (CARTO dark-matter basemap, no token)
- h3-js 4.1 (hex binning)
- framer-motion 11, lucide-react
- openai 4.55 SDK pointed at Groq (`llama-3.3-70b-versatile`), server-side only

## Quickstart

```bash
npm install
npm run build-data   # downloads the Abu Dhabi CSVs (if missing) and writes public/data/reach.json
npm run dev          # http://localhost:3000
```

## AI (optional)

The app works fully without any key via deterministic fallback siting. To enable live
streaming rationale from Groq:

```bash
cp .env.example .env.local
# set GROQ_API_KEY=your_key
```

The key is used only server-side in `app/api/ask/route.ts` and `app/api/recommend/route.ts`.

## Data

`scripts/build-data.ts` auto-downloads any missing CSV from:

```
https://huggingface.co/datasets/eVoost/abu-dhabi-ai-proptech-challenge/resolve/main/<file>.csv
```

Files: `osm_amenities.csv`, `sample_listings.csv`, `sample_communities.csv`,
`sample_parcels.csv`, `districts.csv`.

## How it works

1. **Engine** (`lib/engine.ts`) — pure access-scoring math (haversine, per-category distance
   thresholds, persona-weighted access, worst-category detection, color ramps).
2. **Builder** (`scripts/build-data.ts`) — parses CSVs, bins listings into H3 res-8 cells as a
   population proxy, computes nearest-amenity distances per cell, scores per persona, and writes
   a minified `reach.json`.
3. **Client** (`lib/client.ts`) — ranks access gaps, builds naive baseline points, finds
   candidate parcels, and simulates a placement instantly (no network).
4. **App** — MapLibre heatmap of H3 access cells + amenity dots, an Inspector that streams an AI
   rationale, and a simulate mode that tweens the affected hexes greener.
