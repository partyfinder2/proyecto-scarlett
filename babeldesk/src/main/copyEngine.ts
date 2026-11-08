/**
 * CopyEngine OpenRouter — 3 variantes JSON por red (P1).
 * Clave y modelo desde data/config.json (ver openrouter-config.ts).
 */

import { getOpenRouterCredentials, resolveOpenRouterModel } from "./openrouter-config";
import { openRouterHeaders } from "./openrouterHeaders";

export type CopyNetwork = "tiktok" | "instagram" | "facebook_page" | "facebook_group" | "x";

export type CopyVariant = {
  caption: string;
  hashtags: string[];
  cta?: string;
};

export type CopyResponse = {
  variants: CopyVariant[];
  model: string;
};

const NETWORK_RULES: Record<CopyNetwork, string> = {
  tiktok: "1-2 líneas, 3-5 hashtags, sin link en texto",
  instagram: "2-4 líneas, 5-8 hashtags, CTA bio",
  facebook_page: "claro, 0-3 hashtags, incluir link si se da",
  facebook_group: "inglés humano corto, 0-2 hashtags, casi sin link",
  x: "1 línea, 0-2 hashtags, link ok",
};

export async function generateCopyVariants(opts: {
  network: CopyNetwork;
  level: string;
  topic: string;
  linkUrl?: string;
  trends?: string[];
  model?: string;
  dataDir: string;
}): Promise<CopyResponse> {
  const creds = getOpenRouterCredentials(opts.dataDir);
  const key = creds?.apiKey;
  if (!key) {
    throw new Error("OpenRouter: API key no configurada (Ajustes → Guardar clave)");
  }
  if (opts.level === "C_morboso" && opts.network === "tiktok") {
    throw new Error("Nivel C: no generar copy para TikTok");
  }

  const model = opts.model || resolveOpenRouterModel(opts.dataDir);
  const trendsBlock = opts.trends?.length ? `Tendencias: ${opts.trends.join(", ")}` : "";

  const system = `Eres copywriter para redes. Responde SOLO JSON válido:
{"variants":[{"caption":"...","hashtags":["#a"],"cta":"..."}, ...]}
Exactamente 3 variantes. Reglas red: ${NETWORK_RULES[opts.network]}`;

  const user = `Red: ${opts.network}
Nivel contenido: ${opts.level}
Tema: ${opts.topic}
Link destino (si aplica): ${opts.linkUrl ?? "ninguno"}
${trendsBlock}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...openRouterHeaders("copy"),
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
  if (!res.ok) {
    throw new Error(json.error?.message || `OpenRouter HTTP ${res.status}`);
  }

  const raw = json.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(extractJsonFromLlm(raw)) as CopyResponse;
  if (!parsed.variants?.length) throw new Error("Respuesta sin variants");
  return { ...parsed, model };
}

export function extractJsonFromLlm(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON no encontrado en respuesta IA");
  return text.slice(start, end + 1);
}
