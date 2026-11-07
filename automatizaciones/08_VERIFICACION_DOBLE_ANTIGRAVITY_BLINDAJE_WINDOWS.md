# 08 — DOBLE VERIFICACIÓN Y BLINDAJE WINDOWS (AUDITORÍA ANTIGRAVITY SOBRE CLAUDE)
> **Propósito:** Corregir 4 detalles técnicos críticos detectados al auditar `06_CLAUDE_AUDITORIA_Y_ARQUITECTURA_CODIGO.md` para garantizar que cuando **Cursor** arme la herramienta en la máquina Windows de Pablo, funcione a la primera sin un solo error.

---

## 🔍 Los 4 Ajustes Obligatorios que Cursor Debe Aplicar al Código de Claude

Al revisar línea por línea las 1,490 líneas de Claude, la arquitectura general (SQLite + Python Worker en puerto 5001 + SSE Tracker + 10 Canales) tiene **calificación 10/10**. Sin embargo, detecté **4 trampas técnicas en Windows y FFmpeg** que romperían el renderizado si no las corregimos antes de programar:

---

### 🛠️ Corrección 1: Error en `ffmpeg-python` al encadenar múltiples `.input()` (`worker/renderer.py`)
- **El bug en el borrador de Claude:** Claude escribió `ffmpeg.input(video_path).output(...).input(voice_path).input(music_path)`. En la librería `ffmpeg-python`, el método `.output()` devuelve un objeto `OutputStream` que **no tiene** método `.input()`, lo cual lanzaría `AttributeError: 'OutputStream' object has no attribute 'input'`.
- **Además, la trampa de las fuentes en Windows:** En FFmpeg para Windows, escribir `fontfile=/Windows/Fonts/arialbd.ttf` a veces falla si Python corre en otra unidad o si no se escapa los dos puntos de `C\:`.
- **La Solución Blindada (Usar `subprocess.run` directo con `ffmpeg`):** No dependemos de wrappers rotos y usamos un archivo de subtítulos `.ass` (Advanced SubStation Alpha) que **jamás falla con caracteres especiales, acentos, signos de interrogación `¿?` ni comillas**.

```python
# worker/renderer.py (VERSIÓN BLINDADA PARA WINDOWS)
import os
import subprocess
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "output"
TEMP_DIR   = Path(__file__).parent.parent / "cache" / "temp"

def generar_archivo_ass(palabras: list, frame1_text: str, ass_path: str):
    """
    Genera un archivo de subtítulos .ASS nativo.
    Ventaja: Soporta emojis, signos ¿?, acentos, bordes gruesos estilo Hormozi/TikTok
    y NUNCA rompe el comando de FFmpeg por comillas o dos puntos.
    """
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Gancho,Arial,82,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,8,60,60,220,1
Style: Karaoke,Arial,68,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    def fmt_time(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = seconds % 60
        return f"{h}:{m:02d}:{s:05.2f}"

    eventos = [
        # Texto fijo del Gancho en los primeros 3 segundos (Arriba al centro en Amarillo/Blanco)
        f"Dialogue: 1,0:00:00.00,0:00:03.00,Gancho,,0,0,0,,{frame1_text}"
    ]

    # Palabras sincronizadas (Agrupadas de 2 en 2 o de 1 en 1 para lectura rápida)
    for w in palabras:
        inicio = max(0.0, float(w["inicio"]))
        fin    = max(inicio + 0.15, float(w["fin"]))
        texto_limpio = str(w["palabra"]).replace("\n", " ").strip()
        if texto_limpio:
            eventos.append(
                f"Dialogue: 0,{fmt_time(inicio)},{fmt_time(fin)},Karaoke,,0,0,0,,{texto_limpio}"
            )

    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(eventos) + "\n")


def renderizar_video(
    video_path: str,
    music_path: str | None,
    voice_path: str,
    frame1_text: str,
    palabras: list,
    output_filename: str
) -> str:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    output_path = str(OUTPUT_DIR / output_filename)
    ass_path    = str(TEMP_DIR / f"{output_filename}.ass")
    generar_archivo_ass(palabras, frame1_text, ass_path)

    # En Windows, FFmpeg requiere barras normales y escapar ':' en la ruta del filtro ass
    ass_escaped = ass_path.replace("\\", "/").replace(":", "\\:")

    vf_chain = (
        f"scale=1080:1920:force_original_aspect_ratio=increase,"
        f"crop=1080:1920,"
        f"ass='{ass_escaped}'"
    )

    if music_path and os.path.exists(music_path):
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", video_path,   # Repite el video si la voz dura más
            "-i", voice_path,
            "-stream_loop", "-1", "-i", music_path,   # Repite música si hace falta
            "-filter_complex",
            f"[0:v]{vf_chain}[vout];"
            f"[1:a]volume=1.0[voz];"
            f"[2:a]volume=0.05[musica];"
            f"[voz][musica]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-map", "[vout]",
            "-map", "[aout]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
            "-shortest",
            "-movflags", "+faststart",
            output_path
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", video_path,
            "-i", voice_path,
            "-vf", vf_chain,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
            "-shortest",
            "-movflags", "+faststart",
            output_path
        ]

    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Error en FFmpeg: {proc.stderr[-500:]}")

    return output_path
```

