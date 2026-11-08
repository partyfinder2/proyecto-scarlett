import { META_GRAPH_VERSION } from "../shared/types";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type GraphErrorBody = {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

export function mapGraphError(error: GraphErrorBody["error"] | undefined): string {
  const code = error?.code;
  if (code === 190) {
    return "Token inválido o caducado. Pega un token nuevo o reconecta (P1 OAuth).";
  }
  if (code === 200) {
    return "Permiso denegado: el token no tiene los scopes necesarios para esta Page o IG.";
  }
  if (code === 10) {
    return "Permiso denegado (App Review, rol en la Page o app en modo Development).";
  }
  if (error?.message) return error.message;
  return "Error desconocido de Meta Graph.";
}

export type DebugTokenResult = {
  ok: boolean;
  isValid?: boolean;
  expiresAt?: number;
  scopes?: string[];
  error?: string;
  hint?: string;
};

export async function debugAccessToken(accessToken: string): Promise<DebugTokenResult> {
  const params = new URLSearchParams({
    input_token: accessToken,
    access_token: accessToken,
  });
  try {
    const res = await fetch(`${GRAPH}/debug_token?${params}`);
    const json = (await res.json()) as GraphErrorBody & {
      data?: { is_valid?: boolean; expires_at?: number; scopes?: string[] };
    };
    if (json.error) {
      return { ok: false, error: mapGraphError(json.error), hint: json.error.message };
    }
    const d = json.data;
    if (!d) return { ok: false, error: "debug_token sin datos" };
    return {
      ok: true,
      isValid: d.is_valid !== false,
      expiresAt: d.expires_at,
      scopes: d.scopes,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function probeFacebookPage(
  pageId: string,
  token: string
): Promise<{ ok: boolean; pageName?: string; error?: string }> {
  const fields = "id,name";
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(pageId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`
  );
  const json = (await res.json()) as GraphErrorBody & { id?: string; name?: string };
  if (!res.ok || json.error) {
    return { ok: false, error: mapGraphError(json.error) };
  }
  return { ok: true, pageName: json.name || json.id };
}

export async function probeInstagramUser(
  igUserId: string,
  token: string
): Promise<{ ok: boolean; username?: string; error?: string }> {
  const fields = "id,username";
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(igUserId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`
  );
  const json = (await res.json()) as GraphErrorBody & { id?: string; username?: string };
  if (!res.ok || json.error) {
    return { ok: false, error: mapGraphError(json.error) };
  }
  return { ok: true, username: json.username || json.id };
}

export type AccountProbeOutcome = {
  ok: boolean;
  connectionStatus: "connected" | "invalid" | "expiring" | "assist_only" | "disconnected";
  pageName?: string | null;
  igUsername?: string | null;
  tokenExpiresAt?: number | null;
  error?: string;
  details?: string[];
};

const EXPIRING_WITHIN_SEC = 7 * 24 * 3600;

function statusFromExpiry(expiresAt?: number | null, isValid?: boolean): AccountProbeOutcome["connectionStatus"] {
  if (isValid === false) return "invalid";
  if (expiresAt != null && expiresAt > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt <= now) return "invalid";
    if (expiresAt - now < EXPIRING_WITHIN_SEC) return "expiring";
  }
  return "connected";
}

export async function probeMetaAccount(
  network: string,
  externalId: string | null,
  accessToken: string
): Promise<AccountProbeOutcome> {
  const details: string[] = [];
  const debug = await debugAccessToken(accessToken);
  if (debug.ok && debug.scopes?.length) {
    details.push(`Scopes: ${debug.scopes.slice(0, 8).join(", ")}${debug.scopes.length > 8 ? "…" : ""}`);
  }
  if (debug.ok && debug.expiresAt) {
    details.push(`User/debug expiry: ${new Date(debug.expiresAt * 1000).toLocaleString("es-MX")}`);
  }

  let pageName: string | null = null;
  let igUsername: string | null = null;
  let probeError: string | undefined;

  if (network === "facebook_page") {
    if (!externalId) {
      return { ok: false, connectionStatus: "invalid", error: "Falta Page ID." };
    }
    const page = await probeFacebookPage(externalId, accessToken);
    if (!page.ok) probeError = page.error;
    else pageName = page.pageName ?? null;
  } else if (network === "instagram") {
    if (!externalId) {
      return { ok: false, connectionStatus: "invalid", error: "Falta IG user ID." };
    }
    const ig = await probeInstagramUser(externalId, accessToken);
    if (!ig.ok) probeError = ig.error;
    else igUsername = ig.username ?? null;
  } else {
    return {
      ok: true,
      connectionStatus: "assist_only",
      details: ["Solo assist: no se usa token Graph."],
    };
  }

  if (probeError) {
    return {
      ok: false,
      connectionStatus: "invalid",
      error: probeError,
      pageName,
      igUsername,
      tokenExpiresAt: debug.expiresAt ?? null,
      details,
    };
  }

  if (debug.ok && debug.isValid === false) {
    return {
      ok: false,
      connectionStatus: "invalid",
      error: debug.error || "Token marcado como inválido en debug_token.",
      pageName,
      igUsername,
      tokenExpiresAt: debug.expiresAt ?? null,
      details,
    };
  }

  const connectionStatus = statusFromExpiry(debug.expiresAt, debug.isValid);
  return {
    ok: true,
    connectionStatus,
    pageName,
    igUsername,
    tokenExpiresAt: debug.expiresAt ?? null,
    details,
  };
}
