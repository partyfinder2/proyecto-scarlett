# 11 — DISEÑO VISUAL DEL PANEL: "FÁBRICA DE CONTENIDO" (7 SECCIONES DE CLAUDE + MEJORAS ANTIGRAVITY)
> **Fuente:** Propuesta visual de Claude aprobada para construir en Next.js / Tailwind por Cursor.  
> **Concepto:** Oscuro profesional, 100% en español sencillo, didáctico y con toda la operación visible de un vistazo.

---

## 🖥️ Estructura de las 7 Secciones Navegables del Panel

### 1. Barra Superior Fija (Status Bar)
- **Título:** `🏭 Fábrica de Contenido`
- **Píldoras de Estado en Vivo:**
  - `🟢 Worker activo (localhost:5001)`
  - `🟢 ElevenLabs OK`
  - `🔵 3 en cola`
- **Selector de Vista:** `Modo Simple (Principal)` / `Modo Avanzado`

---

### 2. Sección 1: 🏠 Inicio ("👋 Hola, aquí está tu fábrica")
Subtítulo dinámico: *"Hoy es sábado 7 de noviembre — 2 videos publicados, 3 en proceso"*

#### A) Las 4 Tarjetas de Resumen (KPIs):
1. **Videos publicados esta semana:** `47` *(↑ 12 más que la semana pasada)*
2. **Canales activos ahora mismo:** `8` *(de 10 disponibles)*
3. **Videos en cola para hoy:** `3` *(Próximo: 2:00 PM)*
4. **Costo de servidor este mes:** `$0` *(Todo corre en tu PC 🖥️)*

#### B) Rastreador en Vivo: `🔴 En Proceso Ahora — Canal: Mecánica de Motos`
Las 6 tarjetas/bolitas paso por paso en lenguaje humano:
- ✅ **Paso 1 — Leí tu guión:** *"Tomé el gancho y el copy del Canal 1, Slot: Almuerzo"* (`Listo hace 2 min`)
- ✅ **Paso 2 — Generé la voz:** *"ElevenLabs tardó 4 segundos · Voz asignada al canal"* (`Listo hace 1 min 40 seg`)
- 🎬 **Paso 3 — Estoy armando el video:** *"Juntando video de fondo + voz + subtítulos sincronizados + música suave"* (`En progreso · ~45 seg restantes`)
- 📤 **Paso 4 — Subiré el video:** *"Instagram Reels + YouTube Shorts + TikTok + Telegram"* (`Esperando...`)
- 💬 **Paso 5 — Responderé comentarios:** *"Auto-Responder activado · Respondo a quien diga VALVULA / TORQUE"* (`Esperando...`)
- ✍️ **Paso 6 — Anotaré el resultado:** *"Guardaré vistas y marcaré `veces_usado + 1` para no repetirlo igual"* (`Esperando...`)

#### C) 🤖 Log del Bot Guardián en Vivo (Auto-scroll cada 4 segundos):
```text
14:02:11 ✅ Worker Python iniciado en localhost:5001
14:02:12 ✅ Base de datos OK · 16 guiones semilla + 100 copys AIDA · 80 videos en caché
14:02:15 🔵 Canal 1 (Mecánica) — Slot almuerzo — Iniciando proceso
14:02:18 ✅ ElevenLabs OK · Voz generada · Palabras sincronizadas en .ASS
14:03:01 ⚡ FFmpeg renderizando — Usando preset fast · 1080x1920 + normalize=0
14:03:45 🔵 Video listo · Tamaño: 18.4 MB · Duración exacta: 47s
```

---

### 3. Sección 2: 📡 Mis 10 Canales (`MultiChannelHub`)
*"Activa o pausa cada canal con un click · Cada uno publica de forma independiente"*
- Cuadrícula de los **10 Canales** con:
  - Emoji + Nombre del Canal + Interruptor grande `ON / OFF`
  - Barra de progreso de cuántos videos/guiones le quedan en su banco
  - Botón rápido: **"⚡ Generar 10 Guiones Nuevos con IA para este Canal"** *(Mejora Antigravity para que Pablo no tenga que escribir guiones a mano si no quiere)*

---

### 4. Sección 3: 🎬 Crear Video Nuevo (Asistente en 4 Pasos + Botón Mágico IA)
*"Llena los campos (o dale al botón Autocompletar con IA) y yo me encargo de todo lo demás"*
- **1️⃣ ¿Para qué canal?:** Selector de Canal (1 al 10) + Horario (`Almuerzo 1:00 PM` / `Noche 8:30 PM` / `Publicar Ahora Mismo`).
- **2️⃣ El gancho — lo primero que ven (0 a 3 segundos):**
  - *Texto en pantalla grande* (ej: `"NO ES EL CARBURADOR"`)
  - *Lo que dice la voz en esos 3 segundos*
