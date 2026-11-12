"""Módulo 2 — overlays PNG 1080×1920 (Classic / Neon) con Pillow."""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ANCHO = 1080
ALTO = 1920

FUENTES = {
    "titulo": [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ],
    "numero": [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\impact.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
    ],
    "cuerpo": [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ],
}


def _cargar_fuente(rutas: list[str], tamano: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for ruta in rutas:
        p = Path(ruta)
        if p.is_file():
            return ImageFont.truetype(str(p), tamano)
    return ImageFont.load_default()


def _parse_color(hex_color: str) -> tuple[int, int, int, int]:
    s = (hex_color or "#FACC15").strip()
    if not s.startswith("#"):
        s = "#" + s
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", s):
        return (250, 204, 21, 255)
    r = int(s[1:3], 16)
    g = int(s[3:5], 16)
    b = int(s[5:7], 16)
    return (r, g, b, 255)


def _texto_ancho(draw: ImageDraw.ImageDraw, texto: str, font) -> int:
    if hasattr(draw, "textbbox"):
        box = draw.textbbox((0, 0), texto, font=font)
        return box[2] - box[0]
    return draw.textlength(texto, font=font)  # type: ignore[attr-defined]


BLANCO = (255, 255, 255, 255)
ROJO = (255, 59, 48, 255)
AMARILLO = (250, 204, 21, 255)
CYAN = (56, 189, 248, 255)
NEGRO = (0, 0, 0, 255)
_RE_ARCHIVO = re.compile(
    r"^(twitter|instagram|tiktok|facebook|youtube|yt|clip)[-_]|[0-9a-f]{8,}",
    re.IGNORECASE,
)
def frase_lista(texto_explicito: str | None, label: str = "") -> str:
    """Frase corta del overlay. Vacío = solo el número, nunca el nombre de archivo."""
    if texto_explicito is not None:
        return texto_explicito.strip()[:40]
    lab = (label or "").strip()
    if not lab or lab.lower() in {"sin nombre", "clip", "puesto"} or _es_nombre_archivo(lab):
        return ""
    return lab[:40]


def _es_nombre_archivo(texto: str) -> bool:
    s = (texto or "").strip()
    if not s:
        return False
    if _RE_ARCHIVO.search(s):
        return True
    if s.count("-") >= 3 or len(s) > 36:
        return True
    return False


def _color_puesto(numero: int) -> tuple[int, int, int, int]:
    if numero == 1:
        return AMARILLO
    if numero == 2:
        return (96, 165, 250, 255)
    if numero == 3:
        return (249, 115, 22, 255)
    return BLANCO


def _segmentos_titulo(titulo: str) -> list[tuple[str, tuple[int, int, int, int]]]:
    raw = (titulo or "Mi ranking").strip() or "Mi ranking"
    marcas = list(re.finditer(r"\*([^*]+)\*|\[([^\]]+)\]|\{([^}]+)\}", raw))
    if not marcas:
        palabras = raw.split()
        ciclo = (BLANCO, ROJO, AMARILLO, CYAN)
        return [(p.upper(), ciclo[i % 4]) for i, p in enumerate(palabras)] or [("RANKING", BLANCO)]

    partes: list[tuple[str, tuple[int, int, int, int]]] = []
    cursor = 0
    for m in marcas:
        if m.start() > cursor:
            trozo = raw[cursor:m.start()].strip()
            if trozo:
                partes.append((trozo.upper(), BLANCO))
        if m.group(1) is not None:
            partes.append((m.group(1).strip().upper(), ROJO))
        elif m.group(2) is not None:
            partes.append((m.group(2).strip().upper(), AMARILLO))
        elif m.group(3) is not None:
            partes.append((m.group(3).strip().upper(), CYAN))
        cursor = m.end()
    if cursor < len(raw):
        resto = raw[cursor:].strip()
        if resto:
            partes.append((resto.upper(), BLANCO))
    return [(t, c) for t, c in partes if t]


def _lineas_titulo(
    draw: ImageDraw.ImageDraw,
    segmentos: list[tuple[str, tuple[int, int, int, int]]],
    font,
    ancho_max: int,
) -> list[list[tuple[str, tuple[int, int, int, int]]]]:
    lineas: list[list[tuple[str, tuple[int, int, int, int]]]] = [[]]
    ancho = 0
    for texto, color in segmentos:
        pieza = texto if not lineas[-1] else f" {texto}"
        w = _texto_ancho(draw, pieza, font)
        if lineas[-1] and ancho + w > ancho_max:
            lineas.append([])
            ancho = 0
            pieza = texto
            w = _texto_ancho(draw, pieza, font)
        lineas[-1].append((pieza, color))
        ancho += w
    return [ln for ln in lineas if ln]


def _dibujar_titulo(draw: ImageDraw.ImageDraw, titulo: str, preset: str, accent: tuple[int, int, int, int]) -> None:
    if preset == "clean":
        # Sin banda oscura: solo texto limpio con contorno sobre el video
        pass
    elif preset == "gold":
        draw.rectangle((0, 0, ANCHO, 260), fill=(20, 14, 4, 248))
        draw.line((0, 2, ANCHO, 2), fill=(212, 175, 55, 220), width=4)
        draw.line((0, 257, ANCHO, 257), fill=(250, 204, 21, 235), width=6)
    elif preset == "neon":
        r, g, b, _ = accent
        draw.rectangle((0, 0, ANCHO, 260), fill=(r // 7, g // 7, b // 7, 238))
        draw.line((0, 257, ANCHO, 257), fill=accent[:3] + (240,), width=6)
    else:
        # Classic: banda negra sólida estilo YouTube Shorts
        draw.rectangle((0, 0, ANCHO, 260), fill=(0, 0, 0, 255))
        draw.line((0, 258, ANCHO, 258), fill=(255, 255, 255, 45), width=3)

    segmentos = _segmentos_titulo(titulo)
    ancho_max = ANCHO - 110
    font = _cargar_fuente(FUENTES["titulo"], 38)
    lineas: list[list[tuple[str, tuple[int, int, int, int]]]] = []
    tam_elegido = 38
    for tam in (62, 54, 46, 40, 34):
        cand_font = _cargar_fuente(FUENTES["titulo"], tam)
        cand_lineas = _lineas_titulo(draw, segmentos, cand_font, ancho_max)
        cabe_ancho = all(
            sum(_texto_ancho(draw, t, cand_font) for t, _ in ln) <= ancho_max
            for ln in cand_lineas
        )
        if len(cand_lineas) <= 2 and cabe_ancho:
            font = cand_font
            lineas = cand_lineas
            tam_elegido = tam
            break
    if not lineas:
        font = _cargar_fuente(FUENTES["titulo"], 32)
        lineas = _lineas_titulo(draw, segmentos, font, ancho_max)[:3]
        tam_elegido = 32

    alto_linea = max(44, int(tam_elegido * 1.2))
    bloque = len(lineas) * alto_linea
    y = max(28, (260 - bloque) // 2)
    for linea in lineas:
        ancho = sum(_texto_ancho(draw, t, font) for t, _ in linea)
        x = (ANCHO - ancho) // 2
        for texto, color in linea:
            draw.text(
                (x, y),
                texto,
                font=font,
                fill=color,
                stroke_width=4,
                stroke_fill=NEGRO,
            )
            x += _texto_ancho(draw, texto, font)
        y += alto_linea


def _dibujar_lista_puestos(
    draw: ImageDraw.ImageDraw,
    puestos: list[tuple[int, str]],
    numero_actual: int,
    preset: str,
    accent: tuple[int, int, int, int],
) -> None:
    """Lista 1. arriba → N. abajo, a la izquierda. El centro del video queda libre."""
    del preset, accent
    if not puestos:
        return
    textos: dict[int, str] = {}
    for n, t in puestos:
        bruto = (t or "").strip()
        textos[int(n)] = "" if _es_nombre_archivo(bruto) else bruto[:28]
    total = max(textos) if textos else int(numero_actual)
    font_num = _cargar_fuente(FUENTES["numero"], 54)
    font_txt = _cargar_fuente(FUENTES["cuerpo"], 32)
    y = 318
    paso = 78
    for rank in range(1, total + 1):
        if y > ALTO - 80:
            break
        color = _color_puesto(rank)
        num = f"{rank}."
        activo = rank == int(numero_actual)
        if activo:
            draw.rounded_rectangle((24, y - 6, 34, y + 58), radius=4, fill=color)
        draw.text(
            (42, y),
            num,
            font=font_num,
            fill=color,
            stroke_width=5,
            stroke_fill=NEGRO,
        )
        frase = textos.get(rank, "")
        # Cuenta regresiva: al estar en #k ya se revelaron #N…#k.
        if frase and rank >= int(numero_actual):
            nx = 42 + _texto_ancho(draw, num, font_num) + 14
            fw = _texto_ancho(draw, frase, font_txt)
            draw.rounded_rectangle(
                (nx - 10, y + 6, nx + fw + 12, y + 50),
                radius=8,
                fill=(0, 0, 0, 130),
            )
            draw.text(
                (nx, y + 10),
                frase,
                font=font_txt,
                fill=BLANCO,
                stroke_width=4,
                stroke_fill=NEGRO,
            )
        y += paso


def generar_overlay_png(
    destino: str | Path,
    *,
    titulo_ranking: str,
    numero_puesto: int,
    nombre_puesto: str,
    todos_los_puestos: list[tuple[int, str]] | None = None,
    preset: str = "classic",
    accent: str = "#FACC15",
) -> str:
    """
    Genera un PNG RGBA 1080×1920 para superponer en preview y en FFmpeg.
    preset: 'classic' | 'neon' | 'gold' | 'clean'
    """
    preset_norm = (preset or "classic").strip().lower()
    if preset_norm not in ("classic", "neon", "gold", "clean"):
        raise ValueError("El estilo debe ser classic, neon, gold o clean.")

    img = Image.new("RGBA", (ANCHO, ALTO), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    color_acento = _parse_color(accent)

    _dibujar_titulo(draw, titulo_ranking, preset_norm, color_acento)
    _dibujar_lista_puestos(
        draw,
        todos_los_puestos or [(numero_puesto, nombre_puesto)],
        int(numero_puesto),
        preset_norm,
        color_acento,
    )

    out = Path(destino)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, format="PNG")
    return str(out.resolve())
