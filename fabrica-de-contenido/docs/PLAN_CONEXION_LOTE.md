# Plan de conexión: Fábrica de Contenido ↔ BabelDesk (lotes de afiliado)

> **Estado:** Solo planeación — sin código de producción todavía.  
> **Audiencia:** Pablo (lenguaje simple).  
> **Última revisión del plan:** 2026-11-08.

---

## Resumen en una frase

La **Fábrica** prepara cada video (descarga, escudo, voz y subtítulos) **de uno en uno** desde tu tabla de links y lo deja en la **Inbox** de BabelDesk; **BabelDesk** lo publica en Facebook e Instagram con su cola y su horario, sin duplicar lo que ya hace cada app.

---

## 0. Decisión pendiente de Pablo (confirmar antes de programar)

| Tema | Recomendación del plan | Alternativa |
|------|------------------------|-------------|
| **¿Dónde vive BabelDesk “de verdad”?** | **`C:\Users\pablo\Downloads\BabelDesk`** — es lo que dice `babeldesk/docs/EMPEZAR_AQUI.md` y donde está el `.env`, la base `data/studio.sqlite` y la carpeta `Inbox/`. | Repo `metodo-scarlett/babeldesk/` = **respaldo en GitHub**, no la copia para publicar cada día. |
| **¿Sincronizar repo ↔ Descargas?** | No mezclar en la Fase A. Conectar solo a **Descargas\BabelDesk\Inbox**. | Más adelante, un script opcional “actualizar respaldo” si quieres. |

---

## 1. Auditoría corta: qué reutilizar y qué no

### Fábrica de Contenido — **SÍ reutilizar**

| Pieza | Para qué en el lote |
|--------|---------------------|
| `worker/renderer.py` + `copyright_shield.py` | Escudo visual + subtítulos `.ass` (texto al derecho). |
| `worker/voz.py` | Voz nueva (edge-tts por defecto; ElevenLabs si hay clave en `.env.local`). |
| `worker/consultas.py` + `automatizaciones.db` | Cola, estados, logs del Bot Guardián, anti-colisión de guiones. |
| `worker/autohealer.py` | Memoria 1.5 GB / 7–15 días, favoritos 📌. |
| Panel (7 secciones) | Ver progreso; más adelante sección **Lote**. |

### Fábrica — **NO duplicar en el lote**

- No volver a implementar publicación a Meta (eso es BabelDesk).
- No competir con el quitamarca/corte de BabelDesk en los mismos links “difíciles”.

### BabelDesk — **SÍ reutilizar**

| Pieza | Para qué |
|--------|----------|
| `Inbox/` + `inbox-watcher.ts` | Detecta videos nuevos solos y los mete en “Mis Videos”. |
| `inboxMediaFilter.ts` | Ignora `.part`, fragmentos yt-dlp, archivos muy pequeños. |
| `downloader.ts` + `watermarkRemover.ts` + `videoCutter.ts` | Links problemáticos (+18, marca de agua, corte) **fuera del lote automático** o en una fase manual. |
| `scheduler/worker.ts` + `post_targets` | Publicar 1–2 al día en FB Page + IG Reels con reintentos. |
| Cookies (`docs/YTDLP_COOKIES.md`) | Solo cuando el lote marque “necesita cookies” y falle la descarga simple. |

### BabelDesk — **NO tocar en el lote**

- TikTok API / assist manual (no es el canal principal del plan).
- Reescribir la UI de Electron.

### Descarga: ¿Fábrica o BabelDesk?

| Escenario | Quién descarga | Por qué |
|-----------|----------------|---------|
| Link público (TikTok/IG/YT/FB abiertos) | **Fábrica** (`worker/downloader.py`) | El lote ya vive ahí; un solo archivo por video; sin abrir BabelDesk para cada link. |
| Link privado / +18 / bloqueado por plataforma | **BabelDesk** (yt-dlp + cookies en `data/`) | La Fábrica hoy **no** tiene flujo de cookies ni quitamarca integrado. |
| Video ya descargado por Pablo | Ninguno — ruta local en la tabla | Entrar directo a “editando”. |

