"""
Cerebro de Telegram para la Fábrica de Contenido (clonado de venuz-repo/lib/telegram/).
Incluye:
- Comprensión coloquial (inspirado en ops-coloquial-hints.ts)
- Ingesta inteligente de links de video (TikTok, Instagram, Facebook, YouTube)
- Auditoría rápida de salud del enlace (Health Check) y filtro anti-duplicados
- Sincronización automática con Excel/CSV (lote/links_afiliado.csv) y SQLite (lote_links + videos)
- Auto-detección de TELEGRAM_CHAT_ID al primer mensaje de Pablo
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

try:
    from .consultas import (
        BASE_DIR,
        anotar,
        conectar,
        escribir_env,
        insertar_video,
        leer_env,
        canal_lote_afiliado,
        primer_canal_activo,
    )
except ImportError:
    from consultas import (
        BASE_DIR,
        anotar,
        conectar,
        escribir_env,
        insertar_video,
        leer_env,
        canal_lote_afiliado,
        primer_canal_activo,
    )

LOTE_DIR = BASE_DIR / "lote"
CSV_PATH = LOTE_DIR / "links_afiliado.csv"
CSV_HEADERS = [
    "id",
    "fecha_ingreso",
    "canal",
    "plataforma",
    "url_video",
    "nota_pablo",
    "salud_link",
    "estado_fabrica",
    "archivo_salida",
]

URL_RE = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)


def asegurar_tabla_y_excel() -> None:
    """Crea la tabla lote_links en SQLite y la hoja CSV compatible con Excel (UTF-8 con BOM)."""
    LOTE_DIR.mkdir(parents=True, exist_ok=True)
    con = conectar()
    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS lote_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url_hash TEXT UNIQUE NOT NULL,
                url_video TEXT NOT NULL,
                plataforma TEXT NOT NULL,
                canal_id INTEGER NOT NULL DEFAULT 1,
                canal_nombre TEXT NOT NULL DEFAULT 'El Libro de la Sabiduría',
                nota_pablo TEXT DEFAULT '',
                salud_link TEXT NOT NULL DEFAULT 'vivo',
                estado_fabrica TEXT NOT NULL DEFAULT 'pendiente',
                video_id INTEGER,
                output_path TEXT DEFAULT '',
                creado_en TEXT NOT NULL,
                actualizado_en TEXT NOT NULL
            )
            """
        )
        con.commit()
    finally:
        con.close()

    if not CSV_PATH.exists():
        sincronizar_csv_desde_sqlite()


def sincronizar_csv_desde_sqlite() -> Path:
    """Exporta lote_links a lote/links_afiliado.csv con BOM UTF-8 para abrir directo en Excel."""
    LOTE_DIR.mkdir(parents=True, exist_ok=True)
    con = conectar()
    try:
        filas = con.execute(
            """
            SELECT id, creado_en, canal_nombre, plataforma, url_video,
                   nota_pablo, salud_link, estado_fabrica, output_path
            FROM lote_links
            ORDER BY id ASC
            """
        ).fetchall()
    finally:
        con.close()

    with open(CSV_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)
        for r in filas:
            writer.writerow([
                r["id"],
                r["creado_en"],
                r["canal_nombre"],
                r["plataforma"],
                r["url_video"],
                r["nota_pablo"] or "",
                r["salud_link"],
                r["estado_fabrica"],
                r["output_path"] or "",
            ])
    return CSV_PATH


def detectar_plataforma(url: str) -> str:
    u = url.lower()
    if "tiktok.com" in u:
        return "TikTok"
    if "instagram.com" in u:
        return "Instagram"
    if "facebook.com" in u or "fb.watch" in u or "fb.com" in u:
        return "Facebook"
    if "youtube.com" in u or "youtu.be" in u:
        return "YouTube"
    return "WebVideo"


def normalizar_url(url: str) -> str:
    limpia = url.strip().rstrip(".,;)")
    return limpia


def calcular_hash(url: str) -> str:
    return hashlib.sha256(normalizar_url(url).lower().encode("utf-8")).hexdigest()[:24]


