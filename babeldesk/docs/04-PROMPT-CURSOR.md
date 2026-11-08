# Prompt para Cursor

Abre la carpeta `C:\Users\pablo\Downloads\BabelDesk` como workspace (nombre producto: **BabelDesk**).
Lee también `docs/07-USO-PERSONAL-LOCAL.md` y `docs/08-HANDOFF-CURSOR-2026-09-29.md`.

Tarea 1 — scaffold runnable:

```
npm create (no reescribas docs)
Implementa package.json scripts: dev, build
Electron main carga renderer
SQLite en data/studio.sqlite
```

Tarea 2 — composer UI

Pantallas:

1. Biblioteca media (drag video/foto)
2. Nuevo post: caption, link, nivel A/B/C, checkboxes de destinos
3. Calendario lista (scheduled_at)
4. Log

Tarea 3 — conectores

Implementa los stubs de `src/connectors` contra fetch nativo.  
Timeouts 30s. Errores de Graph mapeados a texto humano.

Tarea 4 — groups assist

Tabla `group_catalog`. Botón “Abrir siguientes 3 grupos” que:

- copia caption
- abre URL
- marca awaiting_human
- espera confirmación manual “ya publiqué”

No uses puppeteer.

Archivos que no toques salvo typo: docs/01-API-REALIDAD.md
