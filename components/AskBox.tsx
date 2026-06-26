"use client";

import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";

interface AskBoxProps {
  asking: boolean;
  onAsk: (question: string) => void;
}

const SUGGESTIONS = [
  "Where should the next school go?",
  "Find the worst clinic gap",
  "Where do we need a park?",
];

export default function AskBox({ asking, onAsk }: AskBoxProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const q = value.trim();
    if (!q || asking) return;
    onAsk(q);
  };

  return (
    <div className="glass rounded-2xl p-3 shadow-float">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles size={13} className="text-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
          Ask Reach
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Where should the next…"
          className="min-w-0 flex-1 rounded-lg bg-black/30 px-3 py-2 text-[12.5px] text-white placeholder:text-white/30 outline-none ring-1 ring-white/10 focus:ring-accent/40"
        />
        <button
          onClick={submit}
          disabled={asking}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent ring-1 ring-accent/35 transition hover:bg-accent/30 disabled:opacity-50"
        >
          {asking ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setValue(s);
              if (!asking) onAsk(s);
            }}
            className="rounded-full bg-white/5 px-2.5 py-1 text-[10.5px] text-white/55 ring-1 ring-white/8 transition hover:bg-white/10 hover:text-white/80"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
