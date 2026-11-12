"""Commit 2: gancho inicial suma duración; presets gold exportables."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from render.exportar import ClipExport, OpcionesExport, exportar_ranking
from tests.test_export_sintetico import (  # noqa: E402
    OUT,
    TRIM_IN,
    TRIM_LEN,
    TRIM_OUT,
    TestExportSintetico,
    _comprobar_export,
)

CACHE = BASE / "cache" / "test_commit2"


class TestCommit2(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        TestExportSintetico.setUpClass()
        cls.rutas = TestExportSintetico.rutas
        CACHE.mkdir(parents=True, exist_ok=True)

    def test_hook_suma_duracion(self) -> None:
        clips = [
            ClipExport(str(p), f"C{i}", TRIM_IN, TRIM_OUT, id=f"id{i}")
            for i, p in enumerate(self.rutas[:3])
        ]
        sin_hook = OpcionesExport(
            titulo="Sin hook",
            clips=clips,
            usar_sting_en_cortes=False,
            output_dir=str(CACHE / "sin_hook"),
        )
        con_hook = OpcionesExport(
            titulo="Con hook",
            clips=clips,
            hook_enabled=True,
            hook_clip_id="id2",
            hook_seconds=1.5,
            usar_sting_en_cortes=False,
            output_dir=str(CACHE / "con_hook"),
        )
        r0 = exportar_ranking(sin_hook)
        r1 = exportar_ranking(con_hook)
        base = TRIM_LEN * 3
        _comprobar_export(Path(r0["output_path"]), esperado_seg=base)
        _comprobar_export(Path(r1["output_path"]), esperado_seg=base + 1.5)

    def test_preset_gold_export(self) -> None:
        clips = [
            ClipExport(str(self.rutas[0]), "A", TRIM_IN, TRIM_OUT, id="a"),
            ClipExport(str(self.rutas[1]), "B", TRIM_IN, TRIM_OUT, id="b"),
            ClipExport(str(self.rutas[2]), "C", TRIM_IN, TRIM_OUT, id="c"),
        ]
        res = exportar_ranking(
            OpcionesExport(
                titulo="Gold test",
                preset="gold",
                clips=clips,
                usar_sting_en_cortes=False,
                output_dir=str(CACHE / "gold"),
            )
        )
        self.assertTrue(res["ok"])
        _comprobar_export(Path(res["output_path"]), esperado_seg=TRIM_LEN * 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
