"""
Servidor local — http://127.0.0.1:5001
Panel visual + motor de video en un solo proceso.
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import sqlite3
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .autohealer import limpiar_memoria_historial, uso_memoria_resumen
from .broll_finder import obtener_video_fondo_automatico
from .consultas import (
    ENV_PATH,
    anotar,
    claves_enmascaradas,
    datos_canal,
    elegir_par_anticolision,
    elegir_video_fondo,
    escribir_env,
    estado_pipeline,
    guardar_historial_dias,
    insertar_cola,
    insertar_guion,
    insertar_video,
    leer_env,
    listar_canales,
    listar_cola,
    listar_guiones,
    marcar_cola_fallida,
    marcar_publicado,
    marcar_video_listo,
    poner_renderizando,
    primer_canal_activo,
    quitar_de_cola,
    resumen_inicio,
    ruta_video_cola,
    sugerir_guion,
    toggle_canal,
    toggle_fijado,
)
from .copyright_shield import auditar_riesgo_copyright
from .downloader import download_audio_fondo, download_tiktok_sin_marca
from .renderer import renderizar_video
from .lote_runner import asegurar_esquema_lote, procesar_siguiente_lote, procesar_tanda_lote
from .telegram_bot import asegurar_tabla_y_excel, poller_telegram, registrar_link_en_lote, resumen_lote
from .voz import generar_voz

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "automatizaciones.db"
TEMP_DIR = BASE_DIR / "cache" / "temp"
PANEL_DIR = BASE_DIR / "panel"
UPLOADS = BASE_DIR / "cache" / "uploads"

tareas: dict[str, dict] = {}


def cargar_env_local() -> None:
    if not ENV_PATH.exists():
        return
    for clave, valor in leer_env().items():
        os.environ[clave] = valor


@asynccontextmanager
async def lifespan(_app: FastAPI):
    cargar_env_local()
    if DB_PATH.exists():
        asegurar_tabla_y_excel()
        poller_telegram.iniciar()
        anotar("health_check", "verde", "✅ Fábrica de Contenido lista en tu computadora.")
    yield


app = FastAPI(title="Fábrica de Contenido", version="2.0.0", lifespan=lifespan)


class ProcesarVideoRequest(BaseModel):
    tiktokUrl: str = ""
    localVideoPath: str = ""
    backgroundMusicTiktokUrl: str = ""
    copyForCustomVideo: str
    frame1Text: str
    spokenHook: str = ""
    closingPhrase: str = ""
    audioVolume: str = "8"
    musicVolume: str = "0.05"
    elevenLabsVoiceId: str = ""
    vozFallback: str = "es-MX-DaliaNeural"
    antiCopyright: bool = True
    canalId: int | None = None
    colaId: int | None = None
    videoId: int | None = None
    guionId: int | None = None


class AuditarRequest(BaseModel):
    videoPath: str = ""
    tiktokUrl: str = ""


class ToggleCanal(BaseModel):
    activo: bool


class NuevoGuion(BaseModel):
    canal_id: int
    hook_id: str
    spoken_hook: str
    frame1_text: str
    body_aida: str
    cta_keyword: str
    closing_phrase: str
    activo: str = "Recurso del canal"
    slot: str


class CrearVideo(BaseModel):
    canal_id: int
    slot: str
    frame1_text: str
    spoken_hook: str
    body_aida: str
    cta_keyword: str
    closing_phrase: str
    regalo: str = ""
    fondo: str = "tiktok"
    tiktok_url: str = ""
    local_path: str = ""
    anti_copyright: bool = True


class HistorialDias(BaseModel):
    dias: int


class ClavesForm(BaseModel):
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""
    PEXELS_API_KEY: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""


def actualizar_paso(
    tarea_id: str,
    paso: int,
    pct: int,
    mensaje: str,
    status: str = "procesando",
    error: str | None = None,
    canal_id: int | None = None,
) -> None:
    if not DB_PATH.exists():
        return
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute(
            """
            INSERT INTO pipeline_estados (tarea_id, canal_id, paso_actual, porcentaje, mensaje, status, error, actualizado_en)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tarea_id) DO UPDATE SET
                paso_actual = excluded.paso_actual,
                porcentaje  = excluded.porcentaje,
                mensaje     = excluded.mensaje,
                status      = excluded.status,
                error       = excluded.error,
                canal_id = COALESCE(excluded.canal_id, canal_id),
                actualizado_en = excluded.actualizado_en
            """,
            (tarea_id, canal_id, paso, pct, mensaje, status, error, datetime.now().isoformat()),
        )
        con.commit()
    finally:
        con.close()


def _generar_fondo_respaldo() -> str:
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    fallback_bg = TEMP_DIR / "fondo_respaldo_hd.mp4"
    if not fallback_bg.exists() or fallback_bg.stat().st_size < 50_000:
        import subprocess

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=1080x1920:d=15:r=30",
                "-vf",
                "eq=brightness=-0.35:contrast=0.85:saturation=0.6,boxblur=8:2",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                str(fallback_bg),
            ],
            capture_output=True,
            timeout=60,
        )
    return str(fallback_bg)


def _resolver_video_fondo(req: ProcesarVideoRequest) -> str:
    if req.localVideoPath and os.path.exists(req.localVideoPath):
        return req.localVideoPath
    if req.tiktokUrl:
        path = download_tiktok_sin_marca(req.tiktokUrl)
        if path:
            return path
        if req.videoId and DB_PATH.exists():
            con = sqlite3.connect(DB_PATH)
            try:
                con.execute("UPDATE videos SET status = 'roto' WHERE id = ?", (req.videoId,))
                con.commit()
            finally:
                con.close()
        anotar(
            "link_caido",
            "amarillo",
            "⚠️ Un enlace de TikTok no respondió. El Bot Guardián activó un video de respaldo automático para no frenar tu fábrica.",
            req.tiktokUrl,
        )
        respaldo_pexels = obtener_video_fondo_automatico("mecanica")
        if respaldo_pexels and os.path.exists(respaldo_pexels):
            return respaldo_pexels
        raise ValueError(
            "No pude descargar el video. Usa otro link, sube un MP4 local o exporta cookies a data/cookies.txt."
        )
    raise ValueError("Falta link de TikTok o archivo de video local.")


def _worker_con_pasos(task_id: str, req: ProcesarVideoRequest) -> None:
    temp_dir = TEMP_DIR / task_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    voice_path = str(temp_dir / "voz.mp3")
    fondo_local = None

    try:
        if req.colaId:
            poner_renderizando(req.colaId)

        actualizar_paso(task_id, 1, 15, "✍️ Leyendo tu guion...", canal_id=req.canalId)
        texto_voz = " ".join(
            p for p in (req.spokenHook, req.copyForCustomVideo, req.closingPhrase) if p
        ).strip()

        actualizar_paso(task_id, 2, 35, "🎙️ Grabando la voz...", canal_id=req.canalId)
        resultado_voz = generar_voz(
            texto_voz,
            voice_path,
            voice_id=req.elevenLabsVoiceId or None,
            voz_fallback=req.vozFallback or "es-MX-DaliaNeural",
        )
        if resultado_voz.get("fuente") == "edge-tts":
            anotar("fallback_voz", "amarillo", "⚠️ Usé la voz gratuita de respaldo. El video sigue adelante.")

        actualizar_paso(task_id, 3, 50, "⬇️ Buscando el video de fondo...", canal_id=req.canalId)
        fondo_local = _resolver_video_fondo(req)

        music_path = download_audio_fondo(req.backgroundMusicTiktokUrl or None)

        actualizar_paso(task_id, 3, 65, "🎬 Armando el video vertical y los subtítulos...", canal_id=req.canalId)
        output_path = renderizar_video(
            video_path=fondo_local,
            music_path=music_path,
            voice_path=resultado_voz["ruta_audio"],
            frame1_text=req.frame1Text,
            palabras=resultado_voz["palabras"],
            output_filename=f"video_{task_id}.mp4",
            anti_copyright=req.antiCopyright,
        )

        actualizar_paso(task_id, 4, 80, "🛡️ El Bot Guardián está revisando el video...", canal_id=req.canalId)
        if not os.path.exists(output_path) or os.path.getsize(output_path) < 50_000:
            raise ValueError("El video quedó vacío. No lo puse en la cola.")

        try:
            Path(voice_path).unlink(missing_ok=True)
        except OSError:
            pass

        if req.colaId and req.videoId and req.guionId:
            marcar_video_listo(req.colaId, req.videoId, req.guionId, output_path, fondo_local)

        actualizar_paso(
            task_id,
            5,
            92,
            "📅 Quedó programado en tu cola.",
            canal_id=req.canalId,
        )
        actualizar_paso(
            task_id,
            6,
            100,
            "🚀 Video listo en tu carpeta. Puedes verlo o enviarlo a tu Telegram.",
            status="listo",
            canal_id=req.canalId,
        )
        anotar("health_check", "verde", "✅ Video terminado y guardado en tu historial.")
        tareas[task_id] = {"status": "listo", "result": output_path, "error": None, "fuente_voz": resultado_voz.get("fuente")}
    except Exception as e:
        if req.colaId:
            marcar_cola_fallida(req.colaId, str(e))
        actualizar_paso(
            task_id,
            0,
            0,
            "🚨 Algo falló. El bot lo anotó y puedes intentar otro.",
            status="fallido",
            error=str(e),
            canal_id=req.canalId,
        )
        tareas[task_id] = {"status": "fallido", "result": None, "error": str(e)}
        anotar("error", "rojo", "🚨 Un video no se pudo armar. La fila sigue con el siguiente.", str(e)[:400])


def _lanzar(req: ProcesarVideoRequest) -> str:
    task_id = str(uuid.uuid4())[:8]
    tareas[task_id] = {"status": "procesando", "result": None, "error": None}
    actualizar_paso(task_id, 0, 5, "🔄 Iniciando...", canal_id=req.canalId)
    threading.Thread(target=_worker_con_pasos, args=(task_id, req), daemon=True).start()
    return task_id


def _req_desde_par(canal: dict, par: dict, cola_id: int, anti: bool) -> ProcesarVideoRequest:
    return ProcesarVideoRequest(
        tiktokUrl=par.get("tiktok_url") or "",
        localVideoPath=par.get("local_path") or "",
        backgroundMusicTiktokUrl=par.get("sonido_de_fondo") or "",
        copyForCustomVideo=par["body_aida"],
        frame1Text=par["frame1_text"],
        spokenHook=par.get("spoken_hook") or "",
        closingPhrase=par.get("closing_phrase") or "",
        elevenLabsVoiceId=canal.get("voice_id") or "",
        vozFallback=canal.get("voz_fallback") or "es-MX-DaliaNeural",
        antiCopyright=anti,
        canalId=canal["id"],
        colaId=cola_id,
        videoId=par["video_id"],
        guionId=par["guion_id"],
    )


@app.get("/")
def panel_inicio():
    return FileResponse(PANEL_DIR / "index.html")


@app.get("/health")
def health():
    return {"status": "vivo", "hora": datetime.now().isoformat()}


@app.get("/manifest.webmanifest")
def manifest_web():
    return JSONResponse(
        {
            "name": "Fábrica de Contenido",
            "short_name": "Fábrica",
            "start_url": "/",
            "display": "standalone",
            "background_color": "#090b10",
            "theme_color": "#14532d",
            "lang": "es",
        }
    )


@app.get("/api/inicio")
def api_inicio():
    datos = resumen_inicio()
    datos["elevenlabs"] = "lista" if os.environ.get("ELEVENLABS_API_KEY") else "voz_gratis"
    datos["worker"] = "activo"
    return datos


@app.get("/api/canales")
def api_canales():
    return {"canales": listar_canales()}


@app.post("/api/canales/{canal_id}/toggle")
def api_toggle(canal_id: int, body: ToggleCanal):
    toggle_canal(canal_id, body.activo)
    return {"ok": True, "activo": body.activo}


@app.get("/api/guiones")
def api_guiones(canal_id: int | None = None, solo: str | None = None):
    return {"guiones": listar_guiones(canal_id, solo)}


@app.post("/api/guiones")
def api_nuevo_guion(body: NuevoGuion):
    if body.slot not in ("almuerzo", "noche"):
        raise HTTPException(400, "El horario es almuerzo o noche.")
    if not body.frame1_text.strip() or not body.body_aida.strip() or not body.cta_keyword.strip():
        raise HTTPException(400, "Faltan el gancho, el texto o la palabra clave.")
    gid = insertar_guion(body.model_dump())
    return {"id": gid}


@app.get("/api/guiones/sugerir")
def api_sugerir(canal_id: int, slot: str = "almuerzo"):
    if slot == "ahora":
        slot = "almuerzo" if datetime.now().hour < 13 else "noche"
    guion = sugerir_guion(canal_id, slot)
    if not guion:
        raise HTTPException(404, "Ese canal todavía no tiene un guion para ese horario.")
    return guion


@app.get("/api/cola")
def api_cola():
    return {"cola": listar_cola()}


@app.post("/api/cola/{cola_id}/fijar")
def api_fijar(cola_id: int):
    try:
        fijado = toggle_fijado(cola_id)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    return {"fijado": fijado}


@app.delete("/api/cola/{cola_id}")
def api_quitar(cola_id: int):
    try:
        quitar_de_cola(cola_id)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"ok": True}


@app.get("/api/cola/{cola_id}/video")
def api_ver_video(cola_id: int):
    try:
        ruta = ruta_video_cola(cola_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e
    except PermissionError as e:
        raise HTTPException(403, str(e)) from e
    return FileResponse(ruta, media_type="video/mp4", filename=ruta.name)


@app.post("/api/cola/{cola_id}/publicar")
def api_publicar(cola_id: int):
    try:
        info = marcar_publicado(cola_id)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat = os.environ.get("TELEGRAM_CHAT_ID", "")
    enviado = False
    if token and chat:
        import requests

        try:
            with open(info["output_path"], "rb") as video:
                resp = requests.post(
                    f"https://api.telegram.org/bot{token}/sendDocument",
                    data={"chat_id": chat, "caption": "Video listo de tu Fábrica de Contenido"},
                    files={"document": video},
                    timeout=60,
                )
            enviado = resp.ok
        except Exception:
            enviado = False
    anotar(
        "health_check",
        "verde",
        "✅ Video marcado como publicado." + (" Te lo envié a Telegram." if enviado else " Quedó en tu carpeta de salida."),
    )
    return {"ok": True, "telegram": enviado}


@app.post("/api/generar-prueba")
def api_generar_prueba():
    canal = primer_canal_activo()
    if not canal:
        raise HTTPException(400, "Enciende al menos un canal para hacer la prueba.")
    slot = "almuerzo" if datetime.now().hour < 13 else "noche"
    par = elegir_par_anticolision(canal["id"], slot)
    if not par:
        raise HTTPException(400, "Ese canal no tiene guion y video disponibles para este horario.")
    cola_id = insertar_cola(canal["id"], par["video_id"], par["guion_id"], slot, datetime.now().isoformat(timespec="seconds"))
    task_id = _lanzar(_req_desde_par(canal, par, cola_id, True))
    anotar("health_check", "verde", f"🔵 {canal['emoji']} {canal['nombre']} — empecé un video de prueba ({slot}).")
    return {"task_id": task_id, "cola_id": cola_id, "canal": canal["nombre"], "slot": slot, "gancho": par["frame1_text"]}


@app.post("/api/crear-video")
def api_crear(body: CrearVideo):
    canal = datos_canal(body.canal_id)
    if not canal:
        raise HTTPException(404, "No encuentro ese canal.")
    slot_guion = body.slot if body.slot in ("almuerzo", "noche") else ("almuerzo" if datetime.now().hour < 13 else "noche")
    guion_id = insertar_guion(
        {
            "canal_id": body.canal_id,
            "hook_id": "MANUAL",
            "spoken_hook": body.spoken_hook or body.frame1_text,
            "frame1_text": body.frame1_text,
            "body_aida": body.body_aida,
            "cta_keyword": body.cta_keyword,
            "closing_phrase": body.closing_phrase,
            "activo": body.regalo or "Recurso del canal",
            "slot": slot_guion,
        }
    )

    local = body.local_path.strip()
    tiktok = body.tiktok_url.strip()
    if body.fondo == "pexels":
        ruta = obtener_video_fondo_automatico(canal["nicho"])
        if not ruta:
            raise HTTPException(400, "No pude bajar un video libre. Revisa la clave de Pexels en Configuración.")
        video_id = insertar_video(body.canal_id, "pexels", None, ruta, None)
        local = ruta
        tiktok = ""
    elif body.fondo == "local":
        if not local or not os.path.exists(local):
            raise HTTPException(400, "Sube primero el video de tu computadora.")
        video_id = insertar_video(body.canal_id, "local", None, local, None)
        tiktok = ""
    else:
        if not tiktok and not local:
            fondo = elegir_video_fondo(body.canal_id)
            if not fondo:
                raise HTTPException(400, "Este canal no tiene videos de fondo. Pega un enlace o usa Pexels.")
            video_id = fondo["video_id"]
            tiktok = fondo.get("tiktok_url") or ""
            local = fondo.get("local_path") or ""
        else:
            video_id = insertar_video(body.canal_id, "tiktok_csv" if tiktok else "local", tiktok or None, local or None, None)

    cola_id = insertar_cola(
        body.canal_id,
        video_id,
        guion_id,
        slot_guion,
        datetime.now().isoformat(timespec="seconds"),
    )
    req = ProcesarVideoRequest(
        tiktokUrl=tiktok,
        localVideoPath=local,
        copyForCustomVideo=body.body_aida,
        frame1Text=body.frame1_text,
        spokenHook=body.spoken_hook,
        closingPhrase=body.closing_phrase,
        elevenLabsVoiceId=canal.get("voice_id") or "",
        vozFallback=canal.get("voz_fallback") or "es-MX-DaliaNeural",
        antiCopyright=body.anti_copyright,
        canalId=body.canal_id,
        colaId=cola_id,
        videoId=video_id,
        guionId=guion_id,
    )
    task_id = _lanzar(req)
    return {"task_id": task_id, "cola_id": cola_id}


@app.post("/api/subir-video")
async def api_subir(archivo: UploadFile = File(...)):
    nombre = Path(archivo.filename or "video.mp4").name
    if not nombre.lower().endswith(".mp4"):
        raise HTTPException(400, "Solo acepto archivos .mp4")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    destino = UPLOADS / f"{uuid.uuid4().hex[:8]}_{nombre}"
    contenido = await archivo.read()
    if len(contenido) < 1000:
        raise HTTPException(400, "Ese archivo está vacío.")
    destino.write_bytes(contenido)
    return {"ruta": str(destino)}


class RecibirRankingBody(BaseModel):
    mp4_path: str
    title: str = ""
    caption: str = ""
    miniatura_path: str | None = None
    puestos: list[dict] = []


@app.post("/api/recibir-ranking")
def api_recibir_ranking(body: RecibirRankingBody):
    """Copia el MP4 exportado por Ranking App y lo deja listo como video local."""
    origen = Path(body.mp4_path).expanduser()
    if not origen.is_file():
        raise HTTPException(400, f"No encuentro el MP4: {body.mp4_path}")
    if origen.suffix.lower() not in {".mp4", ".mov", ".webm"}:
        raise HTTPException(400, "El archivo tiene que ser MP4, MOV o WebM.")

    destino_dir = BASE_DIR / "cache" / "desde-ranking"
    destino_dir.mkdir(parents=True, exist_ok=True)
    sello = datetime.now().strftime("%Y%m%d-%H%M%S")
    nombre = f"ranking-{sello}-{origen.stem[:40]}.mp4"
    final = destino_dir / nombre
    temporal = destino_dir / f"{nombre}.tmp"
    shutil.copy2(origen, temporal)
    if final.exists():
        final.unlink()
    temporal.replace(final)

    # Miniatura
    miniatura_final = None
    if body.miniatura_path and Path(body.miniatura_path).is_file():
        jpg_dest = destino_dir / f"{final.stem}.jpg"
        shutil.copy2(Path(body.miniatura_path), jpg_dest)
        miniatura_final = str(jpg_dest)
    else:
        # Generar thumbnail con ffmpeg
        jpg_dest = destino_dir / f"{final.stem}.jpg"
        try:
            cmd = ["ffmpeg", "-y", "-ss", "1.0", "-i", str(final), "-frames:v", "1", "-q:v", "1", str(jpg_dest)]
            subprocess.run(cmd, capture_output=True, timeout=30)
            if jpg_dest.is_file():
                miniatura_final = str(jpg_dest)
        except Exception:
            miniatura_final = None

    meta = {
        "title": body.title or final.stem,
        "caption": body.caption or body.title or final.stem,
        "puestos": body.puestos,
        "origen": str(origen),
        "miniatura": f"{final.stem}.jpg" if miniatura_final else None,
        "recibido_en": datetime.now().isoformat(timespec="seconds"),
        "fuente": "ranking-app",
    }
    (destino_dir / f"{final.stem}.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    video_id = None
    canal_id = None
    if DB_PATH.exists():
        try:
            canal = primer_canal_activo()
            if canal:
                canal_id = int(canal["id"])
                video_id = insertar_video(canal_id, "ranking-app", None, str(final), None)
                anotar(
                    "health_check",
                    "verde",
                    f"Ranking recibido: {body.title or final.name}",
                    str(final),
                )
        except sqlite3.Error:
            video_id = None

    return {
        "ok": True,
        "ruta": str(final),
        "stem": final.stem,
        "video_id": video_id,
        "canal_id": canal_id,
        "mensaje": f"Ranking guardado en Fábrica: {final.name}",
    }


@app.get("/api/rankings")
def api_listar_rankings():
    """Lista todos los rankings recibidos desde ranking-app con sus metadatos."""
    destino_dir = BASE_DIR / "cache" / "desde-ranking"
    if not destino_dir.exists():
        return {"rankings": []}

    items = []
    for json_file in destino_dir.glob("*.json"):
        mp4_file = json_file.with_suffix(".mp4")
        if not mp4_file.is_file():
            continue
        try:
            meta = json.loads(json_file.read_text(encoding="utf-8"))
        except Exception:
            meta = {}
        stem = json_file.stem
        jpg_file = json_file.with_suffix(".jpg")
        items.append({
            "stem": stem,
            "title": meta.get("title") or stem,
            "caption": meta.get("caption") or meta.get("title") or stem,
            "recibido_en": meta.get("recibido_en") or "",
            "tiene_miniatura": jpg_file.is_file(),
            "miniatura_url": f"/api/rankings/{stem}/miniatura" if jpg_file.is_file() else None,
            "video_url": f"/api/rankings/{stem}/video",
            "mp4_path": str(mp4_file.resolve()),
            "tamano_mb": round(mp4_file.stat().st_size / (1024 * 1024), 2),
        })

    items.sort(key=lambda x: x["recibido_en"], reverse=True)
    return {"rankings": items}


@app.get("/api/rankings/{stem}/video")
def api_ranking_video(stem: str):
    destino_dir = BASE_DIR / "cache" / "desde-ranking"
    mp4 = destino_dir / f"{stem}.mp4"
    if not mp4.is_file():
        raise HTTPException(404, "Video no encontrado.")
    return FileResponse(str(mp4), media_type="video/mp4", filename=f"{stem}.mp4")


@app.get("/api/rankings/{stem}/miniatura")
def api_ranking_miniatura(stem: str):
    destino_dir = BASE_DIR / "cache" / "desde-ranking"
    jpg = destino_dir / f"{stem}.jpg"
    if not jpg.is_file():
        raise HTTPException(404, "Miniatura no encontrada.")
    return FileResponse(str(jpg), media_type="image/jpeg", filename=f"{stem}.jpg")


@app.post("/api/rankings/{stem}/enviar-a-babeldesk")
def api_ranking_enviar_babeldesk(stem: str):
    destino_dir = BASE_DIR / "cache" / "desde-ranking"
    mp4 = destino_dir / f"{stem}.mp4"
    if not mp4.is_file():
        raise HTTPException(404, "Video no encontrado.")
    meta = {}
    json_path = destino_dir / f"{stem}.json"
    if json_path.is_file():
        try:
            meta = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    jpg = destino_dir / f"{stem}.jpg"
    miniatura = str(jpg) if jpg.is_file() else None

    try:
        from .babeldesk_entrega import entregar_ranking_en_inbox
    except ImportError:
        from babeldesk_entrega import entregar_ranking_en_inbox

    res = entregar_ranking_en_inbox(
        mp4_path=str(mp4),
        miniatura_path=miniatura,
        title=meta.get("title") or stem,
        caption=meta.get("caption") or meta.get("title") or stem,
    )
    if not res.get("ok"):
        raise HTTPException(500, res.get("error") or "No se pudo entregar en BabelDesk.")
    return res


@app.get("/api/status/{task_id}")
async def api_status_sse(task_id: str):
    async def eventos():
        vistos = None
        for _ in range(450):
            estado = estado_pipeline(task_id)
            if estado:
                paquete = {
                    "paso": estado["paso_actual"],
                    "pct": estado["porcentaje"],
                    "mensaje": estado["mensaje"],
                    "status": estado["status"],
                    "error": estado["error"],
                }
            else:
                paquete = {"paso": 0, "pct": 0, "mensaje": "⏳ Esperando al motor...", "status": "procesando", "error": None}
            firma = json.dumps(paquete, ensure_ascii=False)
            if firma != vistos:
                vistos = firma
            yield f"data: {firma}\n\n"
            if paquete["status"] in ("listo", "publicado", "fallido"):
                break
            await asyncio.sleep(0.8)

    return StreamingResponse(
        eventos(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/memoria")
def memoria():
    return uso_memoria_resumen()


@app.post("/memoria/limpiar")
def memoria_limpiar():
    resultado = limpiar_memoria_historial(forzar=True)
    return resultado


@app.post("/api/config/historial")
def api_historial(body: HistorialDias):
    try:
        guardar_historial_dias(body.dias)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return uso_memoria_resumen()


@app.get("/api/config/claves")
def api_claves():
    return {"claves": claves_enmascaradas(), "memoria": uso_memoria_resumen()}


@app.post("/api/config/claves")
def api_guardar_claves(body: ClavesForm):
    escribir_env(body.model_dump())
    cargar_env_local()
    poller_telegram.conectado = False
    poller_telegram.iniciar()
    anotar("health_check", "verde", "✅ Guardé tus claves en esta computadora. No salen de aquí.")
    return {"ok": True, "claves": claves_enmascaradas()}


@app.get("/api/lote")
def api_lote():
    asegurar_esquema_lote()
    est = resumen_lote()
    est["bot_conectado"] = poller_telegram.conectado
    est["bot_username"] = poller_telegram.bot_username
    return est


class LoteLinkInput(BaseModel):
    url: str
    nota: str = ""
    canal_id: int | None = None


@app.post("/api/lote/agregar")
def api_lote_agregar(body: LoteLinkInput):
    return registrar_link_en_lote(body.url, nota_pablo=body.nota, canal_id=body.canal_id)


_lote_lock = threading.Lock()
_lote_tareas: dict[str, dict] = {}


def _lote_en_background(task_id: str, fn, *args, **kwargs) -> None:
    with _lote_lock:
        try:
            _lote_tareas[task_id] = {"status": "procesando", "result": None, "error": None}
            res = fn(*args, **kwargs)
            _lote_tareas[task_id] = {"status": "listo", "result": res, "error": None}
        except Exception as e:
            _lote_tareas[task_id] = {"status": "fallido", "result": None, "error": str(e)[:500]}


class LoteTandaInput(BaseModel):
    max_items: int = 1


@app.post("/api/lote/procesar-siguiente")
def api_lote_procesar_siguiente():
    task_id = str(uuid.uuid4())[:8]
    threading.Thread(
        target=_lote_en_background,
        args=(task_id, procesar_siguiente_lote),
        daemon=True,
    ).start()
    return {"task_id": task_id, "status": "procesando"}


@app.post("/api/lote/procesar-tanda")
def api_lote_procesar_tanda(body: LoteTandaInput):
    task_id = str(uuid.uuid4())[:8]
    threading.Thread(
        target=_lote_en_background,
        args=(task_id, procesar_tanda_lote),
        kwargs={"max_items": body.max_items},
        daemon=True,
    ).start()
    return {"task_id": task_id, "status": "procesando"}


@app.get("/api/lote/tarea/{task_id}")
def api_lote_tarea(task_id: str):
    tarea = _lote_tareas.get(task_id)
    if not tarea:
        raise HTTPException(404, "Tarea de lote no encontrada")
    return tarea


@app.get("/api/lote/{lote_id}/video")
def api_lote_video(lote_id: int):
    out_dir = (BASE_DIR / "output").resolve()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        row = con.execute(
            "SELECT output_path, estado_fabrica FROM lote_links WHERE id = ?",
            (lote_id,),
        ).fetchone()
    finally:
        con.close()
    if not row or not row["output_path"]:
        raise HTTPException(404, "Ese lote aún no tiene video listo.")
    ruta = Path(row["output_path"]).resolve()
    if not ruta.is_file():
        raise HTTPException(404, "No encontré el archivo en tu carpeta output.")
    try:
        ruta.relative_to(out_dir)
    except ValueError as e:
        raise HTTPException(403, "Ruta de video no permitida.") from e
    return FileResponse(ruta, media_type="video/mp4", filename=ruta.name)


@app.post("/auditar_copyright")
def auditar(req: AuditarRequest):
    ruta = req.videoPath
    if req.tiktokUrl and not ruta:
        ruta = download_tiktok_sin_marca(req.tiktokUrl) or ""
    if ruta and os.path.exists(ruta):
        return auditar_riesgo_copyright(ruta)
    return auditar_riesgo_copyright("")


@app.post("/process_video")
def process_video(req: ProcesarVideoRequest):
    return {"task_id": _lanzar(req)}


@app.get("/check_status/{task_id}")
def check_status(task_id: str):
    tarea = tareas.get(task_id)
    if not tarea:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return tarea


app.mount("/panel", StaticFiles(directory=PANEL_DIR), name="panel")
