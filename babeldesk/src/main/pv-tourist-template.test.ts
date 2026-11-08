import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import {
  assemblePvTouristCaption,
  loadPvTouristTemplate,
  pickRotatingHashtags,
} from "./pv-tourist-template";

describe("PV Tourist EN template", () => {
  test("templates.json carga pv-tourist-en", () => {
    const root = path.join(process.cwd());
    const t = loadPvTouristTemplate(root);
    assert.equal(t.hashtagsAlways.length, 2);
    assert.ok(t.hashtagsRotatePool.length >= 3);
  });

  test("pickRotatingHashtags devuelve 3 del pool", () => {
    const pool = ["#A", "#B", "#C", "#D", "#E"];
    const picked = pickRotatingHashtags(pool, new Date("2026-09-29T12:00:00Z"));
    assert.equal(picked.length, 3);
    assert.ok(picked.every((h) => pool.includes(h)));
  });

  test("assemble incluye línea fija Vallarta y hashtags obligatorios", () => {
    const cap = assemblePvTouristCaption({
      hook: "Golden hour",
      description: "Walk the malecon.",
      cta: "Save for your trip",
      hashtagsAlways: ["#PuertoVallarta", "#BanderasBay"],
      hashtagsExtra: ["#Vallarta", "#BeachLife", "#PVLife"],
    });
    assert.match(cap, /Puerto Vallarta & Banderas Bay/);
    assert.match(cap, /#PuertoVallarta/);
    assert.match(cap, /#BanderasBay/);
    assert.match(cap, /Golden hour/);
  });
});
