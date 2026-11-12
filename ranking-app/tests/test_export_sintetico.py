"""Módulo 7: export offline con 5 clips testsrc2 (Fill/Fit, 1 mudo, doble export)."""
from __future__ import annotations

import json
import subprocess
import sys
import time
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from render.ffmpeg_bin import resolver_ffmpeg, resolver_ffprobe
from render.exportar import ClipExport, OpcionesExport, exportar_ranking
from render.sting import asegurar_sting_default

CACHE = BASE / "cache" / "test_sintetico"
OUT = CACHE / "exports"
DUR = 4.5
TRIM_IN = 0.25
TRIM_OUT = 2.75
TRIM_LEN = TRIM_OUT - TRIM_IN
LABELS = ["Quinto", "Cuarto", "Tercero", "Segundo", "Primero"]


def _testsrc_clip(dest: Path, w: int, h: int, *, audio: bool = True) -> None:
    ffmpeg = resolver_ffmpeg()
    dest.parent.mkdir(parents=True, exist_ok=True)
    if audio:
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"testsrc2=size={w}x{h}:rate=30:duration={DUR}",
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=523:duration={DUR}",
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
        ]
    else:
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            f"testsrc2=size={w}x{h}:rate=30:duration={DUR}",
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(dest),
        ]
    subprocess.run(cmd, check=True, timeout=180)


def _probe_streams(ruta: Path) -> tuple[dict, dict, float]:
    proc = subprocess.run(
        [resolver_ffprobe(), "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(ruta)],
        capture_output=True,
        text=True,
        check=True,
        timeout=60,
    )
    data = json.loads(proc.stdout)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    audio = next(s for s in data["streams"] if s["codec_type"] == "audio")
    dur = float(data.get("format", {}).get("duration") or 0)
    return video, audio, dur


def _comprobar_export(ruta: Path, *, esperado_seg: float) -> None:
    video, audio, dur = _probe_streams(ruta)
    self_checks = []
    self_checks.append(video.get("width") == 1080)
    self_checks.append(video.get("height") == 1920)
    self_checks.append(video.get("pix_fmt") == "yuv420p")
    self_checks.append(video.get("codec_name") == "h264")
    self_checks.append(audio.get("codec_name") == "aac")
    fps = video.get("avg_frame_rate") or video.get("r_frame_rate", "0/1")
    n, d = fps.split("/")
    fps_f = float(n) / max(float(d), 1.0)
    self_checks.append(29.0 <= fps_f <= 31.0 or fps in ("30/1", "30/1001"))
    self_checks.append(abs(dur - esperado_seg) <= 0.15)
    if not all(self_checks):
        raise AssertionError(f"ffprobe falló en {ruta}: v={video}, a={audio}, dur={dur}")


def _clips_export(rutas: list[Path]) -> list[ClipExport]:
    return [
        ClipExport(
            path=str(p),
            label=LABELS[i],
            trim_in=TRIM_IN,
            trim_out=TRIM_OUT,
            keep_audio=False,
        )
        for i, p in enumerate(rutas)
    ]


class TestExportSintetico(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        CACHE.mkdir(parents=True, exist_ok=True)
        OUT.mkdir(parents=True, exist_ok=True)
        asegurar_sting_default()
        specs = [
            ("c16x9_a.mp4", 1280, 720, True),
            ("c9x16_b.mp4", 720, 1280, True),
            ("c9x16_c.mp4", 720, 1280, True),
            ("c9x16_d.mp4", 720, 1280, True),
            ("c9x16_mudo.mp4", 720, 1280, False),
        ]
        cls.rutas: list[Path] = []
        for nombre, w, h, aud in specs:
            dest = CACHE / nombre
            if not dest.is_file():
                _testsrc_clip(dest, w, h, audio=aud)
            cls.rutas.append(dest)

    def _exportar(self, framing: str) -> dict:
        opts = OpcionesExport(
            titulo="Top 5 sintético",
            preset="classic",
            accent="#FACC15",
            framing=framing,
            clips=_clips_export(self.rutas),
            usar_sting_en_cortes=False,
            output_dir=str(OUT),
        )
        return exportar_ranking(opts)

    def test_pipeline_fill_cinco_clips(self) -> None:
        res = self._exportar("fill")
        self.assertTrue(res["ok"])
        self.assertEqual(res["orden_puestos"], [5, 4, 3, 2, 1])
        ruta = Path(res["output_path"])
        self.assertTrue(ruta.is_file())
        esperado = TRIM_LEN * 5
        _comprobar_export(ruta, esperado_seg=esperado)

    def test_pipeline_fit_cinco_clips(self) -> None:
        sub = OUT / "fit"
        sub.mkdir(parents=True, exist_ok=True)
        opts = OpcionesExport(
            titulo="Top 5 fit",
            preset="neon",
            accent="#4a9eff",
            framing="fit",
            clips=_clips_export(self.rutas),
            usar_sting_en_cortes=False,
            output_dir=str(sub),
        )
        res = exportar_ranking(opts)
        self.assertTrue(res["ok"])
        _comprobar_export(Path(res["output_path"]), esperado_seg=TRIM_LEN * 5)

    def test_segundo_export_no_pisa_el_primero(self) -> None:
        sub = OUT / "doble"
        sub.mkdir(parents=True, exist_ok=True)
        opts = OpcionesExport(
            titulo="Doble export",
            clips=_clips_export(self.rutas),
            usar_sting_en_cortes=False,
            output_dir=str(sub),
        )
        r1 = exportar_ranking(opts)
        time.sleep(1.1)
        r2 = exportar_ranking(opts)
        p1 = Path(r1["output_path"])
        p2 = Path(r2["output_path"])
        self.assertNotEqual(p1, p2)
        self.assertTrue(p1.is_file())
        self.assertTrue(p2.is_file())
        _comprobar_export(p1, esperado_seg=TRIM_LEN * 5)
        _comprobar_export(p2, esperado_seg=TRIM_LEN * 5)
        self.assertGreaterEqual(p2.stat().st_size, 10_000)
        self.assertGreaterEqual(p1.stat().st_size, 10_000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
