"""Módulo 5 — API FastAPI (puerto 5002) para ranking-app."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import urllib.error
import urllib.request

from fastapi import Body, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from babeldesk_entrega import entregar_ranking_en_inbox
from proyecto import (
    PROYECTOS_DIR,
    ClipProyecto,
    ErrorProyecto,
    ProyectoRanking,
    cargar_proyecto,
    copiar_proyecto_junto_a_export,
    guardar_proyecto,
    numero_puesto,
    proyecto_a_opciones_export,
    validar_para_exportar,
)
from render.exportar import ErrorExportar, cancelar_export, exportar_ranking
from render.ffmpeg_bin import resolver_ffmpeg
from render.overlay import frase_lista, generar_overlay_png
from render.segmentos import ErrorSegmento, inspeccionar_clip

BASE_DIR = Path(__file__).resolve().parent
PANEL_DIR = BASE_DIR / "panel"
CACHE_THUMBS = BASE_DIR / "cache" / "thumbs"
CACHE_CLIPS = BASE_DIR / "cache" / "clips"
CACHE_PREVIEWS = BASE_DIR / "cache" / "previews"
EXTENSIONES = {".mp4", ".mov", ".webm"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
CACHE_AUDIO = BASE_DIR / "cache" / "audio"
CACHE_IMAGENES = BASE_DIR / "cache" / "imagenes"
IMAGEN_EXT = {".png", ".webp", ".jpg", ".jpeg"}

_export_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_proyecto_lock = threading.Lock()
_REV_PATH = PROYECTOS_DIR / ".revision"
BUILD = "2026-11-13-sync1"

app = FastAPI(title="Ranking App", version="1.0.0")
# BabelDesk corre en file:// (origen "null"). Sin reflejar ese origen, el preflight OPTIONS del fetch falla.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(null|file://.*|https?://(127\.0\.0\.1|localhost)(:\d+)?)$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_panel(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if (
        path == "/"
        or path.startswith("/static")
        or path.startswith("/api/proyecto")
        or path == "/health"
    ):
        response.headers["Cache-Control"] = "no-store, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response


class ImportarBody(BaseModel):
    paths: list[str] = Field(default_factory=list)


class OverlayPreviewBody(BaseModel):
    title: str = "Mi ranking"
    preset: str = "classic"
    accent: str = "#FACC15"
    clip_index: int = 0
    clips: list[dict] = Field(default_factory=list)


class ExportarBody(BaseModel):
    proyecto: ProyectoRanking | None = None
    preview: bool = False


class EnviarBabelDeskBody(BaseModel):
    mp4_path: str
    miniatura_path: str | None = None
    proyecto: ProyectoRanking | None = None


class EnviarFabricaBody(BaseModel):
    mp4_path: str
    miniatura_path: str | None = None
    proyecto: ProyectoRanking | None = None


class GuardarMiniaturaBody(BaseModel):
    data_url: str
    mp4_path: str | None = None


class AbrirCarpetaBody(BaseModel):
    ruta: str


def obtener_estado_export(job_id: str) -> dict[str, Any] | None:
    with _jobs_lock:
        return dict(_export_jobs.get(job_id) or {}) or None


def _actualizar_job(job_id: str, **kwargs: Any) -> None:
    with _jobs_lock:
        job = _export_jobs.setdefault(
            job_id,
            {"step": 0, "total": 1, "msg": "En cola…", "done": False, "ok": False},
        )
        job.update(kwargs)


def _ffmpeg_miniatura(ruta_video: str, destino_jpg: Path, segundo: float = 1.0) -> None:
    destino_jpg.parent.mkdir(parents=True, exist_ok=True)
    ss = max(0.0, segundo)
    cmd = [
        resolver_ffmpeg(),
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{ss:.3f}",
        "-i",
        ruta_video,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        str(destino_jpg),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0 or not destino_jpg.is_file():
        raise ErrorSegmento(
            "No pude generar la miniatura de este clip. Revisa que el video no esté dañado."
        )


def _clip_desde_archivo(path: Path, *, copiar_a_cache: bool = False) -> dict:
    if path.suffix.lower() not in EXTENSIONES:
        raise HTTPException(
            status_code=400,
            detail=f'Formato no admitido ({path.suffix}). Usa MP4, MOV o WebM.',
        )
    archivo = path
    if copiar_a_cache:
        CACHE_CLIPS.mkdir(parents=True, exist_ok=True)
        clip_id_tmp = uuid.uuid4().hex[:10]
        archivo = CACHE_CLIPS / f"{clip_id_tmp}{path.suffix.lower()}"
        archivo.write_bytes(path.read_bytes())

    try:
        meta = inspeccionar_clip(str(archivo))
    except ErrorSegmento as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    clip_id = uuid.uuid4().hex[:10]
    thumb = CACHE_THUMBS / f"{clip_id}.jpg"
    segundo = 0.5 if meta["duracion"] <= 0 else min(1.5, meta["duracion"] * 0.15)
    try:
        _ffmpeg_miniatura(str(archivo), thumb, segundo)
    except ErrorSegmento as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    dur = float(meta["duracion"] or 5.0)
    trim_out = min(dur, 60.0) if dur > 0 else 5.0

    return {
        "id": clip_id,
        "path": str(archivo.resolve()),
        "label": path.stem[:80] or "Clip",
        "textoLista": "",
        "trimIn": 0.0,
        "trimOut": trim_out,
        "keepAudio": False,
        "duracion": dur,
        "width": meta["width"],
        "height": meta["height"],
        "tiene_audio": meta["tiene_audio"],
        "miniatura": f"/api/miniatura/{clip_id}",
    }


def _buscar_clip_en_proyecto(clip_id: str) -> ClipProyecto:
    proyecto = cargar_proyecto()
    for c in proyecto.clips:
        if c.id == clip_id:
            return c
    raise HTTPException(status_code=404, detail="No encuentro ese clip en el proyecto.")


def _ruta_miniatura(clip_id: str) -> Path:
    p = CACHE_THUMBS / f"{clip_id}.jpg"
    if not p.is_file():
        raise HTTPException(status_code=404, detail="No hay miniatura para ese clip.")
    return p


def _ejecutar_export_en_hilo(job_id: str, proyecto: ProyectoRanking, preview: bool = False) -> None:
    try:
        validar_para_exportar(proyecto)
        opciones = proyecto_a_opciones_export(proyecto)
        opciones.preview = preview

        def on_progress(step: int, total: int, msg: str) -> None:
            _actualizar_job(job_id, step=step, total=total, msg=msg)

        _actualizar_job(job_id, msg="Iniciando exportación…", total=max(6, len(proyecto.clips) * 2 + 3))
        result = exportar_ranking(opciones, on_progress=on_progress, job_id=job_id)
        if not preview:
            copiar_proyecto_junto_a_export(result["output_path"], proyecto)
        _actualizar_job(
            job_id,
            done=True,
            ok=True,
            msg="Listo",
            result=result,
        )
    except (ErrorProyecto, ErrorExportar) as e:
        _actualizar_job(job_id, done=True, ok=False, error=str(e), msg=str(e))
    except Exception as e:
        _actualizar_job(
            job_id,
            done=True,
            ok=False,
            error=f"Error inesperado al exportar: {e}",
            msg="Falló la exportación.",
        )


def _payload_babeldesk(proyecto: ProyectoRanking) -> dict:
    puestos = [
        {"puesto": numero_puesto(i, len(proyecto.clips)), "nombre": c.label}
        for i, c in enumerate(proyecto.clips)
    ]
    lineas = [proyecto.title, ""]
    for p in puestos:
        lineas.append(f"#{p['puesto']} {p['nombre']}")
    return {
        "title": proyecto.title,
        "caption": "\n".join(lineas).strip(),
        "fuente": "ranking-app",
        "puestos": puestos,
    }


def _leer_revision() -> int:
    try:
        return int(_REV_PATH.read_text(encoding="utf-8").strip() or "0")
    except (OSError, ValueError):
        return 0


def _avanzar_revision() -> int:
    PROYECTOS_DIR.mkdir(parents=True, exist_ok=True)
    n = _leer_revision() + 1
    tmp = _REV_PATH.with_suffix(".revision.tmp")
    tmp.write_text(str(n), encoding="utf-8")
    tmp.replace(_REV_PATH)
    return n


def _conflicto_proyecto(actual: ProyectoRanking) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "ok": False,
            "error": "desactualizado",
            "detail": "Llegó un clip desde BabelDesk. Recargué la lista para no borrarla.",
            "revision": _leer_revision(),
            "clips": len(actual.clips),
            "proyecto": actual.model_dump(mode="json", by_alias=True),
        },
    )


def _guardar_bajo_candado(proyecto: ProyectoRanking) -> tuple[Path, int]:
    ruta = guardar_proyecto(proyecto)
    revision = _avanzar_revision()
    return ruta, revision


@app.get("/")
def pagina_principal() -> FileResponse:
    index = PANEL_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=500, detail="Falta panel/index.html")
    return FileResponse(index, headers={"Cache-Control": "no-store, max-age=0"})


@app.get("/static/{asset_path:path}")
def panel_estatico(asset_path: str) -> FileResponse:
    raiz = PANEL_DIR.resolve()
    destino = (PANEL_DIR / asset_path).resolve()
    if not destino.is_file() or raiz not in destino.parents:
        raise HTTPException(status_code=404, detail="No encuentro ese archivo del panel.")
    media = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
    }.get(destino.suffix.lower())
    return FileResponse(
        destino,
        media_type=media,
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "build": BUILD}


@app.get("/api/proyecto")
def api_get_proyecto() -> dict:
    p = cargar_proyecto()
    return p.model_dump(mode="json", by_alias=True)


@app.post("/api/proyecto")
def api_post_proyecto(proyecto: ProyectoRanking) -> JSONResponse:
    with _proyecto_lock:
        actual = cargar_proyecto()
        rev = _leer_revision()
        # El panel abierto manda su copia vieja (a veces con clips vacíos) y pisa el import.
        if proyecto.revision is not None and proyecto.revision != rev:
            return _conflicto_proyecto(actual)
        if (
            proyecto.revision is None
            and len(proyecto.clips) == 0
            and len(actual.clips) > 0
            and not proyecto.vaciar
        ):
            return _conflicto_proyecto(actual)
        ruta, nueva = _guardar_bajo_candado(proyecto)
    return JSONResponse(
        {
            "ok": True,
            "ruta": str(ruta),
            "revision": nueva,
            "clips": len(proyecto.clips),
            "proyecto": proyecto.model_dump(mode="json", by_alias=True),
        }
    )


@app.post("/api/importar")
async def api_importar(request: Request) -> dict:
    nuevos: list[dict] = []
    content_type = (request.headers.get("content-type") or "").lower()

    if "application/json" in content_type:
        data = await request.json()
        body = ImportarBody.model_validate(data if isinstance(data, dict) else {})
        for raw in body.paths:
            path = Path(raw).expanduser()
            if not path.is_file():
                raise HTTPException(status_code=400, detail=f"No encuentro el archivo: {raw}")
            nuevos.append(_clip_desde_archivo(path, copiar_a_cache=False))
    elif "multipart/form-data" in content_type:
        form = await request.form()
        rutas_raw = form.get("paths")
        if rutas_raw:
            try:
                lista = json.loads(str(rutas_raw))
                if isinstance(lista, list):
                    for raw in lista:
                        path = Path(str(raw)).expanduser()
                        if path.is_file():
                            nuevos.append(_clip_desde_archivo(path, copiar_a_cache=False))
            except json.JSONDecodeError:
                pass
        CACHE_CLIPS.mkdir(parents=True, exist_ok=True)
        for _key, value in form.multi_items():
            if not hasattr(value, "filename"):
                continue
            up: UploadFile = value  # type: ignore[assignment]
            if not up.filename:
                continue
            ext = Path(up.filename).suffix.lower()
            if ext not in EXTENSIONES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Archivo rechazado ({up.filename}): solo MP4, MOV o WebM.",
                )
            temporal = CACHE_CLIPS / f"upload_{uuid.uuid4().hex[:8]}{ext}"
            temporal.write_bytes(await up.read())
            nuevos.append(_clip_desde_archivo(temporal, copiar_a_cache=False))
    else:
        raise HTTPException(
            status_code=400,
            detail="Usa JSON (`paths`) o multipart con archivos de video.",
        )

    if not nuevos:
        raise HTTPException(
            status_code=400,
            detail="Indica rutas locales en JSON (`paths`) o sube uno o más videos.",
        )
    return {"ok": True, "clips": nuevos}


class ImportarYGuardarBody(BaseModel):
    paths: list[str] = Field(default_factory=list)
    al_inicio: bool = False  # Si True, agrega al inicio (puesto más alto)


@app.post("/api/importar-y-guardar")
async def api_importar_y_guardar(body: ImportarYGuardarBody) -> dict:
    """
    Importa clips Y los guarda en ultimo_proyecto.json.
    Usado por BabelDesk para enviar videos directo a Ranking App.
    """
    if not body.paths:
        raise HTTPException(status_code=400, detail="Indica al menos una ruta de video.")

    nuevos: list[dict] = []
    for raw in body.paths:
        path = Path(raw).expanduser()
        if not path.is_file():
            raise HTTPException(status_code=400, detail=f"No encuentro el archivo: {raw}")
        nuevos.append(_clip_desde_archivo(path, copiar_a_cache=False))

    if not nuevos:
        raise HTTPException(status_code=400, detail="No se pudo importar ningún video.")

    with _proyecto_lock:
        proyecto = cargar_proyecto()
        if len(proyecto.clips) + len(nuevos) > 10:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El ranking ya tiene {len(proyecto.clips)} clips y el máximo es 10. "
                    "Vacía la lista o quita alguno antes de enviar más."
                ),
            )
        entrantes = [
            ClipProyecto(
                id=clip_meta["id"],
                path=clip_meta["path"],
                label=clip_meta.get("label", "Sin nombre"),
                texto_lista=clip_meta.get("textoLista", ""),
                trim_in=clip_meta.get("trimIn", 0.0),
                trim_out=clip_meta.get("trimOut", 5.0),
                keep_audio=clip_meta.get("keepAudio", False),
            )
            for clip_meta in nuevos
        ]
        if body.al_inicio:
            proyecto.clips[0:0] = entrantes
        else:
            # Al final de la lista: el clip nuevo queda como #1.
            proyecto.clips.extend(entrantes)
        ruta, revision = _guardar_bajo_candado(proyecto)

    return {
        "ok": True,
        "clips_agregados": len(nuevos),
        "total_clips": len(proyecto.clips),
        "revision": revision,
        "proyecto_guardado": str(ruta),
        "clips": nuevos,
    }


@app.get("/api/proyecto/version")
def api_proyecto_version() -> dict:
    """Hash + revisión para que el panel detecte imports de BabelDesk."""
    p = cargar_proyecto()
    contenido = p.model_dump_json(by_alias=True)
    h = hashlib.md5(contenido.encode()).hexdigest()[:12]
    return {"version": h, "clips": len(p.clips), "revision": _leer_revision()}


@app.post("/api/importar-imagen")
async def api_importar_imagen(request: Request) -> dict:
    content_type = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in content_type:
        raise HTTPException(status_code=400, detail="Sube una imagen PNG en multipart.")
    form = await request.form()
    tipo = str(form.get("tipo") or "watermark").strip().lower()
    archivo = None
    for _k, value in form.multi_items():
        if hasattr(value, "filename") and value.filename:
            archivo = value
            break
    if not archivo:
        raise HTTPException(status_code=400, detail="No recibí ninguna imagen.")
    up: UploadFile = archivo  # type: ignore[assignment]
    ext = Path(up.filename or "").suffix.lower()
    if ext not in IMAGEN_EXT:
        raise HTTPException(status_code=400, detail="Usa PNG, JPG o WebP.")
    CACHE_IMAGENES.mkdir(parents=True, exist_ok=True)
    destino = CACHE_IMAGENES / f"{tipo}_{uuid.uuid4().hex[:10]}{ext}"
    destino.write_bytes(await up.read())
    return {"ok": True, "path": str(destino.resolve()), "tipo": tipo}


@app.post("/api/importar-audio")
async def api_importar_audio(request: Request) -> dict:
    content_type = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" not in content_type:
        raise HTTPException(status_code=400, detail="Sube un archivo de audio en multipart.")
    form = await request.form()
    tipo = str(form.get("tipo") or "music").strip().lower()
    archivo = None
    for _k, value in form.multi_items():
        if hasattr(value, "filename") and value.filename:
            archivo = value
            break
    if not archivo:
        raise HTTPException(status_code=400, detail="No recibí ningún archivo de audio.")
    up: UploadFile = archivo  # type: ignore[assignment]
    ext = Path(up.filename or "").suffix.lower()
    if ext not in AUDIO_EXT:
        raise HTTPException(
            status_code=400,
            detail="Formato de audio no admitido. Prueba MP3, WAV, M4A o AAC.",
        )
    CACHE_AUDIO.mkdir(parents=True, exist_ok=True)
    destino = CACHE_AUDIO / f"{tipo}_{uuid.uuid4().hex[:10]}{ext}"
    destino.write_bytes(await up.read())
    return {"ok": True, "path": str(destino.resolve()), "tipo": tipo}


@app.get("/api/miniatura/{clip_id}")
def api_miniatura(clip_id: str) -> FileResponse:
    return FileResponse(_ruta_miniatura(clip_id), media_type="image/jpeg")


@app.get("/api/clip/{clip_id}")
def api_clip(clip_id: str) -> FileResponse:
    clip = _buscar_clip_en_proyecto(clip_id)
    path = Path(clip.path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="El archivo del clip ya no está en disco.")
    media = "video/mp4"
    if path.suffix.lower() == ".mov":
        media = "video/quicktime"
    elif path.suffix.lower() == ".webm":
        media = "video/webm"
    return FileResponse(path, media_type=media)


@app.post("/api/overlay-preview")
def api_overlay_preview(body: OverlayPreviewBody) -> FileResponse:
    if not body.clips:
        raise HTTPException(status_code=400, detail="Necesitas al menos un clip para la vista previa.")
    idx = max(0, min(body.clip_index, len(body.clips) - 1))
    total = len(body.clips)
    puestos: list[tuple[int, str]] = []
    for i, c in enumerate(body.clips):
        if "textoLista" in c and c.get("textoLista") is not None:
            explicito = str(c.get("textoLista") or "")
        elif "texto_lista" in c and c.get("texto_lista") is not None:
            explicito = str(c.get("texto_lista") or "")
        else:
            explicito = None
        label = str(c.get("label") or "")
        puestos.append((numero_puesto(i, total), frase_lista(explicito, label)))
    num = puestos[idx][0]
    nombre = puestos[idx][1]
    CACHE_PREVIEWS.mkdir(parents=True, exist_ok=True)
    nombre_archivo = f"preview_{uuid.uuid4().hex[:10]}.png"
    destino = CACHE_PREVIEWS / nombre_archivo
    generar_overlay_png(
        destino,
        titulo_ranking=body.title,
        numero_puesto=num,
        nombre_puesto=nombre,
        todos_los_puestos=puestos,
        preset=body.preset,
        accent=body.accent,
    )
    return FileResponse(destino, media_type="image/png")


@app.post("/api/exportar")
def api_exportar(body: ExportarBody | None = None) -> dict:
    proyecto = (body.proyecto if body and body.proyecto else None) or cargar_proyecto()
    try:
        validar_para_exportar(proyecto)
    except ErrorProyecto as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    job_id = uuid.uuid4().hex[:8]
    _actualizar_job(job_id, step=0, total=1, msg="En cola…", done=False, ok=False)
    threading.Thread(
        target=_ejecutar_export_en_hilo,
        args=(job_id, proyecto, bool(body and body.preview)),
        daemon=True,
        name=f"export-{job_id}",
    ).start()
    return {"ok": True, "job_id": job_id}


@app.get("/api/exportar/progreso/{job_id}")
async def api_exportar_progreso(job_id: str) -> StreamingResponse:
    async def generador():
        ultimo = ""
        while True:
            job = obtener_estado_export(job_id)
            if not job:
                payload = {"error": "No encuentro esa exportación.", "done": True, "ok": False}
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                break
            data = json.dumps(job, ensure_ascii=False)
            if data != ultimo:
                yield f"data: {data}\n\n"
                ultimo = data
            if job.get("done"):
                break
            await asyncio.sleep(0.35)

    return StreamingResponse(generador(), media_type="text/event-stream")


@app.post("/api/exportar/cancelar/{job_id}")
def api_exportar_cancelar(job_id: str) -> dict:
    cancelado = cancelar_export(job_id)
    _actualizar_job(job_id, done=True, ok=False, msg="Cancelado", error="Exportación cancelada.")
    return {"ok": cancelado, "job_id": job_id}


@app.post("/api/enviar-a-babeldesk")
def api_enviar_babeldesk(body: EnviarBabelDeskBody) -> JSONResponse:
    mp4 = Path(body.mp4_path)
    if not mp4.is_file():
        raise HTTPException(status_code=400, detail=f"No encuentro el MP4: {body.mp4_path}")

    proyecto = body.proyecto or cargar_proyecto()
    miniatura = body.miniatura_path
    if not miniatura or not Path(miniatura).is_file():
        thumb = CACHE_THUMBS / f"export_{mp4.stem}.jpg"
        try:
            _ffmpeg_miniatura(str(mp4), thumb, 0.5)
            miniatura = str(thumb)
        except ErrorSegmento:
            miniatura = None

    payload = _payload_babeldesk(proyecto)
    resultado = entregar_ranking_en_inbox(str(mp4), miniatura, payload)
    status = 200 if resultado.get("ok") else 400
    return JSONResponse(content=resultado, status_code=status)


def _puestos_para_fabrica(proyecto: ProyectoRanking) -> list[dict]:
    total = len(proyecto.clips)
    filas: list[dict] = []
    for i, clip in enumerate(proyecto.clips):
        filas.append(
            {
                "puesto": numero_puesto(i, total),
                "label": clip.label,
                "path": clip.path,
            }
        )
    return filas


@app.post("/api/enviar-a-fabrica")
def api_enviar_fabrica(body: EnviarFabricaBody) -> JSONResponse:
    mp4 = Path(body.mp4_path)
    if not mp4.is_file():
        raise HTTPException(status_code=400, detail=f"No encuentro el MP4: {body.mp4_path}")

    proyecto = body.proyecto or cargar_proyecto()
    payload = {
        "mp4_path": str(mp4),
        "title": proyecto.title,
        "caption": proyecto.title,
        "puestos": _puestos_para_fabrica(proyecto),
    }
    if body.miniatura_path and Path(body.miniatura_path).is_file():
        payload["miniatura_path"] = body.miniatura_path
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        "http://127.0.0.1:5001/api/recibir-ranking",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
            respuesta = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalle = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"Fábrica respondió {e.code}: {detalle[:400]}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(
            status_code=502,
            detail="Fábrica de Contenido no está abierta en el puerto 5001.",
        ) from e
    status = 200 if respuesta.get("ok") else 502
    return JSONResponse(content=respuesta, status_code=status)


@app.post("/api/abrir-carpeta")
def api_abrir_carpeta(body: AbrirCarpetaBody) -> dict:
    carpeta = Path(body.ruta).expanduser()
    if not carpeta.is_absolute():
        carpeta = BASE_DIR / carpeta
    if not carpeta.is_dir():
        if carpeta.is_file():
            carpeta = carpeta.parent
        else:
            raise HTTPException(status_code=400, detail=f"No encuentro la carpeta: {body.ruta}")
    try:
        subprocess.Popen(["explorer", str(carpeta)])  # noqa: S603
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"No pude abrir el Explorador: {e}") from e
    return {"ok": True, "ruta": str(carpeta)}


@app.get("/api/exportar/estado/{job_id}")
def api_exportar_estado(job_id: str) -> dict:
    job = obtener_estado_export(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="No encuentro esa exportación.")
    return job


@app.get("/api/exportar/video/{job_id}")
def api_exportar_video(job_id: str) -> FileResponse:
    job = obtener_estado_export(job_id)
    if not job or not job.get("done") or not job.get("ok"):
        raise HTTPException(status_code=404, detail="El video aún no está listo.")
    out = (job.get("result") or {}).get("output_path")
    if not out or not Path(out).is_file():
        raise HTTPException(status_code=404, detail="No encuentro el MP4 generado.")
    return FileResponse(out, media_type="video/mp4")


@app.post("/api/miniatura/guardar")
def api_miniatura_guardar(body: GuardarMiniaturaBody) -> dict:
    raw = (body.data_url or "").strip()
    if "," in raw and raw.startswith("data:image/"):
        raw = raw.split(",", 1)[1]
    try:
        img_bytes = base64.b64decode(raw, validate=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Imagen de miniatura inválida.") from e

    CACHE_THUMBS.mkdir(parents=True, exist_ok=True)
    stem = Path(body.mp4_path).stem if body.mp4_path else f"custom_{int(time.time())}"
    destino = CACHE_THUMBS / f"thumb_{stem}.jpg"
    destino.write_bytes(img_bytes)

    if body.mp4_path:
        mp4 = Path(body.mp4_path)
        if mp4.parent.is_dir():
            junto = mp4.with_name(f"{mp4.stem}_thumb.jpg")
            junto.write_bytes(img_bytes)

    return {"ok": True, "miniatura_path": str(destino)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5002, log_level="error")
