import fs from "node:fs";
import { getOpenRouterCredentials } from "../main/openrouter-config";
import { openRouterHeaders } from "../main/openrouterHeaders";
import type { DelogoRegionPct } from "./watermarkRemover";

type VisionBox = { x_pct: number; y_pct: number; w_pct: number; h_pct: number; label?: string };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function parseVisionJson(text: string): VisionBox[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as VisionBox[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((b) => ({
        x_pct: clamp01(Number(b.x_pct)),
        y_pct: clamp01(Number(b.y_pct)),
        w_pct: clamp01(Number(b.w_pct)),
        h_pct: clamp01(Number(b.h_pct)),
        label: b.label,
      }))
      .filter((b) => b.w_pct > 0.02 && b.h_pct > 0.02);
  } catch {
    return [];
  }
}

/**
 * Pide a un modelo visión cajas normalizadas 0–1 donde hay logo/texto de marca de agua.
 */
export async function detectWatermarkRegionsWithAI(
  dataDir: string,
  frameJpegPaths: string[]
): Promise<DelogoRegionPct[]> {
  const creds = getOpenRouterCredentials(dataDir);
  if (!creds) return [];

  const images = frameJpegPaths
    .filter((p) => fs.existsSync(p))
    .slice(0, 3)
    .map((p) => {
      const b64 = fs.readFileSync(p).toString("base64");
      return {
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      };
    });

  if (images.length === 0) return [];

  const prompt = `Eres un detector de marcas de agua en frames de video vertical (TikTok/Reels).
Devuelve SOLO un JSON array (sin markdown) de objetos con claves numéricas 0-1:
x_pct, y_pct, w_pct, h_pct (esquina superior izquierda + tamaño relativo al frame).
Incluye: logos, @usuarios, textos "TikTok/Instagram", barras inferiores de UI, marcas centrales semitransparentes.
Máximo 12 cajas. No incluyas caras ni el sujeto principal salvo que tenga texto encima.
Ejemplo: [{"x_pct":0.6,"y_pct":0.82,"w_pct":0.35,"h_pct":0.12}]`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
        ...openRouterHeaders("watermark"),
      },
      body: JSON.stringify({
        model: creds.model,
        max_tokens: 800,
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...images],
          },
        ],
      }),
    });
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (!res.ok) return [];
    const content = json.choices?.[0]?.message?.content ?? "";
    return parseVisionJson(content).map((b) => ({
      xPct: b.x_pct,
      yPct: b.y_pct,
      wPct: b.w_pct,
      hPct: b.h_pct,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
