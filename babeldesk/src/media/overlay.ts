import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const HOOK_MAX_CHARS = 42;
export const HOOK_SECONDS = 2;
export const BRANDING_TEXT = "Puerto Vallarta · Banderas Bay";

export function sanitizeHook(input: string | undefined): string {
  return (input ?? "").trim().slice(0, HOOK_MAX_CHARS);
}

/**
 * Escapa texto para drawtext de ffmpeg (filtergraph). Usar junto con `expansion=none`.
 * El apóstrofo recto no se puede escapar dentro de text='...': se cambia por ’.
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/,/g, "\\,");
}

export function buildReelVideoFilter(opts: { hook: string; showBranding: boolean }): string {
  const base = `scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${REEL_WIDTH}:${REEL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`;
  const filters: string[] = [base];
  const hook = sanitizeHook(opts.hook);
  const font = process.platform === "win32" ? "C\\\\:/Windows/Fonts/segoeui.ttf" : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

  if (hook) {
    const t = escapeDrawtext(hook);
    filters.push(
      `drawtext=fontfile=${font}:expansion=none:text='${t}':fontsize=48:fontcolor=white:borderw=3:bordercolor=black@0.6:x=(w-text_w)/2:y=h*0.12:enable='lt(t\\,${HOOK_SECONDS})'`
    );
  }
  if (opts.showBranding) {
    const b = escapeDrawtext(BRANDING_TEXT);
    filters.push(
      `drawtext=fontfile=${font}:expansion=none:text='${b}':fontsize=34:fontcolor=white:borderw=2:bordercolor=black@0.5:x=(w-text_w)/2:y=h*0.86`
    );
  }
  return filters.join(",");
}

export function defaultReelOutPath(inFile: string): string {
  const dir = path.dirname(inFile);
  const base = path.basename(inFile, path.extname(inFile));
  return path.join(dir, `${base}-reel.mp4`);
}

export function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"], { windowsHide: true });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

export type ExportReelOpts = {
  inFile: string;
  outFile?: string;
  hook?: string;
  showBranding?: boolean;
};

export type ExportReelResult = { ok: true; outFile: string } | { ok: false; error: string };

export async function exportReel(opts: ExportReelOpts): Promise<ExportReelResult> {
  if (!fs.existsSync(opts.inFile)) {
    return { ok: false, error: "Archivo de entrada no existe" };
  }
  const outFile = opts.outFile ?? defaultReelOutPath(opts.inFile);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const vf = buildReelVideoFilter({
    hook: opts.hook ?? "",
    showBranding: opts.showBranding !== false,
  });

  const args = [
    "-y",
    "-i",
    opts.inFile,
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "17",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    outFile,
  ];

  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    p.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    p.on("error", () => resolve({ ok: false, error: "ffmpeg no encontrado en PATH" }));
    p.on("close", (code) => {
      if (code === 0) resolve({ ok: true, outFile });
      else resolve({ ok: false, error: (stderr.trim() || `ffmpeg exit ${code}`).slice(-500) });
    });
  });
}
