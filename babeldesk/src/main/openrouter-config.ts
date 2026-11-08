import fs from "node:fs";
import path from "node:path";
import { openRouterHeaders } from "./openrouterHeaders";

export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";

export const SUGGESTED_OPENROUTER_MODELS = [
  DEFAULT_OPENROUTER_MODEL,
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
] as const;

type StoredConfig = {
  openrouterApiKey?: string;
  openrouterModel?: string;
};

export type OpenRouterSettingsPublic = {
  model: string;
  apiKeyStatus: "empty" | "saved";
  suggestedModels: readonly string[];
};

function configPath(dataDir: string): string {
  return path.join(dataDir, "config.json");
}

function readStored(dataDir: string): StoredConfig {
  const file = configPath(dataDir);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as StoredConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStored(dataDir: string, patch: Partial<StoredConfig>): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const prev = readStored(dataDir);
  const next: StoredConfig = { ...prev, ...patch };
  if (next.openrouterApiKey !== undefined && !String(next.openrouterApiKey).trim()) {
    delete next.openrouterApiKey;
  }
  fs.writeFileSync(configPath(dataDir), JSON.stringify(next, null, 2), "utf8");
}

export function getPublicOpenRouterSettings(dataDir: string): OpenRouterSettingsPublic {
  const stored = readStored(dataDir);
  const model =
    stored.openrouterModel?.trim() || process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  const hasKey = Boolean(resolveApiKey(dataDir));
  return {
    model,
    apiKeyStatus: hasKey ? "saved" : "empty",
    suggestedModels: SUGGESTED_OPENROUTER_MODELS,
  };
}

function resolveApiKey(dataDir: string, override?: string): string | null {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride;
  const stored = readStored(dataDir).openrouterApiKey?.trim();
  if (stored) return stored;
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  return fromEnv || null;
}

export function resolveOpenRouterModel(dataDir: string, override?: string): string {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride;
  const stored = readStored(dataDir).openrouterModel?.trim();
  if (stored) return stored;
  const fromEnv = process.env.OPENROUTER_MODEL?.trim();
  return fromEnv || DEFAULT_OPENROUTER_MODEL;
}

export function saveOpenRouterSettings(
  dataDir: string,
  opts: { apiKey?: string; model?: string }
): OpenRouterSettingsPublic {
  const patch: Partial<StoredConfig> = {};
  if (opts.model !== undefined) {
    patch.openrouterModel = opts.model.trim() || DEFAULT_OPENROUTER_MODEL;
  }
  if (opts.apiKey !== undefined) {
    const trimmed = opts.apiKey.trim();
    if (trimmed) patch.openrouterApiKey = trimmed;
  }
  if (Object.keys(patch).length) writeStored(dataDir, patch);
  return getPublicOpenRouterSettings(dataDir);
}

export async function testOpenRouterConnection(
  dataDir: string,
  opts: { apiKey?: string; model?: string } = {}
): Promise<{ ok: true; snippet: string } | { ok: false; error: string }> {
  const apiKey = resolveApiKey(dataDir, opts.apiKey);
  if (!apiKey) {
    return { ok: false, error: "API key vacía. Guarda una clave o escríbela antes de probar." };
  }
  const model = resolveOpenRouterModel(dataDir, opts.model);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...openRouterHeaders("test"),
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply OK" }],
      }),
    });
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: json.error?.message || `HTTP ${res.status}` };
    }
    const snippet = (json.choices?.[0]?.message?.content ?? "").trim().slice(0, 80) || "OK";
    return { ok: true, snippet };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("abort")) return { ok: false, error: "Timeout 15s" };
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/** Para copy engine y otros callers en main. */
export function getOpenRouterCredentials(
  dataDir: string
): { apiKey: string; model: string } | null {
  const apiKey = resolveApiKey(dataDir);
  if (!apiKey) return null;
  return { apiKey, model: resolveOpenRouterModel(dataDir) };
}

/** Tests / assert: respuesta pública nunca incluye secretos. */
export function redactConfigJsonForLogs(dataDir: string): string {
  const pub = getPublicOpenRouterSettings(dataDir);
  return JSON.stringify(pub);
}
