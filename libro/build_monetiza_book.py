import os
import re
from markdown_it import MarkdownIt

md_path = r"c:\Users\pablo\Downloads\VENUZ-Complete-App\metodo-scarlett\manuscrito-v2\MONETIZA_SIN_ROSTRO_VOZ_SCARLETT.md"
with open(md_path, "r", encoding="utf-8") as f:
    raw_md = f.read()

md = MarkdownIt("commonmark", {"breaks": True, "html": True})
body_html = md.render(raw_md)

css = """
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  --bg-primary: #110d17;
  --bg-card: #1b1524;
  --bg-quote: #231b2f;
  --text-main: #f3f0f7;
  --text-muted: #b5a9c4;
  --accent-gold: #e8c37d;
  --accent-rose: #f472b6;
  --accent-soft: #a78bfa;
  --border-card: rgba(232, 195, 125, 0.22);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-main);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.8;
  font-size: 17px;
  -webkit-font-smoothing: antialiased;
}

.reader-container {
  max-width: 820px;
  margin: 0 auto;
  padding: 40px 24px 100px;
}

.book-hero {
  text-align: center;
  padding: 60px 20px 40px;
  background: radial-gradient(circle at 50% 30%, rgba(244, 114, 182, 0.15), transparent 70%);
  border-bottom: 1px solid var(--border-card);
  margin-bottom: 50px;
  border-radius: 20px;
}

.book-badge {
  display: inline-block;
  padding: 6px 16px;
  background: rgba(232, 195, 125, 0.12);
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 20px;
}

h1 {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 46px;
  color: #fff;
  line-height: 1.2;
  margin-bottom: 14px;
  font-weight: 700;
}

.book-subtitle {
  font-size: 20px;
  color: var(--accent-rose);
  font-weight: 400;
  margin-bottom: 16px;
  line-height: 1.4;
}

.book-author {
  color: var(--text-muted);
  font-size: 15px;
  letter-spacing: 0.5px;
}

/* Headings */
h1:not(.book-hero h1) {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 34px;
  color: var(--accent-gold);
  margin-top: 60px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(232, 195, 125, 0.2);
  letter-spacing: 0.5px;
}

h2 {
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 26px;
  color: #fff;
  margin-top: 10px;
  margin-bottom: 24px;
  font-weight: 600;
}

h3 {
  font-size: 20px;
  color: var(--accent-rose);
  margin-top: 32px;
  margin-bottom: 16px;
  font-weight: 600;
}

h4 {
  font-size: 17px;
  color: var(--accent-soft);
  margin-top: 24px;
  margin-bottom: 12px;
  font-weight: 600;
}

p {
  margin-bottom: 20px;
  color: #e2dce8;
  font-size: 17px;
}

strong {
  color: #ffffff;
  font-weight: 600;
}

em {
  color: var(--accent-gold);
  font-style: italic;
}

hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(232, 195, 125, 0.35), transparent);
  margin: 50px 0;
}

/* Lists */
ul, ol {
  margin-left: 24px;
  margin-bottom: 24px;
}

li {
  margin-bottom: 10px;
  color: #dfd8e8;
}

/* Code & Pre */
pre {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-left: 4px solid var(--accent-gold);
  padding: 18px 22px;
  border-radius: 12px;
  overflow-x: auto;
  font-family: Consolas, Monaco, "Courier New", monospace;
  font-size: 14.5px;
  color: #fce7f3;
  margin: 24px 0;
  line-height: 1.6;
}

code {
  background: rgba(244, 114, 182, 0.12);
  color: var(--accent-rose);
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 15px;
  font-family: Consolas, Monaco, monospace;
}

pre code {
  background: transparent;
  padding: 0;
  color: inherit;
}

/* Blockquotes / Highlights */
blockquote {
  background: var(--bg-quote);
  border-left: 4px solid var(--accent-rose);
  padding: 18px 22px;
  margin: 24px 0;
  border-radius: 0 12px 12px 0;
  font-style: italic;
  color: #f3e8ff;
}

/* Table of contents styling */
ul:first-of-type {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  padding: 24px 28px 24px 44px;
  border-radius: 14px;
  list-style-type: none;
  margin-left: 0;
}

ul:first-of-type li {
  margin-bottom: 12px;
  font-size: 15.5px;
}

ul:first-of-type li strong {
  color: var(--accent-gold);
}

.floating-nav {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: rgba(27, 21, 36, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
  padding: 10px 18px;
  border-radius: 999px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 100;
}
.floating-nav:hover {
  background: var(--accent-gold);
  color: #110d17;
}

@media (max-width: 600px) {
  h1 { font-size: 32px; }
  h1:not(.book-hero h1) { font-size: 26px; }
  h2 { font-size: 21px; }
  .reader-container { padding: 20px 16px 80px; }
}
"""

html_full = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monetiza Sin Rostro · Por Scarlett</title>
  <style>{css}</style>
</head>
<body>
  <div class="reader-container">
    <div class="book-hero">
      <div class="book-badge">Guía Exclusiva 2026</div>
      <h1>Monetiza Sin Rostro</h1>
      <div class="book-subtitle">Tu guía secreta para ganar en dólares desde casa sin mostrar el rostro</div>
      <div class="book-author">De mujer a mujer · Escrito por Scarlett</div>
    </div>
    
    <div class="book-content">
      {body_html}
    </div>
  </div>
  
  <a href="#" class="floating-nav">⬆ Volver Arriba</a>
</body>
</html>
"""

local_html = r"c:\Users\pablo\Downloads\VENUZ-Complete-App\metodo-scarlett\MONETIZA_SIN_ROSTRO.html"
with open(local_html, "w", encoding="utf-8") as f:
    f.write(html_full)

print("SUCCESS: Built MONETIZA_SIN_ROSTRO.html locally.")

