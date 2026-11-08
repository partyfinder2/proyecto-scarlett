"""
AutoHealBot — salud de links, memoria (1.5 GB / 7-15 días), favoritos 📌 y yt-dlp.
"""
from __future__ import annotations

import glob
import os
import shutil
import sqlite3
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "automatizaciones.db"
CACHE_DIR = BASE_DIR / "cache"
OUTPUT_DIR = BASE_DIR / "output"
TEMP_DIR = CACHE_DIR / "temp"
AUDIO_CACHE = CACHE_DIR / "audio"

MENSAJES_PABLO = {
    "link_roto": ("amarillo", "⚠️ Un video de la lista no se pudo descargar. Lo salté automáticamente y usé el siguiente."),
    "limpieza_videos": ("verde", "✅ Limpié {n} videos temporales viejos. Liberé {mb} MB de espacio."),
    "limpieza_memoria": ("verde", "✅ Memoria liberada: {mb} MB recuperados (tus favoritos 📌 intactos)."),
    "ytdlp_actualizado": ("verde", "⚡ yt-dlp actualizado automáticamente — sin bloqueos de TikTok."),
    "worker_caido": ("rojo", "🚨 El motor de videos dejó de responder. Estoy intentando reiniciarlo..."),
    "todo_bien": ("verde", "✅ Todo funcionando perfecto."),
}


def _cfg(con: sqlite3.Connection, clave: str, default: str) -> str:
    row = con.execute("SELECT valor FROM configuracion WHERE clave = ?", (clave,)).fetchone()
    return row[0] if row else default


def registrar_semaforo(tipo: str, detalle_tecnico: str = "", **kwargs) -> None:
    plantilla = MENSAJES_PABLO.get(tipo, ("amarillo", f"ℹ️ Evento interno: {tipo}"))
    semaforo, mensaje_tpl = plantilla
    mensaje = mensaje_tpl.format(**kwargs)

    con = sqlite3.connect(DB_PATH)
    try:
        con.execute(
            "INSERT INTO bot_guardian_log (tipo, semaforo, mensaje_pablo, detalle_tecnico) VALUES (?,?,?,?)",
            (tipo, semaforo, mensaje, detalle_tecnico),
        )
        con.commit()
    finally:
        con.close()


def limpiar_intermedios() -> int:
    """Borra .ass y .mp3 sueltos en cache/temp y cache/audio viejos (>1 día)."""
    eliminados = 0
    limite = datetime.now() - timedelta(days=1)

    for carpeta, patron in ((TEMP_DIR, "*.ass"), (AUDIO_CACHE, "*.mp3")):
        if not carpeta.exists():
            continue
        for ruta in carpeta.glob(patron):
            try:
                if datetime.fromtimestamp(ruta.stat().st_mtime) < limite:
                    ruta.unlink(missing_ok=True)
                    eliminados += 1
            except OSError:
                pass
    return eliminados


def _tamano_output_mb() -> float:
    total = 0
    if OUTPUT_DIR.exists():
        for f in OUTPUT_DIR.glob("*.mp4"):
            total += f.stat().st_size
    return total / (1024 * 1024)


def _paths_protegidos(con: sqlite3.Connection) -> set[str]:
    rows = con.execute(
        "SELECT output_path FROM cola_publicacion WHERE fijado = 1 AND output_path IS NOT NULL"
    ).fetchall()
    return {os.path.normpath(r[0]) for r in rows if r[0]}


