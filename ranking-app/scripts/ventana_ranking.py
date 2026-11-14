"""Abre Rankings Scarlett en ventana nativa (WebView2) contra 127.0.0.1:5002."""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BASE_URL = "http://127.0.0.1:5002"
HEALTH = BASE_URL + "/health"
BUILD_ESPERADO = "2026-11-13-sync1"
LOG = Path.home() / "AppData" / "Local" / "RankingApp" / "launcher.log"


def _log(msg: str) -> None:
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        line = time.strftime("%Y-%m-%d %H:%M:%S") + "  " + msg + "\n"
        with LOG.open("a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass


def avisar(texto: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, texto, "Rankings Scarlett", 0x30)
    else:
        print(texto, file=sys.stderr)


def leer_salud() -> dict | None:
    try:
        with urllib.request.urlopen(HEALTH, timeout=1.5) as resp:
            if resp.status != 200:
                return None
            data = json.loads(resp.read().decode("utf-8"))
            return data if isinstance(data, dict) else None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def pids_en_5002() -> list[int]:
    if sys.platform != "win32":
        return []
    try:
        out = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    encontrados: list[int] = []
    for linea in out.stdout.splitlines():
        if "LISTENING" not in linea.upper() or ":5002" not in linea:
            continue
        partes = linea.split()
        if not partes or not partes[-1].isdigit():
            continue
        pid = int(partes[-1])
        if pid and pid not in encontrados:
            encontrados.append(pid)
    return encontrados


def cerrar_servidor_viejo() -> None:
    for pid in pids_en_5002():
        subprocess.run(
            ["taskkill", "/F", "/PID", str(pid)],
            capture_output=True,
            text=True,
            check=False,
        )
    for _ in range(20):
        if leer_salud() is None:
            return
        time.sleep(0.25)


def asegurar_servidor() -> None:
    salud = leer_salud()
    if salud and salud.get("build") == BUILD_ESPERADO:
        return
    if salud is not None:
        avisar(
            "Había un Rankings viejo en el puerto 5002. Lo cierro y abro la versión que sí sincroniza con BabelDesk."
        )
        cerrar_servidor_viejo()
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "5002"],
        cwd=str(BASE),
        creationflags=flags,
    )
    for _ in range(50):
        salud = leer_salud()
        if salud and salud.get("status") == "ok":
            if salud.get("build") != BUILD_ESPERADO:
                avisar(
                    "El puerto 5002 sigue con código viejo. Cierra todas las ventanas de Rankings y ábrelo de nuevo."
                )
            return
        time.sleep(0.25)
    avisar("Rankings no respondió en el puerto 5002. Revisa que Python y las dependencias estén instaladas.")
    raise SystemExit(1)


def url_panel() -> str:
    return f"{BASE_URL}/?v={int(time.time())}"


def abrir_chrome(url: str, motivo: str) -> None:
    avisar("No pude abrir la ventana nativa (" + motivo + "). Abro Chrome sin caché.")
    candidatos = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    ]
    exe = next((p for p in candidatos if p.is_file()), None)
    if exe is None:
        avisar("Tampoco encontré Chrome ni Edge.")
        return
    perfil = Path.home() / "AppData" / "Local" / "RankingApp" / "perfil"
    subprocess.Popen(
        [
            str(exe),
            f"--app={url}",
            f"--user-data-dir={perfil}",
            "--disable-http-cache",
            "--no-first-run",
            "--no-default-browser-check",
        ]
    )


def main() -> None:
    _log("main() inicio")
    try:
        asegurar_servidor()
        url = url_panel()
        ico = BASE / "assets" / "ranking_app.ico"
        try:
            import webview
        except ImportError:
            _log("ImportError: pywebview")
            abrir_chrome(url, "falta pywebview")
            return
        webview.create_window(
            "Rankings Scarlett",
            url,
            width=1280,
            height=860,
            min_size=(980, 640),
        )
        _log("create_window OK, webview.start…")
        try:
            if ico.is_file():
                webview.start(gui="edgechromium", icon=str(ico))
            else:
                webview.start(gui="edgechromium")
        except TypeError as exc:
            if "icon" not in str(exc):
                _log("TypeError: " + str(exc))
                abrir_chrome(url, str(exc))
                return
            webview.start(gui="edgechromium")
        _log("webview cerrado con normalidad")
    except SystemExit:
        raise
    except Exception as exc:
        _log("ERROR: " + repr(exc))
        avisar("Error al abrir Rankings Scarlett:\n\n" + str(exc) + "\n\nLog:\n" + str(LOG))
        raise


if __name__ == "__main__":
    main()