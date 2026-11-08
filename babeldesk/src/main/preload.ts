import { contextBridge, ipcRenderer } from "electron";

const channels = [
  "app:getInfo",
  "app:openDoc",
  "accounts:list",
  "accounts:save",
  "accounts:delete",
  "accounts:probe",
  "accounts:disconnect",
  "meta:oauthStatus",
  "meta:oauthStart",
  "meta:oauthListPages",
  "meta:oauthConnect",
  "meta:oauthCancel",
  "tiktok:oauthStatus",
  "tiktok:oauthStart",
  "tiktok:oauthConnect",
  "tiktok:oauthCancel",
  "media:list",
  "media:getPath",
  "media:open",
  "media:showInFolder",
  "media:copyToDownloads",
  "media:delete",
  "history:list",
  "posts:list",
  "posts:create",
  "targets:list",
  "targets:retry",
  "targets:skip",
  "targets:assist",
  "groups:list",
  "groups:save",
  "groups:assistNext",
  "logs:tail",
  "copy:generate",
  "copy:pvTourist",
  "settings:openrouter:get",
  "settings:openrouter:save",
  "settings:openrouter:test",
  "overlay:export",
  "overlay:checkFfmpeg",
  "plan:week",
  "downloader:checkYtDlp",
  "downloader:detectNetwork",
  "downloader:download",
  "watermark:remove",
  "cutter:checkFfmpeg",
  "cutter:getDuration",
  "cutter:cut",
  "cutter:getYoutubeChapters",
  "inbox:openFolder",
] as const;

contextBridge.exposeInMainWorld("babeldesk", {
  invoke: (channel: (typeof channels)[number], ...args: unknown[]) => {
    if (!channels.includes(channel)) throw new Error(`IPC no permitido: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },
  onTargetUpdate: (cb: (payload: { targetId: string; status: string }) => void) => {
    ipcRenderer.on("target:update", (_e, payload) => cb(payload));
  },
  onDownloaderProgress: (
    cb: (payload: { percent: number; text: string; network: string; url: string }) => void
  ) => {
    ipcRenderer.on("downloader:progress", (_e, payload) => cb(payload));
  },
  onCutterProgress: (
    cb: (payload: { msg: string; done: number; total: number }) => void
  ) => {
    ipcRenderer.on("cutter:progress", (_e, payload) => cb(payload));
  },
});

export type BabelDeskApi = typeof window & {
  babeldesk: { invoke: Function; onTargetUpdate: Function; onDownloaderProgress: Function; onCutterProgress: Function };
};
