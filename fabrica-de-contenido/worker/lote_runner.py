"""
Encargado de Lote — Fase A: un link a la vez (descarga → voz → escudo → QC → JSON gemelo).
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from .consultas import BASE_DIR, anotar, conectar, datos_canal
from .babeldesk_entrega import entregar_lote_en_inbox
from .downloader import ULTIMO_ERROR_DESCARGA, download_audio_fondo, download_url_video
from .lote_contenido import armar_caption, armar_guion_voz
from .renderer import renderizar_video_lote
from .telegram_bot import sincronizar_csv_desde_sqlite
from .video_qc import auditar_video_salida
from .voz import alinear_voz_con_gancho, generar_voz

OUTPUT_DIR = BASE_DIR / "output"
TEMP_LOTE = BASE_DIR / "cache" / "temp" / "lote"
MAX_REINTENTOS = 2


def asegurar_esquema_lote() -> None:
    con = conectar()
    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS lote_render_fingerprints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lote_id INTEGER NOT NULL,
                phash TEXT NOT NULL,
                output_path TEXT NOT NULL,
                creado_en TEXT NOT NULL
            )
            """
        )
        cols = {r[1] for r in con.execute("PRAGMA table_info(lote_links)").fetchall()}
        if "reintentos" not in cols:
            con.execute("ALTER TABLE lote_links ADD COLUMN reintentos INTEGER NOT NULL DEFAULT 0")
        if "qc_semaforo" not in cols:
            con.execute("ALTER TABLE lote_links ADD COLUMN qc_semaforo TEXT DEFAULT ''")
        con.commit()
    finally:
        con.close()


def _historial_phash() -> list[str]:
    con = conectar()
    try:
        rows = con.execute(
            "SELECT phash FROM lote_render_fingerprints ORDER BY id DESC LIMIT 30"
        ).fetchall()
        return [r["phash"] for r in rows if r["phash"]]
    finally:
        con.close()


def _actualizar_estado(lote_id: int, estado: str, **extra: str) -> None:
    con = conectar()
    try:
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        sets = ["estado_fabrica = ?", "actualizado_en = ?"]
        vals: list = [estado, ahora]
        if "output_path" in extra:
            sets.append("output_path = ?")
            vals.append(extra["output_path"])
        if "qc_semaforo" in extra:
            sets.append("qc_semaforo = ?")
            vals.append(extra["qc_semaforo"])
        if "reintentos" in extra:
            sets.append("reintentos = ?")
            vals.append(int(extra["reintentos"]))
        vals.append(lote_id)
        con.execute(f"UPDATE lote_links SET {', '.join(sets)} WHERE id = ?", vals)
        con.commit()
    finally:
        con.close()
    sincronizar_csv_desde_sqlite()


def _siguiente_pendiente() -> sqlite3.Row | None:
    con = conectar()
    try:
        return con.execute(
            """
            SELECT * FROM lote_links
            WHERE estado_fabrica IN ('pendiente', 'revisar_link')
              AND salud_link NOT LIKE 'caído%'
            ORDER BY id ASC
            LIMIT 1
            """
        ).fetchone()
    finally:
        con.close()


