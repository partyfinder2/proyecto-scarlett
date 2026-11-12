import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { NetworkKey } from "./downloader";
import { checkFfmpegAvailable } from "./videoCutter";
import { detectWatermarkRegionsWithAI } from "./watermarkVision";

export type WatermarkPresetKey = NetworkKey | "generic" | "none";
export type WatermarkMode = "off" | "standard" | "max" | "manual";

export type DelogoRegionPct = {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
};

const PRESET_REGIONS: Record<WatermarkPresetKey, DelogoRegionPct[]> = {
  tiktok: [
    { xPct: 0.52, yPct: 0.8, wPct: 0.46, hPct: 0.14 },
    { xPct: 0.02, yPct: 0.03, wPct: 0.55, hPct: 0.07 },
  ],
  instagram: [
    { xPct: 0.04, yPct: 0.84, wPct: 0.55, hPct: 0.12 },
    { xPct: 0.68, yPct: 0.02, wPct: 0.3, hPct: 0.07 },
  ],
  facebook: [{ xPct: 0.05, yPct: 0.85, wPct: 0.5, hPct: 0.12 }],
  youtube: [{ xPct: 0.02, yPct: 0.02, wPct: 0.35, hPct: 0.1 }],
  twitter: [{ xPct: 0.55, yPct: 0.82, wPct: 0.42, hPct: 0.12 }],
  generic: [{ xPct: 0.55, yPct: 0.82, wPct: 0.42, hPct: 0.12 }],
  none: [],
};

/** Rejilla extra para marcas grandes / barras / centro. */
export function buildAggressiveGrid(): DelogoRegionPct[] {
  const g: DelogoRegionPct[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      g.push({
        xPct: col * 0.25,
        yPct: 0.68 + row * 0.1,
        wPct: 0.25,
        hPct: 0.1,
      });
    }
  }
  for (let col = 0; col < 3; col++) {
    g.push({ xPct: col * 0.33, yPct: 0, wPct: 0.34, hPct: 0.11 });
  }
  g.push({ xPct: 0.1, yPct: 0.38, wPct: 0.8, hPct: 0.18 });
  g.push({ xPct: 0, yPct: 0.45, wPct: 0.22, hPct: 0.2 });
  g.push({ xPct: 0.78, yPct: 0.45, wPct: 0.22, hPct: 0.2 });
  return g;
}

export function resolvePresetKey(
  network: string | undefined,
  mode: "auto" | WatermarkPresetKey
): WatermarkPresetKey {
  if (mode !== "auto") return mode;
  if (network && network in PRESET_REGIONS) return network as WatermarkPresetKey;
  return "generic";
}

function regionArea(r: DelogoRegionPct): number {
  return r.wPct * r.hPct;
}

export function mergeRegionsUnique(regions: DelogoRegionPct[], max = 20): DelogoRegionPct[] {
  const out: DelogoRegionPct[] = [];
  for (const r of regions) {
    if (r.wPct < 0.02 || r.hPct < 0.02) continue;
    const dup = out.some(
      (o) =>
        Math.abs(o.xPct - r.xPct) < 0.05 &&
        Math.abs(o.yPct - r.yPct) < 0.05 &&
        Math.abs(o.wPct - r.wPct) < 0.08
    );
    if (!dup) out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

function probeVideoSize(filePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0",
        filePath,
      ],
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        const [w, h] = stdout.trim().split(",").map((n) => Number.parseInt(n, 10));
        if (!Number.isFinite(w) || !Number.isFinite(h)) {
          reject(new Error("No se pudo leer tamaño del video (ffprobe)."));
          return;
        }
        resolve({ width: w, height: h });
      }
    );
  });
}

/** Margen que exige ffmpeg delogo (x/y > 0 y x+w < width, y+h < height). */
export const DELOGO_FRAME_MARGIN = 2;

function toPixels(r: DelogoRegionPct, width: number, height: number) {
  let x = Math.max(0, Math.floor(r.xPct * width));
  let y = Math.max(0, Math.floor(r.yPct * height));
  let w = Math.floor(r.wPct * width);
  let h = Math.floor(r.hPct * height);
  if (x + w > width) w = width - x;
  if (y + h > height) h = height - y;
  x -= x % 2;
  y -= y % 2;
  w -= w % 2;
  h -= h % 2;
  return { x, y, w, h };
}