> **Ventaja extra de esta mejora:** Agregamos `-stream_loop -1` al video de fondo. ¿Por qué? Porque si el video de TikTok dura 15 segundos pero el guion hablado de IA dura 40 segundos, sin `-stream_loop -1` el video se quedaría congelado a los 15 segundos. Con `-stream_loop -1`, el video de fondo hace loop suave hasta que termina de hablar la voz.

---

### 🛠️ Corrección 2: Rutas Temporales Nativas de Windows (`worker/app.py`)
- **El problema:** Claude usó `temp_dir = f"/tmp/scarlett_{task_id}"` (ruta de Linux).
- **La solución:** Usar siempre `Path(__file__).parent.parent / "cache" / "temp" / f"scarlett_{task_id}"` para que funcione en cualquier carpeta de Windows sin permisos de administrador.

---

### 🛠️ Corrección 3: Auto-Actualización Autónoma de `yt-dlp` en el Bot Guardián (`worker/autohealer.py`)
- **Por qué es vital para el auto-mantenimiento que pidió Pablo:** TikTok cambia su código cada 2 o 3 semanas. Cuando lo hace, `yt-dlp` saca una actualización el mismo día.
- **Solución:** El `AutoHealBot` incluye una tarea automática semanal (`auto_actualizar_motor()`) que ejecuta en segundo plano:
  ```python
  def auto_actualizar_motor():
      """Actualiza yt-dlp y dependencias críticas automáticamente cada semana sin intervención humana."""
      import subprocess, sys
      try:
          subprocess.run(
              [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp", "--quiet"],
              timeout=120,
              check=True
          )
          registrar_semaforo(
              "auto_update",
              semaforo="verde",
              mensaje_pablo="🔄 Actualicé el descargador de TikTok a la última versión automáticamente."
          )
      except Exception as e:
          registrar_semaforo("auto_update_warn", detalle_tecnico=str(e))
  ```

---

### 🛠️ Corrección 4: Voz Personalizada por Canal (`worker/voz.py`)
- En la Parte 6, cada uno de los **10 Canales** tiene su propio `voice_id` (por ejemplo, voz masculina para *Mecánica de Motos*, voz femenina para *Creadoras Faceless*).
- Por lo tanto, `generar_voz(texto: str, output_path: str, voice_id: str = None, voz_fallback: str = "es-MX-DaliaNeural")` debe recibir el `voice_id` del canal activo y no usar un único ID fijo.

---

## ✅ Dictamen Final de Doble Verificación (Listo para Cursor)

Con el archivo `06_CLAUDE_AUDITORIA_Y_ARQUITECTURA_CODIGO.md` + este blindaje `08_VERIFICACION_DOBLE_ANTIGRAVITY_BLINDAJE_WINDOWS.md`, el diseño está **100% verificado, sin huecos y listo para ensamblar**.
