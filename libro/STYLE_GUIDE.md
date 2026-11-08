# Guía de estilo visual — Método Scarlett

Para HTML, Marp o PDF final. Inspirada en el diagrama de flujo.

## Colores oficiales

| Token | Hex | Uso |
|-------|-----|-----|
| Fondo principal (Dark Luxury) | `#120E16` | Fondo de página |
| Acento primario (Rosa) | `#E87099` | Títulos destacados, flechas, cajas clave |
| Acento secundario (Oro) | `#D8B26E` | Subtítulos, iconos, marcos, viñetas importantes |
| Texto general | `#EAE4EC` | Cuerpo (blanco perla) |
| Cajas / tablas | `#1E1624` | Fondos de callouts y tablas |
| Borde cajas | `#E87099` @ 30% opacity | Contorno sutil |

## Tipografía

- **Títulos (H1–H3):** serif elegante — Cinzel, Playfair Display o Cormorant Garamond.
- **Cuerpo:** sans limpia — Montserrat, Plus Jakarta Sans (evitar Inter si quieres menos “genérico AI”).

## CSS de referencia (HTML/PDF)

```css
:root {
  --bg: #120E16;
  --accent: #E87099;
  --gold: #D8B26E;
  --text: #EAE4EC;
  --box: #1E1624;
  --border: color-mix(in srgb, #E87099 30%, transparent);
  --font-display: "Cormorant Garamond", "Playfair Display", Georgia, serif;
  --font-body: "Plus Jakarta Sans", "Montserrat", system-ui, sans-serif;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  line-height: 1.55;
}
h1, h2, h3 {
  font-family: var(--font-display);
  color: var(--accent);
  letter-spacing: 0.02em;
}
h2 { color: var(--gold); }
.callout, table {
  background: var(--box);
  border: 1px solid var(--border);
  border-radius: 8px;
}
```

## Reglas de maquetación

- Una sola infografía de flujo (Cap. 1, mapa de dinero). No repetir al inicio.
- Márgenes generosos; no saturar las primeras páginas.
- Tablas de precios con acento oro en encabezados.
