"""Genera marca de agua PNG «FLOW IA» (fondo transparente, estilo glitch TikTok)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "assets" / "flow-ia-marca-agua.png"
FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\arialbd.ttf"),
    Path(r"C:\Windows\Fonts\segoeuib.ttf"),
]


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for p in FONT_CANDIDATES:
        if p.is_file():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _text_bbox(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int, int, int]:
    if hasattr(draw, "textbbox"):
        return draw.textbbox((0, 0), text, font=font)
    w, h = draw.textsize(text, font=font)
    return (0, 0, w, h)


def generar(dest: Path | None = None) -> Path:
    dest = dest or OUT
    dest.parent.mkdir(parents=True, exist_ok=True)

    text = "FLOW IA"
    font = _font(72)
    pad = 48
    tmp = Image.new("RGBA", (900, 200), (0, 0, 0, 0))
    d = ImageDraw.Draw(tmp)
    bbox = _text_bbox(d, text, font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    w, h = tw + pad * 2, th + pad * 2

    def layer(color: tuple[int, int, int, int], ox: int, oy: int) -> Image.Image:
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        dr = ImageDraw.Draw(img)
        dr.text((pad + ox, pad + oy), text, font=font, fill=color)
        return img

    # Sombra suave para leerse sobre fondos claros y oscuros
    shadow = layer((0, 0, 0, 140), 3, 3)
    shadow = shadow.filter(ImageFilter.GaussianBlur(4))

    cyan = layer((0, 220, 255, 115), -4, 0)
    magenta = layer((255, 60, 120, 105), 4, 0)
    white = layer((255, 255, 255, 255), 0, 0)

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out = Image.alpha_composite(out, shadow)
    out = Image.alpha_composite(out, cyan)
    out = Image.alpha_composite(out, magenta)
    out = Image.alpha_composite(out, white)

    # Borde oscuro fino (legibilidad en highlights)
    edge = white.copy()
    edge = ImageChops.offset(edge, 0, 0)
    alpha = edge.split()[3]
    edge_outline = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        shifted = ImageChops.offset(alpha, dx, dy)
        band = Image.new("RGBA", (w, h), (0, 0, 0, 55))
        band.putalpha(shifted)
        edge_outline = Image.alpha_composite(edge_outline, band)
    out = Image.alpha_composite(edge_outline, out)

    out.save(dest, "PNG", optimize=True)
    return dest


def generar_youtube_150(src: Path | None = None, dest: Path | None = None) -> Path:
    """150×150 px para YouTube Studio → Marca de agua de los videos."""
    src = src or OUT
    dest = dest or (BASE / "assets" / "flow-ia-marca-agua-youtube-150.png")
    if not src.is_file():
        generar(src)
    wide = Image.open(src).convert("RGBA")
    box = 150
    margin = 10
    max_w, max_h = box - margin * 2, box - margin * 2
    scale = min(max_w / wide.width, max_h / wide.height)
    nw, nh = int(wide.width * scale), int(wide.height * scale)
    resized = wide.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (box, box), (0, 0, 0, 0))
    canvas.paste(resized, ((box - nw) // 2, (box - nh) // 2), resized)
    canvas.save(dest, "PNG", optimize=True)
    return dest


if __name__ == "__main__":
    p = generar()
    yt = generar_youtube_150()
    desk = Path.home() / "OneDrive" / "Escritorio" / "FLOW-IA-marca-agua.png"
    if not desk.parent.is_dir():
        desk = Path.home() / "Desktop" / "FLOW-IA-marca-agua.png"
    generar(desk)
    desk_yt = desk.with_name("FLOW-IA-marca-agua-YouTube-150.png")
    generar_youtube_150(desk, desk_yt)
    print(p)
    print(yt)
    print(desk)
    print(desk_yt)
