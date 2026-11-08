import fs from "node:fs";
import { META_GRAPH_VERSION, PublishInput, PublishResult } from "../shared/types";
import {
  IG_POLL_INTERVAL_MS,
  IG_POLL_MAX,
  publishReelResumableFromFile,
} from "./instagram-resumable";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isVideoPath(p: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(p);
}

/**
 * Publica en IG Professional.
 * - Video local → resumable upload (rupload, sin URL pública)
 * - Imagen / video con URL → container clásico con image_url / video_url
 */
export async function publishToInstagram(
  input: PublishInput,
  pageOrIgToken: string
): Promise<PublishResult> {
  const igUserId = input.account.meta.igUserId || input.account.externalId;
  if (!igUserId) return { ok: false, status: "failed", error: "Falta igUserId en la cuenta" };

  const localPath = input.mediaLocalPath;
  if (localPath && isVideoPath(localPath) && fs.existsSync(localPath)) {
    return publishReelResumableFromFile({
      igUserId,
      token: pageOrIgToken,
      caption: input.caption,
      localVideoPath: localPath,
    });
  }

  const mediaUrl = input.mediaPublicUrl;
  if (!mediaUrl) {
    return {
      ok: false,
      status: "failed",
      error:
        "Instagram: necesitas video en Inbox (mp4 local) o image_url/video_url pública. Fotos JPEG aún requieren URL.",
    };
  }

  return publishViaPublicUrl(igUserId, pageOrIgToken, input.caption, mediaUrl, localPath);
}

async function publishViaPublicUrl(
  igUserId: string,
  token: string,
  caption: string,
  mediaUrl: string,
  mediaLocalPath?: string
): Promise<PublishResult> {
  const isVideo = (mediaLocalPath || mediaUrl).match(/\.(mp4|mov|webm)$/i);
  const params = new URLSearchParams({
    caption,
    access_token: token,
  });

  if (isVideo) {
    params.set("media_type", "REELS");
    params.set("video_url", mediaUrl);
  } else {
    params.set("image_url", mediaUrl);
  }

  const create = await fetch(`${GRAPH}/${igUserId}/media`, { method: "POST", body: params });
  const created = (await create.json()) as { id?: string; error?: { message: string } };
  if (!created.id) {
    return {
      ok: false,
      status: "failed",
      error: created.error?.message || "No container id",
      raw: created,
    };
  }

  let containerReady = false;
  for (let i = 0; i < IG_POLL_MAX; i++) {
    const st = await fetch(`${GRAPH}/${created.id}?fields=status_code`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sj = (await st.json()) as { status_code?: string };
    if (sj.status_code === "FINISHED") {
      containerReady = true;
      break;
    }
    if (sj.status_code === "ERROR") {
      return { ok: false, status: "failed", error: "Container ERROR", raw: sj };
    }
    if (i < IG_POLL_MAX - 1) await sleep(IG_POLL_INTERVAL_MS);
  }
  if (!containerReady) {
    return {
      ok: false,
      status: "failed",
      error: `Instagram no terminó de procesar (FINISHED). ${IG_POLL_MAX}× ${IG_POLL_INTERVAL_MS / 1000}s.`,
    };
  }

  const pub = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    body: new URLSearchParams({
      creation_id: created.id,
      access_token: token,
    }),
  });
  const pj = (await pub.json()) as { id?: string; error?: { message: string } };
  if (!pj.id) {
    return { ok: false, status: "failed", error: pj.error?.message || "publish fail", raw: pj };
  }
  return { ok: true, status: "published", externalId: pj.id, raw: pj };
}
