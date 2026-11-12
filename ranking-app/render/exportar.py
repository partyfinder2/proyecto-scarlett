"""Módulo 3 — export MP4: normalizar, overlay PNG, concat, música/sting, cancelación."""
from __future__ import annotations

import json
import subprocess
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable

from .ffmpeg_bin import resolver_ffmpeg, resolver_ffprobe
from .overlay import frase_lista, generar_overlay_png
from .segmentos import ErrorSegmento, inspeccionar_clip
from .sting import STING_PATH, asegurar_sting_default

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_EXPORT = BASE_DIR / "cache" / "export"
OUTPUT_DEFAULT = BASE_DIR / "output"


class ErrorExportar(RuntimeError):
    pass


@dataclass
class ClipExport:
    path: str
    label: str
    trim_in: float = 0.0
    trim_out: float = 5.0
    keep_audio: bool = False
    id: str = ""
    texto_lista: str | None = None


@dataclass
class OpcionesExport:
    titulo: str
    clips: list[ClipExport]
    preset: str = "classic"
    accent: str = "#FACC15"
    framing: str = "fill"
    music_path: str | None = None
    music_volume: float = 0.25
    sting_path: str | None = None
    sting_volume: float = 0.8
    usar_sting_en_cortes: bool = True
    output_dir: str | None = None
    hook_enabled: bool = False
    hook_clip_id: str | None = None
    hook_seconds: float = 1.5
    voiceover_path: str | None = None
    voiceover_volume: float = 1.0
    watermark_path: str | None = None
    watermark_opacity: float = 0.85
    preview: bool = False


ProgressCb = Callable[[int, int, str], None]


