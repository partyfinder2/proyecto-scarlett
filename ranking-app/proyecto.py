"""Módulo 4 — persistencia del proyecto JSON (Pydantic) y validación antes de exportar."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from render.exportar import ClipExport, OpcionesExport

BASE_DIR = Path(__file__).resolve().parent
PROYECTOS_DIR = BASE_DIR / "proyectos"
ULTIMO_PROYECTO = PROYECTOS_DIR / "ultimo_proyecto.json"

MAX_DURACION_SEGMENTO_S = 60.0
MIN_DURACION_SEGMENTO_S = 0.2


class ErrorProyecto(ValueError):
    """Estado del proyecto inválido para guardar o exportar."""


class HookConfig(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    enabled: bool = False
    from_rank_id: str | None = Field(None, alias="fromRankId")
    seconds: float = 1.5


class RutaVolumen(BaseModel):
    path: str | None = None
    volume: float = Field(0.25, ge=0.0, le=2.0)


class StingConfig(BaseModel):
    path: str | None = None
    volume: float = Field(0.8, ge=0.0, le=2.0)


class WatermarkConfig(BaseModel):
    path: str | None = None
    opacity: float = Field(0.85, ge=0.0, le=1.0)


class ClipProyecto(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    path: str
    label: str = "Sin nombre"
    texto_lista: str | None = Field(None, alias="textoLista")
    trim_in: float = Field(0.0, alias="trimIn", ge=0.0)
    trim_out: float = Field(5.0, alias="trimOut", ge=0.0)
    keep_audio: bool = Field(False, alias="keepAudio")

    @property
    def duracion_recorte(self) -> float:
        return float(self.trim_out) - float(self.trim_in)

    @model_validator(mode="after")
    def _trim_coherente(self) -> ClipProyecto:
        if self.trim_out <= self.trim_in:
            raise ValueError(
                f'El clip "{self.label}" tiene un recorte inválido: '
                "la salida debe ser mayor que la entrada."
            )
        return self


class ProyectoRanking(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    version: int = 1
    title: str = "Mi ranking"
    preset: Literal["classic", "neon", "gold", "clean"] = "classic"
    accent: str = "#FACC15"
    framing: Literal["fill", "fit"] = "fill"
    hook: HookConfig = Field(default_factory=HookConfig)
    music: RutaVolumen = Field(default_factory=lambda: RutaVolumen(volume=0.25))
    voiceover: RutaVolumen = Field(default_factory=lambda: RutaVolumen(volume=1.0))
    sting: StingConfig = Field(default_factory=StingConfig)
    watermark: WatermarkConfig = Field(default_factory=WatermarkConfig)
    output_dir: str = Field("", alias="outputDir")
    # Los manda el panel para no pisar un import de BabelDesk. No se guardan en el JSON.
    revision: int | None = Field(default=None, exclude=True)
    vaciar: bool = Field(default=False, exclude=True)
    clips: list[ClipProyecto] = Field(default_factory=list)


def proyecto_vacio() -> ProyectoRanking:
    return ProyectoRanking()


def asegurar_carpeta_proyectos() -> None:
    PROYECTOS_DIR.mkdir(parents=True, exist_ok=True)


def guardar_proyecto(proyecto: ProyectoRanking, ruta: Path | None = None) -> Path:
    """Guarda el JSON del proyecto (átomo: .tmp → rename)."""
    asegurar_carpeta_proyectos()
    destino = Path(ruta) if ruta else ULTIMO_PROYECTO
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(destino.suffix + ".tmp")
    payload = proyecto.model_dump(mode="json", by_alias=True)
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(destino)
    return destino


def cargar_proyecto(ruta: Path | None = None) -> ProyectoRanking:
    """Carga `ultimo_proyecto.json` o devuelve proyecto vacío si no existe."""
    destino = Path(ruta) if ruta else ULTIMO_PROYECTO
    if not destino.is_file():
        return proyecto_vacio()
    raw = json.loads(destino.read_text(encoding="utf-8"))
    return ProyectoRanking.model_validate(raw)


def copiar_proyecto_junto_a_export(mp4_path: str | Path, proyecto: ProyectoRanking | None = None) -> Path:
    """Copia el JSON del proyecto al lado del `.mp4` exportado."""
    mp4 = Path(mp4_path)
    if proyecto is None:
        proyecto = cargar_proyecto()
    lado = mp4.with_suffix(".json")
    guardar_proyecto(proyecto, lado)
    return lado


def validar_para_exportar(proyecto: ProyectoRanking) -> None:
    """Comprueba trims y clips antes de lanzar FFmpeg."""
    if len(proyecto.clips) < 3:
        raise ErrorProyecto("Añade al menos 3 clips al ranking antes de exportar.")
    if len(proyecto.clips) > 10:
        raise ErrorProyecto("El ranking no puede tener más de 10 clips.")

    faltantes: list[str] = []
    for clip in proyecto.clips:
        d = clip.duracion_recorte
        if d <= MIN_DURACION_SEGMENTO_S:
            faltantes.append(
                f'"{clip.label}" ({d:.2f} s): el recorte es muy corto; usa al menos {MIN_DURACION_SEGMENTO_S} s.'
            )
        elif d > MAX_DURACION_SEGMENTO_S:
            faltantes.append(
                f'"{clip.label}" ({d:.1f} s): supera {MAX_DURACION_SEGMENTO_S:.0f} s sin recortar. '
                "Acorta el inicio/fin del clip antes de exportar."
            )
        if clip.path and not Path(clip.path).is_file():
            faltantes.append(f'"{clip.label}": no se encuentra el archivo en disco ({clip.path}).')

    if faltantes:
        cuerpo = "\n".join(f"• {linea}" for linea in faltantes)
        raise ErrorProyecto(
            "No se puede exportar hasta corregir estos clips:\n" + cuerpo
        )


def proyecto_a_opciones_export(proyecto: ProyectoRanking) -> OpcionesExport:
    validar_para_exportar(proyecto)
    clips = [
        ClipExport(
            path=c.path,
            label=c.label,
            texto_lista=c.texto_lista,
            trim_in=c.trim_in,
            trim_out=c.trim_out,
            keep_audio=c.keep_audio,
            id=c.id,
        )
        for c in proyecto.clips
    ]
    out_dir = proyecto.output_dir.strip() or None
    music = proyecto.music.path if proyecto.music.path else None
    sting = proyecto.sting.path if proyecto.sting.path else None
    return OpcionesExport(
        titulo=proyecto.title,
        clips=clips,
        preset=proyecto.preset,
        accent=proyecto.accent,
        framing=proyecto.framing,
        music_path=music,
        music_volume=proyecto.music.volume,
        sting_path=sting,
        sting_volume=proyecto.sting.volume,
        usar_sting_en_cortes=True,
        output_dir=out_dir,
        hook_enabled=proyecto.hook.enabled,
        hook_clip_id=proyecto.hook.from_rank_id,
        hook_seconds=proyecto.hook.seconds,
        voiceover_path=proyecto.voiceover.path,
        voiceover_volume=proyecto.voiceover.volume,
        watermark_path=proyecto.watermark.path,
        watermark_opacity=proyecto.watermark.opacity,
    )


def numero_puesto(indice_deck: int, total: int) -> int:
    """Índice 0 = puesto más alto; último índice = #1."""
    return max(1, total - indice_deck)
