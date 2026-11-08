# worker/renderer.py — VERSIÓN DEFINITIVA (Grok): ASS, ffprobe -t, amix normalize=0, Escudo opcional
from __future__ import annotations

import subprocess
from pathlib import Path

from .copyright_shield import cadena_escudo_visual

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"
TEMP_DIR = Path(__file__).resolve().parent.parent / "cache" / "temp"


def obtener_duracion_audio(voice_path: str) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        voice_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return round(float(proc.stdout.strip()) + 0.3, 2)
    except (ValueError, AttributeError):
        return 45.0


def generar_archivo_ass(palabras: list, frame1_text: str, ass_path: str) -> None:
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Gancho,Arial,80,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,8,60,60,220,1
Style: Karaoke,Arial,66,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    def fmt_time(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = seconds % 60
        return f"{h}:{m:02d}:{s:05.2f}"

    texto_f1_limpio = str(frame1_text).replace("{", "").replace("}", "").replace("\n", "\\N")
    eventos = [f"Dialogue: 1,0:00:00.00,0:00:03.00,Gancho,,0,0,0,,{texto_f1_limpio}"]

    for w in palabras:
        inicio = float(w["inicio"])
        fin = max(inicio + 0.15, float(w["fin"]))
        if fin <= 3.0:
            continue
        inicio_seguro = max(3.0, inicio)
        texto_limpio = str(w["palabra"]).replace("{", "").replace("}", "").replace("\n", " ").strip()
        if texto_limpio:
            eventos.append(
                f"Dialogue: 0,{fmt_time(inicio_seguro)},{fmt_time(fin)},Karaoke,,0,0,0,,{texto_limpio}"
            )

    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(eventos) + "\n")


def renderizar_video(
    video_path: str,
    music_path: str | None,
    voice_path: str,
    frame1_text: str,
    palabras: list,
    output_filename: str,
    anti_copyright: bool = True,
) -> str:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    output_path = str(OUTPUT_DIR / output_filename)
    ass_path = str(TEMP_DIR / f"{output_filename}.ass")
    duracion_voz = obtener_duracion_audio(voice_path)

    generar_archivo_ass(palabras, frame1_text, ass_path)

    ass_escaped = ass_path.replace("\\", "/").replace(":", "\\:")
    fonts_dir = "C\\:/Windows/Fonts"

    base_video = (
        cadena_escudo_visual()
        if anti_copyright
        else "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
    )
    vf_chain = f"{base_video}ass='{ass_escaped}':fontsdir='{fonts_dir}'"

    meta_args = ["-map_metadata", "-1", "-fflags", "+bitexact"]

    if music_path and Path(music_path).exists():
        cmd = [
            "ffmpeg",
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            video_path,
            "-i",
            voice_path,
            "-stream_loop",
            "-1",
            "-i",
            music_path,
            "-filter_complex",
            f"[0:v]{vf_chain}[vout];"
            f"[1:a]volume=1.0[voz];"
            f"[2:a]volume=0.05[musica];"
            f"[voz][musica]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]",
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            *meta_args,
            "-t",
            str(duracion_voz),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "44100",
            "-movflags",
            "+faststart",
            output_path,
        ]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            video_path,
            "-i",
            voice_path,
            "-filter_complex",
            f"[0:v]{vf_chain}[vout]",
            "-map",
            "[vout]",
            "-map",
            "1:a:0",
            *meta_args,
            "-t",
            str(duracion_voz),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "44100",
            "-movflags",
            "+faststart",
            output_path,
        ]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(f"Error en FFmpeg: {proc.stderr[-800:]}")

    # Borrar .ass suelto tras éxito
    try:
        Path(ass_path).unlink(missing_ok=True)
    except OSError:
        pass

    return output_path
