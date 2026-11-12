# PROMPT PARA CURSOR — Conectar BabelDesk + Fábrica de Contenido (modo PLANEAR, no programar)

Responde siempre en español. Pablo no es técnico: explica en lenguaje simple.

## Regla de esta tarea
**SOLO PLANEA.** No escribas código de producción todavía. Entrega un plan que Pablo y Antigravity revisarán. Si algo no está definido en el repo, **pregunta antes de elegir** (no inventes valores).
Nunca hagas `git push`, nunca imprimas ni escribas secretos (tokens, API keys): léelos siempre de `.env` / `.env.local` en tiempo de ejecución.

## Contexto
Pablo vende un libro como afiliado (*El Libro de la Sabiduría*). La empresa pone los videos a disposición de todos los afiliados, así que cientos de afiliados suben el mismo clip y Meta penaliza el contenido repetido (Instagram le dio una tarjeta amarilla; su cuenta está bien). Necesita publicar **1 o 2 videos al día** en Facebook e Instagram (ya tiene las cuentas; falta conectarlas), con cada video modificado para que no sea idéntico a los demás.

## Las dos apps que YA existen (no reescribir, conectar)
1. **BabelDesk** — Electron + TypeScript, local en Windows. Ruta del repo: `metodo-scarlett/babeldesk` (los docs mencionan también `C:\Users\pablo\Downloads\BabelDesk`: **confirma cuál es la real y única fuente de verdad**).
   - Descarga links con yt-dlp (`src/connectors/downloader.ts`), TikTok/IG/YouTube/FB/X.
   - Quita marca de agua (`watermarkRemover.ts`), corta videos (`videoCutter.ts`).
   - Vigila la carpeta `Inbox/` (`src/main/inbox-watcher.ts`, chokidar) y la indexa sola.
   - Cola y publicación en Facebook Page e Instagram Reels por API (`instagram.ts`, `metaPageReels.ts`), con reintentos 1/5/15 min. TikTok y grupos de FB son solo "assist" (el usuario da el clic final).
2. **Fábrica de Contenido** — Python/FastAPI + SQLite + FFmpeg, puerto `5001`. Ruta: `metodo-scarlett/fabrica-de-contenido` (antes `automatizaciones`).
   - `worker/renderer.py` + `worker/copyright_shield.py`: Escudo visual (hflip, rotación 0.8°, zoom 106%, eq de color, velocidad +3%, quita audio original, `-map_metadata -1`), subtítulos .ass **después** del escudo para que el texto no se espeje.
   - `worker/voz.py` (ElevenLabs con respaldo edge-tts), `worker/downloader.py`, `worker/autohealer.py` (limpieza 7/15 días, tope 1.5 GB, favoritos 📌 no se borran), panel de 7 secciones en `panel/`.
   - BD: `data/automatizaciones.db` (tablas `canales`, `videos`, `guiones`, `cola_publicacion`, `pipeline_estados`, `bot_guardian_log`, `configuracion`).

## Lo que falta (lo que debes planear)
Nadie hoy lee la tabla de links, recorre los videos uno por uno, entrega el resultado a BabelDesk ni lo dispara a horario fijo.

### Flujo objetivo
```
Tabla de links de afiliado (Excel/CSV/Google Sheet)
        │  (Pablo solo agrega filas)
        ▼
Fábrica: "Encargado de Lote" (batch runner)
   descarga → (quitamarca/corte si aplica) → Escudo → voz nueva + subtítulos propios
        │
        ▼
Entrega a BabelDesk (carpeta Inbox/ o llamada directa — evaluar)
        ▼
BabelDesk: cola → Facebook Page + Instagram Reels, 1–2 por día
```

## Qué necesito en tu plan (secciones obligatorias)
1. **Auditoría corta**: qué reutilizas de cada app y qué NO. Evita duplicar el downloader: decide si el lote usa el yt-dlp de la Fábrica o el de BabelDesk (con su manejo de cookies `docs/YTDLP_COOKIES.md` y su quitamarca) y justifica.
2. **Fuente de los links**: compara Excel/CSV local vs. Google Sheet vs. importar a la BD y administrar desde el panel. Recomienda la más simple para un usuario no técnico. Columnas mínimas propuestas: `link_video`, `texto/guion` (opcional), `palabra_clave_comentario` (opcional), `canal`, `estado`. Debe ser idempotente (no reprocesar un link ya hecho) y detectar duplicados.
3. **Encargado de Lote**: máquina de estados por link (`pendiente → descargando → editando → listo → entregado | roto`), procesa **de uno en uno**, un link roto no frena la fila, reintentos limitados, todo reportado en `pipeline_estados` y `bot_guardian_log` en español claro.
4. **Entrega a BabelDesk**: define el contrato (carpeta compartida `Inbox/`, nombre de archivo, metadatos/caption). Cómo se evita que BabelDesk indexe un archivo a medias (escribir como `.tmp` y renombrar al final). Cómo se pasa el texto/caption.
5. **Programación horaria**: cómo se dispara solo (hora fija, p. ej. procesar de noche por tandas de N videos; publicar 1–2 al día a horas que Pablo elija). Qué pasa si la PC estaba apagada. Qué debe estar abierto (BabelDesk debe estar encendido para publicar).
6. **Anti-repetición real (lo más importante para Meta)**: además del Escudo visual actual, propón variaciones por video (voz nueva, texto en pantalla propio, corte de inicio/fin, variación aleatoria de parámetros del escudo dentro de rangos seguros, música propia). El audio original siempre se elimina. Indica el riesgo que queda.
7. **Ritmo seguro**: tope diario configurable, separación mínima entre publicaciones, tandas pequeñas. Tras la tarjeta amarilla, recomienda un límite conservador por defecto.
8. **Conectar cuentas**: lista paso a paso de lo que Pablo debe hacer a mano para tener FB Page + IG Pro listos en BabelDesk (tokens Graph, `docs/META_OAUTH_CHECKLIST.md`). Tú no manejas ni muestras los tokens.
9. **Panel**: qué se agrega a las 7 secciones (p. ej. pestaña/sección "Lote": pendientes, listos, rotos, botón "procesar ahora", botón "pausar").
10. **Riesgos y casos de falla**: link caído, video privado/+18 (cookies), disco lleno, BabelDesk apagado, token vencido, TikTok sin API de publicación.
11. **Fases y estimación**: Fase A (importar tabla + lote de prueba con 3–5 links) → Fase B (entrega a BabelDesk) → Fase C (horario automático + panel). Cada fase con criterio de "terminado" verificable.
12. **Preguntas abiertas para Pablo** (máximo 8, concretas).

## Restricciones
- Todo local, costo $0 de servidores. Voz gratis (edge-tts) por defecto; ElevenLabs solo si hay clave en `.env.local`.
- Windows 10/11, Python 3.14, Node 24, FFmpeg en PATH.
- No romper lo que ya funciona (panel, escudo, Bot Guardián).
- El contenido de afiliado es autorizado por la empresa; el objetivo es no ser marcado como contenido repetido, no suplantar a nadie.
- Entrega el plan como un archivo `docs/PLAN_CONEXION_LOTE.md` dentro de `fabrica-de-contenido/` y un resumen de 10 líneas en el chat.
