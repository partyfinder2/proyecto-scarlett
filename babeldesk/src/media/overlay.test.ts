import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  HOOK_MAX_CHARS,
  HOOK_SECONDS,
  REEL_HEIGHT,
  REEL_WIDTH,
  BRANDING_TEXT,
  buildReelVideoFilter,
  escapeDrawtext,
  sanitizeHook,
} from "./overlay";

describe("overlay reel filter", () => {
  test("sanitizeHook recorta a 42 caracteres", () => {
    const long = "a".repeat(60);
    assert.equal(sanitizeHook(long).length, HOOK_MAX_CHARS);
  });

  test("sanitizeHook hace trim", () => {
    assert.equal(sanitizeHook("  hello  "), "hello");
  });

  test("escapeDrawtext escapa dos puntos y comillas", () => {
    assert.equal(escapeDrawtext("Puerto: Vallarta"), "Puerto\\: Vallarta");
    assert.equal(escapeDrawtext("it's"), "it\u2019s");
  assert.equal(escapeDrawtext("100%"), "100%");
  });

  test("filtro incluye escala 9:16 1080x1920", () => {
    const vf = buildReelVideoFilter({ hook: "", showBranding: false });
    assert.match(vf, new RegExp(`scale=${REEL_WIDTH}:${REEL_HEIGHT}`));
    assert.match(vf, /pad=1080:1920/);
  });

  test("hook visible solo primeros 2 segundos", () => {
    const vf = buildReelVideoFilter({ hook: "Sunset", showBranding: false });
    assert.match(vf, new RegExp(`enable='lt\\(t\\\\,${HOOK_SECONDS}\\)'`));
    assert.match(vf, /Sunset/);
  });

  test("branding Vallarta cuando showBranding true", () => {
    const vf = buildReelVideoFilter({ hook: "", showBranding: true });
    assert.match(vf, /Puerto Vallarta/);
  });

  test("sin drawtext de branding cuando showBranding false", () => {
    const vf = buildReelVideoFilter({ hook: "Hi", showBranding: false });
    const draws = vf.split("drawtext=").length - 1;
    assert.equal(draws, 1);
  });
});
