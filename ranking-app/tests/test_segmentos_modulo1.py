"""
Criterio de aceptación Módulo 1:
1 clip 16:9 con audio + 1 clip 9:16 sin audio → ffprobe confirma 1080×1920, 30 fps, yuv420p, AAC.
"""
from __future__ import annotations

import json
import subprocess
import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from render.ffmpeg_bin import resolver_ffmpeg, resolver_ffprobe
from render.segmentos import inspeccionar_clip, normalizar_segmento

CACHE = BASE / "cache" / "test_modulo1"


def _generar_clip_16x9_con_audio(destino: Path) -> None:
    ffmpeg = resolver_ffmpeg()
    destino.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:s=1280x720:d=6:r=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=6",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "44100",
            str(destino),
        ],
        check=True,
        timeout=120,
    )


def _generar_clip_9x16_sin_audio(destino: Path) -> None:
    ffmpeg = resolver_ffmpeg()
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=green:s=720x1280:d=5:r=24",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(destino),
        ],
        check=True,
        timeout=120,
    )


def _ffprobe_streams(ruta: Path) -> dict:
    proc = subprocess.run(
        [
            resolver_ffprobe(),
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            str(ruta),
        ],
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )
    return json.loads(proc.stdout)


class TestModulo1Segmentos(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        CACHE.mkdir(parents=True, exist_ok=True)
        cls.src_audio = CACHE / "origen_16x9_audio.mp4"
        cls.src_mudo = CACHE / "origen_9x16_mudo.mp4"
        if not cls.src_audio.exists():
            _generar_clip_16x9_con_audio(cls.src_audio)
        if not cls.src_mudo.exists():
            _generar_clip_9x16_sin_audio(cls.src_mudo)

    def test_inspeccion_detecta_audio(self) -> None:
        a = inspeccionar_clip(str(self.src_audio))
        m = inspeccionar_clip(str(self.src_mudo))
        self.assertTrue(a["tiene_audio"])
        self.assertFalse(m["tiene_audio"])
        self.assertGreater(a["duracion"], 4.0)

    def test_normalizar_con_audio_fill(self) -> None:
        out = CACHE / "seg_fill_audio.mp4"
        normalizar_segmento(
            str(self.src_audio),
            str(out),
            trim_in=0.5,
            trim_out=4.5,
            framing="fill",
            keep_audio=True,
        )
        self._assert_salida_vertical(out)

    def test_normalizar_sin_audio_fit(self) -> None:
        out = CACHE / "seg_fit_mudo.mp4"
        meta_in = inspeccionar_clip(str(self.src_mudo))
        self.assertFalse(meta_in["tiene_audio"])
        normalizar_segmento(
            str(self.src_mudo),
            str(out),
            trim_in=0.0,
            trim_out=4.0,
            framing="fit",
            keep_audio=False,
        )
        self._assert_salida_vertical(out)

    def _assert_salida_vertical(self, path: Path) -> None:
        info = _ffprobe_streams(path)
        video = next(s for s in info["streams"] if s["codec_type"] == "video")
        audio = next(s for s in info["streams"] if s["codec_type"] == "audio")
        self.assertEqual(int(video["width"]), 1080)
        self.assertEqual(int(video["height"]), 1920)
        self.assertEqual(video.get("pix_fmt"), "yuv420p")
        rate = video.get("r_frame_rate", "0/1")
        num, den = rate.split("/")
        fps = float(num) / max(float(den), 1.0)
        self.assertTrue(29.0 <= fps <= 31.0, f"fps={fps}")
        self.assertEqual(audio.get("codec_name"), "aac")


if __name__ == "__main__":
    unittest.main(verbosity=2)
