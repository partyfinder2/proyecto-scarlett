"""Ventana propia con WebView2 (sin pestañas de Chrome). Arranca el worker si hace falta."""
from __future__ import annotations

import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
SCRIPTS_ROOT = BASE.parent / "scripts"
if SCRIPTS_ROOT.is_dir() and str(SCRIPTS_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_ROOT))
ICON = BASE / "assets" / "fabrica.ico"
PORT = "5001"
BASE_URL = f"http://127.0.0.1:{PORT}"
HEALTH = f"{BASE_URL}/health"
URL = f"{BASE_URL}/?v={int(time.time())}"


def _health() -> bool:
    try:
        with urllib.request.urlopen(HEALTH, timeout=1.5) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def _python() -> str:
    return sys.executable


def _ensure_server() -> None:
    if _health():
        return
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    subprocess.Popen(
        [_python(), "-m", "uvicorn", "worker.app:app", "--host", "127.0.0.1", "--port", PORT],
        cwd=str(BASE),
        creationflags=flags,
    )
    for _ in range(60):
        if _health():
            return
        time.sleep(0.25)
    raise RuntimeError("Fábrica de Contenido no respondió en el puerto 5001.")


def _abrir_navegador_app() -> None:
    """Respaldo de emergencia si falla WebView2 nativo: usa Edge en modo ventana limpia (sin pestañas)."""
    edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
    if not edge.is_file():
        edge = Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe")
    if not edge.is_file():
        edge = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    if not edge.is_file():
        raise RuntimeError("No encuentro Edge ni Chrome para abrir el panel.")
    perfil = Path.home() / "AppData" / "Local" / "FabricaDeContenido" / "perfil"
    perfil.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(edge),
        f"--app={URL}",
        f"--user-data-dir={perfil}",
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1380,920",
    ]
    subprocess.Popen(cmd, cwd=str(BASE))


def main() -> None:
    _ensure_server()
    try:
        import webview
        from icono_windows import icono_para_ventana

        ico = icono_para_ventana("Scarlett.FabricaContenido.1", ICON)
        webview.create_window(
            "Fábrica de Contenido",
            URL,
            width=1380,
            height=920,
            min_size=(960, 640),
            resizable=True,
            text_select=True,
        )
        webview.start(gui="edgechromium", icon=ico)
    except Exception:
        _abrir_navegador_app()


if __name__ == "__main__":
    main()
