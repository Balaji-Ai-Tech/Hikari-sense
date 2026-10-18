import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import type { AiTriage } from "@/types";

const HAZARDS = [
  "heavy_rainfall",
  "flood",
  "thunderstorm",
  "heatwave",
  "cyclone",
  "strong_wind",
  "fog",
  "dust_storm",
  "other",
];
const URGENCY = ["low", "medium", "high", "critical"] as const;
const QUEUES = [
  "Hydro-met (rain & flood)",
  "Severe storms & wind",
  "Heat & air quality",
  "Coastal & cyclone",
  "General review",
];

const SYSTEM = `You triage citizen weather-hazard reports for an Indian weather intelligence platform.
Reply with ONLY a JSON object, no prose, with keys:
"hazard": one of ${HAZARDS.join(", ")};
"urgency": one of low, medium, high, critical (critical = immediate danger to life);
"queue": one of ${QUEUES.map((q) => `"${q}"`).join(", ")};
"confidence": number 0..1;
"rationale": one short sentence (max 30 words) in English.
Reports may be in any Indian language. If a photo is attached, use it. If the report is not a weather hazard, use hazard "other" and queue "General review".`;

export async function triageReport(input: {
  description: string;
  hazard: string;
  location: string;
  image?: string | undefined;
}): Promise<AiTriage> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const text = `Citizen-selected hazard: ${input.hazard}\nLocation: ${input.location}\nDescription: ${input.description}`;
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: input.image
        ? [
            { type: "text", text },
            { type: "image", image: input.image },
          ]
        : text,
    },
  ];
  let streamErr: unknown;
  const result = streamText({
    onError: ({ error }) => {
      streamErr = error;
    },
    model: provider.responses("openai/gpt-6-astra"),
    instructions: SYSTEM,
    messages,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  let out = "";
  try {
    out = await result.text;
  } catch (e) {
    throw streamErr ?? e;
  }
  const json = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(json);
  } catch {
    throw new Error("AI returned an unreadable answer");
  }
  const pick = <T extends string>(v: unknown, list: readonly T[], d: T) =>
    list.includes(v as T) ? (v as T) : d;
  return {
    hazard: pick(p["hazard"], HAZARDS, "other"),
    urgency: pick(p["urgency"], URGENCY, "medium"),
    queue: pick(p["queue"], QUEUES, "General review"),
    confidence: Math.max(0, Math.min(1, Number(p["confidence"]) || 0.5)),
    rationale: String(p["rationale"] ?? "").slice(0, 240),
    usedPhoto: Boolean(input.image),
  };
}
