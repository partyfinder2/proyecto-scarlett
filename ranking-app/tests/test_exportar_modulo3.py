"""Módulo 3: export 3 segmentos (#3→#2→#1), ffprobe y cancelación."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from render.ffmpeg_bin import resolver_ffmpeg, resolver_ffprobe
from render.exportar import (
    ClipExport,
    ExportSession,
    OpcionesExport,
    cancelar_export,
    exportar_ranking,
    obtener_sesion,
)
from render.sting import asegurar_sting_default

CACHE = BASE / "cache" / "test_modulo3"


def _clip_color(dest: Path, color: str, d: float = 2.8) -> None:
    ffmpeg = resolver_ffmpeg()
    dest.parent.mkdir(parents=True, exist_ok=True)
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
            f"color=c={color}:s=1280x720:d={d}:r=30",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency={(440 + hash(color) % 200)}:duration={d}",
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "44100",
            str(dest),
        ],
        check=True,
        timeout=120,
    )


def _probe(ruta: Path) -> dict:
    proc = subprocess.run(
        [resolver_ffprobe(), "-v", "error", "-print_format", "json", "-show_streams", str(ruta)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout)


class TestModulo3Exportar(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        CACHE.mkdir(parents=True, exist_ok=True)
        cls.c1 = CACHE / "c1.mp4"
        cls.c2 = CACHE / "c2.mp4"
        cls.c3 = CACHE / "c3.mp4"
        if not cls.c1.exists():
            _clip_color(cls.c1, "red", 3.0)
            _clip_color(cls.c2, "green", 3.0)
            _clip_color(cls.c3, "blue", 3.0)
        asegurar_sting_default()

    def test_export_tres_segmentos(self) -> None:
        out_dir = CACHE / "exports"
        opts = OpcionesExport(
            titulo="Top 3 prueba",
            preset="classic",
            accent="#FACC15",
            framing="fill",
            clips=[
                ClipExport(str(self.c1), "Tercero", 0.0, 2.5, keep_audio=True),
                ClipExport(str(self.c2), "Segundo", 0.0, 2.5, keep_audio=True),
                ClipExport(str(self.c3), "Primero", 0.0, 2.5, keep_audio=True),
            ],
            usar_sting_en_cortes=False,
            output_dir=str(out_dir),
        )
        res = exportar_ranking(opts)
        self.assertTrue(res["ok"])
        self.assertEqual(res["orden_puestos"], [3, 2, 1])
        esperado = 7.5
        self.assertAlmostEqual(sum(res["duraciones"]), esperado, delta=0.05)

        ruta = Path(res["output_path"])
        self.assertTrue(ruta.is_file())
        info = _probe(ruta)
        v = next(s for s in info["streams"] if s["codec_type"] == "video")
        a = next(s for s in info["streams"] if s["codec_type"] == "audio")
        self.assertEqual(v["codec_name"], "h264")
        self.assertEqual(v.get("pix_fmt"), "yuv420p")
        self.assertEqual(a["codec_name"], "aac")
        rate = v.get("r_frame_rate", "0/1")
        num, den = rate.split("/")
        fps = float(num) / max(float(den), 1.0)
        self.assertTrue(29.0 <= fps <= 31.0)

    def test_cancelacion_limpia(self) -> None:
        ses = ExportSession()
        tmp = Path(tempfile.mkdtemp(prefix="rank_cancel_"))
        parcial = tmp / "parcial.mp4"
        parcial.write_bytes(b"00")
        ses.salida_parcial = parcial
        ses.temp_dir = tmp
        ses.solicitar_cancelacion()
        ses.limpiar_parcial()
        self.assertFalse(parcial.exists())
        cancelar_export("no-existe")  # no lanza


if __name__ == "__main__":
    unittest.main(verbosity=2)
