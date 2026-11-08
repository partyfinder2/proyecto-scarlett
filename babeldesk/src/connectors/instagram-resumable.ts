import fs from "node:fs";
import path from "node:path";
import { META_GRAPH_VERSION, PublishResult } from "../shared/types";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/ig-api-upload/${META_GRAPH_VERSION}`;

export const IG_CHUNK_BYTES = 4 * 1024 * 1024;
export const IG_POLL_MAX = 10;
export const IG_POLL_INTERVAL_MS = 5000;

export type FetchFn = typeof fetch;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function createResumableReelContainer(
  igUserId: string,
  token: string,
  caption: string,
  fetchFn: FetchFn = fetch
): Promise<{ id: string } | { error: string; raw: unknown }> {
  const params = new URLSearchParams({
    media_type: "REELS",
    upload_type: "resumable",
    caption,
    access_token: token,
  });
  const res = await fetchFn(`${GRAPH}/${igUserId}/media`, { method: "POST", body: params });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!json.id) {
    return { error: json.error?.message || "No container id (resumable)", raw: json };
  }
  return { id: json.id };
}

/** Divide file size en offsets de chunk (para tests). */
export function planChunkOffsets(fileSize: number, chunkSize = IG_CHUNK_BYTES): number[] {
  const offsets: number[] = [];
  for (let o = 0; o < fileSize; o += chunkSize) offsets.push(o);
  return offsets;
}

export async function uploadLocalVideoChunks(
  containerId: string,
  token: string,
  filePath: string,
  fetchFn: FetchFn = fetch,
  chunkSize = IG_CHUNK_BYTES
): Promise<{ ok: true } | { ok: false; error: string; raw?: unknown }> {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return { ok: false, error: `Archivo no encontrado: ${abs}` };
  }
  const stat = fs.statSync(abs);
  const fileSize = stat.size;
  if (fileSize === 0) return { ok: false, error: "Video vacío (0 bytes)" };

  const fd = fs.openSync(abs, "r");
  try {
    let offset = 0;
    while (offset < fileSize) {
      const len = Math.min(chunkSize, fileSize - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);

      const res = await fetchFn(`${RUPLOAD}/${containerId}`, {
        method: "POST",
        headers: {
          Authorization: `OAuth ${token}`,
          offset: String(offset),
          file_size: String(fileSize),
          "Content-Type": "application/octet-stream",
        },
        body: buf,
      });

      const text = await res.text();
      let json: { debug_info?: { retriable?: boolean }; error?: { message?: string } } = {};
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        /* rupload a veces responde vacío en OK */
      }

      if (!res.ok) {
        return {
          ok: false,
          error: json.error?.message || `rupload HTTP ${res.status}: ${text.slice(0, 200)}`,
          raw: json,
        };
      }

      offset += len;
    }
    return { ok: true };
  } finally {
    fs.closeSync(fd);
  }
}

export async function pollContainerFinished(
  containerId: string,
  token: string,
  fetchFn: FetchFn = fetch,
  maxAttempts = IG_POLL_MAX,
  intervalMs = IG_POLL_INTERVAL_MS
): Promise<{ ok: true } | { ok: false; error: string; raw?: unknown }> {
  for (let i = 0; i < maxAttempts; i++) {
    const st = await fetchFn(`${GRAPH}/${containerId}?fields=status_code,status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sj = (await st.json()) as { status_code?: string; status?: string; error?: { message?: string } };
    if (sj.status_code === "FINISHED") return { ok: true };
    if (sj.status_code === "ERROR") {
      return { ok: false, error: "Container ERROR en Instagram", raw: sj };
    }
    if (i < maxAttempts - 1) await sleep(intervalMs);
  }
  return {
    ok: false,
    error: `Instagram no llegó a FINISHED tras ${maxAttempts} intentos (~${(maxAttempts * intervalMs) / 1000}s). Reencodea 9:16 o reintenta.`,
  };
}

export async function publishMediaContainer(
  igUserId: string,
  containerId: string,
  token: string,
  fetchFn: FetchFn = fetch
): Promise<PublishResult> {
  const pub = await fetchFn(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: token,
    }),
  });
  const pj = (await pub.json()) as { id?: string; error?: { message: string } };
  if (!pj.id) {
    return { ok: false, status: "failed", error: pj.error?.message || "media_publish falló", raw: pj };
  }
  return { ok: true, status: "published", externalId: pj.id, raw: pj };
}

export async function publishReelResumableFromFile(opts: {
  igUserId: string;
  token: string;
  caption: string;
  localVideoPath: string;
  fetchFn?: FetchFn;
}): Promise<PublishResult> {
  const fetchFn = opts.fetchFn ?? fetch;

  const created = await createResumableReelContainer(opts.igUserId, opts.token, opts.caption, fetchFn);
  if ("error" in created) {
    return { ok: false, status: "failed", error: created.error, raw: created.raw };
  }

  const up = await uploadLocalVideoChunks(created.id, opts.token, opts.localVideoPath, fetchFn);
  if (!up.ok) {
    return { ok: false, status: "failed", error: up.error, raw: up.raw };
  }

  const polled = await pollContainerFinished(created.id, opts.token, fetchFn);
  if (!polled.ok) {
    return { ok: false, status: "failed", error: polled.error, raw: polled.raw };
  }

  return publishMediaContainer(opts.igUserId, created.id, opts.token, fetchFn);
}
