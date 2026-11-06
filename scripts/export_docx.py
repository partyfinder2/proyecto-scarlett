from pathlib import Path
import re
from docx import Document
from docx.shared import Pt, Inches

base = Path(__file__).resolve().parents[1]
src = base / "build" / "MANUSCRITO_COMPLETO.md"
img = base / "assets" / "diagrama-flujo.jpg"
out_build = base / "build" / "Metodo_Scarlett_Ebook_REVISION.docx"
out_dl = Path(r"C:\Users\pablo\Downloads\Metodo_Scarlett_Ebook_REVISION.docx")
out_md = Path(r"C:\Users\pablo\Downloads\Metodo_Scarlett_Ebook_REVISION.md")

text = src.read_text(encoding="utf-8")
doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)


def add_heading_safe(document, title, level):
    document.add_heading(title, level=min(max(level, 1), 3))


for raw in text.splitlines():
    line = raw.rstrip()
    if not line.strip():
        continue

    m = re.match(r"!\[(.*?)\]\((.*?)\)", line.strip())
    if m:
        if img.exists():
            try:
                doc.add_picture(str(img), width=Inches(5.5))
            except Exception:
                doc.add_paragraph(f"[Diagrama: {img.name}]")
        continue

    if line.startswith("# "):
        add_heading_safe(doc, line[2:].strip(), 1)
        continue
    if line.startswith("## "):
        add_heading_safe(doc, line[3:].strip(), 2)
        continue
    if line.startswith("### "):
        add_heading_safe(doc, line[4:].strip(), 3)
        continue
    if line.strip() == "---":
        doc.add_paragraph("—" * 20)
        continue
    if line.startswith("|") and "|" in line[1:]:
        if re.match(r"^\|?\s*-+", line):
            continue
        p = doc.add_paragraph(line.strip("|").replace("|", " · "))
        if p.runs:
            p.runs[0].font.size = Pt(10)
        continue
    stripped = line.lstrip()
    if stripped.startswith("- ") or stripped.startswith("* "):
        doc.add_paragraph(re.sub(r"^[-*]\s+", "", stripped), style="List Bullet")
        continue
    if re.match(r"^\d+\.\s+", stripped):
        doc.add_paragraph(re.sub(r"^\d+\.\s+", "", stripped), style="List Number")
        continue
    if stripped.startswith("> "):
        p = doc.add_paragraph(stripped[2:])
        for r in p.runs:
            r.italic = True
        continue

    clean = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
    clean = re.sub(r"\*(.+?)\*", r"\1", clean)
    clean = clean.replace("`", "")
    doc.add_paragraph(clean)

doc.save(str(out_build))
doc.save(str(out_dl))
out_md.write_text(text, encoding="utf-8")
print("OK", out_dl, out_dl.stat().st_size)
print("OK", out_md, out_md.stat().st_size)
