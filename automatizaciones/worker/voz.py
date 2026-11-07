"""ElevenLabs con timestamps + respaldo edge-tts (sin API keys en código)."""
from __future__ import annotations

import asyncio
import base64
import os
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


def _texto_completo_para_voz(spoken_hook: str, body_aida: str, closing_phrase: str) -> str:
    return f"{spoken_hook} {body_aida} {closing_phrase}".strip()


def generar_voz(
    texto: str,
    output_path: str,
    voice_id: str | None = None,
    voz_fallback: str = "es-MX-DaliaNeural",
) -> dict:
    AUDIO_CACHE.mkdir(parents=True, exist_ok=True)
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
            resp = requests.post(url, json=payload, headers=headers, timeout=60)
            resp.raise_for_status()
            data = resp.json()

            audio_bytes = base64.b64decode(data["audio_base64"])
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
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
        import edge_tts

        async def _generar() -> None:
            communicate = edge_tts.Communicate(texto, voice=voz_fallback)
            await communicate.save(output_path)

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        asyncio.run(_generar())
        return {"ruta_audio": output_path, "palabras": [], "fuente": "edge-tts"}
    except Exception as e:
        raise RuntimeError(f"Ambos motores de voz fallaron: {e}") from e
