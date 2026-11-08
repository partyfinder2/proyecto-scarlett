"""Export manuscrito a HTML con paleta Método Scarlett + DOCX/MD de revisión."""
from __future__ import annotations

import html
import re
from pathlib import Path

from docx import Document
from docx.shared import Pt, Inches

BASE = Path(__file__).resolve().parents[1]
CAPS = BASE / "capitulos"
ASSETS = BASE / "assets"
BUILD = BASE / "build"
IMG = ASSETS / "diagrama-flujo.jpg"
DL = Path(r"C:\Users\pablo\Downloads")


def merge_md() -> str:
    # Solo capítulos: la portada visual vive en HTML_SHELL (sin metadatos de guía).
    parts: list[str] = []
    for c in sorted(CAPS.glob("*.md")):
        parts.append(c.read_text(encoding="utf-8").strip())
        parts.append("\n\n---\n")
    text = "\n".join(parts).strip() + "\n"
    out = BUILD / "MANUSCRITO_COMPLETO.md"
    out.write_text(text, encoding="utf-8")
    return text


def md_inline(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


def md_to_html(text: str) -> str:
    lines = text.splitlines()
    out: list[str] = []
    in_ul = in_ol = in_table = False
    table_rows: list[str] = []

    def close_lists():
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False

    def flush_table():
        nonlocal in_table, table_rows
        if not table_rows:
            return
        out.append('<table class="scarlett-table">')
        for i, row in enumerate(table_rows):
            cells = [c.strip() for c in row.strip("|").split("|")]
            tag = "th" if i == 0 else "td"
            out.append("<tr>" + "".join(f"<{tag}>{md_inline(c)}</{tag}>" for c in cells) + "</tr>")
        out.append("</table>")
        table_rows = []
        in_table = False

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            close_lists()
            flush_table()
            continue

        if line.strip() == "---":
            close_lists()
            flush_table()
            out.append('<hr class="gold"/>')
            continue

        m = re.match(r"!\[(.*?)\]\((.*?)\)", line.strip())
        if m:
            close_lists()
            flush_table()
            alt, src = m.group(1), m.group(2).strip()
            # Capítulos usan ../assets/... ; en HTML bajo build/ esa ruta ya es correcta
            out.append(
                f'<figure class="diagram"><img src="{html.escape(src)}" '
                f'alt="{html.escape(alt)}"/></figure>'
            )
            continue

        if line.startswith("|"):
            close_lists()
            if re.match(r"^\|?\s*-+", line):
                continue
            in_table = True
            table_rows.append(line)
            continue
        else:
            flush_table()

        if line.startswith("# "):
            close_lists()
            title = line[2:].strip()
            cls = ' class="chapter-start"' if title.startswith("Capítulo") else ""
            out.append(f"<h1{cls}>{md_inline(title)}</h1>")
            continue
        if line.startswith("## "):
            close_lists()
            out.append(f"<h2>{md_inline(line[3:])}</h2>")
            continue
        if line.startswith("### "):
            close_lists()
            out.append(f"<h3>{md_inline(line[4:])}</h3>")
            continue
        if line.startswith("#### "):
            close_lists()
            out.append(f"<h4>{md_inline(line[5:])}</h4>")
            continue

        stripped = line.lstrip()
        if stripped.startswith("> "):
            close_lists()
            out.append(f'<blockquote>{md_inline(stripped[2:])}</blockquote>')
            continue
        if stripped.startswith("- ") or stripped.startswith("* "):
            if in_ol:
                out.append("</ol>")
                in_ol = False
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{md_inline(re.sub(r'^[-*]\s+', '', stripped))}</li>")
            continue
        if re.match(r"^\d+\.\s+", stripped):
            if in_ul:
                out.append("</ul>")
                in_ul = False
            if not in_ol:
                out.append("<ol>")
                in_ol = True
            out.append(f"<li>{md_inline(re.sub(r'^\d+\.\s+', '', stripped))}</li>")
            continue

        close_lists()
        out.append(f"<p>{md_inline(line)}</p>")

    close_lists()
    flush_table()
    return "\n".join(out)


HTML_SHELL = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Método Scarlett</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
:root {{
  --bg: #120E16;
  --accent: #E87099;
  --gold: #D8B26E;
  --text: #EAE4EC;
  --box: #1E1624;
  --border: rgba(232, 112, 153, 0.3);
}}
* {{ box-sizing: border-box; }}
@page {{ margin: 18mm 16mm; }}
body {{
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Plus Jakarta Sans", system-ui, sans-serif;
  font-size: 11.5pt;
  line-height: 1.6;
}}
.book {{
  max-width: 820px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 4rem;
}}
h1 {{
  font-family: "Cormorant Garamond", Georgia, serif;
  color: var(--accent);
  font-size: 2rem;
  letter-spacing: 0.03em;
  margin: 2rem 0 0.75rem;
  page-break-after: avoid;
}}
h1.chapter-start {{
  page-break-before: always;
  margin-top: 0;
  padding-top: 0.5rem;
}}
h4 {{
  font-family: "Plus Jakarta Sans", system-ui, sans-serif;
  color: var(--gold);
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1.1rem 0 0.35rem;
  page-break-after: avoid;
}}
h2 {{
  font-family: "Cormorant Garamond", Georgia, serif;
  color: var(--gold);
  font-size: 1.45rem;
  margin: 1.75rem 0 0.6rem;
  page-break-after: avoid;
}}
h3 {{
  font-family: "Cormorant Garamond", Georgia, serif;
  color: var(--accent);
  font-size: 1.15rem;
  margin: 1.25rem 0 0.45rem;
}}
p {{ margin: 0.65rem 0; }}
hr.gold {{
  border: none;
  border-top: 1px solid var(--gold);
  opacity: 0.45;
  margin: 2rem 0;
}}
blockquote {{
  margin: 1rem 0;
  padding: 0.85rem 1rem;
  background: var(--box);
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
  font-style: italic;
}}
ul, ol {{ padding-left: 1.25rem; }}
li {{ margin: 0.3rem 0; }}
.scarlett-table {{
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  background: var(--box);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  font-size: 0.92rem;
}}
.scarlett-table th {{
  background: rgba(216, 178, 110, 0.15);
  color: var(--gold);
  text-align: left;
  padding: 0.55rem 0.65rem;
}}
.scarlett-table td {{
  padding: 0.5rem 0.65rem;
  border-top: 1px solid var(--border);
  vertical-align: top;
}}
.diagram {{
  margin: 1.5rem 0;
  text-align: center;
}}
.diagram img {{
  max-width: 100%;
  border-radius: 10px;
  border: 1px solid var(--border);
}}
.cover {{
  page-break-after: always;
  text-align: center;
  padding: 3rem 1rem 2rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2rem;
}}
.cover .price {{
  color: var(--gold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 0.8rem;
}}
@media print {{
  body {{ background: var(--bg); -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  .book {{ max-width: none; padding: 0; }}
}}
</style>
</head>
<body>
<main class="book">
<header class="cover">
  <h1 style="margin-top:0">Método Scarlett</h1>
  <p>Crónica y guía testimonial (+18)</p>
</header>
{body}
</main>
</body>
</html>
"""


def export_docx(text: str) -> None:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        m = re.match(r"!\[(.*?)\]\((.*?)\)", line.strip())
        if m:
            rel = m.group(2).strip()
            # ../assets/foo.jpg relativo a capitulos/ → ASSETS/foo.jpg
            name = Path(rel).name
            img_path = ASSETS / name
            if img_path.exists():
                try:
                    doc.add_picture(str(img_path), width=Inches(5.5))
                except Exception:
                    doc.add_paragraph(f"[Imagen: {name}]")
            else:
                doc.add_paragraph(f"[Imagen pendiente: {name}]")
            continue
        if line.startswith("# "):
            doc.add_heading(line[2:].strip(), level=1)
            continue
        if line.startswith("## "):
            doc.add_heading(line[3:].strip(), level=2)
            continue
        if line.startswith("### "):
            doc.add_heading(line[4:].strip(), level=3)
            continue
        if line.startswith("#### "):
            doc.add_heading(line[5:].strip(), level=4)
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
        clean = re.sub(r"\*(.+?)\*", r"\1", clean).replace("`", "")
        doc.add_paragraph(clean)

    for name in (
        BUILD / "Metodo_Scarlett_Ebook_REVISION_2.docx",
        DL / "Metodo_Scarlett_Ebook_REVISION_2.docx",
    ):
        try:
            doc.save(str(name))
            print("DOCX", name, name.stat().st_size)
        except PermissionError:
            alt = name.with_name("Metodo_Scarlett_Ebook_FINAL.docx")
            doc.save(str(alt))
            print("DOCX bloqueado; copia", alt, alt.stat().st_size)


def main() -> None:
    text = merge_md()
    # Drop duplicate title block noise in body for HTML: keep full text
    body = md_to_html(text)
    html_path = BUILD / "Metodo_Scarlett_Ebook.html"
    html_path.write_text(HTML_SHELL.format(body=body), encoding="utf-8")
    dl_html = DL / "Metodo_Scarlett_Ebook.html"
    # En Descargas, reescribir ../assets/X → file URI absoluto
    body_dl = body

    def _asset_uri(m: re.Match[str]) -> str:
        fname = m.group(1)
        p = ASSETS / fname
        return f'src="{p.as_uri()}"' if p.exists() else m.group(0)

    body_dl = re.sub(r'src="\.\./assets/([^"]+)"', _asset_uri, body_dl)
    dl_html.write_text(HTML_SHELL.format(body=body_dl), encoding="utf-8")
    print("HTML", html_path)
    print("HTML", dl_html)
    (DL / "Metodo_Scarlett_Ebook_REVISION_2.md").write_text(text, encoding="utf-8")
    export_docx(text)


if __name__ == "__main__":
    main()
