import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAggressiveGrid,
  buildBlurCoverFilterComplex,
  buildDelogoFilter,
  clampBoxBlurRadius,
  mergeRegionsUnique,
  resolvePresetKey,
  toDelogoPixels,
} from "./watermarkRemover";

describe("watermarkRemover", () => {
  it("resolvePresetKey auto uses network", () => {
    assert.equal(resolvePresetKey("tiktok", "auto"), "tiktok");
    assert.equal(resolvePresetKey(undefined, "auto"), "generic");
  });

  it("buildDelogoFilter produces even dimensions", () => {
    const f = buildDelogoFilter(
      [{ xPct: 0.55, yPct: 0.82, wPct: 0.4, hPct: 0.12 }],
      1080,
      1920
    );
    assert.match(f, /delogo=x=\d+:y=\d+:w=\d+:h=\d+/);
  });

  it("toDelogoPixels respeta margen del frame (ffmpeg delogo)", () => {
    const box = toDelogoPixels({ xPct: 0.05, yPct: 0.85, wPct: 0.5, hPct: 0.12 }, 720, 1280);
    assert.ok(box);
    assert.ok(box.x >= 2);
    assert.ok(box.y >= 2);
    assert.ok(box.x + box.w < 720 - 1);
    assert.ok(box.y + box.h < 1280 - 1);
  });

  it("aggressive grid adds many regions", () => {
    assert.ok(buildAggressiveGrid().length >= 10);
  });

  it("mergeRegionsUnique caps count", () => {
    const many = buildAggressiveGrid().concat(buildAggressiveGrid());
    assert.ok(mergeRegionsUnique(many, 15).length <= 15);
  });

  it("boxblur radius stays within ffmpeg chroma limit (9)", () => {
    assert.equal(clampBoxBlurRadius(12), 9);
    assert.equal(clampBoxBlurRadius(0), 1);
    const fc = buildBlurCoverFilterComplex(100, 200, 320, 180, 12);
    assert.match(fc, /boxblur=9:2:9:2/);
    assert.doesNotMatch(fc, /boxblur=12/);
  });
});
