# Prompt para Cursor — Construir `ranking-app/` (MVP v1)

Lee primero [`../.cursorrules`](../.cursorrules), [`00_HANDOFF_Y_ARQUITECTURA.md`](./00_HANDOFF_Y_ARQUITECTURA.md) y [`../ESTADO_AVANCE.md`](../ESTADO_AVANCE.md).

## Reglas obligatorias
1. Trabaja **únicamente** dentro de `metodo-scarlett/ranking-app/`. **NO** toques `fabrica-de-contenido/`, `babeldesk/` ni `libro/`.
2. Usa el puerto **`5002`** (`http://127.0.0.1:5002`, verificado libre) y arranca siempre con `python -m uvicorn app:app --host 127.0.0.1 --port 5002`.
3. Resuelve `ffmpeg` y `ffprobe` con `shutil.which(...)` (respaldo `%LOCALAPPDATA%\Microsoft\WinGet\Links\`); si no existen, lanza error claro en español.
4. En el lanzador Windows, abre `C:\Program Files\Google\Chrome\Application\chrome.exe` en modo `--app=http://127.0.0.1:5002/` (respaldo `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). Nunca uses `webbrowser.open()`.
5. Responde a Pablo en **español sencillo**, sin jerga técnica. Toda la UI va en español claro.
6. No imprimas ni guardes secretos. La app es 100% local y debe funcionar **sin internet**.
7. **Ejecución secuencial estricta:** construye los módulos **1 por 1 en orden**. No pases al módulo siguiente hasta cumplir su criterio de aceptación y actualizar `ranking-app/ESTADO_AVANCE.md`.
8. **Frontend sin frameworks ni CDNs:** el panel usa HTML + CSS + JavaScript vanilla (`panel/index.html` + `panel/app.js` + `panel/style.css`), sin React, sin Vue, sin `npm` ni CDNs externos, para que funcione 100 % sin internet.

---

## Tu tarea: construir los módulos 1 al 7 del MVP en este orden exacto

### Módulo 1 — `render/segmentos.py`
- Función para inspeccionar un video con `ffprobe` (`duracion`, `width`, `height`, `tiene_audio`, `codec`). Si no se puede leer, lanzar error claro en español indicando el archivo.
- Función para normalizar y recortar un clip a un `.mp4` temporal intermedio:
  - `-ss {trimIn} -t {trimOut - trimIn}`
  - `fill`: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p,setsar=1`
  - `fit`: `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p,setsar=1`
  - Audio: si `keep_audio=True` y el clip tiene audio, re-codificar a `aac 44100 stereo`; si `keep_audio=False` o el clip NO tiene pista de audio, inyectar silencio (`anullsrc=r=44100:cl=stereo`) con duración exacta del segmento para que `concat` nunca falle.
- **Criterio de aceptación (Módulo 1):** prueba automática con 1 clip 16:9 con audio + 1 clip 9:16 **sin pista de audio**; `ffprobe` confirma ambos en `1080×1920`, `30/1` fps, `yuv420p` y pista `aac` en ambos.

### Módulo 2 — `render/overlay.py`
- Usar **Pillow (`PIL`)** para generar un PNG RGBA de `1080×1920` por segmento (y reutilizar exactamente ese mismo endpoint/imagen en el preview del navegador).
- Debe dibujar:
  - **Título del ranking** en zona superior segura (ej. `y=110..260`, legible en móvil, con sombra/contorno fuerte).
  - **Número grande del puesto** (`#5`, `#4`, ..., `#1`) + **nombre del puesto** (`label`), bien contrastado.
  - **Lista lateral o inferior** compacta con todos los puestos y el actual resaltado (opcional/limpia para móvil).
- Presets en v1:
  - `classic`: blanco con contorno negro y sombra fuerte, acento configurable.
  - `neon`: número con efecto glow en color `accent` y pastilla oscura semitransparente detrás del texto.
- Usar fuentes instaladas en Windows (`C:\Windows\Fonts\arialbd.ttf` / `segoeui.ttf` con fallback seguro) para no depender de internet.
- **Criterio de aceptación (Módulo 2):** genera PNG RGBA `1080×1920` para `classic` y `neon` sin errores ni dependencias de red, con título, número y etiqueta visibles.

### Módulo 3 — `render/exportar.py`
- Generar un **sting built-in** simple (WAV corto de ~0.25 s generado por Python `wave`/`math` si no se elige archivo externo) en `assets/sting_default.wav`.
- Pipeline:
  1. Normalizar cada clip del array `clips` en orden (`index 0` = `#N` ... `último` = `#1`) reportando progreso por paso.
  2. Superponer su PNG de `overlay.py` a cada segmento (o tras concatenar con `overlay=enable='between(t,ini,fin)'`).
  3. Concatenar segmentos de video + audio de clips.
  4. Si hay música y/o sting: mezclar audio de clips + música en loop con volumen configurable + stings colocados con `adelay` en el segundo exacto de cada cambio de puesto usando `amix=...:normalize=0`.
  5. Export final obligatorio: `-c:v libx264 -preset fast -crf 21 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 44100 -movflags +faststart -map_metadata -1 -fflags +bitexact`.
- Guardar con nombre único (`ranking_YYYYMMDD_HHMMSS.mp4`) para no pisar exports previos.
- Soportar **cancelación**: si el usuario cancela, terminar el proceso FFmpeg activo y borrar el `.mp4` incompleto y los temporales.
- **Criterio de aceptación (Módulo 3):** export de prueba de 3 segmentos genera MP4 válido (`h264 yuv420p`, `30 fps`, `aac`, duración = suma de trims), orden `#3→#2→#1`, y cancelar borra el archivo parcial.

### Módulo 4 — `proyecto.py`
- Guardar/cargar el JSON del proyecto en `proyectos/ultimo_proyecto.json` (y copia junto al `.mp4` exportado si se desea), validado con Pydantic según el esquema de `00_HANDOFF_Y_ARQUITECTURA.md`.
- Validar que ningún clip tenga `trimOut - trimIn > 60.0` ni `<= 0.2` al exportar, devolviendo mensaje claro en español si falta recortar alguno.
- **Criterio de aceptación (Módulo 4):** test unitario guarda y recarga un proyecto conservando orden, trims y estilo, y rechaza un clip `> 60 s` sin recortar con mensaje en español.

### Módulo 5 — `app.py` (FastAPI en `127.0.0.1:5002`)
- Endpoints mínimos:
  - `GET /` → sirve `panel/index.html`
  - `GET /health` → `{"status": "ok"}`
  - `GET /api/proyecto` / `POST /api/proyecto` → cargar y autoguardar estado
  - `POST /api/importar` → recibe rutas locales o archivos MP4/MOV/WebM, corre `ffprobe`, genera miniatura `.jpg` en `cache/thumbs/`
  - `GET /api/miniatura/{clip_id}` y `GET /api/clip/{clip_id}` → servir video/miniatura local para preview
  - `POST /api/overlay-preview` → devuelve el PNG generado por `overlay.py` para el preview 9:16
  - `POST /api/exportar` + `GET /api/exportar/progreso/{job_id}` (SSE) + `POST /api/exportar/cancelar/{job_id}`
  - `POST /api/enviar-a-babeldesk` → usando `babeldesk_entrega.py` (ya incluido en `ranking-app/babeldesk_entrega.py` y `worker/babeldesk_entrega.py`), toma el `.mp4` recién exportado, genera su miniatura `.jpg` con FFmpeg en `cache/thumbs/` (si no se pasó una), construye el `.json` gemelo (`{"title": ..., "caption": ..., "fuente": "ranking-app", "puestos": [...]}`) con caption sugerido a partir del título y puestos del ranking, y llama a `entregar_ranking_en_inbox(mp4_path, miniatura_path, json_payload)` para copiar atómicamente (`.tmp` → final) hacia `C:\Users\pablo\Downloads\BabelDesk\Inbox\` (o `BABELDESK_INBOX`). Devuelve `{"ok": true, "inbox": ..., "mp4": ..., "jpg": ..., "json": ...}` o error claro en español si no existe BabelDesk.
  - `POST /api/abrir-carpeta` → abre la carpeta de salida en el Explorador de Windows
- **Criterio de aceptación (Módulo 5):** arrancando con `python -m uvicorn app:app --host 127.0.0.1 --port 5002`, `GET /health` responde `200`, y `/api/importar` + `/api/overlay-preview` + `/api/exportar` + `/api/enviar-a-babeldesk` (probado con `BABELDESK_INBOX` hacia carpeta temporal) funcionan con `TestClient`.

### Módulo 6 — `panel/` + Lanzador Windows
- Toma como referencia visual [`docs/mockup_panel.html`](./mockup_panel.html) (respetando la Regla 8: HTML/CSS/JS vanilla sin CDNs externos).
- Una sola vista oscura de alta densidad en 3 zonas:
  - **Izquierda (Deck):** soltar/seleccionar 3–10 videos, tarjetas con miniatura, duración, trim in/out, nombre del puesto, toggle de audio original, botones `↑` / `↓`. Regla visible: *"El último de la lista es el #1 y sale al final"*. Aviso claro si un clip pasa de 60 s.
  - **Centro (Preview 9:16):** `<video>` + `<img>` del overlay PNG encima, play/pausa, flechas puesto anterior/siguiente, atajos `Espacio`, `←`, `→`.
  - **Derecha (Estilo y Export):** título, preset (`Classic` / `Neon`), color de acento, `Fill / Fit`, música + volumen, sting + volumen, carpeta de salida, dos botones de acción: **`Exportar MP4`** (primario) y **`Exportar + Enviar a BabelDesk ↗`** (exporta y llama automáticamente a `POST /api/enviar-a-babeldesk`, mostrando aviso claro con la ruta de `Inbox` o error si falla), barra de progreso real y botón cancelar.
- Crear `arrancar_ranking.bat` (con `python -m uvicorn app:app --host 127.0.0.1 --port 5002`) y `scripts/abrir_ranking.vbs` (ventana Chrome `--app=http://127.0.0.1:5002/`, respaldo Edge, mismo patrón que `abrir_fabrica.vbs`).
- **Criterio de aceptación (Módulo 6):** abrir `http://127.0.0.1:5002/` muestra las 3 zonas sin errores JS en consola, permite reordenar `↑`/`↓`, ver preview 9:16 con overlay, lanzar export con progreso en vivo y disparar **`Exportar + Enviar a BabelDesk ↗`**.

### Módulo 7 — Tests automáticos (`tests/test_export_sintetico.py`)
- Generar 5 clips sintéticos con FFmpeg `testsrc2` (4 con audio y **1 sin audio** para probar `anullsrc` y 1 en 16:9 para probar `Fill` y `Fit`).
- Correr el pipeline completo de export en modo offline y verificar con `ffprobe`:
  - Resolución `1080×1920`, `pix_fmt == "yuv420p"`, `r_frame_rate == "30/1"` (30 fps), `codec_name == "h264"`, pista `aac`, y duración total igual a la suma de los trims (±0.15 s).
  - Verificar que un segundo export crea otro archivo y no borra ni corrompe el primero.
- **Criterio de aceptación (Módulo 7):** `python tests/test_export_sintetico.py` (o `pytest`) termina con código `0` y todos los checks en verde.

---

## Criterio de entrega del MVP
Cuando los 7 módulos y el test sintético pasen al 100%, marca los checkboxes en `ESTADO_AVANCE.md` y avisa a Pablo para pasar al **Commit 2** (`voiceover` con ducking, `hook` 1–2s, `watermark`, `shuffle`, presets `Gold` y `Clean`).