**Flujo híbrido recomendado:** el Encargado de Lote intenta primero descarga en Fábrica; si falla con error típico de auth/bloqueo, marca el link como `necesita_babeldesk` y Pablo lo resuelve una vez en BabelDesk (descarga → Inbox) y el lote solo **procesa** el `.mp4` local.

---

## 2. Fuente de los links (tabla de afiliado)

### Opciones comparadas

| Opción | Pros | Contras | Para Pablo |
|--------|------|---------|------------|
| **Excel/CSV en la PC** | Abres con Excel o Notepad++; sin internet; respaldo fácil | No se actualiza sola en el celular | **Recomendada para Fase A** |
| Google Sheet | Editas desde el celular | Necesita conexión y configurar API; más cosas que se rompen | Fase C opcional |
| Solo panel de la Fábrica | Todo en un lugar | Hay que construir formularios y pegar muchos links a mano | Complemento, no fuente única al inicio |
| Importar una vez a SQLite | Cola robusta, sin reprocesar | Pablo no ve la tabla “en Excel” sin pantalla nueva | **Recomendada tras importar CSV** |

### Recomendación

1. Pablo mantiene **`fabrica-de-contenido/lote/links_afiliado.csv`** (o `.xlsx` exportado a CSV).
2. Un botón **“Importar tabla”** (Fase A) copia filas nuevas a la tabla `lote_links` en SQLite.
3. El panel muestra estado; Excel sigue siendo la “libreta” si prefieres.

### Columnas mínimas (CSV)

| Columna | Obligatoria | Ejemplo |
|---------|-------------|---------|
| `link_video` | Sí | `https://vm.tiktok.com/...` |
| `canal` | Sí | `afiliado_libro` (o número 1–10) |
| `estado_externo` | No | Lo que ponga la empresa (`listo`, etc.) — solo referencia |
| `guion_texto` | No | Si vacío, usa plantilla del canal + gancho aleatorio seguro |
| `palabra_clave` | No | Para comentarios / CTA |
| `caption_redes` | No | Texto para FB/IG; si vacío, plantilla corta + enlace afiliado |
| `id_fila` | No | `1`, `2`… para no repetir al reimportar |

### Reglas de idempotencia

- Clave única en BD: **hash normalizado de `link_video`** (+ opcional `canal`).
- Estados finales `entregado` / `publicado` / `roto_definitivo` → **no reprocesar** salvo botón “forzar de nuevo”.
- Al importar: solo insertar filas cuya `id_fila` o `link_video` no existan.

---

## 3. Encargado de Lote (batch runner)

Nuevo módulo planeado: `worker/lote_runner.py` + tabla `lote_links` (o ampliar `videos` con `origen=lote_afiliado` — **decidir en implementación**; el plan prefiere tabla dedicada para no mezclar los 62 TikToks de mecánica).

### Máquina de estados (por fila)

```
pendiente → descargando → (opcional: esperando_archivo_local)
    → editando → control_calidad → listo_en_fabrica
    → entregando → entregado
    | en cualquier paso → reintento (máx 2)
    | agotados reintentos → roto (la fila sigue; pasa al siguiente)
```

### Reglas de operación

- **Un video a la vez** (como ya hace el render para no saturar RAM).
- Link roto: anotar en `bot_guardian_log` en español, estado `roto`, **continuar** con el siguiente.
- Progreso visible en `pipeline_estados` (misma idea que “Generar prueba”) y en logs.
- Reintentos: 2 con espera (p. ej. 5 min y 30 min) solo en `descargando` y `editando`.

### Dónde corre

- Proceso ligero dentro del worker FastAPI (`POST /api/lote/procesar-siguiente` o tarea en background).
- Opcional Windows: **Tarea programada** que llama a un endpoint local (Fase C).

---

## 4. Entrega a BabelDesk (contrato de carpeta)

