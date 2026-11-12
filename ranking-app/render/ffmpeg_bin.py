"""Localiza ffmpeg/ffprobe en PATH o WinGet Links."""
from __future__ import annotations

import os
import shutil
from pathlib import Path


def _buscar_en_winget(nombre: str) -> str | None:
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        return None
    candidato = Path(local) / "Microsoft" / "WinGet" / "Links" / f"{nombre}.exe"
    if candidato.is_file():
        return str(candidato)
    return None


def resolver_ffmpeg() -> str:
    ruta = shutil.which("ffmpeg") or _buscar_en_winget("ffmpeg")
    if not ruta:
        raise RuntimeError(
            "No encontré ffmpeg en tu PC. Instálalo con winget install Gyan.FFmpeg "
            "o agrégalo al PATH."
        )
    return ruta


def resolver_ffprobe() -> str:
    ruta = shutil.which("ffprobe") or _buscar_en_winget("ffprobe")
    if not ruta:
        raise RuntimeError(
            "No encontré ffprobe en tu PC. Viene con FFmpeg; revisa la instalación."
        )
    return ruta
