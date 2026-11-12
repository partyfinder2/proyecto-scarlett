"""Control de calidad pre-entrega (semáforo 🟢🟡🔴) sin apps externas — ffprobe + ffmpeg."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


def _hamming(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 99
    return sum(1 for x, y in zip(a, b) if x != y)


def calcular_phash_frame(video_path: str, segundo: float = 3.0) -> str:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(segundo),
        "-i",
        video_path,
        "-vframes",
        "1",
        "-vf",
        "scale=8:8,format=gray",
        "-f",
        "rawvideo",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, timeout=60)
    buf = proc.stdout
    if len(buf) < 64:
        return ""
    pixels = list(buf[:64])
    avg = sum(pixels) / len(pixels)
    return "".join("1" if p > avg else "0" for p in pixels)


def _ffprobe_json(video_path: str) -> dict:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        video_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    try:
        return json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return {}


def detectar_negro_inicio(video_path: str, segundos: float = 2.5) -> bool:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-t",
        str(segundos),
        "-i",
        video_path,
        "-vf",
        "blackdetect=d=0.12:pix_th=0.12",
        "-an",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    salida = (proc.stderr or "") + (proc.stdout or "")
    return "black_start" in salida.lower()


def medir_volumen_medio_db(video_path: str) -> float | None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        video_path,
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    salida = (proc.stderr or "") + (proc.stdout or "")
    m = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", salida)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def auditar_video_salida(
    video_path: str,
    phash_historial: list[str] | None = None,
    min_bytes: int = 1_000_000,
) -> dict:
    """Devuelve semaforo: verde | amarillo | rojo + lista de checks."""
    path = Path(video_path)
    checks: list[dict] = []
    rojo = False
    amarillo = False

    if not path.exists():
        return {"semaforo": "rojo", "checks": [{"nombre": "archivo", "ok": False, "detalle": "no existe"}], "phash": ""}

    size = path.stat().st_size
    ok_size = size >= min_bytes
    checks.append({"nombre": "tamaño", "ok": ok_size, "detalle": f"{size // 1024} KB"})
    if not ok_size:
        rojo = True

    info = _ffprobe_json(video_path)
    dur = 0.0
    try:
        dur = float(info.get("format", {}).get("duration") or 0)
    except (TypeError, ValueError):
        dur = 0.0
    ok_dur = 10.0 <= dur <= 90.0
    checks.append({"nombre": "duración", "ok": ok_dur, "detalle": f"{dur:.1f}s (máx Reel 90s)"})
    if not ok_dur:
        rojo = True

    ancho = alto = 0
    pix_ok = True
    tiene_audio = False
    for st in info.get("streams") or []:
        if st.get("codec_type") == "video":
            ancho = int(st.get("width") or 0)
            alto = int(st.get("height") or 0)
            pix = (st.get("pix_fmt") or "").lower()
            if pix and pix != "yuv420p":
                pix_ok = False
        if st.get("codec_type") == "audio":
            tiene_audio = True
    checks.append({"nombre": "pix_fmt", "ok": pix_ok, "detalle": "yuv420p" if pix_ok else "formato no compatible"})
    if not pix_ok:
        rojo = True
    ok_res = alto >= 1280 and ancho >= 720
    checks.append({"nombre": "resolución", "ok": ok_res, "detalle": f"{ancho}x{alto}"})
    if not ok_res:
        rojo = True

    checks.append({"nombre": "audio", "ok": tiene_audio, "detalle": "presente" if tiene_audio else "ausente"})
    if not tiene_audio:
        rojo = True

    vol = medir_volumen_medio_db(video_path) if tiene_audio else None
    vol_ok = vol is not None and vol > -42.0
    checks.append(
        {
            "nombre": "volumen_voz",
            "ok": vol_ok,
            "detalle": f"{vol:.1f} dB" if vol is not None else "sin medición",
        }
    )
    if not vol_ok:
        rojo = True

    if "demo" in path.name.lower():
        checks.append({"nombre": "origen_demo", "ok": False, "detalle": "archivo de demostración"})
        rojo = True

    negro = detectar_negro_inicio(video_path)
    checks.append({"nombre": "inicio_negro", "ok": not negro, "detalle": "detectado" if negro else "ok"})
    if negro:
        amarillo = True

    phash = calcular_phash_frame(video_path, 3.0)
    checks.append({"nombre": "phash", "ok": bool(phash), "detalle": phash[:16] + "…" if phash else "vacío"})
    if not phash:
        amarillo = True

    similar = False
    historial = phash_historial or []
    for prev in historial[-30:]:
        if prev and phash and _hamming(prev, phash) <= 8:
            similar = True
            break
    checks.append({"nombre": "similitud_reciente", "ok": not similar, "detalle": "muy parecido al anterior" if similar else "ok"})
    if similar:
        amarillo = True

    if rojo:
        sem = "rojo"
    elif amarillo:
        sem = "amarillo"
    else:
        sem = "verde"

    return {"semaforo": sem, "checks": checks, "phash": phash}
