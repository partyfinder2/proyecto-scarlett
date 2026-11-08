import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import { shell } from "electron";

const TT_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TT_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const TT_USER = "https://open.tiktokapis.com/v2/user/info/";

export type TikTokOAuthConfig = {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  port: number;
};

const DEFAULT_SCOPES = "user.info.basic,video.upload,video.publish";
const OAUTH_TIMEOUT_MS = 120_000;
const SESSION_TTL_MS = 15 * 60_000;

type PendingTikTokSession = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  openId: string;
  displayName: string;
  audited: boolean;
  createdAt: number;
};

let oauthServer: http.Server | null = null;
let pendingSession: PendingTikTokSession | null = null;
let pendingVerifier: string | null = null;

export function getTikTokOAuthConfig(): TikTokOAuthConfig | null {
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  const port = Number.parseInt(process.env.TIKTOK_OAUTH_PORT || "8766", 10);
  if (!clientKey || !clientSecret || !Number.isFinite(port)) return null;
  const redirectUri =
    process.env.TIKTOK_OAUTH_REDIRECT_URI?.trim() ||
    `http://127.0.0.1:${port}/oauth/tiktok/callback`;
  return { clientKey, clientSecret, redirectUri, port };
}

export function getTikTokOAuthStatus(): {
  configured: boolean;
  redirectUri?: string;
  clientKey?: string;
  missing: string[];
} {
  const missing: string[] = [];
  if (!process.env.TIKTOK_CLIENT_KEY?.trim()) missing.push("TIKTOK_CLIENT_KEY");
  if (!process.env.TIKTOK_CLIENT_SECRET?.trim()) missing.push("TIKTOK_CLIENT_SECRET");
  const cfg = getTikTokOAuthConfig();
  return {
    configured: Boolean(cfg),
    redirectUri: cfg?.redirectUri,
    clientKey: cfg?.clientKey,
    missing,
  };
}

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stopServer() {
  if (oauthServer) {
    oauthServer.close();
    oauthServer = null;
  }
}

function waitForCallback(config: TikTokOAuthConfig, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stopServer();
      reject(new Error("OAuth TikTok expiró (2 min)."));
    }, OAUTH_TIMEOUT_MS);

    const server = http.createServer((req, res) => {
      try {
        if (!req.url) return;
        const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
        if (url.pathname !== "/oauth/tiktok/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<html><body><p>Error TikTok. Cierra y vuelve a BabelDesk.</p></body></html>");
          clearTimeout(timer);
          stopServer();
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
        res.end("<html><body><p>TikTok conectado. Vuelve a BabelDesk.</p></body></html>");
        clearTimeout(timer);
        stopServer();
        resolve(code);
      } catch (e) {
        clearTimeout(timer);
        stopServer();
        reject(e);
      }
    });

    server.listen(config.port, "127.0.0.1", () => {
      oauthServer = server;
    });
    server.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Puerto TikTok ${config.port} ocupado: ${String(e)}`));
    });
  });
}

async function exchangeCode(config: TikTokOAuthConfig, code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });
  const res = await fetch(TT_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    data?: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
    };
    error?: { message?: string; code?: string };
  };
  if (!res.ok || json.error || !json.data?.access_token) {
    throw new Error(json.error?.message || "Token TikTok falló");
  }
  return json.data;
}

async function fetchTikTokUser(accessToken: string): Promise<{ openId: string; displayName: string }> {
  const url = `${TT_USER}?fields=open_id,display_name`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    data?: { user?: { open_id?: string; display_name?: string } };
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "No se pudo leer perfil TikTok");
  }
  const u = json.data?.user;
  if (!u?.open_id) throw new Error("open_id TikTok ausente");
  return { openId: u.open_id, displayName: u.display_name || u.open_id };
}

async function queryCreatorAudited(accessToken: string): Promise<boolean> {
  if (process.env.TIKTOK_APP_AUDITED === "1") return true;
  try {
    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    });
    const json = (await res.json()) as {
      data?: { privacy_level_options?: string[] };
    };
    const opts = json.data?.privacy_level_options ?? [];
    return opts.includes("PUBLIC_TO_EVERYONE");
  } catch {
    return false;
  }
}

export async function startTikTokOAuthFlow(): Promise<{ ok: boolean; error?: string }> {
  const config = getTikTokOAuthConfig();
  if (!config) {
    return {
      ok: false,
      error: "Faltan TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET en .env",
    };
  }
  stopServer();
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = base64Url(crypto.randomBytes(32));
  pendingVerifier = codeVerifier;
  const challenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());

  const authUrl = new URL(TT_AUTH);
  authUrl.searchParams.set("client_key", config.clientKey);
  authUrl.searchParams.set("scope", process.env.TIKTOK_OAUTH_SCOPES?.trim() || DEFAULT_SCOPES);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  try {
    const codePromise = waitForCallback(config, state);
    await shell.openExternal(authUrl.toString());
    const code = await codePromise;
    if (!pendingVerifier) throw new Error("PKCE verifier perdido");
    const tokens = await exchangeCode(config, code, pendingVerifier);
    pendingVerifier = null;
    const user = await fetchTikTokUser(tokens.access_token!);
    const audited = await queryCreatorAudited(tokens.access_token!);
    pendingSession = {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expires_in
        ? Math.floor(Date.now() / 1000) + tokens.expires_in
        : null,
      openId: user.openId,
      displayName: user.displayName,
      audited,
      createdAt: Date.now(),
    };
    return { ok: true };
  } catch (e) {
    pendingVerifier = null;
    pendingSession = null;
    stopServer();
    return { ok: false, error: String(e) };
  }
}

export function takePendingTikTokSession(): PendingTikTokSession | null {
  if (!pendingSession) return null;
  if (Date.now() - pendingSession.createdAt > SESSION_TTL_MS) {
    pendingSession = null;
    return null;
  }
  const s = pendingSession;
  pendingSession = null;
  return s;
}

export function clearPendingTikTokSession(): void {
  pendingSession = null;
  pendingVerifier = null;
}
