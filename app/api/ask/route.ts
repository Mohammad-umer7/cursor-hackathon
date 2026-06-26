import OpenAI from "openai";
import { CATEGORIES, type CategoryKey } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

interface AskResult {
  category: CategoryKey;
  district: string | null;
  interpretation: string;
}

function getClient(): OpenAI | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

const KEYWORD_MAP: { words: string[]; cat: CategoryKey }[] = [
  { words: ["school", "education", "kindergarten", "university", "college", "nursery"], cat: "education" },
  { words: ["clinic", "hospital", "health", "doctor", "pharmacy", "medical"], cat: "healthcare" },
  { words: ["park", "garden", "playground", "green", "recreation"], cat: "parks" },
  { words: ["bus", "metro", "transit", "transport", "station", "tram", "mobility"], cat: "transit" },
  { words: ["grocery", "supermarket", "market", "mall", "shop", "food", "convenience"], cat: "grocery" },
  { words: ["bank", "post", "service", "community", "fuel", "petrol", "atm"], cat: "services" },
];

function heuristic(question: string, districts: string[]): AskResult {
  const q = (question || "").toLowerCase();
  let category: CategoryKey = "grocery";
  for (const entry of KEYWORD_MAP) {
    if (entry.words.some((w) => q.includes(w))) {
      category = entry.cat;
      break;
    }
  }
  let district: string | null = null;
  for (const d of districts) {
    if (d && q.includes(d.toLowerCase())) {
      district = d;
      break;
    }
  }
  const label = CATEGORIES.find((c) => c.key === category)?.label ?? category;
  return {
    category,
    district,
    interpretation: `Looking for the biggest ${label.toLowerCase()} gap${
      district ? ` in ${district}` : ""
    }.`,
  };
}

function isValid(
  obj: any,
  districts: string[]
): obj is AskResult {
  if (!obj || typeof obj !== "object") return false;
  if (!CATEGORY_KEYS.includes(obj.category)) return false;
  if (obj.district !== null && !districts.includes(obj.district)) return false;
  return true;
}

export async function POST(req: Request) {
  let body: { question?: string; districts?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }
  const question = body.question || "";
  const districts = Array.isArray(body.districts) ? body.districts : [];

  const client = getClient();
  if (!client) {
    return Response.json(heuristic(question, districts));
  }

  try {
    const system = `You convert a natural-language urban-planning question into JSON.
Respond with a JSON object: {"category": <one of ${JSON.stringify(
      CATEGORY_KEYS
    )}>, "district": <one of ${JSON.stringify(
      districts
    )} or null>, "interpretation": <one short sentence>}.
The "category" MUST be exactly one of the six keys. The "district" MUST be exactly one of the provided district names, or null if none is clearly referenced. Do not invent districts or categories.`;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    if (parsed.district === undefined) parsed.district = null;
    if (isValid(parsed, districts)) {
      if (!parsed.interpretation) {
        parsed.interpretation = heuristic(question, districts).interpretation;
      }
      return Response.json(parsed);
    }
    return Response.json(heuristic(question, districts));
  } catch {
    return Response.json(heuristic(question, districts));
  }
}
