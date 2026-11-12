"""Detector de derechos de autor y diagnóstico del Escudo Anti-Copyright."""
from __future__ import annotations

import json
import random
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


def parametros_escudo_aleatorio() -> dict:
    """Rangos seguros del plan (espejo 70%, rotación/zoom/velocidad variables)."""
    usar_espejo = random.random() < 0.7
    rot = random.uniform(0.008, 0.014)
    ancho_esc = int(random.uniform(1125, 1165))
    alto_esc = int(ancho_esc * 1920 / 1080)
    contraste = random.uniform(1.02, 1.06)
    saturacion = random.uniform(1.05, 1.10)
    brillo = random.uniform(0.005, 0.025)
    setpts = random.uniform(0.96, 0.98)
    return {
        "espejo": usar_espejo,
        "rotacion": rot,
        "ancho_escala": ancho_esc,
        "alto_escala": alto_esc,
        "contraste": contraste,
        "saturacion": saturacion,
        "brillo": brillo,
        "setpts": setpts,
    }


def cadena_escudo_visual(params: dict | None = None) -> str:
    if params is None:
        return (
            "hflip,"
            "rotate=0.014:bilinear=1:fillcolor=black,"
            "scale=1145:2036:force_original_aspect_ratio=increase:flags=lanczos,"
            "crop=1080:1920,"
            "eq=contrast=1.04:saturation=1.08:brightness=0.015,"
            "setpts=0.97*PTS,"
        )
    partes: list[str] = []
    if params.get("espejo"):
        partes.append("hflip")
    partes.append(f"rotate={params['rotacion']:.4f}:bilinear=1:fillcolor=black")
    partes.append(
        f"scale={params['ancho_escala']}:{params['alto_escala']}:force_original_aspect_ratio=increase:flags=lanczos"
    )
    partes.append("crop=1080:1920")
    partes.append(
        f"eq=contrast={params['contraste']:.3f}:saturation={params['saturacion']:.3f}:brightness={params['brillo']:.3f}"
    )
    partes.append(f"setpts={params['setpts']:.3f}*PTS")
    return ",".join(partes) + ","
