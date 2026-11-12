# worker/broll_finder.py
from __future__ import annotations

import os
from pathlib import Path

import requests

CACHE_VIDEOS = Path(__file__).resolve().parent.parent / "cache" / "videos"


def pexels_api_key() -> str:
    return (os.environ.get("PEXELS_API_KEY") or "").strip()

KEYWORDS_POR_NICHO = {
    "mecanica": "motorcycle repair workshop mechanic vertical",
    "creadoras": "luxury lifestyle night aesthetic neon woman silhouette",
    "finanzas": "money counting luxury car stock market city night",
    "ia_tools": "futuristic technology artificial intelligence coding matrix",
    "reposteria": "cake decorating chocolate pouring pastry chef",
    "resina": "epoxy resin art glitter pouring craft",
    "cripto": "bitcoin crypto trading screens gold",
    "fitness": "gym workout fitness training vertical",
}


def obtener_video_fondo_automatico(nicho: str) -> str | None:
    """Descarga un vertical HD libre de derechos desde Pexels si hay API key."""
    api_key = pexels_api_key()
    if not api_key:
        return None

    CACHE_VIDEOS.mkdir(parents=True, exist_ok=True)
    query = KEYWORDS_POR_NICHO.get(nicho, "luxury aesthetic vertical")

    resp = requests.get(
        "https://api.pexels.com/videos/search",
        headers={"Authorization": api_key},
        params={"query": query, "orientation": "portrait", "size": "medium", "per_page": 15},
        timeout=15,
    )
    if resp.status_code != 200:
        return None

    videos = resp.json().get("videos", [])
    for v in videos:
        vid_id = str(v["id"])
        out_path = CACHE_VIDEOS / f"pexels_{vid_id}.mp4"
        if out_path.exists():
            return str(out_path)

        archivos = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4"]
        if not archivos:
            continue
        mejor = sorted(archivos, key=lambda x: abs((x.get("height") or 0) - 1920))[0]
        r_vid = requests.get(mejor["link"], timeout=20, stream=True)
        with out_path.open("wb") as f:
            for chunk in r_vid.iter_content(8192):
                f.write(chunk)
        return str(out_path)

    return None
