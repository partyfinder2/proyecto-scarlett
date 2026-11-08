import { openRouterHeaders } from "../main/openrouterHeaders";

export interface DayPlan {
  day: string;
  idea: string;
}

export interface WeekPlanResult {
  ok: boolean;
  plan?: DayPlan[];
  error?: string;
}

export const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const SYSTEM_PROMPT = `You are a social media content planner for a personal travel account 
focused on Puerto Vallarta and Banderas Bay, Mexico. 
Audience: USA tourists and travel enthusiasts.
Tone: casual, beach, relaxed. No dating, no services, no prices.
Language: English only.`;

const USER_PROMPT = `Generate exactly 7 short video shoot ideas for the week, one per day 
(Monday to Sunday). Each idea must be:
- One line only
- Under 80 characters
- A concrete visual scene to film (no talking required)
- Location in Puerto Vallarta or Banderas Bay area

Respond ONLY with valid JSON, no markdown, no explanation:
[
  {"day": "Monday", "idea": "..."},
  {"day": "Tuesday", "idea": "..."},
  {"day": "Wednesday", "idea": "..."},
  {"day": "Thursday", "idea": "..."},
  {"day": "Friday", "idea": "..."},
  {"day": "Saturday", "idea": "..."},
  {"day": "Sunday", "idea": "..."}
]`;

export function parseWeekPlanContent(raw: string): WeekPlanResult {
  const clean = raw.replace(/```json|```/g, "").trim();
  let parsed: DayPlan[];
  try {
    parsed = JSON.parse(clean) as DayPlan[];
  } catch {
    return { ok: false, error: `Could not parse response from model. Raw: ${clean.slice(0, 200)}` };
  }
  if (!Array.isArray(parsed) || parsed.length !== 7) {
    return { ok: false, error: "Model did not return exactly 7 days. Try again." };
  }
  for (const d of parsed) {
    if (!WEEK_DAYS.includes(d.day as (typeof WEEK_DAYS)[number]) || typeof d.idea !== "string") {
      return { ok: false, error: "Response format invalid. Try again." };
    }
  }
  return { ok: true, plan: parsed };
}

export async function fetchWeekPlan(
  apiKey: string,
  model: string = "google/gemini-2.5-flash"
): Promise<WeekPlanResult> {
  if (!apiKey?.trim()) {
    return { ok: false, error: "OpenRouter API key is not configured. Go to Ajustes to add it." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
        ...openRouterHeaders("week-plan"),
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_PROMPT },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `OpenRouter error ${res.status}: ${text.slice(0, 300)}` };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data?.choices?.[0]?.message?.content ?? "";
    return parseWeekPlanContent(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) return { ok: false, error: "Timeout al contactar OpenRouter" };
    return { ok: false, error: `Network error: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
