import fs from "node:fs";
import path from "node:path";
import { getOpenRouterCredentials, resolveOpenRouterModel } from "./openrouter-config";
import { extractJsonFromLlm } from "./copyEngine";

export type PvTouristVariant = {
  caption: string;
  hook: string;
  description: string;
  cta: string;
  hashtags: string[];
};

export type PvTouristResponse = {
  variants: PvTouristVariant[];
  model: string;
};

type TemplateFile = {
  templates: Array<{
    id: string;
    hashtagsAlways: string[];
    hashtagsRotatePool: string[];
  }>;
};

const ROTATE_COUNT = 3;

export function loadPvTouristTemplate(rootDir: string) {
  const file = path.join(rootDir, "data", "templates.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as TemplateFile;
  const t = raw.templates.find((x) => x.id === "pv-tourist-en");
  if (!t) throw new Error("Plantilla pv-tourist-en no encontrada en data/templates.json");
  return t;
}

/** Elige 3 hashtags del pool (determinístico por día para rotación suave). */
export function pickRotatingHashtags(pool: string[], when: Date = new Date()): string[] {
  const daySeed = when.getFullYear() * 1000 + when.getMonth() * 31 + when.getDate();
  const sorted = [...pool].sort((a, b) => {
    const ha = simpleHash(a + daySeed) % 1000;
    const hb = simpleHash(b + daySeed) % 1000;
    return ha - hb;
  });
  return sorted.slice(0, ROTATE_COUNT);
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function assemblePvTouristCaption(parts: {
  hook: string;
  description: string;
  cta: string;
  hashtagsAlways: string[];
  hashtagsExtra: string[];
}): string {
  const tags = [...parts.hashtagsAlways, ...parts.hashtagsExtra];
  const lines = [
    parts.hook.trim(),
    parts.description.trim(),
    "Puerto Vallarta & Banderas Bay",
    parts.cta.trim(),
    tags.join(" "),
  ].filter(Boolean);
  return lines.join("\n\n");
}

export async function generatePvTouristVariants(opts: {
  rootDir: string;
  dataDir: string;
  topic: string;
  level: string;
}): Promise<PvTouristResponse> {
  const creds = getOpenRouterCredentials(opts.dataDir);
  if (!creds?.apiKey) {
    throw new Error("OpenRouter: API key no configurada (Ajustes → Guardar clave)");
  }
  const tpl = loadPvTouristTemplate(opts.rootDir);
  const rotate = pickRotatingHashtags(tpl.hashtagsRotatePool);
  const model = resolveOpenRouterModel(opts.dataDir);

  const levelRules =
    opts.level === "A_relax"
      ? "No quotes, no prices, no 'book now', no 'as seen on'."
      : "Keep tone appropriate for the content level.";

  const system = `You write English social captions for Puerto Vallarta / Banderas Bay tourism.
Respond ONLY valid JSON:
{"variants":[{"hook":"one line","description":"2-3 short lines as one string","cta":"one line like Save this for your next trip"}, ...]}
Exactly 3 variants. Beach, casual. No dating, no vulgar slang. No URLs or links in any field. ${levelRules}`;

  const user = `Topic / scene: ${opts.topic}
Content level: ${opts.level}
Do NOT include hashtags in JSON (added separately).`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1/babeldesk",
      "X-Title": "BabelDesk",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
    }),
  });

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message || `OpenRouter HTTP ${res.status}`);

  const raw = json.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJsonFromLlm(raw)) as {
    variants: Array<{ hook: string; description: string; cta: string }>;
  };
  if (!parsed.variants?.length) throw new Error("Respuesta sin variants");

  const variants: PvTouristVariant[] = parsed.variants.slice(0, 3).map((v) => {
    const hashtags = [...tpl.hashtagsAlways, ...rotate];
    const caption = assemblePvTouristCaption({
      hook: v.hook,
      description: v.description,
      cta: v.cta,
      hashtagsAlways: tpl.hashtagsAlways,
      hashtagsExtra: rotate,
    });
    return { caption, hook: v.hook, description: v.description, cta: v.cta, hashtags };
  });

  return { variants, model };
}
