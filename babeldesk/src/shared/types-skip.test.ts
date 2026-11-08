import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getSkipReason } from "./types";

describe("getSkipReason nivel C", () => {
  test("TikTok omitido con mensaje claro", () => {
    const msg = getSkipReason("tiktok", "C_morboso");
    assert.equal(msg, "TikTok omitido: nivel C no va a esta cuenta.");
  });

  test("Page e IG no se saltan en C", () => {
    assert.equal(getSkipReason("facebook_page", "C_morboso"), null);
    assert.equal(getSkipReason("instagram", "C_morboso"), null);
  });
});
