# Estado de Avance — `ranking-app`

> **Uso:** Tablero compartido entre **Antigravity, Cursor, Claude y Grok** para saber en qué va el proyecto sin duplicar ni pisar trabajo. Actualiza la tabla cada vez que termines un módulo o corras un test.

**Última actualización:** 2026-11-10  
**Fase actual:** Handoff cerrado → Listo para que Cursor construya el Módulo 1 (`render/segmentos.py`)

---

## Checklist de Módulos (MVP v1 + Commit 2)

| # | Módulo | Responsable | Estado | Verificación / Notas |
|---|---|---|---|---|
| 0 | Carpeta, `.cursorrules`, handoff y prompt para Cursor | Antigravity | ✅ Listo | `docs/00_HANDOFF_Y_ARQUITECTURA.md` y `docs/01_PROMPT_CURSOR_MVP.md` |
| 1 | `render/segmentos.py` (recorte, Fill/Fit, 1080×1920, 30fps, `yuv420p`, `anullsrc`) | Cursor | ⬜ Pendiente | Probar con 1 clip con audio y 1 clip mudo |
| 2 | `render/overlay.py` (Pillow PNG por puesto, presets Classic y Neon) | Cursor | ⬜ Pendiente | Legible en pantalla de teléfono |
| 3 | `render/exportar.py` (concat, overlay PNG, música + sting, `amix normalize=0`, cancelar limpio) | Cursor | ⬜ Pendiente | Probar orden `#5→#1` y `+faststart` |
| 4 | `proyecto.py` (cargar/guardar JSON local + autoguardado último proyecto) | Cursor | ⬜ Pendiente | Al reabrir conserva orden, trims y estilo |
| 5 | `app.py` (FastAPI en `:5002`: importar, miniatura, preview PNG, export + SSE) | Cursor | ⬜ Pendiente | Sin internet sigue funcionando |
| 6 | `panel/` (1 vista, 3 zonas: Deck, Preview 9:16, Estilo y Export + acceso directo `.bat`/`.vbs`) | Cursor | ⬜ Pendiente | Regla: la tarjeta de abajo es `#1` y sale al final |
| 7 | `tests/test_export_sintetico.py` (5 clips `testsrc2` + `ffprobe` + modo offline) | Cursor | ⬜ Pendiente | Criterios 1–7 y 10 en verde |
| 8 | Commit 2: `voiceover` con ducking (`sidechaincompress`), `hook` 1–2s, `watermark`, `shuffle`, presets Gold/Clean | Cursor | ⬜ Pendiente | Después de validar el MVP |

---

## Criterios de Aceptación (del Briefing v1)

- [ ] 5 MP4 locales → export `1080×1920` en orden visual `#5, #4, #3, #2, #1` (`#1` es el último clip de la lista).
- [ ] Cada segmento muestra número y nombre legibles en teléfono.
- [ ] El título se lee en el video exportado (no solo en el preview).
- [ ] `Fill` recorta a 9:16; `Fit` no deforma (letterbox).
- [ ] Se respeta el trim (duración total = suma de trims + hook si aplica).
- [ ] Música de fondo suena todo el video; sting suena en los cortes; si hay voice-over, baja la música.
- [ ] Cerrar y abrir restaura título, orden, trims y estilo.
- [ ] Desconectar internet no cambia nada (100% local).
- [ ] El MP4 abre en Windows/TikTok/IG/YT (`H.264 yuv420p`, `AAC`, `+faststart`, `-map_metadata -1`).
- [ ] Segundo export no sobrescribe ni corrompe el primero.

---

## Registro de Cambios

- **2026-11-10 (Antigravity):** Evaluación de arquitectura aprobada (proyecto separado en `ranking-app/`, puerto `5002`, FastAPI + Pillow + FFmpeg local + Chrome `--app`). Creada estructura inicial y handoff para Cursor.
