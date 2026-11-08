import { PublishInput, PublishResult } from "../shared/types";
import type { GroupAssistDeps } from "./groupAssist";

const TIKTOK_UPLOAD = "https://www.tiktok.com/upload?lang=es";

/**
 * v1 personal sin dominio: abre TikTok y copia caption. Tú subes el video.
 */
export async function assistTikTok(
  input: PublishInput,
  deps: GroupAssistDeps
): Promise<PublishResult> {
  const payload = [input.caption, input.post.linkUrl].filter(Boolean).join("\n\n");
  try {
    await deps.copyToClipboard(payload);
    await deps.openExternal(TIKTOK_UPLOAD);
    return {
      ok: true,
      status: "awaiting_human",
      raw: {
        hint: "Caption en portapapeles. Sube el video desde Inbox y pega el texto.",
        mediaPath: input.mediaLocalPath,
      },
    };
  } catch (e) {
    return { ok: false, status: "failed", error: String(e) };
  }
}
