"""Lecturas y escrituras de la Fábrica contra automatizaciones.db."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "automatizaciones.db"
ENV_PATH = BASE_DIR / ".env.local"
OUTPUT_DIR = BASE_DIR / "output"

CLAVES_ENV = (
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_VOICE_ID",
    "PEXELS_API_KEY",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
)


def conectar() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError("Falta la base. Ejecuta scripts/inicializar_db.py")
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def anotar(tipo: str, semaforo: str, mensaje: str, detalle: str = "") -> None:
    con = conectar()
    try:
        con.execute(
            """
            INSERT INTO bot_guardian_log (tipo, semaforo, mensaje_pablo, detalle_tecnico, creado_en)
            VALUES (?,?,?,?,?)
            """,
            (tipo, semaforo, mensaje, detalle, datetime.now().isoformat(timespec="seconds")),
        )
        con.commit()
    finally:
        con.close()


def _ultimo_choque(con: sqlite3.Connection, canal_id: int) -> tuple[str, str]:
    row = con.execute(
        """
        SELECT g.hook_id, g.cta_keyword
        FROM cola_publicacion cp
        JOIN guiones g ON g.id = cp.guion_id
        WHERE cp.canal_id = ?
        ORDER BY cp.id DESC
        LIMIT 1
        """,
        (canal_id,),
    ).fetchone()
    if not row:
        return "", ""
    return row["hook_id"] or "", row["cta_keyword"] or ""


def elegir_par_anticolision(canal_id: int, slot: str) -> dict | None:
    """Menos usado primero. El primer video del canal sí sale (filtro vacío, no NULL)."""
    con = conectar()
    try:
        excluir_hook, excluir_cta = _ultimo_choque(con, canal_id)
        row = con.execute(
            """
            SELECT
              v.id AS video_id, v.local_path, v.tiktok_url, v.sonido_de_fondo,
              g.id AS guion_id, g.hook_id, g.spoken_hook, g.frame1_text,
              g.body_aida, g.cta_keyword, g.closing_phrase, g.activo
            FROM videos v
            CROSS JOIN guiones g
            WHERE v.canal_id = ?
              AND v.status IN ('listo', 'pendiente')
              AND g.canal_id = ?
              AND g.activo_flag = 1
              AND g.slot = ?
              AND (? = '' OR g.hook_id != ?)
              AND (? = '' OR g.cta_keyword != ?)
            ORDER BY
              v.veces_usado ASC,
              COALESCE(v.ultimo_usado_en, '1970-01-01') ASC,
              g.veces_usado ASC,
              RANDOM()
            LIMIT 1
            """,
            (canal_id, canal_id, slot, excluir_hook, excluir_hook, excluir_cta, excluir_cta),
        ).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def elegir_video_fondo(canal_id: int) -> dict | None:
    con = conectar()
    try:
        row = con.execute(
            """
            SELECT id AS video_id, local_path, tiktok_url, sonido_de_fondo
            FROM videos
            WHERE canal_id = ? AND status IN ('listo', 'pendiente')
            ORDER BY veces_usado ASC, COALESCE(ultimo_usado_en, '1970-01-01') ASC, RANDOM()
            LIMIT 1
            """,
            (canal_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def insertar_video(canal_id: int, origen: str, tiktok_url: str | None, local_path: str | None, sonido: str | None) -> int:
    con = conectar()
    try:
        try:
            cur = con.execute(
                """
                INSERT INTO videos (canal_id, origen, tiktok_url, local_path, sonido_de_fondo, status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    canal_id,
                    origen,
                    tiktok_url or None,
                    local_path,
                    sonido,
                    "listo" if local_path else "pendiente",
                ),
            )
            con.commit()
            return int(cur.lastrowid)
        except sqlite3.IntegrityError:
            con.rollback()
            if not tiktok_url:
                raise
            row = con.execute("SELECT id FROM videos WHERE tiktok_url = ?", (tiktok_url,)).fetchone()
            if not row:
                raise
            return int(row["id"])
    finally:
        con.close()