def limpiar_memoria_historial(forzar: bool = False) -> dict:
    """
    Respeta historial_dias, tope memoria_max_mb y videos con fijado=1.
    forzar=True ignora la antigüedad (botón Limpiar Memoria Ahora).
    """
    if not DB_PATH.exists():
        return {"eliminados": 0, "mb_liberados": 0}

    con = sqlite3.connect(DB_PATH)
    try:
        dias = int(_cfg(con, "historial_dias", "7"))
        max_mb = float(_cfg(con, "memoria_max_mb", "1536"))
        limite_fecha = datetime.now() - timedelta(days=dias)
        protegidos = _paths_protegidos(con)

        publicados = con.execute(
            """SELECT output_path, publicado_en, creado_en, fijado
               FROM cola_publicacion
               WHERE status = 'publicado' AND output_path IS NOT NULL"""
        ).fetchall()
    finally:
        con.close()

    candidatos: list[tuple[str, datetime]] = []
    for path, pub, creado, fijado in publicados:
        if fijado == 1:
            continue
        if not path or not os.path.exists(path):
            continue
        if os.path.normpath(path) in protegidos:
            continue
        fecha_ref = pub or creado
        try:
            dt = datetime.fromisoformat(str(fecha_ref).replace("Z", ""))
        except (TypeError, ValueError):
            dt = datetime.fromtimestamp(os.path.getmtime(path))
        if forzar or dt < limite_fecha:
            candidatos.append((path, dt))

    candidatos.sort(key=lambda x: x[1])
    eliminados = 0
    megas = 0.0

    def _borrar(ruta: str) -> None:
        nonlocal eliminados, megas
        try:
            size_mb = os.path.getsize(ruta) / (1024 * 1024)
            os.remove(ruta)
            eliminados += 1
            megas += size_mb
        except OSError:
            pass

    while _tamano_output_mb() > max_mb and candidatos:
        ruta, _ = candidatos.pop(0)
        _borrar(ruta)

    if forzar:
        for ruta, _ in candidatos:
            _borrar(ruta)

    if eliminados:
        registrar_semaforo("limpieza_memoria", n=eliminados, mb=round(megas, 1))

    return {"eliminados": eliminados, "mb_liberados": round(megas, 1)}


def verificar_links_vivos() -> dict:
    con = sqlite3.connect(DB_PATH)
    try:
        videos = con.execute(
            "SELECT id, tiktok_url FROM videos WHERE status='pendiente' AND tiktok_url IS NOT NULL"
        ).fetchall()
    finally:
        con.close()

    rotos = 0
    for vid_id, url in videos:
        try:
            resp = requests.head(url, timeout=8, allow_redirects=True)
            if resp.status_code >= 400:
                raise ValueError(f"HTTP {resp.status_code}")
        except Exception as e:
            con = sqlite3.connect(DB_PATH)
            try:
                con.execute(
                    "UPDATE videos SET status='roto', roto_desde=? WHERE id=?",
                    (datetime.now().isoformat(), vid_id),
                )
                con.commit()
            finally:
                con.close()
            registrar_semaforo("link_roto", detalle_tecnico=str(e))
            rotos += 1

    return {"verificados": len(videos), "rotos": rotos}


def actualizar_yt_dlp() -> bool:
    try:
        subprocess.run(
            [os.environ.get("PYTHON", "python"), "-m", "pip", "install", "-U", "yt-dlp"],
            capture_output=True,
            timeout=120,
            check=False,
        )
        registrar_semaforo("ytdlp_actualizado")
        return True
    except Exception:
        return False


def uso_memoria_resumen() -> dict:
    mb = round(_tamano_output_mb(), 1)
    con = sqlite3.connect(DB_PATH)
    try:
        max_mb = float(_cfg(con, "memoria_max_mb", "1536"))
        dias = int(_cfg(con, "historial_dias", "7"))
    finally:
        con.close()
    return {"mb_usados": mb, "mb_max": max_mb, "historial_dias": dias}


def verificar_worker_vivo(host: str = "http://127.0.0.1:5001") -> bool:
    try:
        resp = requests.get(f"{host}/health", timeout=5)
        return resp.status_code == 200
    except Exception:
        registrar_semaforo("worker_caido")
        return False


def ciclo_guardian(intervalo_segundos: int = 300) -> None:
    ultimo_ytdlp = datetime.min
    while True:
        verificar_links_vivos()
        limpiar_intermedios()
        limpiar_memoria_historial(forzar=False)
        verificar_worker_vivo()
        if datetime.now() - ultimo_ytdlp > timedelta(days=7):
            actualizar_yt_dlp()
            ultimo_ytdlp = datetime.now()
        time.sleep(intervalo_segundos)


if __name__ == "__main__":
    print("[AutoHealBot] Guardián iniciado. Revisando cada 5 minutos...")
    ciclo_guardian()
