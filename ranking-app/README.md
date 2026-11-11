# Ranking App (`ranking-app/`)

Herramienta local de escritorio para crear **Shorts/Reels verticales de ranking (Top 3 a Top 10)** a partir de clips locales en tu computadora, sin abrir CapCut, sin nube y sin marcas de agua.

> **Estado actual:** Handoff y arquitectura aprobados (2026-11-10). Listo para implementación del MVP en Cursor.  
> **Avance vivo para todas las IAs:** consultar [`ESTADO_AVANCE.md`](./ESTADO_AVANCE.md).

---

## Stack y Puerto

- **Puerto local:** `http://127.0.0.1:5002` (separado de `fabrica-de-contenido` en `:5001` para no pisarse)
- **Backend:** Python 3.14 + FastAPI + Uvicorn
- **Overlays:** Pillow (PNG transparente por segmento — idéntico en preview y export)
- **Motor de video:** FFmpeg + FFprobe local (`1080×1920`, `30 fps`, `H.264 yuv420p`, `AAC`, `+faststart`, `-map_metadata -1`)
- **Ventana:** Chrome / Edge en modo `--app` (igual que `abrir_fabrica.vbs`)

---

## Mapa del proyecto

| Ruta | Qué contiene |
|---|---|
| `ESTADO_AVANCE.md` | Tablero de avance compartido entre IAs (qué está hecho, qué falta, criterios de aceptación). |
| `docs/00_HANDOFF_Y_ARQUITECTURA.md` | Briefing de producto + dictamen de arquitectura y decisiones cerradas. |
| `docs/01_PROMPT_CURSOR_MVP.md` | Prompt exacto y orden de módulos para que Cursor construya el MVP. |
| `docs/mockup_panel.html` | Referencia visual offline (3 zonas, modo oscuro, sin CDNs) para el Módulo 6. |
| `.cursorrules` | Reglas operativas exclusivas para trabajar dentro de `ranking-app/`. |
| `requirements.txt` | Dependencias Python mínimas del proyecto. |
| `babeldesk_entrega.py` y `worker/babeldesk_entrega.py` | Conector atómico (`.tmp` → final) para entregar `.mp4` + `.jpg` + `.json` a `BabelDesk\Inbox`. |
| `render/` *(por crear)* | `segmentos.py`, `overlay.py`, `exportar.py`. |
| `panel/` *(por crear)* | Interfaz de 1 pantalla en 3 zonas (Deck, Preview 9:16, Estilo y Export). |
| `tests/` *(por crear)* | Test automático de export con 5 clips sintéticos + verificación `ffprobe`. |

