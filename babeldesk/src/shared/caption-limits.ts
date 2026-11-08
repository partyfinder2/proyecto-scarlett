/** Límites para aviso en UI (no bloquean encolar). */
export const CAPTION_LIMITS: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  facebook_page: 5000,
  facebook_group: 5000,
};

export type CaptionCheck = {
  network: string;
  limit: number;
  length: number;
  ok: boolean;
  overBy: number;
};

export function checkCaptionLength(caption: string, network: string): CaptionCheck {
  const limit = CAPTION_LIMITS[network] ?? 63206;
  const length = caption.length;
  const overBy = Math.max(0, length - limit);
  return { network, limit, length, ok: overBy === 0, overBy };
}

export function checkCaptionForNetworks(
  caption: string,
  networks: string[]
): CaptionCheck[] {
  const uniq = [...new Set(networks)];
  return uniq.map((n) => checkCaptionLength(caption, n));
}

export function hasCaptionLimitError(checks: CaptionCheck[]): boolean {
  return checks.some((c) => !c.ok);
}

/** Recorta al límite sin partir palabras (si hay espacio razonable). */
export function trimCaptionToLimit(caption: string, limit: number): string {
  if (caption.length <= limit) return caption;
  let cut = caption.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.floor(limit * 0.6)) {
    cut = cut.slice(0, lastSpace);
  }
  return cut.trimEnd();
}

export function strictestCaptionLimit(networks: string[]): number {
  if (networks.length === 0) return 63206;
  return Math.min(...networks.map((n) => CAPTION_LIMITS[n] ?? 63206));
}

export function networkNeedsVerticalPreview(network: string): boolean {
  return network === "instagram" || network === "tiktok";
}

export function networkLabel(network: string): string {
  const labels: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook_page: "Facebook Page",
    facebook_group: "Grupo FB",
  };
  return labels[network] ?? network;
}
