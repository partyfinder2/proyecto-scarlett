import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  detectNetwork,
  cleanFilename,
  parseYtDlpError,
  checkYtDlpAvailable,
} from "./downloader";

describe("downloader connector", () => {
  test("detectNetwork para redes soportadas", () => {
    assert.equal(detectNetwork("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.key, "youtube");
    assert.equal(detectNetwork("https://youtu.be/dQw4w9WgXcQ")?.key, "youtube");
    assert.equal(detectNetwork("https://www.tiktok.com/@user/video/123456789")?.key, "tiktok");
    assert.equal(detectNetwork("https://vt.tiktok.com/ZS12345/")?.key, "tiktok");
    assert.equal(detectNetwork("https://www.instagram.com/reel/C123456/")?.key, "instagram");
    assert.equal(detectNetwork("https://instagr.am/p/C123456/")?.key, "instagram");
    assert.equal(detectNetwork("https://www.facebook.com/watch/?v=987654")?.key, "facebook");
    assert.equal(detectNetwork("https://fb.watch/abcd123/")?.key, "facebook");
    assert.equal(detectNetwork("https://x.com/user/status/123456")?.key, "twitter");
    assert.equal(detectNetwork("https://twitter.com/user/status/123456")?.key, "twitter");
  });

  test("detectNetwork para URL no soportada o inválida", () => {
    assert.equal(detectNetwork("https://google.com"), null);
    assert.equal(detectNetwork("invalid-url"), null);
    assert.equal(detectNetwork(""), null);
  });

  test("cleanFilename genera formato [red]-[id o titulo]-[fecha].mp4", () => {
    const fixedDate = new Date(2026, 8, 29); // 29 de septiembre de 2026
    const name = cleanFilename("youtube", "¡Video Genial #1!", fixedDate);
    assert.equal(name, "youtube-Video-Genial-1-20260929.mp4");
  });

  test("cleanFilename fallback a 'video' si titleOrId está vacío", () => {
    const fixedDate = new Date(2026, 8, 29);
    const name = cleanFilename("tiktok", "???", fixedDate);
    assert.equal(name, "tiktok-video-20260929.mp4");
  });

  test("parseYtDlpError traduce errores comunes", () => {
    assert.equal(
      parseYtDlpError("ERROR: [youtube] Private video. Sign in if you've been granted access"),
      "El video es privado o fue eliminado."
    );
    assert.equal(
      parseYtDlpError("ERROR: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>"),
      "Sin conexión a internet o error de red."
    );
    assert.match(
      parseYtDlpError("ERROR: Sign in to confirm your age. This video may be inappropriate for some users."),
      /YTDLP_COOKIES_FROM_BROWSER|cookies\.txt|Inbox/
    );
    assert.match(
      parseYtDlpError(
        "ERROR: [Instagram] DdcCMTxsNcQ: This content isn't available to everyone: It can't be seen by certain audiences."
      ),
      /Instagram limitó este reel/
    );
  });

  test("checkYtDlpAvailable ejecuta sin crashear y retorna boolean", async () => {
    const result = await checkYtDlpAvailable();
    assert.equal(typeof result, "boolean");
  });
});
