import fs from "node:fs";
import path from "node:path";

const COOKIE_FILE_NAMES = [
  "cookies.txt",
  "www.youtube.com_cookies.txt",
  "youtube_cookies.txt",
  "www.instagram.com_cookies.txt",
  "instagram_cookies.txt",
  "instagram.com_cookies.txt",
];

function resolveCookieFile(dataDir: string): string | null {
  return COOKIE_FILE_NAMES.map((f) => path.join(dataDir, f)).find((p) => fs.existsSync(p)) ?? null;
}

/** Args extra para yt-dlp: cookies.txt (prioridad) o sesión del navegador (.env). */
export function resolveYtDlpCookieArgs(dataDir: string): string[] {
  const file = resolveCookieFile(dataDir);
  if (file) return ["--cookies", file];

  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ["--cookies-from-browser", browser];
  return [];
}

export function ytDlpCookiesConfigured(dataDir: string): boolean {
  return resolveYtDlpCookieArgs(dataDir).length > 0;
}
