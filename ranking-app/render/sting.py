"""Sting built-in (~0.25 s) sin dependencias de red."""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STING_PATH = BASE_DIR / "assets" / "sting_default.wav"


def asegurar_sting_default() -> Path:
    STING_PATH.parent.mkdir(parents=True, exist_ok=True)
    if STING_PATH.is_file() and STING_PATH.stat().st_size > 500:
        return STING_PATH

    rate = 44100
    duracion = 0.25
    n_frames = int(rate * duracion)
    freq = 880.0

    with wave.open(str(STING_PATH), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        for i in range(n_frames):
            t = i / rate
            env = math.exp(-t * 18.0)
            sample = int(32767 * 0.55 * env * math.sin(2 * math.pi * freq * t))
            wf.writeframes(struct.pack("<h", sample))

    return STING_PATH
