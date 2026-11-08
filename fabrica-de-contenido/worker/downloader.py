"""Descarga TikTok sin marca de agua + caché local en cache/videos/."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

import requests
import yt_dlp

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / "cache" / "videos"
AUDIO_CACHE = BASE_DIR / "cache" / "music"
FALLBACK_MUSIC = BASE_DIR / "assets" / "music_fallback"


def download_tiktok_sin_marca(url: str) -> str | None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.md5(url.encode()).hexdigest()
    output_path = CACHE_DIR / f"{cache_key}.mp4"

    if output_path.exists():
        return str(output_path)

    ydl_opts = {
        "outtmpl": str(output_path.with_suffix("")) + ".%(ext)s",
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.tiktok.com/",
        },
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 10,
        "retries": 1,
        "fragment_retries": 1,
        "extractor_retries": 1,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        if output_path.exists():
            return str(output_path)
        # yt-dlp puede usar otra extensión
        candidatos = list(CACHE_DIR.glob(f"{cache_key}.*"))
        return str(candidatos[0]) if candidatos else None
    except Exception:
        return None


def download_audio_fondo(url: str | None) -> str | None:
    if not url:
        return _musica_respaldo_aleatoria()

    AUDIO_CACHE.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.md5(url.encode()).hexdigest()
    output_path = AUDIO_CACHE / f"{cache_key}.mp3"

    if output_path.exists():
        return str(output_path)

    try:
        resp = requests.get(url, timeout=10, stream=True)
        resp.raise_for_status()
        with output_path.open("wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        return str(output_path)
    except Exception:
        return _musica_respaldo_aleatoria()


def _musica_respaldo_aleatoria() -> str | None:
    if not FALLBACK_MUSIC.exists():
        return None
    mp3s = list(FALLBACK_MUSIC.glob("*.mp3"))
    if not mp3s:
        return None
    import random

    return str(random.choice(mp3s))
