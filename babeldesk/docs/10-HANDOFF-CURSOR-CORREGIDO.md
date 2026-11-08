# HANDOFF CURSOR — BabelDesk (corregido, rutas reales)

**Fecha:** 2026-09-29 | **Commit base:** `37668c8` (+ Tarea 1 timeout)  
**Ruta:** `C:\Users\pablo\Downloads\BabelDesk\`  
**Stack:** TypeScript + Electron (no hay `src/publishers/*.js` ni `src/queue.js`)

---

## Estado P0 — tabla con archivos reales

| Pieza | Estado | Archivo clave |
|---|---|---|
| Ventana BabelDesk — LabelBabel | ✅ | `src/main/main.ts` |
| Inbox watcher | ✅ | `src/main/inbox-watcher.ts` |
| Cola + fallos UI | ✅ | `src/renderer/app.js` + IPC en `main.ts` |
| Cron Page + IG | ✅ | `src/scheduler/worker.ts` |
| Grupos + TikTok assist | ✅ manual | `src/connectors/groupAssist.ts`, `src/connectors/assistTiktok.ts` |
| Copy OpenRouter | ✅ | `src/main/copyEngine.ts` |
| SQLite | ✅ | `src/main/db.ts` |
| Tests scheduler | ✅ | `src/scheduler/worker.test.ts` |

---

## Correcciones de diseño (no revertir)

- **Nivel B** → solo red `instagram` en cron (Page/TikTok → `skipped`).
- **Nivel C** → sin TikTok.
- **TikTok v1:** assist; API solo con `TIKTOK_USE_API=1` + audit.
- **Grupos:** no cron; botón «Abrir destino» o batch en `groups:assistNext`.
- **Cifrado:** `STUDIO_MASTER_KEY` o `ALLOW_PLAIN_TOKENS=1` (solo dev).

---

## Posts atascados en `publishing`

| Mecanismo | Estado |
|---|---|
| Reinicio app reseteaba todo `publishing` | ❌ reemplazado |
| **Timeout 5 min** (`status_since`) | ✅ Tarea 1 — `recoverStalePublishing()` en `src/main/db.ts` |
| Cron cada 30 s + timer 5 min en `main.ts` | ✅ |

Columna: `post_targets.status_since` (unix seg). Constante: `PUBLISHING_STALE_SEC = 300`.

Test: `npm run test:src -- src/main/queue-recovery.test.ts`

---

## IG — estado real (no confundir con docs genéricos)

**Archivo:** `src/connectors/instagram.ts` — función `publishToInstagram()`

| Paso | Estado |
|---|---|
| Crear container `POST /{ig-user-id}/media` con `video_url` | ✅ solo si hay `mediaPublicUrl` |
| Sin URL pública | ❌ falla al inicio con mensaje claro (línea ~21–26) |
| Polling `status_code` hasta `FINISHED` | ✅ (~líneas 56–75) |
| **Resumable upload desde disco local** | ✅ `src/connectors/instagram-resumable.ts` + tests |

**Causa raíz local:** Meta exige URL pública o flujo resumable (`rupload.facebook.com` / `upload_type=resumable`). Inbox solo tiene path en disco.

**P1 implementar en:** `src/connectors/instagram.ts` (nuevo helper `instagramResumableUpload.ts` si hace falta).

---

## P1 — próxima sesión (resumen)

1. ~~Timeout automático publishing~~ → **hecho** (este handoff)
2. **IG resumable** sin URL → `src/connectors/instagram.ts`
3. **`scripts/encode-reel.ps1`** — **NO EXISTE**; crear desde cero. Input: `Inbox\*.mp4` → Output: `Library\*-reel.mp4` 1080×1920, ffmpeg en PATH
4. **Calendario visual** → extender `src/renderer/` (hoy tabla en `index.html`)

## P2 — después

- Clipper local (Whisper + OpenRouter + ffmpeg) — ver `docs/09-COMPONENTES-Y-IA.md`
- TikTok API real tras audit

---

## Cómo probar

```powershell
cd C:\Users\pablo\Downloads\BabelDesk
copy .env.example .env
npm install
npm run dev
```

---

## Documentos (orden)

1. `docs/07-USO-PERSONAL-LOCAL.md`
2. `docs/08-HANDOFF-CURSOR-2026-09-29.md` (sesión integración)
3. `docs/09-COMPONENTES-Y-IA.md`
4. **Este archivo** (`docs/10-…`) — mandato operativo

---

## SIGUIENTE TAREA PARA CURSOR

**Orden estricto (no saltar):**

1. ✅ Timeout publishing — `src/main/db.ts` + test `src/main/queue-recovery.test.ts`
2. ✅ IG Resumable Upload — `src/connectors/instagram-resumable.ts` (usado desde `instagram.ts`)
3. **`scripts/encode-reel.ps1`** ← siguiente
4. **Calendario** — `src/renderer/`

**No tocar P2 (Clipper / TikTok API) en la sesión de P1.**

Tras Tarea 2: correr tests + probar un Reel desde Inbox sin túnel.