def auditar_salud_link(url: str) -> tuple[bool, str]:
    """Health Audit rápido (estilo @venuz_brain_bot) para verificar que el link responde."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            code = getattr(resp, "status", 200)
            if 200 <= code < 400:
                return True, f"vivo (HTTP {code})"
            return False, f"alerta (HTTP {code})"
    except urllib.error.HTTPError as e:
        # TikTok/IG a veces devuelven 403/429 a clientes sin cookies aunque el video exista
        if e.code in (401, 403, 429):
            return True, f"protegido/requiere extractor (HTTP {e.code})"
        return False, f"caído (HTTP {e.code})"
    except Exception as e:
        return False, f"sin respuesta ({type(e).__name__})"


def registrar_link_en_lote(url: str, nota_pablo: str = "", canal_id: int | None = None) -> dict:
    """
    Filtra duplicados, audita salud del link, guarda en SQLite (lote_links + videos)
    y actualiza la hoja de Excel/CSV automáticamente.
    """
    asegurar_tabla_y_excel()
    url_limpia = normalizar_url(url)
    uhash = calcular_hash(url_limpia)
    plataforma = detectar_plataforma(url_limpia)

    canal = canal_lote_afiliado()
    cid = canal_id or int(canal["id"])
    cnombre = str(canal.get("nombre") or "El Libro de la Sabiduría")

    con = conectar()
    try:
        existente = con.execute(
            "SELECT id, estado_fabrica, creado_en FROM lote_links WHERE url_hash = ?",
            (uhash,),
        ).fetchone()
        if existente:
            return {
                "nuevo": False,
                "duplicado": True,
                "id": existente["id"],
                "plataforma": plataforma,
                "estado": existente["estado_fabrica"],
                "creado_en": existente["creado_en"],
                "url": url_limpia,
            }

        ok_salud, detalle_salud = auditar_salud_link(url_limpia)
        estado_inicial = "pendiente" if ok_salud else "revisar_link"
        ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        video_id = insertar_video(
            canal_id=cid,
            origen="telegram_lote",
            tiktok_url=url_limpia,
            local_path=None,
            sonido="es-MX-JorgeNeural",
        )

        cur = con.execute(
            """
            INSERT INTO lote_links (
                url_hash, url_video, plataforma, canal_id, canal_nombre,
                nota_pablo, salud_link, estado_fabrica, video_id, creado_en, actualizado_en
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uhash,
                url_limpia,
                plataforma,
                cid,
                cnombre,
                nota_pablo.strip(),
                detalle_salud,
                estado_inicial,
                video_id,
                ahora,
                ahora,
            ),
        )
        con.commit()
        lote_id = int(cur.lastrowid)
    finally:
        con.close()

    sincronizar_csv_desde_sqlite()
    anotar(
        "health_check",
        "verde" if ok_salud else "amarillo",
        f"📥 Link #{lote_id} ({plataforma}) guardado en Excel y cola por Telegram.",
        url_limpia,
    )
    return {
        "nuevo": True,
        "duplicado": False,
        "id": lote_id,
        "video_id": video_id,
        "plataforma": plataforma,
        "salud": detalle_salud,
        "ok_salud": ok_salud,
        "estado": estado_inicial,
        "canal": cnombre,
        "url": url_limpia,
    }


def resumen_lote() -> dict:
    asegurar_tabla_y_excel()
    con = conectar()
    try:
        total = con.execute("SELECT COUNT(*) FROM lote_links").fetchone()[0]
        pendientes = con.execute(
            "SELECT COUNT(*) FROM lote_links WHERE estado_fabrica = 'pendiente'"
        ).fetchone()[0]
        listos = con.execute(
            "SELECT COUNT(*) FROM lote_links WHERE estado_fabrica IN ('listo', 'entregado')"
        ).fetchone()[0]
        ultimos = [
            dict(r)
            for r in con.execute(
                "SELECT id, plataforma, url_video, salud_link, estado_fabrica, nota_pablo, "
                "creado_en, output_path, qc_semaforo "
                "FROM lote_links ORDER BY id DESC LIMIT 10"
            ).fetchall()
        ]
    finally:
        con.close()
    return {
        "total": total,
        "pendientes": pendientes,
        "listos": listos,
        "csv_path": str(CSV_PATH),
        "ultimos": ultimos,
    }


def _llamar_telegram(metodo: str, payload: dict | None = None) -> dict:
    env = leer_env()
    token = env.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        return {"ok": False, "error": "Falta TELEGRAM_BOT_TOKEN en .env.local"}

    url = f"https://api.telegram.org/bot{token}/{metodo}"
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": str(e)}


def enviar_mensaje_telegram(chat_id: str | int, texto: str) -> dict:
    return _llamar_telegram(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": texto,
            "disable_web_page_preview": True,
        },
    )