- **3️⃣ El cuerpo del video:**
  - *El copy completo* (lo que dice la voz durante todo el video)
  - *Palabra clave para comentarios (en MAYÚSCULAS, sin acentos)*
  - *Frase de cierre + Regalo que enviará el Bot*
- **4️⃣ El video de fondo:**
  - Opción A: Pega un link de TikTok (lo descarga sin marca de agua)
  - Opción B: Arrastra un video crudo `.mp4` de tu computadora
  - Opción C: Buscar automáticamente en Pexels HD según el nicho
  - Selector de música de fondo y control deslizante de volumen (`5%` recomendado).

---

### 5. Sección 4: 📋 Cola de Publicación
*"Todos los videos programados para hoy y mañana"*
- Tabla visual con columnas: `Canal` | `Gancho` | `Hora (Slot)` | `Plataformas` | `Estado` | `Acciones (▶️ Ver / 🚀 Publicar ya / 🗑️ Quitar)`

---

### 6. Sección 5: ✍️ Banco de Guiones
*"Todos tus guiones guardados · El bot rota por `veces_usado` para no repetir el mismo dos días seguidos"*
- Filtros rápidos: `Todos` | `Activos` | `Pausados` | `Por Canal`
- Tabla con: `Hook ID (H1-H5)` | `Gancho en pantalla` | `Nicho/Canal` | `Keyword CTA` | `Veces usado` | `Estado`

---

### 7. Sección 6: 🤖 Bot Guardián (`AutoHealBot` 24/7)
*"Trabaja 24/7 en segundo plano · Te avisa solo cuando algo necesita tu atención"*
- **3 Indicadores Grandes de Salud + Controles Prácticos de Memoria:**
  1. `✅ Todo OK` — Estado general del sistema
  2. `🔑 42 días` — Token Instagram vence en (`↑ Renovará solo 7 días antes`)
  3. `🗂️ 450 MB usados (Límite seguro: 1.5 GB)` — Barra de memoria con selector rápido (`Guardar historial por: [ 7 días | 15 días ]`) + Botón **`🧹 Limpiar Memoria Ahora`**
- **📋 Regla de Almacenamiento Inteligente (Práctico + Seguro para tu PC):**
  - **Borrar basura intermedia al instante, pero conservar el video terminado:** Los pedazos sueltos de trabajo (el audio `.mp3` suelto y el subtítulo `.ass`) se borran apenas sale el video, pero **el video final terminado sí se guarda en tu historial** para que lo puedas ver o descargar cuando quieras.
  - **Rotación Automática Suave (7 o 15 días / Tope 1.5 GB):** Los videos publicados se conservan durante **7 o 15 días** (tú eliges con un selector). Pasado ese tiempo, el Bot Guardián va borrando poco a poco los más viejos para que nunca pases de `1.5 GB`.
  - **Botón "📌 Fijar / Favorito":** En la lista de videos, cada video tiene un icono de candadito `📌`. Si un video te gustó mucho y no quieres que se borre a los 15 días, le pones `📌` y el Bot nunca lo toca.
  - **Botón Manual "🧹 Limpiar Memoria Ahora":** Un botón directo en la pestaña del Bot Guardián que, al darle clic, libera el espacio de todos los videos ya publicados (excepto tus favoritos `📌`) en 1 segundo.
- **📋 Últimas acciones del Bot:**
  - `13:00:00 ✅ Health check diario OK · Worker activo · DB responde en 2ms`
  - `12:58:33 ✅ 2 comentarios respondidos en Canal 1 — keyword detectada`
  - `08:00:01 ⚡ yt-dlp actualizado automáticamente — sin bloqueos de TikTok`
  - `06:00:00 ✅ Token Meta renovado automáticamente · Vence en 60 días`

---

### 8. Sección 7: ⚙️ Configuración ("Solo la tocas una vez")
- **🔑 Claves de API (se guardan en `.env.local` local, nunca salen de tu PC):**
  - `ElevenLabs API Key` + `ElevenLabs Voice ID`
  - `Pexels API Key (videos de fondo gratis)`
  - `Telegram Bot Token` + `Telegram Chat ID (para recibir tus videos en el celular)`
- **📱 Redes Sociales Conectadas:**
  - 📸 **Instagram:** `Conectado (Token activo)`
  - ▶️ **YouTube:** `Conectado (Token activo)`
  - 📘 **Facebook:** `Conectado`
  - 🎵 **TikTok / Telegram:** `Envío directo a tu Telegram o API`

