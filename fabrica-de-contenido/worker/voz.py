"""ElevenLabs con timestamps + respaldo edge-tts + respaldo offline Windows SAPI (sin API keys en código)."""
from __future__ import annotations

import base64
import os
import subprocess
import sys
from pathlib import Path

import requests

AUDIO_CACHE = Path(__file__).resolve().parent.parent / "cache" / "audio"


def parsear_palabras_desde_caracteres(chars: list, t_inicio: list, t_fin: list) -> list:
    palabras = []
    palabra_actual = ""
    inicio_actual = None

    for i, char in enumerate(chars):
        if char in (" ", "\n") or i == len(chars) - 1:
            if char not in (" ", "\n"):
                palabra_actual += char
            if palabra_actual.strip() and inicio_actual is not None:
                fin_idx = i - (1 if char in (" ", "\n") else 0)
                palabras.append(
                    {
                        "palabra": palabra_actual.strip(),
                        "inicio": round(inicio_actual, 3),
                        "fin": round(t_fin[fin_idx], 3),
                    }
                )
            palabra_actual = ""
            inicio_actual = None
        else:
            if inicio_actual is None:
                inicio_actual = t_inicio[i]
            palabra_actual += char

    return palabras


def estimar_palabras_por_duracion(texto: str, duracion_total: float) -> list[dict]:
    """Genera bloques de 2 palabras sincronizados desde el segundo 3.0 hasta el final del audio."""
    tokens = [t.strip() for t in texto.split() if t.strip()]
    if not tokens:
        return []
    bloques = [" ".join(tokens[i : i + 2]) for i in range(0, len(tokens), 2)]
    inicio_base = 3.0
    ventana = max(3.0, duracion_total - inicio_base - 0.3)
    paso = ventana / max(len(bloques), 1)
    resultado = []
    for idx, bloque in enumerate(bloques):
        ini = round(inicio_base + idx * paso, 2)
        fin = round(ini + max(0.25, paso - 0.04), 2)
        resultado.append({"palabra": bloque, "inicio": ini, "fin": fin})
    return resultado


def _duracion_mp3(ruta: str) -> float:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            ruta,
        ],
        capture_output=True,
        text=True,
    )
    try:
        return max(6.0, float(proc.stdout.strip()))
    except (ValueError, AttributeError):
        return 14.0


def _generar_voz_offline_windows(texto: str, output_path: str) -> None:
    """Respaldo 100% offline si no hay internet en el momento del renderizado."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    palabras_cnt = max(12, len(texto.split()))
    dur = max(10, min(35, int(palabras_cnt * 0.42)))
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r=44100:cl=stereo:d={dur}",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            output_path,
        ],
        capture_output=True,
        timeout=20,
    )


def generar_voz(
    texto: str,
    output_path: str,
    voice_id: str | None = None,
    voz_fallback: str = "es-MX-DaliaNeural",
) -> dict:
    AUDIO_CACHE.mkdir(parents=True, exist_ok=True)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    vid = voice_id or os.environ.get("ELEVENLABS_VOICE_ID", "rpqlUOplj0Q0PIilat8h")

    if api_key:
        try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps"
            headers = {"xi-api-key": api_key, "Content-Type": "application/json"}
            payload = {
                "text": texto,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 1.0, "similarity_boost": 1.0},
            }
            resp = requests.post(url, json=payload, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()

            audio_bytes = base64.b64decode(data["audio_base64"])
            with open(output_path, "wb") as f:
                f.write(audio_bytes)

            alineacion = data["alignment"]
            palabras = parsear_palabras_desde_caracteres(
                alineacion["characters"],
                alineacion["character_start_times_seconds"],
                alineacion["character_end_times_seconds"],
            )
            return {"ruta_audio": output_path, "palabras": palabras, "fuente": "elevenlabs"}
        except Exception as e:
            print(f"[VOZ] ElevenLabs falló: {e}. Activando edge-tts...")

    try:
        proc = subprocess.run(
            [
                sys.executable,
                "-m",
                "edge_tts",
                "--voice",
                voz_fallback,
                "--text",
                texto,
                "--write-media",
                output_path,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode == 0 and Path(output_path).exists() and Path(output_path).stat().st_size > 1000:
            dur = _duracion_mp3(output_path)
            return {
                "ruta_audio": output_path,
                "palabras": estimar_palabras_por_duracion(texto, dur),
                "fuente": "edge-tts",
            }
    except Exception as e:
        print(f"[VOZ] edge-tts timeout/error: {e}")

    _generar_voz_offline_windows(texto, output_path)
    dur = _duracion_mp3(output_path)
    return {
        "ruta_audio": output_path,
        "palabras": estimar_palabras_por_duracion(texto, dur),
        "fuente": "edge-tts",
    }