**Carpeta destino (verdad operativa):**  
`C:\Users\pablo\Downloads\BabelDesk\Inbox\`

### Nombre de archivo (propuesta)

```
lote-{YYYYMMDD}-{id_corto}-{canal}.mp4
```

Evita caracteres raros; solo ASCII.

### Evitar archivo a medias

1. Escribir a `Inbox\lote-....mp4.tmp` (o `.part` con prefijo que **sí** filtre BabelDesk — mejor **`.tmp`** porque `inboxMediaFilter` ignora `.part` de yt-dlp, no necesariamente `.tmp`; revisar al implementar: si hace falta, usar subcarpeta `Inbox\_entrando\` y mover al final).
2. `fsync` / cerrar archivo.
3. **Renombrar** a `.mp4` final en la misma carpeta.
4. BabelDesk ya ignora fragmentos; el watcher indexa cuando el archivo es estable.

### Caption / texto para redes

**Opción recomendada (Fase B):** archivo gemelo  
`lote-....mp4.json` con:

```json
{
  "caption": "Texto para FB/IG...",
  "keyword": "PALABRA",
  "fuente": "fabrica-lote",
  "canal": "afiliado_libro"
}
```

Hoy BabelDesk indexa principalmente el video; **en Fase B** habrá que extender el watcher o un pequeño script en BabelDesk que lea el `.json` y prellene `caption_override` al crear el post — **esto es trabajo de Fase B**, no asumir que ya existe.

**Atajo Fase A:** caption fijo en plantilla dentro de BabelDesk al publicar manualmente los primeros 3–5.

---

## 5. Programación horaria

### Dos relojes distintos

| Reloj | Qué hace | Quién |
|-------|----------|--------|
| **Procesar** (noche o madrugada) | Baja N links de la tabla, edita y deja videos en Inbox | Fábrica (Encargado de Lote) |
| **Publicar** (día) | Saca 1–2 de la cola de BabelDesk a FB + IG | BabelDesk scheduler |

### Valores sugeridos por defecto (conservadores post–tarjeta amarilla)

| Ajuste | Valor inicial | Dónde guardarlo |
|--------|---------------|-----------------|
| Procesar lote | 02:00 AM, máximo **3 videos** por noche | `configuracion` en Fábrica |
| Publicar | 12:30 y 20:00 (como slots actuales), máximo **1 video/día** las primeras 2 semanas | BabelDesk `scheduled_at` |
| Separación mínima entre publicaciones | **8 horas** | BabelDesk + regla en planificador |

### Si la PC estuvo apagada

- **Fábrica:** al encender, el Bot Guardián muestra “Te perdiste el lote de anoche”; botón **“Poner al día ahora”** (procesa hasta el tope diario, no los 500 de golpe).
- **BabelDesk:** si no estaba abierto, **no publicó**; los videos siguen en Inbox/cola. Al abrir BabelDesk, el scheduler corre el siguiente tick pendiente (no publicar 10 de golpe — respetar tope diario).

### Qué debe estar abierto

| Momento | Fábrica (puerto 5001) | BabelDesk |
|---------|------------------------|-----------|
| Procesar de noche | Puede ser servicio en segundo plano o PC encendida | No obligatorio |
| Publicar de día | No obligatorio | **Sí — ventana abierta o app en segundo plano** |

---

## 5bis. Capa de verificación automática pre-entrega

Antes de que un video salga a BabelDesk (o quede en `output/` en Fase A), el **Encargado de Lote** ejecuta `worker/video_qc.py` y asigna un semáforo.

### Checklist

| Paso | Comprueba | Si falla |
|------|-----------|----------|
| 1 | Archivo existe y tamaño ≥ ~400 KB | 🔴 No entrega |
| 2 | Duración ≥ 10 s | 🔴 No entrega |
| 3 | Resolución ≥ 720×1280 (vertical) | 🔴 No entrega |
| 4 | Pista de audio presente | 🔴 No entrega |
| 5 | Inicio sin negro prolongado (`blackdetect`) | 🟡 Reintenta render con escudo distinto |
| 6 | **pHash** del frame en el s. 3 vs últimos 30 renders | 🟡 Reintenta render con escudo distinto |

### Semáforo

- **🟢 verde:** pasa a estado `listo` + `.json` gemelo (caption, gancho, miniatura).
- **🟡 amarillo:** hasta 2 reintentos con `parametros_escudo_aleatorio()` nuevo; si sigue amarillo, puede entregar con aviso en Bot Guardián.
- **🔴 rojo:** estado `roto`, se salta el link, la fila continúa, aviso por Telegram/panel.

### Dónde vive (implementado Fase A)

- QC: `worker/video_qc.py`
- Fingerprints: tabla SQLite `lote_render_fingerprints`
- Render con Capas 1–2: `worker/renderer.py` + `worker/lote_runner.py`
- Plantillas Capa 2: `lote/plantillas_libro_sabiduria.json`

---

## 6. Anti-repetición real (Meta / IG / FB)

El Escudo actual (espejo fijo + 0.8° + zoom 106%) **no basta** si 500 afiliados usan el mismo clip. Plan por capas:

| Capa | Qué cambia | ¿En Fábrica hoy? |
|------|------------|------------------|
| A | Audio original eliminado; voz + música al 5% | Sí |
| B | Subtítulos y gancho en pantalla **únicos** por video | Parcial (guiones rotativos) |
| C | Escudo con **rangos aleatorios seguros** por render | **A programar** |
| D | Corte 0.5–2 s inicio/fin (duración distinta) | **A programar** |
| E | Velocidad video 1.02–1.05; saturación/contraste ±3% | **A programar** |
| F | Orden de frases / sinónimos en plantilla de guion | Tabla + plantillas |
| G | Música de fondo de `assets/music_fallback/` rotatoria | Sí (fallback existe) |

### Rangos seguros propuestos (C + E)

- Rotación: 0.6°–1.0° (no 0°).
- Zoom crop: 104%–108%.
- `setpts`: 0.96–0.98 (velocidad +2% a +4%).
- Espejo: 70% de los videos `hflip`, 30% sin espejo pero con más zoom (para no ser patrón obvio).
- **Nunca** publicar dos renders con los mismos `frame1_text` + mismo hash de fondo el mismo día.

### Riesgo que queda

Meta puede seguir detectando similitud semántica o denuncias de afiliados masivos. El plan **reduce** colisiones; no garantiza cero advertencias. Tras tarjeta amarilla: **1 publicación/día**, contenido claramente distinto en voz y texto.

---

## 7. Ritmo seguro (configuración conservadora)

Guardar en `configuracion` (Fábrica) y reflejar en BabelDesk:

| Parámetro | Default post–amarilla | Después de 30 días sin incidentes |
|-----------|------------------------|-----------------------------------|
| `lote_max_procesar_por_dia` | 3 | 5 |
| `lote_max_publicar_por_dia` | 1 | 2 |
| `lote_min_horas_entre_publicaciones` | 8 | 6 |
| Pausa global | Botón **“Pausar lote”** en panel | — |

Si Instagram vuelve a advertir: bajar a 1 cada 48 h hasta que Pablo confirme.

---

## 8. Conectar cuentas (lo que Pablo hace a mano)

Cursor **no** guarda ni muestra tokens. Checklist basado en `babeldesk/docs/META_OAUTH_CHECKLIST.md`:

1. Tener **Página de Facebook** vinculada a **cuenta de Instagram profesional** (misma marca).
2. En [Meta for Developers](https://developers.facebook.com/), crear app (tipo Business) con permisos de página y publicación de Reels.
3. En BabelDesk (`C:\Users\pablo\Downloads\BabelDesk`), copiar `.env.example` → `.env` si falta.
4. Seguir el checklist: login OAuth, pegar tokens en `.env` (nunca en el repo).
5. Probar **un Reel de prueba** privado o borrador antes del lote.
6. Renovar tokens antes de 60 días (BabelDesk ya tiene lógica de reintento; Pablo revisa avisos).

TikTok: fuera del alcance automático del lote (solo assist manual en BabelDesk).

---

## 9. Panel — cambios en las 7 secciones

| Sección | Cambio planeado |
|---------|-----------------|
| 🏠 Inicio | Tarjeta “Lote afiliado: X pendientes, Y listos hoy”. |
| **🆕 Lote** (o subpestaña en Cola) | Tabla: link, estado, reintentos, botones **Importar CSV**, **Procesar siguiente**, **Procesar tanda (N)**, **Pausar**, abrir carpeta Inbox. |
| 📋 Cola | Separar “cola de publicación Fábrica” vs “entregados a BabelDesk”. |
| 🤖 Bot Guardián | Avisos: “BabelDesk no está abierto”, “Inbox lleno”, “3 links rotos hoy”. |
| ⚙️ Configuración | Rutas: carpeta BabelDesk Inbox, tope diario, hora de proceso nocturno. |

---

## 10. Riesgos y fallos

| Fallo | Comportamiento | Mensaje para Pablo |
|-------|----------------|-------------------|
| Link caído | Estado `roto`, siguiente link | “Este enlace ya no sirve, lo salté.” |
| Video privado / +18 | Marcar `necesita_babeldesk` | “Descárgalo una vez en BabelDesk con cookies y avísame.” |
| Disco lleno | Parar lote, semáforo rojo | “Tu disco está lleno; libera espacio o limpia memoria.” |
| BabelDesk cerrado a la hora de publicar | Video en Inbox, no publicado | “Abrí BabelDesk para que salga a redes.” |
| Token Meta vencido | BabelDesk error en cola | “Vuelve a conectar Facebook en BabelDesk (checklist).” |
| Mismo video duplicado en tabla | Ignorar en importación | “Ese link ya estaba en la lista.” |
| PC apagada de noche | No procesa | “Pon al día cuando enciendas la PC.” |

---

## 11. Fases y criterio de “terminado”

### Fase A — Tabla + lote de prueba (3–5 links)

**Entregables:** CSV ejemplo, importación a BD, procesar 3–5 links de punta a punta hasta `.mp4` en carpeta `output/` o Inbox manual.

**Terminado cuando:** Pablo ve 3 videos distintos (voz + subtítulo + escudo) y en el panel constan estados `listo` / `roto` sin trabarse la fila.

**No incluye:** publicación automática.

### Fase B — Entrega a BabelDesk + caption

**Entregables:** escritura segura a `Inbox\`, JSON de caption, prueba de indexación en “Mis Videos”, primer post manual programado en BabelDesk.

**Terminado cuando:** Un video del lote aparece en BabelDesk y se publica (o queda programado) en FB + IG con el texto correcto.

### Fase C — Horario automático + panel Lote

**Entregables:** tarea nocturna Fábrica, límites diarios, sección Lote en panel, documentación de 1 página “Uso diario afiliado”.

**Terminado cuando:** Durante 7 días, con la PC encendida según el plan, se procesan y publican hasta el tope configurado **sin intervención** más que revisar el semáforo.

**Estimación de esfuerzo (orden de magnitud, no fechas):** A = pequeña, B = media, C = media-grande.

---

## 12. Preguntas abiertas para Pablo (máximo 8)

1. ¿Confirmas que **`C:\Users\pablo\Downloads\BabelDesk`** es la única carpeta donde debe caer la Inbox para publicar?
2. ¿De dónde vienen los links hoy: **Excel de la empresa**, Google Sheet o lista en WhatsApp?
3. ¿Cuántos links quieres tener **activos** al mismo tiempo (20, 100, 500)?
4. ¿El texto de cada video es **siempre el mismo guion de afiliado** o varía por fila de la tabla?
5. ¿Publicar **solo Facebook + Instagram** o también YouTube más adelante?
6. Tras la tarjeta amarilla, ¿aceptas empezar con **1 video/día** durante 14 días?
7. ¿La PC puede quedar **encendida de madrugada** (02:00) o prefieres procesar solo cuando tú das clic?
8. ¿Tienes ya **enlace de afiliado** fijo para poner en el caption o va por fila en la tabla?

---

## Próximo paso (sin código)

Pablo + Antigravity revisan este plan → responden las 8 preguntas → entonces sí se programa **solo Fase A**.
