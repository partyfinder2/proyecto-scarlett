# Handoff y Arquitectura Aprobada — App Local de Ranking Shorts (`ranking-app/`)

**Fecha:** 2026-11-10  
**Evaluado por:** Antigravity  
**Implementación siguiente:** Cursor  
**Repositorio:** `proyecto-scarlett` → carpeta aislada `ranking-app/` (NO mezclar con `fabrica-de-contenido/`)

---

## 1. Decisión de Arquitectura: Proyecto Separado

`ranking-app/` vive **separada** de `fabrica-de-contenido/` porque:
1. Cursor está trabajando en paralelo en `fabrica-de-contenido/`; separar evita conflictos en `app.py`, `renderer.py` y `panel/app.js`.
2. Son flujos distintos: la Fábrica automatiza guion + voz IA + lotes desde Telegram; `ranking-app` es un editor manual rápido de una pantalla para armar Top 3–10 en menos de 3 minutos sin abrir CapCut.
3. Si uno falla, no tumba al otro. Más adelante se pueden conectar recogiendo el `.mp4` exportado desde una carpeta compartida.

---

## 2. Stack Aprobado (Arquitectura A ajustada)

| Componente | Decisión | Por qué |
|---|---|---|
| **Puerto local** | `http://127.0.0.1:5002` | Separado de la Fábrica (`:5001`). |
| **Backend** | Python 3.14 + FastAPI + Uvicorn | Mismo entorno ya instalado en la PC de Pablo; cero dependencias nuevas pesadas. |
| **Ventana / Empaquetado** | `.bat` + `.vbs` abriendo Chrome/Edge en `--app` | Sin Tauri (requiere Rust) ni Electron (`node_modules` pesados). Patrón ya probado en `fabrica-de-contenido/scripts/abrir_fabrica.vbs`. |
| **Overlays de texto** | **Pillow (`12.1.1` ya instalado)** generando PNG transparente por segmento | Mismo PNG para el preview HTML (`<img>` sobre `<video>`) y para FFmpeg (`overlay=`). Garantiza que **Preview == Export** y evita peleas con fuentes en `drawtext`. |
| **Render** | **FFmpeg 8.0.1 local** por segmentos normalizados | Mucho más rápido y estable con MOV/VFR/codecs raros que renderizar en navegador (WebCodecs). |

---

## 3. Reglas Críticas de FFmpeg (Trampas ya detectadas en la Fábrica)

Para que el MP4 pase los controles de TikTok, Instagram Reels y YouTube Shorts sin pantallas negras ni errores de audio:

1. **Normalizar cada segmento por separado antes de concatenar** (no usar un solo `filter_complex` gigante):
   - Escalar a `1080:1920`:
     - `fill`: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`
     - `fit`: `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black`
   - Forzar `fps=30`, `format=yuv420p`, `setsar=1`.
2. **Clips sin pista de audio:** muchos clips descargados de redes no tienen stream de audio. Si un segmento viene sin audio (detectar con `ffprobe`), inyectar silencio (`anullsrc=r=44100:cl=stereo`) para que `concat` no falle. Si `keepAudio=false`, también emitir audio silencioso limpio en el segmento normalizado (`44100 Hz`, stereo).
3. **Mezcla de audios (música + sting + voice-over):**
   - Usar `amix=...:normalize=0` (evita la caída de volumen automática de FFmpeg).
   - Para bajar la música cuando suena el voice-over (ducking), usar `sidechaincompress` (~`-12 dB`).
   - El sting se coloca exactamente en los timestamps de corte entre segmentos (`adelay`).
4. **Contrato de salida MP4 obligatorio:**
   - `-c:v libx264 -preset fast -crf 21 -pix_fmt yuv420p -r 30`
   - `-c:a aac -b:a 192k -ar 44100`
   - `-movflags +faststart -map_metadata -1 -fflags +bitexact`
5. **Cancelación limpia:** si el usuario cancela a mitad del export, matar el subproceso FFmpeg y borrar el `.mp4` parcial (nunca dejar archivos rotos en la carpeta de salida).

---

## 4. Contrato del Proyecto (JSON) y Reglas de Negocio

- **Orden del deck:** el array `clips` sigue el orden visual de arriba hacia abajo (`arriba` se reproduce **primero**).
- **Numeración:** `numero_puesto = len(clips) - index`. Así, con 5 clips: índice `0` es `#5` (sale primero) e índice `4` es `#1` (sale al final).
- **Límite por clip:** aceptar MP4, MOV y WebM locales. Si un clip pasa de `60 s`, **no rechazarlo** al importar: obligar a recortarlo (`trimOut - trimIn <= 60`) antes de permitir exportar.
- **No auto-descarga ni auto-publica:** los clips vienen del disco de Pablo; la salida es un `.mp4` único con timestamp/incremento para no sobrescribir exports previos.

