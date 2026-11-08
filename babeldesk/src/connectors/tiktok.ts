import fs from "node:fs";
import path from "node:path";
import { PublishInput, PublishResult } from "../shared/types";

const TT = "https://open.tiktokapis.com";
const CHUNK_BYTES = 10 * 1024 * 1024;

function isVideoPath(p: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(p);
}

async function uploadFileToTikTok(
  uploadUrl: string,
  filePath: string
): Promise<{ ok: boolean; error?: string }> {
  const abs = path.resolve(filePath);
  const size = fs.statSync(abs).size;
  const fd = fs.openSync(abs, "r");
  try {
    let offset = 0;
    while (offset < size) {
      const len = Math.min(CHUNK_BYTES, size - offset);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      const end = offset + len - 1;
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes ${offset}-${end}/${size}`,
        },
        body: buf,
      });
      if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: `Upload chunk falló: ${t.slice(0, 200)}` };
      }
      offset += len;
    }
    return { ok: true };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Content Posting API. Direct Post público solo si app auditada (meta.tiktokAudited).
 */
export async function publishToTikTok(
  input: PublishInput,
  userAccessToken: string
): Promise<PublishResult> {
  const audited = input.account.meta.tiktokAudited === true;

  if (!input.mediaPublicUrl && !input.mediaLocalPath) {
    return { ok: false, status: "failed", error: "Falta media" };
  }

  const infoRes = await fetch(`${TT}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
  });
  const info = await infoRes.json();

  const endpoint = audited
    ? `${TT}/v2/post/publish/video/init/`
    : `${TT}/v2/post/publish/inbox/video/init/`;

  const postInfo: Record<string, unknown> = {
    title: input.caption.slice(0, 150),
    disable_comment: false,
    video_cover_timestamp_ms: 1000,
  };

  if (audited) {
    postInfo.privacy_level = "PUBLIC_TO_EVERYONE";
  } else {
    postInfo.privacy_level = "SELF_ONLY";
  }

  let source_info: Record<string, unknown>;
  if (input.mediaPublicUrl) {
    source_info = { source: "PULL_FROM_URL", video_url: input.mediaPublicUrl };
  } else {
    const localPath = input.mediaLocalPath!;
    if (!fs.existsSync(localPath) || !isVideoPath(localPath)) {
      return { ok: false, status: "failed", error: "TikTok API: mp4 local requerido." };
    }
    const videoSize = fs.statSync(localPath).size;
    const chunkSize = Math.min(CHUNK_BYTES, videoSize || 1);
    const totalChunkCount = Math.max(1, Math.ceil(videoSize / chunkSize));
    source_info = {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunkCount,
    };
  }

  const init = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ post_info: postInfo, source_info }),
  });
  const ij = (await init.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { message?: string };
  };

  if (!init.ok) {
    return {
      ok: false,
      status: "failed",
      error:
        ij?.error?.message ||
        "TikTok init falló. Revisa scopes video.upload y audit de la app.",
      raw: { info, init: ij },
    };
  }

  const publishId = ij.data?.publish_id;
  const uploadUrl = ij.data?.upload_url;

  if (source_info.source === "FILE_UPLOAD" && uploadUrl && input.mediaLocalPath) {
    const up = await uploadFileToTikTok(uploadUrl, input.mediaLocalPath);
    if (!up.ok) {
      return { ok: false, status: "failed", error: up.error, raw: ij };
    }
  }

  return {
    ok: true,
    status: audited ? "published" : "published_private",
    externalId: publishId,
    raw: {
      warning: audited
        ? undefined
        : "App no auditada: inbox/SELF_ONLY. Marca TIKTOK_APP_AUDITED=1 si TikTok ya aprobó Direct Post.",
      info,
      init: ij,
    },
  };
}
