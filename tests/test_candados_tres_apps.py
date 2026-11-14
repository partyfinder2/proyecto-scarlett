"""
test_candados_tres_apps.py — Test de integridad y candados de código
Verifica que las 3 aplicaciones (BabelDesk, Fábrica de Contenido, Rankings Scarlett)
mantengan intacta su superficie sellada sin degradaciones accidentales de calidad,
puertos, sincronización ni ventanas nativas.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RANKING_APP = ROOT / "ranking-app"
FABRICA = ROOT / "fabrica-de-contenido"
BABELDESK = ROOT / "babeldesk"


class TestCandadosRankingsScarlett(unittest.TestCase):
    """Verifica que Rankings Scarlett mantenga su calidad cinematográfica, SSE y ventana nativa."""

    def test_parametros_render_maxima_calidad(self):
        exportar_py = (RANKING_APP / "render" / "exportar.py").read_text(encoding="utf-8")
        self.assertIn('"15"', exportar_py, "El CRF debe mantenerse en 15 (máxima calidad).")
        self.assertIn("lanczos+accurate_rnd", exportar_py, "El escalador debe usar Lanczos de alta fidelidad.")
        self.assertIn("unsharp=5:5:0.5:5:5:0.0", exportar_py, "Debe tener afilado unsharp adaptativo.")
        self.assertIn("-tune", exportar_py, "Debe incluir -tune film.")
        self.assertIn("-c", exportar_py)
        self.assertIn("copy", exportar_py, "La concatenación debe usar stream copy (-c copy) sin pérdidas.")

    def test_rutas_api_y_sincronizacion_en_vivo(self):
        app_py = (RANKING_APP / "app.py").read_text(encoding="utf-8")
        self.assertIn("/api/proyecto/stream", app_py, "Falta endpoint SSE /api/proyecto/stream.")
        self.assertIn("/api/proyecto/version", app_py, "Falta endpoint /api/proyecto/version.")
        self.assertIn("/api/importar-y-guardar", app_py, "Falta endpoint /api/importar-y-guardar para BabelDesk.")
        self.assertIn("/api/proyecto/vaciar", app_py, "Falta endpoint /api/proyecto/vaciar.")
        self.assertIn("no-store, no-cache, must-revalidate", app_py, "Faltan cabeceras anti-caché en app.py.")

    def test_ventana_nativa_independiente_de_chrome(self):
        ventana_py = (RANKING_APP / "scripts" / "ventana_ranking.py").read_text(encoding="utf-8")
        # Asegurar que no se pase icon a create_window (provocaba TypeError en pywebview y caída a Chrome)
        self.assertNotIn(
            "create_window(\n            \"Rankings Scarlett\",\n            URL,\n            width=1380,\n            height=920,\n            min_size=(960, 640),\n            resizable=True,\n            text_select=True,\n            icon=",
            ventana_py,
            "create_window no debe recibir 'icon' directamente.",
        )
        self.assertIn('webview.start(gui="edgechromium", icon=ico)', ventana_py, "Debe iniciar WebView2 con su icono en webview.start().")
        self.assertIn("5002", ventana_py, "El puerto debe ser 5002.")

    def test_panel_front_sse(self):
        panel_js = (RANKING_APP / "panel" / "app.js").read_text(encoding="utf-8")
        self.assertIn("iniciarSSEProyecto", panel_js, "panel/app.js debe tener activo iniciarSSEProyecto.")
        self.assertIn("EventSource(\"/api/proyecto/stream\")", panel_js, "panel/app.js debe conectarse al stream SSE.")


class TestCandadosFabricaDeContenido(unittest.TestCase):
    """Verifica que la Fábrica de Contenido mantenga el puerto 5001, pestaña rankings y entrega a BabelDesk."""

    def test_puerto_y_endpoints_rankings(self):
        app_py = (FABRICA / "worker" / "app.py").read_text(encoding="utf-8")
        self.assertIn("/api/rankings", app_py, "Falta endpoint /api/rankings en worker/app.py.")
        self.assertIn("/api/rankings/{stem}/enviar-a-babeldesk", app_py, "Falta endpoint enviar a BabelDesk.")
        self.assertIn("entregar_ranking_en_inbox", app_py, "Debe usar la función entregar_ranking_en_inbox.")

    def test_modulo_entrega_babeldesk(self):
        entrega_py = (FABRICA / "worker" / "babeldesk_entrega.py").read_text(encoding="utf-8")
        self.assertIn("def entregar_ranking_en_inbox", entrega_py, "Falta función entregar_ranking_en_inbox.")
        self.assertIn("Downloads", entrega_py)
        self.assertIn("Inbox", entrega_py)

    def test_ventana_nativa_fabrica(self):
        ventana_py = (FABRICA / "scripts" / "ventana_fabrica.py").read_text(encoding="utf-8")
        self.assertIn('webview.start(gui="edgechromium", icon=ico)', ventana_py, "Fábrica debe usar WebView2 nativo.")
        self.assertIn("5001", ventana_py, "El puerto de Fábrica debe ser 5001.")


class TestCandadosBabelDesk(unittest.TestCase):
    """Verifica que BabelDesk mantenga descargas de alta resolución y puente con Rankings."""

    def test_descargas_alta_calidad_sin_bloqueo(self):
        dl_ts = (BABELDESK / "src" / "connectors" / "downloader.ts").read_text(encoding="utf-8")
        self.assertIn("bestvideo*", dl_ts, "Debe priorizar bestvideo* para descargar resolución nativa máxima sin cap artificial.")
        self.assertNotIn("[height<=1080]", dl_ts, "No debe tener límite artificial a 1080p para permitir recortes 9:16 nítidos.")

    def test_vigilante_inbox_json(self):
        watcher_ts = (BABELDESK / "src" / "main" / "inbox-watcher.ts").read_text(encoding="utf-8")
        self.assertIn(".json", watcher_ts, "inbox-watcher debe verificar archivos gemelos .json.")
        self.assertIn("title", watcher_ts, "inbox-watcher debe extraer el campo 'title' (gancho).")
        self.assertIn("caption", watcher_ts, "inbox-watcher debe extraer el campo 'caption'.")

    def test_puente_ranking_import(self):
        main_ts = (BABELDESK / "src" / "main" / "main.ts").read_text(encoding="utf-8")
        self.assertIn("ranking:import", main_ts, "Falta handler IPC ranking:import.")
        self.assertIn("5002", main_ts, "BabelDesk debe apuntar al puerto 5002 de Rankings Scarlett.")

        app_js = (BABELDESK / "src" / "renderer" / "app.js").read_text(encoding="utf-8")
        self.assertIn("enviarPathARanking", app_js, "Falta función enviarPathARanking en BabelDesk.")


if __name__ == "__main__":
    unittest.main(verbosity=2)