```json
{
  "version": 1,
  "title": "Top 5 herramientas de IA",
  "preset": "classic",
  "accent": "#FACC15",
  "framing": "fill",
  "hook": { "enabled": false, "fromRankId": null, "seconds": 1.5 },
  "music": { "path": null, "volume": 0.25 },
  "voiceover": { "path": null, "volume": 1.0 },
  "sting": { "path": null, "volume": 0.8 },
  "watermark": { "path": null, "opacity": 0.85 },
  "outputDir": "",
  "clips": [
    {
      "id": "c1",
      "path": "C:/clips/a.mp4",
      "label": "Nombre del puesto",
      "trimIn": 0.0,
      "trimOut": 8.5,
      "keepAudio": false
    }
  ]
}
```

---

## 5. Recorte de Alcance para Primer Entregable (Fin de Semana)

Para tener un MVP usable y sólido sin sacrificar los criterios 1–7 y 10 del briefing:

### SÍ entra en MVP (Commit 1)
- Importar 3–10 clips locales (MP4, MOV, WebM), miniaturas con `ffmpeg`/`ffprobe`, trim in/out, validación `<= 60 s` antes de exportar.
- Reordenar con botones `↑` / `↓` (regla estricta: el último es `#1` y sale al final).
- Nombre editable por puesto + título general del ranking.
- Framing `Fill` y `Fit`.
- **2 presets de texto** (`Classic` y `Neon`) + 1 color de acento, renderizados con Pillow PNG tanto en preview como en export.
- Música de fondo con volumen + audio por clip muteado por defecto (toggle por clip) + **sting en los cortes** (incluir un sting built-in WAV simple generado localmente + opción de reemplazar con archivo).
- Preview 9:16 con play/pausa, salto entre puestos y atajos `←` `→` `Espacio` (no hace falta sincronizar audio complejo en preview, basta video + PNG encima).
- Export MP4 `1080×1920`, `30 fps`, `H.264 yuv420p + AAC`, `+faststart`, barra de progreso por SSE y botón cancelar.
- Autoguardado del proyecto JSON para restaurar al reabrir.

### Queda para Commit 2 (sin bloquear el MVP)
- `voice-over` importado con ducking (`sidechaincompress`).
- `hook` opcional de 1–2 s al inicio.
- `watermark` PNG opcional en esquina.
- Botón `Shuffle` y `Drag & Drop` de tarjetas.
- Presets `Gold` y `Clean`.
- Fase 2 posterior: plantillas por canal, lista local de títulos, TTS.

### Fuera de alcance definitivo en esta app
- Editor de historias de Reddit, generación de video con IA, nube, cuentas, login, 4K, auto-descarga de TikTok/X y auto-publicación a redes.

---

## 6. Advertencias de Negocio (para tener presentes en operación)

1. **Clips de terceros:** recortar, reordenar y poner overlays ayuda a transformar, pero no elimina reclamos si el dueño original reclama o si las plataformas marcan contenido reutilizado sin aporte propio. Para monetizar a largo plazo, agregar voice-over (Commit 2) y crédito si aplica.
2. **Nicho adultos vs. Finanzas/IA para `labelbabel.com`:** TikTok, Instagram y YouTube Shorts restringen fuertemente contenido adulto (riesgo alto de baneo y cero monetización). No mezclar ese nicho en las mismas cuentas de Finanzas o IA.
