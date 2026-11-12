"""Módulo 1 — inspección ffprobe y normalización de cada segmento a 1080×1920."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from .ffmpeg_bin import resolver_ffmpeg, resolver_ffprobe


class ErrorSegmento(RuntimeError):
    """Error legible para Pablo."""


def inspeccionar_clip(ruta: str) -> dict:
    """
    Lee metadatos básicos con ffprobe.
    Devuelve: duracion, width, height, tiene_audio, codec, pix_fmt, fps.
    """
    path = Path(ruta)
    if not path.is_file():
        raise ErrorSegmento(f"No encuentro el archivo de video: {path}")

    cmd = [
        resolver_ffprobe(),
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if proc.returncode != 0:
        raise ErrorSegmento(
            f"No pude leer ese video ({path.name}). "
            f"Asegúrate de que sea MP4, MOV o WebM válido. Detalle: {(proc.stderr or '')[-200:]}"
        )

    try:
        info = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as e:
        raise ErrorSegmento(f"ffprobe no devolvió datos válidos para {path.name}.") from e

    duracion = 0.0
    try:
        duracion = float(info.get("format", {}).get("duration") or 0)
    except (TypeError, ValueError):
        duracion = 0.0

    width = height = 0
    codec = ""
    pix_fmt = ""
    fps = 0.0
    tiene_audio = False

    for st in info.get("streams") or []:
        if st.get("codec_type") == "video" and not width:
            width = int(st.get("width") or 0)
            height = int(st.get("height") or 0)
            codec = str(st.get("codec_name") or "")
            pix_fmt = str(st.get("pix_fmt") or "")
            rate = st.get("r_frame_rate") or "0/1"
            if "/" in rate:
                num, den = rate.split("/", 1)
                try:
                    fps = float(num) / max(float(den), 1.0)
                except ValueError:
                    fps = 0.0
        if st.get("codec_type") == "audio":
            tiene_audio = True

    return {
        "ruta": str(path.resolve()),
        "duracion": round(duracion, 3),
        "width": width,
        "height": height,
        "tiene_audio": tiene_audio,
        "codec": codec,
        "pix_fmt": pix_fmt,
        "fps": round(fps, 3),
    }


def _cadena_video_framing(framing: str) -> str:
    f = (framing or "fill").lower()
    if f == "fit":
        return (
            "scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,"
            "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,"
            "fps=30,format=yuv420p,setsar=1"
        )
    return (
        "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,"
        "fps=30,format=yuv420p,setsar=1"
    )


def normalizar_segmento(
    ruta_entrada: str,
    ruta_salida: str,
    trim_in: float,
    trim_out: float,
    framing: str = "fill",
    keep_audio: bool = True,
) -> str:
    """
    Recorta y normaliza un clip a MP4 intermedio 1080×1920, 30 fps, yuv420p.
    Si no hay audio o keep_audio=False, inyecta silencio stereo 44.1 kHz.
    """
    entrada = Path(ruta_entrada)
    salida = Path(ruta_salida)
    if not entrada.is_file():
        raise ErrorSegmento(f"No encuentro el clip de entrada: {entrada}")

    duracion = float(trim_out) - float(trim_in)
    if duracion <= 0.2:
        raise ErrorSegmento("El recorte es demasiado corto. Ajusta inicio y fin (mínimo 0.2 s).")
    if duracion > 60.0:
        raise ErrorSegmento("Cada puesto debe durar 60 s o menos. Recorta el clip antes de exportar.")

    meta = inspeccionar_clip(str(entrada))
    usar_audio_origen = bool(keep_audio and meta["tiene_audio"])
    vf = _cadena_video_framing(framing)
    salida.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = resolver_ffmpeg()

    if usar_audio_origen:
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            str(trim_in),
            "-i",
            str(entrada),
            "-t",
            str(duracion),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "256k",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(salida),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    else:
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            str(trim_in),
            "-i",
            str(entrada),
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r=44100:cl=stereo:d={duracion}",
            "-t",
            str(duracion),
            "-filter_complex",
            f"[0:v]{vf}[v]",
            "-map",
            "[v]",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "256k",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-shortest",
            "-movflags",
            "+faststart",
            str(salida),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)

    if proc.returncode != 0 or not salida.is_file():
        raise ErrorSegmento(
            f"FFmpeg no pudo normalizar el segmento. Detalle: {(proc.stderr or '')[-400:]}"
        )

    out_meta = inspeccionar_clip(str(salida))
    if out_meta["width"] != 1080 or out_meta["height"] != 1920:
        raise ErrorSegmento("El segmento no quedó en formato vertical 1080×1920.")
    if out_meta["pix_fmt"] and out_meta["pix_fmt"] != "yuv420p":
        raise ErrorSegmento(f"Formato de píxel inesperado: {out_meta['pix_fmt']}")
    if not out_meta["tiene_audio"]:
        raise ErrorSegmento("El segmento quedó sin pista de audio.")

    return str(salida.resolve())