def _guardar_fingerprint(lote_id: int, phash: str, output_path: str) -> None:
    con = conectar()
    try:
        con.execute(
            """
            INSERT INTO lote_render_fingerprints (lote_id, phash, output_path, creado_en)
            VALUES (?, ?, ?, ?)
            """,
            (lote_id, phash, output_path, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        con.commit()
    finally:
        con.close()


def _escribir_json_gemelo(mp4_path: str, payload: dict) -> str:
    json_path = str(Path(mp4_path).with_suffix(".json"))
    Path(json_path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return json_path


def _notificar_pablo(texto: str) -> None:
    try:
        from .telegram_bot import enviar_mensaje_telegram

        chat = os.environ.get("TELEGRAM_CHAT_ID", "")
        if chat:
            enviar_mensaje_telegram(chat, texto)
    except Exception:
        pass


def procesar_siguiente_lote() -> dict:
    """Procesa un link pendiente. Si falla, marca roto/revisar y sigue disponible el siguiente."""
    asegurar_esquema_lote()
    fila = _siguiente_pendiente()
    if not fila:
        return {"ok": True, "procesado": False, "motivo": "no_hay_pendientes"}

    lote_id = int(fila["id"])
    url = str(fila["url_video"])
    reintentos = int(fila["reintentos"] if "reintentos" in fila.keys() else 0)
    nota = str(fila["nota_pablo"] or "")
    canal_id = int(fila["canal_id"])

    _actualizar_estado(lote_id, "descargando")
    TEMP_LOTE.mkdir(parents=True, exist_ok=True)
    voice_path = str(TEMP_LOTE / f"lote_{lote_id}_voz.mp3")

    try:
        local = download_url_video(url)
        if not local or not Path(local).exists():
            det = ULTIMO_ERROR_DESCARGA or "sin detalle"
            estado = "necesita_cookies" if "login" in det.lower() or "cookie" in det.lower() else "roto"
            _actualizar_estado(lote_id, estado, reintentos=str(reintentos + 1))
            anotar(
                "link_caido",
                "rojo",
                f"⚠️ Lote #{lote_id}: no pude descargar. {det[:120]}",
                url,
            )
            msg = (
                f"🔴 Lote #{lote_id}: no bajó el video.\n"
                f"{'Pon cookies en data/cookies.txt (ver YTDLP_COOKIES en BabelDesk) o descarga en BabelDesk → Inbox.' if estado == 'necesita_cookies' else 'Prueba otro link o revisa que siga vivo.'}"
            )
            _notificar_pablo(msg)
            return {"ok": False, "procesado": True, "lote_id": lote_id, "error": "descarga_fallida", "detalle": det}

        _actualizar_estado(lote_id, "editando")
        guion = armar_guion_voz(nota)
        canal = datos_canal(canal_id) or {}
        resultado_voz = generar_voz(
            guion["texto_voz"],
            voice_path,
            voice_id=canal.get("voice_id") or None,
            voz_fallback=canal.get("voz_fallback") or "es-MX-JorgeNeural",
        )
        ruta_voz = alinear_voz_con_gancho(resultado_voz["ruta_audio"])
        resultado_voz["ruta_audio"] = ruta_voz
        music_path = download_audio_fondo(None)

        output_stem = f"lote_{lote_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        render = renderizar_video_lote(
            video_path=local,
            voice_path=resultado_voz["ruta_audio"],
            frame1_text=guion["frame1_text"],
            palabras=resultado_voz["palabras"],
            output_stem=output_stem,
            music_path=music_path,
        )
        output_path = render["output_path"]

        _actualizar_estado(lote_id, "control_calidad")
        qc = auditar_video_salida(output_path, phash_historial=_historial_phash(), min_bytes=400_000)

        if qc["semaforo"] == "amarillo" and reintentos < MAX_REINTENTOS:
            render = renderizar_video_lote(
                video_path=local,
                voice_path=resultado_voz["ruta_audio"],
                frame1_text=guion["frame1_text"],
                palabras=resultado_voz["palabras"],
                output_stem=f"{output_stem}_r2",
                music_path=music_path,
            )
            output_path = render["output_path"]
            qc = auditar_video_salida(output_path, phash_historial=_historial_phash(), min_bytes=400_000)

        if qc["semaforo"] != "verde":
            estado_qc = "revisar_qc" if qc["semaforo"] == "amarillo" else "roto"
            _actualizar_estado(
                lote_id,
                estado_qc,
                reintentos=str(reintentos + 1),
                qc_semaforo=qc["semaforo"],
                output_path=output_path,
            )
            anotar("error", "rojo" if estado_qc == "roto" else "amarillo", f"🚨 Lote #{lote_id}: QC {qc['semaforo']}. No se publica.", url)
            _notificar_pablo(f"🟡 Lote #{lote_id}: calidad {qc['semaforo']}. Revisa output/ antes de subir.")
            return {"ok": False, "procesado": True, "lote_id": lote_id, "qc": qc}

        caption = armar_caption(guion)
        meta = {
            "title": guion["gancho"],
            "caption": caption,
            "keyword": "SABIDURIA",
            "fuente": "fabrica-lote",
            "canal": fila["canal_nombre"],
            "gancho": guion["gancho"],
            "dato_libro": guion["dato_libro"],
            "url_origen": url,
            "lote_id": lote_id,
            "miniatura": render.get("miniatura", ""),
            "qc_semaforo": qc["semaforo"],
            "escudo": render.get("escudo"),
            "trim_inicio": render.get("trim_inicio"),
        }
        json_path = _escribir_json_gemelo(output_path, meta)

        if qc.get("phash"):
            _guardar_fingerprint(lote_id, qc["phash"], output_path)

        entrega = entregar_lote_en_inbox(
            output_path,
            render.get("miniatura"),
            meta,
            lote_id,
        )
        estado_final = "entregado" if entrega.get("ok") else "listo"
        _actualizar_estado(
            lote_id,
            estado_final,
            output_path=output_path,
            qc_semaforo=qc["semaforo"],
            reintentos=str(reintentos),
        )
        anotar(
            "health_check",
            "verde",
            f"✅ Lote #{lote_id} listo (QC verde).",
            output_path,
        )
        inbox_msg = entrega.get("inbox", "BabelDesk Inbox") if entrega.get("ok") else "solo en output/ (no encontré Inbox)"
        _notificar_pablo(
            f"🟢 Lote #{lote_id} listo (QC verde).\n"
            f"Archivo: {Path(output_path).name}\n"
            f"Entrega: {inbox_msg}"
        )
        return {
            "ok": True,
            "procesado": True,
            "lote_id": lote_id,
            "output_path": output_path,
            "json_path": json_path,
            "miniatura": render.get("miniatura"),
            "qc": qc,
            "babeldesk": entrega,
        }
    except Exception as e:
        _actualizar_estado(lote_id, "roto", reintentos=str(reintentos + 1))
        anotar("error", "rojo", f"🚨 Lote #{lote_id} falló al editar.", str(e)[:400])
        _notificar_pablo(f"🔴 Lote #{lote_id}: algo falló al armar el video. Lo anoté en el Bot Guardián.")
        return {"ok": False, "procesado": True, "lote_id": lote_id, "error": str(e)[:500]}
    finally:
        try:
            Path(voice_path).unlink(missing_ok=True)
        except OSError:
            pass


def procesar_tanda_lote(max_items: int = 3) -> dict:
    resultados = []
    for _ in range(max(1, min(max_items, 10))):
        r = procesar_siguiente_lote()
        resultados.append(r)
        if not r.get("procesado") or r.get("motivo") == "no_hay_pendientes":
            break
        if not r.get("ok") and r.get("error") == "descarga_fallida":
            continue
    pend = _siguiente_pendiente()
    return {
        "ok": True,
        "resultados": resultados,
        "quedan_pendientes": pend is not None,
    }
