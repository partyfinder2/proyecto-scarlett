# BabelDesk — Tanda 2026-09-29

Carpeta: `C:\Users\pablo\Downloads\BabelDesk\`  
NO uses: `venuz-social-studio-src`  
Commit base: `1bffd0f`

App local. Copy EN, tono playa Vallarta / Banderas Bay.  
IA solo por OpenRouter. Una clave, modelo leído de config.

## Ajustes previos (no implementar mal)

| Punto | Problema | Arreglo |
|-------|----------|---------|
| Límite TikTok | 150 era título viejo; plantilla con 10 hashtags siempre se pasa | TikTok caption **2200**. Aviso suave, no bloquear encolar. "Recortar" solo si el usuario lo pide |
| Hashtags | 10 fijos en TikTok parece spam | Siempre `#PuertoVallarta` `#BanderasBay`. Rotar 3 del resto |
| Links | Page/grupos a veces sí quieren link | Sin link solo en TikTok e Instagram. Page/grupos: link opcional |
| Modelos | Slugs fijos pueden no existir | Dropdown sugerencias + campo libre. La verdad es el slug guardado |
| API key | No escribir `.env` desde UI ni commitear | `data/config.json` en `.gitignore`. En pantalla, enmascarada / "guardada" |

El resto (orden 1→4, screenshot tras tarea 1, no VPN, no clipper, no exe, skip C→TikTok sin tumbar el resto) está bien.

> **Actualización v0.2.0 (post-tandas 12–13):** el módulo de **descarga local de videos** con **`yt-dlp`** está implementado como función **opcional** en el tab **Mis Videos** (`src/connectors/downloader.ts`). Sigue siendo app local (sin dominio); no sustituye arrastrar archivos a `Inbox/`. Plantilla UI de referencia: `src/ui/inbox.html`.

---

## TAREA 1 — Ajustes OpenRouter

Nueva sección **"Ajustes"**.

1. **API key:** input password, Guardar, Probar conexión.  
   Persistir en `data/config.json` (gitignore). Nunca `.env` desde la UI.  
   No mostrar la clave otra vez; solo "guardada" / "vacía".  
   No loguear la clave.
2. **Probar** = `POST https://openrouter.ai/api/v1/chat/completions`  
   modelo elegido, prompt `"Reply OK"`, timeout 15s. Mostrar OK o el error de la API.
3. **Dropdown sugerido** (no es contrato):
   - `google/gemini-2.0-flash` (default)
   - `openai/gpt-4o-mini`
   - `anthropic/claude-3.5-haiku`
   - campo libre "otro slug"  
   Si el slug falla en Probar, avisar. **No hardcodear** el modelo en el copy engine.

**Tests:** leer/escribir config sin filtrar la key; modelo default si no hay config.

---

## TAREA 2 — Plantilla "PV Tourist EN"

`data/templates.json` (sí se puede commitear; no lleva secretos).

- Nombre: PV Tourist EN  
- Idioma: en  
- Tono: playa, casual, sin slang vulgar, sin dating.

Estructura:

```
{hook}
{description}
Puerto Vallarta & Banderas Bay
{cta}
{hashtags}
```

Hashtags **SIEMPRE:** `#PuertoVallarta` `#BanderasBay`  
Rotar 3 de: `#Vallarta` `#VisitVallarta` `#MexicoTravel` `#BeachLife` `#VallartaMexico` `#JaliscoCosta` `#TravelMexico` `#PVLife`

OpenRouter rellena hook (1 línea), description (2–3), cta (1, tipo "Save this for your next trip").  
**No links** en caption de TikTok ni Instagram.  
No citas, precios ni "book now" en nivel A. No "as seen on".

Composer: botón "Usar plantilla PV Tourist EN" pide 3 variantes JSON.

---

## TAREA 3 — Preview + 3 tarjetas

Límites de **aviso** (no bloquean encolar):

- TikTok **2200**
- Instagram **2200**
- Facebook Page **5000** (aviso práctico; techo API ~63206)
- Grupos FB **5000**

Si se pasa: "sobran N en TikTok". Botón opcional **"Recortar"** (no cortar palabras).  
3 tarjetas: Usar esta. Editable antes de encolar.

---

## TAREA 4 — Nivel C + TikTok

Solo si el usuario marcó nivel C (no adivinar por palabras).  
TikTok = **SKIP**. Aviso: "TikTok omitido: nivel C no va a esta cuenta."  
El resto de destinos sí se encola.

---

## NO

VPN, clipper, login Gemini/Grok aparte, exe, drag de cola, pausa global.

*(La tanda original listaba «downloader» aquí; en v0.2.0 quedó el downloader **local opcional** con yt-dlp en Mis Videos — ver nota al inicio.)*

---

## Orden

1 → 2 → 3 → 4  
`npm test` verde antes de seguir.  
Commit por tarea.  
Parar tras la tarea 1 y esperar captura.

---

## Estado implementación (2026-09-29)

| Tarea | Estado |
|-------|--------|
| 1 OpenRouter Ajustes | ✅ `8335355` |
| 2 PV Tourist EN | ✅ `data/templates.json` + `copy:pvTourist` |
| 3 Preview aviso 2200/5000 + Recortar | ✅ no bloquea encolar |
| 4 Nivel C → skip TikTok | ✅ al encolar y en scheduler |
