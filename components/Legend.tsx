"use client";

export default function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
      <div className="glass flex items-center gap-3 rounded-full px-4 py-2 shadow-float">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Access
        </span>
        <span className="text-[10px] text-gap-bad">
          Service desert (hard to reach)
        </span>
        <div
          className="h-2 w-40 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)",
          }}
        />
        <span className="text-[10px] text-gap-good">
          15-min city (easy reach)
        </span>
      </div>
    </div>
  );
}
