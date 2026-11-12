# Estado de Avance — `ranking-app`

> **Uso:** Tablero compartido entre **Antigravity, Cursor, Claude y Grok** para saber en qué va el proyecto sin duplicar ni pisar trabajo. Actualiza la tabla cada vez que termines un módulo o corras un test.

**Última actualización:** 2026-11-11  
**Fase actual:** **Commit 2 ✅** — MVP + voz, gancho, marca, Gold/Clean, shuffle/DnD

---

## Checklist de Módulos (MVP v1 + Commit 2)

| # | Módulo | Responsable | Estado | Verificación / Notas |
|---|---|---|---|---|
| 0 | Carpeta, `.cursorrules`, handoff y prompt para Cursor | Antigravity | ✅ Listo | `docs/00_HANDOFF_Y_ARQUITECTURA.md` y `docs/01_PROMPT_CURSOR_MVP.md` |
| 0b | `babeldesk_entrega.py` + `worker/babeldesk_entrega.py` (entrega atómica a `BabelDesk\Inbox`) | Antigravity | ✅ Listo | Sin dependencia de `fabrica-de-contenido/`; soporta `BABELDESK_INBOX` |
| 1 | `render/segmentos.py` (recorte, Fill/Fit, 1080×1920, 30fps, `yuv420p`, `anullsrc`) | Cursor | ✅ Listo | `python tests/test_segmentos_modulo1.py` — 3/3 OK (2026-11-11) |
| 2 | `render/overlay.py` (Pillow PNG por puesto, presets Classic y Neon) | Cursor | ✅ Listo | `python tests/test_overlay_modulo2.py` — 2/2 OK (2026-11-11) |
| 3 | `render/exportar.py` + `render/sting.py` (concat, overlay FFmpeg, música + sting `amix normalize=0`, cancelar limpio) | Cursor | ✅ Listo | `python tests/test_exportar_modulo3.py` — 2/2 OK (2026-11-11); orden `#3→#2→#1`, `+faststart` |
| 4 | `proyecto.py` (Pydantic, `proyectos/ultimo_proyecto.json`, validación trims, → `OpcionesExport`) | Cursor | ✅ Listo | `python tests/test_proyecto_modulo4.py` — 3/3 OK (2026-11-11) |
| 5 | `app.py` (FastAPI `:5002`, SSE export, BabelDesk, panel mínimo) | Cursor | ✅ Listo | `python tests/test_app_modulo5.py` — 2/2 OK (2026-11-11) |
| 6 | `panel/` + `arrancar_ranking.bat` + `scripts/abrir_ranking.vbs` | Cursor | ✅ Listo | `python tests/test_panel_modulo6.py` — 2/2 OK (2026-11-11) |
| 7 | `tests/test_export_sintetico.py` (5 clips `testsrc2` + `ffprobe` + modo offline) | Cursor | ✅ Listo | `python tests/test_export_sintetico.py` — 3/3 OK (2026-11-11); Fill/Fit + doble export |
| 8 | Commit 2: voz (`sidechaincompress`), gancho 1–2s, watermark, shuffle/DnD, Gold/Clean | Cursor | ✅ Listo | `python tests/test_commit2.py` + overlay gold/clean (2026-11-11) |

---

## Criterios de Aceptación (del Briefing v1)

- [x] 5 MP4 locales → export `1080×1920` en orden visual `#5, #4, #3, #2, #1` (`#1` es el último clip de la lista).
- [x] Cada segmento muestra número y nombre legibles en teléfono (overlay PNG; validación visual en panel).
- [x] El título se lee en el video exportado (no solo en el preview).
- [x] `Fill` recorta a 9:16; `Fit` no deforma (letterbox).
- [x] Se respeta el trim (duración total = suma de trims ±0.15 s; hook = Commit 2).
- [x] Música de fondo + sting + voz con ducking de la música (`sidechaincompress`).
- [x] Cerrar y abrir restaura título, orden, trims y estilo (`ultimo_proyecto.json`).
- [x] Desconectar internet no cambia nada (100% local).
- [x] El MP4 cumple `H.264 yuv420p`, `AAC`, `+faststart`, `-map_metadata -1` (ffprobe en tests).
- [x] Segundo export no sobrescribe ni corrompe el primero.

---

## Registro de Cambios

- **2026-11-10 (Antigravity):** Evaluación de arquitectura aprobada (proyecto separado en `ranking-app/`, puerto `5002`, FastAPI + Pillow + FFmpeg local + Chrome `--app`). Creada estructura inicial y handoff para Cursor.
- **2026-11-10 (Antigravity):** Añadido conector autónomo `babeldesk_entrega.py` (y `worker/babeldesk_entrega.py`) + especificación de `POST /api/enviar-a-babeldesk` (Módulo 5) y botón `Exportar + Enviar a BabelDesk ↗` (Módulo 6) en el handoff y prompt de Cursor.
- **2026-11-11 (Cursor):** Módulo 1 — `render/ffmpeg_bin.py`, `render/segmentos.py` (`inspeccionar_clip`, `normalizar_segmento` Fill/Fit, `anullsrc`). Test `tests/test_segmentos_modulo1.py`: clip 16:9+audio (fill) y 9:16 mudo (fit) → `1080×1920`, ~30 fps, `yuv420p`, AAC.
- **2026-11-11 (Cursor):** Módulo 2 — `render/overlay.py` (`generar_overlay_png`, presets `classic`/`neon`, fuentes Windows locales, lista inferior resaltada). Test `tests/test_overlay_modulo2.py` → PNG `1080×1920` RGBA en `cache/test_modulo2/`.
- **2026-11-11 (Cursor):** Módulo 3 — `render/exportar.py` (`exportar_ranking`, concat, overlay por segmento, música/sting opcional, `cancelar_export`). Corregido `amix`/`asplit` del sting en cortes. Test `tests/test_exportar_modulo3.py` → 3 clips sintéticos, `h264 yuv420p`, ~30 fps, AAC, duración ≈ suma trims.
- **2026-11-11 (Cursor):** Módulo 4 — `proyecto.py` (esquema handoff, guardado atómico, `validar_para_exportar`, `proyecto_a_opciones_export`, copia `.json` junto al MP4). Test `tests/test_proyecto_modulo4.py` — orden/trims/estilo y rechazo `> 60 s` en español.
- **2026-11-11 (Cursor):** Módulo 5 — `app.py` + `panel/` mínimo (health, proyecto, importar JSON/multipart, overlay PNG, export en hilo + SSE + cancelar, BabelDesk con `BABELDESK_INBOX`, abrir carpeta). Test `tests/test_app_modulo5.py`.
- **2026-11-11 (Cursor):** Módulo 6 — panel completo (`index.html`, `style.css`, `app.js`): deck drag/drop, trims, ↑↓, preview video+overlay, export SSE, BabelDesk, música local vía `POST /api/importar-audio`. Lanzadores `arrancar_ranking.bat` y `scripts/abrir_ranking.vbs`.
- **2026-11-11 (Cursor):** Módulo 7 — `tests/test_export_sintetico.py`: 5× `testsrc2` (16:9+audio, 9:16+audio, 1 mudo), export Fill/Fit, `ffprobe` 1080×1920/30/yuv420p/h264/aac, doble export sin pisar. **MVP v1 cerrado.**
- **2026-11-11 (Cursor):** Commit 2 — gancho inicial, watermark PNG, voz con ducking, presets `gold`/`clean`, panel shuffle + arrastrar tarjetas, `POST /api/importar-imagen`. Test `tests/test_commit2.py`.

