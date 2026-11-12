"""Módulo 5: FastAPI en :5002 (TestClient)."""
from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))

from fastapi.testclient import TestClient  # noqa: E402

from app import app  # noqa: E402
from proyecto import ULTIMO_PROYECTO, ClipProyecto, ProyectoRanking  # noqa: E402


class TestModulo5App(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.clip_a = BASE / "cache" / "test_modulo3" / "c1.mp4"
        cls.clip_b = BASE / "cache" / "test_modulo3" / "c2.mp4"
        cls.clip_c = BASE / "cache" / "test_modulo3" / "c3.mp4"
        if not cls.clip_a.is_file():
            raise unittest.SkipTest("Faltan clips de test_modulo3; corre test_exportar_modulo3 antes.")

    def setUp(self) -> None:
        self.client = TestClient(app)
        self._inbox = tempfile.mkdtemp(prefix="ranking_inbox_")
        self._env_prev = os.environ.get("BABELDESK_INBOX")
        os.environ["BABELDESK_INBOX"] = self._inbox
        self._proyecto_prev = (
            ULTIMO_PROYECTO.read_text(encoding="utf-8") if ULTIMO_PROYECTO.is_file() else None
        )

    def tearDown(self) -> None:
        if self._proyecto_prev is None:
            if ULTIMO_PROYECTO.is_file():
                ULTIMO_PROYECTO.unlink()
        else:
            ULTIMO_PROYECTO.write_text(self._proyecto_prev, encoding="utf-8")
        if self._env_prev is None:
            os.environ.pop("BABELDESK_INBOX", None)
        else:
            os.environ["BABELDESK_INBOX"] = self._env_prev

    def test_health(self) -> None:
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("status"), "ok")

    def test_importar_overlay_export_y_babeldesk(self) -> None:
        r = self.client.post("/api/importar", json={"paths": [str(self.clip_a)]})
        self.assertEqual(r.status_code, 200)
        imp = r.json()
        self.assertTrue(imp["ok"])
        self.assertEqual(len(imp["clips"]), 1)
        clip_meta = imp["clips"][0]

        r2 = self.client.post(
            "/api/overlay-preview",
            json={
                "title": "Top 3 test",
                "preset": "classic",
                "accent": "#FACC15",
                "clip_index": 0,
                "clips": [
                    {"label": "Tercero"},
                    {"label": "Segundo"},
                    {"label": "Primero"},
                ],
            },
        )
        self.assertEqual(r2.status_code, 200)
        self.assertTrue(r2.headers["content-type"].startswith("image/png"))

        proyecto = ProyectoRanking(
            title="Top 3 test",
            clips=[
                ClipProyecto(
                    id="t1",
                    path=str(self.clip_a),
                    label="Tercero",
                    trim_in=0.0,
                    trim_out=2.5,
                ),
                ClipProyecto(
                    id="t2",
                    path=str(self.clip_b),
                    label="Segundo",
                    trim_in=0.0,
                    trim_out=2.5,
                ),
                ClipProyecto(
                    id="t3",
                    path=str(self.clip_c),
                    label="Primero",
                    trim_in=0.0,
                    trim_out=2.5,
                ),
            ],
        )
        rp = self.client.post("/api/proyecto", json=proyecto.model_dump(mode="json", by_alias=True))
        self.assertEqual(rp.status_code, 200)

        re = self.client.post("/api/exportar", json={"proyecto": proyecto.model_dump(mode="json", by_alias=True)})
        self.assertEqual(re.status_code, 200)
        job_id = re.json()["job_id"]

        resultado = None
        for _ in range(240):
            est = self.client.get(f"/api/exportar/estado/{job_id}")
            self.assertEqual(est.status_code, 200)
            job = est.json()
            if job.get("done"):
                resultado = job
                break
            time.sleep(0.5)

        self.assertIsNotNone(resultado)
        self.assertTrue(resultado.get("ok"), resultado.get("error"))
        mp4 = resultado["result"]["output_path"]
        self.assertTrue(Path(mp4).is_file())

        rb = self.client.post(
            "/api/enviar-a-babeldesk",
            json={"mp4_path": mp4, "proyecto": proyecto.model_dump(mode="json", by_alias=True)},
        )
        self.assertEqual(rb.status_code, 200, rb.text)
        data = rb.json()
        self.assertTrue(data["ok"])
        self.assertTrue(Path(data["mp4"]).is_file())
        self.assertTrue(Path(data["json"]).is_file())

        # miniatura de import sirve
        mid = clip_meta["id"]
        rm = self.client.get(f"/api/miniatura/{mid}")
        self.assertEqual(rm.status_code, 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
