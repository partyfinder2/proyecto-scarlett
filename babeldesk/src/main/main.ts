import { app, BrowserWindow, clipboard, shell, ipcMain, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { APP_WINDOW_TITLE, getSkipReason, type ContentLevel, type Network } from "../shared/types";
import {
  openDb,
  recoverStalePublishing,
  PUBLISHING_STALE_SEC,
  listAccounts,
  accountToPublic,
  upsertAccount,
  deleteAccount,
  disconnectAccountSecrets,
  updateAccountProbeFields,
  decryptToken,
  getAccount,
  findAccountByNetworkExternal,
  listMedia,
  listPosts,
  insertPost,
  insertTarget,
  listTargetsWithAccounts,
  tailLog,
  listGroups,
  upsertGroup,
  encryptToken,
  updateTargetStatus,
  log,
  listHistory,
  getMedia,
  countPostsUsingMedia,
  countMediaRowsWithPath,
  deleteMediaRow,
} from "./db";
import { runSchedulerTick, runManualAssistTarget } from "../scheduler/worker";
import { startInboxWatcher } from "./inbox-watcher";
import { pruneInboxMediaLibrary, sweepInboxDirectory } from "./inbox-hygiene";
import { generateCopyVariants } from "./copyEngine";
import { generatePvTouristVariants } from "./pv-tourist-template";
import { assistFacebookGroup } from "../connectors/groupAssist";
import type { PublishInput } from "../shared/types";
import { babelDeskRoot } from "./app-root";
import {
  getPublicOpenRouterSettings,
  saveOpenRouterSettings,
  testOpenRouterConnection,
} from "./openrouter-config";
import {
  registerTanda13Handlers,
  registerDownloaderHandlers,
  registerCutterHandlers,
  registerWatermarkHandlers,
} from "./ipc-handlers";
import { probeMetaAccount } from "../connectors/metaProbe";
import {
  getMetaOAuthStatus,
  startMetaOAuthFlow,
  listPendingMetaPages,
  takeMetaPageTokens,
  clearPendingMetaSession,
} from "../connectors/metaLoopback";
import {
  getTikTokOAuthStatus,
  startTikTokOAuthFlow,
  takePendingTikTokSession,
  clearPendingTikTokSession,
} from "../connectors/tiktokLoopback";

async function runAccountProbe(accountId: string) {
  const acc = getAccount(db, accountId);
  if (!acc) return { ok: false, error: "Cuenta no encontrada." };

  if (acc.network === "facebook_group") {
    const now = Math.floor(Date.now() / 1000);
    updateAccountProbeFields(db, accountId, {
      connection_status: "assist_only",
      last_probe_at: now,
      last_probe_error: null,
    });
    return {
      ok: true,
      connectionStatus: "assist_only",
      message: "Modo assist: no requiere token Graph.",
    };
  }

  if (acc.network === "tiktok" && !acc.access_token_enc) {
    const now = Math.floor(Date.now() / 1000);
    updateAccountProbeFields(db, accountId, {
      connection_status: "assist_only",
      last_probe_at: now,
      last_probe_error: null,
    });
    return {
      ok: true,
      connectionStatus: "assist_only",
      message: "TikTok assist (sin token). Conectar TikTok o TIKTOK_USE_API=1.",
    };
  }

  if (acc.network === "tiktok" && acc.access_token_enc) {
    let token: string;
    try {
      token = decryptToken(acc.access_token_enc);
    } catch (e) {
      const msg = String(e);
      updateAccountProbeFields(db, accountId, {
        connection_status: "invalid",
        last_probe_at: Math.floor(Date.now() / 1000),
        last_probe_error: msg,
      });
      return { ok: false, error: msg };
    }
    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    });
    const json = (await res.json()) as { error?: { message?: string } };
    const now = Math.floor(Date.now() / 1000);
    if (!res.ok || json.error) {
      const err = json.error?.message || "Token TikTok inválido";
      updateAccountProbeFields(db, accountId, {
        connection_status: "invalid",
        last_probe_at: now,
        last_probe_error: err,
      });
      return { ok: false, error: err };
    }
    updateAccountProbeFields(db, accountId, {
      connection_status: "connected",
      last_probe_at: now,
      last_probe_error: null,
    });
    return { ok: true, connectionStatus: "connected" };
  }

  if (!acc.access_token_enc) {
    updateAccountProbeFields(db, accountId, {
      connection_status: "disconnected",
      last_probe_at: Math.floor(Date.now() / 1000),
      last_probe_error: "Sin token guardado.",
    });
    return { ok: false, error: "Sin token. Usa «Pegar token (avanzado)» o espera Conectar Meta (P1)." };
  }

  let token: string;
  try {
    token = decryptToken(acc.access_token_enc);
  } catch (e) {
    const msg = String(e);
    updateAccountProbeFields(db, accountId, {
      connection_status: "invalid",
      last_probe_at: Math.floor(Date.now() / 1000),
      last_probe_error: msg,
    });
    return { ok: false, error: msg };
  }

  const outcome = await probeMetaAccount(acc.network, acc.external_id, token);
  const now = Math.floor(Date.now() / 1000);
  updateAccountProbeFields(db, accountId, {
    connection_status: outcome.connectionStatus,
    last_probe_at: now,
    last_probe_error: outcome.ok ? null : outcome.error ?? "Probe falló",
    page_name: outcome.pageName,
    ig_username: outcome.igUsername,
    token_expires_at: outcome.tokenExpiresAt ?? undefined,
  });

  return {
    ok: outcome.ok,
    connectionStatus: outcome.connectionStatus,
    pageName: outcome.pageName,
    igUsername: outcome.igUsername,
    tokenExpiresAt: outcome.tokenExpiresAt,
    error: outcome.error,
    details: outcome.details,
  };
}
 
 const ROOT = babelDeskRoot();
 const DATA_DIR = path.join(ROOT, "data");
 dotenv.config({ path: path.join(ROOT, ".env") });
 
 const APP_VERSION = "0.2.0";
 let mainWindow: BrowserWindow | null = null;
 const db = openDb(path.join(DATA_DIR, "studio.sqlite"));
 const inboxDir = path.join(ROOT, "Inbox");
 
 const assistDeps = {
   copyToClipboard: async (text: string) => clipboard.writeText(text),
   openExternal: async (url: string) => {
     await shell.openExternal(url);
   },
 };

 function resolveAppIconPath(): string | null {
   const candidates = [
     path.join(ROOT, "build", "icon-256.png"),
     path.join(ROOT, "build", "icon.ico"),
     path.join(ROOT, "build", "icon.png"),
     path.join(ROOT, "build", "icon.jpg"),
     path.join(__dirname, "../../build/icon-256.png"),
   ];
   for (const p of candidates) {
     if (fs.existsSync(p)) return p;
   }
   return null;
 }

 function getAppIcon() {
   const p = resolveAppIconPath();
   return p ? nativeImage.createFromPath(p) : undefined;
 }

 if (process.platform === "win32") {
   app.setAppUserModelId("com.labelbabel.babeldesk");
 }

 function createWindow() {
   mainWindow = new BrowserWindow({
     width: 1100,
     height: 780,
     title: APP_WINDOW_TITLE,
     icon: getAppIcon(),
     webPreferences: {
       preload: path.join(__dirname, "preload.js"),
       contextIsolation: true,
       nodeIntegration: false,
       webSecurity: false,
     },
   });
   mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
 }

 function notifyTarget(targetId: string, status: string) {
   mainWindow?.webContents.send("target:update", { targetId, status });
 }

 app.whenReady().then(() => {
   registerTanda13Handlers(ipcMain, DATA_DIR);
  registerDownloaderHandlers(ipcMain, inboxDir, DATA_DIR, () => mainWindow);
  registerCutterHandlers(ipcMain, inboxDir, () => mainWindow);
  registerWatermarkHandlers(ipcMain, DATA_DIR, (mediaId) => {
    const m = getMedia(db, mediaId);
    if (!m) return null;
    return { path: m.path, kind: m.kind };
  });
   const purged = pruneInboxMediaLibrary(db);
   const swept = sweepInboxDirectory(inboxDir);
   if (purged.removedRows > 0 || swept > 0) {
     log(
       db,
       "info",
       `Inbox: limpieza inicio — ${purged.removedRows} fila(s), ${purged.deletedFiles + swept} archivo(s)`
     );
   }
   startInboxWatcher(db, inboxDir);
   createWindow();

  setInterval(() => {
    recoverStalePublishing(db, PUBLISHING_STALE_SEC);
    void runSchedulerTick({
      db,
      assistDeps,
      onStatusChange: notifyTarget,
      tiktokUseApi: process.env.TIKTOK_USE_API === "1",
    });
  }, 30_000);

  setInterval(() => {
    recoverStalePublishing(db, PUBLISHING_STALE_SEC);
  }, 300_000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("app:getInfo", () => ({
  version: APP_VERSION,
  title: APP_WINDOW_TITLE,
  inboxDir,
  cwd: ROOT,
  docsEmpezarAqui: path.join(ROOT, "docs", "EMPEZAR_AQUI.md"),
}));

ipcMain.handle("app:openDoc", async (_e, relativePath: string) => {
  const safe = relativePath.replace(/\\/g, "/").replace(/\.\./g, "");
  const full = path.join(ROOT, safe);
  if (!full.startsWith(ROOT) || !fs.existsSync(full)) return { ok: false };
  await shell.openPath(full);
  return { ok: true };
});

ipcMain.handle("accounts:list", () => listAccounts(db).map(accountToPublic));

ipcMain.handle(
  "accounts:save",
  async (
    _e,
    payload: {
      id?: string;
      network: string;
      displayName: string;
      externalId: string;
      tokenPlain?: string;
      meta?: Record<string, unknown>;
      tokenExpiresAt?: number;
    }
  ) => {
    const id = payload.id || crypto.randomUUID();
    const existing = payload.id ? getAccount(db, payload.id) : null;
    const isAssist = payload.network === "facebook_group" || payload.network === "tiktok";
    upsertAccount(db, {
      id,
      network: payload.network,
      display_name: payload.displayName,
      external_id: payload.externalId,
      access_token_enc: payload.tokenPlain
        ? encryptToken(payload.tokenPlain)
        : (existing?.access_token_enc ?? null),
      refresh_token_enc: existing?.refresh_token_enc ?? null,
      token_expires_at: payload.tokenExpiresAt ?? existing?.token_expires_at ?? null,
      meta_json: JSON.stringify(payload.meta ?? {}),
      connection_status: isAssist ? "assist_only" : payload.tokenPlain ? "connected" : existing?.connection_status ?? "disconnected",
    });
    if (payload.tokenPlain && !isAssist) {
      await runAccountProbe(id);
    }
    return { id };
  }
);

ipcMain.handle("accounts:probe", async (_e, id: string) => runAccountProbe(id));

ipcMain.handle("accounts:disconnect", (_e, id: string) => {
  disconnectAccountSecrets(db, id);
  return { ok: true };
});

ipcMain.handle("accounts:delete", (_e, id: string) => {
  deleteAccount(db, id);
});

ipcMain.handle("meta:oauthStatus", () => getMetaOAuthStatus());

ipcMain.handle("meta:oauthStart", async () => startMetaOAuthFlow());

ipcMain.handle("meta:oauthListPages", () => listPendingMetaPages());

ipcMain.handle(
  "meta:oauthConnect",
  async (_e, payload: { pageId: string; includeInstagram?: boolean }) => {
    const taken = takeMetaPageTokens(payload.pageId);
    if (!taken) {
      return { ok: false, error: "Sesión OAuth expirada. Pulsa Conectar Meta otra vez." };
    }
    const { page, pageToken, userToken, userTokenExpiresAt } = taken;
    const ig = page.instagram_business_account;

    const existingPage = findAccountByNetworkExternal(db, "facebook_page", page.id);
    const pageAccountId = existingPage?.id ?? crypto.randomUUID();
    upsertAccount(db, {
      id: pageAccountId,
      network: "facebook_page",
      display_name: page.name,
      external_id: page.id,
      access_token_enc: encryptToken(pageToken),
      refresh_token_enc: encryptToken(userToken),
      token_expires_at: userTokenExpiresAt,
      meta_json: JSON.stringify({
        pageId: page.id,
        oauth: true,
        igUserId: ig?.id ?? undefined,
      }),
      connection_status: "connected",
      page_name: page.name,
      ig_username: ig?.username ?? null,
    });
    await runAccountProbe(pageAccountId);

    let igAccountId: string | undefined;
    if (payload.includeInstagram && ig?.id) {
      const existingIg = findAccountByNetworkExternal(db, "instagram", ig.id);
      igAccountId = existingIg?.id ?? crypto.randomUUID();
      upsertAccount(db, {
        id: igAccountId,
        network: "instagram",
        display_name: ig.username ? `@${ig.username}` : `IG ${ig.id}`,
        external_id: ig.id,
        access_token_enc: encryptToken(pageToken),
        refresh_token_enc: encryptToken(userToken),
        token_expires_at: userTokenExpiresAt,
        meta_json: JSON.stringify({
          igUserId: ig.id,
          pageId: page.id,
          oauth: true,
        }),
        connection_status: "connected",
        page_name: page.name,
        ig_username: ig.username ?? null,
      });
      await runAccountProbe(igAccountId);
    }

    return { ok: true, pageAccountId, igAccountId };
  }
);

ipcMain.handle("meta:oauthCancel", () => {
  clearPendingMetaSession();
  return { ok: true };
});

ipcMain.handle("tiktok:oauthStatus", () => getTikTokOAuthStatus());

ipcMain.handle("tiktok:oauthStart", async () => startTikTokOAuthFlow());

ipcMain.handle("tiktok:oauthConnect", async () => {
  const session = takePendingTikTokSession();
  if (!session) {
    return { ok: false, error: "Sesión TikTok expirada. Pulsa Conectar TikTok otra vez." };
  }
  const existing = findAccountByNetworkExternal(db, "tiktok", session.openId);
  const accountId = existing?.id ?? crypto.randomUUID();
  upsertAccount(db, {
    id: accountId,
    network: "tiktok",
    display_name: session.displayName,
    external_id: session.openId,
    access_token_enc: encryptToken(session.accessToken),
    refresh_token_enc: session.refreshToken ? encryptToken(session.refreshToken) : null,
    token_expires_at: session.expiresAt,
    meta_json: JSON.stringify({
      oauth: true,
      tiktokAudited: session.audited,
      openId: session.openId,
    }),
    connection_status: session.audited ? "connected" : "expiring",
    page_name: null,
    ig_username: null,
  });
  log(
    db,
    "info",
    `TikTok OAuth: cuenta ${session.displayName} audit=${session.audited}. Activa TIKTOK_USE_API=1 en .env para autopost.`
  );
  return {
    ok: true,
    accountId,
    audited: session.audited,
    hint: session.audited
      ? "App auditada: Direct Post posible con TIKTOK_USE_API=1"
      : "Sin audit: posts van a inbox/SELF_ONLY. Assist manual sigue disponible.",
  };
});

ipcMain.handle("tiktok:oauthCancel", () => {
  clearPendingTikTokSession();
  return { ok: true };
});

ipcMain.handle("media:list", () => listMedia(db));

ipcMain.handle("media:getPath", (_e, mediaId: string) => {
  const m = getMedia(db, mediaId);
  return m?.path ?? null;
});

ipcMain.handle("media:open", async (_e, mediaId: string) => {
  const m = getMedia(db, mediaId);
  if (m?.path && fs.existsSync(m.path)) {
    await shell.openPath(m.path);
    return true;
  }
  return false;
});

ipcMain.handle("media:showInFolder", (_e, mediaId: string) => {
  const m = getMedia(db, mediaId);
  if (m?.path && fs.existsSync(m.path)) {
    shell.showItemInFolder(m.path);
    return true;
  }
  return false;
});

ipcMain.handle("media:copyToDownloads", (_e, mediaId: string) => {
  const m = getMedia(db, mediaId);
  if (m?.path && fs.existsSync(m.path)) {
    const filename = path.basename(m.path);
    const downloadsDir = path.join(process.env.USERPROFILE || "C:\\Users\\pablo", "Downloads");
    const destPath = path.join(downloadsDir, filename);
    fs.copyFileSync(m.path, destPath);
    shell.showItemInFolder(destPath);
    return true;
  }
  return false;
});

ipcMain.handle("media:delete", (_e, mediaId: string) => {
  const m = getMedia(db, mediaId);
  if (!m) {
    return { ok: false, error: "Video no encontrado en la biblioteca." };
  }
  const inPosts = countPostsUsingMedia(db, mediaId);
  if (inPosts > 0) {
    return {
      ok: false,
      error: `Este video está ligado a ${inPosts} post(s). Quítalo del compositor antes de borrarlo.`,
    };
  }
  const pathRefs = countMediaRowsWithPath(db, m.path);
  if (pathRefs <= 1 && fs.existsSync(m.path)) {
    try {
      fs.unlinkSync(m.path);
    } catch {
      return {
        ok: false,
        error: "No se pudo borrar el archivo (¿está abierto en otro programa?).",
      };
    }
  }
  deleteMediaRow(db, mediaId);
  log(db, "info", `Media eliminado: ${path.basename(m.path)}`);
  return { ok: true };
});

ipcMain.handle("inbox:openFolder", () => {
  shell.openPath(inboxDir);
});

ipcMain.handle(
  "history:list",
  (_e, filters: { network?: string; status?: string } = {}) => listHistory(db, filters)
);

ipcMain.handle("posts:list", () => listPosts(db));

ipcMain.handle(
  "posts:create",
  (
    _e,
    payload: {
      title: string;
      mediaId?: string;
      caption: string;
      linkUrl?: string;
      level: string;
      accountIds: string[];
      scheduledAt?: number;
    }
  ) => {
    const postId = crypto.randomUUID();
    insertPost(db, {
      id: postId,
      title: payload.title,
      media_id: payload.mediaId ?? null,
      caption_default: payload.caption,
      link_url: payload.linkUrl ?? process.env.DEFAULT_LINK ?? null,
      level: payload.level,
    });
    const when = payload.scheduledAt ?? Math.floor(Date.now() / 1000);
    const level = payload.level as ContentLevel;
    const skipped: string[] = [];
    let queued = 0;
    for (const accountId of payload.accountIds) {
      const account = getAccount(db, accountId);
      if (!account) continue;
      const skipReason = getSkipReason(account.network as Network, level);
      if (skipReason) {
        insertTarget(db, {
          id: crypto.randomUUID(),
          post_id: postId,
          account_id: accountId,
          caption_override: null,
          scheduled_at: when,
          status: "skipped",
          external_post_id: null,
          error: skipReason,
        });
        skipped.push(skipReason);
      } else {
        insertTarget(db, {
          id: crypto.randomUUID(),
          post_id: postId,
          account_id: accountId,
          caption_override: null,
          scheduled_at: when,
          status: "queued",
          external_post_id: null,
          error: null,
        });
        queued++;
      }
    }
    return { postId, queued, skipped };
  }
);

ipcMain.handle("targets:list", () => listTargetsWithAccounts(db, 80));

ipcMain.handle("targets:retry", (_e, targetId: string) => {
  updateTargetStatus(db, targetId, "queued", { error: "Reintento manual", attempt: 0 });
  db.prepare("UPDATE post_targets SET scheduled_at = ? WHERE id = ?").run(
    Math.floor(Date.now() / 1000),
    targetId
  );
});

ipcMain.handle("targets:skip", (_e, targetId: string) => {
  updateTargetStatus(db, targetId, "skipped", { error: "Saltado manualmente" });
});

ipcMain.handle("targets:assist", async (_e, targetId: string) => {
  await runManualAssistTarget(targetId, {
    db,
    assistDeps,
    onStatusChange: notifyTarget,
    tiktokUseApi: process.env.TIKTOK_USE_API === "1",
  });
});

ipcMain.handle("groups:list", () => listGroups(db));

ipcMain.handle(
  "groups:save",
  (_e, g: { id?: string; name: string; url: string; notes?: string }) => {
    const id = g.id || crypto.randomUUID();
    upsertGroup(db, { id, name: g.name, url: g.url, notes: g.notes ?? null, last_posted_at: null });
    return { id };
  }
);

ipcMain.handle("groups:assistNext", async (_e, payload: { caption: string; linkUrl?: string; limit?: number }) => {
  const groups = listGroups(db).slice(0, payload.limit ?? 3);
  if (groups.length === 0) return { opened: 0, error: "Catálogo de grupos vacío" };

  let opened = 0;
  for (const g of groups) {
    const input: PublishInput = {
      account: {
        id: g.id,
        network: "facebook_group",
        displayName: g.name ?? "Grupo",
        externalId: g.url,
        meta: { groupUrl: g.url },
      },
      post: {
        id: "assist-batch",
        title: "",
        captionDefault: payload.caption,
        linkUrl: payload.linkUrl,
        level: "A_relax",
      },
      caption: payload.caption,
    };
    await assistFacebookGroup(input, assistDeps);
    opened++;
    if (opened < groups.length) {
      const delayMs = 7_000 + Math.floor(Math.random() * 13_000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  log(db, "info", `Assist batch: ${opened} grupos abiertos`);
  return { opened };
});

ipcMain.handle("logs:tail", () => tailLog(db, 120));

ipcMain.handle("settings:openrouter:get", () => getPublicOpenRouterSettings(DATA_DIR));

ipcMain.handle(
  "settings:openrouter:save",
  (_e, payload: { apiKey?: string; model?: string }) =>
    saveOpenRouterSettings(DATA_DIR, {
      apiKey: payload.apiKey,
      model: payload.model,
    })
);

ipcMain.handle(
  "settings:openrouter:test",
  async (_e, payload: { apiKey?: string; model?: string }) =>
    testOpenRouterConnection(DATA_DIR, payload)
);

ipcMain.handle(
  "copy:generate",
  async (
    _e,
    payload: { network: string; level: string; topic: string; linkUrl?: string; trends?: string[] }
  ) => generateCopyVariants({
    network: payload.network as Parameters<typeof generateCopyVariants>[0]["network"],
    level: payload.level,
    topic: payload.topic,
    linkUrl: payload.linkUrl,
    trends: payload.trends,
    dataDir: DATA_DIR,
  })
);

ipcMain.handle(
  "copy:pvTourist",
  async (_e, payload: { topic: string; level: string }) =>
    generatePvTouristVariants({
      rootDir: ROOT,
      dataDir: DATA_DIR,
      topic: payload.topic,
      level: payload.level,
    })
);
