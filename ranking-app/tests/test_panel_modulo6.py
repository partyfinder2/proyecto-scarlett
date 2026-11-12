"""Módulo 6: panel HTML sirve las 3 zonas."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402


class TestModulo6Panel(unittest.TestCase):
    def test_index_tres_zonas(self) -> None:
        client = TestClient(app)
        r = client.get("/")
        self.assertEqual(r.status_code, 200)
        html = r.text
        self.assertIn("Tu ranking", html)
        self.assertIn("Vista previa 9:16", html)
        self.assertIn("Estilo y exportar", html)
        self.assertIn("/static/app.js", html)

    def test_lanzadores_existen(self) -> None:
        self.assertTrue((BASE / "arrancar_ranking.bat").is_file())
        self.assertTrue((BASE / "scripts" / "abrir_ranking.vbs").is_file())


if __name__ == "__main__":
    unittest.main(verbosity=2)
