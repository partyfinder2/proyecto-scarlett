"""Descarga vertical (yt-dlp) + caché + cookies opcionales."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from urllib.parse import urlparse

import requests
import yt_dlp

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = BASE_DIR / "cache" / "videos"
AUDIO_CACHE = BASE_DIR / "cache" / "music"
FALLBACK_MUSIC = BASE_DIR / "assets" / "music_fallback"

ULTIMO_ERROR_DESCARGA = ""


def _cookies_file() -> str | None:
    candidatos = [
        BASE_DIR / "data" / "cookies.txt",
        BASE_DIR / "data" / "yt_cookies.txt",
    ]
    env = (os.environ.get("YTDLP_COOKIES") or "").strip()
    if env:
        candidatos.insert(0, Path(env))
    for p in candidatos:
        if p.is_file() and p.stat().st_size > 32:
            return str(p)
    return None


def _referer(url: str) -> str:
    u = url.lower()
    if "instagram.com" in u:
        return "https://www.instagram.com/"
    if "facebook.com" in u or "fb.watch" in u:
        return "https://www.facebook.com/"
    if "youtube.com" in u or "youtu.be" in u:
        return "https://www.youtube.com/"
    return "https://www.tiktok.com/"


def download_url_video(url: str) -> str | None:
    """Descarga genérica TikTok / IG / YT / FB."""
    return download_tiktok_sin_marca(url)


def download_tiktok_sin_marca(url: str) -> str | None:
    global ULTIMO_ERROR_DESCARGA
    ULTIMO_ERROR_DESCARGA = ""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.md5(url.encode()).hexdigest()
    output_path = CACHE_DIR / f"{cache_key}.mp4"

    if output_path.exists() and output_path.stat().st_size > 50_000:
        return str(output_path)

    host = urlparse(url).netloc.lower()
    ydl_opts = {
        "outtmpl": str(output_path.with_suffix("")) + ".%(ext)s",
        "format": "bestvideo[height<=1920][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": _referer(url),
        },
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "extractor_retries": 2,
        "noplaylist": True,
    }
    cookies = _cookies_file()
    if cookies:
        ydl_opts["cookiefile"] = cookies

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        if output_path.exists() and output_path.stat().st_size > 50_000:
            return str(output_path)
        candidatos = [
            p for p in CACHE_DIR.glob(f"{cache_key}.*") if p.suffix.lower() in (".mp4", ".webm", ".mkv")
        ]
        if candidatos:
            return str(candidatos[0])
        ULTIMO_ERROR_DESCARGA = "yt-dlp terminó sin crear archivo mp4"
        return None
    except Exception as e:
        ULTIMO_ERROR_DESCARGA = f"{type(e).__name__}: {str(e)[:200]} (host={host})"
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
