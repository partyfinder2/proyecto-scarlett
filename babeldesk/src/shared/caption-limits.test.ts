import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  checkCaptionForNetworks,
  checkCaptionLength,
  hasCaptionLimitError,
  trimCaptionToLimit,
} from "./caption-limits";

describe("caption limits", () => {
  test("TikTok 2201 chars → overBy 1", () => {
    const c = checkCaptionLength("x".repeat(2201), "tiktok");
    assert.equal(c.ok, false);
    assert.equal(c.overBy, 1);
  });

  test("IG 2200 ok", () => {
    const c = checkCaptionLength("a".repeat(2200), "instagram");
    assert.equal(c.ok, true);
  });

  test("200 chars ok en IG y TikTok (2200)", () => {
    const checks = checkCaptionForNetworks("z".repeat(200), ["instagram", "tiktok"]);
    assert.equal(hasCaptionLimitError(checks), false);
  });

  test("trimCaptionToLimit no parte palabra si hay espacio", () => {
    const text = "hello world " + "x".repeat(100);
    const trimmed = trimCaptionToLimit(text, 15);
    assert.equal(trimmed, "hello world");
  });
});