/** Rectángulo válido para delogo; null si no cabe en el frame. */
export function toDelogoPixels(
  r: DelogoRegionPct,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null {
  const m = DELOGO_FRAME_MARGIN;
  if (width < m * 2 + 10 || height < m * 2 + 10) return null;

  let x = Math.floor(r.xPct * width);
  let y = Math.floor(r.yPct * height);
  let w = Math.floor(r.wPct * width);
  let h = Math.floor(r.hPct * height);

  x = Math.max(m, x);
  y = Math.max(m, y);
  w = Math.min(w, width - x - m);
  h = Math.min(h, height - y - m);

  x -= x % 2;
  y -= y % 2;
  w -= w % 2;
  h -= h % 2;

  if (w < 8 || h < 8) return null;
  if (x + w >= width - m || y + h >= height - m) return null;
  return { x, y, w, h };
}

export function buildDelogoFilter(
  regions: DelogoRegionPct[],
  width: number,
  height: number
): string {
  const parts: string[] = [];
  for (const r of regions) {
    const box = toDelogoPixels(r, width, height);
    if (!box) continue;
    parts.push(`delogo=x=${box.x}:y=${box.y}:w=${box.w}:h=${box.h}`);
  }
  return parts.join(",");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message));
      else resolve();
    });
  });
}

async function extractFrameJpeg(videoPath: string, timeSec: number, outJpg: string): Promise<void> {
  await runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(timeSec),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outJpg,
  ]);
}

async function applyDelogoPass(
  input: string,
  output: string,
  regions: DelogoRegionPct[],
  width: number,
  height: number
): Promise<boolean> {
  const vf = buildDelogoFilter(regions, width, height);
  if (!vf) return false;
  try {
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "16",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ]);
    return true;
  } catch {
    /* Un solo rectángulo inválido tumba la cadena: aplicar uno por uno. */
    let current = input;
    const dir = path.dirname(output);
    const base = path.basename(output, path.extname(output));
    let applied = 0;
    for (let i = 0; i < regions.length; i++) {
      const single = buildDelogoFilter([regions[i]], width, height);
      if (!single) continue;
      const stepOut =
        i === regions.length - 1 ? output : path.join(dir, `${base}.delogo-${i}.mp4`);
      try {
        await runFfmpeg([
          "-y",
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          current,
          "-vf",
          single,
          "-c:v",
          "libx264",
          "-preset",
          "fast",
          "-crf",
          "16",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
          stepOut,
        ]);
        applied++;
        if (current !== input && current !== output && fs.existsSync(current)) {
          try {
            fs.unlinkSync(current);
          } catch {
            /* ignore */
          }
        }
        current = stepOut;
      } catch {
        if (stepOut !== output && fs.existsSync(stepOut)) {
          try {
            fs.unlinkSync(stepOut);
          } catch {
            /* ignore */
          }
        }
      }
    }
    return applied > 0 && fs.existsSync(output);
  }
}

/** ffmpeg boxblur: chroma radius must be 0–9 on current builds. */
export function clampBoxBlurRadius(radius: number): number {
  return Math.min(9, Math.max(1, Math.floor(radius)));
}

/**
 * Construye UN SOLO filter_complex que aplica blur a regiones grandes
 * y delogo a regiones pequeñas, todo en una pasada.
 */
export function buildCombinedFilterComplex(
  largeRegions: Array<{ x: number; y: number; w: number; h: number }>,
  smallRegions: Array<{ x: number; y: number; w: number; h: number }>,
  radius = 8
): string {
  const parts: string[] = [];
  const lr = clampBoxBlurRadius(radius);
  const cr = clampBoxBlurRadius(radius);

  // Si no hay nada que hacer, devolver vacío
  if (largeRegions.length === 0 && smallRegions.length === 0) return "";

  // Paso 1: Blurs encadenados para regiones grandes
  let currentLabel = "0:v";
  for (let i = 0; i < largeRegions.length; i++) {
    const { x, y, w, h } = largeRegions[i];
    const outLabel = `blur${i}`;
    // split → crop → blur → overlay
    parts.push(
      `[${currentLabel}]split[main${i}][tmp${i}];` +
      `[tmp${i}]crop=${w}:${h}:${x}:${y},boxblur=${lr}:2:${cr}:2[blr${i}];` +
      `[main${i}][blr${i}]overlay=${x}:${y}[${outLabel}]`
    );
    currentLabel = outLabel;
  }

  // Paso 2: Delogos encadenados para regiones pequeñas
  if (smallRegions.length > 0) {
    const delogoParts = smallRegions.map(
      (r) => `delogo=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}`
    );
    // Si hay blurs previos, encadenar; si no, empezar desde 0:v
    if (largeRegions.length > 0) {
      parts.push(`[${currentLabel}]${delogoParts.join(",")}[outv]`);
    } else {
      parts.push(`[0:v]${delogoParts.join(",")}[outv]`);
    }
    currentLabel = "outv";
  } else if (largeRegions.length > 0) {
    // Renombrar el último blur a outv
    const lastPart = parts[parts.length - 1];
    parts[parts.length - 1] = lastPart.replace(/\[blur\d+\]$/, "[outv]");
    currentLabel = "outv";
  }

  return parts.join(";");
}

