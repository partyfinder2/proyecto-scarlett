"""Criterio Módulo 2: PNG RGBA 1080×1920 classic + neon con título, número y etiqueta."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from render.overlay import frase_lista, generar_overlay_png

CACHE = BASE / "cache" / "test_modulo2"

PUESTOS = [(5, "ChatGPT"), (4, "Claude"), (3, "Gemini"), (2, "Grok"), (1, "Cursor")]


class TestModulo2Overlay(unittest.TestCase):
    def test_classic_png(self) -> None:
        out = CACHE / "overlay_classic.png"
        generar_overlay_png(
            out,
            titulo_ranking="Top 5 herramientas de IA",
            numero_puesto=3,
            nombre_puesto="Gemini",
            todos_los_puestos=PUESTOS,
            preset="classic",
            accent="#FACC15",
        )
        self._assert_overlay_valido(out)


    def test_gold_png(self) -> None:
        out = CACHE / "overlay_gold.png"
        generar_overlay_png(
            out,
            titulo_ranking="Top oro",
            numero_puesto=2,
            nombre_puesto="Oro",
            todos_los_puestos=PUESTOS,
            preset="gold",
            accent="#D4AF37",
        )
        self._assert_overlay_valido(out)


    def test_clean_png(self) -> None:
        out = CACHE / "overlay_clean.png"
        generar_overlay_png(
            out,
            titulo_ranking="Top limpio",
            numero_puesto=4,
            nombre_puesto="Clean",
            todos_los_puestos=PUESTOS,
            preset="clean",
            accent="#FFFFFF",
        )
        self._assert_overlay_valido(out)


    def test_neon_png(self) -> None:
        out = CACHE / "overlay_neon.png"
        generar_overlay_png(
            out,
            titulo_ranking="Top 5 herramientas de IA",
            numero_puesto=1,
            nombre_puesto="Cursor",
            todos_los_puestos=PUESTOS,
            preset="neon",
            accent="#4A9EFF",
        )
        self._assert_overlay_valido(out)


    def _assert_overlay_valido(self, path: Path) -> None:
        self.assertTrue(path.is_file(), "no se creó el PNG")
        self.assertGreater(path.stat().st_size, 8000, "PNG demasiado pequeño")
        img = Image.open(path)
        self.assertEqual(img.size, (1080, 1920))
        self.assertEqual(img.mode, "RGBA")

        def max_alpha(caja: tuple[int, int, int, int]) -> int:
            trozo = img.crop(caja)
            return max(p[3] for p in trozo.getdata())

        self.assertGreater(max_alpha((80, 90, 1000, 240)), 0, "título no visible en overlay")
        self.assertGreater(max_alpha((20, 300, 170, 900)), 0, "lista izquierda no visible")
        self.assertEqual(max_alpha((420, 400, 980, 1700)), 0, "el centro del video debe quedar limpio")

    def test_frase_vacia_si_es_archivo(self) -> None:
        self.assertEqual(frase_lista(None, "twitter-2120581067350425720-a-bdct62lu"), "")
        self.assertEqual(frase_lista("", "Primero"), "")
        self.assertEqual(frase_lista(None, "Primero"), "Primero")
        self.assertEqual(frase_lista("w sound", "twitter-archivo-largo"), "w sound")

    def test_revelado_no_escribe_el_centro(self) -> None:
        out = CACHE / "overlay_archivo.png"
        generar_overlay_png(
            out,
            titulo_ranking="Top *peores* [sonidos] {del} año",
            numero_puesto=5,
            nombre_puesto="twitter-2120581067350425720-a",
            todos_los_puestos=[
                (5, "twitter-2120581067350425720-a"),
                (4, ""),
                (3, "Gemini"),
                (2, "Grok"),
                (1, "Cursor"),
            ],
            preset="classic",
        )
        self._assert_overlay_valido(out)

    def test_titulo_largo_no_corta_segunda_linea(self) -> None:
        from PIL import ImageDraw
        from render.overlay import FUENTES, _cargar_fuente, _lineas_titulo, _segmentos_titulo

        img = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        segs = _segmentos_titulo("los videos mas divertidos de con ia")
        font = _cargar_fuente(FUENTES["titulo"], 54)
        lineas = _lineas_titulo(draw, segs, font, 970)
        texto_final = " ".join(t.strip() for ln in lineas for t, _ in ln)
        self.assertIn("IA", texto_final)
        self.assertLessEqual(len(lineas), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
