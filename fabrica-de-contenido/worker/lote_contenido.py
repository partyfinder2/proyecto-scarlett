"""Plantillas rotativas para lote afiliado — El Libro de la Sabiduría."""
from __future__ import annotations

import json
import random
from pathlib import Path

LOTE_DIR = Path(__file__).resolve().parent.parent / "lote"
PLANTILLA_PATH = LOTE_DIR / "plantillas_libro_sabiduria.json"

_cache: dict | None = None
def _conectar():
    from .consultas import conectar

    return conectar()


def _asegurar_ganchos_db() -> None:
    con = _conectar()
    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS lote_ganchos_usados (
                gancho TEXT PRIMARY KEY,
                usado_en TEXT NOT NULL
            )
            """
        )
        con.commit()
    finally:
        con.close()


def cargar_plantillas() -> dict:
    global _cache
    if _cache is not None:
        return _cache
    if not PLANTILLA_PATH.exists():
        _cache = {
            "ganchos_pantalla": ["¿Listo para aprender algo nuevo hoy?"],
            "datos_libro_voz": ["Este libro reúne ideas prácticas para tu día a día."],
            "narracion_base": "Presta atención a este mensaje.",
            "ctas_voz": ["Encuéntralo en el link de mi biografía."],
            "caption_plantillas": ["{gancho} {dato} {cta} {hashtags}"],
            "hashtags_default": "#libro #sabiduria",
            "miniatura_titulo": "El Libro de la Sabiduría",
            "affiliate_cta_caption": "Link en la bio",
        }
        return _cache
    _cache = json.loads(PLANTILLA_PATH.read_text(encoding="utf-8"))
    return _cache


def _ganchos_recientes(limite: int = 25) -> set[str]:
    _asegurar_ganchos_db()
    con = _conectar()
    try:
        rows = con.execute(
            "SELECT gancho FROM lote_ganchos_usados ORDER BY usado_en DESC LIMIT ?",
            (limite,),
        ).fetchall()
        return {r["gancho"] for r in rows}
    finally:
        con.close()


def _registrar_gancho(gancho: str) -> None:
    from datetime import datetime

    _asegurar_ganchos_db()
    con = _conectar()
    try:
        con.execute(
            """
            INSERT INTO lote_ganchos_usados (gancho, usado_en) VALUES (?, ?)
            ON CONFLICT(gancho) DO UPDATE SET usado_en = excluded.usado_en
            """,
            (gancho, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        con.commit()
    finally:
        con.close()


def elegir_gancho_unico() -> str:
    p = cargar_plantillas()
    opciones = list(p.get("ganchos_pantalla") or [])
    if not opciones:
        return "Un minuto de sabiduría para ti"
    recientes = _ganchos_recientes()
    random.shuffle(opciones)
    for g in opciones:
        if g not in recientes:
            _registrar_gancho(g)
            return g
    g = random.choice(opciones)
    _registrar_gancho(g)
    return g


def armar_guion_voz(nota_pablo: str = "") -> dict:
    p = cargar_plantillas()
    gancho = elegir_gancho_unico()
    dato = random.choice(p.get("datos_libro_voz") or [""])
    base = str(p.get("narracion_base") or "").strip()
    cta = random.choice(p.get("ctas_voz") or ["Link en la bio."])
    nota = (nota_pablo or "").strip()
    cuerpo = base
    if nota:
        cuerpo = f"{base} {nota}"
    texto_voz = f"{gancho} {dato} {cuerpo} {cta}"
    texto_voz = " ".join(texto_voz.split())
    return {
        "frame1_text": gancho,
        "texto_voz": texto_voz,
        "dato_libro": dato,
        "cta_voz": cta,
        "gancho": gancho,
    }


def armar_caption(guion: dict, keyword: str = "SABIDURIA") -> str:
    p = cargar_plantillas()
    plantilla = random.choice(p.get("caption_plantillas") or ["{gancho} {cta}"])
    hashtags = str(p.get("hashtags_default") or "").strip()
    cta_cap = str(p.get("affiliate_cta_caption") or "Link en la bio")
    caption = plantilla.format(
        gancho=guion.get("gancho", ""),
        dato=guion.get("dato_libro", ""),
        cta=cta_cap,
        hashtags=hashtags,
        keyword=keyword,
    )
    return caption.strip()
