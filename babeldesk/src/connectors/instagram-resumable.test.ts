import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import {
  IG_CHUNK_BYTES,
  planChunkOffsets,
  publishReelResumableFromFile,
  uploadLocalVideoChunks,
} from "./instagram-resumable";

describe("instagram resumable", () => {
  test("planChunkOffsets 10MB → 3 chunks", () => {
    const offsets = planChunkOffsets(10 * 1024 * 1024, IG_CHUNK_BYTES);
    assert.deepEqual(offsets, [0, IG_CHUNK_BYTES, IG_CHUNK_BYTES * 2]);
  });

  test("uploadLocalVideoChunks llama rupload por cada chunk", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "babeldesk-ig-"));
    const file = path.join(dir, "t.mp4");
    const size = IG_CHUNK_BYTES + 1024;
    fs.writeFileSync(file, Buffer.alloc(size, 1));

    const calls: Array<{ url: string; offset: string }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("media_publish")) {
        return new Response(JSON.stringify({ id: "published-1" }), { status: 200 });
      }
      if (url.includes("graph.facebook.com") && /\/media(\?|$)/.test(url)) {
        return new Response(JSON.stringify({ id: "container-99" }), { status: 200 });
      }
      if (url.includes("rupload.facebook.com")) {
        calls.push({
          url,
          offset: (init?.headers as Record<string, string>)?.offset ?? "",
        });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes("status_code")) {
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    };

    const up = await uploadLocalVideoChunks("container-99", "tok", file, mockFetch);
    assert.equal(up.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].offset, "0");
    assert.equal(calls[1].offset, String(IG_CHUNK_BYTES));

    const pub = await publishReelResumableFromFile({
      igUserId: "ig-1",
      token: "tok",
      caption: "hola",
      localVideoPath: file,
      fetchFn: mockFetch,
    });
    assert.equal(pub.ok, true);
    assert.equal(pub.externalId, "published-1");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
