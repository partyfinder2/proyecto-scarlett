"""Banner Cap. 6 — kit habitación (nitidez: sin Real-ESRGAN, paneles grandes)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parents[1]
ASSETS = BASE / "assets"
CURSOR_ASSETS = Path(
    r"C:\Users\pablo\.cursor\projects\c-Users-pablo-Downloads-VENUZ-Complete-App\assets"
)

OUT = ASSETS / "banner-kit-habitacion.jpg"

# Fuentes originales (Amazon ~480px — mejor que salida glitch de IA)
SRC_DIAMANTE = CURSOR_ASSETS / "71fqPE9hE4L._AC_UL480_FMwebp_QL65_-176bd923-7c56-44ac-8536-52f1153d2b73.webp"
SRC_VIBRADOR = CURSOR_ASSETS / "511NdgDWRbL._AC_UL480_FMwebp_QL65_-bb8f0e4b-70cb-466d-8ab1-ba3439c45cdb.webp"
SRC_COLA_COMP = ASSETS / "cola-zorro-colores.jpg"


def load_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def crop_cola_product(im: Image.Image) -> Image.Image:
    """Una cola de zorro del catálogo (lado derecho del composite)."""
    w, h = im.size
    col = im.crop((int(w * 0.58), 0, w, h))
    # primer producto (gris) en la columna
    ch = col.height // 4
    return col.crop((0, int(ch * 0.05), col.width, int(ch * 1.05)))


def fit_contain(im: Image.Image, max_w: int, max_h: int) -> Image.Image:
    """Escala con Lanczos; si hace falta, sube un poco antes de encajar."""
    ratio = min(max_w / im.width, max_h / im.height)
    if ratio > 2.5:
        ratio = 2.5
    nw, nh = max(1, int(im.width * ratio)), max(1, int(im.height * ratio))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def main() -> None:
    W, H = 2100, 520
    BG = (18, 14, 22)
    CARD = (255, 255, 255)
    PINK = (232, 112, 153)
    GOLD = (216, 178, 110)

    panels = [
        (load_rgb(SRC_DIAMANTE), "1. Tapón diamante", "De camino (discreto)"),
        (load_rgb(SRC_VIBRADOR), "2. Vibrador (opcional)", "Si vibra, mejor"),
        (crop_cola_product(load_rgb(SRC_COLA_COMP)), "3. Cola de zorro", "En la habitación"),
    ]

    banner = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(banner)

    font_title = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 24)
    font_label = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 17)
    font_sub = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 14)

    draw.text((20, 12), "Kit de la habitación — orden del método", font=font_title, fill=PINK)

    header_h = 44
    margin = 18
    gap = 14
    n = len(panels)
    cell_w = (W - 2 * margin - gap * (n - 1)) // n
    img_h = H - header_h - 62
    top = header_h + 6

    for i, (im, label, sub) in enumerate(panels):
        x0 = margin + i * (cell_w + gap)
        pad = 14
        max_w, max_h = cell_w - 2 * pad, img_h - 2 * pad
        fitted = fit_contain(im, max_w, max_h)
        card = Image.new("RGB", (cell_w, img_h), CARD)
        ox = (cell_w - fitted.width) // 2
        oy = (img_h - fitted.height) // 2
        card.paste(fitted, (ox, oy))
        banner.paste(card, (x0, top))
        draw.rectangle([x0, top, x0 + cell_w - 1, top + 3], fill=GOLD)

        ly = top + img_h + 8
        for text, font, color, dy in (
            (label, font_label, PINK, 0),
            (sub, font_sub, GOLD, 22),
        ):
            bb = draw.textbbox((0, 0), text, font=font)
            tw = bb[2] - bb[0]
            draw.text((x0 + (cell_w - tw) // 2, ly + dy), text, font=font, fill=color)

        if i < n - 1:
            ax = x0 + cell_w + 2
            ay = top + img_h // 2
            draw.polygon([(ax, ay - 7), (ax + gap - 4, ay), (ax, ay + 7)], fill=PINK)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    banner.save(OUT, "JPEG", quality=96, subsampling=0, optimize=True)
    print(f"OK {OUT} {banner.size} bytes={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
