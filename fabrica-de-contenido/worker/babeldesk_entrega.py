"""Fase B: copia atómica de lote listo → BabelDesk Inbox."""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from .consultas import BASE_DIR, anotar

INBOX_DEFAULT = Path.home() / "Downloads" / "BabelDesk" / "Inbox"


def ruta_inbox_babeldesk() -> Path:
    custom = (os.environ.get("BABELDESK_INBOX") or "").strip()
    if custom:
        return Path(custom)
    local = BASE_DIR / "data" / "babeldesk_inbox.txt"
    if local.exists():
        linea = local.read_text(encoding="utf-8").strip()
        if linea:
            return Path(linea)
    return INBOX_DEFAULT


def _copia_atomica(origen: Path, destino_dir: Path, nombre_final: str) -> Path:
    destino_dir.mkdir(parents=True, exist_ok=True)
    final = destino_dir / nombre_final
    tmp = destino_dir / f"{nombre_final}.tmp"
    shutil.copy2(origen, tmp)
    if final.exists():
        final.unlink()
    tmp.replace(final)
    return final


def entregar_lote_en_inbox(
    mp4_path: str,
    miniatura_path: str | None,
    json_payload: dict,
    lote_id: int,
) -> dict:
    stem = f"lote-{lote_id}-{Path(mp4_path).stem.split('_')[-1]}"
    inbox = ruta_inbox_babeldesk()
    if not inbox.parent.exists():
        return {
            "ok": False,
            "error": f"No existe la carpeta padre de Inbox: {inbox.parent}",
            "inbox": str(inbox),
        }

    mp4_out = _copia_atomica(Path(mp4_path), inbox, f"{stem}.mp4")
    jpg_out = None
    if miniatura_path and Path(miniatura_path).exists():
        jpg_out = _copia_atomica(Path(miniatura_path), inbox, f"{stem}.jpg")
    json_path = inbox / f"{stem}.json"
    tmp_json = inbox / f"{stem}.json.tmp"
    tmp_json.write_text(json.dumps(json_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    if json_path.exists():
        json_path.unlink()
    tmp_json.replace(json_path)

    anotar(
        "health_check",
        "verde",
        f"📤 Lote #{lote_id} entregado en BabelDesk Inbox.",
        str(mp4_out),
    )
    return {
        "ok": True,
        "inbox": str(inbox),
        "mp4": str(mp4_out),
        "jpg": str(jpg_out) if jpg_out else None,
        "json": str(json_path),
    }
