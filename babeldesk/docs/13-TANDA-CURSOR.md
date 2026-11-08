# BabelDesk — Tanda 13 (overlay + plan semanal)

Carpeta: `C:\Users\pablo\Downloads\BabelDesk\`  
NO uses `venuz-social-studio-src`.

## Qué incluye

| Pieza | Ruta |
|-------|------|
| Export reel 9:16 + hook 2s + letrero | `src/media/overlay.ts` |
| Plan semanal OpenRouter | `src/plan/weekPlan.ts` |
| IPC | `src/main/ipc-handlers.ts` → `registerTanda13Handlers` en `main.ts` |
| UI | Tab **Crear Post** (`src/renderer/index.html` + `app.js`) |
| Prueba manual | `scripts/overlay-reel.ps1` |

## IPC (renderer)

- `overlay:checkFfmpeg` → `{ available }`
- `overlay:export` → `{ inFile, outFile?, hook?, showBranding? }`
- `plan:week` → usa `data/config.json` (misma key/modelo que Ajustes)

## Tests

```bash
npm test
# o solo tanda 13:
node --import tsx --test src/media/overlay.test.ts src/plan/weekPlan.test.ts
```

## Descarga Inbox (v0.2.0 — post-tanda 13)

**Implementado (opcional, local):** en el tab **Mis Videos**, descarga de URLs con **`yt-dlp`** (TikTok, Instagram, YouTube, Facebook, X) hacia `Inbox/`. Requiere `yt-dlp` en PATH; no es servicio en la nube ni parte del scope original de la tanda 13.

| Pieza | Ruta |
|-------|------|
| Lógica | `src/connectors/downloader.ts` |
| IPC | `registerDownloaderHandlers` en `src/main/ipc-handlers.ts` |
| UI | `src/renderer/index.html` + `app.js` |
| Snippet referencia | `src/ui/inbox.html` (no cargado por Electron; plantilla) |

Canales: `downloader:checkYtDlp`, `downloader:detectNetwork`, `downloader:download` · evento `downloader:progress`.

## NO

Fase 2, clipper, exe, VPN. (Downloader local vía yt-dlp: **sí**, ver arriba.)

## Commit sugerido

`Tanda 13: overlay 9:16 + hook + branding + plan semanal PV`