/** Aplica blur+delogo combinados en una sola pasada ffmpeg. */
async function applyCombinedPass(
  input: string,
  output: string,
  largeRegions: DelogoRegionPct[],
  smallRegions: DelogoRegionPct[],
  width: number,
  height: number,
  timeoutMs = 300_000
): Promise<boolean> {
  // Convertir regiones a píxeles
  const largePx = largeRegions
    .map((r) => toPixels(r, width, height))
    .filter((p) => p.w >= 16 && p.h >= 16);
  const smallPx = smallRegions
    .map((r) => toDelogoPixels(r, width, height))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (largePx.length === 0 && smallPx.length === 0) return false;

  const fc = buildCombinedFilterComplex(largePx, smallPx, 8);
  if (!fc) return false;

  return new Promise((resolve) => {
    const proc = execFile(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        input,
        "-filter_complex",
        fc,
        "-map",
        "[outv]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "16",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: timeoutMs },
      (err) => {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      }
    );
    proc.unref?.();
  });
}

async function collectRegions(opts: {
  preset: WatermarkPresetKey;
  mode: WatermarkMode;
  inputPath: string;
  dataDir?: string;
}): Promise<DelogoRegionPct[]> {
  let regions = [...(PRESET_REGIONS[opts.preset] ?? PRESET_REGIONS.generic)];
  if (opts.mode === "max") {
    regions = regions.concat(buildAggressiveGrid());
    if (opts.dataDir) {
      const tmpDir = path.join(opts.dataDir, "wm-frames", crypto.randomUUID());
      fs.mkdirSync(tmpDir, { recursive: true });
      try {
        const duration = await probeDurationSec(opts.inputPath);
        const times = [0.05, 0.5, 0.85].map((p) => Math.max(0, duration * p));
        const frames: string[] = [];
        for (let i = 0; i < times.length; i++) {
          const fp = path.join(tmpDir, `f${i}.jpg`);
          await extractFrameJpeg(opts.inputPath, times[i], fp);
          frames.push(fp);
        }
        const ai = await detectWatermarkRegionsWithAI(opts.dataDir, frames);
        regions = regions.concat(ai);
      } catch {
        /* IA opcional */
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }
  return mergeRegionsUnique(regions);
}

function probeDurationSec(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      (err, stdout) => {
        if (err) resolve(30);
        else resolve(Math.max(1, Number.parseFloat(stdout.trim()) || 30));
      }
    );
  });
}

export type RemoveWatermarkResult = {
  ok: boolean;
  outputPath?: string;
  error?: string;
  filter?: string;
  mode?: WatermarkMode;
  regionsUsed?: number;
};

/**
 * Detecta regiones de marca de agua con IA de visión (no aplica nada).
 * Extrae 3 frames y pregunta al modelo dónde hay logos/textos.
 */
