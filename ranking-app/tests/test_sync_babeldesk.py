"""El autoguardado del panel no puede borrar clips que BabelDesk ya guardó."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from fastapi.testclient import TestClient  # noqa: E402

from app import _REV_PATH, app  # noqa: E402
from proyecto import ULTIMO_PROYECTO  # noqa: E402


def _clip(n: int) -> dict:
    return {
        "id": f"c{n}",
        "path": f"C:/clips/{n}.mp4",
        "label": f"Clip {n}",
        "trimIn": 0,
        "trimOut": 2,
    }


class TestSyncBabelDesk(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self._proyecto_prev = (
            ULTIMO_PROYECTO.read_text(encoding="utf-8") if ULTIMO_PROYECTO.is_file() else None
        )
        self._rev_prev = _REV_PATH.read_text(encoding="utf-8") if _REV_PATH.is_file() else None
        if ULTIMO_PROYECTO.is_file():
            ULTIMO_PROYECTO.unlink()
        if _REV_PATH.is_file():
            _REV_PATH.unlink()

    def tearDown(self) -> None:
        if self._proyecto_prev is None:
            if ULTIMO_PROYECTO.is_file():
                ULTIMO_PROYECTO.unlink()
        else:
            ULTIMO_PROYECTO.parent.mkdir(parents=True, exist_ok=True)
            ULTIMO_PROYECTO.write_text(self._proyecto_prev, encoding="utf-8")
        if self._rev_prev is None:
            if _REV_PATH.is_file():
                _REV_PATH.unlink()
        else:
            _REV_PATH.write_text(self._rev_prev, encoding="utf-8")

    def test_panel_vacio_no_pisa_import_y_el_html_no_se_cachea(self) -> None:
        alta = self.client.post("/api/proyecto", json={"title": "T", "clips": [_clip(1)]})
        self.assertEqual(alta.status_code, 200)
        self.assertEqual(alta.json()["clips"], 1)
        self.assertEqual(alta.json()["revision"], 1)

        viejo = self.client.post(
            "/api/proyecto",
            json={"title": "T", "clips": [], "revision": 0},
        )
        self.assertEqual(viejo.status_code, 409)
        self.assertEqual(len(viejo.json()["proyecto"]["clips"]), 1)
        self.assertEqual(len(self.client.get("/api/proyecto").json()["clips"]), 1)

        legado = self.client.post("/api/proyecto", json={"title": "T", "clips": []})
        self.assertEqual(legado.status_code, 409)
        self.assertEqual(self.client.get("/api/proyecto/version").json()["clips"], 1)

        rev = self.client.get("/api/proyecto/version").json()["revision"]
        borrado = self.client.post(
            "/api/proyecto",
            json={"title": "T", "clips": [], "revision": rev, "vaciar": True},
        )
        self.assertEqual(borrado.status_code, 200)
        self.assertEqual(self.client.get("/api/proyecto/version").json()["clips"], 0)

        rev = self.client.get("/api/proyecto/version").json()["revision"]
        dos = self.client.post(
            "/api/proyecto",
            json={"title": "T", "clips": [_clip(1), _clip(2)], "revision": rev},
        )
        self.assertEqual(dos.status_code, 200)
        pisar = self.client.post(
            "/api/proyecto",
            json={"title": "T", "clips": [_clip(9)], "revision": rev},
        )
        self.assertEqual(pisar.status_code, 409)
        self.assertEqual(len(self.client.get("/api/proyecto").json()["clips"]), 2)

        pagina = self.client.get("/")
        self.assertEqual(pagina.status_code, 200)
        self.assertIn("no-store", pagina.headers.get("cache-control", ""))
        self.assertIn("Sincronizar", pagina.text)
        js = self.client.get("/static/app.js")
        self.assertEqual(js.status_code, 200)
        self.assertIn("revisionServidor", js.text)
        self.assertIn("no-store", js.headers.get("cache-control", ""))
        salud = self.client.get("/health")
        self.assertEqual(salud.json().get("build"), "2026-11-13-sync1")


if __name__ == "__main__":
    unittest.main()
