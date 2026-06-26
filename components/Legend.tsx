"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Info } from "lucide-react";
import { CATEGORIES } from "@/lib/engine";

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

export default function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
      <div className="glass rounded-2xl px-3 py-2 shadow-float">
        {/* Always-visible: the access ramp + expand toggle */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
            Walk access
          </span>
          <span className="text-[10px] text-gap-bad">Service desert</span>
          <div
            className="h-2 w-24 rounded-full sm:w-36"
            style={{
              background:
                "linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)",
            }}
            role="img"
            aria-label="Access gradient from service desert to 15-minute reach"
          />
          <span className="text-[10px] text-gap-good">15-min reach</span>
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-1 flex items-center gap-1 rounded-full bg-white/8 px-2 py-1 text-[10px] font-medium text-white/65 ring-1 ring-white/12 transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-expanded={open}
          >
            <Info size={11} />
            What am I seeing?
            <ChevronDown
              size={11}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2.5 grid max-w-[440px] grid-cols-1 gap-x-5 gap-y-1.5 border-t border-white/10 pt-2.5 text-[10px] text-white/65 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rotate-12 bg-white/30" />
                  <span>
                    <b className="text-white/80">Hexagons</b> = residential areas,
                    shaded by how easily people reach essentials on foot.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-2.5 w-4 shrink-0 rounded-full bg-gradient-to-r from-gap-bad via-amber-500 to-gap-good" />
                  <span>
                    <b className="text-white/80">Red → amber → green</b> = service
                    desert → 15-minute city.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex shrink-0 gap-0.5">
                    {CATEGORIES.slice(0, 3).map((c) => (
                      <Swatch key={c.key} color={c.color} />
                    ))}
                  </span>
                  <span>
                    <b className="text-white/80">Dots</b> = real OpenStreetMap
                    places, colored by category.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-gap-bad text-[7px] font-bold text-white">
                    A
                  </span>
                  <span>
                    <b className="text-white/80">A pin</b> = naive nearest-point
                    baseline (ignores buildability).
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-accent/40 ring-1 ring-accent/60" />
                  <span>
                    <b className="text-white/80">Green zone</b> = AI-recommended
                    search area.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-dashed ring-accent/70" />
                  <span>
                    <b className="text-white/80">Dashed ring</b> = ~15-min walk
                    catchment of the recommended site.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[7px] font-bold text-accent ring-1 ring-accent/60">
                    1
                  </span>
                  <span>
                    <b className="text-white/80">1·2·3</b> = ranked candidate
                    parcels (best first).
                  </span>
                </div>
                <div className="flex items-start gap-2 text-white/45">
                  <span>
                    ⚙ = computed by the engine · ✦ = AI-written narrative.
                  </span>
                </div>
              </div>
              <p className="mt-2 max-w-[440px] text-[8.5px] leading-snug text-white/35">
                Amenities: OpenStreetMap (ODbL). Population, community &amp; parcel
                figures are illustrative prototype data — parcel points are
                approximate, which is why recommendations are shown as zones.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
