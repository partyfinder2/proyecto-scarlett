"""
Servidor local — http://127.0.0.1:5001
Reemplaza al worker externo de Make.com.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .autohealer import limpiar_memoria_historial, registrar_semaforo, uso_memoria_resumen
from .copyright_shield import auditar_riesgo_copyright
from .downloader import download_audio_fondo, download_tiktok_sin_marca
from .renderer import renderizar_video
from .voz import generar_voz

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "automatizaciones.db"
TEMP_DIR = BASE_DIR / "cache" / "temp"

app = FastAPI(title="Fábrica de Contenido — Worker", version="1.0.0")
tareas: dict[str, dict] = {}


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


class AuditarRequest(BaseModel):
    videoPath: str


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
                actualizado_en = excluded.actualizado_en
            """,
            (tarea_id, canal_id, paso, pct, mensaje, status, error, datetime.now().isoformat()),
        )
        con.commit()
    finally:
        con.close()


def _resolver_video_fondo(req: ProcesarVideoRequest) -> str:
    if req.localVideoPath and os.path.exists(req.localVideoPath):
        return req.localVideoPath
    if req.tiktokUrl:
        path = download_tiktok_sin_marca(req.tiktokUrl)
        if path:
            return path
        raise ValueError(f"Link TikTok roto o expirado: {req.tiktokUrl}")
    raise ValueError("Necesitas un link de TikTok o una ruta local de video (.mp4).")


def _worker_con_pasos(task_id: str, req: ProcesarVideoRequest) -> None:
    temp_dir = TEMP_DIR / task_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    voice_path = str(temp_dir / "voz.mp3")

    try:
        actualizar_paso(task_id, 1, 15, "✍️ Preparando guion (gancho 0–3s)...", canal_id=req.canalId)

        texto_voz = req.copyForCustomVideo
        if req.spokenHook or req.closingPhrase:
            texto_voz = " ".join(p for p in (req.spokenHook, req.copyForCustomVideo, req.closingPhrase) if p)

        actualizar_paso(task_id, 2, 35, "🎙️ Grabando voz con IA...", canal_id=req.canalId)
        vid = req.elevenLabsVoiceId or None
        resultado_voz = generar_voz(texto_voz, voice_path, voice_id=vid, voz_fallback=req.vozFallback)

        actualizar_paso(task_id, 3, 50, "⬇️ Descargando video de fondo...", canal_id=req.canalId)
        video_path = _resolver_video_fondo(req)
        if req.antiCopyright:
            auditar_riesgo_copyright(video_path)

        music_path = download_audio_fondo(req.backgroundMusicTiktokUrl or None)

        actualizar_paso(task_id, 3, 65, "🎬 Armando video 9:16 y pegando subtítulos...", canal_id=req.canalId)
        output_file = f"video_{task_id}.mp4"
        output_path = renderizar_video(
            video_path=video_path,
            music_path=music_path,
            voice_path=resultado_voz["ruta_audio"],
            frame1_text=req.frame1Text,
            palabras=resultado_voz["palabras"],
            output_filename=output_file,
            anti_copyright=req.antiCopyright,
        )

        actualizar_paso(task_id, 4, 80, "🛡️ Bot Guardián verificando calidad...", canal_id=req.canalId)
        if not os.path.exists(output_path) or os.path.getsize(output_path) < 500_000:
            raise ValueError("El video renderizado está vacío o corrupto.")

        # Limpiar voz temporal del task (el .ass ya se borró en renderer)
        try:
            Path(voice_path).unlink(missing_ok=True)
        except OSError:
            pass

        actualizar_paso(task_id, 5, 90, "📅 Video listo en tu carpeta de salida.", status="listo", canal_id=req.canalId)
        tareas[task_id] = {
            "status": "listo",
            "result": output_path,
            "error": None,
            "fuente_voz": resultado_voz.get("fuente"),
        }
    except Exception as e:
        actualizar_paso(
            task_id,
            0,
            0,
            "🚨 Algo falló. El bot lo está revisando.",
            status="fallido",
            error=str(e),
            canal_id=req.canalId,
        )
        tareas[task_id] = {"status": "fallido", "result": None, "error": str(e)}
        registrar_semaforo("worker_caido", detalle_tecnico=str(e))


@app.get("/health")
def health():
    return {"status": "vivo", "hora": datetime.now().isoformat()}


@app.get("/memoria")
def memoria():
    return uso_memoria_resumen()


@app.post("/memoria/limpiar")
def memoria_limpiar():
    return limpiar_memoria_historial(forzar=True)


@app.post("/auditar_copyright")
def auditar(req: AuditarRequest):
    if not os.path.exists(req.videoPath):
        raise HTTPException(status_code=404, detail="No encuentro ese archivo de video.")
    return auditar_riesgo_copyright(req.videoPath)


@app.post("/process_video")
def process_video(req: ProcesarVideoRequest):
    task_id = str(uuid.uuid4())[:8]
    tareas[task_id] = {"status": "procesando", "result": None, "error": None}
    actualizar_paso(task_id, 0, 0, "🔄 Iniciando el proceso...", canal_id=req.canalId)
    threading.Thread(target=_worker_con_pasos, args=(task_id, req), daemon=True).start()
    return {"task_id": task_id}


@app.get("/check_status/{task_id}")
def check_status(task_id: str):
    tarea = tareas.get(task_id)
    if not tarea:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return tarea
