"""Módulo 4: guardar/cargar JSON y validación de trims."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from proyecto import (  # noqa: E402
    ClipProyecto,
    ErrorProyecto,
    ProyectoRanking,
    cargar_proyecto,
    guardar_proyecto,
    validar_para_exportar,
)


class TestModulo4Proyecto(unittest.TestCase):
    def test_guardar_y_recargar_conserva_estado(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            ruta = Path(td) / "proyecto_test.json"
            clips = [
                ClipProyecto(
                    id="a",
                    path="C:/clips/tercero.mp4",
                    label="Tercero",
                    trim_in=1.0,
                    trim_out=6.5,
                    keep_audio=True,
                ),
                ClipProyecto(
                    id="b",
                    path="C:/clips/segundo.mp4",
                    label="Segundo",
                    trim_in=0.5,
                    trim_out=4.0,
                    keep_audio=False,
                ),
                ClipProyecto(
                    id="c",
                    path="C:/clips/primero.mp4",
                    label="Primero",
                    trim_in=2.0,
                    trim_out=8.0,
                    keep_audio=False,
                ),
            ]
            original = ProyectoRanking(
                title="Top 3 prueba",
                preset="neon",
                accent="#00FFAA",
                framing="fit",
                clips=clips,
            )
            guardar_proyecto(original, ruta)
            cargado = cargar_proyecto(ruta)

            self.assertEqual(cargado.title, original.title)
            self.assertEqual(cargado.preset, "neon")
            self.assertEqual(cargado.accent, "#00FFAA")
            self.assertEqual(cargado.framing, "fit")
            self.assertEqual(len(cargado.clips), 3)
            self.assertEqual([c.label for c in cargado.clips], ["Tercero", "Segundo", "Primero"])
            self.assertAlmostEqual(cargado.clips[0].trim_in, 1.0)
            self.assertAlmostEqual(cargado.clips[0].trim_out, 6.5)
            self.assertTrue(cargado.clips[0].keep_audio)
            self.assertFalse(cargado.clips[1].keep_audio)

            # JSON en disco usa camelCase del handoff
            texto = ruta.read_text(encoding="utf-8")
            self.assertIn('"trimIn"', texto)
            self.assertIn('"keepAudio"', texto)

    def test_rechaza_clip_mas_de_60_segundos(self) -> None:
        proyecto = ProyectoRanking(
            title="Top 2",
            clips=[
                ClipProyecto(id="1", path="x.mp4", label="Bueno", trim_in=0, trim_out=10),
                ClipProyecto(id="2", path="y.mp4", label="Largo", trim_in=0, trim_out=65),
                ClipProyecto(id="3", path="z.mp4", label="Ok", trim_in=0, trim_out=5),
            ],
        )
        with self.assertRaises(ErrorProyecto) as ctx:
            validar_para_exportar(proyecto)
        msg = str(ctx.exception)
        self.assertIn("Largo", msg)
        self.assertIn("60", msg)
        self.assertIn("recort", msg.lower())

    def test_rechaza_recorte_demasiado_corto(self) -> None:
        proyecto = ProyectoRanking(
            clips=[
                ClipProyecto(id="1", path="a.mp4", label="A", trim_in=0, trim_out=5),
                ClipProyecto(id="2", path="b.mp4", label="Corto", trim_in=1, trim_out=1.1),
                ClipProyecto(id="3", path="c.mp4", label="C", trim_in=0, trim_out=4),
            ],
        )
        with self.assertRaises(ErrorProyecto) as ctx:
            validar_para_exportar(proyecto)
        self.assertIn("Corto", str(ctx.exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
