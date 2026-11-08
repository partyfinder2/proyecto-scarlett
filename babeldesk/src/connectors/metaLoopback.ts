import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import { shell } from "electron";
import { META_GRAPH_VERSION } from "../shared/types";
import { mapGraphError } from "./metaProbe";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type MetaOAuthConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  port: number;
};

export type MetaPageOption = {
  id: string;
  name: string;
  tasks: string[];
  igUserId: string | null;
  igUsername: string | null;
  canPublish: boolean;
};

type RawPage = {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  instagram_business_account?: { id: string; username?: string };
};

type PendingMetaSession = {
  userToken: string;
  userTokenExpiresAt: number | null;
  pages: RawPage[];
  createdAt: number;
};

const OAUTH_TIMEOUT_MS = 120_000;
const SESSION_TTL_MS = 15 * 60_000;

const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
].join(",");

let oauthServer: http.Server | null = null;
let pendingSession: PendingMetaSession | null = null;
let activeOAuthState: string | null = null;

export function getMetaOAuthConfig(): MetaOAuthConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const port = Number.parseInt(process.env.META_OAUTH_PORT || "8765", 10);
  if (!appId || !appSecret || !Number.isFinite(port)) return null;
  const redirectUri =
    process.env.META_OAUTH_REDIRECT_URI?.trim() ||
    `http://127.0.0.1:${port}/oauth/meta/callback`;
  return { appId, appSecret, redirectUri, port };
}

export function getMetaOAuthStatus(): {
  configured: boolean;
  redirectUri?: string;
  appId?: string;
  missing: string[];
} {
  const missing: string[] = [];
  if (!process.env.META_APP_ID?.trim()) missing.push("META_APP_ID");
  if (!process.env.META_APP_SECRET?.trim()) missing.push("META_APP_SECRET");
  const cfg = getMetaOAuthConfig();
  return {
    configured: Boolean(cfg),
    redirectUri: cfg?.redirectUri,
    appId: cfg?.appId,
    missing,
  };
}

function purgeStaleSession(): void {
  if (pendingSession && Date.now() - pendingSession.createdAt > SESSION_TTL_MS) {
    pendingSession = null;
  }
}

function stopOAuthServer(): void {
  if (oauthServer) {
    oauthServer.close();
    oauthServer = null;
  }
  activeOAuthState = null;
}

function sanitizePages(pages: RawPage[]): MetaPageOption[] {
  return pages.map((p) => {
    const tasks = p.tasks ?? [];
    const ig = p.instagram_business_account;
    return {
      id: p.id,
      name: p.name,
      tasks,
      igUserId: ig?.id ?? null,
      igUsername: ig?.username ?? null,
      canPublish: tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE"),
    };
  });
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}${path}?${q}`);
  const json = (await res.json()) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    throw new Error(mapGraphError(json.error) || `Graph HTTP ${res.status}`);
  }
  return json;
}

async function exchangeCode(config: MetaOAuthConfig, code: string): Promise<string> {
  const short = await graphGet<{ access_token: string }>("/oauth/access_token", {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });
  const long = await graphGet<{ access_token: string; expires_in?: number }>(
    "/oauth/access_token",
    {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: short.access_token,
    }
  );
  pendingSession = {
    userToken: long.access_token,
    userTokenExpiresAt: long.expires_in
      ? Math.floor(Date.now() / 1000) + long.expires_in
      : null,
    pages: [],
    createdAt: Date.now(),
  };
  return long.access_token;
}

async function fetchPages(userToken: string): Promise<RawPage[]> {
  const json = await graphGet<{ data?: RawPage[] }>("/me/accounts", {
    fields: "id,name,access_token,tasks,instagram_business_account{id,username}",
    access_token: userToken,
  });
  return json.data ?? [];
}

function waitForOAuthCallback(
  config: MetaOAuthConfig,
  expectedState: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stopOAuthServer();
      reject(new Error("OAuth cancelado o expiró (2 min). Intenta de nuevo."));
    }, OAUTH_TIMEOUT_MS);

    const server = http.createServer((req, res) => {
      try {
        if (!req.url) return;
        const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
        if (url.pathname !== "/oauth/meta/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<html><body><p>Error de Meta. Cierra esta pestaña y vuelve a BabelDesk.</p></body></html>"
          );
          clearTimeout(timer);
          stopOAuthServer();
          reject(new Error(String(err)));
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || state !== expectedState) {
          res.writeHead(400);
          res.end("Invalid callback");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><p>Conectado. Puedes cerrar esta pestaña y volver a BabelDesk.</p></body></html>"
        );
        clearTimeout(timer);
        stopOAuthServer();
        resolve(code);
      } catch (e) {
        clearTimeout(timer);
        stopOAuthServer();
        reject(e);
      }
    });

    server.listen(config.port, "127.0.0.1", () => {
      oauthServer = server;
    });
    server.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`No se pudo abrir puerto ${config.port}: ${String(e)}`));
    });
  });
}

export async function startMetaOAuthFlow(): Promise<{
  ok: boolean;
  error?: string;
  pages?: MetaPageOption[];
}> {
  purgeStaleSession();
  const config = getMetaOAuthConfig();
  if (!config) {
    return {
      ok: false,
      error: "Faltan META_APP_ID y META_APP_SECRET en .env (ver .env.example).",
    };
  }

  stopOAuthServer();
  const state = crypto.randomBytes(16).toString("hex");
  activeOAuthState = state;

  const authUrl = new URL("https://www.facebook.com/v26.0/dialog/oauth");
  authUrl.searchParams.set("client_id", config.appId);
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", META_SCOPES);

  try {
    const codePromise = waitForOAuthCallback(config, state);
    await shell.openExternal(authUrl.toString());
    const code = await codePromise;
    const userToken = await exchangeCode(config, code);
    const pages = await fetchPages(userToken);
    if (!pendingSession) {
      return { ok: false, error: "Sesión OAuth interna perdida." };
    }
    pendingSession.pages = pages;
    if (pages.length === 0) {
      return {
        ok: false,
        error: "No hay Pages administradas con este usuario. Revisa roles en Meta Business.",
      };
    }
    return { ok: true, pages: sanitizePages(pages) };
  } catch (e) {
    pendingSession = null;
    stopOAuthServer();
    return { ok: false, error: String(e) };
  }
}

export function listPendingMetaPages(): MetaPageOption[] {
  purgeStaleSession();
  if (!pendingSession?.pages.length) return [];
  return sanitizePages(pendingSession.pages);
}

export function takeMetaPageTokens(pageId: string): {
  pageToken: string;
  userToken: string;
  userTokenExpiresAt: number | null;
  page: RawPage;
} | null {
  purgeStaleSession();
  if (!pendingSession) return null;
  const page = pendingSession.pages.find((p) => p.id === pageId);
  if (!page?.access_token) return null;
  return {
    pageToken: page.access_token,
    userToken: pendingSession.userToken,
    userTokenExpiresAt: pendingSession.userTokenExpiresAt,
    page,
  };
}

export function clearPendingMetaSession(): void {
  pendingSession = null;
}