export async function detectWatermarkRegions(opts: {
  inputPath: string;
  dataDir?: string;
}): Promise<{ ok: boolean; regions?: DelogoRegionPct[]; error?: string }> {
  const abs = path.resolve(opts.inputPath);
  if (!fs.existsSync(abs)) return { ok: false, error: "Archivo no encontrado." };
  if (!opts.dataDir) {
    return { ok: false, error: "Falta configurar la clave de IA (OpenRouter)." };
  }

  const ffmpegOk = await checkFfmpegAvailable();
  if (!ffmpegOk) return { ok: false, error: "ffmpeg no está en PATH." };

  const tmpDir = path.join(opts.dataDir, "wm-frames", crypto.randomUUID());
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const duration = await probeDurationSec(abs);
    const times = [0.05, 0.5, 0.85].map((p) => Math.max(0, duration * p));
    const frames: string[] = [];
    for (let i = 0; i < times.length; i++) {
      const fp = path.join(tmpDir, `f${i}.jpg`);
      await extractFrameJpeg(abs, times[i], fp);
      frames.push(fp);
    }
    const regions = await detectWatermarkRegionsWithAI(opts.dataDir, frames);
    if (regions.length === 0) {
      return {
        ok: false,
        error:
          "La IA no devolvió zonas (¿clave de OpenRouter sin modelo de visión, sin saldo, o no detectó marca?).",
      };
    }
    return { ok: true, regions: mergeRegionsUnique(regions) };
  } catch (e) {
    return { ok: false, error: String(e) };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Quita / difumina marcas de agua (estándar o máximo con IA).
 */
export async function removeWatermarkFromFile(opts: {
  inputPath: string;
  preset: WatermarkPresetKey;
  mode?: WatermarkMode;
  dataDir?: string;
  /** Regiones marcadas a mano por el usuario (0–1). En modo "manual" son las únicas. */
  manualRegions?: DelogoRegionPct[];
}): Promise<RemoveWatermarkResult> {
  const mode = opts.mode ?? "standard";
  const abs = path.resolve(opts.inputPath);
  if (!fs.existsSync(abs)) {
    return { ok: false, error: "Archivo no encontrado." };
  }
  if (mode === "off" || opts.preset === "none") {
    return { ok: true, outputPath: abs, mode };
  }

  const ffmpegOk = await checkFfmpegAvailable();
  if (!ffmpegOk) {
    return { ok: false, error: "ffmpeg no está en PATH." };
  }

  let width: number;
  let height: number;
  try {
    ({ width, height } = await probeVideoSize(abs));
  } catch (e) {
    return { ok: false, error: String(e) };
  }

  let regions: DelogoRegionPct[];
  if (mode === "manual") {
    // Solo lo que el usuario dibujó: nada de presets ni rejilla agresiva.
    regions = mergeRegionsUnique(
      (opts.manualRegions ?? []).filter((r) => r.wPct > 0.01 && r.hPct > 0.01)
    );
    if (regions.length === 0) {
      return { ok: false, error: "No marcaste ninguna zona sobre la marca de agua." };
    }
  } else {
    regions = await collectRegions({
      preset: opts.preset,
      mode,
      inputPath: abs,
      dataDir: opts.dataDir,
    });
  }
  if (regions.length === 0) {
    return { ok: true, outputPath: abs, mode, regionsUsed: 0 };
  }

  const LARGE = 0.032;
  const small = regions.filter((r) => regionArea(r) < LARGE);
  const large = regions.filter((r) => regionArea(r) >= LARGE);

  const dir = path.dirname(abs);
  const base = path.basename(abs, path.extname(abs));
  const tempOut = path.join(dir, `${base}.__nowm.tmp.mp4`);

  try {
    // UNA SOLA PASADA: blur + delogo combinados
    const ok = await applyCombinedPass(abs, tempOut, large, small, width, height);

    if (!ok) {
      // Fallback: solo delogo si el combinado falló
      if (small.length > 0) {
        const delogoOk = await applyDelogoPass(abs, tempOut, small, width, height);
        if (!delogoOk) {
          return { ok: true, outputPath: abs, mode, regionsUsed: 0 };
        }
      } else {
        return { ok: true, outputPath: abs, mode, regionsUsed: 0 };
      }
    }

    if (!fs.existsSync(tempOut)) {
      return { ok: true, outputPath: abs, mode, regionsUsed: regions.length };
    }

    // Reemplazar original con resultado
    // Intentar varias veces en caso de que Windows tenga el archivo bloqueado
    let replaced = false;
    for (let retry = 0; retry < 5; retry++) {
      try {
        fs.unlinkSync(abs);
        fs.renameSync(tempOut, abs);
        replaced = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200 * (retry + 1)));
      }
    }

    if (!replaced && fs.existsSync(tempOut)) {
      // Si no pudimos reemplazar, copiar contenido y limpiar
      try {
        fs.copyFileSync(tempOut, abs);
        fs.unlinkSync(tempOut);
        replaced = true;
      } catch {
        /* ignore */
      }
    }

    return {
      ok: true,
      outputPath: abs,
      mode,
      regionsUsed: regions.length,
      filter: `delogo×${small.length}+blur×${large.length}`,
    };
  } catch (e) {
    // Limpiar temporal si existe
    if (fs.existsSync(tempOut)) {
      try {
        fs.unlinkSync(tempOut);
      } catch {
        /* ignore */
      }
    }
    return { ok: false, error: String(e) };
  }
}
