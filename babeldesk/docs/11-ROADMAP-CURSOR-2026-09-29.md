# BabelDesk — Roadmap y próxima tarea

**Fecha:** 2026-09-29  
**Carpeta:** `C:\Users\pablo\Downloads\BabelDesk\`  
**NO uses:** `venuz-social-studio-src` — carpeta muerta  
**Uso:** personal · local · sin dominio · sin multi-tenant

---

## Estado actual — P0 completo ✅

Ya existe, no lo reimplementes:

| Pieza | Archivo |
|---|---|
| Inbox watcher | `src/main/inbox-watcher.ts` |
| Cola + panel | `src/renderer/app.js`, `src/main/main.ts` |
| Cron Page/IG | `src/scheduler/worker.ts` |
| Assist Grupos/TikTok | `src/connectors/groupAssist.ts`, `assistTiktok.ts` |
| Copy OpenRouter | `src/main/copyEngine.ts` |
| Timeout 5 min | `src/main/db.ts` → `recoverStalePublishing` |
| Launcher `.bat` | `abrir-babeldesk.bat` |
| ffmpeg | 8.0.1 en PATH (Pablo) |

**Tests:** `npm test` → 10/10.

---

## Orden de tareas (respétalo, no saltes)

| # | Tarea | Estado |
|---|---|---|
| **1** | IG resumable upload sin URL pública | ✅ `src/connectors/instagram-resumable.ts` |
| **2** | Preview por red + Historial | ✅ Composer + tab Historial |
| **3** | Plantillas de copy | ⬜ Pendiente |
| **4** | `.exe` / icono escritorio | ✅ `npm run build:win` → `release/BabelDesk Setup.exe` |
| **5** | Pausa global · etiquetas · nota · contador semanal | ⬜ Pendiente |

**Regla:** no avances a la siguiente tarea sin `npm test` en verde en la actual.

---

## TAREA 1 — IG Resumable ✅ (referencia)

**Archivos:** `src/connectors/instagram-resumable.ts` + `instagram.ts`

Flujo implementado: container resumable → rupload chunks 4MB → poll `status_code` FINISHED (10×5s) → `media_publish`.

---

## TAREA 2 — Preview por red + Historial

### 2a. Preview por red (Composer)

Límites caption:

| Red | Máx |
|---|---|
| Instagram | 2.200 |
| TikTok | 150 |
| Facebook Page | 63.206 |
| Grupos FB | 63.206 |

- Aviso si sobra texto (cuántos caracteres)
- Video + destino IG/TikTok: preview 9:16 (pillarbox negro)
- **Encolar** deshabilitado si hay error de límite

**Código:** `src/shared/caption-limits.ts` + `src/renderer/`

### 2b. Historial

Vista **Historial** en panel. Columnas: Fecha · Red · Caption truncado · Status · Error · Reintentar.

Fuente: `post_targets` + joins (no tabla nueva). Filtros red/status. Últimos 100.

**IPC:** `history:list`

---

## TAREA 3 — Plantillas

`/data/templates.json`, CRUD, OpenRouter rellena `{titulo}` etc. Ver spec original en commit doc.

---

## TAREA 4 — .exe

Ya hay `npm run dist:win` → `release/BabelDesk Setup.exe`. **Esperar a T2 estable.** No cambiar `npm run dev`.

---

## TAREA 5 — QoL

Pausa cron, badges tipo pieza, nota interna 500 chars, contador semanal desde `job_log`/targets.

---

## NO v1

Downloader, clipper OpusClip, Groups API auto, TikTok público sin audit, multi-usuario.

---

## Prompt corto para Cursor

```
Carpeta: C:\Users\pablo\Downloads\BabelDesk\
NO uses venuz-social-studio-src

Si Tarea 1 (IG resumable) sigue pendiente: impleméntala primero.
Si ya está lista: ve a Tarea 2 (preview por red + historial).
Spec completa en: docs/11-ROADMAP-CURSOR-2026-09-29.md
No clipper. No exe todavía. npm test debe pasar al terminar cada tarea.
```
