import OpenAI from "openai";
import type {
  RecommendRequest,
  RecommendResult,
  RecommendParcel,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClient(): OpenAI | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) : s;
}

function clampConfidence(c: any): "low" | "medium" | "high" {
  return c === "high" || c === "medium" || c === "low" ? c : "medium";
}

/** Deterministic fallback: first candidate parcel. */
function fallback(req: RecommendRequest): RecommendResult {
  const p = req.parcels[0];
  if (!p) {
    return {
      recommended_parcel_id: "none",
      recommended_lat: req.baseline.lat,
      recommended_lng: req.baseline.lng,
      rationale: `No buildable parcels were available near the ${req.categoryLabel.toLowerCase()} gap in ${req.district}; falling back to the baseline location.`,
      why_better_than_baseline:
        "No zoning-compatible parcel could be found, so this matches the naive baseline.",
      confidence: "low",
    };
  }
  return {
    recommended_parcel_id: p.id,
    recommended_lat: p.lat,
    recommended_lng: p.lng,
    rationale: `Parcel ${p.id} is a ${p.status.replace(
      /_/g,
      " "
    )} ${p.land_use.replace(/_/g, " ")} site (${Math.round(
      p.size
    )} m², infra ${p.infra}/100, potential ${p.potential}/100) and is the closest buildable land to the ${req.categoryLabel.toLowerCase()} gap serving roughly ${
      req.affectedPopulation
    } underserved residents in ${req.district}.`,
    why_better_than_baseline:
      "Unlike the nearest-distance baseline, this is a real, zoning-compatible parcel you can actually build on.",
    confidence: "medium",
  };
}

/** Validate the model output against the candidate set; trust app coords. */
function validate(
  parsed: any,
  req: RecommendRequest
): RecommendResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const id = parsed.recommended_parcel_id;
  const parcel = req.parcels.find((p) => p.id === id);
  if (!parcel) return null;
  return {
    recommended_parcel_id: parcel.id,
    // trust the app's own parcel coords, not the model's
    recommended_lat: parcel.lat,
    recommended_lng: parcel.lng,
    rationale: truncate(String(parsed.rationale || ""), 600),
    why_better_than_baseline: truncate(
      String(parsed.why_better_than_baseline || ""),
      600
    ),
    confidence: clampConfidence(parsed.confidence),
  };
}

function systemPrompt(): string {
  return `You are a senior urban-planning siting analyst for Abu Dhabi.
Rules:
- Use ONLY the data provided. Never invent constraints, zoning rules, or landmarks.
- Prefer vacant or under-development parcels with compatible zoning, larger size, higher infrastructure and development-potential scores, and proximity to the access gap.
- Explain in 1–2 sentences why your pick beats the naive nearest-distance baseline (which ignores buildability).
- Output STRICT JSON only, matching:
{"recommended_parcel_id": string, "recommended_lng": number, "recommended_lat": number, "rationale": string, "why_better_than_baseline": string, "confidence": "low"|"medium"|"high"}`;
}

function userPrompt(req: RecommendRequest): string {
  const lines: string[] = [];
  lines.push(`ACCESS GAP`);
  lines.push(`District: ${req.district}`);
  lines.push(`Weakest essential: ${req.categoryLabel} (${req.category})`);
  lines.push(`Affected residents: ${req.affectedPopulation}`);
  lines.push(`Current access score: ${req.currentAccess}/100`);
  lines.push(`Service-demand index: ${req.demandIndex}/100`);
  if (req.analysis) {
    const a = req.analysis;
    lines.push("");
    lines.push(`COMPUTED ANALYSIS (from the engine — do not contradict these numbers):`);
    if (a.deprivationPct != null)
      lines.push(`- Supply deprivation (E2SFCA): ${a.deprivationPct}% short of the well-served benchmark`);
    if (a.udsRank != null)
      lines.push(`- District unmet-demand rank for this service: #${a.udsRank}`);
    if (a.topCandidateId)
      lines.push(
        `- Engine's top-suitability parcel: ${a.topCandidateId}${
          a.topSuitability != null ? ` (suitability ${a.topSuitability}/100)` : ""
        }`
      );
  }
  lines.push("");
  lines.push(
    `NAIVE BASELINE (nearest-distance point, may be unbuildable): ${req.baseline.lat.toFixed(
      5
    )}, ${req.baseline.lng.toFixed(5)}`
  );
  lines.push("");
  lines.push(`CANDIDATE PARCELS (id | status | zone | land_use | size | infra | potential | lat lng):`);
  for (const p of req.parcels) {
    lines.push(
      `${p.id} | ${p.status} | ${p.zone} | ${p.land_use} | ${Math.round(
        p.size
      )} | ${p.infra} | ${p.potential} | ${p.lat.toFixed(5)} ${p.lng.toFixed(
        5
      )}`
    );
  }
  lines.push("");
  lines.push(
    `Pick the single best parcel to place a new ${req.categoryLabel} facility. Output STRICT JSON only.`
  );
  return lines.join("\n");
}

function ndjson(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

export async function POST(req: Request) {
  let body: RecommendRequest;
  try {
    body = (await req.json()) as RecommendRequest;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!body || !Array.isArray(body.parcels)) {
    return new Response("bad request", { status: 400 });
  }

  const client = getClient();
  const encoder = new TextEncoder();

  // No key: immediately stream the deterministic fallback.
  if (!client) {
    const result = fallback(body);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(ndjson({ t: "chunk", v: result.rationale }))
        );
        controller.enqueue(
          encoder.encode(
            ndjson({ t: "done", v: result, source: "fallback-nokey" })
          )
        );
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(ndjson(obj)));

      let buffer = "";
      let source = "groq";
      try {
        const completion = await client.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: userPrompt(body) },
          ],
        });

        for await (const part of completion) {
          const token = part.choices[0]?.delta?.content || "";
          if (token) {
            buffer += token;
            send({ t: "chunk", v: token });
          }
        }

        let result = validate(safeParse(buffer), body);

        // retry once non-streaming at temperature 0
        if (!result) {
          source = "groq";
          try {
            const retry = await client.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              temperature: 0,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt() },
                { role: "user", content: userPrompt(body) },
              ],
            });
            const raw = retry.choices[0]?.message?.content || "{}";
            result = validate(safeParse(raw), body);
          } catch {
            result = null;
          }
        }

        if (!result) {
          result = fallback(body);
          source = "error-fallback";
        }

        send({ t: "done", v: result, source });
      } catch {
        const result = fallback(body);
        send({ t: "done", v: result, source: "error-fallback" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    // try to extract the first JSON object substring
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