def insertar_guion(datos: dict) -> int:
    con = conectar()
    try:
        canal = con.execute("SELECT nicho FROM canales WHERE id = ?", (datos["canal_id"],)).fetchone()
        nicho = canal["nicho"] if canal else ""
        cur = con.execute(
            """
            INSERT INTO guiones (
              canal_id, hook_id, spoken_hook, frame1_text, body_aida, cta_keyword,
              closing_phrase, activo, slot, nicho, activo_flag, veces_usado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
            """,
            (
                datos["canal_id"],
                datos["hook_id"].strip().upper(),
                datos["spoken_hook"].strip(),
                datos["frame1_text"].strip(),
                datos["body_aida"].strip(),
                datos["cta_keyword"].strip().upper(),
                datos["closing_phrase"].strip(),
                (datos.get("activo") or "Recurso del canal").strip(),
                datos["slot"],
                nicho,
            ),
        )
        con.commit()
        return int(cur.lastrowid)
    finally:
        con.close()


def insertar_cola(canal_id: int, video_id: int, guion_id: int, slot: str, cuando: str) -> int:
    con = conectar()
    try:
        cur = con.execute(
            """
            INSERT INTO cola_publicacion (canal_id, video_id, guion_id, slot, fecha_programada, status)
            VALUES (?, ?, ?, ?, ?, 'pendiente')
            """,
            (canal_id, video_id, guion_id, slot, cuando),
        )
        con.commit()
        return int(cur.lastrowid)
    finally:
        con.close()


