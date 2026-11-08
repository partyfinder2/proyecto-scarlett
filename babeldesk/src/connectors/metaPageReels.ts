import fs from "node:fs";
import path from "node:path";
import { META_GRAPH_VERSION } from "../shared/types";
import { mapGraphError } from "./metaProbe";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const RUPLOAD_VIDEO = "https://rupload.facebook.com/video-upload";

function isLocalVideo(p: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(p);
}

type GraphErr = { error?: { message?: string; code?: number } };

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Publica un mp4 local como Reel en Facebook Page (Graph video_reels + rupload).
 */
export async function publishPageReelFromFile(opts: {
  pageId: string;
  pageToken: string;
  localVideoPath: string;
  caption: string;
  scheduledAt?: number;
}): Promise<{ ok: true; externalId: string; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  const abs = path.resolve(opts.localVideoPath);
  if (!fs.existsSync(abs) || !isLocalVideo(abs)) {
    return { ok: false, error: "Reel Page: necesitas un mp4/mov/webm local en Inbox." };
  }
  const fileSize = fs.statSync(abs).size;
  if (fileSize === 0) return { ok: false, error: "Video vacío (0 bytes)." };

  const startParams = new URLSearchParams({
    upload_phase: "start",
    access_token: opts.pageToken,
  });
  const startRes = await fetch(`${GRAPH}/${opts.pageId}/video_reels?${startParams}`, {
    method: "POST",
  });
  const startJson = (await startRes.json()) as GraphErr & {
    video_id?: string;
    upload_url?: string;
  };
  if (!startRes.ok || startJson.error || !startJson.video_id) {
    return {
      ok: false,
      error: mapGraphError(startJson.error) || startJson.error?.message || "No se pudo iniciar Reel",
      raw: startJson,
    };
  }

  const videoId = startJson.video_id;
  const uploadUrl = startJson.upload_url || `${RUPLOAD_VIDEO}/${videoId}`;

  const videoBuf = fs.readFileSync(abs);
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${opts.pageToken}`,
      offset: "0",
      file_size: String(fileSize),
      "Content-Type": "application/octet-stream",
    },
    body: videoBuf,
  });
  const uploadText = await uploadRes.text();
  let uploadJson: GraphErr & { success?: boolean } = {};
  try {
    uploadJson = JSON.parse(uploadText) as typeof uploadJson;
  } catch {
    uploadJson = {};
  }
  if (!uploadRes.ok && !uploadJson.success) {
    return {
      ok: false,
      error:
        mapGraphError(uploadJson.error) ||
        uploadJson.error?.message ||
        `Upload Reel falló (HTTP ${uploadRes.status})`,
      raw: uploadText.slice(0, 500),
    };
  }

  // Breve pausa antes de finish (Meta a veces tarda en marcar upload complete)
  await sleep(1500);

  const finishParams = new URLSearchParams({
    access_token: opts.pageToken,
    video_id: videoId,
    upload_phase: "finish",
    description: opts.caption,
    title: opts.caption.slice(0, 100),
  });

  const now = Math.floor(Date.now() / 1000);
  if (opts.scheduledAt && opts.scheduledAt > now + 600) {
    finishParams.set("video_state", "SCHEDULED");
    finishParams.set("scheduled_publish_time", String(opts.scheduledAt));
  } else {
    finishParams.set("video_state", "PUBLISHED");
  }

  const finishRes = await fetch(`${GRAPH}/${opts.pageId}/video_reels?${finishParams}`, {
    method: "POST",
  });
  const finishJson = (await finishRes.json()) as GraphErr & { success?: boolean; id?: string };
  if (!finishRes.ok || finishJson.error) {
    return {
      ok: false,
      error: mapGraphError(finishJson.error) || finishJson.error?.message || "Finish Reel falló",
      raw: finishJson,
    };
  }

  return { ok: true, externalId: finishJson.id || videoId, raw: finishJson };
}