class ExportSession:
    """Controla un FFmpeg activo para permitir cancelación limpia."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._proc: subprocess.Popen | None = None
        self.cancelado = False
        self.salida_parcial: Path | None = None
        self.temp_dir: Path | None = None

    def registrar_proceso(self, proc: subprocess.Popen, salida: Path | None = None) -> None:
        with self._lock:
            self._proc = proc
            if salida:
                self.salida_parcial = salida

    def liberar_proceso(self) -> None:
        with self._lock:
            self._proc = None

    def solicitar_cancelacion(self) -> None:
        self.cancelado = True
        with self._lock:
            if self._proc and self._proc.poll() is None:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self._proc.kill()

    def limpiar_parcial(self) -> None:
        if self.salida_parcial and self.salida_parcial.exists():
            try:
                self.salida_parcial.unlink()
            except OSError:
                pass
        if self.temp_dir and self.temp_dir.exists():
            for f in self.temp_dir.glob("*"):
                try:
                    f.unlink()
                except OSError:
                    pass
            try:
                self.temp_dir.rmdir()
            except OSError:
                pass


_sesiones: dict[str, ExportSession] = {}


def obtener_sesion(job_id: str) -> ExportSession | None:
    return _sesiones.get(job_id)


def cancelar_export(job_id: str) -> bool:
    ses = _sesiones.get(job_id)
    if not ses:
        return False
    ses.solicitar_cancelacion()
    ses.limpiar_parcial()
    return True


def _ejecutar(
    cmd: list[str],
    ses: ExportSession,
    salida: Path | None = None,
    timeout: int = 1800,
) -> None:
    if ses.cancelado:
        raise ErrorExportar("Exportación cancelada.")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    ses.registrar_proceso(proc, salida)
    try:
        _, err = proc.communicate(timeout=timeout)
        if ses.cancelado:
            raise ErrorExportar("Exportación cancelada.")
        if proc.returncode != 0:
            raise ErrorExportar(f"FFmpeg falló: {(err or '')[-500:]}")
    finally:
        ses.liberar_proceso()


def _numero_puesto(index: int, total: int) -> int:
    return total - index


def _lista_puestos(clips: list[ClipExport]) -> list[tuple[int, str]]:
    n = len(clips)
    return [(_numero_puesto(i, n), frase_lista(c.texto_lista, c.label)) for i, c in enumerate(clips)]


def _clip_hook(opciones: OpcionesExport) -> tuple[ClipExport, int, float] | None:
    if not opciones.hook_enabled:
        return None
    sec = max(0.5, min(2.0, float(opciones.hook_seconds)))
    if not opciones.clips:
        return None
    idx = len(opciones.clips) - 1
    if opciones.hook_clip_id:
        for i, c in enumerate(opciones.clips):
            if c.id and c.id == opciones.hook_clip_id:
                idx = i
                break
    base = opciones.clips[idx]
    fin = min(float(base.trim_out), float(base.trim_in) + sec)
    hook = ClipExport(
        path=base.path,
        label=base.label,
        trim_in=float(base.trim_in),
        texto_lista=base.texto_lista,
        trim_out=fin,
        keep_audio=base.keep_audio,
    )
    dur = fin - float(base.trim_in)
    return hook, idx, dur


def _validar_clips(clips: list[ClipExport]) -> None:
    if len(clips) < 1:
        raise ErrorExportar("Agrega al menos un clip para exportar.")
    for i, c in enumerate(clips):
        dur = float(c.trim_out) - float(c.trim_in)
        if dur <= 0.2:
            raise ErrorExportar(f"El clip #{i + 1} está recortado demasiado corto.")
        if dur > 60.0:
            raise ErrorExportar(f"El clip #{i + 1} pasa de 60 s. Recórtalo antes de exportar.")


def _vf_puesto(framing: str, ancho: int = 1080, alto: int = 1920) -> str:
    if (framing or "fill").lower() == "fit":
        return (
            f"scale={ancho}:{alto}:force_original_aspect_ratio=decrease:flags=lanczos,"
            f"pad={ancho}:{alto}:(ow-iw)/2:(oh-ih)/2:color=black,"
            "fps=30,format=yuv420p,setsar=1"
        )
    return (
        f"scale={ancho}:{alto}:force_original_aspect_ratio=increase:flags=lanczos,"
        f"crop={ancho}:{alto},fps=30,format=yuv420p,setsar=1"
    )


def _render_puesto(
    ffmpeg: str,
    clip: ClipExport,
    overlay_png: Path,
    video_out: Path,
    framing: str,
    ses: ExportSession,
) -> None:
    """Un solo encode 1080×1920. CRF 17 conserva el detalle del original."""
    duracion = float(clip.trim_out) - float(clip.trim_in)
    meta = inspeccionar_clip(clip.path)
    usar_audio = bool(clip.keep_audio and meta["tiene_audio"])
    ancho, alto = 1080, 1920
    vf = _vf_puesto(framing, ancho, alto)
    video = (
        f"[0:v]{vf}[base];"
        f"[1:v]scale={ancho}:{alto}:flags=lanczos,format=rgba[ov];"
        f"[base][ov]overlay=0:0:format=auto[v]"
    )
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        str(clip.trim_in),
        "-i",
        clip.path,
        "-i",
        str(overlay_png),
    ]
    if usar_audio:
        cmd.extend(
            [
                "-t",
                str(duracion),
                "-filter_complex",
                video + ";[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a]",
                "-map",
                "[v]",
                "-map",
                "[a]",
            ]
        )
    else:
        cmd.extend(
            [
                "-f",
                "lavfi",
                "-i",
                f"anullsrc=r=44100:cl=stereo:d={duracion}",
                "-t",
                str(duracion),
                "-filter_complex",
                video,
                "-map",
                "[v]",
                "-map",
                "2:a:0",
                "-shortest",
            ]
        )
    cmd.extend(
        [
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "256k",
            "-ar",
            "44100",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(video_out),
        ]
    )
    _ejecutar(cmd, ses, video_out)


def _superponer_overlay(
    ffmpeg: str,
    video_in: Path,
    overlay_png: Path,
    video_out: Path,
    ses: ExportSession,
) -> None:
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_in),
        "-i",
        str(overlay_png),
        "-filter_complex",
        f"[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v];"
        f"[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a]",
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        str(video_out),
    ]
    _ejecutar(cmd, ses, video_out)


def _concatenar(ffmpeg: str, partes: list[Path], destino: Path, ses: ExportSession) -> None:
    lista = destino.parent / "concat_list.txt"
    lineas = []
    for p in partes:
        ruta = str(p.resolve()).replace("\\", "/").replace("'", "'\\''")
        lineas.append(f"file '{ruta}'")
    lista.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(lista),
        "-c",
        "copy",
        str(destino),
    ]
    _ejecutar(cmd, ses, destino)
    if not destino.exists() or destino.stat().st_size < 1000:
        cmd_re = [
            ffmpeg,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(lista),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "256k",
            "-ar",
            "44100",
            "-movflags",
            "+faststart",
            str(destino),
        ]
        _ejecutar(cmd_re, ses, destino)


def _cortes_entre_puestos(duraciones: list[float]) -> list[float]:
    acum = 0.0
    cortes: list[float] = []
    for i, d in enumerate(duraciones):
        if i > 0:
            cortes.append(acum)
        acum += d
    return cortes


def _aplicar_watermark(
    ffmpeg: str,
    video_in: Path,
    video_out: Path,
    imagen: Path,
    opacity: float,
    ses: ExportSession,
) -> None:
    op = max(0.0, min(1.0, opacity))
    fc = (
        f"[1:v]format=rgba,colorchannelmixer=aa={op:.3f}[wm];"
        f"[0:v][wm]overlay=main_w-overlay_w-40:main_h-overlay_h-140"
    )
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_in),
        "-i",
        str(imagen),
        "-filter_complex",
        fc,
        "-c:a",
        "copy",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        str(video_out),
    ]
    _ejecutar(cmd, ses, video_out)


def _mezclar_audio_final(
    ffmpeg: str,
    video_in: Path,
    video_out: Path,
    duraciones: list[float],
    opciones: OpcionesExport,
    ses: ExportSession,
) -> None:
    tiene_musica = bool(opciones.music_path and Path(opciones.music_path).is_file())
    tiene_voz = bool(opciones.voiceover_path and Path(opciones.voiceover_path).is_file())
    cortes = _cortes_entre_puestos(duraciones)
    usar_sting = bool(opciones.usar_sting_en_cortes and cortes)

    if not tiene_musica and not usar_sting and not tiene_voz:
        salida = video_out
        if opciones.watermark_path and Path(opciones.watermark_path).is_file():
            _aplicar_watermark(
                ffmpeg,
                video_in,
                video_out,
                Path(opciones.watermark_path),
                opciones.watermark_opacity,
                ses,
            )
            return
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(video_in),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            "-map_metadata",
            "-1",
            "-fflags",
            "+bitexact",
            str(salida),
        ]
        _ejecutar(cmd, ses, salida)
        return

    inputs: list[str] = ["-i", str(video_in)]
    filter_parts: list[str] = ["[0:a]aformat=sample_rates=44100:channel_layouts=stereo[base]"]
    mix = ["[base]"]
    idx = 1
    mus_label = "mus"

    if tiene_musica:
        inputs.extend(["-stream_loop", "-1", "-i", opciones.music_path])  # type: ignore[list-item]
        vol = max(0.0, min(1.0, opciones.music_volume))
        filter_parts.append(f"[{idx}:a]volume={vol:.3f}[mus]")
        mus_label = "mus"
        idx += 1

    if tiene_voz:
        inputs.extend(["-i", opciones.voiceover_path])  # type: ignore[list-item]
        vvol = max(0.0, min(2.0, opciones.voiceover_volume))
        filter_parts.append(
            f"[{idx}:a]volume={vvol:.3f},aresample=44100,aformat=channel_layouts=stereo[vo]"
        )
        if tiene_musica:
            filter_parts.append(
                "[mus][vo]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=450[mbus]"
            )
            mus_label = "mbus"
        idx += 1

    if usar_sting:
        asegurar_sting_default()
        sting = Path(opciones.sting_path) if opciones.sting_path else STING_PATH
        inputs.extend(["-i", str(sting)])
        sting_vol = max(0.0, min(1.5, opciones.sting_volume))
        n = len(cortes)
        if n == 1:
            ms = int(cortes[0] * 1000)
            filter_parts.append(f"[{idx}:a]adelay={ms}|{ms},volume={sting_vol:.3f}[st0]")
            mix.append("[st0]")
        else:
            filter_parts.append(f"[{idx}:a]asplit={n}" + "".join(f"[stS{i}]" for i in range(n)))
            for i, t in enumerate(cortes):
                ms = int(t * 1000)
                filter_parts.append(f"[stS{i}]adelay={ms}|{ms},volume={sting_vol:.3f}[st{i}]")
                mix.append(f"[st{i}]")
        idx += 1

    if tiene_musica:
        mix.append(f"[{mus_label}]")
    if tiene_voz:
        mix.append("[vo]")

    filter_parts.append(
        f"{''.join(mix)}amix=inputs={len(mix)}:duration=first:dropout_transition=2:normalize=0[aout]"
    )
    fc = ";".join(filter_parts)

    paso_audio = video_out.parent / f"_audio_mix_{video_out.stem}.mp4"
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        *inputs,
        "-filter_complex",
        fc,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "-1",
        "-fflags",
        "+bitexact",
        str(paso_audio),
    ]
    _ejecutar(cmd, ses, paso_audio)

    if opciones.watermark_path and Path(opciones.watermark_path).is_file():
        _aplicar_watermark(
            ffmpeg,
            paso_audio,
            video_out,
            Path(opciones.watermark_path),
            opciones.watermark_opacity,
            ses,
        )
        try:
            paso_audio.unlink()
        except OSError:
            pass
    elif paso_audio != video_out:
        paso_audio.replace(video_out)


def exportar_ranking(
    opciones: OpcionesExport,
    on_progress: ProgressCb | None = None,
    job_id: str | None = None,
) -> dict:
    """
    Orden de reproducción = orden del array clips (arriba primero, abajo #1 al final).
    """
    _validar_clips(opciones.clips)
    jid = job_id or str(uuid.uuid4())[:8]
    ses = ExportSession()
    _sesiones[jid] = ses

    ffmpeg = resolver_ffmpeg()
    temp = CACHE_EXPORT / jid
    temp.mkdir(parents=True, exist_ok=True)
    ses.temp_dir = temp

    if opciones.preview:
        out_dir = CACHE_EXPORT / "preview"
        nombre = f"preview_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
    else:
        out_dir = Path(opciones.output_dir) if opciones.output_dir else OUTPUT_DEFAULT
        nombre = f"ranking_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
    out_dir.mkdir(parents=True, exist_ok=True)
    salida_final = out_dir / nombre
    ses.salida_parcial = salida_final

    total_pasos = len(opciones.clips) + 3
    paso = 0

    def tick(msg: str) -> None:
        nonlocal paso
        paso += 1
        if on_progress:
            on_progress(paso, total_pasos, msg)

    puestos = _lista_puestos(opciones.clips)
    partes_overlay: list[Path] = []
    duraciones: list[float] = []

    try:
        hook_pack = _clip_hook(opciones)
        if hook_pack:
            hook_clip, idx_rank, d_hook = hook_pack
            if ses.cancelado:
                raise ErrorExportar("Exportación cancelada.")
            num_h = _numero_puesto(idx_rank, len(opciones.clips))
            tick(f"Gancho inicial (#{num_h})…")
            png_h = temp / "overlay_hook.png"
            generar_overlay_png(
                png_h,
                titulo_ranking=opciones.titulo,
                numero_puesto=num_h,
                nombre_puesto=frase_lista(hook_clip.texto_lista, hook_clip.label),
                todos_los_puestos=puestos,
                preset=opciones.preset,
                accent=opciones.accent,
            )
            parte_h = temp / "parte_hook.mp4"
            _render_puesto(ffmpeg, hook_clip, png_h, parte_h, opciones.framing, ses)
            duraciones.append(d_hook)
            partes_overlay.append(parte_h)

        for i, clip in enumerate(opciones.clips):
            if ses.cancelado:
                raise ErrorExportar("Exportación cancelada.")
            num = _numero_puesto(i, len(opciones.clips))
            duraciones.append(float(clip.trim_out) - float(clip.trim_in))
            png = temp / f"overlay_{i:02d}.png"
            generar_overlay_png(
                png,
                titulo_ranking=opciones.titulo,
                numero_puesto=num,
                nombre_puesto=frase_lista(clip.texto_lista, clip.label),
                todos_los_puestos=puestos,
                preset=opciones.preset,
                accent=opciones.accent,
            )
            con_overlay = temp / f"parte_{i:02d}.mp4"
            if opciones.preview:
                tick(f"Vista previa #{num}…")
            else:
                tick(f"Preparando puesto #{num}…")
            _render_puesto(ffmpeg, clip, png, con_overlay, opciones.framing, ses)
            partes_overlay.append(con_overlay)

        tick("Uniendo segmentos…")
        concat_tmp = temp / "concat_sin_audio_extra.mp4"
        _concatenar(ffmpeg, partes_overlay, concat_tmp, ses)

        tick("Mezclando audio (música / sting)…")
        _mezclar_audio_final(ffmpeg, concat_tmp, salida_final, duraciones, opciones, ses)

        if not salida_final.is_file():
            raise ErrorExportar("No se generó el archivo final.")

        meta = inspeccionar_clip(str(salida_final))
        return {
            "ok": True,
            "job_id": jid,
            "output_path": str(salida_final),
            "duracion_seg": meta["duracion"],
            "orden_puestos": [p[0] for p in puestos],
            "duraciones": duraciones,
        }
    except Exception:
        ses.limpiar_parcial()
        if salida_final.exists():
            try:
                salida_final.unlink()
            except OSError:
                pass
        raise
    finally:
        _sesiones.pop(jid, None)


def ffprobe_resumen(ruta: str) -> dict:
    proc = subprocess.run(
        [
            resolver_ffprobe(),
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            ruta,
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return json.loads(proc.stdout or "{}")
