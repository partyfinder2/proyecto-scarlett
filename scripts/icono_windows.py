"""Icono en la barra de tareas de Windows para ventanas pywebview."""
from __future__ import annotations

import sys
from pathlib import Path


def icono_para_ventana(app_id: str, ruta_ico: Path) -> str | None:
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
        except Exception:
            pass
    if ruta_ico.is_file():
        return str(ruta_ico.resolve())
    return None
