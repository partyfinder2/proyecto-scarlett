import { PublishInput, PublishResult } from "../shared/types";

export type GroupAssistDeps = {
  copyToClipboard: (text: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
};

/**
 * NO hay API. Prepara el post y abre el grupo.
 * El humano pulsa Publicar.
 */
export async function assistFacebookGroup(
  input: PublishInput,
  deps: GroupAssistDeps
): Promise<PublishResult> {
  const url = input.account.meta.groupUrl || input.account.externalId;
  if (!url || !url.includes("facebook.com")) {
    return { ok: false, status: "failed", error: "URL de grupo inválida" };
  }

  const payload = [input.caption, input.post.linkUrl].filter(Boolean).join("\n\n");

  try {
    await deps.copyToClipboard(payload);
    await deps.openExternal(url);
    return {
      ok: true,
      status: "awaiting_human",
      raw: { hint: "Caption en clipboard. Pega y publica en el grupo." },
    };
  } catch (e) {
    return { ok: false, status: "failed", error: String(e) };
  }
}
