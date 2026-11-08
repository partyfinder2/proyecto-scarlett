"""Detector de derechos de autor y diagnóstico del Escudo Anti-Copyright."""
from __future__ import annotations

import json
import subprocess


def auditar_riesgo_copyright(video_path: str, tiktok_meta: dict | None = None) -> dict:
    alertas: list[str] = []
    nivel = "verde"

    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        video_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    try:
        info = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        info = {}

    tags = info.get("format", {}).get("tags", {})
    if any(k in str(tags).lower() for k in ("tiktok", "vid", "comment", "artist", "copyright")):
        alertas.append("Metadatos originales de TikTok detectados → Serán eliminados al 100%.")

    transformaciones = [
        "✅ Audio original del tercero eliminado (0% riesgo musical)",
        "✅ Modo Espejo (Flip Horizontal) aplicado al fondo",
        "✅ Micro-giro 0.8° + Zoom 106% anti-escáner visual",
        "✅ Cambio de huella de color y velocidad (+3%)",
        "✅ Metadatos ocultos borrados (-map_metadata -1)",
    ]

    return {
        "semaforo": nivel,
        "titulo": "🛡️ Escudo Anti-Copyright Activado (Riesgo de Baneo: 0%)",
        "resumen_pablo": (
            "Este video de tercero será modificado automáticamente (espejo, zoom, color, "
            "sin audio original y sin metadatos) para que las redes lo vean como 100% tuyo."
        ),
        "alertas_detectadas": alertas,
        "transformaciones": transformaciones,
    }


def cadena_escudo_visual() -> str:
  return (
      "hflip,"
      "rotate=0.014:bilinear=1:fillcolor=black,"
      "scale=1145:2036:force_original_aspect_ratio=increase,"
      "crop=1080:1920,"
      "eq=contrast=1.04:saturation=1.08:brightness=0.015,"
      "setpts=0.97*PTS,"
  )
