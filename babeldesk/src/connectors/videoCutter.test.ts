import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFilterComplex, formatDuration, parseTime, resolveCutMode } from "./videoCutter";

describe("videoCutter", () => {
  it("parseTime acepta mm:ss, hh:mm:ss y décimas", () => {
    assert.equal(parseTime("1:30"), 90);
    assert.equal(parseTime("0:18.4"), 18.4);
    assert.equal(parseTime("1:02:03.5"), 3723.5);
    assert.equal(parseTime("18.4"), 18.4);
    assert.equal(parseTime("no-es-tiempo"), 0);
  });

  it("formatDuration no incluye décimas", () => {
    assert.equal(formatDuration(18.4), "0:18");
    assert.equal(formatDuration(90), "1:30");
  });

  it("sin 9:16 ni hook el corte es copia rápida", () => {
    assert.equal(resolveCutMode(false, ""), "copy");
    assert.equal(resolveCutMode(false, "   "), "copy");
    assert.equal(buildFilterComplex(false, ""), "");
  });

  it("9:16 re-codifica con fondo difuminado y no recorta el plano", () => {
    assert.equal(resolveCutMode(true, ""), "reencode");
    const filtro = buildFilterComplex(true, "");
    assert.match(filtro, /boxblur/);
    assert.match(filtro, /force_original_aspect_ratio=decrease/);
    assert.match(filtro, /overlay=\(W-w\)\/2:\(H-h\)\/2/);
  });

  it("un hook sin vertical también re-codifica", () => {
    assert.equal(resolveCutMode(false, "Puerto Vallarta"), "reencode");
    const filtro = buildFilterComplex(false, "Puerto Vallarta");
    assert.match(filtro, /drawtext=/);
    assert.doesNotMatch(filtro, /boxblur/);
  });
});