def marcar_video_listo(cola_id: int, video_id: int, guion_id: int, output_path: str, fondo_local: str | None) -> None:
    con = conectar()
    try:
        if fondo_local:
            con.execute(
                """
                UPDATE videos
                SET status = 'listo', local_path = COALESCE(local_path, ?),
                    veces_usado = veces_usado + 1, ultimo_usado_en = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (fondo_local, video_id),
            )
        else:
            con.execute(
                """
                UPDATE videos
                SET status = 'listo', veces_usado = veces_usado + 1, ultimo_usado_en = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (video_id,),
            )
        con.execute(
            """
            UPDATE guiones
            SET veces_usado = veces_usado + 1, ultimo_usado_en = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (guion_id,),
        )
        con.execute(
            """
            UPDATE cola_publicacion
            SET status = 'listo', output_path = ?
            WHERE id = ?
            """,
            (output_path, cola_id),
        )
        con.commit()
    finally:
        con.close()


def marcar_cola_fallida(cola_id: int, error: str) -> None:
    con = conectar()
    try:
        con.execute(
            "UPDATE cola_publicacion SET status = 'fallido', error_tecnico = ? WHERE id = ?",
            (error[:500], cola_id),
        )
        con.commit()
    finally:
        con.close()


def resumen_inicio() -> dict:
    con = conectar()
    try:
        ahora = datetime.now()
        inicio_semana = (ahora - timedelta(days=7)).isoformat()
        inicio_anterior = (ahora - timedelta(days=14)).isoformat()
        pub = con.execute(
            """
            SELECT
              SUM(CASE WHEN COALESCE(publicado_en, creado_en) >= ? THEN 1 ELSE 0 END),
              SUM(CASE WHEN COALESCE(publicado_en, creado_en) >= ? AND COALESCE(publicado_en, creado_en) < ? THEN 1 ELSE 0 END)
            FROM cola_publicacion
            WHERE status = 'publicado'
            """,
            (inicio_semana, inicio_anterior, inicio_semana),
        ).fetchone()
        activos = con.execute("SELECT COUNT(*) FROM canales WHERE activo = 1").fetchone()[0]
        total_canales = con.execute("SELECT COUNT(*) FROM canales").fetchone()[0]
        hoy = ahora.date().isoformat()
        en_cola = con.execute(
            """
            SELECT COUNT(*) FROM cola_publicacion
            WHERE date(fecha_programada) = ? AND status IN ('pendiente', 'renderizando', 'listo')
            """,
            (hoy,),
        ).fetchone()[0]
        en_proceso = con.execute(
            "SELECT COUNT(*) FROM cola_publicacion WHERE status IN ('pendiente', 'renderizando')"
        ).fetchone()[0]
        proximo = "1:00 PM" if ahora.hour < 13 else "8:30 PM"
        logs = con.execute(
            """
            SELECT creado_en, semaforo, mensaje_pablo
            FROM bot_guardian_log
            ORDER BY id DESC
            LIMIT 12
            """
        ).fetchall()
        pipe = con.execute(
            """
            SELECT p.tarea_id, p.paso_actual, p.porcentaje, p.mensaje, p.status, p.error,
                   c.nombre AS canal_nombre, c.emoji
            FROM pipeline_estados p
            LEFT JOIN canales c ON c.id = p.canal_id
            ORDER BY p.actualizado_en DESC
            LIMIT 1
            """
        ).fetchone()
        return {
            "kpis": {
                "publicados_semana": pub[0] or 0,
                "publicados_semana_anterior": pub[1] or 0,
                "canales_activos": activos,
                "canales_total": total_canales,
                "en_cola_hoy": en_cola,
                "en_proceso": en_proceso,
                "proximo": proximo,
                "costo_mes": 0,
            },
            "pipeline": dict(pipe) if pipe else None,
            "log": [dict(r) for r in logs],
        }
    finally:
        con.close()


def listar_canales() -> list[dict]:
    con = conectar()
    try:
        rows = con.execute(
            """
            SELECT c.*,
              (SELECT COUNT(*) FROM videos v WHERE v.canal_id = c.id) AS videos,
              (SELECT COUNT(*) FROM videos v WHERE v.canal_id = c.id AND v.status = 'listo') AS videos_listos,
              (SELECT COUNT(*) FROM guiones g WHERE g.canal_id = c.id) AS guiones,
              (SELECT COUNT(*) FROM guiones g WHERE g.canal_id = c.id AND g.activo_flag = 1) AS guiones_activos
            FROM canales c
            ORDER BY c.numero
            """
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def toggle_canal(canal_id: int, activo: bool) -> None:
    con = conectar()
    try:
        con.execute("UPDATE canales SET activo = ? WHERE id = ?", (1 if activo else 0, canal_id))
        con.commit()
    finally:
        con.close()


def listar_guiones(canal_id: int | None, solo: str | None) -> list[dict]:
    con = conectar()
    try:
        sql = """
            SELECT g.*, c.nombre AS canal_nombre, c.emoji
            FROM guiones g
            JOIN canales c ON c.id = g.canal_id
            WHERE 1 = 1
        """
        params: list = []
        if canal_id:
            sql += " AND g.canal_id = ?"
            params.append(canal_id)
        if solo == "activos":
            sql += " AND g.activo_flag = 1"
        elif solo == "pausados":
            sql += " AND g.activo_flag = 0"
        sql += " ORDER BY g.canal_id, g.slot, g.veces_usado ASC"
        return [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()


def sugerir_guion(canal_id: int, slot: str) -> dict | None:
    con = conectar()
    try:
        excluir_hook, excluir_cta = _ultimo_choque(con, canal_id)
        row = con.execute(
            """
            SELECT * FROM guiones
            WHERE canal_id = ? AND activo_flag = 1 AND slot = ?
              AND (? = '' OR hook_id != ?)
              AND (? = '' OR cta_keyword != ?)
            ORDER BY veces_usado ASC, RANDOM()
            LIMIT 1
            """,
            (canal_id, slot, excluir_hook, excluir_hook, excluir_cta, excluir_cta),
        ).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def listar_cola() -> list[dict]:
    con = conectar()
    try:
        rows = con.execute(
            """
            SELECT cp.*, c.nombre AS canal_nombre, c.emoji,
                   g.frame1_text, g.hook_id, g.cta_keyword, g.slot AS guion_slot
            FROM cola_publicacion cp
            JOIN canales c ON c.id = cp.canal_id
            JOIN guiones g ON g.id = cp.guion_id
            ORDER BY cp.fecha_programada DESC, cp.id DESC
            LIMIT 80
            """
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def toggle_fijado(cola_id: int) -> int:
    con = conectar()
    try:
        row = con.execute("SELECT fijado FROM cola_publicacion WHERE id = ?", (cola_id,)).fetchone()
        if not row:
            raise KeyError("No está en la cola")
        nuevo = 0 if row["fijado"] else 1
        con.execute("UPDATE cola_publicacion SET fijado = ? WHERE id = ?", (nuevo, cola_id))
        con.commit()
        return nuevo
    finally:
        con.close()


def quitar_de_cola(cola_id: int) -> None:
    con = conectar()
    try:
        row = con.execute("SELECT fijado, status FROM cola_publicacion WHERE id = ?", (cola_id,)).fetchone()
        if not row:
            raise KeyError("No está en la cola")
        if row["fijado"]:
            raise ValueError("Este video está fijado. Quita el candado antes de borrarlo.")
        if row["status"] == "renderizando":
            raise ValueError("Este video se está armando. Espera a que termine.")
        con.execute("DELETE FROM cola_publicacion WHERE id = ?", (cola_id,))
        con.commit()
    finally:
        con.close()


def ruta_video_cola(cola_id: int) -> Path:
    con = conectar()
    try:
        row = con.execute("SELECT output_path FROM cola_publicacion WHERE id = ?", (cola_id,)).fetchone()
    finally:
        con.close()
    if not row or not row["output_path"]:
        raise FileNotFoundError("Este video todavía no está listo.")
    ruta = Path(row["output_path"]).resolve()
    salida = OUTPUT_DIR.resolve()
    if salida not in ruta.parents and ruta != salida:
        raise PermissionError("Ruta fuera de la carpeta de salida.")
    if not ruta.exists():
        raise FileNotFoundError("El archivo ya no está en el disco.")
    return ruta


def marcar_publicado(cola_id: int) -> dict:
    con = conectar()
    try:
        row = con.execute("SELECT output_path, status FROM cola_publicacion WHERE id = ?", (cola_id,)).fetchone()
        if not row:
            raise KeyError("No está en la cola")
        if not row["output_path"]:
            raise ValueError("Primero tiene que terminar de armarse el video.")
        con.execute(
            """
            UPDATE cola_publicacion
            SET status = 'publicado', publicado_en = ?
            WHERE id = ?
            """,
            (datetime.now().isoformat(timespec="seconds"), cola_id),
        )
        con.commit()
        return {"output_path": row["output_path"]}
    finally:
        con.close()


def poner_renderizando(cola_id: int) -> None:
    con = conectar()
    try:
        con.execute("UPDATE cola_publicacion SET status = 'renderizando' WHERE id = ?", (cola_id,))
        con.commit()
    finally:
        con.close()


def datos_canal(canal_id: int) -> dict | None:
    con = conectar()
    try:
        row = con.execute("SELECT * FROM canales WHERE id = ?", (canal_id,)).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def primer_canal_activo() -> dict | None:
    con = conectar()
    try:
        row = con.execute("SELECT * FROM canales WHERE activo = 1 ORDER BY numero LIMIT 1").fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def canal_lote_afiliado() -> dict:
    """Canal fijo para links de Telegram / Excel del libro (no el primer canal activo)."""
    con = conectar()
    try:
        row = con.execute(
            """
            SELECT * FROM canales
            WHERE lower(nombre) LIKE '%libro%' OR lower(nombre) LIKE '%sabidur%'
            ORDER BY numero LIMIT 1
            """
        ).fetchone()
        if row:
            return dict(row)
    finally:
        con.close()
    fallback = primer_canal_activo()
    if fallback:
        return fallback
    return {
        "id": 1,
        "nombre": "El Libro de la Sabiduría",
        "emoji": "📖",
        "voz_fallback": "es-MX-JorgeNeural",
        "voice_id": "",
    }


def estado_pipeline(tarea_id: str) -> dict | None:
    con = conectar()
    try:
        row = con.execute("SELECT * FROM pipeline_estados WHERE tarea_id = ?", (tarea_id,)).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def guardar_historial_dias(dias: int) -> None:
    if dias not in (7, 15):
        raise ValueError("Elige 7 o 15 días.")
    con = conectar()
    try:
        con.execute(
            "INSERT INTO configuracion (clave, valor) VALUES ('historial_dias', ?) "
            "ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            (str(dias),),
        )
        con.commit()
    finally:
        con.close()


def leer_env() -> dict[str, str]:
    datos: dict[str, str] = {}
    if not ENV_PATH.exists():
        return datos
    for linea in ENV_PATH.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        datos[clave.strip()] = valor.strip()
    return datos


def escribir_env(nuevos: dict[str, str]) -> None:
    actual = leer_env()
    for clave in CLAVES_ENV:
        if clave in nuevos and nuevos[clave].strip():
            actual[clave] = nuevos[clave].strip()
    lineas = [
        "# Claves locales de la Fábrica de Contenido. No las subas a git.",
    ]
    for clave in CLAVES_ENV:
        if clave in actual and actual[clave]:
            lineas.append(f"{clave}={actual[clave]}")
    ENV_PATH.write_text("\n".join(lineas) + "\n", encoding="utf-8")


def claves_enmascaradas() -> dict:
    datos = leer_env()
    salida = {}
    for clave in CLAVES_ENV:
        valor = datos.get(clave, "")
        salida[clave] = {
            "guardada": bool(valor),
            "pista": ("••••" + valor[-4:]) if len(valor) >= 4 else ("••••" if valor else ""),
        }
    return salida
