export const META_GRAPH_VERSION = "v26.0";
export const APP_WINDOW_TITLE = "BabelDesk — LabelBabel";

export type Network =
  | "facebook_page"
  | "facebook_group"
  | "instagram"
  | "tiktok";

export type ContentLevel = "A_relax" | "B_moderado" | "C_morboso";

export type TargetStatus =
  | "draft"
  | "queued"
  | "publishing"
  | "published"
  | "published_private"
  | "awaiting_human"
  | "failed"
  | "skipped";

export type Account = {
  id: string;
  network: Network;
  displayName: string;
  externalId: string;
  tokenExpiresAt?: number;
  meta: {
    pageId?: string;
    igUserId?: string;
    tiktokAudited?: boolean;
    groupUrl?: string;
  };
};

export type StudioPost = {
  id: string;
  title: string;
  mediaId?: string;
  captionDefault: string;
  linkUrl?: string;
  level: ContentLevel;
};

export type PublishInput = {
  account: Account;
  post: StudioPost;
  caption: string;
  mediaPublicUrl?: string;
  mediaLocalPath?: string;
  scheduledAt?: number;
};

export type PublishResult = {
  ok: boolean;
  status: TargetStatus;
  externalId?: string;
  error?: string;
  raw?: unknown;
};

/** Redes que el cron procesa solo (v1 personal, sin dominio). */
export function isSchedulerAutoNetwork(network: Network): boolean {
  return network === "facebook_page" || network === "instagram";
}

/** Grupos y TikTok v1 = assist manual (clipboard + abrir navegador). */
export function requiresManualAssist(network: Network): boolean {
  return network === "facebook_group" || network === "tiktok";
}

/**
 * Reglas de nivel (handoff Pablo):
 * A → Page + IG + TikTok (+ grupos manual)
 * B → solo IG (+ grupos manual)
 * C → Page + IG, no TikTok (+ grupos manual)
 */
export function getSkipReason(network: Network, level: ContentLevel): string | null {
  if (level === "B_moderado") {
    if (network === "facebook_page" || network === "tiktok") {
      return "Nivel B: solo Instagram (Page/TikTok no aplican)";
    }
  }
  if (level === "C_morboso" && network === "tiktok") {
    return "TikTok omitido: nivel C no va a esta cuenta.";
  }
  return null;
}

/** @deprecated use getSkipReason */
export function shouldSkipTarget(network: Network, level: ContentLevel): boolean {
  return getSkipReason(network, level) !== null;
}

export function isOfficialApiNetwork(network: Network): boolean {
  return network === "facebook_page" || network === "instagram" || network === "tiktok";
}
