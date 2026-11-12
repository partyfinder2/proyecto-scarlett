"""Genera ranking_app.ico para el acceso directo del escritorio."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "ranking_app.ico"


def _font(size: int):
    for path in (
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf",
    ):
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((8, 8, size - 8, size - 8), fill=(15, 15, 18, 255))
    draw.ellipse((18, 18, size - 18, size - 18), fill=(28, 26, 12, 255), outline=(212, 175, 55, 255), width=6)
    draw.rounded_rectangle((48, 56, 208, 118), radius=22, fill=(250, 204, 21, 255))
    draw.text((128, 87), "TOP", font=_font(38), fill=(20, 16, 4, 255), anchor="mm")
    font_num = _font(96)
    draw.text((128, 168), "#1", font=font_num, fill=(255, 255, 255, 255), anchor="mm", stroke_width=3, stroke_fill=(0, 0, 0, 200))
    draw.text((128, 222), "9:16", font=_font(28), fill=(250, 204, 21, 230), anchor="mm")
    img.save(OUT, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print(OUT)


if __name__ == "__main__":
    main()