def responder_mensaje_inteligente(texto: str, chat_id: str | int) -> str:
    """
    Cerebro coloquial clonado de venuz-repo/lib/telegram/ops-coloquial-hints.ts.
    Detecta comandos, preguntas en lenguaje natural o tandas de links.
    """
    raw = (texto or "").strip()
    lower = raw.lower()

    # 1. Extraer links si el mensaje trae URLs
    urls = URL_RE.findall(raw)
    if urls:
        nota = URL_RE.sub("", raw).strip(" -:\n\t")
        nuevos = 0
        duplicados = 0
        lineas = []
        for u in urls:
            res = registrar_link_en_lote(u, nota_pablo=nota)
            if res["duplicado"]:
                duplicados += 1
                lineas.append(
                    f"♻️ Ya estaba en Excel (#{res['id']} - {res['plataforma']}) [{res['estado']}]"
                )
            else:
                nuevos += 1
                icono = "✅" if res["ok_salud"] else "⚠️"
                lineas.append(
                    f"{icono} Link #{res['id']} ({res['plataforma']}) → {res['salud']}\n"
                    f"   📂 Canal: {res['canal']} | Estado: {res['estado']}"
                )

        est = resumen_lote()
        encabezado = (
            f"🧠 Fábrica Scarlett Brain | Ingesta de Links\n"
            f"📥 Nuevos guardados: {nuevos} | ♻️ Duplicados filtrados: {duplicados}\n\n"
        )
        pie = (
            f"\n\n📊 Hoja de Excel actualizada:\n"
            f"• Total en tabla: {est['total']} ({est['pendientes']} pendientes)\n"
            f"• Archivo: lote/links_afiliado.csv"
        )
        return encabezado + "\n".join(lineas) + pie

    # 2. Intenciones coloquiales (reporte, estado, excel, ayuda)
    if any(p in lower for p in ("/start", "hola", "buenos", "buenas", "ayuda", "/help")):
        est = resumen_lote()
        return (
            "🧠 ¡Hola Pablo! Soy Fábrica Scarlett Brain (con el cerebro clonado de tu sistema VENUZ).\n\n"
            "📱 ¿Cómo funciono desde tu celular?\n"
            "1️⃣ Mándame 1 o varios links de TikTok, Instagram, Facebook o YouTube (puedes ponerles una nota al lado).\n"
            "2️⃣ Yo les hago Health Audit, filtro repetidos y los anoto directo en tu Excel (lote/links_afiliado.csv) y en la Fábrica.\n"
            "3️⃣ Pídeme «reporte» o «estado» cuando quieras ver cuántos videos hay en la fila.\n\n"
            f"📊 Estado actual: {est['total']} links en Excel ({est['pendientes']} pendientes de procesar)."
        )

    if any(p in lower for p in ("reporte", "estado", "cola", "excel", "cuántos", "cuantos", "/status")):
        est = resumen_lote()
        ultimos_txt = ""
        for u in est["ultimos"][:5]:
            ultimos_txt += f"\n• #{u['id']} [{u['plataforma']}] {u['estado_fabrica']} ({u['salud_link']})"
        if not ultimos_txt:
            ultimos_txt = "\n• Aún no hay links en la tabla. ¡Mándame el primero!"
        return (
            f"📊 Reporte de Fábrica Scarlett Brain\n"
            f"• Total en Excel: {est['total']}\n"
            f"• Pendientes de armar: {est['pendientes']}\n"
            f"• Listos / Entregados a BabelDesk: {est['listos']}\n\n"
            f"📋 Últimos links:{ultimos_txt}"
        )

    return (
        "🧠 Te leo, Pablo. Mándame cualquier link de TikTok, Instagram, Facebook o YouTube "
        "y lo audito y guardo enseguida en tu hoja de Excel (lote/links_afiliado.csv), "
        "o escríbeme «reporte» para ver cómo va la fila."
    )


class TelegramPoller:
    """Escucha mensajes de Telegram en segundo plano sin necesitar webhooks externos."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._offset = 0
        self.bot_username: str = ""
        self.conectado: bool = False

    def iniciar(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="TelegramBrainPoller")
        self._thread.start()

    def _loop(self) -> None:
        asegurar_tabla_y_excel()
        while not self._stop.is_set():
            env = leer_env()
            token = env.get("TELEGRAM_BOT_TOKEN", "").strip()
            if not token:
                self.conectado = False
                time.sleep(4)
                continue

            if not self.conectado:
                me = _llamar_telegram("getMe")
                if me.get("ok") and me.get("result"):
                    self.bot_username = me["result"].get("username", "scarlett_fabrica_pablo_bot")
                    self.conectado = True
                    anotar(
                        "health_check",
                        "verde",
                        f"🤖 Bot de Telegram @{self.bot_username} conectado y escuchando tus links.",
                    )
                else:
                    time.sleep(6)
                    continue

            res = _llamar_telegram(
                "getUpdates",
                {"offset": self._offset, "timeout": 10, "allowed_updates": ["message"]},
            )
            if not res.get("ok"):
                time.sleep(4)
                continue

            for upd in res.get("result", []):
                self._offset = int(upd["update_id"]) + 1
                msg = upd.get("message") or {}
                chat = msg.get("chat") or {}
                chat_id = chat.get("id")
                texto = msg.get("text") or msg.get("caption") or ""
                if not chat_id or not texto:
                    continue

                # Auto-guardar TELEGRAM_CHAT_ID en el primer mensaje si aún no está configurado
                env_actual = leer_env()
                if not env_actual.get("TELEGRAM_CHAT_ID"):
                    escribir_env({"TELEGRAM_CHAT_ID": str(chat_id)})
                    anotar(
                        "health_check",
                        "verde",
                        "✅ Detecté tu chat de Telegram automáticamente y lo guardé en tu computadora.",
                    )

                respuesta = responder_mensaje_inteligente(texto, chat_id)
                enviar_mensaje_telegram(chat_id, respuesta)

            time.sleep(1.2)


poller_telegram = TelegramPoller()


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print("[OK] Iniciando Fabrica Scarlett Brain (Telegram Poller)...", flush=True)
    poller_telegram._loop()

