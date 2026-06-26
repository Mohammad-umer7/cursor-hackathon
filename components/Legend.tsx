"use client";

export default function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
      <div className="glass flex flex-wrap items-center justify-center gap-2 rounded-full px-3 py-2 shadow-float sm:gap-3 sm:px-4">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
          Walk access
        </span>
        <span className="text-[10px] text-gap-bad">Hard to reach</span>
        <div
          className="h-2 w-28 rounded-full sm:w-40"
          style={{
            background:
              "linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)",
          }}
          role="img"
          aria-label="Access gradient from hard to reach to easy 15-minute access"
        />
        <span className="text-[10px] text-gap-good">Easy 15-min access</span>
      </div>
    </div>
  );
}
