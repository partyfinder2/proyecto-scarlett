import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapGraphError } from "./metaProbe";

describe("mapGraphError", () => {
  it("maps known Meta codes to Spanish hints", () => {
    assert.match(mapGraphError({ code: 190 }), /caducado/i);
    assert.match(mapGraphError({ code: 200 }), /Permiso denegado/i);
    assert.match(mapGraphError({ code: 10 }), /App Review/i);
  });
});
