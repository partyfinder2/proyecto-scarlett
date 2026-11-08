import fs from "node:fs";
import path from "node:path";
import { META_GRAPH_VERSION, PublishInput, PublishResult } from "../shared/types";
import { mapGraphError } from "./metaProbe";
import { publishPageReelFromFile } from "./metaPageReels";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

function isLocalImage(p: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(p);
}

function isLocalVideo(p: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(p);
}

/**
 * Publica o programa en una Facebook PAGE.
 * No sirve para perfil ni para groups.
 */
export async function publishToFacebookPage(
  input: PublishInput,
  pageToken: string
): Promise<PublishResult> {
  const pageId = input.account.meta.pageId || input.account.externalId;
  if (!pageId) {
    return { ok: false, status: "failed", error: "Falta pageId" };
  }

  const body: Record<string, string> = {
    message: input.caption,
    access_token: pageToken,
  };

  if (input.post.linkUrl) body.link = input.post.linkUrl;

  if (input.scheduledAt && input.scheduledAt * 1000 > Date.now() + 10 * 60 * 1000) {
    body.published = "false";
    body.scheduled_publish_time = String(input.scheduledAt);
  }

  const localPath = input.mediaLocalPath;
  if (localPath && fs.existsSync(localPath) && isLocalImage(localPath)) {
    const form = new FormData();
    form.append("access_token", pageToken);
    form.append("caption", input.caption);
    const buf = fs.readFileSync(localPath);
    form.append("source", new Blob([buf]), path.basename(localPath));
    const photoRes = await fetch(`${GRAPH}/${pageId}/photos`, { method: "POST", body: form });
    const photoJson = (await photoRes.json()) as { id?: string; post_id?: string; error?: { message: string; code?: number } };
    if (!photoRes.ok || photoJson.error) {
      return {
        ok: false,
        status: "failed",
        error: mapGraphError(photoJson.error) || photoJson.error?.message || `HTTP ${photoRes.status}`,
        raw: photoJson,
      };
    }
    return {
      ok: true,
      status: "published",
      externalId: photoJson.post_id || photoJson.id,
      raw: photoJson,
    };
  }

  if (localPath && fs.existsSync(localPath) && isLocalVideo(localPath)) {
    const reel = await publishPageReelFromFile({
      pageId,
      pageToken,
      localVideoPath: localPath,
      caption: input.caption,
      scheduledAt: input.scheduledAt,
    });
    if (!reel.ok) {
      return { ok: false, status: "failed", error: reel.error, raw: reel.raw };
    }
    return {
      ok: true,
      status: "published",
      externalId: reel.externalId,
      raw: reel.raw,
    };
  }

  const res = await fetch(`${GRAPH}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  const json = (await res.json()) as { id?: string; error?: { message: string; code?: number } };
  if (!res.ok || json.error) {
    return {
      ok: false,
      status: "failed",
      error: mapGraphError(json.error) || json.error?.message || `HTTP ${res.status}`,
      raw: json,
    };
  }

  return { ok: true, status: "published", externalId: json.id, raw: json };
}
